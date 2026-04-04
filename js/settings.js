/**
 * @fileoverview Settings management for API configuration and user preferences.
 */

import { STORAGE_KEYS, MESSAGES, ID, MODEL_TYPES, RECORDING_ENVIRONMENTS } from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * Settings manager for API configuration and user preferences.
 * Handles model selection, API credentials, validation, and persistence to localStorage.
 * Provides configuration for Azure Whisper transcription models.
 * 
 * @class Settings
 * @fires APP_EVENTS.SETTINGS_UPDATED
 * @fires APP_EVENTS.SETTINGS_MODEL_CHANGED
 * @fires APP_EVENTS.SETTINGS_SAVED
 * @fires APP_EVENTS.SETTINGS_VALIDATION_ERROR
 * 
 * @example
 * const settings = new Settings();
 * 
 * // Get current model configuration
 * const config = settings.getModelConfig();
 * logger.info('Current model:', config.model);
 * 
 * // Open settings modal
 * settings.openSettingsModal();
 */
export class Settings {
    /**
     * Creates a new Settings manager instance.
     * Initializes DOM references and loads saved settings.
     */
    constructor() {
        this.modelSelect = document.getElementById(ID.MODEL_SELECT);
        this.settingsModelSelect = document.getElementById(ID.SETTINGS_MODEL_SELECT);
        this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
        this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
        this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
        this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);

        // Cache the status element with the other DOM references
        this.statusElement = document.getElementById(ID.STATUS);
    // Cache settings containers and form inputs
    this.whisperSettings = document.getElementById(ID.WHISPER_SETTINGS);
    this.whisperUriInput = document.getElementById(ID.WHISPER_URI);
    this.whisperKeyInput = document.getElementById(ID.WHISPER_KEY);
    this.maiTranscribeSettings = document.getElementById(ID.MAI_TRANSCRIBE_SETTINGS);
    this.maiTranscribeUriInput = document.getElementById(ID.MAI_TRANSCRIBE_URI);
    this.maiTranscribeKeyInput = document.getElementById(ID.MAI_TRANSCRIBE_KEY);
    this.recordingEnvironmentSelect = document.getElementById(ID.RECORDING_ENVIRONMENT);

        // Side panel elements
        this.sidePanel = document.getElementById(ID.SIDE_PANEL);
        this.panelToggle = document.getElementById(ID.PANEL_TOGGLE);
        this.panelClose = document.getElementById(ID.PANEL_CLOSE);
        this.panelBackdrop = document.getElementById(ID.PANEL_BACKDROP);
        this.noiseToggle = document.getElementById(ID.NOISE_TOGGLE);
        this.inputDeviceSelect = document.getElementById(ID.INPUT_DEVICE);

