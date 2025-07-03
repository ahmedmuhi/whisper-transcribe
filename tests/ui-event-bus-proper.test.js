/**
 * @fileoverview Tests for UI event bus interactions and decoupled UI management.
 * Verifies that UI module properly responds to event-driven communication.
 * Tests the event-driven architecture by spying on UI method calls.
 */

import { jest } from '@jest/globals';
import { applyDomSpies } from './setupTests.js';

// Mock DOM completely to prevent any real DOM access
global.document = {
    getElementById: jest.fn().mockReturnValue({
        style: { display: 'block' },
        classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
        addEventListener: jest.fn(),
        textContent: '',
        disabled: false,
        value: ''
    }),
    body: { classList: { add: jest.fn(), remove: jest.fn() } }
};

global.localStorage = {
    getItem: jest.fn().mockReturnValue('auto'),
    setItem: jest.fn()
};

global.window = {
    matchMedia: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn()
    }))
};

// Mock status helper
jest.unstable_mockModule('../js/status-helper.js', () => ({
    showTemporaryStatus: jest.fn()
}));

// Import modules after mocking
const { eventBus, APP_EVENTS } = await import('../js/event-bus.js');
const { UI } = await import('../js/ui.js');
const { showTemporaryStatus } = await import('../js/status-helper.js');

