/**
 * @fileoverview End-to-end workflow tests for Settings + UI integration.
 * Covers Issue #34 fixes, Issue #32 workflow, and microphone activation.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { generateMockApiKey, generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';
import { STORAGE_KEYS, MESSAGES, ID, DEFAULT_RESET_STATUS } from '../js/constants.js';
import { createStatefulMockElement, createLocalStorageMock } from './helpers/mock-settings-dom.js';

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

const localStorageMock = createLocalStorageMock();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});
global.localStorage = localStorageMock;

// Mock DOM elements — comprehensive set for both Settings and UI
const mockElements = new Map();
const requiredElementIds = [
    ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT, ID.SETTINGS_MODAL, ID.CLOSE_MODAL,
    ID.SAVE_SETTINGS, ID.SETTINGS_BUTTON, ID.STATUS, ID.WHISPER_SETTINGS,
    ID.MAI_TRANSCRIBE_SETTINGS, ID.WHISPER_URI, ID.WHISPER_KEY, ID.MAI_TRANSCRIBE_URI, ID.MAI_TRANSCRIBE_KEY,
    ID.MIC_BUTTON, ID.THEME_TOGGLE, ID.PAUSE_BUTTON, ID.CANCEL_BUTTON, ID.GRAB_TEXT_BUTTON,
    ID.TRANSCRIPT, ID.TIMER, ID.SPINNER_CONTAINER, ID.PAUSE_ICON,
    ID.PLAY_ICON, ID.MOON_ICON, ID.SUN_ICON, ID.THEME_MODE
];

requiredElementIds.forEach(id => {
    mockElements.set(id, createStatefulMockElement(id));
});

// VISUALIZER needs getContext for canvas mock
const visualizerMock = createStatefulMockElement(ID.VISUALIZER);
visualizerMock.getContext = vi.fn(() => ({
    fillStyle: '',
    fillRect: vi.fn()
}));
mockElements.set(ID.VISUALIZER, visualizerMock);

global.document = {
    getElementById: vi.fn((id) => {
        if (!mockElements.has(id)) mockElements.set(id, createStatefulMockElement(id));
        return mockElements.get(id);
    }),
    querySelector: vi.fn(() => createStatefulMockElement('query')),
    querySelectorAll: vi.fn(() => []),
    body: createStatefulMockElement('body')
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

// Shared helper: reset all mock elements to defaults
function resetMockElements() {
    mockElements.forEach(element => {
        element.value = '';
        element.textContent = '';
        element.style.display = 'block';
        element.disabled = false;
        element.style.opacity = '1';
        element.style.cursor = 'pointer';
        if (element.id === ID.MODEL_SELECT || element.id === ID.SETTINGS_MODEL_SELECT) {
            element.value = 'whisper';
        }
    });
}

// ─── Issue #34 Fixes ─────────────────────────────────────────────────────────

describe('Settings Workflow Issues - Fixes Verification (Issue #34)', () => {
    let settings;
    let ui;
    let eventBusEmitSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue(null);
        resetMockElements();

        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');

        settings = new Settings();
        ui = new UI();

        vi.spyOn(settings, 'updateSettingsVisibility').mockImplementation(() => {});
        vi.spyOn(ui, 'checkBrowserSupport').mockReturnValue(true);
        vi.spyOn(ui, 'loadTheme').mockImplementation(() => {});
        vi.spyOn(ui, 'setupEventListeners').mockImplementation(() => {});

        ui.setupEventBusListeners();
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    describe('Fix 1: SETTINGS_LOADED event emission on page reload', () => {
        test('should emit SETTINGS_LOADED when checkInitialSettings finds complete configuration', () => {
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            const newSettings = new Settings();
            vi.spyOn(newSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            eventBusEmitSpy.mockClear();

            newSettings.checkInitialSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            newSettings.destroy();
        });

        test('should NOT emit SETTINGS_LOADED when configuration is incomplete', async () => {
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                return null;
            });

            const newSettings = new Settings();
            vi.spyOn(newSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            eventBusEmitSpy.mockClear();

            newSettings.checkInitialSettings();

            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, expect.any(Object));

            await vi.waitFor(() => {
                expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, expect.objectContaining({
                    message: MESSAGES.CONFIGURE_AZURE,
                    type: 'info'
                }));
            }, { timeout: 600 });

            newSettings.destroy();
        });
    });

    describe('Fix 2: UI listens for SETTINGS_LOADED event', () => {
        test('should call checkRecordingPrerequisites when SETTINGS_LOADED is emitted', () => {
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites');

            eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
        });
    });

    describe('Fix 3: Success message duration is explicit', () => {
        test('should include explicit duration in success message', () => {
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';

            mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.WHISPER_KEY).value = whisperApiKey;
            mockElements.get(ID.WHISPER_URI).value = whisperApiUri;

            settings.saveSettings();

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
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            const enableMicButtonSpy = vi.spyOn(ui, 'enableMicButton');
            const setStatusSpy = vi.spyOn(ui, 'setStatus');
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites').mockImplementation(() => {
                const config = reloadedSettings.getModelConfig();
                if (config.apiKey && config.uri) {
                    ui.enableMicButton();
                    ui.setStatus(DEFAULT_RESET_STATUS);
                }
                return true;
            });

            const reloadedSettings = new Settings();
            vi.spyOn(reloadedSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            eventBusEmitSpy.mockClear();

            reloadedSettings.checkInitialSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
            expect(enableMicButtonSpy).toHaveBeenCalled();
            expect(setStatusSpy).toHaveBeenCalledWith(DEFAULT_RESET_STATUS);

            reloadedSettings.destroy();
        });

        test('should handle complete save settings → microphone enabled workflow', async () => {
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';

            mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.WHISPER_KEY).value = whisperApiKey;
            mockElements.get(ID.WHISPER_URI).value = whisperApiUri;

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            const settingsModal = mockElements.get(ID.SETTINGS_MODAL);
            settingsModal.style.display = 'block';

            const enableMicButtonSpy = vi.spyOn(ui, 'enableMicButton');
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites').mockImplementation(() => {
                const config = settings.getModelConfig();
                if (config.apiKey && config.uri) {
                    ui.enableMicButton();
                    ui.setStatus(DEFAULT_RESET_STATUS);
                }
                return true;
            });

            settings.saveSettings();

            await vi.waitFor(() => {
                expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.any(Object));
            });

            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_API_KEY, whisperApiKey);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, whisperApiUri);

            expect(settingsModal.style.display).toBe('none');

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.SETTINGS_SAVED,
                type: 'success',
                temporary: true,
                duration: 3000
            });

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.objectContaining({
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            }));

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, expect.objectContaining({
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            }));

            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
            expect(enableMicButtonSpy).toHaveBeenCalled();
        });
    });

    describe('Backward compatibility', () => {
        test('should still work with existing SETTINGS_UPDATED events', () => {
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites');

            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);

            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
        });

        test('should still work with existing SETTINGS_SAVED events', () => {
            const checkRecordingPrerequisitesSpy = vi.spyOn(ui, 'checkRecordingPrerequisites');

            eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            expect(checkRecordingPrerequisitesSpy).toHaveBeenCalled();
        });
    });
});

// ─── Issue #32 Workflow ──────────────────────────────────────────────────────

describe('Settings Save Workflow Issues - Issue #32', () => {
    let settings;
    let ui;
    let eventSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue('whisper');
        resetMockElements();

        // Set initial modal state for workflow tests
        mockElements.get(ID.SETTINGS_MODAL).style.display = 'block';
        mockElements.get(ID.MIC_BUTTON).disabled = true;

        settings = new Settings();
        ui = new UI();

        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
        ui.settings = settings;

        eventSpy = vi.spyOn(eventBus, 'emit');
    });

    afterEach(() => {
        settings.destroy();
        vi.clearAllMocks();
        eventSpy.mockRestore();
    });

    it('should handle the complete workflow: open settings → save valid settings → verify all fixes', () => {
        settings.openSettingsModal();

        expect(mockElements.get(ID.SETTINGS_MODAL).style.display).toBe('block');
        expect(eventSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);

        mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
        mockElements.get(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
        mockElements.get(ID.WHISPER_KEY).value = generateMockApiKeyForValidation();

        eventSpy.mockClear();

        settings.saveSettings();

        expect(eventSpy).toHaveBeenCalledWith(
            APP_EVENTS.UI_STATUS_UPDATE,
            expect.objectContaining({
                message: MESSAGES.SETTINGS_SAVED,
                type: 'success',
                temporary: true
            })
        );

        expect(mockElements.get(ID.SETTINGS_MODAL).style.display).toBe('none');

        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_URI,
            'https://test.openai.azure.com/whisper'
        );
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_API_KEY,
            generateMockApiKeyForValidation()
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

        expect(eventSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
    });

    it('should test microphone activation after valid settings save (Issue #3)', () => {
        mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
        mockElements.get(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
        mockElements.get(ID.WHISPER_KEY).value = generateMockApiKeyForValidation();

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

        eventBus.on(APP_EVENTS.SETTINGS_UPDATED, () => {
            ui.checkRecordingPrerequisites();
        });

        eventSpy.mockClear();

        settings.saveSettings();

        expect(eventSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);

        const config = settings.getModelConfig();
        expect(config.apiKey).toBe(generateMockApiKeyForValidation());
        expect(config.uri).toBe('https://test.openai.azure.com/whisper');
    });

    it('should test settings persistence across page reloads (Issue #4)', () => {
        const persistenceTestKey = generateMockApiKey('PERSIST');
        mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
        mockElements.get(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper/persist';
        mockElements.get(ID.WHISPER_KEY).value = persistenceTestKey;

        settings.saveSettings();

        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_URI,
            'https://test.openai.azure.com/whisper/persist'
        );
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_API_KEY,
            persistenceTestKey
        );

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

        const reloadedSettings = new Settings();

        const config = reloadedSettings.getModelConfig();
        expect(config.model).toBe('whisper');
        expect(config.uri).toBe('https://test.openai.azure.com/whisper/persist');
        expect(config.apiKey).toBe(persistenceTestKey);

        reloadedSettings.destroy();
    });

    it('should handle invalid settings correctly (should NOT trigger fixes)', () => {
        mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
        mockElements.get(ID.WHISPER_URI).value = '';
        mockElements.get(ID.WHISPER_KEY).value = '';

        eventSpy.mockClear();

        settings.saveSettings();

        expect(mockElements.get(ID.SETTINGS_MODAL).style.display).toBe('block');

        expect(eventSpy).toHaveBeenCalledWith(
            APP_EVENTS.UI_STATUS_UPDATE,
            expect.objectContaining({
                type: 'error',
                temporary: true
            })
        );

        expect(localStorageMock.setItem).not.toHaveBeenCalled();

        expect(eventSpy).not.toHaveBeenCalledWith(
            APP_EVENTS.SETTINGS_SAVED,
            expect.anything()
        );

        expect(eventSpy).not.toHaveBeenCalledWith(
            APP_EVENTS.SETTINGS_LOADED,
            expect.anything()
        );
    });
});

// ─── Microphone Activation ───────────────────────────────────────────────────

describe('Microphone Activation Issue Analysis', () => {
    let settings;
    let ui;
    let micButton;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue('whisper');
        resetMockElements();

        micButton = mockElements.get(ID.MIC_BUTTON);
        micButton.disabled = true;

        settings = new Settings();
        ui = new UI();

        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    describe('Microphone State Management', () => {
        it('should start with microphone disabled and enable it when settings are valid', () => {
            expect(micButton.disabled).toBe(true);

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

            ui.settings = settings;

            const result = ui.checkRecordingPrerequisites();

            expect(result).toBe(true);
            expect(micButton.disabled).toBe(false);
        });

        it('should keep microphone disabled when settings are invalid', () => {
            expect(micButton.disabled).toBe(true);

            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://test.openai.azure.com/whisper';
                    case STORAGE_KEYS.WHISPER_API_KEY:
                        return null;
                    default:
                        return null;
                }
            });

            ui.settings = settings;

            const result = ui.checkRecordingPrerequisites();

            expect(result).toBe(false);
            expect(micButton.disabled).toBe(true);
        });

        it('should demonstrate the expected workflow: SETTINGS_UPDATED → checkRecordingPrerequisites → enableMicButton', () => {
            expect(micButton.disabled).toBe(true);

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

            ui.settings = settings;

            ui.setupEventBusListeners();

            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);

            expect(micButton.disabled).toBe(false);
        });

        it('should check if UI also responds to SETTINGS_SAVED events', () => {
            expect(micButton.disabled).toBe(true);

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

            ui.settings = settings;

            ui.setupEventBusListeners();

            eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
                model: 'whisper',
                hasUri: true,
                hasApiKey: true
            });

            expect(micButton.disabled).toBe(false);
        });
    });
});
