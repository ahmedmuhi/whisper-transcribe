/**
 * @fileoverview Tests for Settings module persistence and configuration management.
 * Verifies localStorage persistence, validation, and event bus communication.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { STORAGE_KEYS, ID } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

// Mock dependencies
vi.mock('../js/logger.js', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
    },
}));
vi.mock('../js/status-helper.js', () => ({
    showTemporaryStatus: vi.fn(),
}));

// Mock localStorage using Jest spies on the Storage prototype
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};

// Define localStorage methods before modules are imported
Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});

// Also set global localStorage for ES modules
global.localStorage = localStorageMock;

// Dynamically import Settings after mocks are set up
let Settings;
beforeAll(async () => {
    Settings = (await import('../js/settings.js')).Settings;
});

describe('Settings Persistence & Management', () => {
    let settings;
    let eventBusEmitSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Reset localStorage mock return values
        localStorageMock.getItem.mockReturnValue(null);
        localStorageMock.clear();
        
        // Ensure all required elements exist and reset their values
        const requiredIds = [
            ID.MODEL_SELECT, ID.SETTINGS_MODAL, ID.CLOSE_MODAL, ID.SAVE_SETTINGS,
            ID.SETTINGS_BUTTON, ID.STATUS, ID.WHISPER_SETTINGS, ID.GPT4O_SETTINGS,
            ID.WHISPER_URI, ID.WHISPER_KEY, ID.GPT4O_URI, ID.GPT4O_KEY
        ];
        
        // Pre-populate by calling getElementById for each required element and reset values
        requiredIds.forEach(id => {
            const element = document.getElementById(id);
            // Reset all values to empty to prevent state leakage between tests
            element.value = '';
            element.style.display = '';
            
            // Set specific defaults after reset
            if (id === ID.MODEL_SELECT) {
                element.value = 'whisper'; // Set default model
            }
        });

        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
        
        // Set default model in localStorage mock
        localStorageMock.getItem.mockImplementation((key) => {
            if (key === STORAGE_KEYS.MODEL) return 'whisper';
            return null;
        });
        
        settings = new Settings();
        
        // Mock the problematic methods that might interfere
        vi.spyOn(settings, 'checkInitialSettings').mockImplementation(() => {});
        vi.spyOn(settings, 'updateSettingsVisibility').mockImplementation(() => {});
    });

    describe('LocalStorage Persistence', () => {
        test('should save Whisper settings to localStorage', () => {
            // Arrange
            const whisperApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const whisperApiUri = 'https://myresource.openai.azure.com/';
            
            // Set up form values
            settings.modelSelect.value = 'whisper';
            const keyElement = document.getElementById(ID.WHISPER_KEY);
            const uriElement = document.getElementById(ID.WHISPER_URI);
            keyElement.value = whisperApiKey;
            uriElement.value = whisperApiUri;

            // Act
            settings.saveSettings();

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_API_KEY, whisperApiKey);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, whisperApiUri);
        });

        test('should save GPT-4o settings to localStorage', () => {
            // Arrange
            const gpt4oApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const gpt4oApiUri = 'https://gpt4o.openai.azure.com/';
            
            // Set up form values  
            settings.modelSelect.value = 'gpt-4o';
            const keyElement = document.getElementById(ID.GPT4O_KEY);
            const uriElement = document.getElementById(ID.GPT4O_URI);
            keyElement.value = gpt4oApiKey;
            uriElement.value = gpt4oApiUri;

            // Act
            settings.saveSettings();

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.GPT4O_API_KEY, gpt4oApiKey);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.GPT4O_URI, gpt4oApiUri);
        });

        test('should load saved settings into the form on modal open', () => {
            // Arrange
            const whisperApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const whisperApiUri = 'https://myresource.openai.azure.com/'; // Use same URI as other tests
            
            // Mock localStorage to return saved settings
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            // Act
            settings.openSettingsModal();

            // Assert
            expect(document.getElementById(ID.WHISPER_KEY).value).toBe(whisperApiKey);
            expect(document.getElementById(ID.WHISPER_URI).value).toBe(whisperApiUri);
        });
    });

    describe('Modal Management', () => {
        test('should open the settings modal and emit event', () => {
            // Act
            settings.openSettingsModal();

            // Assert
            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);
        });

        test('should close the settings modal and emit event', () => {
            // Act
            settings.closeSettingsModal();

            // Assert
            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_CLOSED);
        });
    });

    describe('Event Bus Communication', () => {
        test('should emit SETTINGS_SAVED and SETTINGS_UPDATED on successful save', () => {
            // Arrange
            const keyElement = document.getElementById(ID.WHISPER_KEY);
            const uriElement = document.getElementById(ID.WHISPER_URI);
            
            settings.modelSelect.value = 'whisper';
            keyElement.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            uriElement.value = 'https://myresource.openai.azure.com/';

            // Act
            settings.saveSettings();

            // Assert
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.any(Object));
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        });

        test('should emit SETTINGS_MODEL_CHANGED when the model is changed', () => {
            // Arrange - Create a fresh Settings instance and trigger the setup
            // First set up the localStorage state properly 
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                return null;
            });
            
            const freshSettings = new Settings();
            
            const modelSelect = document.getElementById(ID.MODEL_SELECT);
            expect(modelSelect.addEventListener).toHaveBeenCalled();
            
            // Find the 'change' event listener
            const changeCall = modelSelect.addEventListener.mock.calls.find(call => call[0] === 'change');
            expect(changeCall).toBeDefined();
            const changeListener = changeCall[1];
            
            const event = { target: { value: 'gpt-4o' } };
            
            // Act
            changeListener(event);

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.MODEL, 'gpt-4o');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                model: 'gpt-4o',
                previousModel: 'whisper'
            });
        });

        test('should emit SETTINGS_VALIDATION_ERROR if required fields are empty', () => {
            // Arrange
            const keyElement = document.getElementById(ID.WHISPER_KEY);
            const uriElement = document.getElementById(ID.WHISPER_URI);
            
            settings.modelSelect.value = 'whisper';
            keyElement.value = ''; // Empty key
            uriElement.value = ''; // Empty URI

            // Act
            settings.saveSettings();

            // Assert - Should emit validation error, not save
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });

        test('should emit SETTINGS_VALIDATION_ERROR for HTTP URI (insecure)', () => {
            // Arrange
            const keyElement = document.getElementById(ID.WHISPER_KEY);
            const uriElement = document.getElementById(ID.WHISPER_URI);
            
            settings.modelSelect.value = 'whisper';
            keyElement.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            uriElement.value = 'http://insecure.openai.azure.com/'; // HTTP instead of HTTPS

            // Act
            settings.saveSettings();

            // Assert - Should emit validation error due to HTTP URI, not save
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });
    });

    describe('Configuration Retrieval', () => {
        test('should return the correct config for the Whisper model', () => {
            // Arrange
            const whisperApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const whisperApiUri = 'https://retrieval-whisper.openai.azure.com/';
            
            // Ensure the model select shows whisper 
            document.getElementById(ID.MODEL_SELECT).value = 'whisper';
            
            // Mock localStorage to return Whisper model and its config
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });
            
            // Create a fresh Settings instance that will read from the mocked localStorage
            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});
            
            // Act
            const config = freshSettings.getModelConfig();

            // Assert
            expect(config).toEqual({
                model: 'whisper',
                apiKey: whisperApiKey,
                uri: whisperApiUri,
            });
        });

        test('should return the correct config for the GPT-4o model', () => {
            // Arrange
            const gpt4oApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const gpt4oApiUri = 'https://retrieval-gpt4o.openai.azure.com/';
            
            // Update the model select element to match GPT-4o
            document.getElementById(ID.MODEL_SELECT).value = 'gpt-4o';
            
            // Mock localStorage to return GPT-4o model and its config
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'gpt-4o';
                if (key === STORAGE_KEYS.GPT4O_API_KEY) return gpt4oApiKey;
                if (key === STORAGE_KEYS.GPT4O_URI) return gpt4oApiUri;
                return null;
            });
            
            // Create a fresh Settings instance that will read from the mocked localStorage
            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});
            
            // Act
            const config = freshSettings.getModelConfig();

            // Assert
            expect(config).toEqual({
                model: 'gpt-4o',
                apiKey: gpt4oApiKey,
                uri: gpt4oApiUri,
            });
        });
    });
});
