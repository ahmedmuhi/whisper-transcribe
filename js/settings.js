/**
 * @fileoverview Settings persistence and instant-apply preference controls.
 */

import {
    DEFAULT_MAI_TRANSCRIBE_STYLE,
    DEFAULT_MODEL_TYPE,
    DEFAULT_THEME_PALETTE,
    ID,
    MAI_TRANSCRIBE_STYLES,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS,
    THEME_PALETTES,
    THEME_PALETTE_ATTRIBUTE,
    THEME_PALETTE_VALUE_ATTRIBUTE
} from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { APP_EVENTS, eventBus } from './event-bus.js';
import { logger } from './logger.js';
import { modelAdapterRegistry } from './model-adapters/index.js';

const THEME_MODES = Object.freeze(['auto', 'light', 'dark']);

/** Base class of the Target URI status badge rendered next to each URI field. */
const URI_BADGE_CLASS = 'uri-badge';

/**
 * Target URI badge states. Text is user-facing; the class carries the token colour.
 *
 * @constant {Object<string, {text: string, modifier: string}>} URI_BADGE_STATES
 */
const URI_BADGE_STATES = Object.freeze({
    VALID: Object.freeze({ text: '✓ Valid HTTPS', modifier: 'uri-badge--valid' }),
    NOT_HTTPS: Object.freeze({ text: 'Must be HTTPS', modifier: 'uri-badge--error' }),
    INVALID: Object.freeze({ text: MESSAGES.INVALID_URI_FORMAT, modifier: 'uri-badge--error' }),
    REQUIRED: Object.freeze({ text: 'Required for the active model', modifier: 'uri-badge--warn' }),
    UNSET: Object.freeze({ text: 'Not set', modifier: 'uri-badge--muted' })
});

/**
 * Manages non-secret model, Target URI, microphone, and appearance settings.
 * Every control applies instantly; there is no draft, no save step.
 * Presentation, focus containment, and search belong to SettingsSurface.
 */
export class Settings {
    constructor(adapterRegistry = modelAdapterRegistry) {
        this.adapterRegistry = adapterRegistry;
        this.surface = null;

        this.modelSelect = document.getElementById(ID.MODEL_SELECT);
        this.settingsModelSelect = document.getElementById(ID.SETTINGS_MODEL_SELECT);
        this.statusElement = document.getElementById(ID.STATUS);
        this.whisperUriInput = document.getElementById(ID.WHISPER_URI);
        this.whisperUriBadge = document.getElementById(ID.WHISPER_URI_BADGE);
        this.maiTranscribeUriInput = document.getElementById(ID.MAI_TRANSCRIBE_URI);
        this.maiUriBadge = document.getElementById(ID.MAI_URI_BADGE);
        this.recordingEnvironmentSelect = document.getElementById(ID.RECORDING_ENVIRONMENT);
        this.noiseToggle = document.getElementById(ID.NOISE_TOGGLE);
        this.quickNoiseToggle = document.getElementById(ID.QUICK_NOISE_TOGGLE);
        this.verbatimSetting = document.getElementById(ID.VERBATIM_SETTING);
        this.verbatimToggle = document.getElementById(ID.VERBATIM_TOGGLE);
        this.inputDeviceSelect = document.getElementById(ID.INPUT_DEVICE);
        this.themeModeInputs = Array.from(document.querySelectorAll?.(
            'input[name="theme-mode"], input[name="theme-mode-quick"]'
        ) || []);
        this.paletteGrid = document.getElementById(ID.PALETTE_GRID);
        this.paletteCards = Array.from(
            this.paletteGrid?.querySelectorAll?.(`[${THEME_PALETTE_VALUE_ATTRIBUTE}]`) || []
        );
        this._storageHandler = (event) => {
            if (event.key === STORAGE_KEYS.MAI_TRANSCRIBE_STYLE || event.key === null) {
                this.loadVerbatimToggle();
            }
            if (event.key === STORAGE_KEYS.THEME_PALETTE || event.key === null) {
                this.loadThemePalette();
            }
        };

        this.init();
    }

