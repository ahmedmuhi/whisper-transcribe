import { STORAGE_KEYS, COLORS, DEFAULT_RESET_STATUS, MESSAGES } from './constants.js';
import { showTemporaryStatus } from './status-helper.js';
import { PermissionManager } from './permission-manager.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

export class UI {
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
        this.setupEventBusListeners();
        
        // Check all recording prerequisites (browser support, API config, etc.)
        this.checkRecordingPrerequisites();
        
        // Emit app initialized event
        eventBus.emit(APP_EVENTS.APP_INITIALIZED);
    }
    
    setupEventBusListeners() {
        // Listen for status updates
        eventBus.on(APP_EVENTS.UI_STATUS_UPDATE, (data) => {
            if (data.temporary) {
                showTemporaryStatus(
                    this.statusElement, 
                    data.message, 
                    data.type || 'info',
                    data.duration || 3000,
                    data.resetMessage || DEFAULT_RESET_STATUS
                );
            } else {
                this.setStatus(data.message);
            }
        });
        
        // Listen for recording state changes
        eventBus.on(APP_EVENTS.RECORDING_STATE_CHANGED, (data) => {
            const { newState, oldState } = data;
            console.log(`UI: Recording state changed from ${oldState} to ${newState}`);
            
            // Update UI based on state
            switch (newState) {
                case 'idle':
                    this.resetControlsAfterRecording();
                    this.enableMicButton();
                    this.hideSpinner();
                    break;
                case 'initializing':
                    this.disableMicButton();
                    break;
                case 'recording':
                    this.setRecordingState(true);
                    this.setPauseState(false);
                    this.enableMicButton();
                    break;
                case 'paused':
                    this.setPauseState(true);
                    break;
                case 'stopping':
                    // Keep button enabled during stopping state
                    // Just show visual feedback that we're stopping
                    if (this.micButton.classList) {
                        this.micButton.classList.remove('recording');
                    }
                    break;
                case 'processing':
                    this.showSpinner();
                    this.disableMicButton();
                    break;
                case 'cancelling':
                    this.disableMicButton();
                    break;
                case 'error':
                    this.enableMicButton();
                    this.hideSpinner();
                    break;
            }
        });
        
        // Listen for transcription ready
        eventBus.on(APP_EVENTS.UI_TRANSCRIPTION_READY, (data) => {
            this.displayTranscription(data.text);
            this.hideSpinner();
        });
        
        // Listen for API events
        eventBus.on(APP_EVENTS.API_REQUEST_ERROR, (data) => {
            this.hideSpinner();
        });
        
        // Listen for permission events
        eventBus.on(APP_EVENTS.PERMISSION_GRANTED, () => {
            this.checkRecordingPrerequisites();
        });
        
        eventBus.on(APP_EVENTS.PERMISSION_DENIED, () => {
            this.disableMicButton();
        });
        
        // Listen for settings events
        eventBus.on(APP_EVENTS.SETTINGS_UPDATED, () => {
            this.checkRecordingPrerequisites();
        });
        
        eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, (data) => {
            console.log('Model changed to:', data.model);
        });
        
        // Listen for theme changes
        eventBus.on(APP_EVENTS.UI_THEME_CHANGED, (data) => {
            this.applyTheme();
        });
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
        if (!PermissionManager.checkBrowserSupport()) {
            this.setStatus(MESSAGES.BROWSER_NOT_SUPPORTED);
            this.disableMicButton();
            return false;
        }
        return true;
    }

    // Comprehensive method to check all recording prerequisites
    checkRecordingPrerequisites() {
        // Check browser support first
        if (!this.checkBrowserSupport()) {
            eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'browser' });
            return false;
        }
        
        // Check if API is configured
        const config = this.settings.getModelConfig();
        if (!config.apiKey || !config.uri) {
            this.setStatus(MESSAGES.API_NOT_CONFIGURED);
            this.disableMicButton();
            eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'config' });
            return false;
        }
        
        // All prerequisites met - enable the button and set ready status
        this.enableMicButton();
        this.setStatus(DEFAULT_RESET_STATUS);
        eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: true });
        eventBus.emit(APP_EVENTS.APP_READY);
        return true;
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
                
                // Emit theme changed event
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, { mode: newMode });
            });
        }
        
        // Theme mode selector
        const themeSelect = document.getElementById('theme-mode');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                localStorage.setItem(STORAGE_KEYS.THEME_MODE, e.target.value);
                this.applyTheme();
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, { mode: e.target.value });
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
                            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                                message: MESSAGES.TEXT_CUT_SUCCESS,
                                type: 'success',
                                temporary: true
                            });
                        })
                        .catch(() => {
                            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                                message: MESSAGES.TEXT_CUT_FAILED,
                                type: 'error',
                                temporary: true
                            });
                        });
                } else {
                    eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                        message: MESSAGES.NO_TEXT_TO_CUT,
                        type: 'error',
                        temporary: true
                    });
                }
            });
        }
        
        // Remove the old settings event listener since we're using eventBus now
        // document.addEventListener('settingsUpdated', () => {
        //     this.checkRecordingPrerequisites();
        // });
    }
    
    setStatus(message) {
        if (this.statusElement._statusTimeout) {
            clearTimeout(this.statusElement._statusTimeout);
            this.statusElement._statusTimeout = null;
        }

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
