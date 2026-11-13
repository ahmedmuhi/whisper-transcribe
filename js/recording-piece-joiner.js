/**
 * @fileoverview Rebuilds one transcript from the timed words of Recording Pieces.
 *
 * Neighbouring pieces share a little audio around each cut. A word is kept from
 * the earlier piece when its midpoint falls before the cut and from the later
 * piece otherwise, so each moment is taken from exactly one piece. Word text is
 * never compared between pieces and is kept exactly as the model wrote it.
 */

/**
 * @typedef {Object} TimedWord
 * @property {string} text Display text, carrying its own punctuation and capitalisation.
 * @property {number} offsetMs Start of the word, measured from the start of its piece.
 * @property {number} durationMs Length of the word.
 */

/**
 * @typedef {Object} RecordingPieceWords
 * @property {number} startMs Where the piece begins in the whole recording.
 * @property {TimedWord[]} words The piece's words in spoken order.
 */

/**
 * @param {RecordingPieceWords[]} pieces Pieces in recording order.
 * @param {number[]} cutsMs Cut points in the whole recording; `cutsMs[i]` lies between piece `i` and piece `i + 1`.
 * @returns {string} The words that survive every cut, joined with single spaces.
 */
export function joinRecordingPieces(pieces, cutsMs) {
    if (cutsMs.length !== Math.max(pieces.length - 1, 0)) {
        throw new RangeError('A cut point is needed between each pair of neighbouring pieces.');
    }

    const kept = [];
    pieces.forEach((piece, index) => {
        const fromMs = index === 0 ? -Infinity : cutsMs[index - 1];
        const untilMs = index === pieces.length - 1 ? Infinity : cutsMs[index];
        for (const word of piece.words) {
            const midpointMs = piece.startMs + word.offsetMs + (word.durationMs / 2);
            if (midpointMs >= fromMs && midpointMs < untilMs) {
                kept.push(word.text);
            }
        }
    });
    return kept.join(' ');
}
