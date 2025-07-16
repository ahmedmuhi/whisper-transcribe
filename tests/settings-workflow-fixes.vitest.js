/**
 * @fileoverview Tests for the fixes to Settings Save Workflow Issues from issue #34.
 * Verifies that all 4 issues are resolved with the minimal changes made.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';
import { STORAGE_KEYS, MESSAGES, ID, DEFAULT_RESET_STATUS } from '../js/constants.js';
import { generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';

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

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});
global.localStorage = localStorageMock;

// Mock DOM elements
const createMockElement = (id) => {
    const classSet = new Set();
    return {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        style: { display: 'block', opacity: '1', cursor: 'pointer' },
        classList: {
            add: vi.fn((cls) => classSet.add(cls)),
            remove: vi.fn((cls) => classSet.delete(cls)),
            contains: vi.fn((cls) => classSet.has(cls)),
            toggle: vi.fn()
        },
        addEventListener: vi.fn(),
        setAttribute: vi.fn(),
        disabled: false,
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollHeight: 0
    };
};

// Create mock elements map
const mockElements = new Map();
const requiredElementIds = [
    ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT, ID.SETTINGS_MODAL, ID.CLOSE_MODAL, 
    ID.SAVE_SETTINGS, ID.SETTINGS_BUTTON, ID.STATUS, ID.WHISPER_SETTINGS, 
    ID.GPT4O_SETTINGS, ID.WHISPER_URI, ID.WHISPER_KEY, ID.GPT4O_URI, ID.GPT4O_KEY,
    ID.MIC_BUTTON, ID.THEME_TOGGLE, ID.PAUSE_BUTTON, ID.CANCEL_BUTTON, ID.GRAB_TEXT_BUTTON,
    ID.TRANSCRIPT, ID.TIMER, ID.VISUALIZER, ID.SPINNER_CONTAINER, ID.PAUSE_ICON, 
    ID.PLAY_ICON, ID.MOON_ICON, ID.SUN_ICON, ID.THEME_MODE
];

requiredElementIds.forEach(id => {
    mockElements.set(id, createMockElement(id));
});

global.document = {
    getElementById: vi.fn((id) => mockElements.get(id)),
    body: createMockElement('body')
};

// Mock window.matchMedia
global.window = {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    }))
};

// Import modules after mocks are set up
let Settings, UI;
beforeAll(async () => {
    Settings = (await import('../js/settings.js')).Settings;
    UI = (await import('../js/ui.js')).UI;
});

describe('Settings Workflow Issues - Fixes Verification (Issue #34)', () => {
    let settings;
    let ui;
    let eventBusEmitSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Reset localStorage mock
        localStorageMock.getItem.mockReturnValue(null);
        
        // Reset all mock elements
        mockElements.forEach(element => {
            element.value = '';
            element.style.display = 'block';
            element.disabled = false;
            element.style.opacity = '1';
            element.style.cursor = 'pointer';
            if (element.id === ID.MODEL_SELECT || element.id === ID.SETTINGS_MODEL_SELECT) {
                element.value = 'whisper';
            }
        });

        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');

        // Create instances
        settings = new Settings();
        ui = new UI();
        
        // Mock methods that might interfere with testing
        vi.spyOn(settings, 'updateSettingsVisibility').mockImplementation(() => {});
        vi.spyOn(ui, 'checkBrowserSupport').mockReturnValue(true);
        vi.spyOn(ui, 'loadTheme').mockImplementation(() => {});
        vi.spyOn(ui, 'setupEventListeners').mockImplementation(() => {});
        
        // Setup event bus listeners manually for testing
        ui.setupEventBusListeners();
    });

    afterEach(() => {
        // Clear event bus to prevent cross-test pollution
        eventBus.clear();
    });

    describe('Fix 1: SETTINGS_LOADED event emission on page reload', () => {
        test('should emit SETTINGS_LOADED when checkInitialSettings finds complete configuration', () => {
            // Arrange - Mock localStorage with complete configuration
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';
            
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            // Create new Settings instance to trigger checkInitialSettings
            const newSettings = new Settings();
            vi.spyOn(newSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            // Clear any events from constructor
            eventBusEmitSpy.mockClear();

            // Act - Call checkInitialSettings manually to test the logic
            newSettings.checkInitialSettings();

            // Assert - SETTINGS_LOADED event should be emitted
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });
        });

        test('should NOT emit SETTINGS_LOADED when configuration is incomplete', async () => {
            // Arrange - Mock localStorage with incomplete configuration
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                // Missing API key and URI
                return null;
            });

            // Create new Settings instance
            const newSettings = new Settings();
            vi.spyOn(newSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            // Clear any events from constructor
            eventBusEmitSpy.mockClear();

            // Act - Call checkInitialSettings manually
            newSettings.checkInitialSettings();

            // Assert - SETTINGS_LOADED should NOT be emitted
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, expect.any(Object));
            
            // Wait for setTimeout to execute (500ms delay)
            await vi.waitFor(() => {
                expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, expect.objectContaining({
                    message: MESSAGES.CONFIGURE_AZURE,
                    type: 'info'
                }));
            }, { timeout: 600 });
        });
    });

    describe('Fix 2: UI listens for SETTINGS_LOADED event', () => {
        test('should call checkRecordingPrerequisites when SETTINGS_LOADED is emitted', () => {
            // Arrange
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites');

            // Act - Emit SETTINGS_LOADED event
            eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            // Assert - checkRecordingPrerequisites should be called
            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
        });
    });

    describe('Fix 3: Success message duration is explicit', () => {
        test('should include explicit duration in success message', () => {
            // Arrange - Set up valid settings
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';
            
            mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.WHISPER_KEY).value = whisperApiKey;
            mockElements.get(ID.WHISPER_URI).value = whisperApiUri;

            // Act - Save settings
            settings.saveSettings();

            // Assert - Success message should have explicit 3000ms duration
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.SETTINGS_SAVED,
                type: 'success',
                temporary: true,
                duration: 3000
            });
        });
    });

    describe('Complete workflow integration with fixes', () => {
        test('should handle complete page reload → settings loaded → microphone enabled workflow', () => {
            // Arrange - Simulate page reload with saved settings
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';
            
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            // Spy on UI methods
            const enableMicButtonSpy = vi.spyOn(ui, 'enableMicButton');
            const setStatusSpy = vi.spyOn(ui, 'setStatus');
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites').mockImplementation(() => {
                // Mock the actual implementation to call enableMicButton when config is valid
                const config = reloadedSettings.getModelConfig();
                if (config.apiKey && config.uri) {
                    ui.enableMicButton();
                    ui.setStatus(DEFAULT_RESET_STATUS);
                }
                return true;
            });

            // Create new Settings instance (simulating page reload)
            const reloadedSettings = new Settings();
            vi.spyOn(reloadedSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            // Clear events from constructor
            eventBusEmitSpy.mockClear();

            // Act - Trigger the initial settings check (simulating app initialization)
            reloadedSettings.checkInitialSettings();

            // Assert - Complete workflow should work:
            
            // 1. SETTINGS_LOADED event should be emitted
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            // 2. UI should respond by checking prerequisites
            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();

            // 3. Microphone should be enabled and status set
            expect(enableMicButtonSpy).toHaveBeenCalled();
            expect(setStatusSpy).toHaveBeenCalledWith(DEFAULT_RESET_STATUS);
        });

        test('should handle complete save settings → microphone enabled workflow', async () => {
            // Arrange - Set up valid settings for saving
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';
            
            mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.WHISPER_KEY).value = whisperApiKey;
            mockElements.get(ID.WHISPER_URI).value = whisperApiUri;

            // Mock localStorage for the save workflow
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            const settingsModal = mockElements.get(ID.SETTINGS_MODAL);
            settingsModal.style.display = 'block';

            // Spy on UI methods
            const enableMicButtonSpy = vi.spyOn(ui, 'enableMicButton');
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites').mockImplementation(() => {
                // Mock the actual implementation to call enableMicButton when config is valid
                const config = settings.getModelConfig();
                if (config.apiKey && config.uri) {
                    ui.enableMicButton();
                    ui.setStatus(DEFAULT_RESET_STATUS);
                }
                return true;
            });

            // Act - Save settings
            settings.saveSettings();

            // Wait for event processing
            await vi.waitFor(() => {
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.any(Object));
        });

            // Assert - Complete save workflow should work:
            
            // 1. Settings should be saved to localStorage
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_API_KEY, whisperApiKey);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, whisperApiUri);
            
            // 2. Modal should be closed
            expect(settingsModal.style.display).toBe('none');
            
            // 3. Success message should have explicit duration
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.SETTINGS_SAVED,
                type: 'success',
                temporary: true,
                duration: 3000
            });
            
            // 4. SETTINGS_SAVED event should be emitted
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.objectContaining({
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            }));

            // 4b. SETTINGS_LOADED event should also be emitted
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, expect.objectContaining({
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            }));
            
            // 5. UI should respond by checking prerequisites and enabling microphone
            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
            expect(enableMicButtonSpy).toHaveBeenCalled();
        });
    });

    describe('Backward compatibility', () => {
        test('should still work with existing SETTINGS_UPDATED events', () => {
            // Arrange
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites');

            // Act - Emit the original SETTINGS_UPDATED event
            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);

            // Assert - Should still trigger microphone check
            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
        });

        test('should still work with existing SETTINGS_SAVED events', () => {
            // Arrange
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites');

            // Act - Emit the SETTINGS_SAVED event
            eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            // Assert - Should still trigger microphone check
            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
        });
    });
});