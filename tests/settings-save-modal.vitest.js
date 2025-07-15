/**
 * @fileoverview Tests for Settings modal save functionality.
 * Tests the complete save workflow including validation, persistence, and modal closure.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { STORAGE_KEYS, MESSAGES } from '../js/constants.js';

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
        style: {}
    }
};

// Import Settings after mocking
let Settings;
beforeAll(async () => {
    ({ Settings } = await import('../js/settings.js'));
});

describe('Settings Modal Save Functionality', () => {
    let settings;
    let mockModelSelect;
    let mockSettingsModelSelect;
    let mockWhisperUriInput;
    let mockWhisperKeyInput;
    let mockGpt4oUriInput;
    let mockGpt4oKeyInput;
    let mockSettingsModal;
    let eventSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue('whisper');

        // Create mock elements with specific test values
        mockModelSelect = createMockElement('whisper');
        mockSettingsModelSelect = createMockElement('whisper');
        mockWhisperUriInput = createMockElement('https://test.openai.azure.com/whisper');
        mockWhisperKeyInput = createMockElement('sk-1234567890abcdef1234567890abcdef12345678');
        mockGpt4oUriInput = createMockElement('https://test.openai.azure.com/gpt4o');
        mockGpt4oKeyInput = createMockElement('sk-9876543210fedcba9876543210fedcba87654321');
        mockSettingsModal = createMockElement();
        mockSettingsModal.style.display = 'block'; // Modal is open initially

        // Mock document.getElementById to return our specific mock elements
        global.document.getElementById = vi.fn((id) => {
            switch (id) {
                case 'model-select':
                    return mockModelSelect;
                case 'settings-model-select':
                    return mockSettingsModelSelect;
                case 'whisper-uri':
                    return mockWhisperUriInput;
                case 'whisper-key':
                    return mockWhisperKeyInput;
                case 'gpt4o-uri':
                    return mockGpt4oUriInput;
                case 'gpt4o-key':
                    return mockGpt4oKeyInput;
                case 'settings-modal':
                    return mockSettingsModal;
                default:
                    return createMockElement();
            }
        });

        settings = new Settings();
        eventSpy = vi.spyOn(eventBus, 'emit');
    });

    afterEach(() => {
        vi.clearAllMocks();
        eventSpy.mockRestore();
    });

    describe('Save Settings with Valid Configuration', () => {
        it('should save valid Whisper configuration and close modal', () => {
            // Set up valid Whisper configuration
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockWhisperKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';

            // Call saveSettings
            settings.saveSettings();

            // Verify localStorage calls
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://test.openai.azure.com/whisper'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                'sk-1234567890abcdef1234567890abcdef12345678'
            );

            // Verify modal is closed
            expect(mockSettingsModal.style.display).toBe('none');

            // Verify success events are emitted
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.SETTINGS_SAVED,
                    type: 'success',
                    temporary: true
                })
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );
        });

        it('should save valid GPT-4o configuration and close modal', () => {
            // Set up valid GPT-4o configuration
            mockSettingsModelSelect.value = 'gpt-4o-transcribe';
            mockGpt4oUriInput.value = 'https://test.openai.azure.com/gpt4o';
            mockGpt4oKeyInput.value = 'sk-9876543210fedcba9876543210fedcba87654321';

            // Call saveSettings
            settings.saveSettings();

            // Verify localStorage calls
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.GPT4O_URI,
                'https://test.openai.azure.com/gpt4o'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.GPT4O_API_KEY,
                'sk-9876543210fedcba9876543210fedcba87654321'
            );

            // Verify modal is closed
            expect(mockSettingsModal.style.display).toBe('none');

            // Verify success events are emitted
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.SETTINGS_SAVED,
                    type: 'success'
                })
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: 'gpt-4o-transcribe',
                    hasUri: true,
                    hasApiKey: true
                })
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'gpt-4o-transcribe',
                    hasUri: true,
                    hasApiKey: true
                })
            );
        });
    });

    describe('Save Settings with Invalid Configuration', () => {
        it('should not close modal when API key is missing', () => {
            // Set up invalid configuration - missing API key
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockWhisperKeyInput.value = ''; // Empty API key

            // Call saveSettings
            settings.saveSettings();

            // Verify modal remains open
            expect(mockSettingsModal.style.display).toBe('block');

            // Verify no localStorage calls were made
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            // Verify error status is shown
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            // Verify no success events are emitted
            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.anything()
            );

            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });

        it('should not close modal when URI is invalid', () => {
            // Set up invalid configuration - invalid URI
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = 'http://insecure.com'; // HTTP instead of HTTPS
            mockWhisperKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';

            // Call saveSettings
            settings.saveSettings();

            // Verify modal remains open
            expect(mockSettingsModal.style.display).toBe('block');

            // Verify no localStorage calls were made
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            // Verify error status is shown
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });

        it('should not close modal when API key format is invalid', () => {
            // Set up invalid configuration - invalid API key format
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockWhisperKeyInput.value = 'invalid-key-format';

            // Call saveSettings
            settings.saveSettings();

            // Verify modal remains open
            expect(mockSettingsModal.style.display).toBe('block');

            // Verify no localStorage calls were made
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            // Verify error status is shown
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });
    });

    describe('Input Sanitization During Save', () => {
        it('should trim whitespace from inputs before saving', () => {
            // Set up configuration with whitespace
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = '  https://test.openai.azure.com/whisper  ';
            mockWhisperKeyInput.value = '  sk-1234567890abcdef1234567890abcdef12345678  ';

            // Call saveSettings
            settings.saveSettings();

            // Verify trimmed values are saved
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://test.openai.azure.com/whisper'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                'sk-1234567890abcdef1234567890abcdef12345678'
            );

            // Verify modal is closed
            expect(mockSettingsModal.style.display).toBe('none');
        });

        it('should remove newlines and tabs from API key', () => {
            // Set up configuration with special characters
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockWhisperKeyInput.value = 'sk-1234567890abcdef\n1234567890abcdef\t12345678';

            // Call saveSettings
            settings.saveSettings();

            // Verify cleaned API key is saved
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                'sk-1234567890abcdef1234567890abcdef12345678'
            );
        });
    });

    describe('Event Emission During Save Process', () => {
        it('should emit validation error event for invalid configuration', () => {
            // Set up invalid configuration
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = '';
            mockWhisperKeyInput.value = '';

            // Call saveSettings
            settings.saveSettings();

            // Verify validation error event is emitted
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([
                        expect.stringContaining('API key'),
                        expect.stringContaining('URI')
                    ])
                })
            );
        });

        it('should emit all required events for successful save', () => {
            // Set up valid configuration
            mockSettingsModelSelect.value = 'whisper';
            mockWhisperUriInput.value = 'https://test.openai.azure.com/whisper';
            mockWhisperKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';

            // Call saveSettings
            settings.saveSettings();

            // Verify all success events are emitted
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.SETTINGS_SAVED,
                    type: 'success',
                    temporary: true
                })
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_UPDATED
            );

            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );
        });
    });
});