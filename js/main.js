import { Settings } from './settings.js';
import { UI } from './ui.js';
import { AzureAPIClient } from './api-client.js';
import { AudioProcessor } from './audio-processor.js';

// Global state (we'll modularize this further)
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingStartTime;
let timerInterval;
let isPaused = false;
let isCancelled = false;

// Audio visualization
let visualizationController = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Speech-to-Text App...');
    
    // Initialize modules
    const settings = new Settings();
    const ui = new UI();
    const apiClient = new AzureAPIClient(settings);
    const audioProcessor = new AudioProcessor();
    
    // Initialize UI with settings reference
    ui.init(settings, null); // We'll pass recorder reference later
    
    // Only keep the core recording initialization
    initializeRecording(settings, ui, apiClient, audioProcessor);
    
    console.log('Speech-to-Text App initialized');
});

function initializeRecording(settings, ui, apiClient, audioProcessor) {
    const micButton = document.getElementById('mic-button');
    
    micButton.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                // Validate configuration before starting
                apiClient.validateConfig();
                
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startRecording(stream, settings, ui, apiClient, audioProcessor);
            } catch (err) {
                console.error('Error starting recording:', err);
                ui.showTemporaryStatus(err.message, 'error');
                
                if (err.message.includes('configure') || err.message.includes('API key') || err.message.includes('URI')) {
                    settings.openSettingsModal();
                }
            }
        } else {
            stopRecording();
        }
    });
}

// Helper function
function getTimerMilliseconds() {
    const parts = document.getElementById('timer').textContent.split(':');
    return (parseInt(parts[0]) * 60000) + (parseInt(parts[1]) * 1000);
}

// Recording functions using AudioProcessor
function startRecording(stream, settings, ui, apiClient, audioProcessor) {
    audioChunks = [];
    audioProcessor.reset();
    
    mediaRecorder = new MediaRecorder(stream);
    
    // Setup visualization
    const visualizer = document.getElementById('visualizer');
    const isDarkTheme = document.body.classList.contains('dark-theme');
    visualizationController = audioProcessor.setupVisualization(stream, visualizer, isDarkTheme);
    
    // Setup silence tracking for GPT-4o
    if (settings.getCurrentModel() === 'gpt-4o-transcribe') {
        audioProcessor.setupSilenceTracking(stream, (totalSilence) => {
            const savedSeconds = (totalSilence / 1000).toFixed(1);
            ui.setStatusHTML(`🔴 Recording... <span style="color: #666;">(${savedSeconds}s silence will be trimmed)</span>`);
        });
    }
    
    mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
        
        // Add chunk to audio processor for GPT-4o
        if (settings.getCurrentModel() === 'gpt-4o-transcribe' && event.data.size > 0) {
            const chunkTime = performance.now() - audioProcessor.recordingStartTime;
            audioProcessor.addChunk(event.data, chunkTime);
        }
    });
    
    mediaRecorder.addEventListener('stop', async () => {
        clearInterval(timerInterval);
        ui.updateTimer('00:00');
        ui.setRecordingState(false);
        
        isPaused = false;
        
        // Stop visualization
        if (visualizationController) {
            visualizationController.stop();
            visualizationController = null;
        }
        
        // Stop silence tracking
        audioProcessor.stopSilenceTracking();
        
        if (isCancelled) {
            ui.setStatus('Recording cancelled');
            isCancelled = false;
            return;
        }
        
        await processAndSendAudio(settings, ui, apiClient, audioProcessor);
        stream.getTracks().forEach(track => track.stop());
    });
    
    mediaRecorder.start(100);
    isRecording = true;
    recordingStartTime = Date.now();
    ui.setRecordingState(true);
    
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const seconds = Math.floor(elapsed / 1000) % 60;
        const minutes = Math.floor(elapsed / 60000);
        ui.updateTimer(`${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`);
    }, 1000);
}

async function processAndSendAudio(settings, ui, apiClient, audioProcessor) {
    ui.setStatus('Processing audio...');
    
    const config = settings.getModelConfig();
    
    // Show silence removal status if applicable
    if (config.model === 'gpt-4o-transcribe' && config.silenceRemoval !== 'off') {
        const totalSilence = audioProcessor.getTotalSilence();
        if (totalSilence > 0) {
            ui.setStatus(`Removing ${(totalSilence/1000).toFixed(1)}s of silence...`);
        }
    }
    
    // Process audio using AudioProcessor
    const audioBlob = await audioProcessor.processAudio(
        audioChunks, 
        config.model, 
        config.silenceRemoval
    );
    
    await sendToAzureAPI(audioBlob, ui, apiClient);
}

async function sendToAzureAPI(audioBlob, ui, apiClient) {
    ui.showSpinner();
    
    try {
        const transcriptionText = await apiClient.transcribe(audioBlob, (statusMessage) => {
            ui.setStatus(statusMessage);
        });
        
        ui.displayTranscription(transcriptionText);
        ui.showTemporaryStatus('Transcription complete', 'success');
        
    } catch (error) {
        console.error('Transcription error:', error);
        ui.showTemporaryStatus(`Error: ${error.message}`, 'error');
    } finally {
        ui.hideSpinner();
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
}