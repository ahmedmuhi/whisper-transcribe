/**
 * @fileoverview Tests for AzureAPIClient model adapter delegation and real adapter behavior.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    API_PARAMS,
    DEFAULT_FILENAME,
    DEFAULT_LANGUAGE,
    DEFAULT_WAV_FILENAME,
    MESSAGES,
    MODEL_TYPES
} from '../js/constants.js';
import { convertToWav } from '../js/audio-converter.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

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

class TestFormData {
    constructor() {
        this.appended = [];
    }

    append(key, value, filename) {
        this.appended.push({ key, value, filename });
    }

    entries() {
        return this.appended[Symbol.iterator]();
    }
}

function createSettings(model, overrides = {}) {
    return {
        getModelConfig: vi.fn(() => ({
            model,
            apiKey: 'test-api-key',
            uri: 'https://test-api.azure.com',
            ...overrides
        }))
    };
}

function mockJsonResponse(data) {
    globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: vi.fn().mockResolvedValue(data)
    });
}

function mockTextResponse(text) {
    globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue('text/plain') },
        text: vi.fn().mockResolvedValue(text)
    });
}

function getFetchOptions() {
    return globalThis.fetch.mock.calls[0][1];
}

function getFormEntry(key) {
    return getFetchOptions().body.appended.find(entry => entry.key === key);
}

let AzureAPIClient;
let eventBusEmitSpy;

beforeAll(async () => {
    ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('AzureAPIClient model adapter registry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
        globalThis.fetch = vi.fn();
        globalThis.FormData = vi.fn(() => new TestFormData());
        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
    });

    it('looks up the active model and routes request-building and parsing through the adapter', async () => {
        const audioBlob = new Blob(['audio']);
        const onProgress = vi.fn();
        const fakeAdapter = {
            id: 'fake-model',
            label: 'Fake Model',
            storageKeys: {
                apiKey: 'fake_api_key',
                uri: 'fake_uri'
            },
            buildRequest: vi.fn(async () => ({
                headers: { 'fake-header': 'fake-api-key' },
                body: 'fake-body',
                statusMessage: 'Sending to fake model...'
            })),
            parseResponse: vi.fn(() => 'fake transcript')
        };
        const fakeRegistry = new Map([[fakeAdapter.id, fakeAdapter]]);
        vi.spyOn(fakeRegistry, 'get');
        const settings = createSettings('fake-model', { apiKey: 'fake-api-key' });
        const apiClient = new AzureAPIClient(settings, fakeRegistry);
        mockJsonResponse({ fake: 'response' });

        const result = await apiClient.transcribe(audioBlob, onProgress);

        expect(result).toBe('fake transcript');
        expect(fakeRegistry.get).toHaveBeenCalledWith('fake-model');
        expect(fakeAdapter.buildRequest).toHaveBeenCalledWith(
            audioBlob,
            expect.objectContaining({
                model: 'fake-model',
                apiKey: 'fake-api-key',
                uri: 'https://test-api.azure.com'
            }),
            onProgress
        );
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://test-api.azure.com',
            expect.objectContaining({
                headers: { 'fake-header': 'fake-api-key' },
                body: 'fake-body'
            })
        );
        expect(fakeAdapter.parseResponse).toHaveBeenCalledWith({ fake: 'response' });

        const parsed = apiClient.parseResponse({ direct: 'response' });
        expect(parsed).toBe('fake transcript');
        expect(fakeAdapter.parseResponse).toHaveBeenCalledWith({ direct: 'response' });
    });

    it('keeps the existing Whisper request and parsed text behavior', async () => {
        const settings = createSettings(MODEL_TYPES.WHISPER);
        const apiClient = new AzureAPIClient(settings);
        const onProgress = vi.fn();
        const audioBlob = new Blob(['audio']);
        mockTextResponse(' Whisper text ');

        const result = await apiClient.transcribe(audioBlob, onProgress);

        expect(result).toBe('Whisper text');
        expect(getFetchOptions().headers).toEqual({ [API_PARAMS.API_KEY_HEADER]: 'test-api-key' });
        expect(getFormEntry(API_PARAMS.FILE)).toEqual({
            key: API_PARAMS.FILE,
            value: audioBlob,
            filename: DEFAULT_FILENAME
        });
        expect(getFormEntry(API_PARAMS.LANGUAGE)).toEqual({
            key: API_PARAMS.LANGUAGE,
            value: DEFAULT_LANGUAGE,
            filename: undefined
        });
        expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_WHISPER);
        expect(convertToWav).not.toHaveBeenCalled();
        expect(apiClient.parseResponse({ text: 'Whisper JSON text' })).toBe('Whisper JSON text');
        expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.API_REQUEST_START, {
            model: MODEL_TYPES.WHISPER,
            message: MESSAGES.SENDING_TO_WHISPER
        });
        expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.API_REQUEST_SUCCESS, {
            model: MODEL_TYPES.WHISPER,
            transcriptionLength: 'Whisper text'.length
        });
    });

    it('keeps public parseResponse shape-sniffing regardless of active model', () => {
        const settings = createSettings(MODEL_TYPES.WHISPER);
        const apiClient = new AzureAPIClient(settings);

        expect(apiClient.parseResponse({
            combinedPhrases: [{ text: 'From combinedPhrases' }],
            text: 'From text field'
        })).toBe('From combinedPhrases');
    });

    it('emits API_REQUEST_ERROR when delegated response parsing fails', async () => {
        const settings = createSettings(MODEL_TYPES.WHISPER);
        const apiClient = new AzureAPIClient(settings);
        mockJsonResponse({ unexpected: 'format' });

        await expect(apiClient.transcribe(new Blob(['audio']))).rejects.toThrow(MESSAGES.UNKNOWN_API_RESPONSE);

        expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.API_REQUEST_ERROR, {
            error: MESSAGES.UNKNOWN_API_RESPONSE
        });
    });

    it('keeps the existing Whisper Translate request and parsed text behavior', async () => {
        const settings = createSettings(MODEL_TYPES.WHISPER_TRANSLATE);
        const apiClient = new AzureAPIClient(settings);
        const onProgress = vi.fn();
        const audioBlob = new Blob(['audio']);
        mockJsonResponse({ text: 'Translated text' });

        const result = await apiClient.transcribe(audioBlob, onProgress);

        expect(result).toBe('Translated text');
        expect(getFetchOptions().headers).toEqual({ [API_PARAMS.API_KEY_HEADER]: 'test-api-key' });
        expect(getFormEntry(API_PARAMS.FILE)).toEqual({
            key: API_PARAMS.FILE,
            value: audioBlob,
            filename: DEFAULT_FILENAME
        });
        expect(getFormEntry(API_PARAMS.LANGUAGE)).toBeUndefined();
        expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_WHISPER);
        expect(convertToWav).not.toHaveBeenCalled();
        expect(apiClient.parseResponse(' Translated plain text ')).toBe('Translated plain text');
    });

    it('keeps the existing MAI-Transcribe request and parsed text behavior', async () => {
        const settings = createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        const apiClient = new AzureAPIClient(settings);
        const onProgress = vi.fn();
        const audioBlob = new Blob(['audio']);
        mockJsonResponse({
            combinedPhrases: [
                { text: 'First segment.' },
                { text: 'Second segment.' }
            ],
            phrases: []
        });

        const result = await apiClient.transcribe(audioBlob, onProgress);

        expect(result).toBe('First segment. Second segment.');
        expect(getFetchOptions().headers).toEqual({ [API_PARAMS.MAI_API_KEY_HEADER]: 'test-api-key' });
        expect(getFormEntry(API_PARAMS.MAI_AUDIO_FIELD)).toEqual({
            key: API_PARAMS.MAI_AUDIO_FIELD,
            value: expect.objectContaining({ type: 'audio/wav' }),
            filename: DEFAULT_WAV_FILENAME
        });
        expect(JSON.parse(getFormEntry(API_PARAMS.MAI_DEFINITION_FIELD).value)).toEqual({
            enhancedMode: {
                enabled: true,
                model: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL,
                task: 'transcribe'
            }
        });
        expect(getFormEntry(API_PARAMS.FILE)).toBeUndefined();
        expect(getFormEntry(API_PARAMS.LANGUAGE)).toBeUndefined();
        expect(convertToWav).toHaveBeenCalledWith(audioBlob);
        expect(onProgress).toHaveBeenCalledWith(MESSAGES.CONVERTING_AUDIO);
        expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_MAI_TRANSCRIBE);
        expect(apiClient.parseResponse({
            combinedPhrases: [{ text: 'Combined output.' }],
            text: 'Text field output.'
        })).toBe('Combined output.');
    });

});
