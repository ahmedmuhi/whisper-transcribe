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
        
        // Audio processing state
        this.recordedChunks = [];
        this.silenceMap = [];
        this.currentSilenceStart = null;
        this.audioMonitor = null;
        this.silenceThreshold = 10; // Adjust based on your environment
        
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
            this.stopRecording();
        }
    }
    
    startRecording(stream) {
        this.audioChunks = [];
        this.reset();
        
        this.mediaRecorder = new MediaRecorder(stream);
        
        // Setup visualization
        const visualizer = document.getElementById('visualizer');
        const isDarkTheme = document.body.classList.contains('dark-theme');
        this.visualizationController = this.setupVisualization(stream, visualizer, isDarkTheme);
        
        // Setup silence tracking for GPT-4o
        if (this.settings.getCurrentModel() === 'gpt-4o-transcribe') {
            this.setupSilenceTracking(stream, (totalSilence) => {
                const savedSeconds = (totalSilence / 1000).toFixed(1);
                this.ui.setStatusHTML(`🔴 Recording... <span style="color: #666;">(${savedSeconds}s silence will be trimmed)</span>`);
            });
        }
        
        this.mediaRecorder.addEventListener('dataavailable', event => {
            this.audioChunks.push(event.data);
            
            // Add chunk to audio processor for GPT-4o
            if (this.settings.getCurrentModel() === 'gpt-4o-transcribe' && event.data.size > 0) {
                const chunkTime = performance.now() - this.recordingStartTime;
                this.addChunk(event.data, chunkTime);
            }
        });
        
        this.mediaRecorder.addEventListener('stop', async () => {
            this.cleanup();
            
            if (this.isCancelled) {
                this.ui.setStatus('Recording cancelled');
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
        
        const config = this.settings.getModelConfig();
        
        // Show silence removal status if applicable
        if (config.model === 'gpt-4o-transcribe' && config.silenceRemoval !== 'off') {
            const totalSilence = this.getTotalSilence();
            if (totalSilence > 0) {
                this.ui.setStatus(`Removing ${(totalSilence/1000).toFixed(1)}s of silence...`);
            }
        }
        
        // Process audio using AudioProcessor
        const audioBlob = await this.processAudio(
            this.audioChunks, 
            config.model, 
            config.silenceRemoval
        );
        
        await this.sendToAzureAPI(audioBlob);
        stream.getTracks().forEach(track => track.stop());
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
        
        // Stop silence tracking
        this.stopSilenceTracking();
    }
    
    // ========== AUDIO PROCESSING METHODS (from AudioProcessor) ==========
    
    reset() {
        this.recordedChunks = [];
        this.silenceMap = [];
        this.currentSilenceStart = null;
        this.recordingStartTime = performance.now();
    }
    
    addChunk(blob, timestamp) {
        if (blob.size > 0) {
            this.recordedChunks.push({
                blob: blob,
                startMs: timestamp - 100,
                endMs: timestamp
            });
        }
    }
    
    setupSilenceTracking(stream, onSilenceUpdate) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(2048, 1, 1);
        
        analyser.smoothingTimeConstant = 0.3;
        analyser.fftSize = 256;
        
        microphone.connect(analyser);
        analyser.connect(processor);
        processor.connect(audioContext.destination);
        
        processor.onaudioprocess = (e) => {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            
            // Calculate average volume
            const average = array.reduce((a, b) => a + b) / array.length;
            const currentTime = performance.now() - this.recordingStartTime;
            
            if (average < this.silenceThreshold) {
                // In silence
                if (!this.currentSilenceStart) {
                    this.currentSilenceStart = currentTime;
                }
            } else {
                // Not silence
                if (this.currentSilenceStart) {
                    const silenceDuration = currentTime - this.currentSilenceStart;
                    if (silenceDuration > 3000) { // Only track >3 second silences
                        this.silenceMap.push({
                            start: this.currentSilenceStart,
                            end: currentTime,
                            duration: silenceDuration
                        });
                        console.log(`Detected ${(silenceDuration/1000).toFixed(1)}s silence`);
                        
                        // Notify about total silence
                        if (onSilenceUpdate) {
                            const totalSilence = this.silenceMap.reduce((sum, s) => sum + s.duration, 0);
                            onSilenceUpdate(totalSilence);
                        }
                    }
                    this.currentSilenceStart = null;
                }
            }
        };
        
        this.audioMonitor = { audioContext, processor, analyser };
    }
    
    stopSilenceTracking() {
        if (this.audioMonitor) {
            this.audioMonitor.processor.disconnect();
            this.audioMonitor.analyser.disconnect();
            this.audioMonitor.audioContext.close();
            this.audioMonitor = null;
        }
    }
    
    async processAudio(audioChunks, model, silenceRemoval) {
        if (model !== 'gpt-4o-transcribe' || silenceRemoval === 'off' || this.silenceMap.length === 0) {
            // No processing needed
            return new Blob(audioChunks, { type: 'audio/webm' });
        }
        
        // Remove silence for GPT-4o
        const totalSilence = this.silenceMap.reduce((sum, s) => sum + s.duration, 0);
        console.log(`Processing: removing ${(totalSilence/1000).toFixed(1)}s of silence`);
        
        // Filter out silent chunks
        const filteredChunks = this.recordedChunks.filter(chunk => {
            const chunkMidpoint = (chunk.startMs + chunk.endMs) / 2;
            
            for (const silence of this.silenceMap) {
                const silenceStart = silence.start + 100; // Add buffer
                const silenceEnd = silence.end - 100;
                
                if (chunkMidpoint > silenceStart && chunkMidpoint < silenceEnd) {
                    return false; // Skip this chunk
                }
            }
            return true; // Keep this chunk
        });
        
        // Create blob from filtered chunks
        const blobs = filteredChunks.map(chunk => chunk.blob);
        console.log(`Removed ${this.recordedChunks.length - filteredChunks.length} silent chunks`);
        
        return new Blob(blobs, { type: 'audio/webm' });
    }
    
    getTotalSilence() {
        return this.silenceMap.reduce((sum, s) => sum + s.duration, 0);
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
            
            // Handle resize
            window.addEventListener('resize', updateCanvasSize);
            
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
                    window.removeEventListener('resize', updateCanvasSize);
                    
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
    
    // Helper method to update silence threshold
    setSilenceThreshold(threshold) {
        this.silenceThreshold = threshold;
    }
    
    // Get silence statistics
    getSilenceStats() {
        const totalSilence = this.getTotalSilence();
        const silenceCount = this.silenceMap.length;
        const averageSilenceDuration = silenceCount > 0 ? totalSilence / silenceCount : 0;
        
        return {
            totalSilence,
            silenceCount,
            averageSilenceDuration,
            silencePercentage: 0 // Will be calculated when we know total recording time
        };
    }
}
