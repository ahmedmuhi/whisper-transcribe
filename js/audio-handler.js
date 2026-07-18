/**
 * @fileoverview Audio recording and playback management for speech transcription.
 */

import {
    API_ERROR_CODES,
    AUDIO_SAFETY_STATES,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    AUTHENTICATION_STATES,
    RECORDING_STATES,
    MESSAGES,
    TIMER_CONFIG,
    DISCARD_CONFIRM_MIN_MS,
    getWhisperFilename
} from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { RecordingStateMachine } from './recording-state-machine.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';
import { errorHandler } from './error-handler.js';

const ACTIVE_AUDIO_SAFETY_STATES = new Set([
    RECORDING_STATES.INITIALIZING,
    RECORDING_STATES.RECORDING,
    RECORDING_STATES.PAUSED,
    RECORDING_STATES.CONFIRMING_DISCARD,
    RECORDING_STATES.STOPPING,
    RECORDING_STATES.PROCESSING,
    RECORDING_STATES.CANCELLING
]);

/**
 * Audio recording and processing manager for speech transcription.
 * 
 * @class AudioHandler
 * @fires APP_EVENTS.RECORDING_STARTED
 * @fires APP_EVENTS.RECORDING_STOPPED
 * @fires APP_EVENTS.RECORDING_PAUSED
 * @fires APP_EVENTS.RECORDING_RESUMED
 * @fires APP_EVENTS.RECORDING_CANCELLED
 * @fires APP_EVENTS.RECORDING_ERROR
 * @fires APP_EVENTS.UI_TRANSCRIPTION_READY
 */
export class AudioHandler {
    /**
     * Creates a new AudioHandler instance.
     * 
     * @param {AzureAPIClient} apiClient - API client for transcription
     * @param {Settings} settings - Settings manager
     * @param {{ensureTokenReady(scope: string): Promise<string>}} authenticationReadiness - Safe readiness boundary
     */
    constructor(apiClient, settings, authenticationReadiness) {
        this.apiClient = apiClient;
        this.settings = settings;
        this.authenticationReadiness = authenticationReadiness;

        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.timerInterval = null;
        this.currentTimerDisplay = TIMER_CONFIG.DEFAULT_DISPLAY;
        this.pendingRetryBlob = null;
        this.pendingTranscriptionErrorCode = null;
        this.activeStream = null;
        this._activeRecordingSession = null;

        this.permissionManager = new PermissionManager();
        
        this.stateMachine = new RecordingStateMachine(this);
        
        this.setupEventBusListeners();
    }

    setupEventBusListeners() {
        this._unsubscribers = [
            eventBus.on(APP_EVENTS.MIC_BUTTON_CLICKED, () => this.toggleRecording()),
            eventBus.on(APP_EVENTS.PAUSE_BUTTON_CLICKED, () => this.togglePause()),
            eventBus.on(APP_EVENTS.DISCARD_BUTTON_CLICKED, () => this.requestDiscard()),
            eventBus.on(APP_EVENTS.DISCARD_CONFIRMED, () => this.confirmDiscard()),
            eventBus.on(APP_EVENTS.DISCARD_KEPT, () => this.keepRecording()),
            eventBus.on(APP_EVENTS.RETRY_BUTTON_CLICKED, () => this.retryPendingTranscription()),
            eventBus.on(APP_EVENTS.API_CONFIG_MISSING, () => this.settings.openSettingsModal()),
        ];
    }

    /**
     * Returns a token-free navigation safety state without exposing captured audio.
     *
     * @returns {string}
     */
    getAudioSafetyState() {
        if (this.pendingRetryBlob) return AUDIO_SAFETY_STATES.UNSENT;
        return ACTIVE_AUDIO_SAFETY_STATES.has(this.stateMachine.getState())
            ? AUDIO_SAFETY_STATES.ACTIVE
            : AUDIO_SAFETY_STATES.SAFE;
    }

    /**
     * Initiates a local download while retaining the Unsent Recording for retry.
     *
     * @returns {boolean} Whether the browser download lifecycle was initiated.
     */
    downloadUnsentRecording() {
        const recording = this.pendingRetryBlob;
        if (!recording) return false;

        const objectUrl = URL.createObjectURL(recording);
        let anchor = null;
        try {
            anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = getWhisperFilename(recording.type);
            anchor.click();
            return true;
        } finally {
            anchor?.remove?.();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        }
    }

