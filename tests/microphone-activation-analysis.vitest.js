/**
 * @fileoverview Focused test to identify the exact microphone activation issue.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { STORAGE_KEYS, ID } from '../js/constants.js';
import { generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
};
global.localStorage = localStorageMock;

// Mock DOM elements
const createMockElement = (initialValue = '') => ({
    value: initialValue,
    textContent: '',
    style: { display: '', opacity: 1, cursor: 'pointer' },
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
    },
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => ''),
    disabled: false,
    checked: false,
    focus: vi.fn(),
    scrollTop: 0,
    scrollHeight: 100,
    selectionStart: 0,
    selectionEnd: 0
});

// Mock document
global.document = {
    getElementById: vi.fn(() => createMockElement()),
    querySelector: vi.fn(() => createMockElement()),
    querySelectorAll: vi.fn(() => [createMockElement()]),
    body: {
        innerHTML: '',
        style: {},
        classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn(() => false)
        }
    }
};

// Mock window.matchMedia
global.window = {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn()
    }))
};

// Import modules after mocking
let Settings, UI;
beforeAll(async () => {
    ({ Settings } = await import('../js/settings.js'));
    ({ UI } = await import('../js/ui.js'));
});

describe('Microphone Activation Issue Analysis', () => {
    let settings;
    let ui;
    let micButton;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create a specific mic button mock
        micButton = createMockElement();
        micButton.disabled = true; // Start disabled
        
        // Mock document.getElementById for mic button specifically
        global.document.getElementById = vi.fn((id) => {
            if (id === ID.MIC_BUTTON) {
                return micButton;
            }
            if (id === ID.VISUALIZER) {
                return {
                    ...createMockElement(),
                    getContext: vi.fn(() => ({
                        fillStyle: '',
                        fillRect: vi.fn()
                    }))
                };
            }
            return createMockElement();
        });

        // Reset localStorage mock
        localStorageMock.getItem.mockReturnValue('whisper');
        
        settings = new Settings();
        ui = new UI();
        
        // Mock browser support to return true
        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
    });

    describe('Microphone State Management', () => {
        it('should start with microphone disabled and enable it when settings are valid', () => {
            // Verify initial state
            expect(micButton.disabled).toBe(true);
            
            // Setup valid configuration
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://test.openai.azure.com/whisper';
                    case STORAGE_KEYS.WHISPER_API_KEY:
                        return generateMockApiKeyForValidation();
                    default:
                        return null;
                }
            });
            
            // Simulate the UI initialization and settings relationship
            ui.settings = settings;
            
            // Manually call checkRecordingPrerequisites to see what happens
            const result = ui.checkRecordingPrerequisites();
            
            // The microphone should be enabled after valid prerequisites
            expect(result).toBe(true);
            expect(micButton.disabled).toBe(false);
        });

        it('should keep microphone disabled when settings are invalid', () => {
            // Verify initial state
            expect(micButton.disabled).toBe(true);
            
            // Setup invalid configuration (missing API key)
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://test.openai.azure.com/whisper';
                    case STORAGE_KEYS.WHISPER_API_KEY:
                        return null; // Missing API key
                    default:
                        return null;
                }
            });
            
            // Simulate the UI initialization and settings relationship
            ui.settings = settings;
            
            // Manually call checkRecordingPrerequisites to see what happens
            const result = ui.checkRecordingPrerequisites();
            
            // The microphone should remain disabled
            expect(result).toBe(false);
            expect(micButton.disabled).toBe(true);
        });

        it('should demonstrate the expected workflow: SETTINGS_UPDATED → checkRecordingPrerequisites → enableMicButton', () => {
            // Setup: Microphone starts disabled
            expect(micButton.disabled).toBe(true);
            
            // Setup: Valid configuration in localStorage
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://test.openai.azure.com/whisper';
                    case STORAGE_KEYS.WHISPER_API_KEY:
                        return generateMockApiKeyForValidation();
                    default:
                        return null;
                }
            });
            
            // Setup: Connect UI and settings
            ui.settings = settings;
            
            // Setup: Initialize UI event listeners (this is what happens in ui.init)
            ui.setupEventBusListeners();
            
            // Act: Emit SETTINGS_UPDATED event (this is what Settings.saveSettings() does)
            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
            
            // Verify: Microphone should now be enabled
            expect(micButton.disabled).toBe(false);
        });

        it('should check if UI also responds to SETTINGS_SAVED events', () => {
            // Setup: Microphone starts disabled
            expect(micButton.disabled).toBe(true);
            
            // Setup: Valid configuration in localStorage
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://test.openai.azure.com/whisper';
                    case STORAGE_KEYS.WHISPER_API_KEY:
                        return generateMockApiKeyForValidation();
                    default:
                        return null;
                }
            });
            
            // Setup: Connect UI and settings
            ui.settings = settings;
            
            // Setup: Initialize UI event listeners
            ui.setupEventBusListeners();
            
            // Act: Emit SETTINGS_SAVED event (this is also emitted by Settings.saveSettings())
            eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });
            
            // Verify: With the fix, UI now DOES listen to SETTINGS_SAVED
            // So microphone should now be enabled - this fixes the bug!
            expect(micButton.disabled).toBe(false);
        });
    });
});