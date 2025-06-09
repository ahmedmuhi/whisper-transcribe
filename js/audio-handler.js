// js/audio-handler.js
export class AudioHandler {
    constructor(apiClient, ui, settings) {
        this.apiClient = apiClient;
        this.ui = ui;
        this.settings = settings;
        
        // Recording state
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.isCancelled = false;
        this.recordingStartTime = null;
        this.timerInterval = null;
        
        // Audio visualization
        this.visualizationController = null;
        
        this.setupEventListeners();
        this.checkBrowserSupport();
    }
    
    setupEventListeners() {
        // Mic button
        this.ui.micButton.addEventListener('click', () => this.toggleRecording());
        
        // Pause button
        this.ui.pauseButton.addEventListener('click', () => this.togglePause());
        
        // Cancel button
        this.ui.cancelButton.addEventListener('click', () => this.cancelRecording());
    }
    
    checkBrowserSupport() {
        if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.ui.setStatus('Your browser does not support audio recording.');
            this.ui.micButton.style.opacity = 0.5;
            this.ui.micButton.style.cursor = 'not-allowed';
            this.ui.micButton.disabled = true;
        }
    }
    
    async toggleRecording() {
        if (!this.isRecording) {
            try {
                // Validate configuration before starting
                this.apiClient.validateConfig();
                
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.startRecording(stream);
            } catch (err) {
                console.error('Error starting recording:', err);
                this.ui.showTemporaryStatus(err.message, 'error');
                
                if (err.message.includes('configure') || err.message.includes('API key') || err.message.includes('URI')) {
                    this.settings.openSettingsModal();
                }
            }
        } else {
            if (this.settings.getCurrentModel() === 'gpt-4o-transcribe') {
                this.ui.setStatus('Finishing...');
                this.gracefulStop();
            } else {
                this.stopRecording();
            }
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
            
            if (this.isCancelled) {
                this.ui.setStatus('Recording cancelled');
                stream.getTracks().forEach(t => t.stop());   // close here
                this.isCancelled = false;
                return;
            }
            
            await this.processAndSendAudio(stream);
        });
        
        this.mediaRecorder.start(100);
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.ui.setRecordingState(true);
        
        // Start timer
        this.startTimer();
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
    }
    
    async gracefulStop(delayMs = 700) {
        if (!this.mediaRecorder || !this.isRecording) return;
        
        // 1. Ask MediaRecorder to flush its internal buffer
        await new Promise(res => {
            this.mediaRecorder.addEventListener('dataavailable', res, { once: true });
            this.mediaRecorder.requestData();
        });
        
        // 2. Keep capturing a short tail of real silence
        await new Promise(res => setTimeout(res, delayMs));
        
        // 3. Stop recording
        this.mediaRecorder.stop();
        this.isRecording = false;
    }
    
    togglePause() {
        if (!this.isRecording) return;
        
        if (!this.isPaused) {
            this.mediaRecorder.pause();
            clearInterval(this.timerInterval);
            this.ui.setPauseState(true);
            this.isPaused = true;
        } else {
            this.mediaRecorder.resume();
            
            // Resume timer from where it left off
            const pausedTime = this.getTimerMilliseconds();
            this.recordingStartTime = Date.now() - pausedTime;
            this.startTimer();
            
            this.ui.setPauseState(false);
            this.ui.setStatus('Recording... Click again to stop');
            this.isPaused = false;
        }
    }
    
    cancelRecording() {
        if (this.isRecording) {
            this.isCancelled = true;
            this.stopRecording();
        }
    }
    
    async processAndSendAudio(stream) {
        this.ui.setStatus('Processing audio...');
        
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        await this.sendToAzureAPI(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        
        // Clear the array to free memory
        this.audioChunks.length = 0;
    }
    
    async sendToAzureAPI(audioBlob) {
        this.ui.showSpinner();
        
        try {
            const transcriptionText = await this.apiClient.transcribe(audioBlob, (statusMessage) => {
                this.ui.setStatus(statusMessage);
            });
            
            this.ui.displayTranscription(transcriptionText);
            this.ui.showTemporaryStatus('Transcription complete', 'success');
            
        } catch (error) {
            console.error('Transcription error:', error);
            this.ui.showTemporaryStatus(`Error: ${error.message}`, 'error');
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
                
                canvasCtx.fillStyle = isDarkTheme ? '#0f172a' : '#f8fafc';
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
                    canvasCtx.fillStyle = isDarkTheme ? '#0f172a' : '#f8fafc';
                    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
                }
            };
        } catch (error) {
            console.error('Error setting up audio visualization:', error);
            return null;
        }
    }
}