    init() {
        this.loadSavedModel();
        this.loadTargetUris();
        this.loadNoiseToggle();
        this.loadVerbatimToggle();
        this.loadThemeMode();
        this.loadThemePalette();
        this.setupEventListeners();
        this.updateVerbatimVisibility();
        this.renderUriBadges();
        this._offPermissionGranted = eventBus.on(
            APP_EVENTS.PERMISSION_GRANTED,
            () => void this.populateDeviceList()
        );
        this.checkInitialSettings();
    }

    /**
     * Connects the surface that owns the popover, the modal, and focus return.
     *
     * @param {object} surface SettingsSurface instance.
     */
    setSurface(surface) {
        this.surface = surface;
    }

    loadNoiseToggle() {
        const environment = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT)
            || RECORDING_ENVIRONMENTS.QUIET;
        this._applyNoiseEnvironment(environment);
    }

    _applyNoiseEnvironment(environment) {
        const noisy = environment === RECORDING_ENVIRONMENTS.NOISY;
        if (this.noiseToggle) this.noiseToggle.checked = noisy;
        if (this.quickNoiseToggle) this.quickNoiseToggle.checked = noisy;
        if (this.recordingEnvironmentSelect) this.recordingEnvironmentSelect.value = environment;
    }

    _getTranscribeStyle() {
        return localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE) === MAI_TRANSCRIBE_STYLES.VERBATIM
            ? MAI_TRANSCRIBE_STYLES.VERBATIM
            : DEFAULT_MAI_TRANSCRIBE_STYLE;
    }

    loadVerbatimToggle() {
        if (this.verbatimToggle) {
            this.verbatimToggle.checked = this._getTranscribeStyle() === MAI_TRANSCRIBE_STYLES.VERBATIM;
        }
    }

    loadThemeMode() {
        const storedMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE);
        this._applyThemeMode(THEME_MODES.includes(storedMode) ? storedMode : 'auto');
    }

    /** Keeps the modal radios and the quick-settings radios showing one mode. */
    _applyThemeMode(themeMode) {
        this.themeModeInputs.forEach((input) => {
            input.checked = input.value === themeMode;
        });
    }

    /**
     * Resolves the stored palette. A missing key and an unknown value both mean
     * the default, so an existing user with only a themeMode keeps Coastal Teal.
     *
     * @returns {string} One of THEME_PALETTES.
     */
    _getStoredThemePalette() {
        const stored = localStorage.getItem(STORAGE_KEYS.THEME_PALETTE);
        return THEME_PALETTES.includes(stored) ? stored : DEFAULT_THEME_PALETTE;
    }

    /** Applies the stored palette without writing storage: reads never persist. */
    loadThemePalette() {
        this._applyThemePalette(this._getStoredThemePalette());
    }

    /**
     * Paints the palette and syncs the radiogroup. The attribute goes on the
     * element .dark-theme is toggled on, so palette and light/dark form compose.
     *
     * @param {string} palette One of THEME_PALETTES.
     */
    _applyThemePalette(palette) {
        document.documentElement.setAttribute(THEME_PALETTE_ATTRIBUTE, palette);
        this.paletteCards.forEach((card) => {
            const selected = card.getAttribute(THEME_PALETTE_VALUE_ATTRIBUTE) === palette;
            card.setAttribute('aria-checked', String(selected));
            card.tabIndex = selected ? 0 : -1;
        });
    }

    /**
     * Persists and applies a palette choice instantly — no save step, no reload.
     *
     * @param {string} palette One of THEME_PALETTES.
     */
    _handleThemePaletteChange(palette) {
        if (!THEME_PALETTES.includes(palette)) return;
        localStorage.setItem(STORAGE_KEYS.THEME_PALETTE, palette);
        this._applyThemePalette(palette);
        eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, {
            mode: this._getStoredThemeMode(),
            palette
        });
    }

    /** @returns {string} The stored theme mode, or 'auto'. */
    _getStoredThemeMode() {
        const stored = localStorage.getItem(STORAGE_KEYS.THEME_MODE);
        return THEME_MODES.includes(stored) ? stored : 'auto';
    }

    /**
     * Radiogroup keyboard model: arrows wrap and select, Home/End jump to the
     * ends, Space/Enter selects the focused card, and focus follows selection.
     *
     * @param {KeyboardEvent} event Key pressed inside the palette grid.
     */
    _handlePaletteKeydown(event) {
        const card = event.target.closest?.(`[${THEME_PALETTE_VALUE_ATTRIBUTE}]`);
        const index = this.paletteCards.indexOf(card);
        if (index < 0) return;

        const last = this.paletteCards.length - 1;
        let next = null;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                next = index === last ? 0 : index + 1;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                next = index === 0 ? last : index - 1;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = last;
                break;
            case ' ':
            case 'Enter':
                next = index;
                break;
            default:
                return;
        }

        event.preventDefault();
        const target = this.paletteCards[next];
        this._handleThemePaletteChange(target.getAttribute(THEME_PALETTE_VALUE_ATTRIBUTE));
        target.focus();
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
        const options = this.modelSelect?.options || this.settingsModelSelect?.options || [];
        return Array.from(options)
            .map((option) => option.value)
            .filter(Boolean);
    }

    /** Loads each model's stored Target URI into its field. */
    loadTargetUris() {
        this._loadStoredTargetUri(MODEL_TYPES.WHISPER, this.whisperUriInput);
        this._loadStoredTargetUri(MODEL_TYPES.MAI_TRANSCRIBE_1_5, this.maiTranscribeUriInput);
    }

    setupEventListeners() {
        this.modelSelect?.addEventListener('change', (event) => {
            this._handleModelChange(event.target.value);
        });

        this.settingsModelSelect?.addEventListener('change', (event) => {
            this._handleModelChange(event.target.value);
        });

        this._setupUriListener(this.whisperUriInput, MODEL_TYPES.WHISPER);
        this._setupUriListener(this.maiTranscribeUriInput, MODEL_TYPES.MAI_TRANSCRIBE_1_5);

        [this.noiseToggle, this.quickNoiseToggle].forEach((toggle) => {
            toggle?.addEventListener('change', () => {
                const environment = toggle.checked
                    ? RECORDING_ENVIRONMENTS.NOISY
                    : RECORDING_ENVIRONMENTS.QUIET;
                localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, environment);
                this._applyNoiseEnvironment(environment);
            });
        });

        this.verbatimToggle?.addEventListener('change', () => {
            localStorage.setItem(
                STORAGE_KEYS.MAI_TRANSCRIBE_STYLE,
                this.verbatimToggle.checked
                    ? MAI_TRANSCRIBE_STYLES.VERBATIM
                    : MAI_TRANSCRIBE_STYLES.READABILITY
            );
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
                this._applyThemeMode(input.value);
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, {
                    mode: input.value,
                    palette: this._getStoredThemePalette()
                });
            });
        });

        this.paletteCards.forEach((card) => {
            card.addEventListener('click', () => {
                this._handleThemePaletteChange(card.getAttribute(THEME_PALETTE_VALUE_ATTRIBUTE));
            });
        });
        this.paletteGrid?.addEventListener('keydown', (event) => this._handlePaletteKeydown(event));

        window.addEventListener('storage', this._storageHandler);
    }

    _setupUriListener(uriInput, model) {
        uriInput?.addEventListener('input', () => this._handleUriInput(uriInput, model));
    }

    /**
     * Applies a model choice at once: both selects, storage, and the model events.
     *
     * @param {string} model Selected model identifier.
     */
    _handleModelChange(model) {
        const previousModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
        if (this.modelSelect) this.modelSelect.value = model;
        if (this.settingsModelSelect) this.settingsModelSelect.value = model;
        localStorage.setItem(STORAGE_KEYS.MODEL, model);
        logger.child('Settings').info('Model switched:', model);

        eventBus.emit(APP_EVENTS.UI_MODEL_SWITCHED, { model, savedModel: previousModel });

        if (model !== previousModel) {
            eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, { model, previousModel });
            const presentation = { model, hasUri: Boolean(this._getStoredTargetUri(model)) };
            eventBus.emit(APP_EVENTS.SETTINGS_SAVED, presentation);
            eventBus.emit(APP_EVENTS.SETTINGS_LOADED, presentation);
            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
        }

        this.updateVerbatimVisibility();
        this.renderUriBadges();
    }

    /**
     * Validates a Target URI as it is typed and persists it only while it is valid HTTPS.
     *
     * @param {HTMLInputElement} uriInput Field being edited.
     * @param {string} model Model the field belongs to.
     */
    _handleUriInput(uriInput, model) {
        this._sanitizeUriInput(uriInput);
        const uri = uriInput.value.trim();
        if (!uri) {
            localStorage.removeItem(this._getTargetUriStorageKey(model));
        } else if (!this._validateUri(uri)) {
            localStorage.setItem(this._getTargetUriStorageKey(model), uri);
        }
        eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
        this.renderUriBadges();
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
            option.textContent = 'System default';
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

    /**
     * The verbatim switch is MAI-Transcribe 1.5 only; Whisper never sends the field.
     * The surface owns row visibility once it is wired, so it re-runs its category
     * and search filter — showing the row here directly would leak it into whatever
     * category the modal happens to be on.
     */
    updateVerbatimVisibility() {
        if (this.surface?.refreshRows) {
            this.surface.refreshRows();
            return;
        }
        if (this.verbatimSetting) {
            this.verbatimSetting.hidden = !this._isMaiModel(this.getCurrentModel());
        }
    }

    /** Redraws both Target URI status badges from the current field values. */
    renderUriBadges() {
        this._renderUriBadge(this.whisperUriInput, this.whisperUriBadge, MODEL_TYPES.WHISPER);
        this._renderUriBadge(
            this.maiTranscribeUriInput,
            this.maiUriBadge,
            MODEL_TYPES.MAI_TRANSCRIBE_1_5
        );
    }

    _renderUriBadge(uriInput, badge, model) {
        if (!badge) return;
        const state = this._getUriBadgeState(uriInput?.value?.trim() || '', model);
        badge.textContent = state.text;
        badge.className = `${URI_BADGE_CLASS} ${state.modifier}`;
    }

    _getUriBadgeState(uri, model) {
        if (!uri) {
            return model === this.getCurrentModel() ? URI_BADGE_STATES.REQUIRED : URI_BADGE_STATES.UNSET;
        }
        const error = this._validateUri(uri);
        if (error === MESSAGES.URI_MUST_BE_HTTPS) return URI_BADGE_STATES.NOT_HTTPS;
        if (error) return URI_BADGE_STATES.INVALID;
        return URI_BADGE_STATES.VALID;
    }

    /** Delegates to the surface so recovery paths land on the Connection category.
     *  The surface owns the UI_SETTINGS_OPENED emission. */
    openSettingsModal(invoker = null) {
        this.surface?.openModal?.({ category: 'connection', invoker });
    }

    /** The surface owns visual dismissal, focus return, and UI_SETTINGS_CLOSED. */
    closeSettingsModal() {
        this.surface?.closeModal?.();
    }

    _getTargetUriStorageKey(model) {
        const uriStorageKey = this.adapterRegistry.get(model)?.storageKeys?.uri;
        if (typeof uriStorageKey !== 'string' || !uriStorageKey.trim()) {
            throw new Error(`Target URI storage metadata is missing for model "${model}"`);
        }
        return uriStorageKey;
    }

    _getStoredTargetUri(model) {
        return this.adapterRegistry.has(model)
            ? localStorage.getItem(this._getTargetUriStorageKey(model))
            : null;
    }

    _loadStoredTargetUri(model, uriInput) {
        if (!uriInput || !this.adapterRegistry.has(model)) return;
        uriInput.value = this._getStoredTargetUri(model) || '';
    }

    _sanitizeUriInput(uriInput) {
        if (uriInput && typeof uriInput.value === 'string') {
            uriInput.value = uriInput.value.replace(/\s+/gu, '');
        }
    }

    _validateUri(uri) {
        if (!uri) return MESSAGES.URI_REQUIRED;
        try {
            return new URL(uri).protocol === 'https:' ? null : MESSAGES.URI_MUST_BE_HTTPS;
        } catch {
            return MESSAGES.INVALID_URI_FORMAT;
        }
    }

    getCurrentModel() {
        return this.modelSelect?.value
            || this.settingsModelSelect?.value
            || localStorage.getItem(STORAGE_KEYS.MODEL)
            || DEFAULT_MODEL_TYPE;
    }

    getModelConfig() {
        const model = this.getCurrentModel();
        const config = {
            model,
            uri: localStorage.getItem(this._getTargetUriStorageKey(model))
        };
        if (this._isMaiModel(model)) {
            config.transcribeStyle = this._getTranscribeStyle();
        }
        return config;
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
        window.removeEventListener('storage', this._storageHandler);
        this._offPermissionGranted?.();
        this._offPermissionGranted = null;
    }
}
