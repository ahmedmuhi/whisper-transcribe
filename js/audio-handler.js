// js/audio-handler.js
import { showTemporaryStatus } from './status-helper.js';
import { COLORS, RECORDING_STATES } from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { RecordingStateMachine } from './recording-state-machine.js';

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
        
        // Listen to state changes
        this.stateMachine.onStateChange((newState, oldState) => {
            console.log(`Recording state changed: ${oldState} → ${newState}`);
        });
        
        this.setupEventListeners();
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
        } else if (this.stateMachine.canStop()) {
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
            
            // Show temporary error status
            showTemporaryStatus(this.ui.statusElement, err.message, 'error');
            
            if (err.message.includes('configure') || err.message.includes('API key') || err.message.includes('URI')) {
                this.settings.openSettingsModal();
            }
            
            // Return to idle after error
            setTimeout(() => {
                this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
            }, 3000);
        }
    }
    
    async stopRecordingFlow() {
        if (this.settings.getCurrentModel() === 'gpt-4o-transcribe') {
            await this.stateMachine.transitionTo(RECORDING_STATES.STOPPING);
            this.gracefulStop();
        } else {
            await this.stateMachine.transitionTo(RECORDING_STATES.STOPPING);
            this.stopRecording();
        }
    }
    
    startRecording(stream) {
        this.audioChunks = [];
        
        this.mediaRecorder = new MediaRecorder(stream);
        
        // Setup visualization
        const visualizer = document.getElementById('visualizer');
        const isDarkTheme = document.body.classList.contains('dark-theme');
        this.visualizationController = this.setupVisualization(stream, visualizer, isDarkTheme);
        
        this.mediaRecorder.addEventListener('dataavailable', event => {
            this.audioChunks.push(event.data);
        });
        
        this.mediaRecorder.addEventListener('stop', async () => {
            this.cleanup();
            
            if (this.stateMachine.getState() === RECORDING_STATES.CANCELLING) {
                stream.getTracks().forEach(t => t.stop());
                await this.stateMachine.transitionTo(RECORDING_STATES.IDLE);
                return;
            }
            
            // Transition to processing
            await this.stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
            await this.processAndSendAudio(stream);
        });
        
        this.mediaRecorder.start(250);
        this.recordingStartTime = Date.now();
        
        // Start timer
        this.startTimer();
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.stateMachine.canStop()) {
            this.mediaRecorder.stop();
        }
    }
    
    async gracefulStop(delayMs = 800) {
        if (!this.mediaRecorder || !this.stateMachine.canStop()) return;
        
        // 1. Keep capturing a short tail to ensure complete audio including the tail
        await new Promise(res => setTimeout(res, delayMs));
        
        // 2. Ask MediaRecorder to flush its internal buffer
        await new Promise(res => {
            this.mediaRecorder.addEventListener('dataavailable', res, { once: true });
            this.mediaRecorder.requestData();
        });
        
        // 3. Stop recording
        this.mediaRecorder.stop();
    }
    
    async togglePause() {
        if (this.stateMachine.canPause()) {
            this.mediaRecorder.pause();
            clearInterval(this.timerInterval);
            await this.stateMachine.transitionTo(RECORDING_STATES.PAUSED);
        } else if (this.stateMachine.canResume()) {
            this.mediaRecorder.resume();
            
            // Resume timer from where it left off
            const pausedTime = this.getTimerMilliseconds();
            this.recordingStartTime = Date.now() - pausedTime;
            this.startTimer();
            
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
                this.ui.setStatus(statusMessage);
            });
            
            this.ui.displayTranscription(transcriptionText);
            showTemporaryStatus(this.ui.statusElement, 'Transcription complete', 'success');
            
        } catch (error) {
            console.error('Transcription error:', error);
            showTemporaryStatus(this.ui.statusElement, `Error: ${error.message}`, 'error');
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
        clearInterval(this.timerInterval);
        this.ui.updateTimer('00:00');
        this.ui.setRecordingState(false);
        this.ui.setPauseState(false);
        this.isPaused = false;
        
        // Stop visualization
        if (this.visualizationController) {
            this.visualizationController.stop();
            this.visualizationController = null;
        }
    }
    
    // Audio visualization setup
    setupVisualization(stream, canvas, isDarkTheme) {
        try {
            const canvasCtx = canvas.getContext('2d');
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            source.connect(analyser);
            
            // Ensure canvas fills container properly
            const updateCanvasSize = () => {
                canvas.width = canvas.parentElement.offsetWidth;
                canvas.height = canvas.parentElement.offsetHeight;
            };
            
            updateCanvasSize();
            
            // Store the reference so we can remove it later
            const resizeHandler = updateCanvasSize;
            window.addEventListener('resize', resizeHandler);
            
            let animationId;
            
            function draw() {
                animationId = requestAnimationFrame(draw);
                
                analyser.getByteFrequencyData(dataArray);
                
                canvasCtx.fillStyle = isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
                canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
                
                const barWidth = (canvas.width / bufferLength) * 2.5;
                let barHeight;
                let x = 0;
                
                for (let i = 0; i < bufferLength; i++) {
                    barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
                    
                    const hue = (i / bufferLength) * 360;
                    canvasCtx.fillStyle = `hsl(${hue}, 70%, 60%)`;
                    canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                    
                    x += barWidth + 1;
                }
            }
            
            draw();
            
            return {
                audioContext,
                analyser,
                source,
                animationId,
                stop: () => {
                    if (animationId) {
                        cancelAnimationFrame(animationId);
                    }
                    
                    // Remove resize listener
                    window.removeEventListener('resize', resizeHandler);
                    
                    if (source) {
                        try {
                            source.disconnect();
                        } catch (e) {
                            console.log('Source already disconnected');
                        }
                    }
                    
                    if (audioContext && audioContext.state !== 'closed') {
                        try {
                            audioContext.close();
                        } catch (e) {
                            console.log('AudioContext already closed');
                        }
                    }
                    
                    // Clear the canvas
                    canvasCtx.fillStyle = isDarkTheme ? COLORS.DARK_BG : COLORS.LIGHT_BG;
                    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
                }
            };
        } catch (error) {
            console.error('Error setting up audio visualization:', error);
            return null;
        }
    }
}
