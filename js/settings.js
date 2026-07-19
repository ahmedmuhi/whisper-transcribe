/**
 * @fileoverview Settings persistence and User-menu form behavior.
 */

import {
    DEFAULT_MODEL_TYPE,
    ID,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS
} from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { APP_EVENTS, eventBus } from './event-bus.js';
import { logger } from './logger.js';
import { modelAdapterRegistry } from './model-adapters/index.js';

const THEME_MODES = Object.freeze(['auto', 'light', 'dark']);

/**
 * Manages non-secret model, Target URI, microphone, and appearance settings.
 * Presentation and focus containment belong to UserMenu.
 */
export class Settings {
    constructor(adapterRegistry = modelAdapterRegistry) {
        this.adapterRegistry = adapterRegistry;
        this.userMenu = null;

        this.modelSelect = document.getElementById(ID.MODEL_SELECT);
        this.settingsModelSelect = document.getElementById(ID.SETTINGS_MODEL_SELECT);
        this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
        this.statusElement = document.getElementById(ID.STATUS);
        this.whisperSettings = document.getElementById(ID.WHISPER_SETTINGS);
        this.whisperUriInput = document.getElementById(ID.WHISPER_URI);
        this.maiTranscribeSettings = document.getElementById(ID.MAI_TRANSCRIBE_SETTINGS);
        this.maiTranscribeUriInput = document.getElementById(ID.MAI_TRANSCRIBE_URI);
        this.recordingEnvironmentSelect = document.getElementById(ID.RECORDING_ENVIRONMENT);
        this.noiseToggle = document.getElementById(ID.NOISE_TOGGLE);
        this.inputDeviceSelect = document.getElementById(ID.INPUT_DEVICE);
        this.themeModeInputs = Array.from(document.querySelectorAll?.('input[name="theme-mode"]') || []);

        this.init();
    }

    init() {
        this.loadSavedModel();
        this.loadNoiseToggle();
        this.loadThemeMode();
        this.setupEventListeners();
        this.updateSettingsVisibility();
        this._offPermissionGranted = eventBus.on(
            APP_EVENTS.PERMISSION_GRANTED,
            () => void this.populateDeviceList()
        );
        this.checkInitialSettings();
    }

    setUserMenu(userMenu) {
        this.userMenu = userMenu;
    }

