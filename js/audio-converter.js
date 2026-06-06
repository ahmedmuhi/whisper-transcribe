/**
 * @fileoverview Converts audio blobs to WAV format using browser-native AudioContext.
 * Used for MAI-Transcribe which requires WAV/MP3/FLAC (rejects WebM/Opus).
 *
 * Decode + resample (which need WebAudio) run on the main thread. The CPU-bound
 * PCM-to-WAV encode is offloaded to a module Web Worker so long recordings do
 * not freeze the UI; a synchronous fallback runs the same encode on the main
 * thread when Workers are unavailable (older browsers, file://, etc.).
 */

/* global Worker */

import { encodeWav } from './wav-encoder.js';

const TARGET_SAMPLE_RATE = 16000;
const BIT_DEPTH = 16;
const NUM_CHANNELS = 1;

// Lazily-constructed shared encode worker. `null` = not yet attempted;
// `false` = construction failed, use the synchronous fallback permanently.
let encodeWorker = null;
let nextEncodeRequestId = 1;

/**
 * Converts an audio Blob (e.g. WebM/Opus) to a 16kHz mono 16-bit WAV Blob.
 *
 * @param {Blob} audioBlob - Source audio blob in any browser-decodable format
 * @returns {Promise<Blob>} WAV-encoded audio blob
 */
export async function convertToWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    // length=1 is a placeholder — decodeAudioData ignores the context's buffer length
    const audioContext = new OfflineAudioContext(NUM_CHANNELS, 1, TARGET_SAMPLE_RATE);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const resampledBuffer = await resampleAudio(audioBuffer, TARGET_SAMPLE_RATE);
    const monoSamples = downmixToMono(resampledBuffer);
    const wavBuffer = await encodeWavOffThread(monoSamples, TARGET_SAMPLE_RATE, BIT_DEPTH);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Encodes PCM samples to a WAV ArrayBuffer, preferring an off-thread Worker and
 * falling back to a synchronous main-thread encode. Both paths produce
 * byte-identical output (they share encodeWav from wav-encoder.js).
 *
 * @param {Float32Array} samples - Mono PCM samples in [-1, 1] range
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} bitDepth - Bits per sample (16)
 * @returns {Promise<ArrayBuffer>} Complete WAV file as ArrayBuffer
 */
async function encodeWavOffThread(samples, sampleRate, bitDepth) {
    const worker = getEncodeWorker();
    if (!worker) {
        return encodeWav(samples, sampleRate, bitDepth);
    }

    // Copy into a fresh buffer so transferring it never detaches an AudioBuffer
    // view that the caller (or a retry) might still reference.
    const transferable = new Float32Array(samples);

    try {
        return await postToWorker(worker, transferable, sampleRate, bitDepth);
    } catch {
        disableEncodeWorker(worker);
        // Worker path failed at runtime — fall back so correctness is preserved.
        return encodeWav(samples, sampleRate, bitDepth);
    }
}

/**
 * Sends samples to the worker and awaits the encoded WAV ArrayBuffer.
 *
 * @param {Worker} worker - The encode worker
 * @param {Float32Array} samples - Mono PCM samples (its buffer is transferred)
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} bitDepth - Bits per sample (16)
 * @returns {Promise<ArrayBuffer>} Encoded WAV ArrayBuffer
 */
function postToWorker(worker, samples, sampleRate, bitDepth) {
    return new Promise((resolve, reject) => {
        const requestId = nextEncodeRequestId++;
        const onMessage = (event) => {
            const data = event.data;
            if (!data || data.requestId !== requestId) {
                return;
            }
            cleanup();
            if (data && data.error) {
                reject(new Error(data.error));
                return;
            }
            resolve(data.wavBuffer);
        };

        const onError = (event) => {
            cleanup();
            reject(event?.error || new Error('Audio encode worker failed'));
        };

        function cleanup() {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
        }

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage(
            { requestId, samples, sampleRate, bitDepth },
            [samples.buffer]
        );
    });
}

/**
 * Returns the shared encode Worker, constructing it on first use. Returns
 * `null` when Worker is unavailable or construction throws, signalling callers
 * to use the synchronous fallback.
 *
 * @returns {Worker|null} The encode worker, or null if unavailable
 */
function getEncodeWorker() {
    if (encodeWorker !== null) {
        return encodeWorker || null;
    }

    if (typeof Worker === 'undefined') {
        encodeWorker = false;
        return null;
    }

    try {
        encodeWorker = new Worker(
            new URL('./audio-converter.worker.js', import.meta.url),
            { type: 'module' }
        );
    } catch {
        encodeWorker = false;
        return null;
    }

    return encodeWorker;
}

/**
 * Permanently disables the shared Worker after a runtime failure so later
 * conversions do not keep posting to a broken worker instance.
 *
 * @param {Worker} worker - Worker that just failed
 * @returns {void}
 */
function disableEncodeWorker(worker) {
    if (encodeWorker !== worker) {
        return;
    }
    if (typeof worker.terminate === 'function') {
        worker.terminate();
    }
    encodeWorker = false;
}

/**
 * Resamples an AudioBuffer to the target sample rate using OfflineAudioContext.
 *
 * @param {AudioBuffer} audioBuffer - Source audio buffer
 * @param {number} targetRate - Desired sample rate in Hz
 * @returns {Promise<AudioBuffer>} Resampled audio buffer
 */
async function resampleAudio(audioBuffer, targetRate) {
    if (audioBuffer.sampleRate === targetRate) {
        return audioBuffer;
    }

    const duration = audioBuffer.duration;
    const targetLength = Math.ceil(duration * targetRate);
    const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        targetLength,
        targetRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    return offlineCtx.startRendering();
}

/**
 * Downmixes a multi-channel AudioBuffer to a single mono Float32Array.
 *
 * @param {AudioBuffer} audioBuffer - Source audio buffer (any channel count)
 * @returns {Float32Array} Mono audio samples
 */
function downmixToMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
        return audioBuffer.getChannelData(0);
    }

    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    const channelCount = audioBuffer.numberOfChannels;

    for (let ch = 0; ch < channelCount; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            mono[i] += channelData[i] / channelCount;
        }
    }

    return mono;
}
