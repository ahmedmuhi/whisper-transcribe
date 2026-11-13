/**
 * @fileoverview A microphone recording for a model with the Recording Pieces
 * capability is sent as one Recording Piece built from the uncompressed
 * capture, and falls back to today's whole-file path when that piece fails.
 *
 * The real AudioHandler, AzureAPIClient, MAI adapters and capture run here;
 * only the browser edges are fakes: the microphone, MediaRecorder, the audio
 * worklet, the whole-file converter and fetch.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_STATES
} from '../js/constants.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { convertToWav } from '../js/audio-converter.js';
import { installFakeWebAudio, readWav, removeFakeWebAudio } from './helpers/fake-web-audio.js';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

vi.mock('../js/logger.js', () => {
    const quiet = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    return { logger: { ...quiet, child: vi.fn(() => quiet) } };
});

vi.mock('../js/audio-converter.js', () => ({
    convertToWav: vi.fn(async () => new Blob(['converted whole recording'], { type: 'audio/wav' }))
}));

const FAKE_TOKEN = 'fake-piece-bearer-token';
const TARGET_URI = 'https://target.invalid/speechtotext/transcriptions:transcribe';

const PIECE_RESPONSE = {
    combinedPhrases: [{ text: 'Hello, world. It is me.' }],
    phrases: [
        {
            text: 'Hello, world.',
            words: [
                { text: 'Hello,', offsetMilliseconds: 0, durationMilliseconds: 400 },
                { text: 'world.', offsetMilliseconds: 450, durationMilliseconds: 400 }
            ]
        },
        {
            text: 'It is me.',
            words: [
                { text: 'It', offsetMilliseconds: 1000, durationMilliseconds: 100 },
                { text: 'is', offsetMilliseconds: 1150, durationMilliseconds: 100 },
                { text: 'me.', offsetMilliseconds: 1300, durationMilliseconds: 200 }
            ]
        }
    ]
};
const WHOLE_RESPONSE = { combinedPhrases: [{ text: 'Whole recording text.' }], phrases: [] };

function respond(status, data) {
    return {
        ok: status < 400,
        status,
        headers: { get: (name) => (/content-type/i.test(name) ? 'application/json' : null) },
        json: async () => data,
        text: async () => JSON.stringify(data)
    };
}

let AudioHandler;
let AzureAPIClient;

beforeAll(async () => {
    ({ AudioHandler } = await import('../js/audio-handler.js'));
    ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('sending a microphone recording as one Recording Piece', () => {
    let audio;
    let audioHandler;
    let config;
    let recorderHandlers;
    let emitted;

    const eventsOf = (name) => emitted.filter(([event]) => event === name).map(([, data]) => data);
    const statusMessages = () => eventsOf(APP_EVENTS.UI_STATUS_UPDATE).map(data => data.message);
    const transcriptsShown = () => eventsOf(APP_EVENTS.UI_TRANSCRIPTION_READY).map(data => data.text);
    const sentForm = (index) => globalThis.fetch.mock.calls[index][1].body;
    const sentDefinition = (index) => JSON.parse(sentForm(index).get('definition'));

    async function startRecording() {
        await audioHandler.toggleRecording();
        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
    }

    async function finishRecording() {
        await audioHandler.toggleRecording();
        recorderHandlers.dataavailable.forEach(handler => handler({
            data: new Blob(['compressed recording'], { type: 'audio/webm' })
        }));
        await Promise.all(recorderHandlers.stop.map(handler => handler()));
    }

    beforeEach(() => {
        applyDomSpies();
        audio = installFakeWebAudio();
        emitted = [];
        vi.spyOn(eventBus, 'emit').mockImplementation(function record(event, data) {
            emitted.push([event, data]);
            return eventBus.constructor.prototype.emit.call(this, event, data);
        });

        recorderHandlers = { dataavailable: [], stop: [], error: [] };
        const recorder = {
            state: 'inactive',
            mimeType: 'audio/webm',
            start: vi.fn(function start() { this.state = 'recording'; }),
            stop: vi.fn(function stop() { this.state = 'inactive'; }),
            pause: vi.fn(),
            resume: vi.fn(),
            addEventListener: vi.fn((event, handler) => recorderHandlers[event].push(handler))
        };
        globalThis.MediaRecorder = vi.fn(function FakeMediaRecorder() { return recorder; });
        Object.defineProperty(globalThis.navigator, 'mediaDevices', {
            value: { getUserMedia: vi.fn() },
            writable: true,
            configurable: true
        });

        config = { model: MODEL_TYPES.MAI_TRANSCRIBE_2, uri: TARGET_URI, transcribeStyle: 'clean' };
        const settings = {
            getModelConfig: vi.fn(() => ({ ...config })),
            openSettingsModal: vi.fn()
        };
        const tokenProvider = { getToken: vi.fn().mockResolvedValue(FAKE_TOKEN) };
        const apiClient = new AzureAPIClient(settings, tokenProvider);
        globalThis.fetch = vi.fn();

        audioHandler = new AudioHandler(apiClient, settings, {
            ensureTokenReady: vi.fn().mockResolvedValue(AUTHENTICATION_STATES.READY)
        });
        vi.spyOn(audioHandler.permissionManager, 'requestMicrophoneAccess').mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }]
        });
    });

    afterEach(() => {
        audioHandler.destroy();
        resetEventBus();
        removeFakeWebAudio();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('sends the uncompressed capture as one WAV asking for word timestamps, with no conversion step', async () => {
        globalThis.fetch.mockResolvedValueOnce(respond(200, PIECE_RESPONSE));

        await startRecording();
        audio.speak([0.5, -0.5]);
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const [uri, request] = globalThis.fetch.mock.calls[0];
        expect(uri).toBe(TARGET_URI);
        expect(request.headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
        expect(await readWav(sentForm(0).get('audio'))).toEqual({
            channels: 1,
            sampleRate: 16000,
            bitDepth: 16,
            samples: [Math.trunc(0.5 * 0x7FFF), -0x4000]
        });
        expect(sentDefinition(0).enhancedMode.modelOptions).toEqual({
            transcribeStyle: 'clean',
            timestamps: 'word'
        });
        expect(convertToWav).not.toHaveBeenCalled();
        expect(statusMessages()).not.toContain(MESSAGES.CONVERTING_AUDIO);
        expect(statusMessages()).toContain(MESSAGES.TRANSCRIPTION_COMPLETE);
        expect(transcriptsShown()).toEqual(['Hello, world. It is me.']);
        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
        expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
        expect(audio.contexts[0].state).toBe('closed');
    });

    it('leaves paused time out of the piece', async () => {
        globalThis.fetch.mockResolvedValueOnce(respond(200, PIECE_RESPONSE));

        await startRecording();
        audio.speak([0.5]);
        await audioHandler.togglePause();
        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.PAUSED);
        audio.speak([0.25, 0.25]);
        await audioHandler.togglePause();
        audio.speak([-0.5]);
        await finishRecording();

        const { samples } = await readWav(sentForm(0).get('audio'));
        expect(samples).toEqual([Math.trunc(0.5 * 0x7FFF), -0x4000]);
    });

    it('sends the whole recording through the conversion path when the piece fails, without reporting the piece', async () => {
        globalThis.fetch
            .mockResolvedValueOnce(respond(400, { error: { message: 'Piece rejected' } }))
            .mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        audio.speak([0.5]);
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(convertToWav.mock.calls[0][0].type).toBe('audio/webm');
        expect(await sentForm(1).get('audio').text()).toBe('converted whole recording');
        expect(sentDefinition(1).enhancedMode.modelOptions).toEqual({ transcribeStyle: 'clean' });
        expect(statusMessages()).toContain(MESSAGES.CONVERTING_AUDIO);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
        expect(eventsOf(APP_EVENTS.ERROR_OCCURRED)).toEqual([]);
        expect(eventsOf(APP_EVENTS.API_REQUEST_ERROR)).toEqual([]);
        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });

    it('keeps an Unsent Recording when the whole recording also fails, and Download and Retry work on it', async () => {
        globalThis.fetch
            .mockResolvedValueOnce(respond(400, { error: { message: 'Piece rejected' } }))
            .mockResolvedValueOnce(respond(400, { error: { message: 'Whole rejected' } }))
            .mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        audio.speak([0.5]);
        await finishRecording();

        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
        expect(eventsOf(APP_EVENTS.RECORDING_STATE_CHANGED).at(-1)).toMatchObject({
            newState: RECORDING_STATES.ERROR,
            canRetry: true
        });
        expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.UNSENT);
        expect(transcriptsShown()).toEqual([]);

        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:unsent');
        expect(audioHandler.downloadUnsentRecording()).toBe(true);
        expect(createObjectURL.mock.calls[0][0].type).toBe('audio/webm');

        eventBus.emit(APP_EVENTS.RETRY_BUTTON_CLICKED);
        await vi.waitFor(() => expect(transcriptsShown()).toEqual(['Whole recording text.']));

        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        expect(sentDefinition(2).enhancedMode.modelOptions).toEqual({ transcribeStyle: 'clean' });
        expect(convertToWav).toHaveBeenCalledTimes(2);
        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
        expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
    });

    it('records on the whole-file path when the browser cannot run the capture', async () => {
        audio.addModuleError = new Error('Audio worklets are unavailable');
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
    });

    it('releases the uncompressed capture and sends nothing when a discard is confirmed', async () => {
        await startRecording();
        audio.speak([0.5]);
        audioHandler.currentTimerDisplay = '00:30';
        await audioHandler.requestDiscard();
        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.CONFIRMING_DISCARD);

        eventBus.emit(APP_EVENTS.DISCARD_CONFIRMED);
        await vi.waitFor(() => expect(recorderHandlers.stop).toHaveLength(1));
        await Promise.all(recorderHandlers.stop.map(handler => handler()));

        expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
        expect(audio.contexts[0].state).toBe('closed');
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
    });

    it('keeps MAI-Transcribe 1.5 on the whole-file path with no uncompressed capture', async () => {
        config.model = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        await finishRecording();

        expect(audio.contexts).toEqual([]);
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
    });
});
