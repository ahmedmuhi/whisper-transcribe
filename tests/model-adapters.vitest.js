/**
 * @fileoverview Tests for keyless model adapter delegation and request behavior.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE,
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
import { COGNITIVE_SERVICES_SCOPE } from '../js/authentication-config.js';
import { convertToWav } from '../js/audio-converter.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { modelAdapterRegistry } from '../js/model-adapters/index.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

const FAKE_TOKEN = 'fake-adapter-bearer-token';

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
            uri: 'https://target.invalid/transcribe',
            ...overrides
        }))
    };
}

function createTokenProvider() {
    return Object.freeze({
        getToken: vi.fn().mockResolvedValue(FAKE_TOKEN)
    });
}

function createApiClient(settings, registry = modelAdapterRegistry) {
    return new AzureAPIClient(settings, createTokenProvider(), registry);
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

function getFormEntry(name) {
    return getFetchOptions().body.appended.find(entry => entry.key === name);
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

    it('registers exactly two immutable, credential-blind model adapters', () => {
        expect([...modelAdapterRegistry.keys()]).toEqual([
            MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            MODEL_TYPES.WHISPER
        ]);

        for (const [model, adapter] of modelAdapterRegistry) {
            expect(Object.isFrozen(adapter)).toBe(true);
            expect(adapter.id).toBe(model);
            expect(adapter.scope).toBe(COGNITIVE_SERVICES_SCOPE);
            expect(Object.isFrozen(adapter.storageKeys)).toBe(true);
            expect(Object.keys(adapter.storageKeys)).toEqual(['uri']);
        }

        expect(modelAdapterRegistry.get(MODEL_TYPES.WHISPER).storageKeys).toEqual({
            uri: STORAGE_KEYS.WHISPER_URI
        });
        expect(modelAdapterRegistry.get(MODEL_TYPES.MAI_TRANSCRIBE_1_5).storageKeys).toEqual({
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        });
    });

    it('routes request building and parsing through the active adapter', async () => {
        const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
        const onProgress = vi.fn();
        const fakeAdapter = Object.freeze({
            id: 'fake-model',
            label: 'Fake Model',
            scope: COGNITIVE_SERVICES_SCOPE,
            storageKeys: Object.freeze({ uri: 'fake_uri' }),
            buildRequest: vi.fn(async () => ({
                body: 'fake-body',
                statusMessage: 'Sending to fake model...'
            })),
            parseResponse: vi.fn(() => 'fake transcript')
        });
        const fakeRegistry = new Map([[fakeAdapter.id, fakeAdapter]]);
        vi.spyOn(fakeRegistry, 'get');
        const settings = createSettings('fake-model');
        const apiClient = createApiClient(settings, fakeRegistry);
        mockJsonResponse({ fake: 'response' });

        await expect(apiClient.transcribe(audioBlob, onProgress)).resolves.toBe('fake transcript');

        expect(fakeRegistry.get).toHaveBeenCalledWith('fake-model');
        expect(fakeAdapter.buildRequest).toHaveBeenCalledWith(
            audioBlob,
            {
                model: 'fake-model',
                uri: 'https://target.invalid/transcribe'
            },
            onProgress
        );
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://target.invalid/transcribe',
            expect.objectContaining({
                headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
                body: 'fake-body'
            })
        );
        expect(fakeAdapter.parseResponse).toHaveBeenCalledWith({ fake: 'response' });

        expect(apiClient.parseResponse({ direct: 'response' })).toBe('fake transcript');
        expect(fakeAdapter.parseResponse).toHaveBeenCalledWith({ direct: 'response' });
    });

    it('keeps the existing Whisper request and parsed text behavior', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));
        const onProgress = vi.fn();
        const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
        mockTextResponse(' Whisper text ');

        await expect(apiClient.transcribe(audioBlob, onProgress)).resolves.toBe('Whisper text');

        expect(getFetchOptions().headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
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
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));

        expect(apiClient.parseResponse({
            combinedPhrases: [{ text: 'From combinedPhrases' }],
            text: 'From text field'
        })).toBe('From combinedPhrases');
    });

    it('emits API_REQUEST_ERROR when delegated response parsing fails', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));
        mockJsonResponse({ unexpected: 'format' });

        await expect(apiClient.transcribe(new Blob(['audio'], { type: 'audio/webm' })))
            .rejects.toThrow(MESSAGES.UNKNOWN_API_RESPONSE);

        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
        )).toEqual([[APP_EVENTS.API_REQUEST_ERROR, {
            error: MESSAGES.UNKNOWN_API_RESPONSE
        }]]);
    });

    it('emits one lifecycle and reuses one token when a retryable request succeeds', async () => {
        const tokenProvider = createTokenProvider();
        const apiClient = new AzureAPIClient(
            createSettings(MODEL_TYPES.WHISPER),
            tokenProvider
        );
        const onProgress = vi.fn();
        apiClient._sleep = vi.fn().mockResolvedValue();
        globalThis.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('fake throttled response')
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('text/plain') },
                text: vi.fn().mockResolvedValue('Retried transcription')
            });

        await expect(apiClient.transcribe(new Blob(['audio'], { type: 'audio/webm' }), onProgress))
            .resolves.toBe('Retried transcription');

        expect(tokenProvider.getToken).toHaveBeenCalledTimes(1);
        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_START
        )).toEqual([[APP_EVENTS.API_REQUEST_START, {
            model: MODEL_TYPES.WHISPER,
            message: MESSAGES.SENDING_TO_WHISPER
        }]]);
        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_SUCCESS
        )).toHaveLength(1);
        expect(eventBusEmitSpy.mock.calls.filter(
            ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
        )).toEqual([]);
    });

    it('accepts Whisper audio below and at the 25 MB upload limit', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));
        mockTextResponse('Whisper text');

        await apiClient.transcribe(createBlobWithStubbedSize(WHISPER_MAX_UPLOAD_BYTES - 1));
        await apiClient.transcribe(createBlobWithStubbedSize(WHISPER_MAX_UPLOAD_BYTES));

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.FormData).toHaveBeenCalledTimes(2);
    });

    it('rejects Whisper audio one byte above the 25 MB limit before token acquisition', async () => {
        const tokenProvider = createTokenProvider();
        const apiClient = new AzureAPIClient(createSettings(MODEL_TYPES.WHISPER), tokenProvider);

        await expect(apiClient.transcribe(
            createBlobWithStubbedSize(WHISPER_MAX_UPLOAD_BYTES + 1)
        )).rejects.toMatchObject({
            code: AUDIO_UPLOAD_LIMIT_ERROR_CODE,
            retryable: false,
            message: formatAudioUploadLimitMessage('Azure Whisper', 'up to 25 MB')
        });

        expect(globalThis.FormData).not.toHaveBeenCalled();
        expect(tokenProvider.getToken).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it.each([
        ['audio/mp4; codecs=mp4a.40.2', 'recording.mp4'],
        ['audio/x-m4a', 'recording.m4a'],
        ['audio/wav', 'recording.wav']
    ])('uploads Whisper %s audio with filename %s', async (mimeType, filename) => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));
        const audioBlob = new Blob(['audio'], { type: mimeType });
        mockTextResponse('Whisper text');

        await apiClient.transcribe(audioBlob);

        expect(getFormEntry(API_PARAMS.FILE)).toEqual({
            key: API_PARAMS.FILE,
            value: audioBlob,
            filename
        });
    });

    it('uses the WebM fallback filename when Whisper audio has no MIME type', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));
        const audioBlob = new Blob(['audio']);
        mockTextResponse('Whisper text');

        await apiClient.transcribe(audioBlob);

        expect(getFormEntry(API_PARAMS.FILE)).toEqual({
            key: API_PARAMS.FILE,
            value: audioBlob,
            filename: DEFAULT_FILENAME
        });
    });

    it('uses extension fallback for an empty-MIME local File without sending its local name', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.WHISPER));
        const audioFile = new File(['deterministic-placeholder'], 'local-choice.mp3');
        mockTextResponse('Whisper text');

        await apiClient.transcribe(audioFile);

        expect(getFormEntry(API_PARAMS.FILE)).toEqual({
            key: API_PARAMS.FILE,
            value: audioFile,
            filename: 'recording.mp3'
        });
    });

    it('rejects unsupported Whisper audio before token acquisition and fetch', async () => {
        const tokenProvider = createTokenProvider();
        const apiClient = new AzureAPIClient(createSettings(MODEL_TYPES.WHISPER), tokenProvider);

        await expect(apiClient.transcribe(new Blob(['audio'], { type: 'audio/ogg' })))
            .rejects.toThrow('Unsupported audio MIME type for Whisper upload: audio/ogg.');

        expect(tokenProvider.getToken).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('rejects a present unsupported MIME even when the local extension is supported', async () => {
        const tokenProvider = createTokenProvider();
        const apiClient = new AzureAPIClient(createSettings(MODEL_TYPES.WHISPER), tokenProvider);
        const audioFile = new File(['deterministic-placeholder'], 'conflict.wav', {
            type: 'audio/ogg'
        });

        await expect(apiClient.transcribe(audioFile)).rejects.toMatchObject({
            code: AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE
        });
        expect(tokenProvider.getToken).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('keeps the existing MAI-Transcribe request and parsed text behavior', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5));
        const onProgress = vi.fn();
        const audioBlob = new Blob(['captured audio'], { type: 'audio/mp4' });
        mockJsonResponse({
            combinedPhrases: [
                { text: 'First segment.' },
                { text: 'Second segment.' }
            ],
            phrases: []
        });

        await expect(apiClient.transcribe(audioBlob, onProgress))
            .resolves.toBe('First segment. Second segment.');

        expect(getFetchOptions().headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
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

    it('rejects unsupported local audio before MAI conversion or fetch', async () => {
        const tokenProvider = createTokenProvider();
        const apiClient = new AzureAPIClient(
            createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5),
            tokenProvider
        );
        const audioFile = new File(['deterministic-placeholder'], 'unsupported.ogg', {
            type: 'audio/ogg'
        });

        await expect(apiClient.transcribe(audioFile)).rejects.toMatchObject({
            code: AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE
        });
        expect(convertToWav).not.toHaveBeenCalled();
        expect(tokenProvider.getToken).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('accepts MAI audio at the strict less-than-300-MB boundary after conversion', async () => {
        const apiClient = createApiClient(createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5));
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

    it('rejects an oversized MAI WAV before token acquisition and request construction', async () => {
        const tokenProvider = createTokenProvider();
        const apiClient = new AzureAPIClient(
            createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5),
            tokenProvider
        );
        const sourceBlob = createBlobWithStubbedSize(1);
        const oversizedWavBlob = createBlobWithStubbedSize(
            MAI_TRANSCRIBE_MAX_UPLOAD_BYTES + 1,
            'audio/wav'
        );
        convertToWav.mockResolvedValueOnce(oversizedWavBlob);

        await expect(apiClient.transcribe(sourceBlob)).rejects.toMatchObject({
            code: AUDIO_UPLOAD_LIMIT_ERROR_CODE,
            retryable: false,
            message: formatAudioUploadLimitMessage('Azure MAI-Transcribe 1.5', 'under 300 MB')
        });

        expect(convertToWav).toHaveBeenCalledWith(sourceBlob);
        expect(globalThis.FormData).not.toHaveBeenCalled();
        expect(tokenProvider.getToken).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
