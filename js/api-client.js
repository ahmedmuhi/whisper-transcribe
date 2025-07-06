/**
 * @fileoverview Azure Speech Services API client for audio transcription.
 */

import { API_PARAMS, DEFAULT_LANGUAGE, DEFAULT_FILENAME, MESSAGES } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';
import { errorHandler } from './error-handler.js';

/**
 * Azure Speech Services API client for transcribing audio to text.
 * Supports both Azure Whisper and GPT-4o models.
 * 
 * @class AzureAPIClient
 * @fires APP_EVENTS.API_REQUEST_START
 * @fires APP_EVENTS.API_REQUEST_SUCCESS
 * @fires APP_EVENTS.API_REQUEST_ERROR
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
     * 
     * @async
     * @param {Blob} audioBlob - Audio data to transcribe
     * @param {Function} [onProgress] - Progress callback for status updates
     * @returns {Promise<Object>} Transcription result with text and model properties
     * @throws {Error} When API configuration is missing or request fails
     * @fires APP_EVENTS.API_REQUEST_START
     * @fires APP_EVENTS.API_REQUEST_SUCCESS
     * @fires APP_EVENTS.API_REQUEST_ERROR
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
                // Standardized error handling
                errorHandler.handleError(error, { module: 'AzureAPIClient', status: response.status, details: errorText });
                // Emit API_REQUEST_ERROR for consumer handling/tests
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
            // Log and emit standardized error event
            errorHandler.handleError(error, { module: 'AzureAPIClient' });
            // Emit API_REQUEST_ERROR for consumer handling/tests
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
     * Validates the API client configuration for required keys, URI, and model settings.
     * 
     * @method validateConfig
     * @returns {{ apiKey: string, uri: string, model: string }} Validated configuration object
     * @throws {Error} When API key or URI is missing or invalid
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
        } catch {
            const error = new Error(`${MESSAGES.INVALID_URI_FORMAT} for ${config.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri', model: config.model });
            throw error;
        }
        
        return config;
    }
}
