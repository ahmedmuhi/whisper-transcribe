/**
 * @fileoverview Tests for rebuilding a transcript from the timed words of Recording Pieces.
 *
 * Every word and time here is invented. Times are milliseconds: a piece's
 * `startMs` is where it begins in the whole recording, a word's `offsetMs` is
 * where it begins in its own piece, and each cut is a point in the whole recording.
 */

import { describe, expect, it } from 'vitest';
import { joinRecordingPieces } from '../js/recording-piece-joiner.js';

function word(text, offsetMs, durationMs = 400) {
    return { text, offsetMs, durationMs };
}

describe('joinRecordingPieces', () => {
    it('reproduces a single piece exactly when there is no cut', () => {
        const words = [word('Hello,', 0), word('lantern', 500), word('river.', 1000), word('Okay?', 1600)];

        expect(joinRecordingPieces([{ startMs: 0, words }], []))
            .toBe('Hello, lantern river. Okay?');
    });

    it('returns an empty string for no pieces or a single empty piece', () => {
        expect(joinRecordingPieces([], [])).toBe('');
        expect(joinRecordingPieces([{ startMs: 0, words: [] }], [])).toBe('');
    });

    it('keeps each overlapping word from only one side of one cut', () => {
        // Piece one covers 0–10 750 ms; piece two starts at 9 250 ms; the cut is at 10 000 ms.
        const first = {
            startMs: 0,
            words: [word('Amber', 8000), word('walrus', 9000), word('juggles', 9800), word('pears.', 10400)]
        };
        const second = {
            startMs: 9250,
            words: [word('walrus', 0), word('juggles', 550), word('pears.', 1150), word('Then', 1700)]
        };

        expect(joinRecordingPieces([first, second], [10000]))
            .toBe('Amber walrus juggles pears. Then');
    });

    it('decides a word straddling the cut by its midpoint', () => {
        // "cobalt" starts before the cut but its midpoint (10 100 ms) is after it,
        // so the later piece's copy is kept.
        const first = { startMs: 0, words: [word('Quiet', 9300), word('cobalt', 9800, 600)] };
        const second = { startMs: 9250, words: [word('cobalt', 550, 600), word('moon.', 1200)] };

        expect(joinRecordingPieces([first, second], [10000])).toBe('Quiet cobalt moon.');
    });

    it('keeps only one spelling when the two pieces hear the same moment differently', () => {
        const first = { startMs: 0, words: [word('Ferns', 9000), word('grey', 9700, 200)] };
        const second = { startMs: 9250, words: [word('Ferns', 0), word('gray,', 450, 200), word('slowly.', 800)] };

        // Midpoint of the shared word is 9 800 ms, before the cut, so the earlier spelling wins.
        expect(joinRecordingPieces([first, second], [10000])).toBe('Ferns grey slowly.');
    });

    it('joins several cuts in order', () => {
        const pieces = [
            { startMs: 0, words: [word('One', 100), word('marble', 900), word('drifts', 1700)] },
            { startMs: 1500, words: [word('drifts', 200), word('past', 800), word('two', 1600)] },
            { startMs: 3000, words: [word('two', 100), word('Kites.', 700)] }
        ];

        expect(joinRecordingPieces(pieces, [2000, 3500])).toBe('One marble drifts past two Kites.');
    });

    it('skips an empty piece between two others', () => {
        const pieces = [
            { startMs: 0, words: [word('Before', 100)] },
            { startMs: 1500, words: [] },
            { startMs: 3000, words: [word('after.', 800)] }
        ];

        expect(joinRecordingPieces(pieces, [2000, 3500])).toBe('Before after.');
    });

    it('does not let a neighbour fill the gap left by an empty piece', () => {
        // The first piece heard "Late" just after the cut, but only the empty second piece may supply it.
        const pieces = [
            { startMs: 0, words: [word('Early', 1500), word('Late', 2100)] },
            { startMs: 1500, words: [] }
        ];

        expect(joinRecordingPieces(pieces, [2000])).toBe('Early');
    });

    it('gives a word whose midpoint is exactly on the cut to the later piece', () => {
        const first = { startMs: 0, words: [word('Pebble', 1800)] };
        const second = { startMs: 1500, words: [word('pebble', 300)] };

        expect(joinRecordingPieces([first, second], [2000])).toBe('pebble');
    });

    it('preserves punctuation and capitals exactly as each word carries them', () => {
        const words = [word('“Señor', 0), word('O’Brien,”', 500), word('she', 1000), word('said;', 1400), word('NASA!', 1900)];

        expect(joinRecordingPieces([{ startMs: 0, words }], [])).toBe('“Señor O’Brien,” she said; NASA!');
    });

    it('rejects a cut list that does not match the pieces', () => {
        expect(() => joinRecordingPieces([{ startMs: 0, words: [] }], [1000])).toThrow(RangeError);
    });
});
