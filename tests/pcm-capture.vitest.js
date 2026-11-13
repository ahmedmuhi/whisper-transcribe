/**
 * @fileoverview The uncompressed capture a Recording Piece is built from.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECORDING_PIECE_SAMPLE_RATE } from '../js/constants.js';
import { startPcmCapture } from '../js/pcm-capture.js';
import { installFakeWebAudio, readWav, removeFakeWebAudio } from './helpers/fake-web-audio.js';

const STREAM = { id: 'fake-microphone-stream' };
const LOUD = 1;

describe('uncompressed microphone capture', () => {
    let audio;

    beforeEach(() => {
        audio = installFakeWebAudio();
    });

    afterEach(() => {
        removeFakeWebAudio();
    });

    it('returns what it heard as 16 kHz mono 16-bit WAV', async () => {
        const capture = await startPcmCapture(STREAM);
        audio.speak([0, LOUD]);
        audio.speak([-LOUD]);

        const wav = await readWav(await capture.finish());

        expect(audio.contexts[0].sampleRate).toBe(RECORDING_PIECE_SAMPLE_RATE);
        expect(audio.nodes[0].stream).toBe(STREAM);
        expect(wav).toEqual({
            channels: 1,
            sampleRate: 16000,
            bitDepth: 16,
            samples: [0, 0x7FFF, -0x8000]
        });
        expect(audio.contexts[0].state).toBe('closed');
    });

    it('does not capture paused time', async () => {
        const capture = await startPcmCapture(STREAM);
        audio.speak([0.5]);
        capture.pause();
        audio.speak([0.25, 0.25, 0.25]);
        capture.resume();
        audio.speak([-0.5]);

        const { samples } = await readWav(await capture.finish());

        expect(samples).toEqual([Math.trunc(0.5 * 0x7FFF), -0x4000]);
    });

    it('stops listening to the microphone on release, once', async () => {
        const capture = await startPcmCapture(STREAM);
        audio.speak([0.5]);

        capture.release();
        capture.release();

        expect(audio.contexts[0].close).toHaveBeenCalledTimes(1);
        expect(audio.contexts[0].state).toBe('closed');
    });

    it('rejects and closes its audio context when the browser cannot run the capture', async () => {
        audio.addModuleError = new Error('Audio worklets are unavailable');

        await expect(startPcmCapture(STREAM)).rejects.toThrow('Audio worklets are unavailable');
        expect(audio.contexts[0].state).toBe('closed');
        expect(audio.nodes).toHaveLength(0);
    });
});
