/**
 * @fileoverview Finite state machine for managing audio recording lifecycle.
 * Handles state transitions, validation, and coordination between recording states.
 * 
 * @module RecordingStateMachine
 * @requires EventBus
 * @requires Constants
 * @since 1.0.0
 */

import { RECORDING_STATES, STATE_TRANSITIONS, MESSAGES, DEFAULT_RESET_STATUS } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * Finite state machine for managing audio recording lifecycle and state transitions.
 * Ensures valid state transitions and handles state-specific logic for recording flow.
 * 
 * @class RecordingStateMachine
 * @fires APP_EVENTS.RECORDING_STATE_CHANGED
 * @fires APP_EVENTS.RECORDING_ERROR
 * 
 * @example
 * const stateMachine = new RecordingStateMachine(audioHandler);
 * 
 * // Check if can start recording
 * if (stateMachine.canRecord()) {
 *   await stateMachine.transitionTo(RECORDING_STATES.INITIALIZING);
 * }
 * 
 * // Listen for state changes
 * eventBus.on(APP_EVENTS.RECORDING_STATE_CHANGED, ({ newState, oldState }) => {
 *   logger.debug(`State changed: ${oldState} -> ${newState}`);
 * });
 */
export class RecordingStateMachine {
    /**
     * Creates a new RecordingStateMachine instance.
     * 
     * @param {AudioHandler} audioHandler - Audio handler instance for recording operations
     */
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
     * Gets the current recording state.
     * 
     * @method getState
     * @returns {string} Current recording state from RECORDING_STATES constants
     */
    getState() {
        return this.currentState;
    }
    
    /**
     * Checks if a transition to the specified state is valid from the current state.
     * Uses the STATE_TRANSITIONS configuration to validate allowed transitions.
     * 
     * @method canTransitionTo
     * @param {string} newState - Target state to transition to
     * @returns {boolean} True if transition is valid, false otherwise
     * 
     * @example
     * if (stateMachine.canTransitionTo(RECORDING_STATES.RECORDING)) {
     *   await stateMachine.transitionTo(RECORDING_STATES.RECORDING);
     * }
     */
    canTransitionTo(newState) {
        const validTransitions = STATE_TRANSITIONS[this.currentState] || [];
        return validTransitions.includes(newState);
    }
    
    /**
     * Transitions to a new recording state with validation and event emission.
     * Validates the transition, updates state, emits events, and executes state handler.
     * 
     * @async
     * @method transitionTo
     * @param {string} newState - Target state from RECORDING_STATES constants
     * @param {Object} [data={}] - Additional data to pass to state handler and events
     * @returns {Promise<boolean>} Promise resolving to true if transition succeeded
     * @throws {Error} When state handler execution fails
     * @fires APP_EVENTS.RECORDING_STATE_CHANGED
     * 
     * @example
     * try {
     *   const success = await stateMachine.transitionTo(
     *     RECORDING_STATES.PROCESSING, 
     *     { audioBlob: recordedData }
     *   );
     *   if (success) {
     *     logger.info('State transition completed');
     *   }
     * } catch (error) {
     *   logger.error('State transition failed:', error);
     * }
     */
    async transitionTo(newState, data = {}) {
        if (!this.canTransitionTo(newState)) {
            const stateLogger = logger.child('RecordingStateMachine');
            stateLogger.error(`Invalid state transition from ${this.currentState} to ${newState}`);
            return false;
        }
        
        const stateLogger = logger.child('RecordingStateMachine');
        stateLogger.debug(`State transition: ${this.currentState} → ${newState}`);
        
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
    
    /**
     * Handles the IDLE state - initial state when ready for recording.
     * Resets UI elements and prepares for new recording session.
     * 
     * @async
     * @private
     * @method handleIdleState
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handleIdleState() {
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: DEFAULT_RESET_STATUS,
            type: 'info'
        });
        // Re-enable the button when returning to idle
        eventBus.emit(APP_EVENTS.UI_BUTTON_ENABLE_MIC);
        eventBus.emit(APP_EVENTS.UI_SPINNER_HIDE);
        eventBus.emit(APP_EVENTS.UI_CONTROLS_RESET);
    }
    
    /**
     * Handles the INITIALIZING state - preparing for recording start.
     * Disables controls and shows initialization status message.
     * 
     * @async
     * @private
     * @method handleInitializingState
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handleInitializingState() {
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.INITIALIZING_MICROPHONE,
            type: 'info'
        });
        eventBus.emit(APP_EVENTS.UI_BUTTON_DISABLE_MIC);
    }
    
    /**
     * Handles the RECORDING state - active recording in progress.
     * Updates UI to show recording state and enables controls.
     * 
     * @async
     * @private
     * @method handleRecordingState
     * @fires APP_EVENTS.RECORDING_STARTED
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handleRecordingState() {
        eventBus.emit(APP_EVENTS.RECORDING_STARTED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: 'Recording... Click to stop',
            type: 'info'
        });
        eventBus.emit(APP_EVENTS.UI_BUTTON_ENABLE_MIC);
        eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: true });
    }
    
    /**
     * Handles the PAUSED state - recording temporarily paused.
     * Updates UI to reflect paused state.
     * 
     * @async
     * @private
     * @method handlePausedState
     * @fires APP_EVENTS.RECORDING_PAUSED
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handlePausedState() {
        eventBus.emit(APP_EVENTS.RECORDING_PAUSED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: 'Recording paused',
            type: 'info'
        });
        eventBus.emit(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: true });
    }
    
    /**
     * Handles the STOPPING state - ending recording and preparing for processing.
     * Stops visualization, updates UI state, and prepares for transcription.
     * 
     * @async
     * @private
     * @method handleStoppingState
     * @fires APP_EVENTS.RECORDING_STOPPED
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     * @fires APP_EVENTS.VISUALIZATION_STOP
     */
    async handleStoppingState() {
        eventBus.emit(APP_EVENTS.RECORDING_STOPPED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.FINISHING_RECORDING,
            type: 'info'
        });
        // Immediately reflect stopped state in the UI
        eventBus.emit(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: false });

