/**
 * @fileoverview Azure Speech Services API client for audio transcription.
 * Handles communication with Azure Whisper and GPT-4o APIs for speech-to-text conversion.
 * 
 * @module AzureAPIClient
 * @requires EventBus
 * @requires Constants
 * @since 1.0.0
 */

import { API_PARAMS, DEFAULT_LANGUAGE, DEFAULT_FILENAME, MESSAGES } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * Azure Speech Services API client for transcribing audio to text.
 * Supports both Azure Whisper and GPT-4o models with different configuration requirements.
 * 
 * @class AzureAPIClient
 * @fires APP_EVENTS.API_REQUEST_START
 * @fires APP_EVENTS.API_REQUEST_SUCCESS
 * @fires APP_EVENTS.API_REQUEST_ERROR
 * 
 * @example
 * const apiClient = new AzureAPIClient(settings);
 * 
 * try {
 *   const result = await apiClient.transcribe(audioBlob, (status) => {
 *     logger.debug('Transcription status:', status);
 *   });
 *   logger.info('Transcription completed:', result.text);
 * } catch (error) {
 *   logger.error('Transcription failed:', error.message);
 * }
 */
export class AzureAPIClient {
    /**
     * Creates a new AzureAPIClient instance.
     * 
     * @param {Settings} settings - Settings manager instance for API configuration
     */
    constructor(settings) {
        this.settings = settings;
    }
    
    /**
     * Transcribes audio blob to text using configured Azure Speech Service.
     * Supports both Whisper and GPT-4o models with automatic model-specific formatting.
     * 
     * @async
     * @method transcribe
     * @param {Blob} audioBlob - Audio data to transcribe (WebM format recommended)
     * @param {Function} [onProgress] - Optional progress callback for status updates
     * @returns {Promise<Object>} Promise resolving to transcription result
     * @returns {Object} result - Transcription result object
     * @returns {string} result.text - Transcribed text content
     * @returns {string} result.model - Model used for transcription
     * @throws {Error} When API configuration is missing or invalid
     * @throws {Error} When API request fails or returns error status
     * @fires APP_EVENTS.API_REQUEST_START
     * @fires APP_EVENTS.API_REQUEST_SUCCESS
     * @fires APP_EVENTS.API_REQUEST_ERROR
     * 
     * @example
     * // Basic transcription
     * const result = await apiClient.transcribe(audioBlob);
     * logger.info('Transcription result:', result.text);
     * 
     * @example
     * // With progress tracking
     * const result = await apiClient.transcribe(audioBlob, (status) => {
     *   updateUIStatus(status);
     * });
     */
    async transcribe(audioBlob, onProgress) {
        const config = this.settings.getModelConfig();
        
        if (!config.apiKey || !config.uri) {
            throw new Error(MESSAGES.CONFIGURE_SETTINGS_FIRST);
        }
        
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, DEFAULT_FILENAME);
        if (config.model !== 'whisper-translate') {
            formData.append(API_PARAMS.LANGUAGE, DEFAULT_LANGUAGE);
        }
        
        // Add response_format for GPT-4o to avoid truncation
        if (config.model === 'gpt-4o-transcribe') {
            formData.append(API_PARAMS.RESPONSE_FORMAT, 'json');
            formData.append(API_PARAMS.TEMPERATURE, '0');
        }
        
        try {
            const statusMessage = config.model === 'whisper' ? 
                MESSAGES.SENDING_TO_WHISPER : 
                MESSAGES.SENDING_TO_GPT4O;
                
            if (onProgress) {
                onProgress(statusMessage);
            }
            
            eventBus.emit(APP_EVENTS.API_REQUEST_START, {
                model: config.model,
                message: statusMessage
            });
            
            const response = await fetch(config.uri, {
                method: 'POST',
                headers: { [API_PARAMS.API_KEY_HEADER]: config.apiKey },
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                const apiLogger = logger.child('AzureAPIClient');
                apiLogger.error('API Error Details:', errorText);
                const error = new Error(`API responded with status: ${response.status}`);
                
                eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                    status: response.status,
                    error: error.message,
                    details: errorText
                });
                
                throw error;
            }
            
            const contentType = response.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await response.json()
                : await response.text();
            const transcription = this.parseResponse(data, config.model);
            
            eventBus.emit(APP_EVENTS.API_REQUEST_SUCCESS, {
                model: config.model,
                transcriptionLength: transcription.length
            });
            
            return transcription;
            
        } catch (error) {
            const apiLogger = logger.child('AzureAPIClient');
            apiLogger.error('Error sending to Azure API:', error);
            
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                error: error.message
            });
            
            throw error;
        }
    }
    
    /**
     * Parses API response data based on the model type and response format.
     * Handles both text and JSON responses from different Azure Speech Service models.
     * 
     * @method parseResponse
     * @param {string|Object} data - Raw response data from API
     * @param {string} model - Model identifier for format-specific parsing
     * @returns {string} Parsed transcription text
     * @throws {Error} When response format is unrecognized
     * 
     * @example
     * // Text response
     * const text = apiClient.parseResponse("Hello world", "whisper");
     * 
     * @example  
     * // JSON response with segments
     * const text = apiClient.parseResponse({
     *   segments: [{ text: "Hello" }, { text: "world" }]
     * }, "gpt-4o-transcribe");
     */
    parseResponse(data, model) {
        // Text response
        if (typeof data === 'string') {
            return data.trim();
        }

        // Handle different JSON formats
        if (model === 'gpt-4o-transcribe' && data.segments) {
            // GPT-4o JSON format - merge all segments
            return data.segments.map(seg => seg.text).join(' ');
        } else if (data.text) {
            // Whisper or simple text response
            return data.text;
        }

        throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
    }
    
    /**
     * Validates API configuration before attempting transcription.
     * Checks for required API keys, URIs, and validates URI format.
     * 
     * @method validateConfig
     * @returns {Object} Validated configuration object
     * @returns {string} config.apiKey - API authentication key
     * @returns {string} config.uri - API endpoint URI
     * @returns {string} config.model - Model identifier
     * @throws {Error} When API key is missing
     * @throws {Error} When URI is missing or invalid format
     * @fires APP_EVENTS.API_CONFIG_MISSING
     * 
     * @example
     * try {
     *   const config = apiClient.validateConfig();
     *   logger.info('Configuration is valid:', config);
     * } catch (error) {
     *   logger.error('Configuration invalid:', error.message);
     * }
     */
    validateConfig() {
        const config = this.settings.getModelConfig();
        
        if (!config.apiKey) {
            const error = new Error(`${config.model} ${MESSAGES.API_KEY_REQUIRED}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'apiKey', model: config.model });
            throw error;
        }
        
        if (!config.uri) {
            const error = new Error(`${config.model} ${MESSAGES.URI_REQUIRED}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'uri', model: config.model });
            throw error;
        }
        
        // Basic URI validation
        try {
            new URL(config.uri);
        } catch (e) {
            const error = new Error(`${MESSAGES.INVALID_URI_FORMAT} for ${config.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri', model: config.model });
            throw error;
        }
        
        return config;
    }
}
