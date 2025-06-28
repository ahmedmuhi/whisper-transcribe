export class Settings {
    constructor() {
        this.modelSelect = document.getElementById('model-select');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeModalButton = document.getElementById('close-modal');
        this.saveSettingsButton = document.getElementById('save-settings');
        this.settingsButton = document.getElementById('settings-button');
        
        this.init();
    }
    
    init() {
        this.loadSavedModel();
        this.setupEventListeners();
        this.updateSettingsVisibility();
        this.checkInitialSettings();
    }
    
    loadSavedModel() {
        const savedModel = localStorage.getItem('transcription_model') || 'whisper';
        this.modelSelect.value = savedModel;
    }
    
    setupEventListeners() {
        // Model change listener
        this.modelSelect.addEventListener('change', (e) => {
            localStorage.setItem('transcription_model', e.target.value);
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
        const whisperUri = localStorage.getItem('whisper_uri');
        const whisperKey = localStorage.getItem('whisper_api_key');
        const gpt4oUri = localStorage.getItem('gpt4o_uri');
        const gpt4oKey = localStorage.getItem('gpt4o_api_key');
        
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
            this.showTemporaryStatus('Please fill in all required fields', 'error');
            return;
        }
        
        // Save model-specific settings
        if (currentModel === 'whisper') {
            localStorage.setItem('whisper_uri', targetUri);
            localStorage.setItem('whisper_api_key', apiKey);
        } else {
            localStorage.setItem('gpt4o_uri', targetUri);
            localStorage.setItem('gpt4o_api_key', apiKey);
        }
        
        this.closeSettingsModal();
        this.showTemporaryStatus('Settings saved', 'success');
        
        // Notify that settings have been updated
        document.dispatchEvent(new CustomEvent('settingsUpdated'));
    }
    
    getCurrentModel() {
        return this.modelSelect.value;
    }
    
    getModelConfig() {
        const model = this.getCurrentModel();
        const apiKey = model === 'whisper' ? 
            localStorage.getItem('whisper_api_key') : 
            localStorage.getItem('gpt4o_api_key');
        const uri = model === 'whisper' ? 
            localStorage.getItem('whisper_uri') : 
            localStorage.getItem('gpt4o_uri');
            
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
                this.showTemporaryStatus('Please configure Azure OpenAI settings', 'info', false);
                this.openSettingsModal();
            }, 500);
        }
    }
    
    showTemporaryStatus(message, type = 'info', autoReset = true) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        
        if (type === 'error') {
            statusElement.style.color = '#dc2626';
        } else if (type === 'success') {
            statusElement.style.color = '#16a34a';
        } else {
            statusElement.style.color = '';
        }
        
        if (autoReset) {
            setTimeout(() => {
                statusElement.textContent = '🎙️ Click the microphone to start recording';
                statusElement.style.color = '';
            }, 3000);
        }
    }
}
