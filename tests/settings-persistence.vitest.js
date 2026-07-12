/**
 * @fileoverview Tests for Settings module persistence, save workflow, and configuration management.
 * Verifies localStorage persistence, validation, modal save behavior, and event bus communication.
 */

import { expect, vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';
import { STORAGE_KEYS, MESSAGES, ID, MODEL_TYPES, RECORDING_ENVIRONMENTS } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';
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
            ID.WHISPER_URI, ID.WHISPER_KEY, ID.MAI_TRANSCRIBE_URI, ID.MAI_TRANSCRIBE_KEY, ID.RECORDING_ENVIRONMENT
        ];

        requiredIds.forEach(id => {
            const element = document.getElementById(id);
            element.value = '';
            element.style.display = '';

            if (id === ID.MODEL_SELECT || id === ID.SETTINGS_MODEL_SELECT) {
                element.value = 'whisper';
            }
        });

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
        test('should save Whisper settings to localStorage', () => {
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';

            settings.modelSelect.value = 'whisper';
            document.getElementById(ID.WHISPER_KEY).value = whisperApiKey;
            document.getElementById(ID.WHISPER_URI).value = whisperApiUri;

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_API_KEY, whisperApiKey);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, whisperApiUri);
        });

        test('should load saved settings into the form on modal open', () => {
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://myresource.openai.azure.com/';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            settings.openSettingsModal();

            expect(document.getElementById(ID.WHISPER_KEY).value).toBe(whisperApiKey);
            expect(document.getElementById(ID.WHISPER_URI).value).toBe(whisperApiUri);
        });

        test('should use injected adapter storage metadata for save and config retrieval', () => {
            const fakeModel = 'fake-settings-model';
            const fakeApiKeyStorage = 'custom_model_api_key';
            const fakeUriStorage = 'custom_model_uri';
            const fakeRegistry = new Map([[
                fakeModel,
                {
                    id: fakeModel,
                    storageKeys: {
                        apiKey: fakeApiKeyStorage,
                        uri: fakeUriStorage
                    }
                }
            ]]);
            const fakeApiKey = generateMockApiKeyForValidation();
            const fakeUri = 'https://custom-model.example.test/transcribe';
            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return fakeModel;
                return null;
            });
            const fakeSettings = new Settings(fakeRegistry);

            try {
                fakeSettings.modelSelect.value = fakeModel;
                fakeSettings.settingsModelSelect.value = fakeModel;
                fakeSettings.whisperKeyInput.value = fakeApiKey;
                fakeSettings.whisperUriInput.value = fakeUri;
                localStorageMock.setItem.mockClear();

                fakeSettings.saveSettings();

                expect(localStorageMock.setItem).toHaveBeenCalledWith(fakeApiKeyStorage, fakeApiKey);
                expect(localStorageMock.setItem).toHaveBeenCalledWith(fakeUriStorage, fakeUri);
                expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                    STORAGE_KEYS.WHISPER_API_KEY,
                    expect.anything()
                );
                expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                    STORAGE_KEYS.WHISPER_URI,
                    expect.anything()
                );
                expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                    STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY,
                    expect.anything()
                );
                expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
                    STORAGE_KEYS.MAI_TRANSCRIBE_URI,
                    expect.anything()
                );

                localStorageMock.getItem.mockImplementation((key) => {
                    if (key === STORAGE_KEYS.MODEL) return fakeModel;
                    if (key === fakeApiKeyStorage) return fakeApiKey;
                    if (key === fakeUriStorage) return fakeUri;
                    return null;
                });

                expect(fakeSettings.getModelConfig()).toEqual({
                    model: fakeModel,
                    apiKey: fakeApiKey,
                    uri: fakeUri
                });
                expect(localStorageMock.getItem).toHaveBeenCalledWith(fakeApiKeyStorage);
                expect(localStorageMock.getItem).toHaveBeenCalledWith(fakeUriStorage);
            } finally {
                fakeSettings.destroy();
            }
        });

        test('should fail closed when an adapter lacks credential storage metadata', () => {
            const brokenModel = 'broken-settings-model';
            const brokenRegistry = new Map([
                [MODEL_TYPES.WHISPER, {
                    id: MODEL_TYPES.WHISPER,
                    storageKeys: {
                        apiKey: STORAGE_KEYS.WHISPER_API_KEY,
                        uri: STORAGE_KEYS.WHISPER_URI
                    }
                }],
                [brokenModel, { id: brokenModel, storageKeys: { apiKey: '' } }]
            ]);
            const brokenSettings = new Settings(brokenRegistry);

            try {
                brokenSettings.modelSelect.value = brokenModel;
                brokenSettings.settingsModelSelect.value = brokenModel;

                expect(() => brokenSettings._getCredentialStorageKeys(brokenModel)).toThrow(
                    new RegExp(`credential storage metadata is missing.*${brokenModel}`, 'i')
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
            document.getElementById(ID.WHISPER_KEY).value = generateMockApiKeyForValidation();
            document.getElementById(ID.WHISPER_URI).value = 'https://myresource.openai.azure.com/';

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
            document.getElementById(ID.WHISPER_KEY).value = '';
            document.getElementById(ID.WHISPER_URI).value = '';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });

        test('should emit SETTINGS_VALIDATION_ERROR for HTTP URI (insecure)', () => {
            settings.modelSelect.value = 'whisper';
            document.getElementById(ID.WHISPER_KEY).value = generateMockApiKeyForValidation();
            document.getElementById(ID.WHISPER_URI).value = 'http://insecure.openai.azure.com/';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VALIDATION_ERROR, expect.any(Object));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });
    });

    // ─── Configuration Retrieval ─────────────────────────────────────────────

    describe('Configuration Retrieval', () => {
        test('should return the correct config for the Whisper model', () => {
            const whisperApiKey = generateMockApiKeyForValidation();
            const whisperApiUri = 'https://retrieval-whisper.openai.azure.com/';

            document.getElementById(ID.MODEL_SELECT).value = 'whisper';

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return 'whisper';
                if (key === STORAGE_KEYS.WHISPER_API_KEY) return whisperApiKey;
                if (key === STORAGE_KEYS.WHISPER_URI) return whisperApiUri;
                return null;
            });

            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            const config = freshSettings.getModelConfig();

            expect(config).toEqual({
                model: 'whisper',
                apiKey: whisperApiKey,
                uri: whisperApiUri,
            });
        });

        test('should return MAI shared credentials for the MAI 1.5 model', () => {
            const maiApiKey = 'speech-resource-key-for-mai-15';
            const maiApiUri = 'https://mai-transcribe.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15';

            document.getElementById(ID.MODEL_SELECT).value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;

            localStorageMock.getItem.mockImplementation((key) => {
                if (key === STORAGE_KEYS.MODEL) return MODEL_TYPES.MAI_TRANSCRIBE_1_5;
                if (key === STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY) return maiApiKey;
                if (key === STORAGE_KEYS.MAI_TRANSCRIBE_URI) return maiApiUri;
                return null;
            });

            const freshSettings = new Settings();
            vi.spyOn(freshSettings, 'checkInitialSettings').mockImplementation(() => {});
            vi.spyOn(freshSettings, 'updateSettingsVisibility').mockImplementation(() => {});

            const config = freshSettings.getModelConfig();

            expect(config).toEqual({
                model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
                apiKey: maiApiKey,
                uri: maiApiUri,
            });

            freshSettings.destroy();
        });
    });

    // ─── Save with Valid Configuration (from settings-save-modal) ────────────

    describe('Save with Valid Configuration', () => {
        test('should save valid Whisper configuration and close modal', () => {
            const mockKey = generateMockApiKeyForValidation();
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
            document.getElementById(ID.WHISPER_KEY).value = mockKey;
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://test.openai.azure.com/whisper'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                mockKey
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
                    hasUri: true,
                    hasApiKey: true
                })
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_LOADED,
                expect.objectContaining({
                    model: 'whisper',
                    hasUri: true,
                    hasApiKey: true
                })
            );
        });

        test('should save MAI 1.5 model with shared MAI credentials', () => {
            const maiApiKey = 'speech-resource-key-for-mai-15';
            const maiApiUri = 'https://mai-transcribe.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            document.getElementById(ID.MAI_TRANSCRIBE_URI).value = maiApiUri;
            document.getElementById(ID.MAI_TRANSCRIBE_KEY).value = maiApiKey;
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.MAI_TRANSCRIBE_URI, maiApiUri);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY, maiApiKey);
            expect(localStorageMock.setItem).not.toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI, maiApiUri);
            expect(localStorageMock.setItem).not.toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_API_KEY, maiApiKey);
            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_SAVED,
                expect.objectContaining({
                    model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
                    hasUri: true,
                    hasApiKey: true
                })
            );
        });

        test('should commit a valid modal model draft to active and persisted state exactly once', () => {
            const maiApiKey = 'speech-resource-key-for-mai-15';
            const maiApiUri = 'https://mai-transcribe.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
            const modalModelSelect = settings.settingsModelSelect;
            const modalChangeListener = modalModelSelect.addEventListener.mock.calls
                .find(([eventName]) => eventName === 'change')[1];

            settings.modelSelect.value = MODEL_TYPES.WHISPER;
            settings.openSettingsModal();
            modalModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            modalChangeListener({ target: modalModelSelect });
            document.getElementById(ID.MAI_TRANSCRIBE_URI).value = maiApiUri;
            document.getElementById(ID.MAI_TRANSCRIBE_KEY).value = maiApiKey;
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
        test('should not close modal when API key is missing', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
            document.getElementById(ID.WHISPER_KEY).value = '';
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
            document.getElementById(ID.WHISPER_URI).value = 'http://insecure.com';
            document.getElementById(ID.WHISPER_KEY).value = generateMockApiKeyForValidation();
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

        test('should not close modal when API key format is invalid', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
            document.getElementById(ID.WHISPER_KEY).value = 'invalid-key-format';
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

        test('should not save MAI API key with unsupported header characters', () => {
            const unsupportedCharacter = '\u2014';
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
            document.getElementById(ID.MAI_TRANSCRIBE_URI).value = 'https://mai-transcribe.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
            document.getElementById(ID.MAI_TRANSCRIBE_KEY).value = `speech${unsupportedCharacter}key`;
            document.getElementById(ID.SETTINGS_MODAL).style.display = 'block';

            settings.saveSettings();

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('block');
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([MESSAGES.INVALID_API_KEY_CHARACTERS])
                })
            );
        });
    });

    // ─── Input Sanitization During Save (from settings-save-modal) ───────────

    describe('Input Sanitization During Save', () => {
        test('should trim whitespace from inputs before saving', () => {
            const mockKey = generateMockApiKeyForValidation();
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = '  https://test.openai.azure.com/whisper  ';
            document.getElementById(ID.WHISPER_KEY).value = `  ${mockKey}  `;

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_URI,
                'https://test.openai.azure.com/whisper'
            );
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                mockKey
            );

            expect(document.getElementById(ID.SETTINGS_MODAL).style.display).toBe('none');
        });

        test('should remove newlines and tabs from API key', () => {
            const cleanMockKey = generateMockApiKeyForValidation();
            const dirtyMockKey = cleanMockKey.substring(0, 20) + '\n' + cleanMockKey.substring(20, 40) + '\t' + cleanMockKey.substring(40);

            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
            document.getElementById(ID.WHISPER_KEY).value = dirtyMockKey;

            settings.saveSettings();

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.WHISPER_API_KEY,
                cleanMockKey
            );
        });
    });

    // ─── Event Emission During Save Process (from settings-save-modal) ───────

    describe('Event Emission During Save Process', () => {
        test('should emit validation error event for invalid configuration', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = '';
            document.getElementById(ID.WHISPER_KEY).value = '';

            settings.saveSettings();

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([
                        expect.stringContaining('API key'),
                        expect.stringContaining('URI')
                    ])
                })
            );
        });

        test('should emit all required events for successful save', () => {
            document.getElementById(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            document.getElementById(ID.WHISPER_URI).value = 'https://test.openai.azure.com/whisper';
            document.getElementById(ID.WHISPER_KEY).value = generateMockApiKeyForValidation();

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
                    hasUri: true,
                    hasApiKey: true
                })
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_UPDATED
            );

            expect(eventBusEmitSpy).toHaveBeenCalledWith(
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
