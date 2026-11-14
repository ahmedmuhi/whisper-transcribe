/**
 * @fileoverview Captures uncompressed microphone audio beside MediaRecorder and
 * cuts it into Recording Pieces, each sent as WAV without the whole-file
 * conversion.
 *
 * The AudioContext and its worklet are prepared once, when the page loads, and
 * may sit suspended until a recording starts; a recording then only connects
 * the microphone and resumes the context. The context runs at the piece sample
 * rate, so the browser resamples the microphone stream. The worklet node
 * downmixes to one channel, and its processor (js/pcm-capture.worklet.js)
 * copies each render quantum to the main thread, where the samples stay in
 * memory only, and only until the piece holding them has been cut.
 *
 * A cut is made every RECORDING_PIECE_TUNABLES.PIECE_MS of captured audio.
 * Neighbouring pieces share OVERLAP_MS of audio with the cut in its middle, so
 * a piece is cut once the audio has run half the overlap past its cut. Paused
 * audio is never captured, so paused time does not count.
 */

import {
    RECORDING_PIECE_SAMPLE_RATE,
    RECORDING_PIECE_SHORTFALL_TOLERANCE_MS,
    RECORDING_PIECE_TUNABLES
} from './constants.js';
import { encodeWav } from './wav-encoder.js';

// Must match the name registered in js/pcm-capture.worklet.js.
const PROCESSOR_NAME = 'pcm-capture';

const toSamples = (ms) => Math.round((ms / 1000) * RECORDING_PIECE_SAMPLE_RATE);
const toMs = (samples) => (samples / RECORDING_PIECE_SAMPLE_RATE) * 1000;
const toWav = (samples) => new Blob([encodeWav(samples, RECORDING_PIECE_SAMPLE_RATE, 16)], { type: 'audio/wav' });

/**
 * Prepares the capture ahead of any recording. Never throws: a browser that
 * cannot prepare it gets a capture whose `start()` resolves false.
 *
 * @returns {{
 *   start(stream: MediaStream, onPiece: (piece: import('./recording-piece-sender.js').RecordingPiece) => void): Promise<boolean>,
 *   pause(): void,
 *   resume(): void,
 *   finish(): Promise<import('./recording-piece-sender.js').RecordingPiece>,
 *   release(): void
 * }}
 */
export function preparePcmCapture() {
    let context = null;
    let node = null;
    let source = null;
    let listening = false;
    let recordedMs = 0;
    let listeningSince = 0;
    let onPiece = null;
    // Samples from the start of the current piece onwards; earlier audio has been sent.
    let chunks = [];
    let pieceStart = 0;
    let captured = 0;
    let nextCut = 0;
    let pieceLength = 0;
    let halfOverlap = 0;

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
            if (listening) take(data);
        };
        return true;
    })().catch(() => false);

    function take(chunk) {
        chunks.push(chunk);
        captured += chunk.length;
        while (captured >= nextCut + halfOverlap) cutPiece();
    }

    function currentPieceSamples() {
        const samples = new Float32Array(captured - pieceStart);
        chunks.reduce((offset, chunk) => {
            samples.set(chunk, offset);
            return offset + chunk.length;
        }, 0);
        return samples;
    }

    function cutPiece() {
        const samples = currentPieceSamples();
        const nextStart = nextCut - halfOverlap;
        const piece = {
            audio: toWav(samples.subarray(0, nextCut + halfOverlap - pieceStart)),
            startMs: toMs(pieceStart),
            cutMs: toMs(nextCut)
        };
        chunks = [samples.slice(nextStart - pieceStart)];
        pieceStart = nextStart;
        nextCut += pieceLength;
        onPiece(piece);
    }

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
        async start(stream, pieceListener) {
            if (!await ready) return false;
            chunks = [];
            recordedMs = 0;
            captured = 0;
            pieceStart = 0;
            pieceLength = toSamples(RECORDING_PIECE_TUNABLES.PIECE_MS);
            halfOverlap = toSamples(RECORDING_PIECE_TUNABLES.OVERLAP_MS / 2);
            nextCut = pieceLength;
            onPiece = pieceListener;
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
         * Stops capturing and returns the final piece, whatever its length.
         * Rejects when the capture is shorter than the recorded time by more
         * than the tolerance, including an empty capture, so that a capture that
         * stopped partway is never sent as if it held the rest of the recording.
         */
        async finish() {
            disconnect();
            const samples = currentPieceSamples();
            chunks = [];
            if (captured === 0 || recordedMs - toMs(captured) > RECORDING_PIECE_SHORTFALL_TOLERANCE_MS) {
                throw new Error('The uncompressed capture is incomplete.');
            }
            return { audio: toWav(samples), startMs: toMs(pieceStart), cutMs: null };
        },
        /** Stops capturing and drops the captured audio. */
        release() {
            chunks = [];
            if (source) disconnect();
        }
    };
}
