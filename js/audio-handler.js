// js/audio-handler.js
import { showTemporaryStatus } from './status-helper.js';
import { COLORS, RECORDING_STATES, MESSAGES, ID } from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { RecordingStateMachine } from './recording-state-machine.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { VisualizationController } from './visualization.js';

export class AudioHandler {
    constructor(apiClient, ui, settings) {
        this.apiClient = apiClient;
        this.ui = ui;
        this.settings = settings;
        
        // Recording state
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.timerInterval = null;
        
        // Audio visualization
        this.visualizationController = null;
        
        // Permission management
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
    
    async toggleRecording() {
        if (this.stateMachine.canRecord()) {
            await this.startRecordingFlow();
        } else if (this.stateMachine.canInvokeStop()) {
            await this.stopRecordingFlow();
        }
    }
    
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
            console.error('Error starting recording:', err);
            
            // Transition to error state
            await this.stateMachine.transitionTo(RECORDING_STATES.ERROR, {
                error: err.message
            });
            
            if (err.message.includes('configure') || err.message.includes('API key') || err.message.includes('URI')) {
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
        
        if (model === 'gpt-4o-transcribe') {
            this.gracefulStop();
        } else {
            this.stopRecording();
        }
    }
    
    startRecording(stream) {
        this.audioChunks = [];
        
        this.mediaRecorder = new MediaRecorder(stream);
        
        // Setup visualization
        const visualizer = document.getElementById(ID.VISUALIZER);
        const isDarkTheme = document.body.classList.contains('dark-theme');
        this.visualizationController = new VisualizationController(stream, visualizer, isDarkTheme);
        this.visualizationController.start();
        
        this.mediaRecorder.addEventListener('dataavailable', event => {
            this.audioChunks.push(event.data);
        });
        
        this.mediaRecorder.addEventListener('stop', async () => {
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
            this.mediaRecorder.stop();
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

        // 1. Keep capturing a short tail to ensure complete audio including the tail
        await new Promise(res => setTimeout(res, delayMs));

        // 2. Ask MediaRecorder to flush its internal buffer
        await new Promise(res => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                res();
            } else {
                this.mediaRecorder.addEventListener('dataavailable', res, { once: true });
                this.mediaRecorder.requestData();
            }
        });

        // 3. Stop recording if still active and stopping is allowed
        if (this.stateMachine.canInvokeStop() && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.safeStopRecorder();
        }
    }
    
    async togglePause() {
        if (this.stateMachine.canPause()) {
            this.mediaRecorder.pause();
            clearInterval(this.timerInterval);
            await this.stateMachine.transitionTo(RECORDING_STATES.PAUSED);
        } else if (this.stateMachine.canResume()) {
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
            console.error('Transcription error:', error);
            
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                error: error.message
            });
            
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: `${MESSAGES.ERROR_PREFIX}${error.message}`,
                type: 'error',
                temporary: true
            });
        } finally {
            this.ui.hideSpinner();
        }
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000) % 60;
            const minutes = Math.floor(elapsed / 60000);
            this.ui.updateTimer(`${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`);
        }, 1000);
    }
    
    getTimerMilliseconds() {
        const parts = this.ui.timerElement.textContent.split(':');
        return (parseInt(parts[0]) * 60000) + (parseInt(parts[1]) * 1000);
    }
    
    cleanup() {
        // Called after audio has been processed to reset UI and state

        // Clear timer
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        
        // Reset UI
        this.ui.updateTimer('00:00');
        this.ui.setRecordingState(false);
        this.ui.setPauseState(false);
        
        // Stop visualization
        if (this.visualizationController) {
            this.visualizationController.stop();
            this.visualizationController = null;
        }
        
        // Clear recording state
        this.audioChunks.length = 0;
        this.recordingStartTime = null;
        this.mediaRecorder = null;
    }
    
    // Visualization logic is now handled by VisualizationController in visualization.js
}
