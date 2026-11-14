/**
 * @fileoverview A microphone recording for a model with the Recording Pieces
 * capability is cut into Recording Pieces from the uncompressed capture and
 * sent while the User speaks, and falls back to today's whole-file path when a
 * piece fails.
 *
 * The real AudioHandler, AzureAPIClient, MAI adapters and capture run here;
 * only the browser edges are fakes: the microphone, MediaRecorder, the audio
 * worklet, the whole-file converter and fetch.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    BACKGROUND_SENDING_STATES,
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

/** A piece response; each word is [text, offset from the start of its piece, duration]. */
const piece = (...words) => ({
    combinedPhrases: [{ text: words.map(([text]) => text).join(' ') }],
    phrases: [{
        text: words.map(([text]) => text).join(' '),
        words: words.map(([text, offsetMilliseconds, durationMilliseconds]) => ({
            text, offsetMilliseconds, durationMilliseconds
        }))
    }]
});
// Cuts fall at 60 s and 120 s; the second piece starts at 59.25 s and the third at 119.25 s.
// "three" is heard by both of the first two pieces and its midpoint is just past the first cut.
const FIRST_PIECE = piece(['One,', 1_000, 400], ['two', 59_000, 400], ['three', 60_100, 400]);
const SECOND_PIECE = piece(['three', 850, 400], ['four.', 30_000, 400]);
const FINAL_PIECE = piece(['Five.', 2_000, 400]);

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

