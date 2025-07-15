/**
 * @fileoverview Settings management for API configuration and user preferences.
 */

import { STORAGE_KEYS, MESSAGES, ID } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * Settings manager for API configuration and user preferences.
 * Handles model selection, API credentials, validation, and persistence to localStorage.
 * Provides configuration for both Azure Whisper and GPT-4o transcription models.
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
    this.gpt4oSettings = document.getElementById(ID.GPT4O_SETTINGS);
    this.whisperUriInput = document.getElementById(ID.WHISPER_URI);
    this.whisperKeyInput = document.getElementById(ID.WHISPER_KEY);
    this.gpt4oUriInput = document.getElementById(ID.GPT4O_URI);
    this.gpt4oKeyInput = document.getElementById(ID.GPT4O_KEY);
        
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
        this.setupEventListeners();
        this.updateSettingsVisibility();
        this.checkInitialSettings();
    }
    
    /**
     * Loads the previously saved transcription model from localStorage.
     * Defaults to 'whisper' if no model has been saved.
     * 
     * @private
     * @method loadSavedModel
     */
    loadSavedModel() {
        const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'whisper';
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
            const oldModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'whisper';
            
            localStorage.setItem(STORAGE_KEYS.MODEL, newModel);
            const settingsLogger = logger.child('Settings');
            settingsLogger.info('Model changed to:', newModel);
            
            // Sync settings modal selector
            if (this.settingsModelSelect) {
                this.settingsModelSelect.value = newModel;
            }
            this.updateSettingsVisibility();
            
            // Emit model changed event
            eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                model: newModel,
                previousModel: oldModel
            });
        });

        // Settings modal model change listener
        if (this.settingsModelSelect) {
            this.settingsModelSelect.addEventListener('change', (e) => {
                const newModel = e.target.value;
                const oldModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'whisper';
                
                localStorage.setItem(STORAGE_KEYS.MODEL, newModel);
                const settingsLogger = logger.child('Settings');
                settingsLogger.info('Settings modal model changed to:', newModel);
                
                // Sync main interface selector
                if (this.modelSelect) {
                    this.modelSelect.value = newModel;
                }
                this.updateSettingsVisibility();
                
                // Emit model changed event
                eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                    model: newModel,
                    previousModel: oldModel
                });
            });
        }
        
        // Settings button listener
        this.settingsButton.addEventListener('click', () => {
            this.openSettingsModal();
        });
        
        // Close modal listeners
        this.closeModalButton.addEventListener('click', () => {
            this.closeSettingsModal();
        });
        
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.closeSettingsModal();
            }
        });
        
        // Save settings listener
        this.saveSettingsButton.addEventListener('click', () => {
            this.saveSettings();
        });
    }
    
    /**
     * Updates visibility of model-specific settings sections based on selected model.
     * 
     * @method updateSettingsVisibility
     * @returns {void}
     */
    updateSettingsVisibility() {
        const currentModel = this.getCurrentModelFromSettings();
        if (this.whisperSettings) {
            this.whisperSettings.style.display = currentModel === 'whisper' ? 'block' : 'none';
        }
        if (this.gpt4oSettings) {
            this.gpt4oSettings.style.display = currentModel === 'whisper' ? 'none' : 'block';
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
        this.updateSettingsVisibility();
        this.loadSettingsToForm();
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
        // Load saved settings into form fields
        const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'whisper';
        const whisperUri = localStorage.getItem(STORAGE_KEYS.WHISPER_URI);
        const whisperKey = localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY);
        const gpt4oUri = localStorage.getItem(STORAGE_KEYS.GPT4O_URI);
        const gpt4oKey = localStorage.getItem(STORAGE_KEYS.GPT4O_API_KEY);
        
        // Sync settings modal model selector with saved model
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = savedModel;
        }
        
        if (this.whisperUriInput && whisperUri) {
            this.whisperUriInput.value = whisperUri;
        }
        if (this.whisperKeyInput && whisperKey) {
            this.whisperKeyInput.value = whisperKey;
        }
        if (this.gpt4oUriInput && gpt4oUri) {
            this.gpt4oUriInput.value = gpt4oUri;
        }
        if (this.gpt4oKeyInput && gpt4oKey) {
            this.gpt4oKeyInput.value = gpt4oKey;
        }
    }

    /**
     * Trim whitespace and normalize user provided settings inputs.
     * Removes newlines and tabs from the API key and URI while preserving
     * the complete URI path and query parameters required for Azure OpenAI endpoints.
     *
     * @method sanitizeInputs
     * @param {string} [model] - Optional model to use, defaults to current model from main interface
     */
    sanitizeInputs(model = null) {
        const currentModel = model || this.getCurrentModel();

        // Use injected inputs if defined, else use cached inputs; allow null to pass through
        const apiKeyInput = typeof this.apiKeyInput !== 'undefined'
            ? this.apiKeyInput
            : (currentModel === 'whisper' ? this.whisperKeyInput : this.gpt4oKeyInput);
        const uriInput = typeof this.apiUriInput !== 'undefined'
            ? this.apiUriInput
            : (currentModel === 'whisper' ? this.whisperUriInput : this.gpt4oUriInput);

        if (apiKeyInput && typeof apiKeyInput.value === 'string') {
            // Remove all whitespace characters (spaces, tabs, newlines, etc.)
            apiKeyInput.value = apiKeyInput.value.replace(/\s+/g, '');
        }

        if (uriInput && typeof uriInput.value === 'string') {
            // Remove all whitespace characters but preserve the complete URI
            let uri = uriInput.value.replace(/\s+/g, '');
            try {
                // Validate URI format but preserve complete URL including path and query parameters
                new URL(uri);
                // URI is valid, keep it as-is (don't truncate to origin)
            } catch {
                // Leave as whitespace-stripped string if parsing fails
            }
            uriInput.value = uri;
        }
    }

    /**
     * Validate the current configuration fields.
     * Ensures an API key is present and formatted correctly and that
     * the URI is a valid HTTPS URL.
     * Emits SETTINGS_VALIDATION_ERROR with details when invalid.
     *
     * @method validateConfiguration
     * @param {string} [model] - Optional model to use, defaults to current model from main interface
     * @returns {boolean} True if configuration is valid
     */
    validateConfiguration(model = null) {
        const currentModel = model || this.getCurrentModel();
        this.sanitizeInputs(currentModel);
        const apiKeyInput = typeof this.apiKeyInput !== 'undefined'
            ? this.apiKeyInput
            : (currentModel === 'whisper' ? this.whisperKeyInput : this.gpt4oKeyInput);
        const uriInput = typeof this.apiUriInput !== 'undefined'
            ? this.apiUriInput
            : (currentModel === 'whisper' ? this.whisperUriInput : this.gpt4oUriInput);

        const errors = [];

    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        if (!apiKey) {
            errors.push('API key is required');
        } else if (!/^sk-[A-Za-z0-9]{20,}$/.test(apiKey)) {
            errors.push('Invalid API key format');
        }

    const uri = uriInput ? uriInput.value.trim() : '';
        if (!uri) {
            errors.push('URI is required');
        } else {
            try {
                const url = new URL(uri);
                if (url.protocol !== 'https:') {
                    errors.push('URI must use HTTPS');
                }
            } catch {
                errors.push('Invalid URI format');
            }
        }

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
     * @param {string} [model] - Optional model to use, defaults to current model from main interface
     * @returns {string[]} Array of error messages
     */
    getValidationErrors(model = null) {
        const currentModel = model || this.getCurrentModel();
        this.sanitizeInputs(currentModel);
        const apiKeyInput = typeof this.apiKeyInput !== 'undefined'
            ? this.apiKeyInput
            : (currentModel === 'whisper' ? this.whisperKeyInput : this.gpt4oKeyInput);
        const uriInput = typeof this.apiUriInput !== 'undefined'
            ? this.apiUriInput
            : (currentModel === 'whisper' ? this.whisperUriInput : this.gpt4oUriInput);

        const errors = [];

    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        if (!apiKey) {
            errors.push('API key is required');
        } else if (!/^sk-[A-Za-z0-9]{20,}$/.test(apiKey)) {
            errors.push('Invalid API key format');
        }

    const uri = uriInput ? uriInput.value.trim() : '';
        if (!uri) {
            errors.push('URI is required');
        } else {
            try {
                const url = new URL(uri);
                if (url.protocol !== 'https:') {
                    errors.push('URI must use HTTPS');
                }
            } catch {
                errors.push('Invalid URI format');
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

        this.sanitizeInputs(currentModel);

    const apiKeyInput = currentModel === 'whisper' ? this.whisperKeyInput : this.gpt4oKeyInput;
    const uriInput = currentModel === 'whisper' ? this.whisperUriInput : this.gpt4oUriInput;

    const targetUri = uriInput ? uriInput.value.trim() : '';
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

        if (!this.validateConfiguration(currentModel)) {
            // Display first error to user via status helper
            const [firstError] = this.getValidationErrors(currentModel);
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: firstError || MESSAGES.FILL_REQUIRED_FIELDS,
                type: 'error',
                temporary: true
            });
            return;
        }
        
        // Save model-specific settings
        if (currentModel === 'whisper') {
            localStorage.setItem(STORAGE_KEYS.WHISPER_URI, targetUri);
            localStorage.setItem(STORAGE_KEYS.WHISPER_API_KEY, apiKey);
        } else {
            localStorage.setItem(STORAGE_KEYS.GPT4O_URI, targetUri);
            localStorage.setItem(STORAGE_KEYS.GPT4O_API_KEY, apiKey);
        }
        
        this.closeSettingsModal();
        
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.SETTINGS_SAVED,
            type: 'success',
            temporary: true,
            duration: 3000
        });
        
        // Emit settings saved event
        eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
            model: currentModel,
            hasUri: !!targetUri,
            hasApiKey: !!apiKey
        });
        
        // Also emit settings updated for compatibility
        eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
        
        // Remove old custom event
        // document.dispatchEvent(new CustomEvent('settingsUpdated'));
    }
    
    /**
     * Gets the currently selected transcription model.
     * 
     * @method getCurrentModel
     * @returns {string} Current model identifier ('whisper' or 'gpt-4o-transcribe')
     */
    getCurrentModel() {
        return this.modelSelect.value;
    }

    /**
     * Gets the currently selected transcription model from the settings modal.
     * Falls back to main interface model selector if settings modal selector is not available.
     * 
     * @method getCurrentModelFromSettings
     * @returns {string} Current model identifier ('whisper' or 'gpt-4o-transcribe')
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
        const apiKey = model === 'whisper' ?
            localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY) :
            localStorage.getItem(STORAGE_KEYS.GPT4O_API_KEY);
        const uri = model === 'whisper' ?
            localStorage.getItem(STORAGE_KEYS.WHISPER_URI) :
            localStorage.getItem(STORAGE_KEYS.GPT4O_URI);
            
        return {
            model,
            apiKey,
            uri
        };
    }
    
    checkInitialSettings() {
        const config = this.getModelConfig();
        
        if (!config.apiKey || !config.uri) {
            setTimeout(() => {
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
}
