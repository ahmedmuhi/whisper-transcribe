import { showTemporaryStatus } from './status-helper.js';

export class PermissionManager {
    constructor(ui) {
        this.ui = ui;
        this.permissionStatus = null;
        this.microphoneStream = null;
    }
    
    /**
     * Check if the browser supports the required APIs
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
            console.log('Permissions API not available or error:', error);
        }
        
        // Fallback: we don't know the status
        return null;
    }
    
    /**
     * Request microphone access and handle all possible outcomes
     * @returns {Promise<MediaStream|null>} The audio stream or null if failed
     */
    async requestMicrophoneAccess() {
        try {
            // First check browser support
            if (!PermissionManager.checkBrowserSupport()) {
                this.ui.setStatus('Your browser does not support audio recording.');
                this.ui.disableMicButton();
                return null;
            }
            
            // Check current permission status
            const currentStatus = await this.getPermissionStatus();
            console.log('Current permission status:', currentStatus);
            
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
            this.ui.enableMicButton();
            showTemporaryStatus(this.ui.statusElement, 'Microphone access granted', 'success');
            
            return stream;
            
        } catch (error) {
            return this.handlePermissionError(error);
        }
    }
    
    /**
     * Handle various permission errors with specific messages
     * @param {Error} error The error from getUserMedia
     * @returns {null} Always returns null to indicate failure
     */
    handlePermissionError(error) {
        console.error('Permission error:', error);
        
        let message = '';
        let shouldDisableButton = true;
        
        switch (error.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                message = '🚫 Microphone permission denied. Please allow microphone access in your browser settings.';
                break;
                
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                message = '🎤 No microphone found. Please connect a microphone and try again.';
                break;
                
            case 'NotReadableError':
            case 'TrackStartError':
                message = '⚠️ Microphone is already in use by another application.';
                break;
                
            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
                message = '⚠️ No microphone meets the requirements. Try with a different microphone.';
                break;
                
            case 'TypeError':
                message = '❌ Invalid request. Please check your browser settings.';
                break;
                
            default:
                message = `❌ Error accessing microphone: ${error.message}`;
        }
        
        this.ui.setStatus(message);
        
        if (shouldDisableButton) {
            this.ui.disableMicButton();
        }
        
        return null;
    }
    
    /**
     * Handle permission state changes
     * @param {PermissionState} state The new permission state
     */
    handlePermissionChange(state) {
        console.log('Permission state changed to:', state);
        
        switch (state) {
            case 'granted':
                // Re-check all prerequisites when permission is granted
                this.ui.checkRecordingPrerequisites();
                break;
                
            case 'denied':
                this.ui.setStatus('🚫 Microphone permission denied');
                this.ui.disableMicButton();
                break;
                
            case 'prompt':
                // User closed the permission dialog without choosing
                this.ui.setStatus('🎤 Click the microphone to request access');
                break;
        }
    }
    
    /**
     * Stop and clean up the microphone stream
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
                instructions = 'Click the camera icon in the address bar and allow microphone access.';
            } else if (userAgent.includes('firefox')) {
                instructions = 'Click the microphone icon in the address bar and allow access.';
            } else if (userAgent.includes('safari')) {
                instructions = 'Go to Safari > Settings > Websites > Microphone and allow access.';
            } else {
                instructions = 'Check your browser settings to allow microphone access for this site.';
            }
            
            this.ui.setStatus(`🚫 ${instructions}`);
            return null;
        }
        
        // Try requesting again
        return this.requestMicrophoneAccess();
    }
}