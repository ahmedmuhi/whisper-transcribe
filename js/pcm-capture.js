/**
 * @fileoverview Captures uncompressed microphone audio beside MediaRecorder so a
 * Recording Piece can be sent as WAV without the whole-file conversion.
 *
 * The AudioContext runs at the piece sample rate, so the browser resamples the
 * microphone stream. The worklet node downmixes to one channel and copies each
 * render quantum to the main thread, where the samples stay in memory only.
 */

import { RECORDING_PIECE_SAMPLE_RATE } from './constants.js';
import { encodeWav } from './wav-encoder.js';

const PROCESSOR_NAME = 'pcm-capture';
const PROCESSOR_SOURCE = `registerProcessor('${PROCESSOR_NAME}',class extends AudioWorkletProcessor{process([i]){i[0]&&this.port.postMessage(i[0].slice());return true}})`;

/**
 * Starts capturing the stream. Rejects when the browser cannot run the capture,
 * in which case the recording simply keeps today's whole-file path.
 *
 * @param {MediaStream} stream Microphone stream already feeding MediaRecorder.
 * @returns {Promise<{pause(): void, resume(): void, finish(): Promise<Blob>, release(): void}>}
 */
export async function startPcmCapture(stream) {
    const context = new AudioContext({ sampleRate: RECORDING_PIECE_SAMPLE_RATE });
    let closing = null;
    const close = () => (closing ??= context.close());
    const chunks = [];
    let paused = false;

    try {
        const moduleUrl = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: 'text/javascript' }));
        await context.audioWorklet.addModule(moduleUrl).finally(() => URL.revokeObjectURL(moduleUrl));
        // No outputs: the node is a sink, so nothing reaches the speakers.
        const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
            numberOfOutputs: 0,
            channelCount: 1,
            channelCountMode: 'explicit'
        });
        node.port.onmessage = ({ data }) => {
            if (!paused) chunks.push(data);
        };
        context.createMediaStreamSource(stream).connect(node);
    } catch (error) {
        close();
        throw error;
    }

    return {
        pause() { paused = true; },
        resume() { paused = false; },
        /** Stops capturing and returns everything captured as one WAV Blob; rejects when nothing was captured. */
        async finish() {
            await close();
            const samples = new Float32Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
            chunks.reduce((offset, chunk) => {
                samples.set(chunk, offset);
                return offset + chunk.length;
            }, 0);
            chunks.length = 0;
            // A context the browser kept suspended hears nothing; an empty piece would
            // pass for silence, so the caller must send the whole recording instead.
            if (samples.length === 0) throw new Error('The uncompressed capture is empty.');
            return new Blob([encodeWav(samples, RECORDING_PIECE_SAMPLE_RATE, 16)], { type: 'audio/wav' });
        },
        /** Stops capturing and drops the captured audio. */
        release() {
            chunks.length = 0;
            close();
        }
    };
}