describe('UI Event Bus Communication', () => {
    let ui;

    beforeEach(() => {
        applyDomSpies();
        // Create UI instance
        ui = new UI();
        
        // Spy on UI methods to verify they're called correctly
        jest.spyOn(ui, 'updateTimer');
        jest.spyOn(ui, 'enableMicButton');
        jest.spyOn(ui, 'disableMicButton');
        jest.spyOn(ui, 'setRecordingState');
        jest.spyOn(ui, 'setPauseState');
        jest.spyOn(ui, 'resetControlsAfterRecording');
        jest.spyOn(ui, 'showSpinner');
        jest.spyOn(ui, 'hideSpinner');
        jest.spyOn(ui, 'setStatus');
        jest.spyOn(ui, 'displayTranscription');

        // Set up event listeners after creating spies
        ui.setupEventBusListeners();

        // Clear mock call history
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
        applyDomSpies();
    });

    describe('Timer Events', () => {
        it('should call updateTimer when UI_TIMER_UPDATE is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_TIMER_UPDATE, { display: '01:23' });
            
            expect(ui.updateTimer).toHaveBeenCalledWith('01:23');
        });

        it('should call updateTimer with 00:00 when UI_TIMER_RESET is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_TIMER_RESET);
            
            expect(ui.updateTimer).toHaveBeenCalledWith('00:00');
        });
    });

    describe('Button Control Events', () => {
        it('should call enableMicButton when UI_BUTTON_ENABLE_MIC is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_ENABLE_MIC);
            
            expect(ui.enableMicButton).toHaveBeenCalled();
        });

        it('should call disableMicButton when UI_BUTTON_DISABLE_MIC is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_DISABLE_MIC);
            
            expect(ui.disableMicButton).toHaveBeenCalled();
        });

        it('should call setRecordingState when UI_BUTTON_SET_RECORDING_STATE is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: true });
            
            expect(ui.setRecordingState).toHaveBeenCalledWith(true);

            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: false });
            
            expect(ui.setRecordingState).toHaveBeenCalledWith(false);
        });

        it('should call setPauseState when UI_BUTTON_SET_PAUSE_STATE is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: true });
            
            expect(ui.setPauseState).toHaveBeenCalledWith(true);

            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: false });
            
            expect(ui.setPauseState).toHaveBeenCalledWith(false);
        });

        it('should call resetControlsAfterRecording when UI_CONTROLS_RESET is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_CONTROLS_RESET);
            
            expect(ui.resetControlsAfterRecording).toHaveBeenCalled();
        });
    });

    describe('Spinner Control Events', () => {
        it('should call showSpinner when UI_SPINNER_SHOW is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_SPINNER_SHOW);
            
            expect(ui.showSpinner).toHaveBeenCalled();
        });

        it('should call hideSpinner when UI_SPINNER_HIDE is emitted', () => {
            eventBus.emit(APP_EVENTS.UI_SPINNER_HIDE);
            
            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Status Update Events', () => {
        it('should call showTemporaryStatus for temporary status updates', () => {
            const statusData = {
                message: 'Test message',
                type: 'info',
                temporary: true,
                duration: 2000,
                resetMessage: 'Reset message'
            };

            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, statusData);

            expect(showTemporaryStatus).toHaveBeenCalledWith(
                ui.statusElement,
                'Test message',
                'info',
                2000,
                'Reset message'
            );
        });

        it('should call setStatus for permanent status updates', () => {
            const statusData = {
                message: 'Permanent message',
                type: 'error',
                temporary: false
            };

            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, statusData);

            expect(ui.setStatus).toHaveBeenCalledWith('Permanent message');
            expect(showTemporaryStatus).not.toHaveBeenCalled();
        });
    });

    describe('Transcription Events', () => {
        it('should call displayTranscription and hideSpinner on UI_TRANSCRIPTION_READY', () => {
            const transcriptionData = { text: 'Hello world transcription' };

            eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, transcriptionData);

            expect(ui.displayTranscription).toHaveBeenCalledWith('Hello world transcription');
            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Recording State Change Events', () => {
        it('should handle idle state transition correctly', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'idle',
                oldState: 'processing'
            });

            expect(ui.resetControlsAfterRecording).toHaveBeenCalled();
            expect(ui.enableMicButton).toHaveBeenCalled();
            expect(ui.hideSpinner).toHaveBeenCalled();
        });

        it('should handle recording state transition correctly', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'recording',
                oldState: 'idle'
            });

            expect(ui.setRecordingState).toHaveBeenCalledWith(true);
            expect(ui.setPauseState).toHaveBeenCalledWith(false);
            expect(ui.enableMicButton).toHaveBeenCalled();
        });

        it('should handle processing state transition correctly', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'processing',
                oldState: 'stopping'
            });

            expect(ui.showSpinner).toHaveBeenCalled();
            expect(ui.disableMicButton).toHaveBeenCalled();
        });

        it('should handle paused state transition correctly', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'paused',
                oldState: 'recording'
            });

            expect(ui.setPauseState).toHaveBeenCalledWith(true);
        });

        it('should handle error state transition correctly', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'error',
                oldState: 'recording'
            });

            expect(ui.resetControlsAfterRecording).toHaveBeenCalled();
            expect(ui.enableMicButton).toHaveBeenCalled();
            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('API Events', () => {
        it('should call hideSpinner on API_REQUEST_ERROR', () => {
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                error: 'API error message'
            });

            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Event-Driven Architecture Validation', () => {
        it('should have proper event naming conventions', () => {
            const uiEvents = Object.keys(APP_EVENTS).filter(key => key.startsWith('UI_'));
            
            expect(uiEvents.length).toBeGreaterThan(0);
            uiEvents.forEach(eventKey => {
                expect(APP_EVENTS[eventKey]).toMatch(/^ui:/);
            });
        });

        it('should respond to all UI control events without errors', () => {
            const uiControlEvents = [
                { event: APP_EVENTS.UI_TIMER_UPDATE, data: { display: '00:01' } },
                { event: APP_EVENTS.UI_TIMER_RESET },
                { event: APP_EVENTS.UI_BUTTON_ENABLE_MIC },
                { event: APP_EVENTS.UI_BUTTON_DISABLE_MIC },
                { event: APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, data: { isRecording: false } },
                { event: APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, data: { isPaused: false } },
                { event: APP_EVENTS.UI_CONTROLS_RESET },
                { event: APP_EVENTS.UI_SPINNER_SHOW },
                { event: APP_EVENTS.UI_SPINNER_HIDE }
            ];

            // All these events should be handled without throwing errors
            uiControlEvents.forEach(({ event, data }) => {
                expect(() => {
                    eventBus.emit(event, data);
                }).not.toThrow();
            });
        });
    });
});
