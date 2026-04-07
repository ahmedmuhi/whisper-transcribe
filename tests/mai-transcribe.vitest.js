/**
 * @fileoverview Tests for MAI-Transcribe-1 model integration.
 * Covers API client request format, response parsing, and settings management.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { MODEL_TYPES, MESSAGES, API_PARAMS, DEFAULT_WAV_FILENAME } from '../js/constants.js';
import { convertToWav } from '../js/audio-converter.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

const mockSettings = {
    getModelConfig: vi.fn(),
    getCurrentModel: vi.fn()
};

global.URL = vi.fn((url) => {
    if (!url || !url.startsWith('http')) {
        throw new Error('Invalid URL');
    }
    return { href: url };
});

global.fetch = vi.fn();

const formDataEntries = [];
global.FormData = vi.fn(() => ({
    append: vi.fn((key, value, filename) => {
        formDataEntries.push({ key, value, filename });
    }),
    entries: () => formDataEntries[Symbol.iterator]()
}));

function mockMaiTranscribeConfig(overrides = {}) {
    mockSettings.getModelConfig.mockReturnValue({
        model: MODEL_TYPES.MAI_TRANSCRIBE,
        apiKey: 'test-mai-key',
        uri: 'https://mai-test.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe',
        ...overrides
    });
}

function mockMaiJsonResponsePayload(text = 'test') {
    return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({
            combinedPhrases: [{ text }],
            phrases: []
        })
    };
}

function mockMaiJsonResponse(text = 'test') {
    global.fetch.mockResolvedValue(mockMaiJsonResponsePayload(text));
}

function mockErrorResponse(status, errorBody = {}, retryAfter = null) {
    return {
        ok: false,
        status,
        headers: {
            get: (headerName) => {
                if (headerName === 'Retry-After') {
                    return retryAfter;
                }
                if (headerName === 'content-type') {
                    return 'application/json';
                }
                return null;
            }
        },
        text: () => Promise.resolve(JSON.stringify(errorBody))
    };
}

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

let AzureAPIClient;
beforeAll(async () => {
    ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('MAI-Transcribe-1 Integration', () => {
    let apiClient;

    beforeEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
        formDataEntries.length = 0;
        apiClient = new AzureAPIClient(mockSettings);
    });

    describe('API Client — Request Format', () => {
        it('should use Ocp-Apim-Subscription-Key header for MAI-Transcribe', async () => {
            mockMaiTranscribeConfig();
            mockMaiJsonResponse('hello world');

            await apiClient.transcribe(new Blob(['audio']), vi.fn());

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: { [API_PARAMS.MAI_API_KEY_HEADER]: 'test-mai-key' }
                })
            );
        });

        it('should use api-key header for Whisper model', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.WHISPER,
                apiKey: 'test-whisper-key',
                uri: 'https://whisper.azure.com/transcribe'
            });

            global.fetch.mockResolvedValue({
                ok: true,
                headers: { get: () => 'text/plain' },
                text: () => Promise.resolve('hello world')
            });

            await apiClient.transcribe(new Blob(['audio']), vi.fn());

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: { [API_PARAMS.API_KEY_HEADER]: 'test-whisper-key' }
                })
            );

            expect(convertToWav).not.toHaveBeenCalled();
        });

        it('should send audio and definition fields for MAI-Transcribe', async () => {
            mockMaiTranscribeConfig();
            mockMaiJsonResponse();

            await apiClient.transcribe(new Blob(['audio']), vi.fn());

            const audioEntry = formDataEntries.find(e => e.key === API_PARAMS.MAI_AUDIO_FIELD);
            const definitionEntry = formDataEntries.find(e => e.key === API_PARAMS.MAI_DEFINITION_FIELD);

            expect(audioEntry).toBeDefined();
            expect(definitionEntry).toBeDefined();

            const definition = JSON.parse(definitionEntry.value);
            expect(definition.enhancedMode.enabled).toBe(true);
            expect(definition.enhancedMode.model).toBe(MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL);
            expect(definition.enhancedMode.task).toBe('transcribe');
        });

        it('should send WAV-converted audio for MAI-Transcribe', async () => {
            mockMaiTranscribeConfig();
            mockMaiJsonResponse();

            await apiClient.transcribe(new Blob(['audio']), vi.fn());

            expect(convertToWav).toHaveBeenCalledTimes(1);
            const audioEntry = formDataEntries.find(e => e.key === API_PARAMS.MAI_AUDIO_FIELD);
            expect(audioEntry).toBeDefined();
            expect(audioEntry.value.type).toBe('audio/wav');
            expect(audioEntry.filename).toBe(DEFAULT_WAV_FILENAME);
        });

        it('should NOT send file/language fields for MAI-Transcribe', async () => {
            mockMaiTranscribeConfig();
            mockMaiJsonResponse();

            await apiClient.transcribe(new Blob(['audio']), vi.fn());

            const fileEntry = formDataEntries.find(e => e.key === API_PARAMS.FILE);
            const languageEntry = formDataEntries.find(e => e.key === API_PARAMS.LANGUAGE);

            expect(fileEntry).toBeUndefined();
            expect(languageEntry).toBeUndefined();
        });

        it('should show MAI-Transcribe status message', async () => {
            mockMaiTranscribeConfig();
            mockMaiJsonResponse();

            const onProgress = vi.fn();
            await apiClient.transcribe(new Blob(['audio']), onProgress);

            expect(onProgress).toHaveBeenCalledWith(MESSAGES.CONVERTING_AUDIO);
            expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_MAI_TRANSCRIBE);
        });

        it('should retry 429 responses and honor Retry-After header', async () => {
            mockMaiTranscribeConfig();
            global.fetch
                .mockResolvedValueOnce(mockErrorResponse(429, { message: 'Too many requests' }, '1'))
                .mockResolvedValueOnce(mockMaiJsonResponsePayload('retried success'));

            const sleepSpy = vi.spyOn(apiClient, '_sleep').mockResolvedValue();
            const onProgress = vi.fn();

            const result = await apiClient.transcribe(new Blob(['audio']), onProgress);

            expect(result).toBe('retried success');
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(sleepSpy).toHaveBeenCalledWith(1000);
            expect(onProgress).toHaveBeenCalledWith('Azure returned 429. Retrying in 1s (1/5)...');
        });

        it('should not retry non-retryable 4xx responses', async () => {
            mockMaiTranscribeConfig();
            global.fetch.mockResolvedValue(
                mockErrorResponse(400, { error: { message: 'Bad request' } })
            );

            const sleepSpy = vi.spyOn(apiClient, '_sleep').mockResolvedValue();

            await expect(apiClient.transcribe(new Blob(['audio']), vi.fn()))
                .rejects.toThrow('API error 400: Bad request');

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(sleepSpy).not.toHaveBeenCalled();
        });

        it('should return a clearer message after repeated 429 responses', async () => {
            mockMaiTranscribeConfig();
            global.fetch.mockResolvedValue(
                mockErrorResponse(429, { error: { message: 'Rate limit exceeded' } }, '3')
            );

            vi.spyOn(apiClient, '_sleep').mockResolvedValue();

            await expect(apiClient.transcribe(new Blob(['audio']), vi.fn()))
                .rejects.toThrow('API rate limit reached (429). Retry after 3s. Rate limit exceeded');

            expect(global.fetch).toHaveBeenCalledTimes(6);
        });
    });

    describe('API Client — Response Parsing', () => {
        it('should parse combinedPhrases from MAI-Transcribe response', () => {
            const data = {
                combinedPhrases: [{ text: 'Hello, this is a test.' }],
                phrases: [{ text: 'Hello,' }, { text: 'this is a test.' }]
            };

            const result = apiClient.parseResponse(data);
            expect(result).toBe('Hello, this is a test.');
        });

        it('should join multiple combinedPhrases', () => {
            const data = {
                combinedPhrases: [
                    { text: 'First segment.' },
                    { text: 'Second segment.' }
                ],
                phrases: []
            };

            const result = apiClient.parseResponse(data);
            expect(result).toBe('First segment. Second segment.');
        });

        it('should still parse Whisper text response', () => {
            const result = apiClient.parseResponse('Hello world');
            expect(result).toBe('Hello world');
        });

        it('should still parse Whisper JSON response with text field', () => {
            const data = { text: 'Hello from Whisper' };
            const result = apiClient.parseResponse(data);
            expect(result).toBe('Hello from Whisper');
        });

        it('should prefer combinedPhrases over text field', () => {
            const data = {
                combinedPhrases: [{ text: 'From combinedPhrases' }],
                text: 'From text field'
            };

            const result = apiClient.parseResponse(data);
            expect(result).toBe('From combinedPhrases');
        });

        it('should throw on empty combinedPhrases array', () => {
            const data = { combinedPhrases: [] };
            expect(() => apiClient.parseResponse(data)).toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
        });

        it('should throw on unknown response format', () => {
            const data = { unknownField: 'value' };
            expect(() => apiClient.parseResponse(data)).toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
        });
    });

    describe('API Client — Validation', () => {
        it('should validate MAI-Transcribe configuration', () => {
            mockMaiTranscribeConfig();

            const config = apiClient.validateConfig();
            expect(config.model).toBe(MODEL_TYPES.MAI_TRANSCRIBE);
        });

        it('should reject missing MAI-Transcribe API key', () => {
            mockMaiTranscribeConfig({ apiKey: '' });

            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.API_KEY_REQUIRED);
        });
    });
});
