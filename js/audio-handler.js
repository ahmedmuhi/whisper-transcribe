/**
 * @fileoverview Audio recording and playback management for speech transcription.
 * Handles MediaRecorder integration, recording lifecycle, and audio processing.
 * 
 * @module AudioHandler
 * @requires EventBus
 * @requires RecordingStateMachine
 * @requires PermissionManager
 * @requires StatusHelper
 * @requires Constants
 * @since 1.0.0
 */

// js/audio-handler.js
import { showTemporaryStatus } from './status-helper.js';
import { COLORS, RECORDING_STATES, MESSAGES, ID } from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { RecordingStateMachine } from './recording-state-machine.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * Audio recording and processing manager for speech transcription.
 * Coordinates MediaRecorder API, state management, timer functionality, and transcription requests.
 * Integrates with Azure Speech Services for audio-to-text conversion.
 * 
 * @class AudioHandler
 * @fires APP_EVENTS.RECORDING_STARTED
 * @fires APP_EVENTS.RECORDING_STOPPED
 * @fires APP_EVENTS.RECORDING_PAUSED
 * @fires APP_EVENTS.RECORDING_RESUMED
 * @fires APP_EVENTS.RECORDING_CANCELLED
 * @fires APP_EVENTS.RECORDING_ERROR
 * @fires APP_EVENTS.API_REQUEST_START
 * @fires APP_EVENTS.UI_TRANSCRIPTION_READY
 * 
 * @example
 * const audioHandler = new AudioHandler(apiClient, ui, settings);
 * 
 * // Start recording
 * await audioHandler.startRecording();
 * 
 * // Stop and transcribe
 * await audioHandler.stopRecording();
 * 
 * // Check current state
 * if (audioHandler.stateMachine.canRecord()) {
 *   logger.info('Ready to record');
 * }
 */
export class AudioHandler {
    /**
     * Creates a new AudioHandler instance.
     * 
     * @param {AzureAPIClient} apiClient - Azure API client for transcription
     * @param {UI} ui - UI controller instance for interface updates  
     * @param {Settings} settings - Settings manager for configuration
     */
    constructor(apiClient, ui, settings) {
        this.apiClient = apiClient;
        this.ui = ui;
        this.settings = settings;
        
        // Recording state
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.timerInterval = null;
        this.currentTimerDisplay = '00:00';
        
        // Controls
        this.cancelRequested = false;
        this.permissionManager = new PermissionManager(ui);
        
        // State machine
        this.stateMachine = new RecordingStateMachine(this);
        
        this.setupEventListeners();
        this.setupEventBusListeners();
    }
    
