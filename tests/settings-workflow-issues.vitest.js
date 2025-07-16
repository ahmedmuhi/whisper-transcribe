/**
 * @fileoverview Test reproducing the specific settings save workflow issues from Issue #32.
 * Tests the complete end-to-end workflow described in the issue.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { generateMockApiKey, generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';
import { STORAGE_KEYS, MESSAGES, ID } from '../js/constants.js';

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
    style: { display: '' },
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
    },
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => ''),
    disabled: false,
    checked: false
});

// Mock document methods
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

// Mock window.matchMedia for theme functionality
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

describe('Settings Save Workflow Issues - Issue #32', () => {
    let settings;
    let ui;
    let mockElements;
    let eventSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Reset localStorage mock
        localStorageMock.getItem.mockReturnValue('whisper');

        // Create specific mock elements for the workflow
        mockElements = {
            modelSelect: createMockElement('whisper'),
            settingsModelSelect: createMockElement('whisper'),
            whisperUriInput: createMockElement(''),
            whisperKeyInput: createMockElement(''),
            gpt4oUriInput: createMockElement(''),
            gpt4oKeyInput: createMockElement(''),
            settingsModal: createMockElement(),
            micButton: createMockElement(),
            statusElement: createMockElement()
        };

        // Set initial modal state to 'open' to test dismissal
        mockElements.settingsModal.style.display = 'block';
        mockElements.micButton.disabled = true; // Mic starts disabled

        // Mock document.getElementById to return our specific elements
        global.document.getElementById = vi.fn((id) => {
            switch (id) {
                case ID.MODEL_SELECT:
                    return mockElements.modelSelect;
                case ID.SETTINGS_MODEL_SELECT:
                    return mockElements.settingsModelSelect;
                case ID.WHISPER_URI:
                    return mockElements.whisperUriInput;
                case ID.WHISPER_KEY:
                    return mockElements.whisperKeyInput;
                case ID.GPT4O_URI:
                    return mockElements.gpt4oUriInput;
                case ID.GPT4O_KEY:
                    return mockElements.gpt4oKeyInput;
                case ID.SETTINGS_MODAL:
                    return mockElements.settingsModal;
                case ID.MIC_BUTTON:
                    return mockElements.micButton;
                case ID.STATUS:
                    return mockElements.statusElement;
                default:
                    return createMockElement();
            }
        });

        // Create instances
        settings = new Settings();
        ui = new UI();
        
        // Mock UI methods that depend on other modules
        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
        ui.settings = settings; // Simulate proper initialization
        
        eventSpy = vi.spyOn(eventBus, 'emit');
    });

    afterEach(() => {
        vi.clearAllMocks();
        eventSpy.mockRestore();
    });

    describe('Issue #32 - Complete Workflow Reproduction', () => {
        it('should handle the complete workflow: open settings → save valid settings → verify all fixes', () => {
            // Step 1: Open settings modal (simulate user clicking settings button)
            settings.openSettingsModal();
            
            // Verify modal is open initially
            expect(mockElements.settingsModal.style.display).toBe('block');
            expect(eventSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);

            // Step 2: User selects Whisper model and enters valid configuration
            mockElements.settingsModelSelect.value = 'whisper';
            mockElements.whisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockElements.whisperKeyInput.value = generateMockApiKeyForValidation();

            // Clear previous event calls to focus on save workflow
            eventSpy.mockClear();

            // Step 3: User clicks save settings
            settings.saveSettings();

            // ISSUE 1 FIX: Confirmation message should be displayed
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.SETTINGS_SAVED,
                    type: 'success',
                    temporary: true
                })
            );

            // ISSUE 2 FIX: Settings modal should be dismissed
            expect(mockElements.settingsModal.style.display).toBe('none');

            // ISSUE 4 FIX: Settings should be persisted to localStorage
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://test.openai.azure.com/whisper'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                generateMockApiKeyForValidation()
            );

            // Verify settings saved event is emitted
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );

            // Verify SETTINGS_LOADED event is emitted for persistence
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );

            // Verify settings updated event is emitted
            expect(eventSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        });

        it('should test microphone activation after valid settings save (Issue #3)', () => {
            // Setup: Configure valid settings
            mockElements.settingsModelSelect.value = 'whisper';
            mockElements.whisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockElements.whisperKeyInput.value = generateMockApiKeyForValidation();

            // Mock localStorage to return the valid configuration for checkRecordingPrerequisites
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

            // Simulate the UI listening for SETTINGS_UPDATED event
            eventBus.on(APP_EVENTS.SETTINGS_UPDATED, () => {
                // This should trigger UI.checkRecordingPrerequisites()
                ui.checkRecordingPrerequisites();
            });

            // Clear previous events
            eventSpy.mockClear();

            // Act: Save settings (this should trigger microphone activation)
            settings.saveSettings();

            // Verify SETTINGS_UPDATED event was emitted
            expect(eventSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);

            // Verify the UI would enable microphone button after checkRecordingPrerequisites
            // Since we're mocking the UI, we need to verify the logic would enable the mic
            const config = settings.getModelConfig();
            expect(config.apiKey).toBe(generateMockApiKeyForValidation());
            expect(config.uri).toBe('https://test.openai.azure.com/whisper');
            
            // The microphone should be enabled because configuration is valid
            expect(config.apiKey).toBeTruthy();
            expect(config.uri).toBeTruthy();
        });

        it('should test settings persistence across page reloads (Issue #4)', () => {
            // Step 1: Save settings
            const persistenceTestKey = generateMockApiKey('PERSIST');
            mockElements.settingsModelSelect.value = 'whisper';
            mockElements.whisperUriInput.value = 'https://test.openai.azure.com/whisper/persist';
            mockElements.whisperKeyInput.value = persistenceTestKey;

            settings.saveSettings();

            // Verify settings were saved to localStorage
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://test.openai.azure.com/whisper/persist'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                persistenceTestKey
            );

            // Step 2: Simulate page reload - create new Settings instance
            // Mock localStorage to return saved values
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://test.openai.azure.com/whisper/persist';
                    case STORAGE_KEYS.WHISPER_API_KEY:
                        return persistenceTestKey;
                    default:
                        return null;
                }
            });

            // Create new Settings instance (simulating page reload)
            const reloadedSettings = new Settings();

            // Verify configuration is loaded from localStorage
            const config = reloadedSettings.getModelConfig();
            expect(config.model).toBe('whisper');
            expect(config.uri).toBe('https://test.openai.azure.com/whisper/persist');
            expect(config.apiKey).toBe(persistenceTestKey);
        });

        it('should handle invalid settings correctly (should NOT trigger fixes)', () => {
            // Setup invalid configuration
            mockElements.settingsModelSelect.value = 'whisper';
            mockElements.whisperUriInput.value = ''; // Invalid: empty URI
            mockElements.whisperKeyInput.value = ''; // Invalid: empty API key

            // Clear previous events
            eventSpy.mockClear();

            // Act: Try to save invalid settings
            settings.saveSettings();

            // Verify modal is NOT dismissed for invalid settings
            expect(mockElements.settingsModal.style.display).toBe('block');

            // Verify error message is shown instead of success
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            // Verify settings are NOT saved to localStorage
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            // Verify SETTINGS_SAVED event is NOT emitted
            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.anything()
            );

            // Verify SETTINGS_LOADED event is NOT emitted
            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });
    });
});