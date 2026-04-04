/**
 * @fileoverview Azure Speech Services API client for audio transcription.
 */

import { API_PARAMS, DEFAULT_LANGUAGE, DEFAULT_FILENAME, DEFAULT_WAV_FILENAME, MESSAGES, MODEL_TYPES, HTTP_METHODS, CONTENT_TYPES } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';
import { errorHandler } from './error-handler.js';
import { convertToWav } from './audio-converter.js';

/**
 * Azure Speech Services API client for transcribing audio to text.
 * Supports Azure Whisper and MAI-Transcribe models.
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
        const config = this.validateConfig();
        const isMaiTranscribe = config.model === MODEL_TYPES.MAI_TRANSCRIBE;

        try {
            const formData = new FormData();
            let headers;
            let statusMessage;

            if (isMaiTranscribe) {
                if (onProgress) {
                    onProgress(MESSAGES.CONVERTING_AUDIO);
                }
                // MAI-Transcribe requires WAV format (rejects WebM/Opus)
                const wavBlob = await convertToWav(audioBlob);
                formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
                formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({
                    enhancedMode: {
                        enabled: true,
                        model: MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL,
                        task: 'transcribe'
                    }
                }));
                headers = { [API_PARAMS.MAI_API_KEY_HEADER]: config.apiKey };
                statusMessage = MESSAGES.SENDING_TO_MAI_TRANSCRIBE;
            } else {
                formData.append(API_PARAMS.FILE, audioBlob, DEFAULT_FILENAME);
                if (config.model !== MODEL_TYPES.WHISPER_TRANSLATE) {
                    formData.append(API_PARAMS.LANGUAGE, DEFAULT_LANGUAGE);
                }
                headers = { [API_PARAMS.API_KEY_HEADER]: config.apiKey };
                statusMessage = MESSAGES.SENDING_TO_WHISPER;
            }
            if (onProgress) {
                onProgress(statusMessage);
            }

            eventBus.emit(APP_EVENTS.API_REQUEST_START, {
                model: config.model,
                message: statusMessage
            });

            const response = await fetch(config.uri, {
                method: HTTP_METHODS.POST,
                headers,
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.child('AzureAPIClient').error('API Error Details:', errorText);
                const detail = this._extractErrorDetail(errorText);
                const message = detail
                    ? `API error ${response.status}: ${detail}`
                    : `API responded with status: ${response.status}`;
                const error = new Error(message);
                error.apiContext = { status: response.status, details: errorText };
                throw error;
            }

            const contentType = response.headers.get(CONTENT_TYPES.CONTENT_TYPE_HEADER) || '';
            const data = contentType.includes(CONTENT_TYPES.APPLICATION_JSON)
                ? await response.json()
                : await response.text();
            const transcription = this.parseResponse(data);

            eventBus.emit(APP_EVENTS.API_REQUEST_SUCCESS, {
                model: config.model,
                transcriptionLength: transcription.length
            });

            return transcription;

        } catch (error) {
            this._handleApiError(error, error.apiContext);
            throw error;
        }
    }
    
    /**
     * Handles API errors by logging and emitting standardized events.
     * Consolidates error handling logic to ensure consistent error processing.
     * 
     * @private
     * @method _handleApiError
     * @param {Error} error - The error object to handle
     * @param {Object} [context={}] - Additional error context
     * @param {number} [context.status] - HTTP status code for API response errors
     * @param {string} [context.details] - Additional error details from API response
     */
    _handleApiError(error, context = {}) {
        // Log error with standardized context
        const errorContext = { module: 'AzureAPIClient', ...context };
        errorHandler.handleError(error, errorContext);
        
        // Emit standardized API_REQUEST_ERROR event
        const errorPayload = { error: error.message };
        if (context.status !== undefined) {
            errorPayload.status = context.status;
        }
        if (context.details !== undefined) {
            errorPayload.details = context.details;
        }
        
        eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, errorPayload);
    }

    /**
     * Extracts a human-readable error message from an API error response body.
     *
     * @private
     * @param {string} errorText - Raw error response body
     * @returns {string|null} Extracted message or null if unparseable
     */
    _extractErrorDetail(errorText) {
        try {
            const parsed = JSON.parse(errorText);
            return parsed?.error?.innerError?.message || parsed?.error?.message || parsed?.message || null;
        } catch {
            return null;
        }
    }

    /**
     * Parses API response data from text or JSON format.
     *
     * @method parseResponse
     * @param {string|Object} data - Raw response data from API
     * @returns {string} Parsed transcription text
     * @throws {Error} When response format is unrecognized
     */
    parseResponse(data) {
        // Text response
        if (typeof data === 'string') {
            return data.trim();
        }

        // MAI-Transcribe response format
        if (data.combinedPhrases && data.combinedPhrases.length > 0) {
            return data.combinedPhrases.map(p => p.text).join(' ');
        }

        // Whisper JSON response
        if (data.text) {
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
