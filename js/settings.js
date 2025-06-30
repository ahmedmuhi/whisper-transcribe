import { showTemporaryStatus } from './status-helper.js';
import { STORAGE_KEYS, MESSAGES, ID } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

export class Settings {
    constructor() {
        this.modelSelect = document.getElementById(ID.MODEL_SELECT);
        this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
        this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
        this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
        this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);

        // Cache the status element with the other DOM references
        this.statusElement = document.getElementById(ID.STATUS);
        
        this.init();
    }
    
    init() {
        this.loadSavedModel();
        this.setupEventListeners();
        this.updateSettingsVisibility();
        this.checkInitialSettings();
    }
    
    loadSavedModel() {
        const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'whisper';
        this.modelSelect.value = savedModel;
    }
    
    setupEventListeners() {
        // Model change listener
        this.modelSelect.addEventListener('change', (e) => {
            const newModel = e.target.value;
            const oldModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'whisper';
            
            localStorage.setItem(STORAGE_KEYS.MODEL, newModel);
            console.log('Model changed to:', newModel);
            this.updateSettingsVisibility();
            
            // Emit model changed event
            eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                model: newModel,
                previousModel: oldModel
            });
        });
        
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
    
    updateSettingsVisibility() {
        const currentModel = this.getCurrentModel();
        const whisperSettings = document.getElementById(ID.WHISPER_SETTINGS);
        const gpt4oSettings = document.getElementById(ID.GPT4O_SETTINGS);
        
        if (currentModel === 'whisper') {
            whisperSettings.style.display = 'block';
            gpt4oSettings.style.display = 'none';
        } else {
            whisperSettings.style.display = 'none';
            gpt4oSettings.style.display = 'block';
        }
    }
    
    openSettingsModal() {
        this.updateSettingsVisibility();
        this.loadSettingsToForm();
        this.settingsModal.style.display = 'block';
        
        eventBus.emit(APP_EVENTS.UI_SETTINGS_OPENED);
    }
    
    closeSettingsModal() {
        this.settingsModal.style.display = 'none';
        
        eventBus.emit(APP_EVENTS.UI_SETTINGS_CLOSED);
    }
    
    loadSettingsToForm() {
        // Load saved settings into form fields
        const whisperUri = localStorage.getItem(STORAGE_KEYS.WHISPER_URI);
        const whisperKey = localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY);
        const gpt4oUri = localStorage.getItem(STORAGE_KEYS.GPT4O_URI);
        const gpt4oKey = localStorage.getItem(STORAGE_KEYS.GPT4O_API_KEY);
        
        if (whisperUri) document.getElementById(ID.WHISPER_URI).value = whisperUri;
        if (whisperKey) document.getElementById(ID.WHISPER_KEY).value = whisperKey;
        if (gpt4oUri) document.getElementById(ID.GPT4O_URI).value = gpt4oUri;
        if (gpt4oKey) document.getElementById(ID.GPT4O_KEY).value = gpt4oKey;
    }
    
    saveSettings() {
        const currentModel = this.getCurrentModel();
        
        let targetUri, apiKey;
        if (currentModel === 'whisper') {
            targetUri = document.getElementById(ID.WHISPER_URI).value.trim();
            apiKey = document.getElementById(ID.WHISPER_KEY).value.trim();
        } else {
            targetUri = document.getElementById(ID.GPT4O_URI).value.trim();
            apiKey = document.getElementById(ID.GPT4O_KEY).value.trim();
        }
        
        if (!apiKey || !targetUri) {
            eventBus.emit(APP_EVENTS.SETTINGS_VALIDATION_ERROR, {
                message: MESSAGES.FILL_REQUIRED_FIELDS
            });
            
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.FILL_REQUIRED_FIELDS,
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
            temporary: true
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
    
    getCurrentModel() {
        return this.modelSelect.value;
    }
    
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
        }
    }
}