    loadNoiseToggle() {
        const environment = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT)
            || RECORDING_ENVIRONMENTS.QUIET;
        if (this.noiseToggle) {
            this.noiseToggle.checked = environment === RECORDING_ENVIRONMENTS.NOISY;
        }
        if (this.recordingEnvironmentSelect) {
            this.recordingEnvironmentSelect.value = environment;
        }
    }

    loadThemeMode() {
        const storedMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE);
        const themeMode = THEME_MODES.includes(storedMode) ? storedMode : 'auto';
        this.themeModeInputs.forEach((input) => {
            input.checked = input.value === themeMode;
        });
    }

    loadSavedModel() {
        let savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
        const selectable = this._getSelectableModels();
        if (selectable.length > 0 && !selectable.includes(savedModel)) {
            savedModel = DEFAULT_MODEL_TYPE;
            localStorage.setItem(STORAGE_KEYS.MODEL, savedModel);
        }

        if (this.modelSelect) this.modelSelect.value = savedModel;
        if (this.settingsModelSelect) this.settingsModelSelect.value = savedModel;
    }

    _getSelectableModels() {
        return Array.from(this.modelSelect?.options || [])
            .map((option) => option.value)
            .filter(Boolean);
    }

    setupEventListeners() {
        this.modelSelect?.addEventListener('change', (event) => {
            const model = event.target.value;
            const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
            if (this.settingsModelSelect) this.settingsModelSelect.value = model;
            logger.child('Settings').info('UI model switched:', model, '(session only)');
            eventBus.emit(APP_EVENTS.UI_MODEL_SWITCHED, { model, savedModel });
        });

        this.settingsModelSelect?.addEventListener('change', () => {
            this.updateSettingsVisibility();
        });

        this.saveSettingsButton?.addEventListener('click', () => this.saveSettings());

        this.noiseToggle?.addEventListener('change', () => {
            const environment = this.noiseToggle.checked
                ? RECORDING_ENVIRONMENTS.NOISY
                : RECORDING_ENVIRONMENTS.QUIET;
            localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, environment);
            if (this.recordingEnvironmentSelect) {
                this.recordingEnvironmentSelect.value = environment;
            }
        });

        this.inputDeviceSelect?.addEventListener('change', () => {
            const deviceId = this.inputDeviceSelect.value;
            if (deviceId) localStorage.setItem(STORAGE_KEYS.INPUT_DEVICE, deviceId);
            else localStorage.removeItem(STORAGE_KEYS.INPUT_DEVICE);
            eventBus.emit(APP_EVENTS.DEVICE_CHANGED, { deviceId });
        });

        this.themeModeInputs.forEach((input) => {
            input.addEventListener('change', () => {
                if (!input.checked || !THEME_MODES.includes(input.value)) return;
                localStorage.setItem(STORAGE_KEYS.THEME_MODE, input.value);
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, { mode: input.value });
            });
        });
    }

    async populateDeviceList() {
        if (!this.inputDeviceSelect) return;
        const devices = await PermissionManager.getAvailableDevices();
        const savedDevice = localStorage.getItem(STORAGE_KEYS.INPUT_DEVICE) || '';
        const defaultOption = this.inputDeviceSelect.querySelector?.('option[value=""]');

        this.inputDeviceSelect.innerHTML = '';
        if (defaultOption) {
            this.inputDeviceSelect.appendChild(defaultOption);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'System Default';
            this.inputDeviceSelect.appendChild(option);
        }

        devices
            .filter((device) => device.deviceId !== 'default')
            .forEach((device) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || 'Microphone';
                this.inputDeviceSelect.appendChild(option);
            });
        this.inputDeviceSelect.value = savedDevice;
    }

    /** Both accepted Target URI fields remain visible in the Settings detail. */
    updateSettingsVisibility() {
        if (this.whisperSettings) this.whisperSettings.hidden = false;
        if (this.maiTranscribeSettings) this.maiTranscribeSettings.hidden = false;
    }

    prepareSettingsDraft() {
        this.loadSettingsToForm();
        this.updateSettingsVisibility();
    }

    /** Compatibility entry point used by prerequisite recovery to open the menu detail. */
    openSettingsModal(invoker = null) {
        this.prepareSettingsDraft();
        this.userMenu?.openDetail?.('settings', invoker);
        eventBus.emit(APP_EVENTS.UI_SETTINGS_OPENED);
    }

    /** Compatibility entry point; the User menu owns visual dismissal and focus return. */
    closeSettingsModal() {
        this.discardSettingsDraft();
        this.userMenu?.closeDetail?.();
        eventBus.emit(APP_EVENTS.UI_SETTINGS_CLOSED);
    }

    discardSettingsDraft() {
        this.loadSettingsToForm();
        this.updateSettingsVisibility();
    }

    _discardSettingsDraft() {
        this.discardSettingsDraft();
    }

    _getTargetUriStorageKey(model) {
        const uriStorageKey = this.adapterRegistry.get(model)?.storageKeys?.uri;
        if (typeof uriStorageKey !== 'string' || !uriStorageKey.trim()) {
            throw new Error(`Target URI storage metadata is missing for model "${model}"`);
        }
        return uriStorageKey;
    }

    _loadStoredTargetUri(model, uriInput) {
        if (!uriInput || !this.adapterRegistry.has(model)) return;
        uriInput.value = localStorage.getItem(this._getTargetUriStorageKey(model)) || '';
    }

    loadSettingsToForm() {
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = this.getCurrentModel();
        }
        this._loadStoredTargetUri(MODEL_TYPES.WHISPER, this.whisperUriInput);
        this._loadStoredTargetUri(MODEL_TYPES.MAI_TRANSCRIBE_1_5, this.maiTranscribeUriInput);
        this.loadNoiseToggle();
        this.loadThemeMode();
    }

    _getActiveInputs() {
        return {
            uriInput: this._isMaiModel(this.getCurrentModelFromSettings())
                ? this.maiTranscribeUriInput
                : this.whisperUriInput
        };
    }

    sanitizeInputs() {
        this._sanitizeUriInput(this._getActiveInputs().uriInput);
    }

    _sanitizeUriInput(uriInput) {
        if (uriInput && typeof uriInput.value === 'string') {
            uriInput.value = uriInput.value.replace(/\s+/gu, '');
        }
    }

    _validateUri(uri, { required = false } = {}) {
        if (!uri) return required ? MESSAGES.URI_REQUIRED : null;
        try {
            return new URL(uri).protocol === 'https:' ? null : MESSAGES.URI_MUST_BE_HTTPS;
        } catch {
            return MESSAGES.INVALID_URI_FORMAT;
        }
    }

    getValidationErrors() {
        this.sanitizeInputs();
        const uri = this._getActiveInputs().uriInput?.value?.trim() || '';
        const error = this._validateUri(uri, { required: true });
        return error ? [error] : [];
    }

    getSettingsFocusTarget() {
        const activeUriInput = this._getActiveInputs().uriInput;
        return this.getValidationErrors().length > 0
            ? activeUriInput
            : this.themeModeInputs.find((input) => input.checked) || activeUriInput;
    }

    _getAdditionalTargetUriErrors(currentModel) {
        if (![MODEL_TYPES.WHISPER, MODEL_TYPES.MAI_TRANSCRIBE_1_5].includes(currentModel)) {
            return [];
        }
        const inactiveInput = this._isMaiModel(currentModel)
            ? this.whisperUriInput
            : this.maiTranscribeUriInput;
        this._sanitizeUriInput(inactiveInput);
        const error = this._validateUri(inactiveInput?.value?.trim() || '');
        return error ? [error] : [];
    }

    saveSettings() {
        const currentModel = this.getCurrentModelFromSettings();
        const errors = [
            ...this.getValidationErrors(),
            ...this._getAdditionalTargetUriErrors(currentModel)
        ];
        if (errors.length > 0) {
            eventBus.emit(APP_EVENTS.SETTINGS_VALIDATION_ERROR, { errors });
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: errors[0] || MESSAGES.FILL_REQUIRED_FIELDS,
                type: 'error',
                temporary: true
            });
            return false;
        }

        const previousModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
        const activeUri = this._getActiveInputs().uriInput?.value?.trim() || '';
        localStorage.setItem(STORAGE_KEYS.MODEL, currentModel);
        localStorage.setItem(this._getTargetUriStorageKey(currentModel), activeUri);
        this._saveOtherTargetUri(currentModel);

        if (this.recordingEnvironmentSelect) {
            localStorage.setItem(
                STORAGE_KEYS.RECORDING_ENVIRONMENT,
                this.recordingEnvironmentSelect.value || RECORDING_ENVIRONMENTS.QUIET
            );
        }
        if (this.modelSelect) this.modelSelect.value = currentModel;

        this.closeSettingsModal();
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.SETTINGS_SAVED,
            type: 'success',
            temporary: true,
            duration: 3000
        });
        if (currentModel !== previousModel) {
            eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                model: currentModel,
                previousModel
            });
        }
        const presentation = { model: currentModel, hasUri: Boolean(activeUri) };
        eventBus.emit(APP_EVENTS.SETTINGS_SAVED, presentation);
        eventBus.emit(APP_EVENTS.SETTINGS_LOADED, presentation);
        eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
        return true;
    }

    _saveOtherTargetUri(currentModel) {
        if (![MODEL_TYPES.WHISPER, MODEL_TYPES.MAI_TRANSCRIBE_1_5].includes(currentModel)) return;
        const otherModel = this._isMaiModel(currentModel)
            ? MODEL_TYPES.WHISPER
            : MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        const otherInput = this._isMaiModel(currentModel)
            ? this.whisperUriInput
            : this.maiTranscribeUriInput;
        const otherUri = otherInput?.value?.trim() || '';
        if (otherUri) localStorage.setItem(this._getTargetUriStorageKey(otherModel), otherUri);
        else localStorage.removeItem(this._getTargetUriStorageKey(otherModel));
    }

    getCurrentModel() {
        return this.modelSelect?.value || DEFAULT_MODEL_TYPE;
    }

    getCurrentModelFromSettings() {
        return this.settingsModelSelect?.value || this.getCurrentModel();
    }

    getModelConfig() {
        const model = this.getCurrentModel();
        return {
            model,
            uri: localStorage.getItem(this._getTargetUriStorageKey(model))
        };
    }

    _isMaiModel(model) {
        return model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
    }

    checkInitialSettings() {
        const config = this.getModelConfig();
        if (!config.uri) {
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.TARGET_URI_NOT_CONFIGURED,
                type: 'info'
            });
            return;
        }
        eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
            model: config.model,
            hasUri: true
        });
    }

    destroy() {
        this._offPermissionGranted?.();
        this._offPermissionGranted = null;
    }
}