describe('sending a microphone recording in Recording Pieces', () => {
    let audio;
    let audioHandler;
    let config;
    let recorderHandlers;
    let emitted;

    const eventsOf = (name) => emitted.filter(([event]) => event === name).map(([, data]) => data);
    const statusMessages = () => eventsOf(APP_EVENTS.UI_STATUS_UPDATE).map(data => data.message);
    const transcriptsShown = () => eventsOf(APP_EVENTS.UI_TRANSCRIPTION_READY).map(data => data.text);
    const partialTranscripts = () => eventsOf(APP_EVENTS.UI_PARTIAL_TRANSCRIPT_CHANGED).map(data => data.text);
    const sendingState = () => audioHandler.pieceSender.getState();
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const speakSeconds = async (count) => {
        audio.speak(new Float32Array(count * 16000).fill(0.25));
        await flush();
    };

    /** Holds every upload until the test replies to it, as a slow network would. */
    let uploads;
    function holdUploads() {
        uploads = [];
        globalThis.fetch.mockImplementation((_uri, request) => new Promise((resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
            uploads.push({
                request,
                reply: async (data) => { resolve(respond(200, data)); await flush(); },
                fail: async () => { resolve(respond(400, { error: { message: 'Rejected' } })); await flush(); }
            });
        }));
    }
    const uploadedSeconds = async (index) =>
        (await readWav(uploads[index].request.body.get('audio'))).samples.length / 16000;
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
        expect(audio.contexts[0].state).toBe('suspended');
    });

    it('starts the capture before the recorder, so no speech is missing from it', async () => {
        await startRecording();

        expect(audio.contexts[0].resume.mock.invocationCallOrder[0])
            .toBeLessThan(globalThis.MediaRecorder.mock.invocationCallOrder[0]);
    });

    it('sends the whole recording when the capture stopped partway, instead of half a transcript', async () => {
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        audio.speak(new Array(16000).fill(0.25));
        audio.passTime(20_000);
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(sentDefinition(0).enhancedMode.modelOptions).toEqual({ transcribeStyle: 'clean' });
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
        expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
    });

    it('records on the whole-file path, showing nothing, when the browser will not let the capture run', async () => {
        audio.refuseResume = true;
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        audio.speak([0.5]);
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
        expect(eventsOf(APP_EVENTS.ERROR_OCCURRED)).toEqual([]);
        expect(statusMessages().filter(message => /capture|piece/i.test(message))).toEqual([]);
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
        // Happy DOM would otherwise navigate the test window to the blob: address.
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        expect(audioHandler.downloadUnsentRecording()).toBe(true);
        expect(createObjectURL.mock.calls[0][0].type).toBe('audio/webm');
        expect(click).toHaveBeenCalledTimes(1);

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

    it('sends the whole recording when the capture heard nothing, rather than an empty piece', async () => {
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(sentDefinition(0).enhancedMode.modelOptions).toEqual({ transcribeStyle: 'clean' });
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
        expect(audio.nodes[0].source).toBeNull();
        expect(audio.contexts[0].state).toBe('suspended');
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
    });

    it('sends the whole recording to the newly selected model when the User switches away from MAI-Transcribe 2 mid-recording', async () => {
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        audio.speak([0.5]);
        config.model = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        await finishRecording();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(sentDefinition(0).enhancedMode.model).toBe('mai-transcribe-1.5');
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
        expect(audio.nodes[0].source).toBeNull();
    });

    it('keeps MAI-Transcribe 1.5 on the whole-file path with no uncompressed capture', async () => {
        config.model = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        globalThis.fetch.mockResolvedValueOnce(respond(200, WHOLE_RESPONSE));

        await startRecording();
        await finishRecording();

        expect(audio.contexts[0].resume).not.toHaveBeenCalled();
        expect(audio.nodes[0].source).toBeNull();
        expect(convertToWav).toHaveBeenCalledTimes(1);
        expect(transcriptsShown()).toEqual(['Whole recording text.']);
    });

    describe('while the User speaks', () => {
        beforeEach(() => holdUploads());

        it('cuts a piece every 60 seconds of recorded audio and sends them one at a time, in order', async () => {
            await startRecording();
            await speakSeconds(60);
            expect(uploads).toHaveLength(0);

            await speakSeconds(1);
            expect(uploads).toHaveLength(1);
            expect(await uploadedSeconds(0)).toBe(60.75);
            expect(uploads[0].request.headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
            expect(JSON.parse(uploads[0].request.body.get('definition')).enhancedMode.modelOptions)
                .toEqual({ transcribeStyle: 'clean', timestamps: 'word' });

            // The second piece is cut while the first is still being sent, and waits for it.
            await speakSeconds(60);
            expect(uploads).toHaveLength(1);
            await uploads[0].reply(FIRST_PIECE);
            expect(uploads).toHaveLength(2);
            expect(await uploadedSeconds(1)).toBe(61.5);

            expect(convertToWav).not.toHaveBeenCalled();
            expect(statusMessages()).toEqual([MESSAGES.INITIALIZING_MICROPHONE, MESSAGES.RECORDING_IN_PROGRESS]);
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
        });

        it('shows, after each piece comes back, the joined text of the pieces so far, without announcing it as ready', async () => {
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);
            expect(partialTranscripts()).toEqual(['One, two three']);

            await speakSeconds(60);
            await uploads[1].reply(SECOND_PIECE);
            // "three" is now taken from the second piece only, where its midpoint lies.
            expect(partialTranscripts()).toEqual(['One, two three', 'One, two three four.']);

            expect(transcriptsShown()).toEqual([]);
            expect(statusMessages()).not.toContain(MESSAGES.TRANSCRIPTION_COMPLETE);
        });

        it('at Finish sends only the final piece, cut at once, shows a finishing status, and announces the transcript once', async () => {
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);
            await speakSeconds(60);
            await uploads[1].reply(SECOND_PIECE);
            await speakSeconds(5);

            const finishing = finishRecording();
            await vi.waitFor(() => expect(uploads).toHaveLength(3));
            expect(await uploadedSeconds(2)).toBe(6.75);
            expect(statusMessages().at(-1)).toBe(MESSAGES.FINISHING_TRANSCRIPT);
            expect(transcriptsShown()).toEqual([]);

            await uploads[2].reply(FINAL_PIECE);
            await finishing;

            expect(transcriptsShown()).toEqual(['One, two three four. Five.']);
            expect(statusMessages().filter(message => message === MESSAGES.TRANSCRIPTION_COMPLETE)).toHaveLength(1);
            expect(statusMessages()).not.toContain(MESSAGES.CONVERTING_AUDIO);
            expect(convertToWav).not.toHaveBeenCalled();
            expect(globalThis.fetch).toHaveBeenCalledTimes(3);
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
            expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
        });

        it('rule 3: calls the transcript complete only when every piece is in it', async () => {
            await startRecording();
            await speakSeconds(61);
            const finishing = finishRecording();
            await flush();

            // The first piece is still out, so the final piece waits behind it.
            expect(uploads).toHaveLength(1);
            expect(transcriptsShown()).toEqual([]);
            await uploads[0].reply(FIRST_PIECE);
            expect(uploads).toHaveLength(2);
            expect(transcriptsShown()).toEqual([]);
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.PROCESSING);

            await uploads[1].reply(SECOND_PIECE);
            await finishing;
            expect(transcriptsShown()).toEqual(['One, two three four.']);
        });

        it('rule 5: never reports background sending as caught up while a piece is outstanding', async () => {
            await startRecording();
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.NOTHING_TO_SEND);
            await speakSeconds(61);
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.SENDING_PIECE);
            await speakSeconds(60);

            await uploads[0].reply(FIRST_PIECE);
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.SENDING_PIECE);

            await uploads[1].reply(SECOND_PIECE);
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.CAUGHT_UP);
        });

        it('rule 1: nothing is being sent whenever the app is ready for a new recording', async () => {
            const sendingWhenReady = [];
            eventBus.on(APP_EVENTS.RECORDING_STATE_CHANGED, ({ newState }) => {
                if (newState === RECORDING_STATES.IDLE) sendingWhenReady.push(sendingState());
            });

            // Finished in pieces.
            await startRecording();
            await speakSeconds(61);
            let finishing = finishRecording();
            await uploads[0].reply(FIRST_PIECE);
            await uploads[1].reply(FINAL_PIECE);
            await finishing;

            // Discarded with a piece in flight.
            await startRecording();
            await speakSeconds(61);
            await audioHandler.requestDiscard();
            await audioHandler.confirmDiscard();
            await Promise.all(recorderHandlers.stop.slice(-1).map(handler => handler()));

            // Finished through the whole recording after a failed piece.
            await startRecording();
            await speakSeconds(61);
            await uploads[3].fail();
            finishing = finishRecording();
            await vi.waitFor(() => expect(uploads).toHaveLength(5));
            await uploads[4].reply(WHOLE_RESPONSE);
            await finishing;

            expect(sendingWhenReady).toEqual([
                BACKGROUND_SENDING_STATES.NOTHING_TO_SEND,
                BACKGROUND_SENDING_STATES.NOTHING_TO_SEND,
                BACKGROUND_SENDING_STATES.NOTHING_TO_SEND
            ]);
        });

        it('stops cutting and sending after a failed piece, keeps recording without a word, and at Finish sends the whole recording', async () => {
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);
            await speakSeconds(60);
            await uploads[1].fail();

            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.PIECES_STOPPED);
            await speakSeconds(120);
            expect(uploads).toHaveLength(2);
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
            expect(statusMessages()).toEqual([MESSAGES.INITIALIZING_MICROPHONE, MESSAGES.RECORDING_IN_PROGRESS]);
            expect(eventsOf(APP_EVENTS.ERROR_OCCURRED)).toEqual([]);
            expect(eventsOf(APP_EVENTS.API_REQUEST_ERROR)).toEqual([]);
            expect(audio.nodes[0].source).toBeNull();

            const finishing = finishRecording();
            await vi.waitFor(() => expect(uploads).toHaveLength(3));
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.SENDING_WHOLE_RECORDING);
            expect(await uploads[2].request.body.get('audio').text()).toBe('converted whole recording');
            expect(statusMessages()).not.toContain(MESSAGES.FINISHING_TRANSCRIPT);
            await uploads[2].reply(WHOLE_RESPONSE);
            await finishing;

            // The whole recording's text replaces the Partial Transcript.
            expect(partialTranscripts()).toEqual(['One, two three']);
            expect(transcriptsShown()).toEqual(['Whole recording text.']);
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
        });

        it('sends the whole recording when the final piece fails', async () => {
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);
            await speakSeconds(5);

            const finishing = finishRecording();
            await vi.waitFor(() => expect(uploads).toHaveLength(2));
            await uploads[1].fail();
            await vi.waitFor(() => expect(uploads).toHaveLength(3));
            await uploads[2].reply(WHOLE_RESPONSE);
            await finishing;

            expect(convertToWav).toHaveBeenCalledTimes(1);
            expect(transcriptsShown()).toEqual(['Whole recording text.']);
        });

        it('confirming a discard aborts the upload in flight and removes every piece and the Partial Transcript', async () => {
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);
            await speakSeconds(60);
            expect(uploads[1].request.signal.aborted).toBe(false);

            audioHandler.currentTimerDisplay = '02:01';
            await audioHandler.requestDiscard();
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.CONFIRMING_DISCARD);
            eventBus.emit(APP_EVENTS.DISCARD_CONFIRMED);
            await vi.waitFor(() => expect(recorderHandlers.stop).toHaveLength(1));
            await Promise.all(recorderHandlers.stop.map(handler => handler()));
            await flush();

            expect(uploads[1].request.signal.aborted).toBe(true);
            expect(partialTranscripts()).toEqual(['One, two three', '']);
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.NOTHING_TO_SEND);
            expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
            expect(transcriptsShown()).toEqual([]);
            expect(statusMessages()).not.toContain(MESSAGES.TRANSCRIPTION_COMPLETE);
            expect(eventsOf(APP_EVENTS.API_REQUEST_ERROR)).toEqual([]);
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);

            // The next recording starts with nothing left over.
            await startRecording();
            await speakSeconds(61);
            await uploads[2].reply(SECOND_PIECE);
            expect(partialTranscripts().at(-1)).toBe('three four.');
        });

        it('a discard during a retry backoff sends nothing more', async () => {
            vi.spyOn(audioHandler.apiClient, '_sleep').mockReturnValue(new Promise(() => {}));
            globalThis.fetch.mockResolvedValueOnce(respond(503, { error: { message: 'Busy' } }));

            await startRecording();
            await speakSeconds(61);
            await vi.waitFor(() => expect(audioHandler.apiClient._sleep).toHaveBeenCalledTimes(1));

            await audioHandler.cancelRecording();
            await Promise.all(recorderHandlers.stop.map(handler => handler()));
            await flush();

            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            expect(sendingState()).toBe(BACKGROUND_SENDING_STATES.NOTHING_TO_SEND);
            expect(statusMessages().filter(message => /retrying/i.test(message))).toEqual([]);
        });

        it('removes the Partial Transcript when an Unsent Recording is discarded', async () => {
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);

            const finishing = finishRecording();
            await vi.waitFor(() => expect(uploads).toHaveLength(2));
            await uploads[1].fail();
            await vi.waitFor(() => expect(uploads).toHaveLength(3));
            await uploads[2].fail();
            await finishing;
            expect(audioHandler.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.UNSENT);
            expect(partialTranscripts()).toEqual(['One, two three']);

            expect(audioHandler.discardUnsentRecording()).toBe(true);

            expect(partialTranscripts()).toEqual(['One, two three', '']);
        });

        it('keeps piece audio and word lists out of events, logs and storage', async () => {
            const { logger } = await import('../js/logger.js');
            const setItem = vi.spyOn(Storage.prototype, 'setItem');
            await startRecording();
            await speakSeconds(61);
            await uploads[0].reply(FIRST_PIECE);
            const finishing = finishRecording();
            await vi.waitFor(() => expect(uploads).toHaveLength(2));
            await uploads[1].reply(FINAL_PIECE);
            await finishing;

            const leaks = (value) => value instanceof Blob
                || ArrayBuffer.isView(value)
                || (Array.isArray(value) && value.some(leaks))
                || (value !== null && typeof value === 'object' && Object.values(value).some(leaks))
                || (typeof value === 'string' && /offsetMs|durationMs|offsetMilliseconds/.test(value));
            expect(emitted.filter(([, data]) => leaks(data))).toEqual([]);
            expect(setItem).not.toHaveBeenCalled();
            const logged = Object.values(logger.child()).flatMap(spy => spy.mock.calls);
            expect(logged.filter(leaks)).toEqual([]);
            expect(JSON.stringify(logged)).not.toMatch(/One,|Five\./);
        });
    });
});
