/**
 * @fileoverview End-to-end workflow tests for Settings + UI integration.
 * Covers Issue #34 fixes, Issue #32 workflow, and microphone activation.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
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
    ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT,
    ID.SAVE_SETTINGS, ID.STATUS, ID.WHISPER_SETTINGS,
    ID.MAI_TRANSCRIBE_SETTINGS, ID.WHISPER_URI, ID.MAI_TRANSCRIBE_URI,
    ID.THEME_TOGGLE, ID.GRAB_TEXT_BUTTON, ID.TRANSCRIPT, ID.TIMER,
    ID.SPINNER_CONTAINER, ID.MOON_ICON, ID.SUN_ICON
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
                    message: MESSAGES.TARGET_URI_NOT_CONFIGURED,
                    type: 'info'
                }));
            }, { timeout: 600 });

            newSettings.destroy();
        });
    });

    describe('Complete workflow integration with fixes', () => {
        test('page reload → SETTINGS_LOADED → primary control enabled (real path)', () => {
            const whisperTargetUri = 'https://whisper.invalid/transcribe';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperTargetUri;
                return null;
            });

            const reloadedSettings = new Settings();
            vi.spyOn(reloadedSettings, 'updateSettingsVisibility').mockImplementation(() => {});
            // Wire the UI to the reloaded settings so its SETTINGS_LOADED listener
            // runs checkRecordingPrerequisites against the (valid) config for real.
            ui.settings = reloadedSettings;
            const setStatusSpy = vi.spyOn(ui, 'setStatus');

            eventBusEmitSpy.mockClear();
            reloadedSettings.checkInitialSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
                model: 'whisper',
                hasUri: true
            });
            // Real readiness, not a mocked side effect.
            expect(ui.ready).toBe(true);
            expect(ui.primaryAction.disabled).toBe(false);
            expect(setStatusSpy).toHaveBeenCalledWith(DEFAULT_RESET_STATUS);

            reloadedSettings.destroy();
        });

        test('save settings → SETTINGS_SAVED → primary control enabled (real path)', async () => {
            const whisperTargetUri = 'https://whisper.invalid/transcribe';

            mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.WHISPER_URI).value = whisperTargetUri;

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperTargetUri;
                return null;
            });

            const userMenu = { closeDetail: vi.fn() };
            settings.setUserMenu(userMenu);
            // The UI's SETTINGS_SAVED listener runs checkRecordingPrerequisites for real.
            ui.settings = settings;

            settings.saveSettings();

            await vi.waitFor(() => {
                expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.any(Object));
            });

            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, whisperTargetUri);
            expect(userMenu.closeDetail).toHaveBeenCalledOnce();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.SETTINGS_SAVED,
                type: 'success',
                temporary: true,
                duration: 3000
            });
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.objectContaining({
                model: 'whisper',
                hasUri: true
            }));
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, expect.objectContaining({
                model: 'whisper',
                hasUri: true
            }));

            // Real readiness after the save flow.
            expect(ui.ready).toBe(true);
            expect(ui.primaryAction.disabled).toBe(false);
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

        settings = new Settings();
        ui = new UI();

        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
        ui.settings = settings;

        eventSpy = vi.spyOn(eventBus, 'emit');
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
        vi.clearAllMocks();
        eventSpy.mockRestore();
    });

    it('should test settings persistence across page reloads (Issue #4)', () => {
        const persistedTargetUri = 'https://whisper.invalid/persist';
        mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
        mockElements.get(ID.WHISPER_URI).value = persistedTargetUri;

        settings.saveSettings();

        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_URI,
            persistedTargetUri
        );

        localStorageMock.getItem.mockImplementation((key) => {
            switch (key) {
                case STORAGE_KEYS.MODEL:
                    return 'whisper';
                case STORAGE_KEYS.WHISPER_URI:
                    return persistedTargetUri;
                default:
                    return null;
            }
        });

        const reloadedSettings = new Settings();

        const config = reloadedSettings.getModelConfig();
        expect(config.model).toBe('whisper');
        expect(config.uri).toBe(persistedTargetUri);

        reloadedSettings.destroy();
    });

});

// ─── Microphone Activation ───────────────────────────────────────────────────

describe('Microphone Activation Issue Analysis', () => {
    let settings;
    let ui;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue('whisper');
        resetMockElements();

        settings = new Settings();
        ui = new UI();

        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    describe('Microphone State Management', () => {
        it('enables the primary control when settings are valid', () => {
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://whisper.invalid/transcribe';
                    default:
                        return null;
                }
            });

            ui.settings = settings;

            const result = ui.checkRecordingPrerequisites();

            expect(result).toBe(true);
            expect(ui.ready).toBe(true);
            expect(ui.primaryAction.disabled).toBe(false);
        });

        it('keeps the primary control disabled when settings are invalid', () => {
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return null;
                    default:
                        return null;
                }
            });

            ui.settings = settings;

            const result = ui.checkRecordingPrerequisites();

            expect(result).toBe(false);
            expect(ui.ready).toBe(false);
            expect(ui.primaryAction.hidden).toBe(true);
            expect(ui.authPrimaryAction.textContent).toBe(MESSAGES.OPEN_SETTINGS);
        });

        it('SETTINGS_UPDATED → checkRecordingPrerequisites → primary enabled', () => {
            localStorageMock.getItem.mockImplementation((key) => {
                switch (key) {
                    case STORAGE_KEYS.MODEL:
                        return 'whisper';
                    case STORAGE_KEYS.WHISPER_URI:
                        return 'https://whisper.invalid/transcribe';
                    default:
                        return null;
                }
            });

            ui.settings = settings;
            ui.setupEventBusListeners();

            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);

            expect(ui.primaryAction.disabled).toBe(false);
        });

    });
});
