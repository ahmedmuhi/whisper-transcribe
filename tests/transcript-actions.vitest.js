/**
 * @fileoverview Transcript actions — Grab / Restore and append-with-divider.
 * Grab copies+clears (the record survives, recoverable via Restore), Restore is
 * persistent & repeatable, and re-recordings append with a visible divider.
 */

import { vi } from 'vitest';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

global.document = {
    getElementById: vi.fn().mockReturnValue({
        style: { display: 'block' },
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        addEventListener: vi.fn(),
        textContent: '',
        disabled: false,
        value: ''
    }),
    body: { classList: { add: vi.fn(), remove: vi.fn() } }
};
global.localStorage = { getItem: vi.fn().mockReturnValue('auto'), setItem: vi.fn() };
global.window = { matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) };

vi.mock('../js/status-helper.js', () => ({ showTemporaryStatus: vi.fn() }));

const { UI } = await import('../js/ui.js');
const { TranscriptStore } = await import('../js/transcript-store.js');
const { TRANSCRIPT_SEGMENT_DIVIDER, MESSAGES } = await import('../js/constants.js');

function makeStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; }
    };
}

describe('Transcript actions: Grab / Restore / append', () => {
    let ui;
    let store;
    let writeText;

    beforeEach(() => {
        applyDomSpies();
        writeText = vi.fn(() => Promise.resolve());
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        ui = new UI();
        store = new TranscriptStore(makeStorage(), 'tk');
        ui.transcriptStore = store;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        resetEventBus();
    });

    describe('Grab', () => {
        it('copies to the clipboard, clears the box, but keeps the record', async () => {
            ui.transcriptElement.value = 'grab me';
            const ok = await ui.grabTranscript();
            expect(ok).toBe(true);
            expect(writeText).toHaveBeenCalledWith('grab me');
            expect(ui.transcriptElement.value).toBe('');
            expect(store.load()?.text).toBe('grab me');      // survives the Grab
            expect(ui.restoreButton.hidden).toBe(false);     // Restore now offered
        });

        it('does nothing on an empty box', async () => {
            ui.transcriptElement.value = '';
            const ok = await ui.grabTranscript();
            expect(ok).toBe(false);
            expect(writeText).not.toHaveBeenCalled();
        });

        it('keeps the text in the box AND recoverable if the clipboard write fails', async () => {
            writeText.mockImplementationOnce(() => Promise.reject(new Error('blocked')));
            ui.transcriptElement.value = 'precious';
            const ok = await ui.grabTranscript();
            expect(ok).toBe(false);
            expect(ui.transcriptElement.value).toBe('precious'); // not lost from the box
            expect(store.load()?.text).toBe('precious');         // and saved as a record
        });

        it('keeps the text visible when persistence fails but clipboard succeeds', async () => {
            const storage = {
                getItem: vi.fn().mockReturnValue(null),
                setItem: vi.fn(() => { throw new Error('quota exceeded'); }),
                removeItem: vi.fn()
            };
            ui.transcriptStore = new TranscriptStore(storage, 'tk');
            ui.transcriptElement.value = 'not safely saved';
            const statusSpy = vi.spyOn(ui, '_emitStatus');

            const ok = await ui.grabTranscript();

            expect(ok).toBe(true);
            expect(writeText).toHaveBeenCalledWith('not safely saved');
            expect(ui.transcriptElement.value).toBe('not safely saved');
            expect(ui.restoreButton.hidden).toBe(true);
            expect(statusSpy).toHaveBeenCalledWith(MESSAGES.TRANSCRIPT_AUTOSAVE_FAILED, 'error');
        });

        it('cancels a pending empty autosave when Grab clears the box', async () => {
            vi.useFakeTimers();
            try {
                ui.transcriptElement.value = 'grab me';
                ui._autosaveTimer = setTimeout(() => ui.persistTranscript(), 500);

                const ok = await ui.grabTranscript();
                await vi.advanceTimersByTimeAsync(500);

                expect(ok).toBe(true);
                expect(ui.transcriptElement.value).toBe('');
                expect(store.load()?.text).toBe('grab me');
                expect(ui.restoreButton.hidden).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('Restore', () => {
        it('resurrects the last transcript and is repeatable (non-consuming)', async () => {
            // First Grab leaves a recoverable record + empty box.
            ui.transcriptElement.value = 'round one';
            await ui.grabTranscript();
            expect(ui.transcriptElement.value).toBe('');

            // Restore brings it back.
            ui.restoreTranscript();
            expect(ui.transcriptElement.value).toBe('round one');
            expect(ui.restoreButton.hidden).toBe(true); // box non-empty now

            // Grab again, restore again — the slot was never consumed.
            await ui.grabTranscript();
            expect(ui.transcriptElement.value).toBe('');
            ui.restoreTranscript();
            expect(ui.transcriptElement.value).toBe('round one');
        });
    });

    describe('Restore affordance visibility', () => {
        it('shows only when the box is empty and a record exists', () => {
            // nothing saved, empty box → hidden
            ui.transcriptElement.value = '';
            ui.updateRestoreAffordance();
            expect(ui.restoreButton.hidden).toBe(true);

            // record exists, empty box → shown
            store.save('recoverable');
            ui.updateRestoreAffordance();
            expect(ui.restoreButton.hidden).toBe(false);

            // record exists, box has text → hidden
            ui.transcriptElement.value = 'typing again';
            ui.updateRestoreAffordance();
            expect(ui.restoreButton.hidden).toBe(true);
        });
    });

    describe('Append with divider', () => {
        it('separates a second take from the first with the divider', () => {
            ui.transcriptElement.value = 'take one';
            ui.displayTranscription('take two');
            expect(ui.transcriptElement.value).toBe('take one' + TRANSCRIPT_SEGMENT_DIVIDER + 'take two');
        });

        it('fills an empty box with no leading divider', () => {
            ui.transcriptElement.value = '';
            ui.displayTranscription('first');
            expect(ui.transcriptElement.value).toBe('first');
        });
    });
});
