/**
 * @fileoverview Tests for AzureAPIClient error handling scenarios.
 * Validates proper handling of network failures, authentication errors,
 * API errors, and various error response types.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { MESSAGES, TRANSCRIPTION_TIMEOUT_MS } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

// Mock Settings
const mockSettings = {
    getModelConfig: vi.fn()
};

// Mock fetch
global.fetch = vi.fn();

// Mock FormData
global.FormData = vi.fn(() => ({
    append: vi.fn()
}));

// Mock URL constructor
global.URL = vi.fn((url) => {
    if (!url.startsWith('http')) {
        throw new Error('Invalid URL');
    }
    return { href: url };
});

vi.mock('../js/audio-converter.js', () => ({
    convertToWav: vi.fn(async (blob) => new Blob([blob], { type: 'audio/wav' }))
}));

vi.mock('../js/logger.js', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        }))
    }
}));

// Import the API client after mocking
let AzureAPIClient;
beforeAll(async () => {
    ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('AzureAPIClient Error Handling', () => {
    let apiClient;
    let eventBusEmitSpy;
    
    beforeEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
        
        // Setup default mock settings
        mockSettings.getModelConfig.mockReturnValue({
            model: 'whisper',
            apiKey: 'test-api-key',
            uri: 'https://test-api.azure.com'
        });
        
        // Create API client instance
        apiClient = new AzureAPIClient(mockSettings);
        vi.spyOn(apiClient, '_sleep').mockResolvedValue();
        
        // Spy on eventBus emissions
        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
        
        // Mock successful fetch response by default
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: {
                get: vi.fn().mockReturnValue('application/json')
            },
            json: vi.fn().mockResolvedValue({ text: 'Test transcription' })
        });
    });
    
    afterEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
    });

    describe('Configuration Validation Errors', () => {
        it('should throw error when API key is missing during transcription', async () => {
            // Setup missing API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Attempt to transcribe without API key
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.API_KEY_REQUIRED);
            
            // transcribe() now uses validateConfig() which emits API_CONFIG_MISSING events
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'apiKey',
                    model: 'whisper'
                })
            );
        });
        
        it('should throw error when URI is missing during transcription', async () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: ''
            });
            
            // Attempt to transcribe without URI
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.URI_REQUIRED);
            
            // transcribe() now uses validateConfig() which emits API_CONFIG_MISSING events
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'uri',
                    model: 'whisper'
                })
            );
        });

        it('should reject API keys unsafe for fetch headers before making a request', async () => {
            const unsupportedCharacter = '\u2014';
            mockSettings.getModelConfig.mockReturnValue({
                model: 'mai-transcribe',
                apiKey: `speech${unsupportedCharacter}key`,
                uri: 'https://test-api.azure.com'
            });

            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.INVALID_API_KEY_CHARACTERS);

            expect(global.fetch).not.toHaveBeenCalled();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'validApiKey',
                    model: 'mai-transcribe'
                })
            );
        });
        
        it('should emit event when validateConfig is called with missing API key', () => {
            // Setup missing API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Call validateConfig directly
            expect(() => apiClient.validateConfig()).toThrow();
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'apiKey',
                    model: 'whisper'
                })
            );
        });
        
        it('should emit event when validateConfig is called with missing URI', () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: ''
            });
            
            // Call validateConfig directly
            expect(() => apiClient.validateConfig()).toThrow();
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'uri',
                    model: 'whisper'
                })
            );
        });
        
        it('should emit event when validateConfig is called with invalid URI format', () => {
            // Setup invalid URI format
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'invalid-uri'
            });
            
            // Call validateConfig directly
            expect(() => apiClient.validateConfig()).toThrow();
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'validUri',
                    model: 'whisper'
                })
            );
        });
    });
    
    describe('Network Failure Handling', () => {
        it('should handle network failures gracefully', async () => {
            // Simulate network failure
            global.fetch.mockRejectedValue(new Error('Network error'));
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('Network error');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'Network error'
                })
            );
        });
        
        it('should handle timeout errors', async () => {
            // Simulate timeout
            const timeoutError = new Error('Request timed out');
            global.fetch.mockRejectedValue(timeoutError);
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('Request timed out');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'Request timed out'
                })
            );
        });
        
        it('should handle connection aborted errors', async () => {
            // Simulate aborted request
            const abortError = new Error('The user aborted a request');
            global.fetch.mockRejectedValue(abortError);
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('The user aborted a request');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'The user aborted a request'
                })
            );
        });
    });
    
    describe('API Authentication Errors', () => {
        it('should handle invalid API key errors (401)', async () => {
            // Mock unauthorized response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('Invalid API key')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 401');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 401,
                    details: 'Invalid API key'
                })
            );
        });
        
        it('should handle subscription key errors (403)', async () => {
            // Mock forbidden response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 403,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('Subscription key is invalid')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 403');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 403,
                    details: 'Subscription key is invalid'
                })
            );
        });
    });
    
    describe('API Rate Limiting Handling', () => {
        it('should handle rate limiting errors (429)', async () => {
            // Mock too many requests response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 429,
                headers: {
                    get: vi.fn().mockReturnValue(null)
                },
                text: vi.fn().mockResolvedValue('Too many requests')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(
                'API rate limit reached (429). Please wait a moment and try again.'
            );
            expect(global.fetch).toHaveBeenCalledTimes(6);
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 429,
                    details: 'Too many requests'
                })
            );
        });
    });
    
    describe('Invalid Audio Format Errors', () => {
        it('should handle invalid audio format errors (400)', async () => {
            // Mock bad request response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('Invalid audio format')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 400');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 400,
                    details: 'Invalid audio format'
                })
            );
        });
        
        it('should handle empty audio file errors', async () => {
            // Mock bad request response for empty file
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('Empty audio file')
            });
            
            // Attempt to transcribe with empty blob
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 400');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 400,
                    details: 'Empty audio file'
                })
            );
        });
    });
    
    describe('Server Error Handling', () => {
        it('should handle server errors (500)', async () => {
            // Mock server error response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                headers: {
                    get: vi.fn().mockReturnValue(null)
                },
                text: vi.fn().mockResolvedValue('Internal server error')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 500');
            expect(global.fetch).toHaveBeenCalledTimes(6);
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 500,
                    details: 'Internal server error'
                })
            );
        });
        
        it('should handle service unavailable errors (503)', async () => {
            // Mock service unavailable response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 503,
                headers: {
                    get: vi.fn().mockReturnValue(null)
                },
                text: vi.fn().mockResolvedValue('Service unavailable')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 503');
            expect(global.fetch).toHaveBeenCalledTimes(6);
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 503,
                    details: 'Service unavailable'
                })
            );
        });
    });
    
    describe('Malformed Response Handling', () => {
        it('should handle invalid JSON responses', async () => {
            // Mock JSON parsing error
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: vi.fn().mockReturnValue('application/json')
                },
                json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('Unexpected token');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'Unexpected token'
                })
            );
        });
        
        it('should handle unrecognized response format', async () => {
            // Mock unrecognized response format
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: vi.fn().mockReturnValue('application/json')
                },
                json: vi.fn().mockResolvedValue({ unexpected: 'format' })
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: MESSAGES.UNKNOWN_API_RESPONSE
                })
            );
        });
        
        it('should handle empty responses', async () => {
            // Mock empty response
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: vi.fn().mockReturnValue('text/plain')
                },
                text: vi.fn().mockResolvedValue('')
            });
            
            // Attempt to transcribe
            const result = await apiClient.transcribe(new Blob());
            
            // Should return empty string (trimmed)
            expect(result).toBe('');
            
            // Should still emit API_REQUEST_SUCCESS
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_SUCCESS,
                expect.objectContaining({
                    model: 'whisper',
                    transcriptionLength: 0
                })
            );
        });
    });
    
    describe('Progress Callback', () => {
        it('should call onProgress callback with status messages', async () => {
            // Setup mock progress callback
            const onProgress = vi.fn();
            
            // Perform transcription
            await apiClient.transcribe(new Blob(), onProgress);
            
            // Should call onProgress with appropriate message
            expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_WHISPER);
        });
        
        it('should not fail if onProgress is not provided', async () => {
            // Perform transcription without progress callback
            await apiClient.transcribe(new Blob());
            
            // Should complete without errors
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_SUCCESS,
                expect.any(Object)
            );
        });
    });

    describe('Error Event Deduplication (Issue 1 regression guard)', () => {
        it('should emit API_REQUEST_ERROR exactly once per failed request', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 422,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('{"error":{"message":"Unsupported format"}}')
            });

            await expect(apiClient.transcribe(new Blob())).rejects.toThrow();

            const errorEmits = eventBusEmitSpy.mock.calls.filter(
                ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
            );
            expect(errorEmits).toHaveLength(1);
        });

        it('should include API context in the single error emission', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                headers: {
                    get: vi.fn().mockReturnValue(null)
                },
                text: vi.fn().mockResolvedValue('Server error')
            });

            await expect(apiClient.transcribe(new Blob())).rejects.toThrow();
            expect(global.fetch).toHaveBeenCalledTimes(6);

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 500,
                    details: 'Server error'
                })
            );
        });
    });

    describe('Request Timeout Handling (AbortController)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        /**
         * Returns a fetch mock that mirrors real fetch's abort behavior: the
         * returned promise never resolves on its own and only rejects with an
         * AbortError once the per-attempt AbortController fires controller.abort().
         */
        function makeHangingFetch() {
            return vi.fn((_uri, options) => new Promise((_resolve, reject) => {
                const signal = options?.signal;
                if (!signal) {
                    return;
                }
                const abortError = new Error('The operation was aborted');
                abortError.name = 'AbortError';
                if (signal.aborted) {
                    reject(abortError);
                    return;
                }
                signal.addEventListener('abort', () => reject(abortError), { once: true });
            }));
        }

        function rejectOnAbort(signal) {
            return new Promise((_resolve, reject) => {
                const abortError = new Error('The operation was aborted');
                abortError.name = 'AbortError';
                if (signal.aborted) {
                    reject(abortError);
                    return;
                }
                signal.addEventListener('abort', () => reject(abortError), { once: true });
            });
        }

        /**
         * Drives all retry attempts to completion: each attempt arms a fresh
         * TRANSCRIPTION_TIMEOUT_MS timer, and _sleep is stubbed to resolve
         * instantly, so advancing past the timeout cascades through every retry.
         */
        async function flushAllTimeoutAttempts() {
            // 5 retries + 1 initial attempt; advance generously to cascade through all.
            for (let i = 0; i < 8; i++) {
                await vi.advanceTimersByTimeAsync(TRANSCRIPTION_TIMEOUT_MS);
            }
        }

        it('should abort a hung request after TRANSCRIPTION_TIMEOUT_MS and surface a friendly timeout error', async () => {
            global.fetch = makeHangingFetch();

            const settled = apiClient.transcribe(new Blob());
            // Prevent an unhandled rejection while we drive the fake timers.
            const assertion = expect(settled).rejects.toThrow(MESSAGES.REQUEST_TIMED_OUT);

            await flushAllTimeoutAttempts();
            await assertion;

            // Aborts the initial attempt plus all retries (6 total), never hanging.
            expect(global.fetch).toHaveBeenCalledTimes(6);
            // Each fetch attempt received an AbortController signal.
            expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

            // Caller-facing error event carries the friendly message, not a raw 'AbortError'.
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: MESSAGES.REQUEST_TIMED_OUT
                })
            );
        });

        it('should keep the abort timer active while reading the response body', async () => {
            const jsonReads = [];
            global.fetch = vi.fn(async (_uri, options) => {
                const json = vi.fn(() => rejectOnAbort(options.signal));
                jsonReads.push(json);
                return {
                    ok: true,
                    status: 200,
                    headers: { get: vi.fn().mockReturnValue('application/json') },
                    json
                };
            });

            const settled = apiClient.transcribe(new Blob());
            const assertion = expect(settled).rejects.toThrow(MESSAGES.REQUEST_TIMED_OUT);

            await flushAllTimeoutAttempts();
            await assertion;

            expect(global.fetch).toHaveBeenCalledTimes(6);
            expect(jsonReads).toHaveLength(6);
            expect(jsonReads[0]).toHaveBeenCalledTimes(1);
        });

        it('should not abort a request that resolves before the timeout', async () => {
            global.fetch = vi.fn(async () => ({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('application/json') },
                json: vi.fn().mockResolvedValue({ text: 'Fast transcription' })
            }));

            const result = await apiClient.transcribe(new Blob());

            expect(result).toBe('Fast transcription');
            expect(global.fetch).toHaveBeenCalledTimes(1);
            // A signal is still supplied so the timer can guard the attempt.
            expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        });
    });
});
