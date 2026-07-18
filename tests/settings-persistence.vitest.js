/**
 * @fileoverview Tests for Settings module persistence, save workflow, and configuration management.
 * Verifies localStorage persistence, validation, modal save behavior, and event bus communication.
 */

import { expect, vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { STORAGE_KEYS, MESSAGES, ID, MODEL_TYPES, RECORDING_ENVIRONMENTS } from '../js/constants.js';
import { createLocalStorageMock } from './helpers/mock-settings-dom.js';

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

function getEventListener(element, eventName) {
    const listener = element.addEventListener.mock.calls
        .find(([registeredEventName]) => registeredEventName === eventName)?.[1];

    expect(listener).toBeTypeOf('function');
    return listener;
}

function configureNativeDialog(settings) {
    const modal = settings.settingsModal;
    modal.open = false;
    modal.showModal = vi.fn(function showModal() {
        this.open = true;
    });
    modal.close = vi.fn(function close() {
        this.open = false;
    });
    modal.removeAttribute = vi.fn();

    return modal;
}

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});
global.localStorage = localStorageMock;

// Dynamically import Settings after mocks are set up
let Settings;
beforeAll(async () => {
    Settings = (await import('../js/settings.js')).Settings;
});

describe('Settings Persistence & Save Workflow', () => {
    let settings;
    let eventBusEmitSpy;

    beforeEach(() => {
        vi.clearAllMocks();

        localStorageMock.getItem.mockReturnValue(null);

        // Ensure all required elements exist and reset their values
        const requiredIds = [
            ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT, ID.SETTINGS_MODAL, ID.CLOSE_MODAL, ID.SAVE_SETTINGS,
            ID.SETTINGS_BUTTON, ID.STATUS, ID.WHISPER_SETTINGS, ID.MAI_TRANSCRIBE_SETTINGS,
            ID.WHISPER_URI, ID.MAI_TRANSCRIBE_URI, ID.RECORDING_ENVIRONMENT
        ];

        requiredIds.forEach(id => {
            const element = document.getElementById(id);
            element.value = '';
            element.style.display = '';

            if (id === ID.MODEL_SELECT || id === ID.SETTINGS_MODEL_SELECT) {
                element.value = 'whisper';
            }
        });

        const modal = document.getElementById(ID.SETTINGS_MODAL);
        delete modal.showModal;
        delete modal.close;
        delete modal.open;
        delete modal.removeAttribute;
        delete document.getElementById(ID.SETTINGS_BUTTON).isConnected;

        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');

        localStorageMock.getItem.mockImplementation((key) => {
            if (key === STORAGE_KEYS.MODEL) return 'whisper';
            return null;
        });

        settings = new Settings();

        vi.spyOn(settings, 'checkInitialSettings').mockImplementation(() => {});
        vi.spyOn(settings, 'updateSettingsVisibility').mockImplementation(() => {});
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    // ─── LocalStorage Persistence ────────────────────────────────────────────

    describe('LocalStorage Persistence', () => {
        test('should save the Whisper Target URI to localStorage', () => {
            const whisperTargetUri = 'https://whisper.invalid/transcribe';

            settings.modelSelect.value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = whisperTargetUri;

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                whisperTargetUri
            );
        });

        test('should load the saved Target URI into the form on modal open', () => {
            const whisperTargetUri = 'https://whisper.invalid/transcribe';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperTargetUri;
                return null;
            });

            settings.openSettingsModal();

            expect(document.getElementById(ID.WHISPER_URI).value).toBe(whisperTargetUri);
        });

        test('should use injected adapter Target URI metadata for save and retrieval', () => {
            const fakeModel = 'fake-settings-model';
            const fakeUriStorage = 'custom_model_uri';
            const fakeRegistry = new Map([[
                fakeModel,
                {
                    id: fakeModel,
                    storageKeys: {
                        uri: fakeUriStorage
                    }
                }
            ]]);
            const fakeUri = 'https://custom-model.invalid/transcribe';
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return fakeModel;
                return null;
            });
            const fakeSettings = new Settings(fakeRegistry);

            try {
                fakeSettings.modelSelect.value = fakeModel;
                fakeSettings.settingsModelSelect.value = fakeModel;
                fakeSettings.whisperUriInput.value = fakeUri;
                localStorageMock.setItem.mockClear();

                fakeSettings.saveSettings();

                expect(localStorageMock.setItem).toHaveBeenCalledWith(fakeUriStorage, fakeUri);
                expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                    STORAGE_KEYS.WHISPER_URI,
                    expect.anything()
                );
                expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                    STORAGE_KEYS.MAI_TRANSCRIBE_URI,
                    expect.anything()
                );

                localStorageMock.getItem.mockImplementation((key) => {
                    if (key === STORAGE_KEYS.MODEL) return fakeModel;
                    if (key === fakeUriStorage) return fakeUri;
                    return null;
                });

                expect(fakeSettings.getModelConfig()).toEqual({
                    model: fakeModel,
                    uri: fakeUri
                });
                expect(localStorageMock.getItem).toHaveBeenCalledWith(fakeUriStorage);
            } finally {
                fakeSettings.destroy();
            }
        });

        test('should fail closed when an adapter lacks Target URI storage metadata', () => {
            const brokenModel = 'broken-settings-model';
            const brokenRegistry = new Map([
                [MODEL_TYPES.WHISPER, {
                    id: MODEL_TYPES.WHISPER,
                    storageKeys: {
                        uri: STORAGE_KEYS.WHISPER_URI
                    }
                }],
                [brokenModel, { id: brokenModel, storageKeys: {} }]
            ]);
            const brokenSettings = new Settings(brokenRegistry);

            try {
                brokenSettings.modelSelect.value = brokenModel;
                brokenSettings.settingsModelSelect.value = brokenModel;

                expect(() => brokenSettings._getTargetUriStorageKey(brokenModel)).toThrow(
                    new RegExp(`Target URI storage metadata is missing.*${brokenModel}`, 'i')
                );
            } finally {
                brokenSettings.destroy();
            }
        });

        test('should persist recording environment across settings reload', () => {
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.RECORDING_ENVIRONMENT) return RECORDING_ENVIRONMENTS.NOISY;
                return null;
            });

            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            freshSettings.openSettingsModal();

            expect(document.getElementById(ID.RECORDING_ENVIRONMENT).value).toBe(RECORDING_ENVIRONMENTS.NOISY);

            freshSettings.destroy();
        });
    });

    // ─── Modal Management ────────────────────────────────────────────────────

    describe('Modal Management', () => {
        test('should open the settings modal and emit event', () => {
            settings.openSettingsModal();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);
        });

        test('uses native dialog semantics and focuses an invalid active Target URI', () => {
            const modal = configureNativeDialog(settings);
            settings.settingsButton.isConnected = true;
            settings.whisperUriInput.value = '';

            settings.openSettingsModal(settings.settingsButton);

            expect(modal.showModal).toHaveBeenCalledOnce();
            expect(settings.whisperUriInput.focus).toHaveBeenCalledOnce();
        });

        test('focuses the modal model selector when the active Target URI is valid', () => {
            configureNativeDialog(settings);
            settings.whisperUriInput.value = 'https://whisper.invalid/transcribe';

            settings.openSettingsModal(settings.settingsButton);

            expect(settings.settingsModelSelect.focus).toHaveBeenCalledOnce();
        });

        test('falls back to display behavior when native dialogs are unavailable without stranding focus', () => {
            settings.whisperUriInput.value = 'https://whisper.invalid/transcribe';
            settings.settingsButton.isConnected = true;

            settings.openSettingsModal(settings.settingsButton);
            settings.closeSettingsModal();

            expect(settings.settingsModal.style.display).toBe('none');
            expect(settings.settingsModelSelect.focus).toHaveBeenCalledOnce();
            expect(settings.settingsButton.focus).toHaveBeenCalledOnce();
        });

        test('makes the no-showModal fallback visually and accessibly modal while inerting background interaction', () => {
            const background = document.createElement('main');
            document.body.appendChild(background);
            background.inert = false;
            settings.settingsModal.removeAttribute = vi.fn();

            try {
                settings.openSettingsModal(settings.settingsButton);

                expect(settings.settingsModal.classList.add).toHaveBeenCalledWith('modal--fallback-open');
                expect(settings.settingsModal.setAttribute).toHaveBeenCalledWith('role', 'dialog');
                expect(settings.settingsModal.setAttribute).toHaveBeenCalledWith('aria-modal', 'true');
                expect(background.inert).toBe(true);
                expect(background.getAttribute('aria-hidden')).toBe('true');

                settings.closeSettingsModal();

                expect(settings.settingsModal.classList.remove).toHaveBeenCalledWith('modal--fallback-open');
                expect(settings.settingsModal.removeAttribute).toHaveBeenCalledWith('role');
                expect(settings.settingsModal.removeAttribute).toHaveBeenCalledWith('aria-modal');
                expect(background.inert).toBe(false);
                expect(background.hasAttribute('aria-hidden')).toBe(false);
            } finally {
                background.remove();
            }
        });

        test('cycles fallback Tab navigation within the modal without adding a native-dialog trap', () => {
            const firstFocusable = settings.closeModalButton;
            const lastFocusable = settings.saveSettingsButton;
            settings.settingsModal.querySelectorAll.mockReturnValue([firstFocusable, lastFocusable]);
            const forwardTab = { key: 'Tab', shiftKey: false, target: lastFocusable, preventDefault: vi.fn() };
            const backwardTab = { key: 'Tab', shiftKey: true, target: firstFocusable, preventDefault: vi.fn() };

            settings.openSettingsModal(settings.settingsButton);
            settings._fallbackModalKeydownHandler(forwardTab);
            settings._fallbackModalKeydownHandler(backwardTab);

            expect(firstFocusable.focus).toHaveBeenCalledOnce();
            expect(lastFocusable.focus).toHaveBeenCalledOnce();
            expect(forwardTab.preventDefault).toHaveBeenCalledOnce();
            expect(backwardTab.preventDefault).toHaveBeenCalledOnce();

            settings.closeSettingsModal();
            const modal = configureNativeDialog(settings);
            settings.openSettingsModal(settings.settingsButton);
            settings._fallbackModalKeydownHandler(forwardTab);

            expect(modal.showModal).toHaveBeenCalledOnce();
            expect(firstFocusable.focus).toHaveBeenCalledOnce();
        });

        test('does not restore focus after startup opens settings without a meaningful invoker', () => {
            configureNativeDialog(settings);
            settings.whisperUriInput.value = 'https://whisper.invalid/transcribe';

            settings.openSettingsModal();
            settings.closeSettingsModal();

            expect(settings.settingsButton.focus).not.toHaveBeenCalled();
        });

        test('does not return focus to an invoker removed before close', () => {
            configureNativeDialog(settings);
            settings.settingsButton.isConnected = true;

            settings.openSettingsModal(settings.settingsButton);
            settings.settingsButton.isConnected = false;
            settings.closeSettingsModal();

            expect(settings.settingsButton.focus).not.toHaveBeenCalled();
        });

        test('uses the settings button as the invoker for settings-button clicks', () => {
            configureNativeDialog(settings);
            settings.settingsButton.isConnected = true;
            const settingsButtonListener = getEventListener(settings.settingsButton, 'click');

            settingsButtonListener();
            settings.closeSettingsModal();

            expect(settings.settingsButton.focus).toHaveBeenCalledOnce();
        });

        test('should discard an unsaved model draft when closed with the close button', () => {
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = modalModelSelect.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'change')[1];
            const closeButtonListener = settings.closeModalButton.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'click')[1];

            settings.modelSelect.value = MODEL_TYPES.WHISPER;
            settings.openSettingsModal();
            modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            modalChangeListener({ target: modalModelSelect });
            closeButtonListener();

            expect(settings.modelSelect.value).toBe(MODEL_TYPES.WHISPER);
            expect(settings.getModelConfig().model).toBe(MODEL_TYPES.WHISPER);
        });

        test('should discard an unsaved model draft when closed with the backdrop', () => {
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = modalModelSelect.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'change')[1];
            const backdropListener = settings.settingsModal.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'click')[1];

            settings.modelSelect.value = MODEL_TYPES.WHISPER;
            settings.openSettingsModal();
            modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            modalChangeListener({ target: modalModelSelect });
            backdropListener({ target: settings.settingsModal });

            expect(settings.modelSelect.value).toBe(MODEL_TYPES.WHISPER);
            expect(settings.getModelConfig().model).toBe(MODEL_TYPES.WHISPER);
        });

        test('routes close button, backdrop, and cancel through one discard and return-focus cleanup', () => {
            const modal = configureNativeDialog(settings);
            settings.settingsButton.isConnected = true;
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = getEventListener(modalModelSelect, 'change');
            const closeButtonListener = getEventListener(settings.closeModalButton, 'click');
            const backdropListener = getEventListener(modal, 'click');
            const cancelListener = getEventListener(modal, 'cancel');
            const cancelEvent = { preventDefault: vi.fn() };

            [
                () => closeButtonListener(),
                () => backdropListener({ target: modal }),
                () => cancelListener(cancelEvent)
            ].forEach(close => {
                settings.modelSelect.value = MODEL_TYPES.WHISPER;
                settings.openSettingsModal(settings.settingsButton);
                modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
                modalChangeListener({ target: modalModelSelect });

                close();

                expect(settings.modelSelect.value).toBe(MODEL_TYPES.WHISPER);
                expect(settings.getModelConfig().model).toBe(MODEL_TYPES.WHISPER);
            });

            expect(modal.close).toHaveBeenCalledTimes(3);
            expect(settings.settingsButton.focus).toHaveBeenCalledTimes(3);
            expect(cancelEvent.preventDefault).toHaveBeenCalledOnce();
        });

        test('keeps Escape owned by the open dialog rather than also unpinning the sidebar', () => {
            const modal = configureNativeDialog(settings);
            settings.sidePanel = {
                classList: { contains: vi.fn(() => true) }
            };
            const unpinSidebarSpy = vi.spyOn(settings, 'unpinSidebar');
            const cancelListener = getEventListener(modal, 'cancel');

            settings.openSettingsModal(settings.settingsButton);
            settings._panelEscHandler({ key: 'Escape' });
            cancelListener({ preventDefault: vi.fn() });

            expect(unpinSidebarSpy).not.toHaveBeenCalled();
            expect(modal.close).toHaveBeenCalledOnce();
        });

        test('does not add modal handlers during repeated open and close cycles', () => {
            const modal = configureNativeDialog(settings);
            const initialHandlerCount = modal.addEventListener.mock.calls.length;

            settings.openSettingsModal(settings.settingsButton);
            settings.closeSettingsModal();
            settings.openSettingsModal(settings.settingsButton);
            settings.closeSettingsModal();

            expect(modal.showModal).toHaveBeenCalledTimes(2);
            expect(modal.addEventListener.mock.calls).toHaveLength(initialHandlerCount);
        });

        test('uses the shared close cleanup after a successful save', () => {
            const modal = configureNativeDialog(settings);
            settings.settingsButton.isConnected = true;
            settings.whisperUriInput.value = 'https://whisper.invalid/transcribe';

            settings.openSettingsModal(settings.settingsButton);
            settings.saveSettings();

            expect(modal.close).toHaveBeenCalledOnce();
            expect(settings.settingsButton.focus).toHaveBeenCalledOnce();
        });

        test('should restore the active model as the draft when reopened', () => {
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = modalModelSelect.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'change')[1];

            settings.modelSelect.value = MODEL_TYPES.WHISPER;
            settings.openSettingsModal();
            modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            modalChangeListener({ target: modalModelSelect });
            settings.closeSettingsModal();
            settings.openSettingsModal();

            expect(modalModelSelect.value).toBe(MODEL_TYPES.WHISPER);
        });

        test('should close the settings modal and emit event', () => {
            settings.closeSettingsModal();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_CLOSED);
        });
    });

    // ─── Event Bus Communication ─────────────────────────────────────────────

    describe('Event Bus Communication', () => {
        test('should emit SETTINGS_SAVED and SETTINGS_UPDATED on successful save', () => {
            settings.modelSelect.value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://whisper.invalid/transcribe';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.any(Object));
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        });

        test('should emit UI_MODEL_SWITCHED when the main UI model is changed (no persistence)', () => {
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                return null;
            });

            const freshSettings = new Settings();

            const modelSelect = document.getElementById(ID.MODEL_SELECT);
            expect(modelSelect.addEventListener).toHaveBeenCalled();

            const changeCall = modelSelect.addEventListener.mock.calls.find(call => call[0] === 'change');
            expect(changeCall).toBeDefined();
            const changeListener = changeCall[1];

            const event = { target: { value: 'mai-transcribe-1.5' } };

            changeListener(event);

            expect(localStorageMock.setItem).not.toHaveBeenCalledWith(STORAGE_KEYS.MODEL, 'mai-transcribe-1.5');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_MODEL_SWITCHED, {
                model: 'mai-transcribe-1.5',
                savedModel: 'whisper'
            });
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(APP_EVENTS.SETTINGS_MODEL_CHANGED, expect.any(Object));

            freshSettings.destroy();
        });

        test('should emit SETTINGS_VALIDATION_ERROR if required fields are empty', () => {
            settings.modelSelect.value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = '';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });

        test('should emit SETTINGS_VALIDATION_ERROR for HTTP URI (insecure)', () => {
            settings.modelSelect.value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'http://target.invalid/transcribe';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });
    });

    // ─── Configuration Retrieval ─────────────────────────────────────────────

    describe('Configuration Retrieval', () => {
        test('should return the correct config for the Whisper model', () => {
            const whisperTargetUri = 'https://whisper.invalid/transcribe';

            document.getElementById(ID.MODEL_SELECT).value = 'whisper';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperTargetUri;
                return null;
            });

            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            const config = freshSettings.getModelConfig();

            expect(config).toEqual({
                model: 'whisper',
                uri: whisperTargetUri,
            });
        });

        test('should return the MAI Target URI for the MAI 1.5 model', () => {
            const maiTargetUri = 'https://mai.invalid/transcribe';

            document.getElementById(ID.MODEL_SELECT).value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return MODEL_TYPES.MAI_TRANSCRIBE_1_5;
                if (key === STORAGE_KEYS.MAI_TRANSCRIBE_URI) return maiTargetUri;
                return null;
            });

            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            const config = freshSettings.getModelConfig();

            expect(config).toEqual({
                model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
                uri: maiTargetUri,
            });

            freshSettings.destroy();
        });
    });

    // ─── Save with Valid Configuration (from settings-save-modal) ────────────

    describe('Save with Valid Configuration', () => {
        test('should save valid Whisper configuration and close modal', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://whisper.invalid/transcribe';
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://whisper.invalid/transcribe'
            );

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.SETTINGS_SAVED,
                    type: 'success',
                    temporary: true
                })
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true
                })
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true
                })
            );
        });

        test('should save the MAI 1.5 model with its Target URI', () => {
            const maiTargetUri = 'https://mai.invalid/transcribe';
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            document.getElementById(ID.MAI_TRANSCRIBE_URI).value = maiTargetUri;
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.MAI_TRANSCRIBE_URI, maiTargetUri);
            expect(localStorageMock.setItem).not.toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, maiTargetUri);
            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
                    hasUri: true
                })
            );
        });

        test('should commit a valid modal model draft to active and persisted state exactly once', () => {
            const maiTargetUri = 'https://mai.invalid/transcribe';
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = modalModelSelect.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'change')[1];

            settings.modelSelect.value = MODEL_TYPES.WHISPER;
            settings.openSettingsModal();
            modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            modalChangeListener({ target: modalModelSelect });
            document.getElementById(ID.MAI_TRANSCRIBE_URI).value = maiTargetUri;
            localStorageMock.setItem.mockClear();
            const observedModels = [];
            const unsubscribe = eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, () => {
                observedModels.push(settings.getCurrentModel());
            });

            settings.saveSettings();

            unsubscribe();

            expect(settings.getCurrentModel()).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
            expect(settings.getModelConfig().model).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
            expect(observedModels).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_1_5]);
            expect(localStorageMock.setItem.mock.calls.filter(
                ([key]) => key === STORAGE_KEYS.MODEL
            )).toEqual([[STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5]]);
        });
    });

    // ─── Save with Invalid Configuration (from settings-save-modal) ──────────

    describe('Save with Invalid Configuration', () => {
        test('should not close modal when the Target URI is missing', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = '';
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.anything()
            );

            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });

        test('should keep the active model unchanged when saving an invalid modal draft', () => {
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = modalModelSelect.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'change')[1];

            settings.modelSelect.value = MODEL_TYPES.WHISPER;
            settings.openSettingsModal();
            modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            modalChangeListener({ target: modalModelSelect });
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(settings.getCurrentModel()).toBe(MODEL_TYPES.WHISPER);
            expect(settings.getModelConfig().model).toBe(MODEL_TYPES.WHISPER);
            expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                STORAGE_KEYS.MODEL,
                MODEL_TYPES.MAI_TRANSCRIBE_1_5
            );
        });

        test('should not close modal when URI is invalid', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'http://target.invalid/transcribe';
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });

        test('should not close modal when the Target URI is malformed', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'not-a-target-uri';
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(localStorageMock.setItem).not.toHaveBeenCalled();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    type: 'error',
                    temporary: true
                })
            );

            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.anything()
            );
        });

        test('should not save a malformed MAI Target URI', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            document.getElementById(ID.MAI_TRANSCRIBE_URI).value = 'malformed-target-uri';
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([MESSAGES.INVALID_URI_FORMAT])
                })
            );
        });
    });

    // ─── Input Sanitization During Save (from settings-save-modal) ───────────

    describe('Input Sanitization During Save', () => {
        test('should trim whitespace from the Target URI before saving', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = '  https://whisper.invalid/transcribe  ';

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://whisper.invalid/transcribe'
            );

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');
        });

        test('should remove newlines and tabs from the Target URI', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://target.invalid/\ntranscribe\t';

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://target.invalid/transcribe'
            );
        });
    });

    // ─── Event Emission During Save Process (from settings-save-modal) ───────

    describe('Event Emission During Save Process', () => {
        test('should emit validation error event for invalid configuration', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = '';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([
                        expect.stringContaining('URI')
                    ])
                })
            );
        });

        test('should emit all required events for successful save', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://whisper.invalid/transcribe';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.SETTINGS_SAVED,
                    type: 'success',
                    temporary: true
                })
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true
                })
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_UPDATED
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true
                })
            );
        });
    });
});
