export class AudioProcessor {
    constructor() {
        this.recordedChunks = [];
        this.silenceMap = [];
        this.currentSilenceStart = null;
        this.recordingStartTime = null;
        this.audioMonitor = null;
        this.silenceThreshold = 10; // Adjust based on your environment
    }
    
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
            
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
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