/**
 * @fileoverview Integration tests for the Phase 1 autosave/restore wiring in ui.js:
 * a real transcription persists to the store, and an empty box is restored on load.
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

global.localStorage = {
    getItem: vi.fn().mockReturnValue('auto'),
    setItem: vi.fn()
};

global.window = {
    matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
};

vi.mock('../js/status-helper.js', () => ({
    showTemporaryStatus: vi.fn()
}));

const { eventBus, APP_EVENTS } = await import('../js/event-bus.js');
const { MESSAGES } = await import('../js/constants.js');
const { UI } = await import('../js/ui.js');
const { TranscriptStore } = await import('../js/transcript-store.js');

/** Minimal in-memory Storage stand-in. */
function makeStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; }
    };
}

describe('Transcript autosave + restore wiring', () => {
    let ui;
    let store;

    beforeEach(() => {
        applyDomSpies();
        ui = new UI();
        store = new TranscriptStore(makeStorage(), 'tk');
        ui.transcriptStore = store;
        ui.setupEventBusListeners();
        vi.clearAllMocks();
    });

    afterEach(() => {
        resetEventBus();
    });

    it('persists the transcript to the store when a transcription arrives', () => {
        eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, { text: 'persisted hello' });
        expect(store.load()?.text).toBe('persisted hello');
    });

    it('restores an autosaved transcript into an empty box on load', () => {
        store.save('recovered text');
        ui.transcriptElement.value = '';
        ui.restoreTranscriptIfEmpty();
        expect(ui.transcriptElement.value).toBe('recovered text');
    });

    it('never clobbers text already in the box during restore', () => {
        store.save('recovered text');
        ui.transcriptElement.value = 'user is mid-edit';
        ui.restoreTranscriptIfEmpty();
        expect(ui.transcriptElement.value).toBe('user is mid-edit');
    });

    it('clears the recovery slot when a manual edit empties the transcript', () => {
        store.save('deleted by user');
        ui.transcriptElement.value = '';
        ui.persistTranscript();
        expect(store.load()).toBeNull();
    });

    it('no-ops cleanly when no store is wired (back-compat)', () => {
        ui.transcriptStore = null;
        expect(() => ui.persistTranscript()).not.toThrow();
        expect(() => ui.restoreTranscriptIfEmpty()).not.toThrow();
    });

    it('warns once per failed save streak and warns again after recovery', () => {
        let rejectWrites = true;
        const storage = {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn(() => {
                if (rejectWrites) throw new Error('quota exceeded');
            }),
            removeItem: vi.fn()
        };
        ui.transcriptStore = new TranscriptStore(storage, 'tk');
        ui.transcriptElement.value = 'unsaved text';
        const statusSpy = vi.spyOn(ui, '_emitStatus');

        expect(ui.persistTranscript()).toBe(false);
        expect(ui.persistTranscript()).toBe(false);
        expect(statusSpy).toHaveBeenCalledTimes(1);
        expect(statusSpy).toHaveBeenCalledWith(MESSAGES.TRANSCRIPT_AUTOSAVE_FAILED, 'error');

        rejectWrites = false;
        expect(ui.persistTranscript()).toBe(true);

        rejectWrites = true;
        expect(ui.persistTranscript()).toBe(false);
        expect(statusSpy).toHaveBeenCalledTimes(2);
    });

    it('warns on a failed empty clear without changing Restore state', () => {
        const storage = {
            getItem: vi.fn().mockReturnValue(JSON.stringify({ text: 'recoverable', savedAt: Date.now() })),
            setItem: vi.fn(),
            removeItem: vi.fn(() => { throw new Error('storage unavailable'); })
        };
        ui.transcriptStore = new TranscriptStore(storage, 'tk');
        ui.transcriptElement.value = '';
        ui.updateRestoreAffordance();
        const statusSpy = vi.spyOn(ui, '_emitStatus');

        expect(ui.persistTranscript()).toBe(false);
        ui.updateRestoreAffordance();

        expect(ui.transcriptElement.value).toBe('');
        expect(ui.restoreButton.hidden).toBe(false);
        expect(statusSpy).toHaveBeenCalledWith(MESSAGES.TRANSCRIPT_AUTOSAVE_FAILED, 'error');
    });

    it('flushes the latest pending edit once on pagehide', () => {
        vi.useFakeTimers();
        try {
            ui.setupEventListeners();
            const inputListener = ui.transcriptElement.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'input');
            const inputHandler = inputListener?.[1];
            const pagehideListener = window.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'pagehide');
            const pagehideHandler = pagehideListener?.[1];
            const saveSpy = vi.spyOn(store, 'save');

            expect(pagehideHandler).toEqual(expect.any(Function));
            ui.transcriptElement.value = 'latest before navigation';
            inputHandler();
            pagehideHandler();

            expect(store.load()?.text).toBe('latest before navigation');
            expect(saveSpy).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(500);
            expect(saveSpy).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('registers the pagehide handler only once across repeated init calls', () => {
        vi.spyOn(ui, 'loadTheme').mockImplementation(() => {});
        vi.spyOn(ui, 'checkRecordingPrerequisites').mockReturnValue(false);
        const settings = { checkInitialSettings: vi.fn() };

        ui.init(settings, store);
        ui.init(settings, store);

        expect(window.addEventListener).toHaveBeenCalledTimes(1);
        expect(window.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    });

    it('debounces input autosave to the latest transcript', () => {
        vi.useFakeTimers();
        try {
            ui.setupEventListeners();
            const inputListener = ui.transcriptElement.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'input');
            expect(inputListener).toBeDefined();
            const inputHandler = inputListener?.[1];
            expect(inputHandler).toEqual(expect.any(Function));

            const persistSpy = vi.spyOn(ui, 'persistTranscript');
            const updateRestoreSpy = vi.spyOn(ui, 'updateRestoreAffordance');

            ui.transcriptElement.value = 'first';
            inputHandler();
            expect(updateRestoreSpy).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(300);
            ui.transcriptElement.value = 'latest';
            inputHandler();
            expect(updateRestoreSpy).toHaveBeenCalledTimes(2);

            vi.advanceTimersByTime(499);
            expect(store.load()).toBeNull();
            expect(persistSpy).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(store.load()?.text).toBe('latest');
            expect(persistSpy).toHaveBeenCalledTimes(1);
            expect(updateRestoreSpy).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });
});
