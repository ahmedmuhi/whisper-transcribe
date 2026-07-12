/**
 * @fileoverview Tests for UI event-bus interactions after the dual-dispatch removal.
 * Recording controls are derived from a single source of truth — the FSM state —
 * via renderControls(). The UI no longer reacts to granular UI_BUTTON_* events;
 * it renders the labelled guided-morph cluster from RECORDING_STATE_CHANGED.
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
const { RECORDING_STATES, MESSAGES } = await import('../js/constants.js');
const { UI } = await import('../js/ui.js');
const { showTemporaryStatus } = await import('../js/status-helper.js');

describe('UI Event Bus Communication', () => {
    let ui;

    beforeEach(() => {
        applyDomSpies();
        ui = new UI();
        ui.ready = true; // prerequisites met, so IDLE enables the primary control
        ui.setupEventBusListeners();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
        resetEventBus();
    });

    describe('Timer Events', () => {
        it('updates the timer on UI_TIMER_UPDATE', () => {
            vi.spyOn(ui, 'updateTimer');
            eventBus.emit(APP_EVENTS.UI_TIMER_UPDATE, { display: '01:23' });
            expect(ui.updateTimer).toHaveBeenCalledWith('01:23');
        });

        it('resets the timer to 00:00 on UI_TIMER_RESET', () => {
            vi.spyOn(ui, 'updateTimer');
            eventBus.emit(APP_EVENTS.UI_TIMER_RESET);
            expect(ui.updateTimer).toHaveBeenCalledWith('00:00');
        });
    });

    describe('Status Update Events', () => {
        it('routes temporary updates through showTemporaryStatus', () => {
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: 'Test message', type: 'info', temporary: true, duration: 2000, resetMessage: 'Reset message'
            });
            expect(showTemporaryStatus).toHaveBeenCalledWith(ui.statusElement, 'Test message', 'info', 2000, 'Reset message');
        });

        it('routes permanent updates through setStatus', () => {
            vi.spyOn(ui, 'setStatus');
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, { message: 'Permanent message', type: 'error', temporary: false });
            expect(ui.setStatus).toHaveBeenCalledWith('Permanent message');
            expect(showTemporaryStatus).not.toHaveBeenCalled();
        });
    });

    describe('Transcription + API Events', () => {
        it('displays transcription and hides the spinner on UI_TRANSCRIPTION_READY', () => {
            vi.spyOn(ui, 'displayTranscription');
            vi.spyOn(ui, 'hideSpinner');
            eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, { text: 'Hello world transcription' });
            expect(ui.displayTranscription).toHaveBeenCalledWith('Hello world transcription');
            expect(ui.hideSpinner).toHaveBeenCalled();
        });

        it('hides the spinner on API_REQUEST_ERROR', () => {
            vi.spyOn(ui, 'hideSpinner');
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, { error: 'API error message' });
            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Control rendering (single source of truth)', () => {
        const render = (newState, data = {}) =>
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, { newState, oldState: 'idle', ...data });

        it('IDLE shows an enabled Start primary and hides the rest', () => {
            render(RECORDING_STATES.IDLE);
            expect(ui.primaryAction.hidden).toBe(false);
            expect(ui.primaryAction.disabled).toBe(false); // ui.ready === true
            expect(ui.primaryAction.textContent).toBe(MESSAGES.CONTROL_START);
            expect(ui.secondaryAction.hidden).toBe(true);
            expect(ui.discardAction.hidden).toBe(true);
            expect(ui.retryAction.hidden).toBe(true);
        });

        it('RECORDING morphs the primary to Done and reveals Pause + Discard', () => {
            render(RECORDING_STATES.RECORDING);
            expect(ui.primaryAction.textContent).toBe(MESSAGES.CONTROL_DONE);
            expect(ui.primaryAction.disabled).toBe(false);
            expect(ui.secondaryAction.hidden).toBe(false);
            expect(ui.secondaryAction.textContent).toBe(MESSAGES.CONTROL_PAUSE);
            expect(ui.discardAction.hidden).toBe(false);
            expect(ui.retryAction.hidden).toBe(true);
        });

        it('PAUSED labels the secondary Resume', () => {
            render(RECORDING_STATES.PAUSED);
            expect(ui.secondaryAction.hidden).toBe(false);
            expect(ui.secondaryAction.textContent).toBe(MESSAGES.CONTROL_RESUME);
            expect(ui.discardAction.hidden).toBe(false);
        });

        it('PROCESSING disables the primary and shows the spinner', () => {
            render(RECORDING_STATES.PROCESSING);
            expect(ui.primaryAction.disabled).toBe(true);
            expect(ui.spinnerContainer.style.display).toBe('block');
        });

        it('ERROR reveals Retry only when canRetry is set', () => {
            render(RECORDING_STATES.ERROR, { canRetry: true });
            expect(ui.retryAction.hidden).toBe(false);

            render(RECORDING_STATES.ERROR, { canRetry: false });
            expect(ui.retryAction.hidden).toBe(true);
        });

        it('CONFIRMING_DISCARD keeps the cluster inert (primary disabled, secondary/discard hidden)', () => {
            render(RECORDING_STATES.CONFIRMING_DISCARD);
            expect(ui.primaryAction.disabled).toBe(true);
            expect(ui.secondaryAction.hidden).toBe(true);
            expect(ui.discardAction.hidden).toBe(true);
        });

        it('INITIALIZING / STOPPING / CANCELLING disable the primary with the right label', () => {
            render(RECORDING_STATES.INITIALIZING);
            expect(ui.primaryAction.disabled).toBe(true);
            expect(ui.primaryAction.textContent).toBe(MESSAGES.CONTROL_STARTING);

            render(RECORDING_STATES.STOPPING);
            expect(ui.primaryAction.disabled).toBe(true);
            expect(ui.primaryAction.textContent).toBe(MESSAGES.CONTROL_FINISHING);

            render(RECORDING_STATES.CANCELLING);
            expect(ui.primaryAction.disabled).toBe(true);
        });

        it('ERROR keeps the primary enabled even when not ready (always an escape)', () => {
            ui.ready = false;
            render(RECORDING_STATES.ERROR, { canRetry: false });
            expect(ui.primaryAction.disabled).toBe(false); // escape hatch, regardless of ready
            expect(ui.retryAction.hidden).toBe(true);
        });

        it('keeps Retry visible across a bare re-render in ERROR (canRetry persisted)', () => {
            render(RECORDING_STATES.ERROR, { canRetry: true });
            expect(ui.retryAction.hidden).toBe(false);
            // A prerequisite re-check (_setReady) re-renders ERROR with no transition
            // data — Retry must NOT vanish (regression guard for the canRetry bug).
            ui._setReady(true);
            expect(ui.retryAction.hidden).toBe(false);
            expect(ui.currentState).toBe(RECORDING_STATES.ERROR);
        });
    });

    describe('Control intents', () => {
        const clickHandlerFor = (el) => el.addEventListener.mock.calls.find(([evt]) => evt === 'click')[1];

        beforeEach(() => {
            ui.setupEventListeners();
        });

        it('primary emits MIC_BUTTON_CLICKED', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            clickHandlerFor(ui.primaryAction)();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.MIC_BUTTON_CLICKED);
        });

        it('secondary emits PAUSE_BUTTON_CLICKED', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            clickHandlerFor(ui.secondaryAction)();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.PAUSE_BUTTON_CLICKED);
        });

        it('discard emits DISCARD_BUTTON_CLICKED', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            clickHandlerFor(ui.discardAction)();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.DISCARD_BUTTON_CLICKED);
        });

        it('retry emits RETRY_BUTTON_CLICKED', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            clickHandlerFor(ui.retryAction)();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RETRY_BUTTON_CLICKED);
        });
    });

    describe('Discard dialog', () => {
        it('opens (showModal) with the stakes named when the dialog is supported', () => {
            ui.discardDialog.showModal = vi.fn();
            const emitSpy = vi.spyOn(eventBus, 'emit');
            eventBus.emit(APP_EVENTS.DISCARD_CONFIRM_REQUESTED, { durationLabel: '24:31' });
            expect(ui.discardDialogBody.textContent).toBe('Discard 24:31 of recording?');
            expect(ui.discardDialog.showModal).toHaveBeenCalled();
            expect(emitSpy).not.toHaveBeenCalledWith(APP_EVENTS.DISCARD_KEPT);
        });

        it('falls back to Keep (never strands the FSM) when showModal is unavailable', () => {
            // The applyDomSpies dialog stub has no showModal — the unsupported path.
            const emitSpy = vi.spyOn(eventBus, 'emit');
            eventBus.emit(APP_EVENTS.DISCARD_CONFIRM_REQUESTED, { durationLabel: '24:31' });
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.DISCARD_KEPT);
        });

        it('falls back to Keep when showModal throws', () => {
            ui.discardDialog.open = false;
            ui.discardDialog.showModal = vi.fn(() => {
                throw new Error('native dialog failed');
            });
            const emitSpy = vi.spyOn(eventBus, 'emit');

            eventBus.emit(APP_EVENTS.DISCARD_CONFIRM_REQUESTED, { durationLabel: '24:31' });

            expect(ui.discardDialog.showModal).toHaveBeenCalledTimes(1);
            expect(emitSpy.mock.calls.filter(([event]) => event === APP_EVENTS.DISCARD_KEPT)).toHaveLength(1);
            expect(emitSpy).not.toHaveBeenCalledWith(APP_EVENTS.DISCARD_CONFIRMED);
        });
    });

    describe('Discard dialog outcomes (safety-critical)', () => {
        const handlerFor = (el, evt) => el.addEventListener.mock.calls.find(([e]) => e === evt)[1];

        beforeEach(() => {
            ui.setupEventListeners();
        });

        it('Keep emits DISCARD_KEPT', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            handlerFor(ui.discardKeepButton, 'click')();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.DISCARD_KEPT);
        });

        it('Discard emits DISCARD_CONFIRMED', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            handlerFor(ui.discardConfirmButton, 'click')();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.DISCARD_CONFIRMED);
        });

        it('Escape (cancel) keeps the recording — never discards', () => {
            const emitSpy = vi.spyOn(eventBus, 'emit');
            const preventDefault = vi.fn();
            handlerFor(ui.discardDialog, 'cancel')({ preventDefault });
            expect(preventDefault).toHaveBeenCalled();
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.DISCARD_KEPT);
            expect(emitSpy).not.toHaveBeenCalledWith(APP_EVENTS.DISCARD_CONFIRMED);
        });
    });

    describe('Label rendering (production .btn-label path)', () => {
        it('writes the label to the .btn-label child and to aria-label', () => {
            const labelEl = { textContent: '' };
            ui.primaryAction.querySelector = vi.fn((sel) => (sel === '.btn-label' ? labelEl : null));
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, { newState: RECORDING_STATES.RECORDING, oldState: 'idle' });
            expect(labelEl.textContent).toBe(MESSAGES.CONTROL_DONE);
            expect(ui.primaryAction.setAttribute).toHaveBeenCalledWith('aria-label', MESSAGES.CONTROL_DONE);
        });
    });

    describe('Event-Driven Architecture Validation', () => {
        it('keeps UI_ events on the ui: namespace', () => {
            const uiEvents = Object.keys(APP_EVENTS).filter((key) => key.startsWith('UI_'));
            expect(uiEvents.length).toBeGreaterThan(0);
            uiEvents.forEach((eventKey) => expect(APP_EVENTS[eventKey]).toMatch(/^ui:/));
        });

        it('renders every recording state without throwing', () => {
            for (const state of Object.values(RECORDING_STATES)) {
                expect(() => eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, { newState: state, oldState: 'idle' })).not.toThrow();
            }
        });
    });
});
