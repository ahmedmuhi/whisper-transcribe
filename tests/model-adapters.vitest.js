/**
 * @fileoverview Tests for AzureAPIClient model adapter delegation and real adapter behavior.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    DEFAULT_FILENAME,
    DEFAULT_LANGUAGE,
    DEFAULT_WAV_FILENAME,
    formatAudioUploadLimitMessage,
    MAI_TRANSCRIBE_MAX_UPLOAD_BYTES,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS,
    WHISPER_MAX_UPLOAD_BYTES
} from '../js/constants.js';
import { convertToWav } from '../js/audio-converter.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { modelAdapterRegistry } from '../js/model-adapters/index.js';
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

function createBlobWithStubbedSize(size, type = 'audio/webm') {
    const audioBlob = new Blob(['audio'], { type });
    Object.defineProperty(audioBlob, 'size', { value: size });
    return audioBlob;
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

    it('requires complete credential storage metadata for every registered adapter', () => {
        for (const [model, adapter] of modelAdapterRegistry) {
            expect(adapter.id).toBe(model);
            expect(adapter.storageKeys).toEqual(expect.objectContaining({
                apiKey: expect.any(String),
                uri: expect.any(String)
            }));
            expect(adapter.storageKeys.apiKey).not.toBe('');
            expect(adapter.storageKeys.uri).not.toBe('');
        }

        expect(modelAdapterRegistry.get(MODEL_TYPES.WHISPER).storageKeys).toEqual({
            apiKey: STORAGE_KEYS.WHISPER_API_KEY,
            uri: STORAGE_KEYS.WHISPER_URI
        });
        expect(modelAdapterRegistry.get(MODEL_TYPES.WHISPER_TRANSLATE).storageKeys).toEqual({
            apiKey: STORAGE_KEYS.WHISPER_API_KEY,
            uri: STORAGE_KEYS.WHISPER_URI
        });
        expect(modelAdapterRegistry.get(MODEL_TYPES.MAI_TRANSCRIBE_1_5).storageKeys).toEqual({
            apiKey: STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY,
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        });
    });

    it('looks up the active model and routes request-building and parsing through the adapter', async () => {
        const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
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
        const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
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

        await expect(apiClient.transcribe(new Blob(['audio'], { type: 'audio/webm' }))).rejects.toThrow(MESSAGES.UNKNOWN_API_RESPONSE);

        const errorEvents = eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
        );
        expect(errorEvents).toEqual([[APP_EVENTS.API_REQUEST_ERROR, {
            error: MESSAGES.UNKNOWN_API_RESPONSE
        }]]);
    });

    it('emits one structured lifecycle when a retryable request succeeds', async () => {
        const settings = createSettings(MODEL_TYPES.WHISPER);
        const apiClient = new AzureAPIClient(settings);
        const onProgress = vi.fn();
        apiClient._sleep = vi.fn().mockResolvedValue();
        globalThis.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('Too many requests')
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('text/plain') },
                text: vi.fn().mockResolvedValue('Retried transcription')
            });

        await expect(apiClient.transcribe(new Blob(['audio'], { type: 'audio/webm' }), onProgress))
            .resolves.toBe('Retried transcription');

        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_START
        )).toEqual([[APP_EVENTS.API_REQUEST_START, {
            model: MODEL_TYPES.WHISPER,
            message: MESSAGES.SENDING_TO_WHISPER
        }]]);
        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_SUCCESS
        )).toEqual([[APP_EVENTS.API_REQUEST_SUCCESS, {
            model: MODEL_TYPES.WHISPER,
            transcriptionLength: 'Retried transcription'.length
        }]]);
        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
        )).toEqual([]);
    });

    it('keeps the existing Whisper Translate request and parsed text behavior', async () => {
        const settings = createSettings(MODEL_TYPES.WHISPER_TRANSLATE);
        const apiClient = new AzureAPIClient(settings);
        const onProgress = vi.fn();
        const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
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

    it.each([
        [MODEL_TYPES.WHISPER, 'Azure Whisper'],
        [MODEL_TYPES.WHISPER_TRANSLATE, 'Azure Whisper Translate']
    ])('accepts %s audio below and at the 25 MB upload limit', async (model) => {
        const settings = createSettings(model);
        const apiClient = new AzureAPIClient(settings);

        if (model === MODEL_TYPES.WHISPER) {
            mockTextResponse('Whisper text');
        } else {
            mockJsonResponse({ text: 'Translated text' });
        }

        await apiClient.transcribe(createBlobWithStubbedSize(WHISPER_MAX_UPLOAD_BYTES - 1));
        await apiClient.transcribe(createBlobWithStubbedSize(WHISPER_MAX_UPLOAD_BYTES));

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.FormData).toHaveBeenCalledTimes(2);
    });

    it.each([
        [MODEL_TYPES.WHISPER, 'Azure Whisper'],
        [MODEL_TYPES.WHISPER_TRANSLATE, 'Azure Whisper Translate']
    ])('rejects %s audio one byte above the 25 MB upload limit before request construction', async (model, label) => {
        const settings = createSettings(model);
        const apiClient = new AzureAPIClient(settings);

        await expect(apiClient.transcribe(
            createBlobWithStubbedSize(WHISPER_MAX_UPLOAD_BYTES + 1)
        )).rejects.toMatchObject({
            code: AUDIO_UPLOAD_LIMIT_ERROR_CODE,
            retryable: false,
            message: formatAudioUploadLimitMessage(label, 'up to 25 MB')
        });

        expect(globalThis.FormData).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it.each([
        [MODEL_TYPES.WHISPER, 'audio/mp4; codecs=mp4a.40.2', 'recording.mp4'],
        [MODEL_TYPES.WHISPER_TRANSLATE, 'audio/mp4; codecs=mp4a.40.2', 'recording.mp4'],
        [MODEL_TYPES.WHISPER, 'audio/x-m4a', 'recording.m4a'],
        [MODEL_TYPES.WHISPER_TRANSLATE, 'audio/x-m4a', 'recording.m4a'],
        [MODEL_TYPES.WHISPER, 'audio/wav', 'recording.wav'],
        [MODEL_TYPES.WHISPER_TRANSLATE, 'audio/wav', 'recording.wav']
    ])('uploads %s audio with a filename matching %s', async (model, mimeType, filename) => {
        const settings = createSettings(model);
        const apiClient = new AzureAPIClient(settings);
        const audioBlob = new Blob(['audio'], { type: mimeType });

        if (model === MODEL_TYPES.WHISPER) {
            mockTextResponse('Whisper text');
        } else {
            mockJsonResponse({ text: 'Translated text' });
        }

        await apiClient.transcribe(audioBlob);

        expect(getFormEntry(API_PARAMS.FILE)).toEqual({
            key: API_PARAMS.FILE,
            value: audioBlob,
            filename
        });
        expect(getFormEntry(API_PARAMS.FILE).value.type).toBe(mimeType);
    });

    it.each([MODEL_TYPES.WHISPER, MODEL_TYPES.WHISPER_TRANSLATE])(
        'uses the WebM fallback filename only when %s audio has no MIME type',
        async (model) => {
            const settings = createSettings(model);
            const apiClient = new AzureAPIClient(settings);
            const audioBlob = new Blob(['audio']);

            if (model === MODEL_TYPES.WHISPER) {
                mockTextResponse('Whisper text');
            } else {
                mockJsonResponse({ text: 'Translated text' });
            }

            await apiClient.transcribe(audioBlob);

            expect(getFormEntry(API_PARAMS.FILE)).toEqual({
                key: API_PARAMS.FILE,
                value: audioBlob,
                filename: DEFAULT_FILENAME
            });
        }
    );

    it.each([MODEL_TYPES.WHISPER, MODEL_TYPES.WHISPER_TRANSLATE])(
        'rejects unsupported %s audio before fetch',
        async (model) => {
            const settings = createSettings(model);
            const apiClient = new AzureAPIClient(settings);
            const audioBlob = new Blob(['audio'], { type: 'audio/ogg' });

            await expect(apiClient.transcribe(audioBlob)).rejects.toThrow(
                'Unsupported audio MIME type for Whisper upload: audio/ogg.'
            );

            expect(globalThis.fetch).not.toHaveBeenCalled();
        }
    );

    it('keeps the existing MAI-Transcribe request and parsed text behavior', async () => {
        const settings = createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        const apiClient = new AzureAPIClient(settings);
        const onProgress = vi.fn();
        const audioBlob = new Blob(['captured audio'], { type: 'audio/mp4' });
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
        expect(audioBlob.type).toBe('audio/mp4');
        expect(convertToWav).toHaveBeenCalledWith(audioBlob);
        expect(onProgress).toHaveBeenCalledWith(MESSAGES.CONVERTING_AUDIO);
        expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_MAI_TRANSCRIBE);
        expect(apiClient.parseResponse({
            combinedPhrases: [{ text: 'Combined output.' }],
            text: 'Text field output.'
        })).toBe('Combined output.');
    });

    it('accepts MAI audio at the strict less-than-300-MB boundary after conversion', async () => {
        const settings = createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        const apiClient = new AzureAPIClient(settings);
        const sourceBlob = createBlobWithStubbedSize(MAI_TRANSCRIBE_MAX_UPLOAD_BYTES + 1);
        const wavBlob = createBlobWithStubbedSize(MAI_TRANSCRIBE_MAX_UPLOAD_BYTES, 'audio/wav');
        convertToWav.mockResolvedValueOnce(wavBlob);
        mockJsonResponse({ text: 'MAI transcription' });

        await expect(apiClient.transcribe(sourceBlob)).resolves.toBe('MAI transcription');

        expect(convertToWav).toHaveBeenCalledWith(sourceBlob);
        expect(getFormEntry(API_PARAMS.MAI_AUDIO_FIELD)).toEqual({
            key: API_PARAMS.MAI_AUDIO_FIELD,
            value: wavBlob,
            filename: DEFAULT_WAV_FILENAME
        });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects an oversized MAI WAV after conversion and before request construction', async () => {
        const settings = createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        const apiClient = new AzureAPIClient(settings);
        const sourceBlob = createBlobWithStubbedSize(1);
        const oversizedWavBlob = createBlobWithStubbedSize(MAI_TRANSCRIBE_MAX_UPLOAD_BYTES + 1, 'audio/wav');
        convertToWav.mockResolvedValueOnce(oversizedWavBlob);

        await expect(apiClient.transcribe(sourceBlob)).rejects.toMatchObject({
            code: AUDIO_UPLOAD_LIMIT_ERROR_CODE,
            retryable: false,
            message: formatAudioUploadLimitMessage('Azure MAI-Transcribe 1.5', 'under 300 MB')
        });

        expect(convertToWav).toHaveBeenCalledWith(sourceBlob);
        expect(globalThis.FormData).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

});
