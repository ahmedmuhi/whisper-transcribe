
/**
 * @fileoverview User interface controller for the whisper-transcribe application.
 * Manages DOM interactions, visual states, and user interface updates.
 * 
 * @module UI
 * @requires EventBus
 * @requires PermissionManager
 * @requires StatusHelper
 * @requires Constants
 * @since 1.0.0
 */

import { STORAGE_KEYS, COLORS, DEFAULT_RESET_STATUS, MESSAGES, ID } from './constants.js';
import { showTemporaryStatus } from './status-helper.js';
import { PermissionManager } from './permission-manager.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * User interface controller for managing DOM interactions and visual states.
 * Handles button states, status messages, theme switching, and user interactions.
 * Coordinates between user actions and application logic through event bus.
 * 
 * @class UI
 * @fires APP_EVENTS.UI_STATUS_UPDATE
 * @fires APP_EVENTS.UI_THEME_CHANGED
 * @fires APP_EVENTS.UI_SETTINGS_OPENED
 * @fires APP_EVENTS.UI_SETTINGS_CLOSED
 * 
 * @example
 * const ui = new UI();
 * ui.init(settings, audioHandler);
 * 
 * // Update recording state
 * ui.setRecordingState(true);
 * 
 * // Show status message
 * ui.updateStatus('Recording started', 'success');
 */
export class UI {
    /**
     * Creates a new UI controller instance.
     * Initializes DOM element references and prepares for user interaction handling.
     */
    constructor() {
        // Get all DOM elements
        this.micButton = document.getElementById(ID.MIC_BUTTON);
        this.statusElement = document.getElementById(ID.STATUS);
        this.transcriptElement = document.getElementById(ID.TRANSCRIPT);
        this.grabTextButton = document.getElementById(ID.GRAB_TEXT_BUTTON);
        this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);
        this.themeToggle = document.getElementById(ID.THEME_TOGGLE);
        this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
        this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
        this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
        this.pauseButton = document.getElementById(ID.PAUSE_BUTTON);
        this.cancelButton = document.getElementById(ID.CANCEL_BUTTON);
        this.timerElement = document.getElementById(ID.TIMER);
        this.spinnerContainer = document.getElementById(ID.SPINNER_CONTAINER);
        this.visualizer = document.getElementById(ID.VISUALIZER);
        // Visualization controller instance
        this.visualizationController = null;
        
