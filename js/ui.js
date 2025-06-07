export class UI {
    constructor() {
        // Get all DOM elements
        this.micButton = document.getElementById('mic-button');
        this.statusElement = document.getElementById('status');
        this.transcriptElement = document.getElementById('transcript');
        this.clearButton = document.getElementById('clear-button');
        this.copyButton = document.getElementById('copy-button');
        this.cutButton = document.getElementById('cut-button');
        this.settingsButton = document.getElementById('settings-button');
        this.themeToggle = document.getElementById('theme-toggle');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeModalButton = document.getElementById('close-modal');
        this.saveSettingsButton = document.getElementById('save-settings');
        this.pauseButton = document.getElementById('pause-button');
        this.cancelButton = document.getElementById('cancel-button');
        this.timerElement = document.getElementById('timer');
        this.spinnerContainer = document.getElementById('spinner-container');
        this.visualizer = document.getElementById('visualizer');
        
        // Icons
        this.pauseIcon = document.getElementById('pause-icon');
        this.playIcon = document.getElementById('play-icon');
        this.moonIcon = document.getElementById('moon-icon');
        this.sunIcon = document.getElementById('sun-icon');
    }
    
    init(settings, recorder) {
        this.settings = settings;
        this.recorder = recorder;
        
        // Set initial status
        this.setStatus('🎙️ Click the microphone to start recording');
        
        // Load theme
        this.loadTheme();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check browser support
        this.checkBrowserSupport();
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            this.moonIcon.style.display = 'none';
            this.sunIcon.style.display = 'block';
        }
    }
    
    checkBrowserSupport() {
        // Check if browser supports required APIs
        if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.setStatus('Your browser does not support audio recording.');
            this.micButton.style.opacity = 0.5;
            this.micButton.style.cursor = 'not-allowed';
            this.micButton.disabled = true;
        }
    }
    
    setupEventListeners() {
        // Theme toggle
        this.themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDarkTheme = document.body.classList.contains('dark-theme');
            this.moonIcon.style.display = isDarkTheme ? 'none' : 'block';
            this.sunIcon.style.display = isDarkTheme ? 'block' : 'none';
            localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
            
            // Update canvas background if needed
            if (this.visualizer) {
                const canvasCtx = this.visualizer.getContext('2d');
                if (canvasCtx) {
                    canvasCtx.fillStyle = isDarkTheme ? '#0f172a' : '#f8fafc';
                    canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);
                }
            }
        });
        
        // Transcript buttons
        this.clearButton.addEventListener('click', () => {
            this.transcriptElement.value = '';
            this.showTemporaryStatus('Transcription cleared', 'success');
        });
        
        this.copyButton.addEventListener('click', () => {
            const text = this.transcriptElement.value;
            if (text) {
                navigator.clipboard.writeText(text)
                    .then(() => this.showTemporaryStatus('Text copied to clipboard', 'success'))
                    .catch(() => this.showTemporaryStatus('Failed to copy text', 'error'));
            } else {
                this.showTemporaryStatus('No text to copy', 'error');
            }
        });
        
        this.cutButton.addEventListener('click', () => {
            const text = this.transcriptElement.value;
            if (text) {
                navigator.clipboard.writeText(text)
                    .then(() => {
                        this.transcriptElement.value = '';
                        this.showTemporaryStatus('Text cut to clipboard', 'success');
                    })
                    .catch(() => this.showTemporaryStatus('Failed to cut text', 'error'));
            } else {
                this.showTemporaryStatus('No text to cut', 'error');
            }
        });
        
        // Recording control buttons
        this.pauseButton.addEventListener('click', () => {
            if (this.recorder) {
                this.recorder.togglePause();
            }
        });
        
        this.cancelButton.addEventListener('click', () => {
            if (this.recorder) {
                this.recorder.cancelRecording();
            }
        });
        
        // Main recording button
        this.micButton.addEventListener('click', async () => {
            if (this.recorder) {
                await this.recorder.toggleRecording();
            }
        });
    }
    
    setStatus(message) {
        this.statusElement.textContent = message;
        this.statusElement.style.color = '';
    }
    
    setStatusHTML(html) {
        this.statusElement.innerHTML = html;
    }
    
    showTemporaryStatus(message, type = 'info', duration = 3000) {
        this.statusElement.textContent = message;
        
        if (type === 'error') {
            this.statusElement.style.color = '#dc2626';
        } else if (type === 'success') {
            this.statusElement.style.color = '#16a34a';
        } else {
            this.statusElement.style.color = '';
        }
        
        if (duration > 0) {
            setTimeout(() => {
                this.setStatus('🎙️ Click the microphone to start recording');
                this.statusElement.style.color = '';
            }, duration);
        }
    }
    
    displayTranscription(text) {
        if (this.transcriptElement.value) {
            this.transcriptElement.value += '\n\n' + (text || 'No transcription returned');
        } else {
            this.transcriptElement.value = text || 'No transcription returned';
        }
        
        this.transcriptElement.focus();
        this.transcriptElement.selectionStart = this.transcriptElement.value.length;
        this.transcriptElement.selectionEnd = this.transcriptElement.value.length;
    }
    
    updateTimer(timeString) {
        this.timerElement.textContent = timeString;
    }
    
    showSpinner() {
        this.spinnerContainer.style.display = 'block';
    }
    
    hideSpinner() {
        this.spinnerContainer.style.display = 'none';
    }
    
    setRecordingState(isRecording) {
        if (isRecording) {
            this.micButton.classList.add('recording');
            this.setStatus('Recording... Click again to stop');
        } else {
            this.micButton.classList.remove('recording');
        }
    }
    
    setPauseState(isPaused) {
        if (isPaused) {
            this.pauseIcon.style.display = 'none';
            this.playIcon.style.display = 'block';
            this.pauseButton.setAttribute('aria-label', 'Resume');
            this.setStatus('Recording paused');
        } else {
            this.pauseIcon.style.display = 'block';
            this.playIcon.style.display = 'none';
            this.pauseButton.setAttribute('aria-label', 'Pause');
        }
    }
    
    resetControlsAfterRecording() {
        this.updateTimer('00:00');
        this.setRecordingState(false);
        this.setPauseState(false);
    }
    
    enableMicButton() {
        this.micButton.disabled = false;
        this.micButton.style.opacity = 1;
        this.micButton.style.cursor = 'pointer';
    }
    
    disableMicButton() {
        this.micButton.disabled = true;
        this.micButton.style.opacity = 0.5;
        this.micButton.style.cursor = 'not-allowed';
    }
    
    // Settings-related UI methods (we'll move these to settings module later)
    openSettingsModal() {
        if (this.settings) {
            this.settings.openSettingsModal();
        }
    }
    
    // Visualization helper (for canvas clearing)
    clearVisualization() {
        if (this.visualizer) {
            const canvasCtx = this.visualizer.getContext('2d');
            const isDarkTheme = document.body.classList.contains('dark-theme');
            canvasCtx.fillStyle = isDarkTheme ? '#0f172a' : '#f8fafc';
            canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);
        }
    }
}