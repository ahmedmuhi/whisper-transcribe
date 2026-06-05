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
    matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn() }))
};

vi.mock('../js/status-helper.js', () => ({
    showTemporaryStatus: vi.fn()
}));

const { eventBus, APP_EVENTS } = await import('../js/event-bus.js');
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

    it('no-ops cleanly when no store is wired (back-compat)', () => {
        ui.transcriptStore = null;
        expect(() => ui.persistTranscript()).not.toThrow();
        expect(() => ui.restoreTranscriptIfEmpty()).not.toThrow();
    });
});
