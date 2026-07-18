/**
 * @fileoverview Memory ownership and local validation for Selected Audio.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    API_ERROR_CODES,
    AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    MODEL_TYPES,
    SELECTED_AUDIO_STATES,
    WHISPER_MAX_UPLOAD_BYTES
} from '../js/constants.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import {
    readSelectedAudioDuration,
    SelectedAudioController
} from '../js/selected-audio-controller.js';

function createFile({
    name = 'deterministic.wav',
    type = 'audio/wav',
    size = 16
} = {}) {
    const file = new File(['deterministic-test-placeholder'], name, { type });
    Object.defineProperty(file, 'size', { configurable: true, value: size });
    return file;
}

function createHarness({
    model = MODEL_TYPES.WHISPER,
    authState = AUTHENTICATION_STATES.READY,
    readinessState = authState,
    audioSafetyState = AUDIO_SAFETY_STATES.SAFE,
    duration = 12.5,
    durationReader: injectedDurationReader = null
} = {}) {
    let currentModel = model;
    const settings = {
        getCurrentModel: vi.fn(() => currentModel)
    };
    const authenticationReadiness = {
        getState: vi.fn(() => authState),
        ensureTokenReady: vi.fn().mockResolvedValue(readinessState)
    };
    const apiClient = {
        getScopeForModel: vi.fn(() => 'https://scope.invalid/.default'),
        transcribe: vi.fn().mockResolvedValue('Deterministic transcript')
    };
    const recordingSafety = {
        getAudioSafetyState: vi.fn(() => audioSafetyState)
    };
    const durationReader = injectedDurationReader || vi.fn().mockResolvedValue(duration);
    const controller = new SelectedAudioController({
        settings,
        authenticationReadiness,
        apiClient,
        recordingSafety,
        durationReader
    });

    return {
        controller,
        settings,
        authenticationReadiness,
        apiClient,
        recordingSafety,
        durationReader,
        setModel(nextModel) {
            currentModel = nextModel;
        }
    };
}

function serializedHistory() {
    return JSON.stringify(eventBus.getHistory());
}

describe('SelectedAudioController memory-only state and validation', () => {
    beforeEach(() => {
        eventBus.clear();
        eventBus.setHistoryEnabled(true);
        vi.clearAllMocks();
    });

    it('moves checking to ready with a metadata-only snapshot and no Azure request', async () => {
        const { controller, apiClient, durationReader } = createHarness();
        const file = createFile({ name: 'safe-display.wav', size: 1_536 });
        const observedStates = [];
        eventBus.on(APP_EVENTS.SELECTED_AUDIO_STATE_CHANGED, ({ state }) => {
            observedStates.push(state);
        });

        await expect(controller.select(file)).resolves.toBe(true);

        expect(observedStates).toEqual([
            SELECTED_AUDIO_STATES.CHECKING,
            SELECTED_AUDIO_STATES.READY
        ]);
        expect(controller.getSnapshot()).toEqual({
            state: SELECTED_AUDIO_STATES.READY,
            name: 'safe-display.wav',
            size: 1_536,
            duration: 12.5,
            format: 'WAV',
            model: MODEL_TYPES.WHISPER
        });
        expect(Object.values(controller.getSnapshot())).not.toContain(file);
        expect(durationReader).toHaveBeenCalledWith(file, {
            signal: expect.any(AbortSignal)
        });
        expect(apiClient.transcribe).not.toHaveBeenCalled();
        expect(serializedHistory()).not.toContain('deterministic-test-placeholder');
        expect(eventBus.getHistory().some(({ data }) => data?.file instanceof File)).toBe(false);
    });

    it('does not read or write browser storage while selecting or removing audio', async () => {
        const getItem = vi.spyOn(localStorage, 'getItem');
        const setItem = vi.spyOn(localStorage, 'setItem');
        const { controller } = createHarness();

        await controller.select(createFile());
        expect(controller.remove()).toBe(true);

        expect(getItem).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
        expect(controller.getSnapshot()).toEqual({ state: SELECTED_AUDIO_STATES.IDLE });
    });

    it.each([
        ['clip.mp3', 'audio/mp3', 'MP3'],
        ['clip.mp4', 'audio/mp4; codecs=mp4a.40.2', 'MP4'],
        ['clip.mpeg', 'audio/mpeg', 'MPEG'],
        ['clip.mpga', 'audio/mpga', 'MPGA'],
        ['clip.m4a', 'audio/x-m4a', 'M4A'],
        ['clip.wav', 'audio/wave', 'WAV'],
        ['clip.webm', 'audio/webm; codecs=opus', 'WebM'],
        ['fallback.mp3', '', 'MP3']
    ])('accepts supported local format %s', async (name, type, expectedFormat) => {
        const { controller } = createHarness();

        await expect(controller.select(createFile({ name, type }))).resolves.toBe(true);

        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.READY,
            format: expectedFormat
        });
    });

    it('does not trust a supported extension over a present unsupported MIME type', async () => {
        const { controller, durationReader } = createHarness();

        await expect(controller.select(createFile({
            name: 'conflict.wav',
            type: 'audio/ogg'
        }))).resolves.toBe(false);

        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.UNSUPPORTED,
            name: 'conflict.wav'
        });
        expect(durationReader).not.toHaveBeenCalled();
    });

    it.each([
        ['empty audio', { size: 0 }],
        ['unknown empty-MIME extension', { name: 'unknown.bin', type: '' }],
        ['unsupported MIME', { name: 'unknown.ogg', type: 'audio/ogg' }]
    ])('rejects %s locally without reading duration', async (_caseName, fileOptions) => {
        const { controller, apiClient, durationReader } = createHarness();

        await expect(controller.select(createFile(fileOptions))).resolves.toBe(false);

        expect(controller.getSnapshot().state).toBe(SELECTED_AUDIO_STATES.UNSUPPORTED);
        expect(durationReader).not.toHaveBeenCalled();
        expect(apiClient.transcribe).not.toHaveBeenCalled();
    });

    it('accepts the Whisper 25 MB boundary and rejects the first byte above it', async () => {
        const accepted = createHarness();
        await expect(accepted.controller.select(createFile({
            size: WHISPER_MAX_UPLOAD_BYTES
        }))).resolves.toBe(true);
        expect(accepted.controller.getSnapshot().state).toBe(SELECTED_AUDIO_STATES.READY);

        const rejected = createHarness();
        await expect(rejected.controller.select(createFile({
            size: WHISPER_MAX_UPLOAD_BYTES + 1
        }))).resolves.toBe(false);
        expect(rejected.controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.TOO_LARGE,
            size: WHISPER_MAX_UPLOAD_BYTES + 1,
            model: MODEL_TYPES.WHISPER
        });
        expect(rejected.durationReader).not.toHaveBeenCalled();
        expect(rejected.apiClient.transcribe).not.toHaveBeenCalled();
    });

    it.each([
        ['authentication is not ready', { authState: AUTHENTICATION_STATES.SIGNED_OUT }],
        ['a recording is active', { audioSafetyState: AUDIO_SAFETY_STATES.ACTIVE }],
        ['an Unsent Recording exists', { audioSafetyState: AUDIO_SAFETY_STATES.UNSENT }]
    ])('refuses selection when %s', async (_caseName, harnessOptions) => {
        const { controller, durationReader } = createHarness(harnessOptions);

        await expect(controller.select(createFile())).resolves.toBe(false);

        expect(controller.getSnapshot()).toEqual({ state: SELECTED_AUDIO_STATES.IDLE });
        expect(durationReader).not.toHaveBeenCalled();
    });

    it('keeps duration unavailable honest instead of hanging or rejecting the file', async () => {
        const { controller } = createHarness({ duration: null });

        await expect(controller.select(createFile())).resolves.toBe(true);

        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.READY,
            duration: null
        });
    });

    it('releases the prior File when Choose another replaces it', async () => {
        const { controller, apiClient } = createHarness();
        const first = createFile({ name: 'first.wav' });
        const replacement = createFile({ name: 'replacement.mp3', type: 'audio/mp3' });
        await controller.select(first);

        await expect(controller.replace(replacement)).resolves.toBe(true);
        await controller.transcribe();

        expect(apiClient.transcribe).toHaveBeenCalledOnce();
        expect(apiClient.transcribe.mock.calls[0][0]).toBe(replacement);
        expect(apiClient.transcribe.mock.calls[0][0]).not.toBe(first);
    });
});

describe('Selected Audio duration metadata cleanup', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function createAudioElement() {
        const audio = new EventTarget();
        audio.duration = 8.25;
        audio.load = vi.fn();
        audio.removeAttribute = vi.fn();
        return audio;
    }

    function installBrowserMetadataStubs(audio, revokeObjectURL) {
        vi.spyOn(document, 'createElement').mockReturnValue(audio);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:short-lived');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
    }

    it('revokes its short-lived object URL after metadata succeeds', async () => {
        const audio = createAudioElement();
        const revokeObjectURL = vi.fn();
        installBrowserMetadataStubs(audio, revokeObjectURL);
        const result = readSelectedAudioDuration(createFile());

        audio.onloadedmetadata();

        await expect(result).resolves.toBe(8.25);
        expect(revokeObjectURL).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:short-lived');
        expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    });

    it.each(['error', 'timeout'])('revokes its object URL and returns unavailable on %s', async (outcome) => {
        vi.useFakeTimers();
        const audio = createAudioElement();
        const revokeObjectURL = vi.fn();
        installBrowserMetadataStubs(audio, revokeObjectURL);
        const result = readSelectedAudioDuration(createFile());

        if (outcome === 'error') audio.onerror();
        else await vi.advanceTimersByTimeAsync(5_000);

        await expect(result).resolves.toBeNull();
        expect(revokeObjectURL).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it('revokes its object URL when the browser rejects media source assignment', async () => {
        const audio = createAudioElement();
        Object.defineProperty(audio, 'src', {
            set() {
                throw new Error('Media source unavailable');
            }
        });
        const revokeObjectURL = vi.fn();
        installBrowserMetadataStubs(audio, revokeObjectURL);

        await expect(readSelectedAudioDuration(createFile())).resolves.toBeNull();
        expect(revokeObjectURL).toHaveBeenCalledOnce();
    });

    it('revokes its object URL immediately when Selected Audio is removed during metadata loading', async () => {
        const audio = createAudioElement();
        const revokeObjectURL = vi.fn();
        installBrowserMetadataStubs(audio, revokeObjectURL);
        const durationReader = (file, { signal }) => readSelectedAudioDuration(file, { signal });
        const { controller } = createHarness({ durationReader });

        const selecting = controller.select(createFile());
        expect(controller.remove()).toBe(true);

        await expect(selecting).resolves.toBe(false);
        expect(revokeObjectURL).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:short-lived');
    });
});

describe('SelectedAudioController explicit transcription lifecycle', () => {
    beforeEach(() => {
        eventBus.clear();
        eventBus.setHistoryEnabled(true);
        vi.clearAllMocks();
    });

    it('submits exactly once only after explicit Transcribe and uses the shared completion path', async () => {
        const { controller, apiClient, authenticationReadiness } = createHarness();
        const file = createFile();
        const transcriptionEvents = [];
        const statusEvents = [];
        eventBus.on(APP_EVENTS.UI_TRANSCRIPTION_READY, data => transcriptionEvents.push(data));
        eventBus.on(APP_EVENTS.UI_STATUS_UPDATE, data => statusEvents.push(data));

        await controller.select(file);
        expect(apiClient.transcribe).not.toHaveBeenCalled();

        await expect(controller.transcribe()).resolves.toBe(true);

        expect(authenticationReadiness.ensureTokenReady).toHaveBeenCalledOnce();
        expect(apiClient.transcribe).toHaveBeenCalledOnce();
        expect(apiClient.transcribe.mock.calls[0][0]).toBe(file);
        expect(transcriptionEvents).toEqual([{ text: 'Deterministic transcript' }]);
        expect(statusEvents).toContainEqual(expect.objectContaining({
            message: 'Transcription complete',
            type: 'success'
        }));
        expect(controller.getSnapshot()).toEqual({ state: SELECTED_AUDIO_STATES.IDLE });
        expect(controller.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
    });

    it('retains the same File after an Azure failure and Retry does not add another retry loop', async () => {
        const { controller, apiClient } = createHarness();
        const file = createFile();
        apiClient.transcribe
            .mockRejectedValueOnce(new Error('Service unavailable'))
            .mockResolvedValueOnce('Recovered transcript');
        await controller.select(file);

        await expect(controller.transcribe()).resolves.toBe(false);
        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.FAILED,
            errorMessage: 'Service unavailable'
        });
        expect(controller.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SELECTED);

        await expect(controller.transcribe()).resolves.toBe(true);
        expect(apiClient.transcribe).toHaveBeenCalledTimes(2);
        expect(apiClient.transcribe.mock.calls[0][0]).toBe(file);
        expect(apiClient.transcribe.mock.calls[1][0]).toBe(file);
    });

    it.each([
        [AUDIO_UPLOAD_LIMIT_ERROR_CODE, SELECTED_AUDIO_STATES.TOO_LARGE],
        [AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE, SELECTED_AUDIO_STATES.UNSUPPORTED]
    ])('maps adapter validation %s back to local review with no release', async (code, expectedState) => {
        const { controller, apiClient } = createHarness({ model: MODEL_TYPES.MAI_TRANSCRIBE_1_5 });
        const error = new Error('Local adapter validation failed');
        error.code = code;
        apiClient.transcribe.mockRejectedValue(error);
        await controller.select(createFile());

        await expect(controller.transcribe()).resolves.toBe(false);

        expect(controller.getSnapshot().state).toBe(expectedState);
        expect(controller.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SELECTED);
    });

    it('retains Selected Audio and enters auth recovery when readiness requires interaction', async () => {
        const { controller, apiClient } = createHarness({
            readinessState: AUTHENTICATION_STATES.INTERACTION_REQUIRED
        });
        const authEvents = [];
        eventBus.on(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, data => authEvents.push(data));
        await controller.select(createFile());

        await expect(controller.transcribe()).resolves.toBe(false);

        expect(apiClient.transcribe).not.toHaveBeenCalled();
        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.FAILED,
            errorCode: API_ERROR_CODES.AUTHENTICATION_REQUIRED
        });
        expect(controller.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SELECTED);
        expect(authEvents).toEqual([{ state: AUTHENTICATION_STATES.INTERACTION_REQUIRED }]);
    });

    it('revalidates a retained File on model change without sending it', async () => {
        const harness = createHarness({ model: MODEL_TYPES.MAI_TRANSCRIBE_1_5 });
        await harness.controller.select(createFile({ size: WHISPER_MAX_UPLOAD_BYTES + 1 }));
        expect(harness.controller.getSnapshot().state).toBe(SELECTED_AUDIO_STATES.READY);

        harness.setModel(MODEL_TYPES.WHISPER);
        eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, { model: MODEL_TYPES.WHISPER });
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.TOO_LARGE,
            model: MODEL_TYPES.WHISPER
        });
        expect(harness.apiClient.transcribe).not.toHaveBeenCalled();
    });

    it('does not send against a model that changes while readiness is being established', async () => {
        let resolveReadiness;
        const harness = createHarness();
        harness.authenticationReadiness.ensureTokenReady.mockReturnValue(new Promise(resolve => {
            resolveReadiness = resolve;
        }));
        await harness.controller.select(createFile());

        const transcribing = harness.controller.transcribe();
        harness.setModel(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        resolveReadiness(AUTHENTICATION_STATES.READY);
        await expect(transcribing).resolves.toBe(false);

        expect(harness.apiClient.transcribe).not.toHaveBeenCalled();
        expect(harness.controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.READY,
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5
        });
    });
});
