import { RECORDING_STATES, STATE_TRANSITIONS } from './constants.js';

export class RecordingStateMachine {
    constructor(audioHandler) {
        this.audioHandler = audioHandler;
        this.currentState = RECORDING_STATES.IDLE;
        this.previousState = null;
        this.stateChangeListeners = [];
        
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
        
        // Notify listeners
        this.notifyStateChange(newState, this.previousState, data);
        
        // Execute state handler
        const handler = this.stateHandlers[newState];
        if (handler) {
            await handler(data);
        }
        
        return true;
    }
    
    /**
     * Add a state change listener
     */
    onStateChange(listener) {
        this.stateChangeListeners.push(listener);
        return () => {
            const index = this.stateChangeListeners.indexOf(listener);
            if (index > -1) {
                this.stateChangeListeners.splice(index, 1);
            }
        };
    }
    
    /**
     * Notify all listeners of state change
     */
    notifyStateChange(newState, oldState, data) {
        this.stateChangeListeners.forEach(listener => {
            listener(newState, oldState, data);
        });
    }
    
    // State Handlers
    
    async handleIdleState() {
        this.audioHandler.ui.resetControlsAfterRecording();
        this.audioHandler.ui.setStatus('🎙️ Click the microphone to start recording');
    }
    
    async handleInitializingState() {
        this.audioHandler.ui.setStatus('Initializing microphone...');
        this.audioHandler.ui.disableMicButton();
    }
    
    async handleRecordingState() {
        this.audioHandler.ui.setRecordingState(true);
        this.audioHandler.ui.setStatus('Recording... Click again to stop');
        this.audioHandler.ui.enableMicButton();
    }
    
    async handlePausedState() {
        this.audioHandler.ui.setPauseState(true);
        this.audioHandler.ui.setStatus('Recording paused');
    }
    
    async handleStoppingState() {
        this.audioHandler.ui.setStatus('Finishing...');
        this.audioHandler.ui.disableMicButton();
    }
    
    async handleProcessingState() {
        this.audioHandler.ui.setStatus('Processing audio...');
        this.audioHandler.ui.showSpinner();
        this.audioHandler.ui.disableMicButton();
    }
    
    async handleCancellingState() {
        this.audioHandler.ui.setStatus('Cancelling...');
        this.audioHandler.ui.disableMicButton();
    }
    
    async handleErrorState(data) {
        const errorMessage = data.error || 'An error occurred';
        this.audioHandler.ui.setStatus(`Error: ${errorMessage}`);
        this.audioHandler.ui.enableMicButton();
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
    
    canStop() {
        return [RECORDING_STATES.RECORDING, RECORDING_STATES.PAUSED].includes(this.currentState);
    }
    
    canCancel() {
        return [RECORDING_STATES.RECORDING, RECORDING_STATES.PAUSED].includes(this.currentState);
    }
}