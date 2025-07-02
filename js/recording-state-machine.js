import { RECORDING_STATES, STATE_TRANSITIONS, MESSAGES, DEFAULT_RESET_STATUS } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

export class RecordingStateMachine {
    constructor(audioHandler) {
        this.audioHandler = audioHandler;
        this.currentState = RECORDING_STATES.IDLE;
        this.previousState = null;
        
        // Bind state handlers
        this.stateHandlers = {
            [RECORDING_STATES.IDLE]: this.handleIdleState.bind(this),
            [RECORDING_STATES.INITIALIZING]: this.handleInitializingState.bind(this),
            [RECORDING_STATES.RECORDING]: this.handleRecordingState.bind(this),
            [RECORDING_STATES.PAUSED]: this.handlePausedState.bind(this),
            [RECORDING_STATES.STOPPING]: this.handleStoppingState.bind(this),
            [RECORDING_STATES.PROCESSING]: this.handleProcessingState.bind(this),
            [RECORDING_STATES.CANCELLING]: this.handleCancellingState.bind(this),
            [RECORDING_STATES.ERROR]: this.handleErrorState.bind(this)
        };
    }
    
    /**
     * Get the current state
     */
    getState() {
        return this.currentState;
    }
    
    /**
     * Check if a transition to a new state is valid
     */
    canTransitionTo(newState) {
        const validTransitions = STATE_TRANSITIONS[this.currentState] || [];
        return validTransitions.includes(newState);
    }
    
    /**
     * Transition to a new state
     */
    async transitionTo(newState, data = {}) {
        if (!this.canTransitionTo(newState)) {
            console.error(`Invalid state transition from ${this.currentState} to ${newState}`);
            return false;
        }
        
        console.log(`State transition: ${this.currentState} → ${newState}`);
        
        // Store previous state
        this.previousState = this.currentState;
        this.currentState = newState;
        
        // Emit state change event
        eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, {
            newState,
            oldState: this.previousState,
            ...data
        });
        
        // Execute state handler
        const handler = this.stateHandlers[newState];
        if (handler) {
            await handler(data);
        }
        
        return true;
    }
    
    // State Handlers
    
    async handleIdleState() {
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: DEFAULT_RESET_STATUS,
            type: 'info'
        });
        // Re-enable the button when returning to idle
        this.audioHandler.ui.enableMicButton();
        this.audioHandler.ui.hideSpinner();
        this.audioHandler.ui.resetControlsAfterRecording();
    }
    
    async handleInitializingState() {
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.INITIALIZING_MICROPHONE,
            type: 'info'
        });
        this.audioHandler.ui.disableMicButton();
    }
    
    async handleRecordingState() {
        eventBus.emit(APP_EVENTS.RECORDING_STARTED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: 'Recording... Click to stop',
            type: 'info'
        });
        this.audioHandler.ui.enableMicButton();
        this.audioHandler.ui.setRecordingState(true);
    }
    
    async handlePausedState() {
        eventBus.emit(APP_EVENTS.RECORDING_PAUSED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: 'Recording paused',
            type: 'info'
        });
        this.audioHandler.ui.setPauseState(true);
    }
    
    async handleStoppingState() {
        eventBus.emit(APP_EVENTS.RECORDING_STOPPED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.FINISHING_RECORDING,
            type: 'info'
        });
        // Immediately reflect stopped state in the UI
        this.audioHandler.ui.setRecordingState(false);

        // Emit visualization stop event so UI can handle cleanup
        eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);

        // Don't disable the mic button here - let it stay clickable
        // The button will be properly managed in processing/idle states
    }
    
    async handleProcessingState() {
        eventBus.emit(APP_EVENTS.API_REQUEST_START);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.PROCESSING_AUDIO,
            type: 'info'
        });
        // Disable button only during processing
        this.audioHandler.ui.disableMicButton();
        this.audioHandler.ui.showSpinner();
    }
    
    async handleCancellingState() {
        eventBus.emit(APP_EVENTS.RECORDING_CANCELLED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.RECORDING_CANCELLED,
            type: 'info'
        });
        this.audioHandler.ui.disableMicButton();
        this.audioHandler.ui.hideSpinner();
    }
    
    async handleErrorState(data) {
        const errorMessage = data.error || 'An error occurred';
        eventBus.emit(APP_EVENTS.RECORDING_ERROR, { error: errorMessage });
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: `${MESSAGES.ERROR_PREFIX}${errorMessage}`,
            type: 'error'
        });
        this.audioHandler.ui.enableMicButton();
        this.audioHandler.ui.hideSpinner();
    }
    
    /**
     * Helper methods for common state checks
     */
    isIdle() {
        return this.currentState === RECORDING_STATES.IDLE;
    }
    
    isRecording() {
        return this.currentState === RECORDING_STATES.RECORDING;
    }
    
    isPaused() {
        return this.currentState === RECORDING_STATES.PAUSED;
    }
    
    isProcessing() {
        return this.currentState === RECORDING_STATES.PROCESSING;
    }
    
    canRecord() {
        return this.currentState === RECORDING_STATES.IDLE;
    }
    
    canPause() {
        return this.currentState === RECORDING_STATES.RECORDING;
    }
    
    canResume() {
        return this.currentState === RECORDING_STATES.PAUSED;
    }
    
    /**
     * Determine if the recorder can be asked to stop. This returns true when
     * recording is active, paused or already in the process of stopping or
     * cancelling.
     */
    canInvokeStop() {
        return [
            RECORDING_STATES.RECORDING,
            RECORDING_STATES.PAUSED,
            RECORDING_STATES.STOPPING,
            RECORDING_STATES.CANCELLING
        ].includes(this.currentState);
    }
    
    canCancel() {
        return [RECORDING_STATES.RECORDING, RECORDING_STATES.PAUSED].includes(this.currentState);
    }
}