        // Emit visualization stop event so UI can handle cleanup
        eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);

        // Don't disable the mic button here - let it stay clickable
        // The button will be properly managed in processing/idle states
    }
    
    /**
     * Handles the PROCESSING state - transcribing recorded audio.
     * Shows spinner, disables controls, and initiates API request.
     * 
     * @async
     * @private
     * @method handleProcessingState
     * @fires APP_EVENTS.API_REQUEST_START
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handleProcessingState() {
        eventBus.emit(APP_EVENTS.API_REQUEST_START);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.PROCESSING_AUDIO,
            type: 'info'
        });
        // Disable button only during processing
        eventBus.emit(APP_EVENTS.UI_BUTTON_DISABLE_MIC);
        eventBus.emit(APP_EVENTS.UI_SPINNER_SHOW);
    }
    
    /**
     * Handles the CANCELLING state - cancelling recording operation.
     * Resets UI and cleans up recording state.
     * 
     * @async
     * @private
     * @method handleCancellingState
     * @fires APP_EVENTS.RECORDING_CANCELLED
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handleCancellingState() {
        eventBus.emit(APP_EVENTS.RECORDING_CANCELLED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.RECORDING_CANCELLED,
            type: 'info'
        });
        eventBus.emit(APP_EVENTS.UI_BUTTON_DISABLE_MIC);
        eventBus.emit(APP_EVENTS.UI_SPINNER_HIDE);
    }
    
    /**
     * Handles the ERROR state - recording or processing error occurred.
     * Displays error message and resets UI to enable recovery.
     * 
     * @async
     * @private
     * @method handleErrorState
     * @param {Object} data - Error data containing error message
     * @param {string} [data.error] - Error message to display
     * @fires APP_EVENTS.RECORDING_ERROR
     * @fires APP_EVENTS.UI_STATUS_UPDATE
     */
    async handleErrorState(data) {
        const errorMessage = data.error || 'An error occurred';
        eventBus.emit(APP_EVENTS.RECORDING_ERROR, { error: errorMessage });
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: `${MESSAGES.ERROR_PREFIX}${errorMessage}`,
            type: 'error'
        });
        eventBus.emit(APP_EVENTS.UI_BUTTON_ENABLE_MIC);
        eventBus.emit(APP_EVENTS.UI_SPINNER_HIDE);
    }
    
    // Helper methods for common state checks
    
    /**
     * Checks if the state machine is in IDLE state.
     * 
     * @method isIdle
     * @returns {boolean} True if current state is IDLE
     */
    isIdle() {
        return this.currentState === RECORDING_STATES.IDLE;
    }
    
    /**
     * Checks if the state machine is in RECORDING state.
     * 
     * @method isRecording
     * @returns {boolean} True if current state is RECORDING
     */
    isRecording() {
        return this.currentState === RECORDING_STATES.RECORDING;
    }
    
    /**
     * Checks if the state machine is in PAUSED state.
     * 
     * @method isPaused
     * @returns {boolean} True if current state is PAUSED
     */
    isPaused() {
        return this.currentState === RECORDING_STATES.PAUSED;
    }
    
    /**
     * Checks if the state machine is in PROCESSING state.
     * 
     * @method isProcessing
     * @returns {boolean} True if current state is PROCESSING
     */
    isProcessing() {
        return this.currentState === RECORDING_STATES.PROCESSING;
    }
    
    /**
     * Checks if recording can be started from current state.
     * 
     * @method canRecord
     * @returns {boolean} True if recording can be started (state is IDLE)
     */
    canRecord() {
        return this.currentState === RECORDING_STATES.IDLE;
    }
    
    /**
     * Checks if recording can be paused from current state.
     * 
     * @method canPause
     * @returns {boolean} True if recording can be paused (state is RECORDING)
     */
    canPause() {
        return this.currentState === RECORDING_STATES.RECORDING;
    }
    
    /**
     * Checks if recording can be resumed from current state.
     * 
     * @method canResume
     * @returns {boolean} True if recording can be resumed (state is PAUSED)
     */
    canResume() {
        return this.currentState === RECORDING_STATES.PAUSED;
    }
    
    /**
     * Determines if the recorder can be asked to stop.
     * Returns true when recording is active, paused, or already stopping/cancelling.
     * 
     * @method canInvokeStop
     * @returns {boolean} True if stop operation can be invoked
     */
    canInvokeStop() {
        return [
            RECORDING_STATES.RECORDING,
            RECORDING_STATES.PAUSED,
            RECORDING_STATES.STOPPING,
            RECORDING_STATES.CANCELLING
        ].includes(this.currentState);
    }
    
    /**
     * Checks if recording can be cancelled from current state.
     * 
     * @method canCancel
     * @returns {boolean} True if recording can be cancelled (RECORDING or PAUSED)
     */
    canCancel() {
        return [RECORDING_STATES.RECORDING, RECORDING_STATES.PAUSED].includes(this.currentState);
    }
}