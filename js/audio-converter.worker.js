/**
 * @fileoverview Module Web Worker that performs the CPU-bound PCM-to-WAV
 * encode off the main thread. Decode and resample stay on the main thread
 * because WebAudio (OfflineAudioContext/decodeAudioData) is unavailable in
 * Workers; only the int16 sample loop runs here.
 *
 * Protocol: the main thread posts { samples: Float32Array, sampleRate, bitDepth }
 * (with samples.buffer transferred). The worker posts back the encoded WAV
 * ArrayBuffer, also transferred. On encode failure it posts { error }.
 */

/* global self */

import { encodeWav } from './wav-encoder.js';

self.addEventListener('message', (event) => {
    const { samples, sampleRate, bitDepth } = event.data;

    try {
        const wavBuffer = encodeWav(samples, sampleRate, bitDepth);
        self.postMessage(wavBuffer, [wavBuffer]);
    } catch (error) {
        self.postMessage({ error: error?.message || String(error) });
    }
});