        this.init();
    }
    
    /**
     * Initializes the settings manager.
     * Loads saved preferences, sets up event listeners, and validates configuration.
     * 
     * @private
     * @method init
     */
    init() {
        this.loadSavedModel();
        this.loadNoiseToggle();
        this.setupEventListeners();
        this.setupPanelListeners();
        this.updateSettingsVisibility();
        this.checkInitialSettings();
    }

    /**
     * Load the noise toggle state from the recording environment setting.
     * @private
     */
    loadNoiseToggle() {
        const env = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT) || RECORDING_ENVIRONMENTS.QUIET;
        if (this.noiseToggle) {
            this.noiseToggle.checked = env === RECORDING_ENVIRONMENTS.NOISY;
        }
    }
    
    /**
     * Loads the previously saved transcription model from localStorage.
     * Defaults to 'whisper' if no model has been saved.
     * 
     * @private
     * @method loadSavedModel
     */
    loadSavedModel() {
        const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || MODEL_TYPES.WHISPER;
        this.modelSelect.value = savedModel;
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = savedModel;
        }
    }
    
    /**
     * Sets up event listeners for settings UI interactions.
     * Handles model changes, modal opening/closing, and form submission.
     * 
     * @private
     * @method setupEventListeners
     * @fires APP_EVENTS.SETTINGS_MODEL_CHANGED
     * @fires APP_EVENTS.UI_SETTINGS_OPENED
     * @fires APP_EVENTS.UI_SETTINGS_CLOSED
     */
    setupEventListeners() {
        // Main interface model change listener
        this.modelSelect.addEventListener('change', (e) => {
            const newModel = e.target.value;
            const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || MODEL_TYPES.WHISPER;
            
            // Do NOT persist to localStorage for main UI selector changes
            const settingsLogger = logger.child('Settings');
            settingsLogger.info('UI model switched to:', newModel, '(session only)');
            
            // Sync settings modal selector to show current UI selection
            if (this.settingsModelSelect) {
                this.settingsModelSelect.value = newModel;
            }
            this.updateSettingsVisibility();
            
            // Emit UI-only model switched event (no persistence)
            eventBus.emit(APP_EVENTS.UI_MODEL_SWITCHED, {
                model: newModel,
                savedModel: savedModel
            });
        });

        // Settings modal model change listener
        if (this.settingsModelSelect) {
            this.settingsModelSelect.addEventListener('change', (e) => {
                const newModel = e.target.value;
                
                // Do NOT persist to localStorage until save is clicked
                const settingsLogger = logger.child('Settings');
                settingsLogger.info('Settings modal model changed to:', newModel, '(form only, not saved)');
                
                // Sync main interface selector to show current form selection
                if (this.modelSelect) {
                    this.modelSelect.value = newModel;
                }
                this.updateSettingsVisibility();
                
                // Do NOT emit any events until settings are saved
                // This keeps the form state separate from persisted configuration
            });
        }
        
        // Settings button listener (now inside the panel footer)
        this.settingsButton.addEventListener('click', () => {
            this.closeSidePanel();
            this.openSettingsModal();
        });
        
        // Close modal listeners
        this.closeModalButton.addEventListener('click', () => {
            this.closeSettingsModal();
        });
        
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal || e.target.classList.contains('modal-backdrop')) {
                this.closeSettingsModal();
            }
        });
        
        // Save settings listener
        this.saveSettingsButton.addEventListener('click', () => {
            this.saveSettings();
        });

        // Noise toggle — live-save to localStorage
        if (this.noiseToggle) {
            this.noiseToggle.addEventListener('change', () => {
                const env = this.noiseToggle.checked
                    ? RECORDING_ENVIRONMENTS.NOISY
                    : RECORDING_ENVIRONMENTS.QUIET;
                localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, env);
                if (this.recordingEnvironmentSelect) {
                    this.recordingEnvironmentSelect.value = env;
                }
            });
        }

        // Input device — live-save to localStorage
        if (this.inputDeviceSelect) {
            this.inputDeviceSelect.addEventListener('change', () => {
                const deviceId = this.inputDeviceSelect.value;
                if (deviceId) {
                    localStorage.setItem(STORAGE_KEYS.INPUT_DEVICE, deviceId);
                } else {
                    localStorage.removeItem(STORAGE_KEYS.INPUT_DEVICE);
                }
                eventBus.emit(APP_EVENTS.DEVICE_CHANGED, { deviceId });
            });
        }
    }

    /**
     * Set up Notion-style side panel with 3 states:
     * - pinned: sidebar visible, pushes content
     * - hover-preview: floating overlay on hamburger hover
     * - closed: sidebar hidden
     * @private
     */
    setupPanelListeners() {
        // Click hamburger → pin the sidebar open
        if (this.panelToggle) {
            this.panelToggle.addEventListener('click', () => this.pinSidebar());

            // Hover hamburger → show floating preview
            this.panelToggle.addEventListener('mouseenter', () => {
                if (!this._isSidebarPinned()) {
                    this._showHoverPreview();
                }
            });
        }

        // « collapse button → unpin / close
        if (this.panelClose) {
            this.panelClose.addEventListener('click', () => this.unpinSidebar());
        }

        // Backdrop click (mobile) → close
        if (this.panelBackdrop) {
            this.panelBackdrop.addEventListener('click', () => this.unpinSidebar());
        }

        // Mouse leaves sidebar during hover-preview → hide it
        if (this.sidePanel) {
            this.sidePanel.addEventListener('mouseleave', () => {
                if (this.sidePanel.classList.contains('hover-preview')) {
                    // Small delay so moving between hamburger and panel doesn't flicker
                    this._hoverCloseTimer = setTimeout(() => {
                        this._hideHoverPreview();
                    }, 200);
                }
            });

            this.sidePanel.addEventListener('mouseenter', () => {
                if (this._hoverCloseTimer) {
                    clearTimeout(this._hoverCloseTimer);
                    this._hoverCloseTimer = null;
                }
            });
        }

        // Refresh device list when mic permission is granted
        this._offPermissionGranted = eventBus.on(APP_EVENTS.PERMISSION_GRANTED, () => this.populateDeviceList());

        // Escape key → close sidebar
        this._panelEscHandler = (e) => {
            if (e.key === 'Escape') {
                if (this._isSidebarPinned()) {
                    this.unpinSidebar();
                } else if (this.sidePanel?.classList.contains('hover-preview')) {
                    this._hideHoverPreview();
                }
            }
        };
        if (document.addEventListener) {
            document.addEventListener('keydown', this._panelEscHandler);
        }

        // Restore pinned state from localStorage
        if (localStorage.getItem(STORAGE_KEYS.SIDEBAR_PINNED) === 'true') {
            this.pinSidebar(false);
        }
    }

    _isSidebarPinned() {
        return this.sidePanel?.classList.contains('pinned');
    }

    _showHoverPreview() {
        if (!this.sidePanel) return;
        this.sidePanel.classList.add('hover-preview');
        this.populateDeviceList();
    }

    _hideHoverPreview() {
        if (!this.sidePanel) return;
        this.sidePanel.classList.remove('hover-preview');
    }

    pinSidebar(persist = true) {
        if (!this.sidePanel) return;
        this.sidePanel.classList.remove('hover-preview');
        this.sidePanel.classList.add('pinned');
        document.body.classList.add('sidebar-pinned');
        if (this.panelBackdrop) this.panelBackdrop.classList.add('visible');
        if (persist) localStorage.setItem(STORAGE_KEYS.SIDEBAR_PINNED, 'true');
        this.populateDeviceList();
    }

    unpinSidebar() {
        if (!this.sidePanel) return;
        this.sidePanel.classList.remove('pinned', 'hover-preview');
        document.body.classList.remove('sidebar-pinned');
        if (this.panelBackdrop) this.panelBackdrop.classList.remove('visible');
        localStorage.setItem(STORAGE_KEYS.SIDEBAR_PINNED, 'false');
    }

    /**
     * Populate the input device dropdown with available audio devices.
     * @private
     */
    async populateDeviceList() {
        if (!this.inputDeviceSelect) return;
        const devices = await PermissionManager.getAvailableDevices();
        const savedDevice = localStorage.getItem(STORAGE_KEYS.INPUT_DEVICE) || '';

        // Keep System Default option, clear the rest
        const defaultOption = this.inputDeviceSelect.querySelector('option[value=""]');
        this.inputDeviceSelect.innerHTML = '';
        if (defaultOption) {
            this.inputDeviceSelect.appendChild(defaultOption);
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'System Default';
            this.inputDeviceSelect.appendChild(opt);
        }

        for (const device of devices) {
            // Skip the "default" pseudo-device if present
            if (device.deviceId === 'default') continue;
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = device.label;
            this.inputDeviceSelect.appendChild(opt);
        }

        this.inputDeviceSelect.value = savedDevice;
    }
    
    /**
     * Updates visibility of model-specific settings sections based on selected model.
     * 
     * @method updateSettingsVisibility
     * @returns {void}
     */
    updateSettingsVisibility() {
        const currentModel = this.getCurrentModelFromSettings();
        const isMai = currentModel === MODEL_TYPES.MAI_TRANSCRIBE;
        if (this.whisperSettings) {
            this.whisperSettings.style.display = isMai ? 'none' : 'block';
        }
        if (this.maiTranscribeSettings) {
            this.maiTranscribeSettings.style.display = isMai ? 'block' : 'none';
        }
    }
    
    /**
     * Opens the settings modal, loads current settings into form, and emits open event.
     * 
     * @method openSettingsModal
     * @fires APP_EVENTS.UI_SETTINGS_OPENED
     * @returns {void}
     */
    openSettingsModal() {
        this.loadSettingsToForm();
        this.updateSettingsVisibility();
        this.settingsModal.style.display = 'block';

        eventBus.emit(APP_EVENTS.UI_SETTINGS_OPENED);
    }
    
    /**
     * Closes the settings modal without saving and emits closed event.
     * 
     * @method closeSettingsModal
     * @fires APP_EVENTS.UI_SETTINGS_CLOSED
     * @returns {void}
     */
    closeSettingsModal() {
        this.settingsModal.style.display = 'none';
        
        eventBus.emit(APP_EVENTS.UI_SETTINGS_CLOSED);
    }
    
    /**
     * Loads current settings from localStorage into the form fields.
     * Updates form inputs to reflect the currently saved configuration.
     * 
     * @private
     * @method loadSettingsToForm
     */
    loadSettingsToForm() {
        const whisperUri = localStorage.getItem(STORAGE_KEYS.WHISPER_URI);
        const whisperKey = localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY);

        // Sync modal selector with main UI selector (user's current choice)
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = this.getCurrentModel();
        }

        if (this.whisperUriInput && whisperUri) {
            this.whisperUriInput.value = whisperUri;
        }
        if (this.whisperKeyInput && whisperKey) {
            this.whisperKeyInput.value = whisperKey;
        }

        const maiUri = localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI);
        const maiKey = localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY);
        if (this.maiTranscribeUriInput && maiUri) {
            this.maiTranscribeUriInput.value = maiUri;
        }
        if (this.maiTranscribeKeyInput && maiKey) {
            this.maiTranscribeKeyInput.value = maiKey;
        }

        const savedEnv = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT) || RECORDING_ENVIRONMENTS.QUIET;
        if (this.recordingEnvironmentSelect) {
            this.recordingEnvironmentSelect.value = savedEnv;
        }
    }

    /**
     * Resolves the active API key and URI input elements based on selected model.
      * Uses model-specific cached DOM references for Whisper or MAI-Transcribe.
     *
     * @private
     * @returns {{ apiKeyInput: HTMLElement|null, uriInput: HTMLElement|null }}
     */
    _getActiveInputs() {
        const isMai = this.getCurrentModelFromSettings() === MODEL_TYPES.MAI_TRANSCRIBE;
        return {
            apiKeyInput: isMai ? this.maiTranscribeKeyInput : this.whisperKeyInput,
            uriInput: isMai ? this.maiTranscribeUriInput : this.whisperUriInput
        };
    }

    sanitizeInputs() {
        const { apiKeyInput, uriInput } = this._getActiveInputs();

        if (apiKeyInput && typeof apiKeyInput.value === 'string') {
            // Remove all whitespace characters (spaces, tabs, newlines, etc.)
            apiKeyInput.value = apiKeyInput.value.replace(/\s+/g, '');
        }

        if (uriInput && typeof uriInput.value === 'string') {
            uriInput.value = uriInput.value.replace(/\s+/g, '');
        }
    }

    /**
     * Validate the current configuration fields.
     * Ensures an API key is present and formatted correctly and that
     * the URI is a valid HTTPS URL.
     * Emits SETTINGS_VALIDATION_ERROR with details when invalid.
     *
     * @method validateConfiguration
     * @returns {boolean} True if configuration is valid
     */
    validateConfiguration() {
        const errors = this.getValidationErrors();
        if (errors.length > 0) {
            eventBus.emit(APP_EVENTS.SETTINGS_VALIDATION_ERROR, { errors });
            return false;
        }
        return true;
    }

    /**
     * Retrieve human readable validation errors for the current
     * configuration without emitting any events.
     *
     * @method getValidationErrors
     * @returns {string[]} Array of error messages
     */
    getValidationErrors() {
        this.sanitizeInputs();
        const { apiKeyInput, uriInput } = this._getActiveInputs();

        const errors = [];

    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const isMai = this.getCurrentModelFromSettings() === MODEL_TYPES.MAI_TRANSCRIBE;
        if (!apiKey) {
            errors.push(MESSAGES.API_KEY_REQUIRED);
        } else if (!isMai && !/^[A-F0-9]{32}$/i.test(apiKey)) {
            // Whisper keys are 32-char hex; Speech keys are longer alphanumeric
            errors.push('Invalid API key format');
        }

    const uri = uriInput ? uriInput.value.trim() : '';
        if (!uri) {
            errors.push(MESSAGES.URI_REQUIRED);
        } else {
            try {
                const url = new URL(uri);
                if (url.protocol !== 'https:') {
                    errors.push('URI must use HTTPS');
                }
            } catch {
                errors.push(MESSAGES.INVALID_URI_FORMAT);
            }
        }

        return errors;
    }
    
    /**
     * Saves current settings from form to localStorage, validates, and emits relevant events.
     * 
     * @method saveSettings
     * @fires APP_EVENTS.SETTINGS_SAVED
     * @fires APP_EVENTS.SETTINGS_VALIDATION_ERROR
     * @returns {void}
     */
    saveSettings() {
        const currentModel = this.getCurrentModelFromSettings();

        const errors = this.getValidationErrors();
        if (errors.length > 0) {
            eventBus.emit(APP_EVENTS.SETTINGS_VALIDATION_ERROR, { errors });
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: errors[0] || MESSAGES.FILL_REQUIRED_FIELDS,
                type: 'error',
                temporary: true
            });
            return;
        }

        const isMai = currentModel === MODEL_TYPES.MAI_TRANSCRIBE;
        const { apiKeyInput: keyInput, uriInput } = this._getActiveInputs();
        const targetUri = uriInput ? uriInput.value.trim() : '';
        const apiKey = keyInput ? keyInput.value.trim() : '';

        const previousModel = localStorage.getItem(STORAGE_KEYS.MODEL) || MODEL_TYPES.WHISPER;
        localStorage.setItem(STORAGE_KEYS.MODEL, currentModel);
        if (isMai) {
            localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, targetUri);
            localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY, apiKey);
        } else {
            localStorage.setItem(STORAGE_KEYS.WHISPER_URI, targetUri);
            localStorage.setItem(STORAGE_KEYS.WHISPER_API_KEY, apiKey);
        }
        
        if (this.recordingEnvironmentSelect) {
            localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, this.recordingEnvironmentSelect.value);
        }

        this.closeSettingsModal();

        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.SETTINGS_SAVED,
            type: 'success',
            temporary: true,
            duration: 3000
        });
        
        // Emit model changed event only when explicitly saved
        if (currentModel !== previousModel) {
            eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                model: currentModel,
                previousModel: previousModel
            });
        }
        
        // Emit settings saved event
        eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
            model: currentModel,
            hasUri: !!targetUri,
            hasApiKey: !!apiKey
        });

        // Emit SETTINGS_LOADED to mirror initial load behavior
        eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
            model: currentModel,
            hasUri: !!targetUri,
            hasApiKey: !!apiKey
        });

        eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
    }
    
    /**
     * Gets the currently selected transcription model.
     * 
     * @method getCurrentModel
     * @returns {string} Current model identifier
     */
    getCurrentModel() {
        return this.modelSelect.value;
    }

    /**
     * Gets the currently selected transcription model from the settings modal.
     * Falls back to main interface model selector if settings modal selector is not available.
     * 
     * @method getCurrentModelFromSettings
     * @returns {string} Current model identifier
     */
    getCurrentModelFromSettings() {
        if (this.settingsModelSelect) {
            return this.settingsModelSelect.value;
        }
        return this.getCurrentModel();
    }
    
    /**
     * Gets the complete API configuration for the selected model.
     * 
     * @method getModelConfig
     * @returns {{model: string, apiKey: string, uri: string}} Model configuration object
     */
    getModelConfig() {
        const model = this.getCurrentModel();
        const isMai = model === MODEL_TYPES.MAI_TRANSCRIBE;
        return {
            model,
            apiKey: localStorage.getItem(isMai ? STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY : STORAGE_KEYS.WHISPER_API_KEY),
            uri: localStorage.getItem(isMai ? STORAGE_KEYS.MAI_TRANSCRIBE_URI : STORAGE_KEYS.WHISPER_URI)
        };
    }
    
    checkInitialSettings() {
        const config = this.getModelConfig();

        if (!config.apiKey || !config.uri) {
            this._initTimerId = setTimeout(() => {
                this._initTimerId = null;
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.CONFIGURE_AZURE,
                    type: 'info'
                });
                this.openSettingsModal();
            }, 500);
        } else {
            // Settings are complete - emit SETTINGS_LOADED event to notify UI
            eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
                model: config.model,
                hasUri: !!config.uri,
                hasApiKey: !!config.apiKey
            });
        }
    }

    /**
     * Cancels pending timers to prevent leaks.
     * Call when the Settings instance is no longer needed.
     *
     * @method destroy
     */
    destroy() {
        if (this._initTimerId) {
            clearTimeout(this._initTimerId);
            this._initTimerId = null;
        }
        if (this._panelEscHandler && document.removeEventListener) {
            document.removeEventListener('keydown', this._panelEscHandler);
        }
        if (this._offPermissionGranted) {
            this._offPermissionGranted();
            this._offPermissionGranted = null;
        }
        if (this._hoverCloseTimer) {
            clearTimeout(this._hoverCloseTimer);
            this._hoverCloseTimer = null;
        }
    }
}