    setupEventBusListeners() {
        // Listen for API config missing events
        eventBus.on(APP_EVENTS.API_CONFIG_MISSING, () => {
            this.settings.openSettingsModal();
        });
        
        // Listen for recording events that might come from other sources
        eventBus.on(APP_EVENTS.RECORDING_RESUMED, () => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
                this.mediaRecorder.resume();
                
                // Resume timer from where it left off
                const pausedTime = this.getTimerMilliseconds();
                this.recordingStartTime = Date.now() - pausedTime;
                this.startTimer();
            }
        });
    }
    
    setupEventListeners() {
        // Mic button
        this.ui.micButton.addEventListener('click', () => this.toggleRecording());
        
        // Pause button
        this.ui.pauseButton.addEventListener('click', () => this.togglePause());
        
        // Cancel button
        this.ui.cancelButton.addEventListener('click', () => this.cancelRecording());
    }
    
    /**
     * Toggles recording state based on current state machine status.
     * Starts recording if idle, stops recording if active.
     * Main entry point for recording control from UI interactions.
     * 
     * @async
     * @method toggleRecording
     * @returns {Promise<void>} Promise that resolves when state transition completes
     * @throws {Error} When state transition or recording operation fails
     * 
     * @example
     * // Toggle recording on button click
     * micButton.addEventListener('click', async () => {
     *   await audioHandler.toggleRecording();
     * });
     */
    async toggleRecording() {
        if (this.stateMachine.canRecord()) {
            await this.startRecordingFlow();
        } else if (this.stateMachine.canInvokeStop()) {
            await this.stopRecordingFlow();
        }
    }
    
    /**
     * Initiates the complete recording workflow.
     * Handles permission checks, state transitions, and MediaRecorder setup.
     * 
     * @async
     * @private
     * @method startRecordingFlow
     * @returns {Promise<void>} Promise that resolves when recording starts
     * @throws {Error} When permission is denied or MediaRecorder setup fails
     * @fires APP_EVENTS.RECORDING_STARTED
     * @fires APP_EVENTS.RECORDING_ERROR
     */
    async startRecordingFlow() {
        try {
            // Transition to initializing
            await this.stateMachine.transitionTo(RECORDING_STATES.INITIALIZING);
            
            // Check prerequisites first
            if (!this.ui.checkRecordingPrerequisites()) {
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }
            
            // Validate configuration before starting
            this.apiClient.validateConfig();
            
            // Request microphone access through PermissionManager
            const stream = await this.permissionManager.requestMicrophoneAccess();
            if (!stream) {
                // Permission manager already handled the error display
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }
            
            // Transition to recording
            await this.stateMachine.transitionTo(RECORDING_STATES.RECORDING);
            this.startRecording(stream);
            
    } catch (err) {
            const audioLogger = logger.child('AudioHandler');
            audioLogger.error('Error starting recording:', err);
            
            // Transition to error state
            await this.stateMachine.transitionTo(RECORDING_STATES.ERROR, {
                error: err.message
            });
            
            if (err.message.includes('configure') || err.message.includes('API key') || err.message.includes('URI')) {
                // Notify settings modal directly and via event
                this.settings.openSettingsModal();
                eventBus.emit(APP_EVENTS.API_CONFIG_MISSING);
            }
            
            // Return to idle after error
            setTimeout(() => {
                this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
            }, 3000);
        }
    }
    
    async stopRecordingFlow() {
        const model = this.settings.getCurrentModel();
        await this.stateMachine.transitionTo(RECORDING_STATES.STOPPING);
        
    // Stop the timer immediately when stopping
    clearInterval(this.timerInterval);
    // Emit timer reset event immediately for UI
    eventBus.emit(APP_EVENTS.UI_TIMER_RESET);
        
        try {
            if (model === 'gpt-4o-transcribe') {
                await this.gracefulStop();
            } else {
                this.safeStopRecorder();
            }
        } catch (err) {
            eventBus.emit(APP_EVENTS.RECORDING_ERROR, { error: err.message });
        }
    }
    
    startRecording(stream) {
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(stream);

        // Emit event to start visualization
        const isDarkTheme = document.body.classList.contains('dark-theme');
        eventBus.emit(APP_EVENTS.VISUALIZATION_START, {
            stream,
            visualizer: document.getElementById(ID.VISUALIZER),
            isDarkTheme
        });

        this.mediaRecorder.addEventListener('dataavailable', event => {
            this.audioChunks.push(event.data);
        });

        this.mediaRecorder.addEventListener('stop', async () => {
            // Emit event to stop visualization
            eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);

            if (this.stateMachine.getState() === RECORDING_STATES.CANCELLING) {
                stream.getTracks().forEach(t => t.stop());
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                this.cleanup();
                return;
            }

            // Transition to processing
            await this.stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
            await this.processAndSendAudio(stream);

            // Cleanup after audio has been processed so chunks remain intact
            this.cleanup();
        });

        this.mediaRecorder.start(250);
        this.recordingStartTime = Date.now();
        // Start timer
        this.startTimer();
    }

    safeStopRecorder() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            } catch (err) {
                eventBus.emit(APP_EVENTS.RECORDING_ERROR, { error: err.message });
            }
        }
    }

    stopRecording() {
        if (this.stateMachine.canInvokeStop()) {
            this.safeStopRecorder();
        }
    }

    async gracefulStop(delayMs = 800) {
        if (!this.stateMachine.canInvokeStop()) return;
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

        // Request internal buffer flush immediately
        try {
            this.mediaRecorder.requestData();
        } catch (err) {
            eventBus.emit(APP_EVENTS.RECORDING_ERROR, { error: err.message });
            return;
        }

        // Delay stopping to capture remaining audio tail
        setTimeout(() => {
            this.safeStopRecorder();
        }, delayMs);
    }
    
    async togglePause() {
        if (this.stateMachine.canPause()) {
            this.mediaRecorder.pause();
            clearInterval(this.timerInterval);
            this.timerInterval = null;
            await this.stateMachine.transitionTo(RECORDING_STATES.PAUSED);
        } else if (this.stateMachine.canResume()) {
            // Resume timer from paused state by adjusting start time
            const pausedTime = this.getTimerMilliseconds();
            this.recordingStartTime = Date.now() - pausedTime;
            this.mediaRecorder.resume();
            this.startTimer();
            eventBus.emit(APP_EVENTS.RECORDING_RESUMED);
            await this.stateMachine.transitionTo(RECORDING_STATES.RECORDING);
        }
    }
    
    async cancelRecording() {
        if (this.stateMachine.canCancel()) {
            await this.stateMachine.transitionTo(RECORDING_STATES.CANCELLING);
            this.stopRecording();
        }
    }
    
    async processAndSendAudio(stream) {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        await this.sendToAzureAPI(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        
        // Clear the array to free memory
        this.audioChunks.length = 0;
        
        // Return to idle state
        await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
    }
    
    async sendToAzureAPI(audioBlob) {
        try {
            const transcriptionText = await this.apiClient.transcribe(audioBlob, (statusMessage) => {
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: statusMessage,
                    type: 'info'
                });
            });
            
            eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, {
                text: transcriptionText
            });
            
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.TRANSCRIPTION_COMPLETE,
                type: 'success',
                temporary: true
            });
            
            eventBus.emit(APP_EVENTS.API_REQUEST_SUCCESS);
            
    } catch (error) {
            const audioLogger = logger.child('AudioHandler');
            audioLogger.error('Transcription error:', error);
            
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                error: error.message
            });
            
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: `${MESSAGES.ERROR_PREFIX}${error.message}`,
                type: 'error',
                temporary: true
            });
            // Cleanup resources on transcription error
            this.cleanup();
        } finally {
            eventBus.emit(APP_EVENTS.UI_SPINNER_HIDE);
        }
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000) % 60;
            const minutes = Math.floor(elapsed / 60000);
            this.currentTimerDisplay = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
            eventBus.emit(APP_EVENTS.UI_TIMER_UPDATE, {
                display: this.currentTimerDisplay
            });
        }, 1000);
    }
    
    getTimerMilliseconds() {
        const parts = this.currentTimerDisplay.split(':');
        return (parseInt(parts[0]) * 60000) + (parseInt(parts[1]) * 1000);
    }
    
    cleanup() {
        // Called after audio has been processed to reset UI and state

        // Clear timer
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.currentTimerDisplay = '00:00';

        // Reset UI via events
        eventBus.emit(APP_EVENTS.UI_TIMER_RESET);
        eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: false });
        eventBus.emit(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: false });

        // Visualization cleanup is now handled by UI via event

        // Clear recording state
        this.audioChunks.length = 0;
        this.recordingStartTime = null;
        this.mediaRecorder = null;
    }
    
    // Visualization logic is now handled by VisualizationController in visualization.js
}
