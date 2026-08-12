/**
 * @fileoverview Settings persistence and instant-apply preference controls.
 */

import {
    DEFAULT_MAI_TRANSCRIBE_STYLE,
    DEFAULT_MODEL_TYPE,
    ID,
    MAI_TRANSCRIBE_STYLES,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS
} from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { APP_EVENTS, eventBus } from './event-bus.js';
import { logger } from './logger.js';
import { listModelAdapters, modelAdapterRegistry } from './model-adapters/index.js';

const THEME_MODES = Object.freeze(['auto', 'light', 'dark']);

/** Base class of the Target URI status badge rendered next to each URI field. */
const URI_BADGE_CLASS = 'uri-badge';

/** Container the settings modal lists every row in; generated rows join it directly. */
const SETTINGS_ROWS_SELECTOR = '.settings-rows';

/** Category every generated Target URI row belongs to. */
const CONNECTION_CATEGORY = 'connection';

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
 * Builds one Connection row per adapter from its `uri` metadata. The row shape
 * matches what `SettingsSurface` searches and filters generically, so the
 * generated markup must keep `data-settings-row`, `data-category`, and
 * `data-keywords`. Rows are created node by node: no innerHTML with values.
 */
export function renderConnectionRows(container = document.querySelector?.(SETTINGS_ROWS_SELECTOR), registry = modelAdapterRegistry) {
    if (!container) return;
    container.querySelectorAll?.(`[data-category="${CONNECTION_CATEGORY}"]`)
        ?.forEach((row) => row.remove());
    for (const adapter of listModelAdapters(registry)) {
        const meta = adapter.uri;
        if (!meta?.inputId) continue;
        container.appendChild(createConnectionRow(meta));
    }
}

function createConnectionRow(meta) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.dataset.settingsRow = meta.rowId;
    row.dataset.category = CONNECTION_CATEGORY;
    row.dataset.keywords = meta.keywords || '';

    const copy = document.createElement('div');
    copy.className = 'settings-row-copy';

    const label = document.createElement('label');
    label.className = 'settings-row-title';
    label.htmlFor = meta.inputId;
    label.appendChild(document.createTextNode(meta.title || ''));
    const chip = document.createElement('span');
    chip.className = 'settings-row-chip';
    chip.setAttribute('aria-hidden', 'true');
    chip.textContent = 'Connection';
    label.appendChild(chip);

    const subtitle = document.createElement('p');
    subtitle.className = 'settings-row-subtitle';
    subtitle.textContent = meta.subtitle || '';

    const badge = document.createElement('span');
    badge.id = meta.badgeId;
    badge.className = URI_BADGE_CLASS;

    copy.appendChild(label);
    copy.appendChild(subtitle);
    copy.appendChild(badge);

    const control = document.createElement('div');
    control.className = 'settings-row-control';
    const input = document.createElement('input');
    input.type = 'url';
    input.id = meta.inputId;
    input.autocomplete = 'off';
    input.spellcheck = false;
    control.appendChild(input);

    row.appendChild(copy);
    row.appendChild(control);
    return row;
}


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
        // Target URI fields are keyed by adapter id; the named properties below
        // stay as aliases for the two shipped models.
        this.uriFields = new Map();
        this.whisperUriInput = null;
        this.whisperUriBadge = null;
        this.maiTranscribeUriInput = null;
        this.maiUriBadge = null;
        this.recordingEnvironmentSelect = document.getElementById(ID.RECORDING_ENVIRONMENT);
        this.noiseToggle = document.getElementById(ID.NOISE_TOGGLE);
        this.quickNoiseToggle = document.getElementById(ID.QUICK_NOISE_TOGGLE);
        this.verbatimSetting = document.getElementById(ID.VERBATIM_SETTING);
        this.verbatimToggle = document.getElementById(ID.VERBATIM_TOGGLE);
        this.inputDeviceSelect = document.getElementById(ID.INPUT_DEVICE);
        this.themeModeInputs = Array.from(document.querySelectorAll?.(
            'input[name="theme-mode"], input[name="theme-mode-quick"]'
        ) || []);
        this._storageHandler = (event) => {
            if (event.key === STORAGE_KEYS.MAI_TRANSCRIBE_STYLE || event.key === null) {
                this.loadVerbatimToggle();
            }
        };

        this.init();
    }

    init() {
        this._renderModelOptions();
        renderConnectionRows(undefined, this.adapterRegistry);
        this._resolveUriFields();
        this.loadSavedModel();
        this.loadTargetUris();
        this.loadNoiseToggle();
        this.loadVerbatimToggle();
        this.loadThemeMode();
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

    /** Selectable models come from the adapter registry, never from the markup. */
    _getSelectableModels() {
        return Array.from(this.adapterRegistry.keys()).filter(Boolean);
    }

    /**
     * Fills every model `<select>` from the registry so a newly registered
     * adapter appears without touching index.html.
     */
    _renderModelOptions() {
        [this.modelSelect, this.settingsModelSelect].forEach((select) => {
            if (!select) return;
            while (select.firstChild) select.removeChild(select.firstChild);
            for (const adapter of listModelAdapters(this.adapterRegistry)) {
                const option = document.createElement('option');
                option.value = adapter.id;
                option.textContent = adapter.optionLabel || adapter.label || adapter.id;
                select.appendChild(option);
            }
        });
    }

    /** Maps every registered adapter to its Target URI input and badge. */
    _resolveUriFields() {
        this.uriFields = new Map();
        for (const adapter of listModelAdapters(this.adapterRegistry)) {
            const meta = adapter.uri;
            if (!meta?.inputId) continue;
            this.uriFields.set(adapter.id, {
                input: document.getElementById(meta.inputId),
                badge: document.getElementById(meta.badgeId)
            });
        }
        const whisper = this.uriFields.get(MODEL_TYPES.WHISPER);
        const mai = this.uriFields.get(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        this.whisperUriInput = whisper?.input || null;
        this.whisperUriBadge = whisper?.badge || null;
        this.maiTranscribeUriInput = mai?.input || null;
        this.maiUriBadge = mai?.badge || null;
    }

    /** Loads each model's stored Target URI into its field. */
    loadTargetUris() {
        for (const [model, field] of this.uriFields) {
            this._loadStoredTargetUri(model, field.input);
        }
    }

    setupEventListeners() {
        this.modelSelect?.addEventListener('change', (event) => {
            this._handleModelChange(event.target.value);
        });

        this.settingsModelSelect?.addEventListener('change', (event) => {
            this._handleModelChange(event.target.value);
        });

        for (const [model, field] of this.uriFields) {
            this._setupUriListener(field.input, model);
        }

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
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, { mode: input.value });
            });
        });
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
     * Emptying the field or editing it into an invalid value removes the stored key, so the
     * stored Target URI always mirrors a valid visible value and never stays live behind an
     * error badge.
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
        } else {
            localStorage.removeItem(this._getTargetUriStorageKey(model));
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

    /** Redraws every Target URI status badge from the current field values. */
    renderUriBadges() {
        for (const [model, field] of this.uriFields) {
            this._renderUriBadge(field.input, field.badge, model);
        }
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
