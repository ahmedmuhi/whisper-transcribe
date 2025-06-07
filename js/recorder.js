// js/recorder.js
export class AudioRecorder {
    constructor(audioProcessor, apiClient, ui, settings) {
        this.audioProcessor = audioProcessor;
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
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.animationId = null;
        this.canvasCtx = this.ui.visualizer.getContext('2d');
        
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
            // Check if settings are configured
            const config = this.settings.getModelConfig();
            if (!config.apiKey || !config.uri) {
                this.ui.showTemporaryStatus('Please configure Azure OpenAI settings', 'error');
                this.ui.openSettingsModal();
                return;
            }
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.startRecording(stream);
            } catch (err) {
                console.error('Error accessing microphone:', err);
                this.ui.showTemporaryStatus('Error accessing microphone. Please check permissions.', 'error');
            }
        } else {
            this.stopRecording();
        }
    }
    
    startRecording(stream) {
        this.audioChunks = [];
        this.audioProcessor.reset();
        
        this.mediaRecorder = new MediaRecorder(stream);
        this.setupAudioVisualization(stream);
        
        // Add silence tracking for GPT-4o
        const model = this.settings.getCurrentModel();
        if (model === 'gpt-4o-transcribe') {
            this.audioProcessor.setupSilenceTracking(stream, (totalSilence) => {
                const savedSeconds = (totalSilence / 1000).toFixed(1);
                this.ui.setStatusHTML(`🔴 Recording... <span style="color: #666;">(${savedSeconds}s silence will be trimmed)</span>`);
            });
        }
        
        this.mediaRecorder.addEventListener('dataavailable', event => {
            this.audioChunks.push(event.data);
            
            // Track chunks for GPT-4o
            if (model === 'gpt-4o-transcribe') {
                const chunkTime = performance.now() - this.audioProcessor.recordingStartTime;
                this.audioProcessor.addChunk(event.data, chunkTime);
            }
        });
        
        this.mediaRecorder.addEventListener('stop', async () => {
            this.cleanup();
            
            if (this.isCancelled) {
                this.ui.setStatus('Recording cancelled');
                this.isCancelled = false;
                return;
            }
            
            await this.processAndTranscribe(stream);
        });
        
        this.mediaRecorder.start(100); // 100ms chunks
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
    
    async processAndTranscribe(stream) {
        this.ui.setStatus('Processing audio...');
        
        const config = this.settings.getModelConfig();
        let audioBlob;
        
        // Process audio based on model and settings
        if (config.model === 'gpt-4o-transcribe' && config.silenceRemoval !== 'off') {
            const totalSilence = this.audioProcessor.getTotalSilence();
            if (totalSilence > 0) {
                this.ui.setStatus(`Removing ${(totalSilence/1000).toFixed(1)}s of silence...`);
            }
        }
        
        audioBlob = await this.audioProcessor.processAudio(
            this.audioChunks, 
            config.model, 
            config.silenceRemoval
        );
        
        try {
            this.ui.showSpinner();
            const transcription = await this.apiClient.transcribe(
                audioBlob,
                (status) => this.ui.setStatus(status)
            );
            
            this.ui.displayTranscription(transcription);
            this.ui.showTemporaryStatus('Transcription complete', 'success');
        } catch (error) {
            this.ui.showTemporaryStatus(`Error: ${error.message}`, 'error');
            if (error.message.includes('configure settings')) {
                this.ui.openSettingsModal();
            }
        } finally {
            this.ui.hideSpinner();
            stream.getTracks().forEach(track => track.stop());
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
        this.stopVisualization();
        this.audioProcessor.stopSilenceTracking();
    }
    
    setupAudioVisualization(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.source = this.audioContext.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        this.analyser.fftSize = 128;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        this.ui.visualizer.width = this.ui.visualizer.clientWidth;
        this.ui.visualizer.height = this.ui.visualizer.clientHeight;
        this.canvasCtx.clearRect(0, 0, this.ui.visualizer.width, this.ui.visualizer.height);
        
        const draw = () => {
            this.animationId = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            this.canvasCtx.clearRect(0, 0, this.ui.visualizer.width, this.ui.visualizer.height);
            
            const barWidth = (this.ui.visualizer.width / bufferLength) * 0.8;
            const barSpacing = (this.ui.visualizer.width / bufferLength) * 0.2;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * this.ui.visualizer.height;
                const grayValue = 150 + Math.floor((dataArray[i] / 255) * 100);
                this.canvasCtx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
                this.canvasCtx.fillRect(x, this.ui.visualizer.height - barHeight, barWidth, barHeight);
                x += barWidth + barSpacing;
            }
        };
        
        draw();
    }
    
    stopVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.audioContext && this.source) {
            this.source.disconnect();
            this.canvasCtx.clearRect(0, 0, this.ui.visualizer.width, this.ui.visualizer.height);
        }
    }
}