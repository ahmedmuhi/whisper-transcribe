/**
 * @fileoverview Module Web Worker that performs the CPU-bound PCM-to-WAV
 * encode off the main thread. Decode and resample stay on the main thread
 * because WebAudio (OfflineAudioContext/decodeAudioData) is unavailable in
 * Workers; only the int16 sample loop runs here.
 *
 * Protocol: the main thread posts { requestId, samples, sampleRate, bitDepth }
 * (with samples.buffer transferred). The worker posts back
 * { requestId, wavBuffer }, with wavBuffer transferred. On encode failure it
 * posts { requestId, error }.
 */

import { encodeWav } from './wav-encoder.js';

self.addEventListener('message', (event) => {
    const { requestId, samples, sampleRate, bitDepth } = event.data;

    try {
        const wavBuffer = encodeWav(samples, sampleRate, bitDepth);
        self.postMessage({ requestId, wavBuffer }, [wavBuffer]);
    } catch (error) {
        self.postMessage({ requestId, error: error?.message || String(error) });
    }
});
