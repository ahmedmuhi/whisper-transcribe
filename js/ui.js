import { STORAGE_KEYS, COLORS, DEFAULT_RESET_STATUS } from './constants.js';
import { showTemporaryStatus } from './status-helper.js';

export class UI {
    static browserSupportsRecording() {
        return !!(window.MediaRecorder &&
                   navigator.mediaDevices &&
                   navigator.mediaDevices.getUserMedia);
    }

    constructor() {
        // Get all DOM elements
        this.micButton = document.getElementById('mic-button');
        this.statusElement = document.getElementById('status');
        this.transcriptElement = document.getElementById('transcript');
        this.grabTextButton = document.getElementById('grab-text-button');
        this.settingsButton = document.getElementById('settings-button');
        this.themeToggle = document.getElementById('theme-toggle');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeModalButton = document.getElementById('close-modal');
        this.saveSettingsButton = document.getElementById('save-settings');
        this.pauseButton = document.getElementById('pause-button');
        this.cancelButton = document.getElementById('cancel-button');
        this.timerElement = document.getElementById('timer');
        this.spinnerContainer = document.getElementById('spinner-container');
        this.visualizer = document.getElementById('visualizer');
        
        // Icons
        this.pauseIcon = document.getElementById('pause-icon');
        this.playIcon = document.getElementById('play-icon');
        this.moonIcon = document.getElementById('moon-icon');
        this.sunIcon = document.getElementById('sun-icon');
    }
    
    init(settings, audioHandler) {
        this.settings = settings;
        this.audioHandler = audioHandler;
        
        // Load theme
        this.loadTheme();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check all recording prerequisites (browser support, API config, etc.)
        this.checkRecordingPrerequisites();
    }
    
