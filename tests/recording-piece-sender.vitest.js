/**
 * @fileoverview Background sending of Recording Pieces, driven through its own
 * interface with a fake upload client. The recording flow itself is covered in
 * recording-piece-send.vitest.js; these are the edges the flow cannot reach on
 * cue, where a piece fails at the same moment the User finishes.
 */

import { describe, expect, it, vi } from 'vitest';
import { BACKGROUND_SENDING_STATES } from '../js/constants.js';
import { RecordingPieceSender } from '../js/recording-piece-sender.js';

const pieceAt = (startMs, cutMs) => ({ audio: new Blob(['fake piece']), startMs, cutMs });

function createSender() {
    const uploads = [];
    const onPiecesStopped = vi.fn();
    const onPartialTranscript = vi.fn();
    const sender = new RecordingPieceSender({
        transcribePiece: vi.fn((audio, signal) => new Promise((resolve, reject) => {
            uploads.push({ audio, signal, resolve, reject });
        })),
        onPartialTranscript,
        onPiecesStopped
    });
    return { sender, uploads, onPiecesStopped, onPartialTranscript };
}

describe('background sending of Recording Pieces', () => {
    it('drops a piece whose words arrive just after a discard', async () => {
        const { sender, uploads, onPartialTranscript } = createSender();
        sender.add(pieceAt(0, 60_000));

        sender.discard();
        uploads[0].resolve([{ text: 'Late.', offsetMs: 0, durationMs: 100 }]);
        await Promise.resolve();

        expect(uploads[0].signal.aborted).toBe(true);
        expect(onPartialTranscript).not.toHaveBeenCalled();
        expect(sender.getState()).toBe(BACKGROUND_SENDING_STATES.NOTHING_TO_SEND);
    });

    it('sends no piece cut after pieces have stopped', async () => {
        const { sender, uploads, onPiecesStopped } = createSender();
        sender.add(pieceAt(0, 60_000));
        uploads[0].reject(new Error('Piece rejected'));
        await vi.waitFor(() => expect(onPiecesStopped).toHaveBeenCalledTimes(1));

        sender.add(pieceAt(59_250, 120_000));

        expect(uploads).toHaveLength(1);
        expect(sender.getState()).toBe(BACKGROUND_SENDING_STATES.PIECES_STOPPED);
    });

    it('asks for the whole recording when Finish comes after pieces have stopped', async () => {
        const { sender, uploads } = createSender();
        sender.add(pieceAt(0, 60_000));
        uploads[0].reject(new Error('Piece rejected'));
        await vi.waitFor(() => expect(sender.getState()).toBe(BACKGROUND_SENDING_STATES.PIECES_STOPPED));

        await expect(sender.finish(pieceAt(59_250, null))).resolves.toBeNull();

        expect(uploads).toHaveLength(1);
    });
});
