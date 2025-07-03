/**
 * @fileoverview Tests for Settings module persistence and configuration management.
 * Verifies localStorage persistence, validation, and event bus communication.
 */

import { jest } from '@jest/globals';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { STORAGE_KEYS, ID } from '../js/constants.js';

// Mock dependencies
jest.unstable_mockModule('../js/logger.js', () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(() => ({
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        })),
    },
}));
jest.unstable_mockModule('../js/status-helper.js', () => ({
    showTemporaryStatus: jest.fn(),
}));

// Mock DOM
const mockElement = (id) => ({
    id,
    value: '',
    checked: false,
    style: { display: 'none' },
    addEventListener: jest.fn(),
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(),
    },
});

const mockElements = {};
global.document = {
    getElementById: jest.fn((id) => mockElements[id]),
    body: {
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn(),
        },
    },
};

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
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
        jest.clearAllMocks();
        
        // Reset localStorage mock return values
        localStorageMock.getItem.mockReturnValue(null);
        localStorageMock.clear();
        
        // Populate mock elements before each test
        mockElements[ID.MODEL_SELECT] = mockElement(ID.MODEL_SELECT);
        mockElements[ID.SETTINGS_MODAL] = mockElement(ID.SETTINGS_MODAL);
        mockElements[ID.CLOSE_MODAL] = mockElement(ID.CLOSE_MODAL);
        mockElements[ID.SAVE_SETTINGS] = mockElement(ID.SAVE_SETTINGS);
        mockElements[ID.SETTINGS_BUTTON] = mockElement(ID.SETTINGS_BUTTON);
        mockElements[ID.STATUS] = mockElement(ID.STATUS);
        mockElements[ID.WHISPER_SETTINGS] = mockElement(ID.WHISPER_SETTINGS);
        mockElements[ID.GPT4O_SETTINGS] = mockElement(ID.GPT4O_SETTINGS);
        mockElements[ID.WHISPER_URI] = mockElement(ID.WHISPER_URI);
        mockElements[ID.WHISPER_KEY] = mockElement(ID.WHISPER_KEY);
        mockElements[ID.GPT4O_URI] = mockElement(ID.GPT4O_URI);
        mockElements[ID.GPT4O_KEY] = mockElement(ID.GPT4O_KEY);

        eventBusEmitSpy = jest.spyOn(eventBus, 'emit');
        
        // Set default model in localStorage mock
        localStorageMock.getItem.mockImplementation((key) => {
            if (key === STORAGE_KEYS.MODEL) return 'whisper';
            return null;
        });
        
        settings = new Settings();
    });

    describe('LocalStorage Persistence', () => {
        test('should save Whisper settings to localStorage', () => {
            // Arrange
            const whisperApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const whisperApiUri = 'https://whisper.openai.azure.com/';
            mockElements[ID.MODEL_SELECT].value = 'whisper';
            mockElements[ID.WHISPER_KEY].value = whisperApiKey;
            mockElements[ID.WHISPER_URI].value = whisperApiUri;

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
            mockElements[ID.MODEL_SELECT].value = 'gpt-4o';
            mockElements[ID.GPT4O_KEY].value = gpt4oApiKey;
            mockElements[ID.GPT4O_URI].value = gpt4oApiUri;

            // Act
            settings.saveSettings();

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.GPT4O_API_KEY, gpt4oApiKey);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.GPT4O_URI, gpt4oApiUri);
        });

        test('should load saved settings into the form on modal open', () => {
            // Arrange
            const whisperApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const whisperApiUri = 'https://loaded-whisper.openai.azure.com/';
            
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
            expect(mockElements[ID.WHISPER_KEY].value).toBe(whisperApiKey);
            expect(mockElements[ID.WHISPER_URI].value).toBe(whisperApiUri);
        });
    });

    describe('Modal Management', () => {
        test('should open the settings modal and emit event', () => {
            // Act
            settings.openSettingsModal();

            // Assert
            expect(mockElements[ID.SETTINGS_MODAL].style.display).toBe('block');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);
        });

        test('should close the settings modal and emit event', () => {
            // Act
            settings.closeSettingsModal();

            // Assert
            expect(mockElements[ID.SETTINGS_MODAL].style.display).toBe('none');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_CLOSED);
        });
    });

    describe('Event Bus Communication', () => {
        test('should emit SETTINGS_SAVED and SETTINGS_UPDATED on successful save', () => {
            // Arrange
            mockElements[ID.MODEL_SELECT].value = 'whisper';
            mockElements[ID.WHISPER_KEY].value = 'sk-1234567890abcdef1234567890abcdef12345678';
            mockElements[ID.WHISPER_URI].value = 'https://myresource.openai.azure.com/';

            // Act
            settings.saveSettings();

            // Assert
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.any(Object));
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        });

        test('should emit SETTINGS_MODEL_CHANGED when the model is changed', () => {
            // Arrange - Create a fresh Settings instance and trigger the setup
            const freshSettings = new Settings();
            
            const modelSelect = mockElements[ID.MODEL_SELECT];
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
            mockElements[ID.MODEL_SELECT].value = 'whisper';
            mockElements[ID.WHISPER_KEY].value = ''; // Empty key
            mockElements[ID.WHISPER_URI].value = ''; // Empty URI

            // Act
            settings.saveSettings();

            // Assert - Should emit validation error, not save
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });
    });

    describe('Configuration Retrieval', () => {
        test('should return the correct config for the Whisper model', () => {
            // Arrange
            const whisperApiKey = 'sk-1234567890abcdef1234567890abcdef12345678';
            const whisperApiUri = 'https://retrieval-whisper.openai.azure.com/';
            
            // Mock localStorage to return Whisper model and its config
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });
            
            // Act
            const config = settings.getModelConfig();

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
            
            // Mock localStorage to return GPT-4o model and its config
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'gpt-4o';
                if (key === STORAGE_KEYS.GPT4O_API_KEY) return gpt4oApiKey;
                if (key === STORAGE_KEYS.GPT4O_URI) return gpt4oApiUri;
                return null;
            });
            
            // Update the model select element to match
            mockElements[ID.MODEL_SELECT].value = 'gpt-4o';
            
            // Act
            const config = settings.getModelConfig();

            // Assert
            expect(config).toEqual({
                model: 'gpt-4o',
                apiKey: gpt4oApiKey,
                uri: gpt4oApiUri,
            });
        });
    });
});
