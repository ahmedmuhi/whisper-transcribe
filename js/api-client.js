/**
 * @fileoverview Azure Speech Services API client for audio transcription.
 */

import { API_KEY_VALUE_PATTERN, MESSAGES, HTTP_METHODS, CONTENT_TYPES, TRANSCRIPTION_TIMEOUT_MS } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';
import { errorHandler } from './error-handler.js';
import { modelAdapterRegistry } from './model-adapters/index.js';

const MAX_TRANSCRIPTION_RETRIES = 5;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRY_BACKOFF_SCHEDULE_MS = [2000, 4000, 8000, 16000, 32000];
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Azure Speech Services API client for transcribing audio to text.
 * Supports registered transcription model adapters.
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
     * @param {Map<string, Object>} [adapterRegistry=modelAdapterRegistry] - Model adapter registry
     */
    constructor(settings, adapterRegistry = modelAdapterRegistry) {
        this.settings = settings;
        this.adapterRegistry = adapterRegistry;
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
        const adapter = this._getModelAdapter(config.model);

        try {
            const { headers, body, statusMessage } = await adapter.buildRequest(audioBlob, config, onProgress);
            if (onProgress) {
                onProgress(statusMessage);
            }

            eventBus.emit(APP_EVENTS.API_REQUEST_START, {
                model: config.model,
                message: statusMessage
            });

            const data = await this._fetchWithRetry(config.uri, {
                method: HTTP_METHODS.POST,
                headers,
                body
            }, onProgress, async (response) => {
                if (!response.ok) {
                    throw await this._createApiError(response);
                }
                return this._readResponseData(response);
            });
            const transcription = adapter.parseResponse(data);

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
     * Reads the response body in the format advertised by the server.
     *
     * @private
     * @param {Response} response - Successful API response
     * @returns {Promise<string|Object>} Parsed JSON or plain text body
     */
    async _readResponseData(response) {
        const contentType = response.headers.get(CONTENT_TYPES.CONTENT_TYPE_HEADER) || '';
        return contentType.includes(CONTENT_TYPES.APPLICATION_JSON)
            ? response.json()
            : response.text();
    }

    async _fetchWithRetry(uri, options, onProgress, handleResponse) {
        for (let attempt = 0; attempt <= MAX_TRANSCRIPTION_RETRIES; attempt++) {
            let response;

            try {
                const attemptResult = await this._fetchWithTimeout(async (signal) => {
                    response = await fetch(uri, { ...options, signal });

                    if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_TRANSCRIPTION_RETRIES) {
                        return {
                            shouldRetry: false,
                            value: await handleResponse(response)
                        };
                    }

                    // Consume the error body to release the connection before retrying.
                    await this._consumeRetryBody(response);
                    return { shouldRetry: true };
                });

                if (!attemptResult.shouldRetry) {
                    return attemptResult.value;
                }
            } catch (error) {
                // Only a per-attempt timeout (AbortError) is retryable here; anything
                // else propagates. On the final attempt, surface a friendly timeout
                // error so the caller routes the FSM to ERROR (never stuck PROCESSING).
                if (error?.name !== 'AbortError') {
                    throw error;
                }
                if (attempt === MAX_TRANSCRIPTION_RETRIES) {
                    throw this._createTimeoutError();
                }
                const timeoutSec = Math.ceil(TRANSCRIPTION_TIMEOUT_MS / 1000);
                await this._retryAfter(this._getRetryDelayMs(null, attempt), attempt, {
                    log: `Transcription request timed out after ${timeoutSec}s.`,
                    progress: 'Request timed out.'
                }, onProgress);
                continue;
            }

            await this._retryAfter(this._getRetryDelayMs(response, attempt), attempt, {
                log: `Transient API response ${response.status}.`,
                progress: `Azure returned ${response.status}.`
            }, onProgress);
        }
    }

    /**
     * Performs one full request attempt guarded by a per-attempt timeout. The
     * caller's operation is responsible for fetching and consuming the body while
     * the same AbortController is still armed.
     *
     * @private
     * @param {Function} operation - Attempt operation that receives an abort signal
     * @returns {Promise<*>} Operation result
     * @throws {Error} AbortError on timeout, or the underlying fetch error
     */
    async _fetchWithTimeout(operation) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);

        try {
            return await operation(controller.signal);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Drains a retryable error response body. Body stream aborts must propagate so
     * the timeout path can retry/fail normally; other body-drain failures are not
     * more important than the retryable status code already received.
     *
     * @private
     * @param {Response} response - Retryable API response
     * @returns {Promise<void>}
     */
    async _consumeRetryBody(response) {
        try {
            await response.text();
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw error;
            }
        }
    }

    /**
     * Shared retry tail: warn-log the reason, emit a user-facing "Retrying in Ns"
     * progress message, and sleep for the backoff delay. Keeps the retry-progress
     * contract in one place for both the timeout and transient-status paths.
     *
     * @private
     * @param {number} delayMs - Backoff delay before the next attempt
     * @param {number} attempt - Zero-based attempt index
     * @param {{log: string, progress: string}} reason - Reason prefixes for the log + progress lines
     * @param {Function} [onProgress] - Optional progress callback
     * @returns {Promise<void>}
     */
    async _retryAfter(delayMs, attempt, reason, onProgress) {
        const waitSec = Math.ceil(delayMs / 1000);
        logger.child('AzureAPIClient').warn(
            `${reason.log} Retrying in ${waitSec}s.`,
            { attempt: attempt + 1, maxRetries: MAX_TRANSCRIPTION_RETRIES }
        );
        if (onProgress) {
            onProgress(`${reason.progress} Retrying in ${waitSec}s (${attempt + 1}/${MAX_TRANSCRIPTION_RETRIES})...`);
        }
        await this._sleep(delayMs);
    }

    /**
     * Builds a friendly timeout error so callers never see a raw 'AbortError'.
     * The thrown error carries apiContext so the standard error handler treats it
     * like any other API failure.
     *
     * @private
     * @returns {Error} Timeout error with a user-facing message
     */
    _createTimeoutError() {
        const error = new Error(MESSAGES.REQUEST_TIMED_OUT);
        error.name = 'TimeoutError';
        error.apiContext = { timeout: true };
        return error;
    }

    async _createApiError(response) {
        const errorText = await response.text();
        const retryAfterSeconds = this._parseRetryAfterSeconds(response.headers?.get?.('Retry-After'));
        logger.child('AzureAPIClient').error('API Error Details:', errorText);

        const detail = this._extractErrorDetail(errorText);
        let message;

        if (response.status === 429) {
            message = retryAfterSeconds !== null
                ? `API rate limit reached (429). Retry after ${retryAfterSeconds}s.`
                : 'API rate limit reached (429). Please wait a moment and try again.';

            if (detail) {
                message = `${message} ${detail}`;
            }
        } else {
            message = detail
                ? `API error ${response.status}: ${detail}`
                : `API responded with status: ${response.status}`;
        }

        const error = new Error(message);
        error.apiContext = {
            status: response.status,
            details: errorText,
            retryAfter: retryAfterSeconds
        };
        return error;
    }

    _getRetryDelayMs(response, attempt) {
        const retryAfterSeconds = this._parseRetryAfterSeconds(response?.headers?.get?.('Retry-After'));

        if (retryAfterSeconds !== null) {
            return Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
        }

        return RETRY_BACKOFF_SCHEDULE_MS[Math.min(attempt, RETRY_BACKOFF_SCHEDULE_MS.length - 1)];
    }

    _parseRetryAfterSeconds(retryAfterHeader) {
        if (!retryAfterHeader) {
            return null;
        }

        const numericValue = Number.parseFloat(retryAfterHeader);
        if (Number.isFinite(numericValue) && numericValue >= 0) {
            return Math.ceil(numericValue);
        }

        const retryAtMs = Date.parse(retryAfterHeader);
        if (Number.isNaN(retryAtMs)) {
            return null;
        }

        return Math.max(0, Math.ceil((retryAtMs - Date.now()) / 1000));
    }

    _sleep(delayMs) {
        return new Promise(resolve => setTimeout(resolve, delayMs));
    }

    _getModelAdapter(model) {
        const adapter = this.adapterRegistry.get(model);

        if (!adapter) {
            throw new Error(`Unsupported transcription model: ${model}`);
        }

        return adapter;
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
        // Public helper keeps the legacy cross-shape parser behavior; transcribe() stays active-adapter strict.
        for (const adapter of this.adapterRegistry.values()) {
            try {
                return adapter.parseResponse(data);
            } catch {
                // Keep trying registered parsers to preserve legacy shape-sniffing.
            }
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
        const normalizedConfig = {
            ...config,
            apiKey: typeof config.apiKey === 'string'
                ? config.apiKey.replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
                : config.apiKey,
            uri: typeof config.uri === 'string'
                ? config.uri.replace(/\s+/g, '')
                : config.uri
        };
        
        if (!normalizedConfig.apiKey) {
            const error = new Error(`${normalizedConfig.model} ${MESSAGES.API_KEY_REQUIRED}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'apiKey', model: normalizedConfig.model });
            throw error;
        }

        if (!API_KEY_VALUE_PATTERN.test(normalizedConfig.apiKey)) {
            const error = new Error(MESSAGES.INVALID_API_KEY_CHARACTERS);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validApiKey', model: normalizedConfig.model });
            throw error;
        }
        
        if (!normalizedConfig.uri) {
            const error = new Error(`${normalizedConfig.model} ${MESSAGES.URI_REQUIRED}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'uri', model: normalizedConfig.model });
            throw error;
        }
        
        // Basic URI validation
        let parsedUri;
        try {
            parsedUri = new URL(normalizedConfig.uri);
        } catch {
            const error = new Error(`${MESSAGES.INVALID_URI_FORMAT} for ${normalizedConfig.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri', model: normalizedConfig.model });
            throw error;
        }

        if (parsedUri.protocol !== 'https:') {
            const error = new Error(`${MESSAGES.URI_MUST_BE_HTTPS} for ${normalizedConfig.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'httpsUri', model: normalizedConfig.model });
            throw error;
        }

        return normalizedConfig;
    }
}
