/**
 * @fileoverview Tests for MAI-Transcribe-1 model integration.
 * Covers API client request format, response parsing, and settings management.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { MODEL_TYPES, MESSAGES, API_PARAMS, STORAGE_KEYS, ID } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

// Mock Settings
const mockSettings = {
    getModelConfig: vi.fn(),
    getCurrentModel: vi.fn()
};

// Mock URL constructor
global.URL = vi.fn((url) => {
    if (!url || !url.startsWith('http')) {
        throw new Error('Invalid URL');
    }
    return { href: url };
});

// Mock fetch
global.fetch = vi.fn();

// Mock FormData
const formDataEntries = [];
global.FormData = vi.fn(() => ({
    append: vi.fn((key, value, filename) => {
        formDataEntries.push({ key, value, filename });
    }),
    entries: () => formDataEntries[Symbol.iterator]()
}));

// Mock dependencies
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
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.MAI_TRANSCRIBE,
                apiKey: 'test-mai-key',
                uri: 'https://mai-test.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe'
            });

            global.fetch.mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({
                    combinedPhrases: [{ text: 'hello world' }],
                    phrases: []
                })
            });

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
        });

        it('should send audio and definition fields for MAI-Transcribe', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.MAI_TRANSCRIBE,
                apiKey: 'test-mai-key',
                uri: 'https://mai-test.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe'
            });

            global.fetch.mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({
                    combinedPhrases: [{ text: 'test' }],
                    phrases: []
                })
            });

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

        it('should NOT send file/language fields for MAI-Transcribe', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.MAI_TRANSCRIBE,
                apiKey: 'test-mai-key',
                uri: 'https://mai-test.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe'
            });

            global.fetch.mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({
                    combinedPhrases: [{ text: 'test' }],
                    phrases: []
                })
            });

            await apiClient.transcribe(new Blob(['audio']), vi.fn());

            const fileEntry = formDataEntries.find(e => e.key === API_PARAMS.FILE);
            const languageEntry = formDataEntries.find(e => e.key === 'language');

            expect(fileEntry).toBeUndefined();
            expect(languageEntry).toBeUndefined();
        });

        it('should show MAI-Transcribe status message', async () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.MAI_TRANSCRIBE,
                apiKey: 'test-mai-key',
                uri: 'https://mai-test.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe'
            });

            global.fetch.mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({
                    combinedPhrases: [{ text: 'test' }],
                    phrases: []
                })
            });

            const onProgress = vi.fn();
            await apiClient.transcribe(new Blob(['audio']), onProgress);

            expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_MAI_TRANSCRIBE);
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
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.MAI_TRANSCRIBE,
                apiKey: 'test-mai-key',
                uri: 'https://mai-test.cognitiveservices.azure.com'
            });

            const config = apiClient.validateConfig();
            expect(config.model).toBe(MODEL_TYPES.MAI_TRANSCRIBE);
        });

        it('should reject missing MAI-Transcribe API key', () => {
            mockSettings.getModelConfig.mockReturnValue({
                model: MODEL_TYPES.MAI_TRANSCRIBE,
                apiKey: '',
                uri: 'https://mai-test.cognitiveservices.azure.com'
            });

            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.API_KEY_REQUIRED);
        });
    });
});
