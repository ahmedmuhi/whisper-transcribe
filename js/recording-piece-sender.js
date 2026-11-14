/**
 * @fileoverview Background sending for a recording sent in Recording Pieces.
 *
 * Owns the Recording Pieces of the current recording: their order, the single
 * upload in flight, and the Partial Transcript. It runs beside the recorder and
 * has its own small set of states (BACKGROUND_SENDING_STATES). It never sees a
 * token or builds a header: each piece goes through the injected
 * `transcribePiece`, which is `AzureAPIClient.transcribePiece`.
 */

import { BACKGROUND_SENDING_STATES as STATES } from './constants.js';
import { joinRecordingPieces } from './recording-piece-joiner.js';

/**
 * @typedef {Object} RecordingPiece
 * @property {Blob} audio WAV of the piece.
 * @property {number} startMs Where the piece begins in the whole recording.
 * @property {number|null} cutMs The cut between this piece and the next; null for the final piece.
 */

export class RecordingPieceSender {
    #state = STATES.NOTHING_TO_SEND;
    #transcribePiece;
    #onPartialTranscript;
    #onPiecesStopped;
    /** @type {RecordingPiece[]} Pieces cut and not yet sent, in order. */
    #waiting = [];
    /** @type {{startMs: number, cutMs: number|null, words: Object[]}[]} Pieces back as words, in order. */
    #returned = [];
    /** @type {AbortController|null} */
    #upload = null;
    /** @type {Function|null} Settles Finish once every piece is in, or one has failed. */
    #finish = null;
    #partialShown = false;

    /**
     * @param {Object} options
     * @param {(audio: Blob, signal: AbortSignal) => Promise<Object[]>} options.transcribePiece Sends one piece, resolving its timed words.
     * @param {(text: string) => void} options.onPartialTranscript Shows the Partial Transcript; empty text removes it.
     * @param {() => void} options.onPiecesStopped Called when a piece fails while recording, so no more pieces are cut.
     */
    constructor({ transcribePiece, onPartialTranscript, onPiecesStopped }) {
        this.#transcribePiece = transcribePiece;
        this.#onPartialTranscript = onPartialTranscript;
        this.#onPiecesStopped = onPiecesStopped;
    }

    /** @returns {string} One of BACKGROUND_SENDING_STATES. */
    getState() {
        return this.#state;
    }

    /**
     * Queues a piece cut while recording. Pieces go one at a time, in order.
     *
     * @param {RecordingPiece} piece
     * @returns {void}
     */
    add(piece) {
        if (this.#state === STATES.PIECES_STOPPED) return;
        this.#waiting.push(piece);
        if (!this.#upload) this.#sendNext();
    }

    /**
     * Sends the final piece after any still outstanding and joins them all.
     *
     * @param {RecordingPiece} finalPiece
     * @returns {Promise<string|null>} The complete transcript, or null when a piece failed
     */
    finish(finalPiece) {
        if (this.#state === STATES.PIECES_STOPPED) return Promise.resolve(null);
        const finished = new Promise(resolve => { this.#finish = resolve; });
        this.add(finalPiece);
        return finished;
    }

    /**
     * Sends the whole recording instead of pieces, after aborting any piece
     * still in flight. The Partial Transcript stays shown until the result
     * replaces it.
     *
     * @param {() => Promise<{success: boolean}>} send Today's whole-file path
     * @returns {Promise<{success: boolean}>}
     */
    async sendWholeRecording(send) {
        this.#drop();
        this.#state = STATES.SENDING_WHOLE_RECORDING;
        try {
            const result = await send();
            if (result.success) this.#partialShown = false;
            return result;
        } finally {
            this.#state = STATES.NOTHING_TO_SEND;
        }
    }

    /**
     * Aborts the upload in flight and removes every piece and the Partial Transcript.
     *
     * @returns {void}
     */
    discard() {
        this.#end();
        if (this.#partialShown) {
            this.#partialShown = false;
            this.#onPartialTranscript('');
        }
    }

    /** Drops everything and returns to Nothing to send, handing Finish its result if it waits. */
    #end(transcript = null) {
        const finish = this.#finish;
        this.#drop();
        this.#state = STATES.NOTHING_TO_SEND;
        finish?.(transcript);
    }

    #drop() {
        this.#upload?.abort();
        this.#upload = null;
        this.#waiting = [];
        this.#returned = [];
        this.#finish = null;
    }

    #sendNext() {
        const piece = this.#waiting.shift();
        const upload = new AbortController();
        this.#upload = upload;
        this.#state = STATES.SENDING_PIECE;
        this.#transcribePiece(piece.audio, upload.signal).then(
            (words) => {
                if (upload.signal.aborted) return;
                this.#returned.push({ startMs: piece.startMs, cutMs: piece.cutMs, words });
                this.#upload = null;
                this.#pieceReturned();
            },
            () => {
                if (upload.signal.aborted) return;
                this.#pieceFailed();
            }
        );
    }

    #pieceReturned() {
        const text = joinRecordingPieces(
            this.#returned,
            this.#returned.slice(0, -1).map(piece => piece.cutMs)
        );
        if (this.#waiting.length > 0) {
            this.#sendNext();
        } else if (this.#finish) {
            this.#partialShown = false;
            this.#end(text);
            return;
        } else {
            this.#state = STATES.CAUGHT_UP;
        }
        this.#partialShown = true;
        this.#onPartialTranscript(text);
    }

    #pieceFailed() {
        if (this.#finish) {
            this.#end();
            return;
        }
        this.#drop();
        this.#state = STATES.PIECES_STOPPED;
        this.#onPiecesStopped();
    }
}
