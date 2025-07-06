import { MESSAGES, DEFAULT_RESET_STATUS } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';
import { errorHandler } from './error-handler.js';

/**
 * Manages microphone permission requests and status notifications.
 * Uses browser Permissions API and MediaDevices to handle access flows.
 * @module PermissionManager
 */
export class PermissionManager {
    constructor(ui) {
        this.ui = ui;
        this.permissionStatus = null;
        this.microphoneStream = null;
    }
    
    /**
     * Check if the browser supports the required APIs
     */
    /**
     * Check if the browser supports MediaRecorder and getUserMedia APIs.
     * @static
     * @method checkBrowserSupport
     * @returns {boolean} True if required APIs are available
     */
    static checkBrowserSupport() {
        return !!(window.MediaRecorder &&
                 navigator.mediaDevices &&
                 navigator.mediaDevices.getUserMedia);
    }
    
    /**
     * Get the current microphone permission status
     * @returns {Promise<PermissionState>} 'granted', 'denied', 'prompt', or null
     */
    /**
     * Retrieves current microphone permission status via Permissions API.
     * @async
     * @method getPermissionStatus
     * @returns {Promise<string|null>} 'granted', 'denied', 'prompt', or null if unavailable
     */
    async getPermissionStatus() {
        try {
            // Check if Permissions API is available
            if ('permissions' in navigator) {
                const result = await navigator.permissions.query({ name: 'microphone' });
                this.permissionStatus = result.state;
                
                // Listen for permission changes
                result.addEventListener('change', () => {
                    this.permissionStatus = result.state;
                    this.handlePermissionChange(result.state);
                });
                
                return result.state;
            }
        } catch (error) {
            const permLogger = logger.child('PermissionManager');
            permLogger.debug('Permissions API not available or error:', error);
        }
        
        // Fallback: we don't know the status
        return null;
    }
    
    /**
     * Request microphone access and handle all possible outcomes
     * @returns {Promise<MediaStream|null>} The audio stream or null if failed
     */
    /**
     * Requests microphone access, emits events for success or errors.
     * @async
     * @method requestMicrophoneAccess
     * @returns {Promise<MediaStream|null>} The media stream if granted, otherwise null
     */
    async requestMicrophoneAccess() {
        try {
            // First check browser support
            if (!PermissionManager.checkBrowserSupport()) {
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.BROWSER_NOT_SUPPORTED,
                    type: 'error'
                });
                eventBus.emit(APP_EVENTS.PERMISSION_ERROR, {
                    error: 'Browser not supported'
                });
                return null;
            }
            
            // Check current permission status
            const currentStatus = await this.getPermissionStatus();
            const permLogger = logger.child('PermissionManager');
            permLogger.debug('Current permission status:', currentStatus);
            
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                } 
            });
            
            this.microphoneStream = stream;
            
            // Permission was granted
            eventBus.emit(APP_EVENTS.PERMISSION_GRANTED);
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.MICROPHONE_ACCESS_GRANTED,
                type: 'success',
                temporary: true
            });
            
            return stream;
            
        } catch (error) {
            // Standardized error handling
            errorHandler.handleError(error, { module: 'PermissionManager' });
            return this.handlePermissionError(error);
        }
    }
    
    /**
     * Handle various permission errors with specific messages
     * @param {Error} error The error from getUserMedia
     * @returns {null} Always returns null to indicate failure
     */
    /**
     * Handles errors from getUserMedia and emits appropriate UI events.
     * @method handlePermissionError
     * @param {Error} error - Error thrown by getUserMedia
     * @returns {null}
     */
    handlePermissionError(error) {
        const permLogger = logger.child('PermissionManager');
        permLogger.error('Permission error:', error);
        
        let message = '';
        let eventData = { error: error.name, message: error.message };
        
        switch (error.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                // Provide browser-specific instructions for Chrome
                if (navigator.userAgent.includes('Chrome')) {
                    message = MESSAGES.PERMISSION_CHROME;
                } else {
                    message = MESSAGES.PERMISSION_DENIED;
                }
                eventBus.emit(APP_EVENTS.PERMISSION_DENIED, eventData);
                break;
                
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                message = MESSAGES.NO_MICROPHONE;
                break;
                
            case 'NotReadableError':
            case 'TrackStartError':
                message = MESSAGES.MICROPHONE_IN_USE;
                break;
                
            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
                message = MESSAGES.MICROPHONE_NOT_SUITABLE;
                break;
                
            case 'TypeError':
                message = MESSAGES.INVALID_REQUEST;
                break;
                
            default:
                message = `${MESSAGES.MICROPHONE_ERROR_PREFIX}${error.message}`;
        }
        
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message,
            type: 'error'
        });
        
        eventBus.emit(APP_EVENTS.PERMISSION_ERROR, {
            ...eventData,
            userMessage: message
        });
        
        return null;
    }
    
    /**
     * Handle permission state changes
     * @param {PermissionState} state The new permission state
     */
    /**
     * Reacts to permission status changes and emits events accordingly.
     * @method handlePermissionChange
     * @param {string} state - New permission state ('granted', 'denied', 'prompt')
     */
    handlePermissionChange(state) {
        const permLogger = logger.child('PermissionManager');
        permLogger.info('Permission state changed to:', state);
        
        eventBus.emit(APP_EVENTS.PERMISSION_STATUS_CHANGED, { state });
        
        switch (state) {
            case 'granted':
                eventBus.emit(APP_EVENTS.PERMISSION_GRANTED);
                break;
                
            case 'denied':
                eventBus.emit(APP_EVENTS.PERMISSION_DENIED);
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.PERMISSION_DENIED,
                    type: 'error'
                });
                break;
                
            case 'prompt':
                // User closed the permission dialog without choosing
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: DEFAULT_RESET_STATUS,
                    type: 'info'
                });
                break;
        }
    }
    
    /**
     * Stop and clean up the microphone stream
     */
    /**
     * Stops all tracks on the active microphone MediaStream.
     * @method stopMicrophoneStream
     * @returns {void}
     */
    stopMicrophoneStream() {
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => {
                track.stop();
            });
            this.microphoneStream = null;
        }
    }
    
    /**
     * Check if we currently have an active microphone stream
     * @returns {boolean}
     */
    hasActiveStream() {
        return this.microphoneStream !== null && 
               this.microphoneStream.active &&
               this.microphoneStream.getTracks().some(track => track.readyState === 'live');
    }
    
    /**
     * Re-request permissions after they were denied
     * This provides instructions to the user
     */
    async retryPermissionRequest() {
        const status = await this.getPermissionStatus();
        
        if (status === 'denied') {
            // Show instructions for different browsers
            const userAgent = navigator.userAgent.toLowerCase();
            let instructions = '';
            
            if (userAgent.includes('chrome') || userAgent.includes('edge')) {
                instructions = MESSAGES.PERMISSION_CHROME;
            } else if (userAgent.includes('firefox')) {
                instructions = MESSAGES.PERMISSION_FIREFOX;
            } else if (userAgent.includes('safari')) {
                instructions = MESSAGES.PERMISSION_SAFARI;
            } else {
                instructions = MESSAGES.PERMISSION_DEFAULT;
            }
            
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: `🚫 ${instructions}`,
                type: 'error'
            });
            
            return null;
        }
        
        // Try requesting again
        return this.requestMicrophoneAccess();
    }
}