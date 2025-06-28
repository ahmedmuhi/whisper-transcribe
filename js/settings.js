import { showTemporaryStatus } from './status-helper.js';
import { STORAGE_KEYS } from './constants.js';

export class Settings {
    constructor() {
        this.modelSelect = document.getElementById('model-select');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeModalButton = document.getElementById('close-modal');
        this.saveSettingsButton = document.getElementById('save-settings');
        this.settingsButton = document.getElementById('settings-button');

        // Cache the status element with the other DOM references
        this.statusElement = document.getElementById('status');
        
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
            localStorage.setItem(STORAGE_KEYS.MODEL, e.target.value);
            console.log('Model changed to:', e.target.value);
            this.updateSettingsVisibility();
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
        const whisperSettings = document.getElementById('whisper-settings');
        const gpt4oSettings = document.getElementById('gpt4o-settings');
        
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
    }
    
    closeSettingsModal() {
        this.settingsModal.style.display = 'none';
    }
    
    loadSettingsToForm() {
        // Load saved settings into form fields
        const whisperUri = localStorage.getItem(STORAGE_KEYS.WHISPER_URI);
        const whisperKey = localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY);
        const gpt4oUri = localStorage.getItem(STORAGE_KEYS.GPT4O_URI);
        const gpt4oKey = localStorage.getItem(STORAGE_KEYS.GPT4O_API_KEY);
        
        if (whisperUri) document.getElementById('whisper-uri').value = whisperUri;
        if (whisperKey) document.getElementById('whisper-key').value = whisperKey;
        if (gpt4oUri) document.getElementById('gpt4o-uri').value = gpt4oUri;
        if (gpt4oKey) document.getElementById('gpt4o-key').value = gpt4oKey;
    }
    
    saveSettings() {
        const currentModel = this.getCurrentModel();
        
        let targetUri, apiKey;
        if (currentModel === 'whisper') {
            targetUri = document.getElementById('whisper-uri').value.trim();
            apiKey = document.getElementById('whisper-key').value.trim();
        } else {
            targetUri = document.getElementById('gpt4o-uri').value.trim();
            apiKey = document.getElementById('gpt4o-key').value.trim();
        }
        
        if (!apiKey || !targetUri) {
            showTemporaryStatus(this.statusElement, 'Please fill in all required fields', 'error');
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
        showTemporaryStatus(this.statusElement, 'Settings saved', 'success');
        
        // Notify that settings have been updated
        document.dispatchEvent(new CustomEvent('settingsUpdated'));
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
                showTemporaryStatus(this.statusElement, 'Please configure Azure OpenAI settings', 'info', 0);
                this.openSettingsModal();
            }, 500);
        }
    }
}
