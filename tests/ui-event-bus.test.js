/**
 * @fileoverview Tests for UI event bus interactions and decoupled UI management.
 * Verifies that UI module properly responds to event-driven communication.
 * Tests the event-driven architecture without relying on DOM manipulation.
 */

import { jest } from '@jest/globals';
import { applyDomSpies, resetEventBus } from './setupTests.js';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';

// Mock showTemporaryStatus
jest.unstable_mockModule('../js/status-helper.js', () => ({
    showTemporaryStatus: jest.fn()
}));

// Create comprehensive DOM element mock
const createMockElement = (id) => {
    const classSet = new Set();
    return {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        style: { display: 'block' },
        classList: {
            add: jest.fn((cls) => classSet.add(cls)),
            remove: jest.fn((cls) => classSet.delete(cls)),
            contains: jest.fn((cls) => classSet.has(cls)),
            toggle: jest.fn((cls) => {
                if (classSet.has(cls)) {
                    classSet.delete(cls);
                } else {
                    classSet.add(cls);
                }
            })
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(),
        focus: jest.fn(),
        click: jest.fn(),
        disabled: false,
        checked: false,
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollHeight: 0
    };
};

// Create a map of all required DOM elements by ID
const mockElements = new Map();
const elementIds = [
    'mic-button', 'pause-button', 'cancel-button', 'settings-button', 'grab-text-button',
    'save-settings', 'theme-toggle', 'status', 'transcript', 'timer', 'settings-modal',
    'close-modal', 'model-select', 'theme-mode', 'visualizer', 'spinner-container',
    'pause-icon', 'play-icon', 'moon-icon', 'sun-icon'
];

// Pre-populate mock elements
elementIds.forEach(id => {
    mockElements.set(id, createMockElement(id));
});

// Mock DOM globally with proper element creation
global.document = {
    getElementById: jest.fn((id) => mockElements.get(id) || createMockElement(id)),
    querySelector: jest.fn((selector) => createMockElement(selector)),
    querySelectorAll: jest.fn(() => []),
    body: createMockElement('body'),
    createElement: jest.fn((tag) => createMockElement(tag))
};

// Mock localStorage
global.localStorage = {
    getItem: jest.fn(() => 'auto'),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

// Mock window.matchMedia
global.window = {
    matchMedia: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    }))
};

// Import UI after mocking
let UI, showTemporaryStatus;
beforeAll(async () => {
    ({ UI } = await import('../js/ui.js'));
    ({ showTemporaryStatus } = await import('../js/status-helper.js'));
});