        // Icons
        this.pauseIcon = document.getElementById(ID.PAUSE_ICON);
        this.playIcon = document.getElementById(ID.PLAY_ICON);
        this.moonIcon = document.getElementById(ID.MOON_ICON);
        this.sunIcon = document.getElementById(ID.SUN_ICON);
    }
    
    /**
     * Initializes the UI controller with required dependencies.
     * Sets up event listeners, loads theme, and performs initial state checks.
     * 
     * @method init
     * @param {Settings} settings - Settings manager instance
     * @param {AudioHandler} audioHandler - Audio handler instance
     * @fires APP_EVENTS.APP_INITIALIZED
     */
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
    
    /**
     * Sets up event bus listeners for UI updates and state synchronization.
     * Listens for status updates, recording state changes, transcription results, settings changes,
     * and UI control events for decoupled UI management.
     * 
     * @private
     * @method setupEventBusListeners
     * @listens APP_EVENTS.UI_STATUS_UPDATE
     * @listens APP_EVENTS.RECORDING_STATE_CHANGED
     * @listens APP_EVENTS.UI_TRANSCRIPTION_READY
     * @listens APP_EVENTS.SETTINGS_UPDATED
     * @listens APP_EVENTS.UI_TIMER_UPDATE
     * @listens APP_EVENTS.UI_TIMER_RESET
     * @listens APP_EVENTS.UI_BUTTON_ENABLE_MIC
     * @listens APP_EVENTS.UI_BUTTON_DISABLE_MIC
     * @listens APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE
     * @listens APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE
     * @listens APP_EVENTS.UI_CONTROLS_RESET
     * @listens APP_EVENTS.UI_SPINNER_SHOW
     * @listens APP_EVENTS.UI_SPINNER_HIDE
     */
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
            const uiLogger = logger.child('UI');
            uiLogger.debug(`Recording state changed from ${oldState} to ${newState}`);
            
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
            const uiLogger = logger.child('UI');
            uiLogger.info('Model changed to:', data.model);
        });
        
        // Listen for theme changes
        eventBus.on(APP_EVENTS.UI_THEME_CHANGED, (data) => {
            this.applyTheme();
        });

        // Listen for visualization events
        eventBus.on(APP_EVENTS.VISUALIZATION_START, async (data) => {
            // Clean up any existing visualization
            if (this.visualizationController) {
                this.visualizationController.stop();
                this.visualizationController = null;
            }
            
            // Dynamically import VisualizationController to avoid circular imports
            try {
                const { VisualizationController } = await import('./visualization.js');
                const { stream, isDarkTheme } = data;
                if (this.visualizer && stream) {
                    this.visualizationController = new VisualizationController(stream, this.visualizer, isDarkTheme);
                    this.visualizationController.start();
                }
            } catch (error) {
                const uiLogger = logger.child('UI');
                uiLogger.error('Error starting visualization:', error);
            }
        });

        eventBus.on(APP_EVENTS.VISUALIZATION_STOP, () => {
            if (this.visualizationController) {
                this.visualizationController.stop();
                this.visualizationController = null;
            }
            this.clearVisualization();
        });

        // Listen for UI control events for decoupled UI management
        eventBus.on(APP_EVENTS.UI_TIMER_UPDATE, (data) => {
            this.updateTimer(data.display);
        });

        eventBus.on(APP_EVENTS.UI_TIMER_RESET, () => {
            this.updateTimer('00:00');
        });

        eventBus.on(APP_EVENTS.UI_BUTTON_ENABLE_MIC, () => {
            this.enableMicButton();
        });

        eventBus.on(APP_EVENTS.UI_BUTTON_DISABLE_MIC, () => {
            this.disableMicButton();
        });

        eventBus.on(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, (data) => {
            this.setRecordingState(data.isRecording);
        });

        eventBus.on(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, (data) => {
            this.setPauseState(data.isPaused);
        });

        eventBus.on(APP_EVENTS.UI_CONTROLS_RESET, () => {
            this.resetControlsAfterRecording();
        });

        eventBus.on(APP_EVENTS.UI_SPINNER_SHOW, () => {
            this.showSpinner();
        });

        eventBus.on(APP_EVENTS.UI_SPINNER_HIDE, () => {
            this.hideSpinner();
        });
    }
    
    loadTheme() {
        const themeMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'auto';
        const themeSelect = document.getElementById(ID.THEME_MODE);
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
            const uiLogger = logger.child('UI');
            uiLogger.info('Microphone re-enabled after fixing prerequisites');
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
                const themeSelect = document.getElementById(ID.THEME_MODE);
                if (themeSelect) themeSelect.value = newMode;
                this.applyTheme();
                
                // Emit theme changed event
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, { mode: newMode });
            });
        }
        
        // Theme mode selector
        const themeSelect = document.getElementById(ID.THEME_MODE);
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
    
    /**
     * Sets the status message displayed to the user.
     * Clears any existing temporary status timeout and displays the message.
     * 
     * @method setStatus
     * @param {string} message - Status message to display
     * 
     * @example
     * ui.setStatus('Ready to record');
     * ui.setStatus('Recording in progress...');
     */
    setStatus(message) {
        if (this.statusElement._statusTimeout) {
            clearTimeout(this.statusElement._statusTimeout);
            this.statusElement._statusTimeout = null;
        }

        this.statusElement.textContent = message;
        this.statusElement.style.color = '';
    }
    
    /**
     * Sets the status element content using HTML.
     * Allows for rich formatting in status messages.
     * 
     * @method setStatusHTML
     * @param {string} html - HTML content to display in status element
     * 
     * @example
     * ui.setStatusHTML('<strong>Error:</strong> Configuration required');
     */
    setStatusHTML(html) {
        this.statusElement.innerHTML = html;
    }
    
    /**
     * Displays transcribed text in the transcript area.
     * Appends new transcription to existing content with proper formatting.
     * 
     * @method displayTranscription
     * @param {string} text - Transcribed text to display
     * 
     * @example
     * ui.displayTranscription('Hello world, this is a test.');
     * ui.displayTranscription('Additional transcribed content.');
     */
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
    
    /**
     * Shows the loading spinner during processing operations.
     * 
     * @method showSpinner
     * 
     * @example
     * ui.showSpinner(); // Display spinner during API request
     */
    showSpinner() {
        this.spinnerContainer.style.display = 'block';
    }
    
    /**
     * Hides the loading spinner when processing is complete.
     * 
     * @method hideSpinner
     * 
     * @example
     * ui.hideSpinner(); // Hide spinner after API response
     */
    hideSpinner() {
        this.spinnerContainer.style.display = 'none';
    }
    
    /**
     * Updates UI to reflect current recording state.
     * Changes button appearance and status message based on recording state.
     * 
     * @method setRecordingState
     * @param {boolean} isRecording - Whether recording is currently active
     * 
     * @example
     * ui.setRecordingState(true);  // Show recording state
     * ui.setRecordingState(false); // Show idle state
     */
    setRecordingState(isRecording) {
        if (isRecording) {
            this.micButton.classList.add('recording');
            this.setStatus('Recording... Click again to stop');
        } else {
            this.micButton.classList.remove('recording');
        }
    }
    
    /**
     * Updates pause button visual state to reflect paused/playing status.
     * Toggles between pause and play icons based on current state.
     * 
     * @method setPauseState
     * @param {boolean} isPaused - Whether recording is currently paused
     * 
     * @example
     * ui.setPauseState(true);  // Show play icon (recording is paused)
     * ui.setPauseState(false); // Show pause icon (recording is active)
     */
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
    
    /**
     * Enables the microphone button and restores normal visual appearance.
     * Used when the application is ready to accept recording commands.
     * 
     * @method enableMicButton
     * 
     * @example
     * ui.enableMicButton(); // Enable button after initialization
     */
    enableMicButton() {
        this.micButton.disabled = false;
        this.micButton.style.opacity = 1;
        this.micButton.style.cursor = 'pointer';
    }
    
    /**
     * Disables the microphone button and shows disabled visual state.
     * Used during processing or when recording is not available.
     * 
     * @method disableMicButton
     * 
     * @example
     * ui.disableMicButton(); // Disable during API processing
     */
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

    // Optionally, expose a method to externally stop visualization (for tests or other modules)
    stopVisualization() {
        if (this.visualizationController) {
            this.visualizationController.stop();
            this.visualizationController = null;
        }
        this.clearVisualization();
    }
}
