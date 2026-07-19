/**
 * @fileoverview Tests for AzureAPIClient error handling scenarios.
 * Validates proper handling of network failures, authentication errors,
 * API errors, and various error response types.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { API_ERROR_CODES, MESSAGES, TRANSCRIPTION_TIMEOUT_MS } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

// Mock Settings
const mockSettings = {
    getModelConfig: vi.fn()
};
const mockTokenProvider = {
    getToken: vi.fn()
};
const FAKE_TOKEN = 'fake-error-test-bearer-token';

const loggerSpies = vi.hoisted(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
}));

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
    return { href: url, protocol: url.startsWith('https') ? 'https:' : 'http:' };
});

vi.mock('../js/audio-converter.js', () => ({
    convertToWav: vi.fn(async (blob) => new Blob([blob], { type: 'audio/wav' }))
}));

vi.mock('../js/logger.js', () => ({
    logger: {
        ...loggerSpies,
        child: vi.fn(() => loggerSpies)
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
            uri: 'https://target.invalid/transcribe'
        });
        mockTokenProvider.getToken.mockResolvedValue(FAKE_TOKEN);
        
        // Create API client instance
        apiClient = new AzureAPIClient(mockSettings, mockTokenProvider);
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
        it('accepts a configuration containing only a model and Target URI', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                uri: 'https://target.invalid/transcribe'
            });

            await expect(apiClient.transcribe(new Blob())).resolves.toBe('Test transcription');

            expect(mockTokenProvider.getToken).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
        
        it('should throw error when URI is missing during transcription', async () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
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
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should reject a malformed Target URI before requesting a token', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: 'mai-transcribe-1.5',
                uri: 'not-a-target-uri'
            });

            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.INVALID_URI_FORMAT);

            expect(mockTokenProvider.getToken).not.toHaveBeenCalled();
            expect(global.fetch).not.toHaveBeenCalled();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'validUri',
                    model: 'mai-transcribe-1.5'
                })
            );
        });
        
        it('should not send the request over an insecure (http) URI', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                uri: 'http://target.invalid/transcribe'
            });

            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.URI_MUST_BE_HTTPS);

            expect(mockTokenProvider.getToken).not.toHaveBeenCalled();
            expect(global.fetch).not.toHaveBeenCalled();
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
    
    describe('Authentication and authorization errors', () => {
        it('categorizes 401 safely without reading or retrying the response body', async () => {
            const responseText = vi.fn().mockResolvedValue('fake-sensitive-authentication-response');
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: responseText
            });

            const error = await apiClient.transcribe(new Blob()).catch(value => value);

            expect(error).toMatchObject({
                code: API_ERROR_CODES.AUTHENTICATION_REQUIRED,
                status: 401
            });
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(apiClient._sleep).not.toHaveBeenCalled();
            expect(responseText).not.toHaveBeenCalled();
            const errorEvent = eventBusEmitSpy.mock.calls.find(
                ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
            );
            expect(errorEvent).toEqual([APP_EVENTS.API_REQUEST_ERROR, {
                error: MESSAGES.AUTHENTICATION_REQUIRED,
                status: 401,
                code: API_ERROR_CODES.AUTHENTICATION_REQUIRED,
                model: 'whisper'
            }]);
            expect(JSON.stringify(eventBusEmitSpy.mock.calls)).not.toContain('fake-sensitive');
            expect(JSON.stringify(loggerSpies)).not.toContain('fake-sensitive');
            expect(JSON.stringify(error)).not.toContain('fake-sensitive');
            expect(JSON.stringify(error)).not.toContain(FAKE_TOKEN);
        });

        it('categorizes 403 safely without reading or retrying the response body', async () => {
            const responseText = vi.fn().mockResolvedValue('fake-sensitive-authorization-response');
            global.fetch.mockResolvedValue({
                ok: false,
                status: 403,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: responseText
            });

            const error = await apiClient.transcribe(new Blob()).catch(value => value);

            expect(error).toMatchObject({
                code: API_ERROR_CODES.AZURE_AUTHORIZATION_DENIED,
                status: 403
            });
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(apiClient._sleep).not.toHaveBeenCalled();
            expect(responseText).not.toHaveBeenCalled();
            const errorEvent = eventBusEmitSpy.mock.calls.find(
                ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
            );
            expect(errorEvent).toEqual([APP_EVENTS.API_REQUEST_ERROR, {
                error: MESSAGES.AZURE_AUTHORIZATION_DENIED,
                status: 403,
                code: API_ERROR_CODES.AZURE_AUTHORIZATION_DENIED,
                model: 'whisper'
            }]);
            expect(JSON.stringify(eventBusEmitSpy.mock.calls)).not.toContain('fake-sensitive');
            expect(JSON.stringify(loggerSpies)).not.toContain('fake-sensitive');
            expect(JSON.stringify(error)).not.toContain('fake-sensitive');
            expect(JSON.stringify(error)).not.toContain(FAKE_TOKEN);
        });
    });
    
    describe('Retry status behavior', () => {
        it('recovers from a 429 response and honors Retry-After', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: { get: vi.fn().mockReturnValue('1') },
                    text: vi.fn().mockResolvedValue('Too many requests')
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: { get: vi.fn().mockReturnValue('application/json') },
                    json: vi.fn().mockResolvedValue({ text: 'retried success' })
                });
            const onProgress = vi.fn();

            const result = await apiClient.transcribe(new Blob(), onProgress);

            expect(result).toBe('retried success');
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(apiClient._sleep).toHaveBeenCalledWith(1000);
            expect(onProgress).toHaveBeenCalledWith('Azure returned 429. Retrying in 1s (1/5)...');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.API_REQUEST_SUCCESS, {
                model: 'whisper',
                transcriptionLength: 'retried success'.length
            });
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.anything()
            );
        });

        it('should handle rate limiting errors (429)', async () => {
            // Mock too many requests response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 429,
                headers: {
                    get: vi.fn().mockReturnValue('3')
                },
                text: vi.fn().mockResolvedValue('Too many requests')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(
                'API rate limit reached (429). Retry after 3s.'
            );
            expect(global.fetch).toHaveBeenCalledTimes(6);
            expect(apiClient._sleep).toHaveBeenCalledWith(3000);
            
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
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(apiClient._sleep).not.toHaveBeenCalled();
            
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

    describe('Overall retry deadline', () => {
        /**
         * Scripts apiClient._now() from a fixed list of timestamps so the
         * TRANSCRIPTION_MAX_TOTAL_MS deadline trips deterministically. _now() is
         * called once for the deadline (loop top), then once per status check and
         * once per sleep gate; later values exceeding the last entry reuse it.
         */
        function scriptNow(values) {
            let i = 0;
            vi.spyOn(apiClient, '_now').mockImplementation(
                () => values[Math.min(i++, values.length - 1)]
            );
        }

        it('surfaces the real API error when a Retry-After storm exhausts the deadline', async () => {
            // Always-throttled response advertising a 60s Retry-After.
            global.fetch.mockResolvedValue({
                ok: false,
                status: 429,
                headers: { get: vi.fn().mockReturnValue('60') },
                text: vi.fn().mockResolvedValue('Too many requests')
            });

            // deadline = 0 + 180000. Keep attempt 0's status check + sleep gate
            // below it, then jump past it inside attempt 1's status check so the
            // attempt is treated as final and the real 429 surfaces (not a timeout).
            //   [0]=deadline base, [1]=attempt0 status, [2]=attempt0 sleep gate,
            //   [3]=attempt1 status (>= deadline -> final)
            scriptNow([0, 1000, 2000, 200000]);

            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(
                'API rate limit reached (429). Retry after 60s.'
            );

            // Far fewer than the usual 6 attempts because the deadline cut it short.
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(global.fetch.mock.calls.length).toBeLessThan(6);

            const errorEmits = eventBusEmitSpy.mock.calls.filter(
                ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
            );
            expect(errorEmits).toHaveLength(1);
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({ status: 429 })
            );
        });

        it('throws the friendly timeout error when a backoff would end past the deadline', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 503,
                headers: { get: vi.fn().mockReturnValue('60') },
                text: vi.fn().mockResolvedValue('Service unavailable')
            });

            // Let attempt 0's status check pass (deadline not yet reached), then
            // trip the sleep gate: _now() + delay (60000) >= deadline (180000).
            //   [0]=deadline base, [1]=attempt0 status (< deadline),
            //   [2]=attempt0 sleep gate (130000 + 60000 >= 180000)
            scriptNow([0, 1000, 130000]);

            const settled = apiClient.transcribe(new Blob());
            await expect(settled).rejects.toThrow(MESSAGES.REQUEST_TIMED_OUT);

            // The thrown error preserves the friendly-timeout shape.
            const error = await settled.catch((e) => e);
            expect(error.apiContext.timeout).toBe(true);
        });

        it('does not clip a healthy request that resolves immediately', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('application/json') },
                json: vi.fn().mockResolvedValue({ text: 'Healthy transcription' })
            });

            // _now unscripted (real clock): elapsed ~0ms, well within the deadline.
            const result = await apiClient.transcribe(new Blob());

            expect(result).toBe('Healthy transcription');
            expect(global.fetch).toHaveBeenCalledTimes(1);
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

            // Under fake timers Date.now advances 120s/attempt, so the overall
            // TRANSCRIPTION_MAX_TOTAL_MS (180s) deadline trips after 2 attempts
            // (2 x 120s = 240s > 180s) — far short of the old 6, by design.
            expect(global.fetch).toHaveBeenCalledTimes(2);
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

            // Capped at 2 attempts by the TRANSCRIPTION_MAX_TOTAL_MS deadline
            // (120s/attempt advances Date.now past the 180s budget after the 2nd).
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(jsonReads).toHaveLength(2);
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