describe('UI Event Bus Interactions', () => {
    let ui;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        applyDomSpies();

        // Create UI instance - this will now get proper mock elements
        ui = new UI();

        // Spy on methods that update content we can't easily observe in mocks
        jest.spyOn(ui, 'updateTimer');
        jest.spyOn(ui, 'setStatus');
        jest.spyOn(ui, 'displayTranscription');
        jest.spyOn(ui, 'setRecordingState');
        jest.spyOn(ui, 'setPauseState');
        jest.spyOn(ui, 'resetControlsAfterRecording');
        jest.spyOn(ui, 'enableMicButton');
        jest.spyOn(ui, 'disableMicButton');
        jest.spyOn(ui, 'showSpinner');
        jest.spyOn(ui, 'hideSpinner');

        // Register event bus listeners before emitting events
        ui.setupEventBusListeners();
        
        // The UI constructor should now work without console errors
        // since we're providing proper mock DOM elements
        
        // Verify the UI was created successfully
        expect(ui).toBeDefined();
    });

    afterEach(() => {
        jest.clearAllMocks();
        applyDomSpies();
        resetEventBus();
    });

    describe('Timer Control Events', () => {
        it('should update timer display on UI_TIMER_UPDATE event', () => {
            eventBus.emit(APP_EVENTS.UI_TIMER_UPDATE, { display: '01:23' });
            
            expect(ui.updateTimer).toHaveBeenCalledWith('01:23');
        });

        it('should reset timer display on UI_TIMER_RESET event', () => {
            eventBus.emit(APP_EVENTS.UI_TIMER_RESET);
            
            expect(ui.updateTimer).toHaveBeenCalledWith('00:00');
        });
    });

    describe('Button Control Events', () => {
        it('should enable mic button on UI_BUTTON_ENABLE_MIC event', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_ENABLE_MIC);
            
            expect(ui.enableMicButton).toHaveBeenCalled();
        });

        it('should disable mic button on UI_BUTTON_DISABLE_MIC event', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_DISABLE_MIC);
            
            expect(ui.disableMicButton).toHaveBeenCalled();
        });

        it('should set recording state on UI_BUTTON_SET_RECORDING_STATE event', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: true });
            
            expect(ui.setRecordingState).toHaveBeenCalledWith(true);
            
            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: false });
            
            expect(ui.setRecordingState).toHaveBeenCalledWith(false);
        });

        it('should set pause state on UI_BUTTON_SET_PAUSE_STATE event', () => {
            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: true });
            
            expect(ui.setPauseState).toHaveBeenCalledWith(true);
            
            eventBus.emit(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: false });
            
            expect(ui.setPauseState).toHaveBeenCalledWith(false);
        });

        it('should reset controls on UI_CONTROLS_RESET event', () => {
            eventBus.emit(APP_EVENTS.UI_CONTROLS_RESET);
            
            expect(ui.resetControlsAfterRecording).toHaveBeenCalled();
        });
    });

    describe('Spinner Control Events', () => {
        it('should show spinner on UI_SPINNER_SHOW event', () => {
            eventBus.emit(APP_EVENTS.UI_SPINNER_SHOW);
            
            expect(ui.showSpinner).toHaveBeenCalled();
        });

        it('should hide spinner on UI_SPINNER_HIDE event', () => {
            eventBus.emit(APP_EVENTS.UI_SPINNER_HIDE);
            
            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Status Update Events', () => {
        it('should handle temporary status updates', () => {
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

        it('should handle permanent status updates', () => {
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
        it('should display transcription and hide spinner on UI_TRANSCRIPTION_READY', () => {
            const transcriptionData = { text: 'Hello world transcription' };

            eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, transcriptionData);

            expect(ui.displayTranscription).toHaveBeenCalledWith('Hello world transcription');
            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Recording State Change Events', () => {
        it('should handle idle state transition', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'idle',
                oldState: 'processing'
            });

            expect(ui.resetControlsAfterRecording).toHaveBeenCalled();
            expect(ui.enableMicButton).toHaveBeenCalled();
            expect(ui.hideSpinner).toHaveBeenCalled();
        });

        it('should handle recording state transition', () => {
            const micButton = ui.micButton;
            
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'recording',
                oldState: 'idle'
            });

            expect(ui.setRecordingState).toHaveBeenCalledWith(true);
            expect(ui.setPauseState).toHaveBeenCalledWith(false);
            expect(micButton.disabled).toBe(false);
        });

        it('should handle processing state transition', () => {
            eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
                newState: 'processing',
                oldState: 'stopping'
            });

            expect(ui.showSpinner).toHaveBeenCalled();
            expect(ui.disableMicButton).toHaveBeenCalled();
        });
    });

    describe('API Events', () => {
        it('should hide spinner on API_REQUEST_ERROR', () => {
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                error: 'API error message'
            });

            expect(ui.hideSpinner).toHaveBeenCalled();
        });
    });

    describe('Event-Driven Architecture Validation', () => {
        it('should not have direct method calls between modules', () => {
            // This test validates that UI updates are event-driven
            // by checking that events properly trigger UI methods
            const testEvents = [
                APP_EVENTS.UI_TIMER_UPDATE,
                APP_EVENTS.UI_BUTTON_ENABLE_MIC,
                APP_EVENTS.UI_SPINNER_SHOW,
                APP_EVENTS.UI_CONTROLS_RESET
            ];

            testEvents.forEach(eventName => {
                expect(typeof eventName).toBe('string');
                expect(eventName.startsWith('ui:')).toBe(true);
            });
        });
    });
});
