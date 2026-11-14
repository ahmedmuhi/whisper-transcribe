/**
 * @fileoverview The uncompressed capture a Recording Piece is built from.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    RECORDING_PIECE_SAMPLE_RATE,
    RECORDING_PIECE_SHORTFALL_TOLERANCE_MS,
    RECORDING_PIECE_TUNABLES
} from '../js/constants.js';
import { preparePcmCapture } from '../js/pcm-capture.js';
import { installFakeWebAudio, readWav, removeFakeWebAudio } from './helpers/fake-web-audio.js';

const STREAM = { id: 'fake-microphone-stream' };
const ONE_SECOND = RECORDING_PIECE_SAMPLE_RATE;
const seconds = (count, value = 0.25) => new Array(Math.round(count * ONE_SECOND)).fill(value);

describe('uncompressed microphone capture', () => {
    let audio;

    beforeEach(() => {
        audio = installFakeWebAudio();
    });

    afterEach(() => {
        removeFakeWebAudio();
        vi.restoreAllMocks();
    });

    it('is prepared before any recording, suspended, with its processor loaded from the same-origin module file', async () => {
        const capture = preparePcmCapture();
        await vi.waitFor(() => expect(audio.nodes).toHaveLength(1));

        const [context] = audio.contexts;
        expect(context.sampleRate).toBe(RECORDING_PIECE_SAMPLE_RATE);
        expect(context.state).toBe('suspended');
        expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        // A blob: or data: worklet module is refused by a `script-src 'self'` policy.
        const { protocol, pathname } = new URL(String(context.audioWorklet.addModule.mock.calls[0][0]));
        expect(['blob:', 'data:']).not.toContain(protocol);
        expect(pathname).toMatch(/\/js\/pcm-capture\.worklet\.js$/);

        await expect(capture.start(STREAM)).resolves.toBe(true);
        expect(context.state).toBe('running');
        expect(audio.nodes[0].source.stream).toBe(STREAM);
    });

    it('returns what it heard as 16 kHz mono 16-bit WAV, and suspends again', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);
        audio.speak([0, 1]);
        audio.speak([-1]);

        const wav = await readWav((await capture.finish()).audio);

        expect(wav).toEqual({
            channels: 1,
            sampleRate: 16000,
            bitDepth: 16,
            samples: [0, 0x7FFF, -0x8000]
        });
        expect(audio.contexts[0].state).toBe('suspended');
        expect(audio.nodes[0].source).toBeNull();
    });

    it('serves the next recording from the same prepared context, with none of the last one', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);
        audio.speak([0.5]);
        await capture.finish();

        await capture.start(STREAM);
        audio.speak([-0.5]);
        const { samples } = await readWav((await capture.finish()).audio);

        expect(samples).toEqual([-0x4000]);
        expect(audio.contexts).toHaveLength(1);
    });

    it('leaves paused time out of both the audio and the recorded time', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);
        audio.speak([0.5]);
        capture.pause();
        audio.speak(seconds(5));
        capture.resume();
        audio.speak([-0.5]);

        const { samples } = await readWav((await capture.finish()).audio);

        expect(samples).toEqual([Math.trunc(0.5 * 0x7FFF), -0x4000]);
    });

    it('accepts a long recording across pause and resume when the capture kept up', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);
        audio.speak(seconds(3));
        capture.pause();
        audio.passTime(20_000);
        capture.resume();
        audio.speak(seconds(3));
        audio.passTime(RECORDING_PIECE_SHORTFALL_TOLERANCE_MS);

        const { samples } = await readWav((await capture.finish()).audio);

        expect(samples).toHaveLength(6 * ONE_SECOND);
    });

    describe('cutting Recording Pieces', () => {
        // Each second of speech carries its own level, so a sample shows when it was spoken.
        const levelOf = (second) => ((second % 100) + 1) / 200;
        const sampleOf = (second) => Math.trunc(levelOf(second) * 0x7FFF);
        const speakSeconds = (from, count) => {
            for (let second = from; second < from + count; second++) audio.speak(seconds(1, levelOf(second)));
        };

        it('cuts every 60 seconds of recorded audio, neighbours sharing 1.5 seconds centred on the cut', async () => {
            expect(RECORDING_PIECE_TUNABLES).toEqual({ PIECE_MS: 60_000, OVERLAP_MS: 1_500 });
            const pieces = [];
            const capture = preparePcmCapture();
            await capture.start(STREAM, piece => pieces.push(piece));

            speakSeconds(0, 60);
            expect(pieces).toHaveLength(0);
            speakSeconds(60, 70);
            expect(pieces.map(({ startMs, cutMs }) => ({ startMs, cutMs }))).toEqual([
                { startMs: 0, cutMs: 60_000 },
                { startMs: 59_250, cutMs: 120_000 }
            ]);
            pieces.push(await capture.finish());

            const wavs = await Promise.all(pieces.map(piece => readWav(piece.audio)));
            expect(wavs.map(wav => wav.samples.length)).toEqual([60.75, 61.5, 10.75].map(count => count * ONE_SECOND));
            expect(pieces[2]).toMatchObject({ startMs: 119_250, cutMs: null });
            // The audio from 59.25 s to 60.75 s is in both of the first two pieces.
            expect(wavs[0].samples.slice(59.25 * ONE_SECOND)).toEqual(wavs[1].samples.slice(0, 1.5 * ONE_SECOND));
            expect(wavs[1].samples[0]).toBe(sampleOf(59));
            expect(wavs[1].samples.at(-1)).toBe(sampleOf(120));
            expect(wavs[2].samples[0]).toBe(sampleOf(119));
            expect(wavs[2].samples.at(-1)).toBe(sampleOf(129));
        });

        it('cuts every piece a long burst of audio holds, in order', async () => {
            const pieces = [];
            const capture = preparePcmCapture();
            await capture.start(STREAM, piece => pieces.push(piece));

            audio.speak(seconds(125));

            expect(pieces.map(piece => piece.cutMs)).toEqual([60_000, 120_000]);
        });

        it('does not bring the next cut forward for paused time', async () => {
            const pieces = [];
            const capture = preparePcmCapture();
            await capture.start(STREAM, piece => pieces.push(piece));

            speakSeconds(0, 50);
            capture.pause();
            audio.speak(seconds(30));
            capture.resume();
            speakSeconds(50, 10);
            expect(pieces).toHaveLength(0);
            speakSeconds(60, 1);

            expect(pieces).toHaveLength(1);
            const { samples } = await readWav(pieces[0].audio);
            expect(samples).toHaveLength(60.75 * ONE_SECOND);
            expect(samples[50 * ONE_SECOND]).toBe(sampleOf(50));
        });
    });

    it('rejects a capture that stopped partway through the recording', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);
        audio.speak(seconds(2));
        audio.passTime(RECORDING_PIECE_SHORTFALL_TOLERANCE_MS + 1);

        await expect(capture.finish()).rejects.toThrow('The uncompressed capture is incomplete.');
    });

    it('rejects a capture that heard nothing', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);

        await expect(capture.finish()).rejects.toThrow('The uncompressed capture is incomplete.');
    });

    it('does not start when the browser will not let the audio context run', async () => {
        audio.refuseResume = true;
        const capture = preparePcmCapture();

        await expect(capture.start(STREAM)).resolves.toBe(false);
        expect(audio.nodes[0].source).toBeNull();
    });

    it('does not start when the capture could not be prepared', async () => {
        audio.addModuleError = new Error('Audio worklets are unavailable');
        const capture = preparePcmCapture();

        await expect(capture.start(STREAM)).resolves.toBe(false);
        expect(audio.nodes).toHaveLength(0);
    });

    it('stops listening to the microphone on release', async () => {
        const capture = preparePcmCapture();
        await capture.start(STREAM);
        audio.speak([0.5]);

        capture.release();
        capture.release();

        expect(audio.nodes[0].source).toBeNull();
        expect(audio.contexts[0].state).toBe('suspended');
        expect(audio.contexts[0].suspend).toHaveBeenCalledTimes(1);
    });
});