    /**
     * Clears an Unsent Recording after an external confirmation boundary.
     *
     * @returns {boolean} Whether an Unsent Recording was discarded.
     */
    discardUnsentRecording() {
        if (!this.pendingRetryBlob) return false;
        this.pendingRetryBlob = null;
        this.pendingTranscriptionErrorCode = null;
        return true;
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
     * // The primary control emits MIC_BUTTON_CLICKED; AudioHandler toggles:
     * eventBus.on(APP_EVENTS.MIC_BUTTON_CLICKED, () => audioHandler.toggleRecording());
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
            if (this.pendingRetryBlob
                && this._requiresAuthenticationRecovery(this.pendingTranscriptionErrorCode)) {
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.UNSENT_RECORDING_REQUIRES_RECOVERY,
                    type: 'error'
                });
                return;
            }

            // If in error state, first transition to idle
            if (this.stateMachine.getState() === RECORDING_STATES.ERROR) {
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
            }
            this.pendingRetryBlob = null;
            this.pendingTranscriptionErrorCode = null;
            
            // Transition to initializing
            await this.stateMachine.transitionTo(RECORDING_STATES.INITIALIZING);
            
            // Check prerequisites before starting
            if (!PermissionManager.checkBrowserSupport()) {
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.BROWSER_NOT_SUPPORTED, type: 'error'
                });
                eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'browser' });
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }
            const config = this.settings.getModelConfig();
            if (!config.uri) {
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.API_NOT_CONFIGURED, type: 'error'
                });
                eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'config' });
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }
            
            // Validate configuration before starting
            const validatedConfig = this.apiClient.validateConfig();

            if (!await this._establishAuthenticationReadiness(validatedConfig.model)) {
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }
            
            // Request microphone access through PermissionManager
            const stream = await this.permissionManager.requestMicrophoneAccess();
            if (!stream) {
                // Permission manager already handled the error display
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }

            // Keep the FSM in INITIALIZING until MediaRecorder.start() succeeds.
            const session = this.startRecording(stream);

            // Commit the recording only after the recorder has started.
            await this.stateMachine.transitionTo(RECORDING_STATES.RECORDING);
            this.startVisualization(session);
            this.recordingStartTime = Date.now();
            this.startTimer();
            
        } catch (err) {
            errorHandler.handleError(err, { module: 'AudioHandler' });
            await this.recoverFromRecorderError(err);
            // Config errors are handled by validateConfig() which emits
            // API_CONFIG_MISSING before throwing — the event listener opens settings
        }
    }

    async _establishAuthenticationReadiness(model) {
        let state = AUTHENTICATION_STATES.CONFIGURATION_ERROR;
        if (typeof this.authenticationReadiness?.ensureTokenReady === 'function') {
            const scope = this.apiClient.getScopeForModel(model);
            state = await this.authenticationReadiness.ensureTokenReady(scope);
        }

        if (state === AUTHENTICATION_STATES.READY) {
            return true;
        }

        const message = this._getAuthenticationReadinessMessage(state);
        eventBus.emit(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, { state });
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message,
            type: 'error'
        });
        eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, {
            ready: false,
            reason: 'authentication',
            state
        });
        return false;
    }

    _getAuthenticationReadinessMessage(state) {
        if (state === AUTHENTICATION_STATES.SIGNED_OUT) {
            return MESSAGES.AUTHENTICATION_SIGN_IN_REQUIRED;
        }
        if (state === AUTHENTICATION_STATES.INTERACTION_REQUIRED) {
            return MESSAGES.AUTHENTICATION_INTERACTION_REQUIRED;
        }
        if (state === AUTHENTICATION_STATES.CONFIGURATION_ERROR) {
            return MESSAGES.AUTHENTICATION_NOT_CONFIGURED;
        }
        return MESSAGES.AUTHENTICATION_READINESS_FAILED;
    }
    
    /**
     * Stops the recording workflow, resets timer, and handles model-specific stop logic.
     * 
     * @async
     * @method stopRecordingFlow
     * @returns {Promise<void>} Resolves when recorder has been stopped or an error event has been emitted
     */
    async stopRecordingFlow() {
        const transitioned = await this.stateMachine.transitionTo(RECORDING_STATES.STOPPING);
        if (!transitioned) return;

        const session = this._activeRecordingSession;
        this.markVisualizationStopped(session);

        // Stop the timer immediately when stopping
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        // Emit timer reset event immediately for UI
        eventBus.emit(APP_EVENTS.UI_TIMER_RESET);

        try {
            this.safeStopRecorder();
        } catch (err) {
            errorHandler.handleError(err, { module: 'AudioHandler' });
            await this.recoverFromRecorderError(err, session);
        }
    }
    
    /**
     * Initializes MediaRecorder and begins capturing audio data, visualization, and timer.
     * 
     * @method startRecording
     * @param {MediaStream} stream - Audio media stream from microphone
     * @returns {Object} The active recording session
     */
    startRecording(stream) {
        const session = {
            stream,
            recorder: null,
            visualizationStarted: false,
            visualizationStopped: false,
            failureHandled: false,
            stopEventHandled: false
        };

        this.audioChunks = [];
        this.activeStream = stream;
        this._activeRecordingSession = session;

        const recorder = new MediaRecorder(stream);
        session.recorder = recorder;
        this.mediaRecorder = recorder;

        recorder.addEventListener('dataavailable', event => {
            if (session.failureHandled || session.stopEventHandled) return;
            this.audioChunks.push(event.data);
        });

        recorder.addEventListener('stop', async () => {
            await this.handleRecorderStop(session);
        });

        recorder.addEventListener('error', async event => {
            const error = event?.error instanceof Error
                ? event.error
                : new Error(event?.message || 'MediaRecorder error');
            await this.recoverFromRecorderError(error, session);
        });

        recorder.start(250);
        return session;
    }

    /**
     * Starts visualization only after MediaRecorder startup has committed.
     *
     * @method startVisualization
     * @param {Object} session - Active recording session
     * @returns {void}
     */
    startVisualization(session) {
        if (!session || session.failureHandled) return;

        session.visualizationStarted = true;
        eventBus.emit(APP_EVENTS.VISUALIZATION_START, { stream: session.stream });
    }

    /**
     * Stops visualization once for a recording session.
     *
     * @method stopVisualization
     * @param {Object} session - Active recording session
     * @returns {void}
     */
    stopVisualization(session) {
        if (!session?.visualizationStarted || session.visualizationStopped) return;

        session.visualizationStopped = true;
        eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
    }

    /**
     * Marks visualization as stopped when the state machine already emitted
     * the visualization stop event while entering STOPPING.
     *
     * @method markVisualizationStopped
     * @param {Object} session - Active recording session
     * @returns {void}
     */
    markVisualizationStopped(session) {
        if (session?.visualizationStarted) {
            session.visualizationStopped = true;
        }
    }

    /**
     * Handles the recorder stop event exactly once.
     *
     * @async
     * @method handleRecorderStop
     * @param {Object} session - Active recording session
     * @returns {Promise<void>}
     */
    async handleRecorderStop(session) {
        if (session.failureHandled || session.stopEventHandled) return;
        session.stopEventHandled = true;

        this.stopVisualization(session);

        if (this.stateMachine.getState() === RECORDING_STATES.CANCELLING) {
            this.stopStreamTracks(session.stream);
            await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
            this.cleanup();
            return;
        }

        if (this.stateMachine.getState() !== RECORDING_STATES.STOPPING) return;

        const recorderMimeType = session.recorder?.mimeType;

        // Transition to processing
        await this.stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
        await this.processAndSendAudio(session.stream, recorderMimeType);

        // Cleanup after audio has been processed so chunks remain intact
        this.cleanup();
    }

    /**
     * Safely stops the MediaRecorder if active and handles any stop errors.
     * 
     * @method safeStopRecorder
     * @returns {boolean} True when stop was requested
     */
    safeStopRecorder() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return false;

        this.mediaRecorder.stop();
        return true;
    }

    /**
     * Recovers from a recorder lifecycle failure and leaves the FSM in ERROR
     * whenever the current state has a legal error transition.
     *
     * @async
     * @method recoverFromRecorderError
     * @param {Error} error - Recorder lifecycle error
     * @param {Object} [session=this._activeRecordingSession] - Failed session
     * @returns {Promise<void>}
     */
    async recoverFromRecorderError(error, session = this._activeRecordingSession) {
        if (session?.failureHandled) return;
        if (session) session.failureHandled = true;

        const currentState = this.stateMachine.getState();
        if (currentState === RECORDING_STATES.RECORDING
            || currentState === RECORDING_STATES.PAUSED) {
            const transitioned = await this.stateMachine.transitionTo(RECORDING_STATES.STOPPING);
            if (transitioned) this.markVisualizationStopped(session);
        }

        this.stopVisualization(session);
        this.stopStreamTracks(session?.stream || this.activeStream);
        this.cleanup();

        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        let recoveryState = this.stateMachine.getState();
        if (recoveryState === RECORDING_STATES.CONFIRMING_DISCARD) {
            await this.stateMachine.transitionTo(RECORDING_STATES.CANCELLING);
            recoveryState = RECORDING_STATES.CANCELLING;
        }
        if (recoveryState === RECORDING_STATES.CANCELLING) {
            await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
        }
        if (this.stateMachine.canTransitionTo(RECORDING_STATES.ERROR)) {
            await this.stateMachine.transitionTo(RECORDING_STATES.ERROR, { error: errorMessage });
        }
    }

    /**
     * Stops every track in a media stream, even when one track rejects stop().
     *
     * @method stopStreamTracks
     * @param {MediaStream|null} stream - Stream whose tracks should stop
     * @returns {void}
     */
    stopStreamTracks(stream) {
        stream?.getTracks?.().forEach(track => {
            try {
                track.stop();
            } catch {
                // A failed track stop must not prevent cleanup of other tracks.
            }
        });
    }

    /**
     * Toggles the pause state of the recording, pausing or resuming as appropriate.
     * 
     * @async
     * @method togglePause
     * @returns {Promise<void>} Resolves when pause or resume operation completes
     */
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
    
    /**
     * Cancels the current recording, stops tracks, and resets state.
     * 
     * @method cancelRecording
     * @returns {void}
     */
    async cancelRecording() {
        if (this.stateMachine.canCancel()) {
            await this._teardownToCancelling();
        }
    }

    /**
     * Shared teardown: move to CANCELLING and stop the recorder; the recorder's
     * 'stop' handler then routes to IDLE + cleanup. Used by both the cancel path
     * and a confirmed discard, so the sequence lives in exactly one place.
     *
     * @async
     * @private
     * @method _teardownToCancelling
     * @returns {Promise<void>}
     */
    async _teardownToCancelling() {
        await this.stateMachine.transitionTo(RECORDING_STATES.CANCELLING);
        this.safeStopRecorder();
    }

    /**
     * Entry point for the Discard button. Applies the proportional-challenge
     * rule: trivial recordings (shorter than DISCARD_CONFIRM_MIN_MS) are discarded
     * instantly; substantial ones enter CONFIRMING_DISCARD so the dialog can name
     * the stakes before anything is lost.
     *
     * @async
     * @method requestDiscard
     * @returns {Promise<void>}
     */
    async requestDiscard() {
        if (!this.stateMachine.canCancel()) return;

        if (this.getTimerMilliseconds() < DISCARD_CONFIRM_MIN_MS) {
            // Trivial — nothing meaningful to lose, discard without challenge.
            await this.cancelRecording();
            return;
        }

        // Substantial — remember where to return, then surface the confirm.
        this._discardReturnTo = this.stateMachine.getState();
        await this.stateMachine.transitionTo(RECORDING_STATES.CONFIRMING_DISCARD, {
            durationLabel: this.currentTimerDisplay
        });
    }

    /**
     * Confirms a pending discard (from the dialog): tear the recording down.
     *
     * @async
     * @method confirmDiscard
     * @returns {Promise<void>}
     */
    async confirmDiscard() {
        if (this.stateMachine.getState() !== RECORDING_STATES.CONFIRMING_DISCARD) return;
        await this._teardownToCancelling();
    }

    /**
     * Keeps the recording (from the dialog): resume where the user left off.
     *
     * @async
     * @method keepRecording
     * @returns {Promise<void>}
     */
    async keepRecording() {
        if (this.stateMachine.getState() !== RECORDING_STATES.CONFIRMING_DISCARD) return;
        const target = this._discardReturnTo || RECORDING_STATES.RECORDING;
        this._discardReturnTo = null;
        await this.stateMachine.transitionTo(target);
    }

    /**
     * Calculates the elapsed recording time in milliseconds based on start time.
     * 
     * @method getTimerMilliseconds
     * @returns {number} The number of milliseconds since recording started
     */
    getTimerMilliseconds() {
        const parts = this.currentTimerDisplay.split(':');
    return (parseInt(parts[0]) * TIMER_CONFIG.MINUTE_MS) + (parseInt(parts[1]) * TIMER_CONFIG.SECOND_MS);
    }

    /**
     * Starts or restarts the recording timer, updating UI on each tick.
     * 
     * @method startTimer
     * @returns {void}
     */
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / TIMER_CONFIG.SECOND_MS) % 60;
            const minutes = Math.floor(elapsed / 60000);
            this.currentTimerDisplay = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
            eventBus.emit(APP_EVENTS.UI_TIMER_UPDATE, {
                display: this.currentTimerDisplay
            });
        }, TIMER_CONFIG.INTERVAL_MS);
    }
    
    /**
     * Processes recorded audio chunks and sends them to Azure API for transcription.
     * 
     * @async
     * @method processAndSendAudio
     * @param {MediaStream} stream - The original audio media stream
     * @param {string} recorderMimeType - MIME type selected by MediaRecorder
     * @returns {Promise<void>} Resolves when transcription is complete or error emitted
     */
    async processAndSendAudio(stream, recorderMimeType = '') {
        const chunkWithMimeType = this.audioChunks.find(chunk => chunk?.type);
        const audioBlob = new Blob(this.audioChunks, {
            type: recorderMimeType || chunkWithMimeType?.type || 'audio/webm'
        });
        this.pendingRetryBlob = audioBlob;

        const result = await this.sendToAzureAPI(audioBlob);
        this.stopStreamTracks(stream);
        this.audioChunks.length = 0;

        if (result.success) {
            this.pendingRetryBlob = null;
            this.pendingTranscriptionErrorCode = null;
            await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
        } else {
            this.pendingTranscriptionErrorCode = result.code ?? null;
            await this.stateMachine.transitionTo(RECORDING_STATES.ERROR, {
                error: result.error,
                canRetry: this._canRetryTranscription(result.code)
            });
        }
    }

    async retryPendingTranscription() {
        if (!this.pendingRetryBlob || this.stateMachine.getState() !== RECORDING_STATES.ERROR) {
            return;
        }

        const retryBlob = this.pendingRetryBlob;
        const enteredProcessing = await this.stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
        if (!enteredProcessing) {
            return;
        }

        const result = await this.sendToAzureAPI(retryBlob);
        if (result.success) {
            this.pendingRetryBlob = null;
            this.pendingTranscriptionErrorCode = null;
            this.audioChunks.length = 0;
            await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
            return;
        }

        this.pendingTranscriptionErrorCode = result.code ?? null;
        await this.stateMachine.transitionTo(RECORDING_STATES.ERROR, {
            error: result.error,
            canRetry: this._canRetryTranscription(result.code)
        });
    }

    _canRetryTranscription(errorCode) {
        const requiresExternalRecovery = errorCode === AUDIO_UPLOAD_LIMIT_ERROR_CODE
            || this._requiresAuthenticationRecovery(errorCode);
        return !requiresExternalRecovery && Boolean(this.pendingRetryBlob);
    }

    _requiresAuthenticationRecovery(errorCode) {
        return errorCode === API_ERROR_CODES.AUTHENTICATION_REQUIRED
            || errorCode === API_ERROR_CODES.AZURE_AUTHORIZATION_DENIED;
    }
    
    async sendToAzureAPI(audioBlob) {
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error(MESSAGES.CHECK_INTERNET_CONNECTION);
            }

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

            return { success: true };

        } catch (error) {
            const audioLogger = logger.child('AudioHandler');
            audioLogger.error('Transcription error:', error);
            this.cleanup();
            const rawMessage = error?.message || MESSAGES.ERROR_OCCURRED;
            const isNetworkError = error?.name === 'TypeError'
                || /network|failed to fetch|load failed/i.test(rawMessage);
            const errorMessage = isNetworkError && !/internet connection/i.test(rawMessage)
                ? `${rawMessage}. ${MESSAGES.CHECK_INTERNET_CONNECTION}`
                : rawMessage;
            // handleErrorState emits UI_STATUS_UPDATE with prefix + retry hint
            return { success: false, error: errorMessage, code: error?.code };
        }
    }
    
    /**
     * Cleans up MediaRecorder, audio chunks, and resets state for next recording.
     * 
     * @method cleanup
     * @returns {void}
     */
    cleanup() {
        // Called after audio has been processed to reset UI and state

        // Clear timer
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.currentTimerDisplay = TIMER_CONFIG.DEFAULT_DISPLAY;

        // Reset UI via events (control surface is re-rendered from the FSM state)
        eventBus.emit(APP_EVENTS.UI_TIMER_RESET);

        // Visualization cleanup is now handled by UI via event

        // Clear recording state
        this.audioChunks.length = 0;
        this.recordingStartTime = null;
        this.mediaRecorder = null;
        this.activeStream = null;
        this._activeRecordingSession = null;
    }

    /**
     * Removes event bus listeners to prevent leaks.
     * Call when the AudioHandler instance is no longer needed.
     *
     * @method destroy
     */
    destroy() {
        this._unsubscribers.forEach(unsub => unsub());
        this._unsubscribers = [];
        this.permissionManager.destroy();
    }
}
