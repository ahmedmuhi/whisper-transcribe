/**
 * @fileoverview Captures uncompressed microphone audio beside MediaRecorder so a
 * Recording Piece can be sent as WAV without the whole-file conversion.
 *
 * The AudioContext and its worklet are prepared once, when the page loads, and
 * may sit suspended until a recording starts; a recording then only connects
 * the microphone and resumes the context. The context runs at the piece sample
 * rate, so the browser resamples the microphone stream. The worklet node
 * downmixes to one channel, and its processor (js/pcm-capture.worklet.js)
 * copies each render quantum to the main thread, where the samples stay in
 * memory only.
 */

import { RECORDING_PIECE_SAMPLE_RATE, RECORDING_PIECE_SHORTFALL_TOLERANCE_MS } from './constants.js';
import { encodeWav } from './wav-encoder.js';

// Must match the name registered in js/pcm-capture.worklet.js.
const PROCESSOR_NAME = 'pcm-capture';

/**
 * Prepares the capture ahead of any recording. Never throws: a browser that
 * cannot prepare it gets a capture whose `start()` resolves false.
 *
 * @returns {{
 *   start(stream: MediaStream): Promise<boolean>,
 *   pause(): void,
 *   resume(): void,
 *   finish(): Promise<Blob>,
 *   release(): void
 * }}
 */
export function preparePcmCapture() {
    let context = null;
    let node = null;
    let source = null;
    let chunks = [];
    let listening = false;
    let recordedMs = 0;
    let listeningSince = 0;

    const ready = (async () => {
        context = new AudioContext({ sampleRate: RECORDING_PIECE_SAMPLE_RATE });
        // A same-origin file emitted by the build, so a `script-src 'self'` policy allows it.
        await context.audioWorklet.addModule(new URL('./pcm-capture.worklet.js', import.meta.url));
        // No outputs: the node is a sink, so nothing reaches the speakers.
        node = new AudioWorkletNode(context, PROCESSOR_NAME, {
            numberOfOutputs: 0,
            channelCount: 1,
            channelCountMode: 'explicit'
        });
        node.port.onmessage = ({ data }) => {
            if (listening) chunks.push(data);
        };
        return true;
    })().catch(() => false);

    // Recorded time is kept on the same clock edges as the samples: listening
    // starts and stops together with this clock, so paused time counts for neither.
    function stopListening() {
        if (listening) recordedMs += performance.now() - listeningSince;
        listening = false;
    }

    function startListening() {
        listening = true;
        listeningSince = performance.now();
    }

    function disconnect() {
        stopListening();
        source?.disconnect();
        source = null;
        context.suspend().catch(() => {});
    }

    return {
        /**
         * Connects the microphone and resumes the prepared context. Resolves
         * false, leaving the recording on the whole-file path, when the capture
         * is unavailable or the browser does not let the context run.
         */
        async start(stream) {
            if (!await ready) return false;
            chunks = [];
            recordedMs = 0;
            source = context.createMediaStreamSource(stream);
            source.connect(node);
            await context.resume().catch(() => {});
            if (context.state !== 'running') {
                disconnect();
                return false;
            }
            startListening();
            return true;
        },
        pause: stopListening,
        resume: startListening,
        /**
         * Stops capturing and returns the capture as one WAV Blob. Rejects when
         * the capture is shorter than the recorded time by more than the
         * tolerance, including an empty capture, so that a capture that stopped
         * partway is never sent as if it were the whole recording.
         */
        async finish() {
            disconnect();
            const samples = new Float32Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
            chunks.reduce((offset, chunk) => {
                samples.set(chunk, offset);
                return offset + chunk.length;
            }, 0);
            chunks = [];
            const capturedMs = (samples.length / RECORDING_PIECE_SAMPLE_RATE) * 1000;
            if (samples.length === 0 || recordedMs - capturedMs > RECORDING_PIECE_SHORTFALL_TOLERANCE_MS) {
                throw new Error('The uncompressed capture is incomplete.');
            }
            return new Blob([encodeWav(samples, RECORDING_PIECE_SAMPLE_RATE, 16)], { type: 'audio/wav' });
        },
        /** Stops capturing and drops the captured audio. */
        release() {
            chunks = [];
            if (source) disconnect();
        }
    };
}