    loadTheme() {
        const themeMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'auto';
        const themeSelect = document.getElementById('theme-mode');
        if (themeSelect) themeSelect.value = themeMode;
        
        this.applyTheme();
        
        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (localStorage.getItem(STORAGE_KEYS.THEME_MODE) === 'auto') {
                    this.applyTheme();
                }
            });
        }
    }

    applyTheme() {
        const themeMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'auto';
        let isDark = false;
        
        if (themeMode === 'dark') {
            isDark = true;
        } else if (themeMode === 'light') {
            isDark = false;
        } else { // auto
            isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        
        if (isDark) {
            document.body.classList.add('dark-theme');
            if (this.moonIcon) this.moonIcon.style.display = 'none';
            if (this.sunIcon) this.sunIcon.style.display = 'block';
        } else {
            document.body.classList.remove('dark-theme');
            if (this.moonIcon) this.moonIcon.style.display = 'block';
            if (this.sunIcon) this.sunIcon.style.display = 'none';
        }
        
        // Update canvas background if needed
        if (this.visualizer) {
            const canvasCtx = this.visualizer.getContext('2d');
            if (canvasCtx) {
                canvasCtx.fillStyle = isDark ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
                canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);
            }
        }
    }
    
    checkBrowserSupport() {
        if (!UI.browserSupportsRecording()) {
            this.setStatus('Your browser does not support audio recording.');
            this.disableMicButton();
            return false;
        }
        return true;
    }

    // Comprehensive method to check all recording prerequisites
    checkRecordingPrerequisites() {
        // Check browser support first
        if (!this.checkBrowserSupport()) {
            return false;
        }
        
        // Check if API is configured
        const config = this.settings.getModelConfig();
        if (!config.apiKey || !config.uri) {
            this.setStatus('⚙️ Please configure API settings first');
            this.disableMicButton();
            return false;
        }
        
        // All prerequisites met - enable the button and set ready status
        this.enableMicButton();
        this.setStatus(DEFAULT_RESET_STATUS);
        return true;
    }

    // Method to handle permission-related errors
    handlePermissionError(error) {
        console.error('Permission error:', error);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            this.setStatus('🚫 Microphone permission denied. Please allow microphone access.');
            this.disableMicButton();
        } else if (error.name === 'NotFoundError') {
            this.setStatus('🎤 No microphone found. Please connect a microphone.');
            this.disableMicButton();
        } else {
            this.setStatus('❌ Error accessing microphone: ' + error.message);
            this.disableMicButton();
        }
    }

    // Method to re-enable microphone after fixing issues
    enableMicrophoneAfterFix() {
        if (this.checkRecordingPrerequisites()) {
            console.log('Microphone re-enabled after fixing prerequisites');
        }
    }
    
    setupEventListeners() {
        // Theme toggle
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => {
                const currentMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'auto';
                let newMode;
                
                if (currentMode === 'auto') {
                    newMode = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
                } else if (currentMode === 'light') {
                    newMode = 'dark';
                } else {
                    newMode = 'light';
                }
                
                localStorage.setItem(STORAGE_KEYS.THEME_MODE, newMode);
                const themeSelect = document.getElementById('theme-mode');
                if (themeSelect) themeSelect.value = newMode;
                this.applyTheme();
            });
        }
        
        // Theme mode selector
        const themeSelect = document.getElementById('theme-mode');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                localStorage.setItem(STORAGE_KEYS.THEME_MODE, e.target.value);
                this.applyTheme();
            });
        }
        
        // Transcript buttons
        if (this.grabTextButton) {
            this.grabTextButton.addEventListener('click', () => {
                const text = this.transcriptElement.value;
                if (text) {
                    navigator.clipboard.writeText(text)
                        .then(() => {
                            this.transcriptElement.value = '';
                            showTemporaryStatus(this.statusElement, 'Text cut to clipboard', 'success');
                        })
                        .catch(() => showTemporaryStatus(this.statusElement, 'Failed to cut text', 'error'));
                } else {
                    showTemporaryStatus(this.statusElement, 'No text to cut', 'error');
                }
            });
        }
        
        // Recording control buttons - these are now handled in main.js
        // this.pauseButton.addEventListener('click', () => {
        //     if (this.recorder) {
        //         this.recorder.togglePause();
        //     }
        // });
        
        // this.cancelButton.addEventListener('click', () => {
        //     if (this.recorder) {
        //         this.recorder.cancelRecording();
        //     }
        // });
        
        // Main recording button - this is now handled in main.js
        // this.micButton.addEventListener('click', async () => {
        //     if (this.recorder) {
        //         await this.recorder.toggleRecording();
        //     }
        // });

        // Listen for settings updates to re-check prerequisites
        document.addEventListener('settingsUpdated', () => {
            this.checkRecordingPrerequisites();
        });
    }
    
    setStatus(message) {
        this.statusElement.textContent = message;
        this.statusElement.style.color = '';
    }
    
    setStatusHTML(html) {
        this.statusElement.innerHTML = html;
    }
    
    
    displayTranscription(text) {
        if (this.transcriptElement.value) {
            this.transcriptElement.value += '\n\n' + (text || 'No transcription returned');
        } else {
            this.transcriptElement.value = text || 'No transcription returned';
        }
        
        this.transcriptElement.focus();
        this.transcriptElement.selectionStart = this.transcriptElement.value.length;
        this.transcriptElement.selectionEnd = this.transcriptElement.value.length;
        
        // Auto-scroll to bottom so newest text is always visible
        this.transcriptElement.scrollTop = this.transcriptElement.scrollHeight;
    }
    
    updateTimer(timeString) {
        this.timerElement.textContent = timeString;
    }
    
    showSpinner() {
        this.spinnerContainer.style.display = 'block';
    }
    
    hideSpinner() {
        this.spinnerContainer.style.display = 'none';
    }
    
    setRecordingState(isRecording) {
        if (isRecording) {
            this.micButton.classList.add('recording');
            this.setStatus('Recording... Click again to stop');
        } else {
            this.micButton.classList.remove('recording');
        }
    }
    
    setPauseState(isPaused) {
        if (isPaused) {
            this.pauseIcon.style.display = 'none';
            this.playIcon.style.display = 'block';
            this.pauseButton.setAttribute('aria-label', 'Resume');
            this.setStatus('Recording paused');
        } else {
            this.pauseIcon.style.display = 'block';
            this.playIcon.style.display = 'none';
            this.pauseButton.setAttribute('aria-label', 'Pause');
        }
    }
    
    resetControlsAfterRecording() {
        this.updateTimer('00:00');
        this.setRecordingState(false);
        this.setPauseState(false);
    }
    
    enableMicButton() {
        this.micButton.disabled = false;
        this.micButton.style.opacity = 1;
        this.micButton.style.cursor = 'pointer';
    }
    
    disableMicButton() {
        this.micButton.disabled = true;
        this.micButton.style.opacity = 0.5;
        this.micButton.style.cursor = 'not-allowed';
    }
    
    // Settings-related UI methods (we'll move these to settings module later)
    openSettingsModal() {
        if (this.settings) {
            this.settings.openSettingsModal();
        }
    }
    
    // Visualization helper (for canvas clearing)
    clearVisualization() {
        if (this.visualizer) {
            const canvasCtx = this.visualizer.getContext('2d');
            const isDarkTheme = document.body.classList.contains('dark-theme');
            canvasCtx.fillStyle = isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
            canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);
        }
    }
}
