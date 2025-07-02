/**
 * @fileoverview Integration tests for the complete recording workflow.
 * Tests the full recording start → stop → transcription flow and other recording lifecycles.
 */

// Mock dependencies
jest.unstable_mockModule('../js/logger.js', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  }
}));

jest.unstable_mockModule('../js/status-helper.js', () => ({
  showTemporaryStatus: jest.fn()
}));

// Mock MediaRecorder
const mockStream = {
  active: true,
  getAudioTracks: jest.fn(() => [{ kind: 'audio' }]),
  getTracks: jest.fn(() => [{
    kind: 'audio',
    stop: jest.fn(),
    readyState: 'live'
  }])
};

// Mock MediaRecorder events and methods
class MockMediaRecorder {
  constructor() {
    this.state = 'inactive';
    this.eventListeners = {
      dataavailable: [],
      stop: [],
      pause: [],
      resume: [],
      error: []
    };
  }

  addEventListener(event, callback) {
    this.eventListeners[event].push(callback);
  }

  removeEventListener(event, callback) {
    const index = this.eventListeners[event].indexOf(callback);
    if (index !== -1) {
      this.eventListeners[event].splice(index, 1);
    }
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Create a sample audio chunk
    const event = { data: new Blob(['test audio data'], { type: 'audio/webm' }) };
    this.eventListeners.dataavailable.forEach(callback => callback(event));
    // Trigger stop event
    setTimeout(() => {
      this.eventListeners.stop.forEach(callback => callback());
    }, 10);
  }

  pause() {
    if (this.state === 'recording') {
      this.state = 'paused';
      this.eventListeners.pause.forEach(callback => callback());
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'recording';
      this.eventListeners.resume.forEach(callback => callback());
    }
  }

  requestData() {
    const event = { data: new Blob(['test audio data'], { type: 'audio/webm' }) };
    this.eventListeners.dataavailable.forEach(callback => callback(event));
  }
}

// Create global mocks
global.MediaRecorder = jest.fn(() => new MockMediaRecorder());
global.Blob = function(content, options) {
  return { content, options, size: 1024 };
};

// Mock navigator.mediaDevices
global.navigator = {
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue(mockStream)
  }
};

// Mock canvas elements for visualization
document.body.innerHTML = `
  <canvas id="visualizer"></canvas>
  <div id="status"></div>
  <div id="timer">00:00</div>
  <button id="mic-button"></button>
  <button id="pause-button"></button>
  <button id="cancel-button"></button>
  <div id="transcript"></div>
  <div id="spinner-container" style="display: none;"></div>
`;

// Import modules after setting up mocks
let AudioHandler, RecordingStateMachine, PermissionManager, AzureAPIClient, eventBus, APP_EVENTS, RECORDING_STATES;

beforeAll(async () => {
  ({ eventBus, APP_EVENTS } = await import('../js/event-bus.js'));
  ({ RECORDING_STATES } = await import('../js/constants.js'));
  ({ RecordingStateMachine } = await import('../js/recording-state-machine.js'));
  ({ PermissionManager } = await import('../js/permission-manager.js'));
  ({ AudioHandler } = await import('../js/audio-handler.js'));
  ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('Recording Integration', () => {
  let audioHandler;
  let mockUI;
  let mockSettings;
  let mockApiClient;
  let recordingStartedSpy;
  let recordingStoppedSpy;
  let recordingPausedSpy;
  let recordingResumedSpy;
  let recordingCancelledSpy;
  let stateChangeSpy;
  let apiRequestStartSpy;
  let transcriptionReadySpy;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock UI
    mockUI = {
      micButton: document.getElementById('mic-button'),
      pauseButton: document.getElementById('pause-button'),
      cancelButton: document.getElementById('cancel-button'),
      statusElement: document.getElementById('status'),
      timerElement: document.getElementById('timer'),
      transcriptElement: document.getElementById('transcript'),
      spinnerContainer: document.getElementById('spinner-container'),
      checkRecordingPrerequisites: jest.fn().mockReturnValue(true),
      updateTimer: jest.fn(),
      setStatus: jest.fn(),
      setRecordingState: jest.fn(),
      setPauseState: jest.fn(),
      updateTranscription: jest.fn()
    };
    
    // Create mock settings
    mockSettings = {
      getCurrentModel: jest.fn().mockReturnValue('whisper'),
      openSettingsModal: jest.fn(),
      getModelConfig: jest.fn().mockReturnValue({
        apiKey: 'test-api-key',
        uri: 'https://test-uri.com'
      })
    };
    
    // Create mock API client
    mockApiClient = {
      validateConfig: jest.fn(),
      transcribe: jest.fn().mockResolvedValue('Test transcription result')
    };
    
    // Create AudioHandler instance
    audioHandler = new AudioHandler(mockApiClient, mockUI, mockSettings);
    
    // Spy on event bus emissions
    recordingStartedSpy = jest.spyOn(eventBus, 'emit').mockImplementation((event, data) => {
      if (event === APP_EVENTS.RECORDING_STARTED) {
        // Do nothing special
      }
    });
    recordingStoppedSpy = jest.spyOn(eventBus, 'emit');
    recordingPausedSpy = jest.spyOn(eventBus, 'emit');
    recordingResumedSpy = jest.spyOn(eventBus, 'emit');
    recordingCancelledSpy = jest.spyOn(eventBus, 'emit');
    stateChangeSpy = jest.spyOn(eventBus, 'emit');
    apiRequestStartSpy = jest.spyOn(eventBus, 'emit');
    transcriptionReadySpy = jest.spyOn(eventBus, 'emit');
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Full Recording Start → Stop → Transcription Flow', () => {
    it('should complete a full recording lifecycle from start to transcription', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Verify recording started properly
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.RECORDING })
      );
      
      // MediaRecorder should be initialized and started
      expect(audioHandler.mediaRecorder).not.toBeNull();
      expect(audioHandler.mediaRecorder.state).toBe('recording');
      
      // Timer should be started
      expect(audioHandler.timerInterval).not.toBeNull();
      
      // Stop recording
      await audioHandler.stopRecordingFlow();
      
      // Verify stopping state
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.STOPPING })
      );
      
      // Wait for the async stop to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Verify processing state
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.PROCESSING })
      );
      
      // Verify API request was made
      expect(mockApiClient.transcribe).toHaveBeenCalled();
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should return to idle state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Transcription should be displayed
      expect(transcriptionReadySpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_TRANSCRIPTION_READY,
        expect.objectContaining({ text: expect.any(String) })
      );
      
      // Clean up should have occurred
      expect(audioHandler.audioChunks.length).toBe(0);
      expect(audioHandler.mediaRecorder).toBeNull();
      expect(audioHandler.timerInterval).toBeNull();
    });
  });
  
  describe('Recording Pause → Resume Flow', () => {
    it('should handle pause and resume correctly', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Verify recording started
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      
      // Pause recording
      await audioHandler.togglePause();
      
      // Verify paused state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.PAUSED);
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.PAUSED })
      );
      expect(recordingPausedSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_PAUSED);
      
      // Timer should be paused
      const timerInterval = audioHandler.timerInterval;
      expect(timerInterval).toBeNull();
      
      // Resume recording
      await audioHandler.togglePause();
      
      // Verify resumed state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.RECORDING })
      );
      expect(recordingResumedSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_RESUMED);
      
      // Timer should be restarted
      expect(audioHandler.timerInterval).not.toBeNull();
      
      // Clean up
      await audioHandler.stopRecordingFlow();
    });
  });
  
  describe('Recording Cancellation Flow', () => {
    it('should handle cancellation correctly', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Verify recording started
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      
      // Cancel recording
      await audioHandler.cancelRecording();
      
      // Verify cancelling state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.CANCELLING);
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.CANCELLING })
      );
      expect(recordingCancelledSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_CANCELLED);
      
      // Wait for the async stop to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should return to idle state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // No API request should be made
      expect(mockApiClient.transcribe).not.toHaveBeenCalled();
      
      // Clean up should have occurred
      expect(audioHandler.audioChunks.length).toBe(0);
      expect(audioHandler.mediaRecorder).toBeNull();
      expect(audioHandler.timerInterval).toBeNull();
    });
  });
  
  describe('Error Recovery During Recording', () => {
    it('should handle API validation errors', async () => {
      // Make validateConfig throw an error
      mockApiClient.validateConfig.mockImplementation(() => {
        throw new Error('API key is missing');
      });
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Should enter error state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ 
          newState: RECORDING_STATES.ERROR,
          error: expect.stringContaining('API key is missing')
        })
      );
      
      // Settings modal should be opened
      expect(mockSettings.openSettingsModal).toHaveBeenCalled();
      
      // Should transition back to idle after error (via setTimeout)
      jest.advanceTimersByTime(3000);
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });
    
    it('should handle microphone access errors', async () => {
      // Make checkRecordingPrerequisites return false
      mockUI.checkRecordingPrerequisites.mockReturnValueOnce(false);
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Should go to initializing then back to idle
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.INITIALIZING })
      );
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // No MediaRecorder should be created
      expect(audioHandler.mediaRecorder).toBeNull();
    });
    
    it('should handle transcription errors', async () => {
      // Make transcribe throw an error
      mockApiClient.transcribe.mockRejectedValueOnce(new Error('API request failed'));
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Verify recording started
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      
      // Stop recording
      await audioHandler.stopRecordingFlow();
      
      // Wait for the async stop to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // API request error should be emitted
      expect(eventBus.emit).toHaveBeenCalledWith(
        APP_EVENTS.API_REQUEST_ERROR,
        expect.objectContaining({ error: 'API request failed' })
      );
      
      // Should still return to idle state after error
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Clean up should have occurred
      expect(audioHandler.audioChunks.length).toBe(0);
      expect(audioHandler.mediaRecorder).toBeNull();
      expect(audioHandler.timerInterval).toBeNull();
    });
  });

  describe('Timer Integration', () => {
    it('should update timer correctly during recording', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      const mockStartTime = 1000000;
      Date.now = jest.fn(() => mockStartTime);
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Timer should be initialized
      expect(audioHandler.recordingStartTime).toBe(mockStartTime);
      
      // Advance time by 5 seconds
      Date.now = jest.fn(() => mockStartTime + 5000);
      
      // Manually trigger timer update
      jest.advanceTimersByTime(1000);
      
      // Timer should be updated with correct format
      expect(eventBus.emit).toHaveBeenCalledWith(
        APP_EVENTS.UI_TIMER_UPDATE,
        expect.objectContaining({ display: '00:05' })
      );
      
      // Advance time by 65 seconds (1:05)
      Date.now = jest.fn(() => mockStartTime + 65000);
      
      // Manually trigger timer update
      jest.advanceTimersByTime(1000);
      
      // Timer should show minutes and seconds
      expect(eventBus.emit).toHaveBeenCalledWith(
        APP_EVENTS.UI_TIMER_UPDATE,
        expect.objectContaining({ display: '01:05' })
      );
      
      // Stop recording
      await audioHandler.stopRecordingFlow();
      
      // Timer should be reset after stopping
      expect(eventBus.emit).toHaveBeenCalledWith(APP_EVENTS.UI_TIMER_RESET);
      
      // Restore Date.now
      Date.now = originalDateNow;
    });
    
    it('should maintain timer position after pausing and resuming', async () => {
      // Mock Date.now for controlled testing
      const originalDateNow = Date.now;
      const mockStartTime = 2000000;
      Date.now = jest.fn(() => mockStartTime);
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Advance time by 10 seconds
      Date.now = jest.fn(() => mockStartTime + 10000);
      jest.advanceTimersByTime(1000);
      
      // Timer should show 10 seconds
      expect(audioHandler.currentTimerDisplay).toBe('00:10');
      
      // Pause recording
      await audioHandler.togglePause();
      
      // Timer should be paused (interval cleared)
      expect(audioHandler.timerInterval).toBeNull();
      
      // Advance time by 5 more seconds while paused
      Date.now = jest.fn(() => mockStartTime + 15000);
      jest.advanceTimersByTime(1000);
      
      // Timer should still show 10 seconds (frozen)
      expect(audioHandler.currentTimerDisplay).toBe('00:10');
      
      // Resume recording
      await audioHandler.togglePause();
      
      // Record time should be adjusted to maintain correct elapsed time
      expect(audioHandler.recordingStartTime).toBe(mockStartTime + 15000 - 10000);
      
      // Advance time by 5 more seconds
      Date.now = jest.fn(() => mockStartTime + 20000);
      jest.advanceTimersByTime(1000);
      
      // Timer should now show 15 seconds (10 before pause + 5 after resume)
      expect(audioHandler.currentTimerDisplay).toBe('00:15');
      
      // Restore Date.now
      Date.now = originalDateNow;
    });
  });
  
  describe('State Machine Integration', () => {
    it('should follow valid state transitions', async () => {
      // Track state transitions
      const stateTransitions = [];
      const originalEmit = eventBus.emit;
      eventBus.emit = jest.fn((event, data) => {
        if (event === APP_EVENTS.RECORDING_STATE_CHANGED) {
          stateTransitions.push(data.newState);
        }
        return originalEmit.call(eventBus, event, data);
      });
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Pause recording
      await audioHandler.togglePause();
      
      // Resume recording
      await audioHandler.togglePause();
      
      // Stop recording
      await audioHandler.stopRecordingFlow();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 30));
      
      // Verify state transition sequence
      expect(stateTransitions).toEqual([
        RECORDING_STATES.INITIALIZING,
        RECORDING_STATES.RECORDING,
        RECORDING_STATES.PAUSED,
        RECORDING_STATES.RECORDING,
        RECORDING_STATES.STOPPING,
        RECORDING_STATES.PROCESSING,
        RECORDING_STATES.IDLE
      ]);
      
      // Restore original emit
      eventBus.emit = originalEmit;
    });
    
    it('should prevent invalid state transitions', async () => {
      // Track state transitions
      const stateTransitions = [];
      const originalEmit = eventBus.emit;
      eventBus.emit = jest.fn((event, data) => {
        if (event === APP_EVENTS.RECORDING_STATE_CHANGED) {
          stateTransitions.push(data.newState);
        }
        return originalEmit.call(eventBus, event, data);
      });
      
      // Try to stop when in idle state (invalid)
      const result = await audioHandler.stateMachine.transitionTo(RECORDING_STATES.STOPPING);
      
      // Transition should fail
      expect(result).toBe(false);
      
      // State should remain idle
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // No state change event should be emitted
      expect(stateTransitions).toEqual([]);
      
      // Restore original emit
      eventBus.emit = originalEmit;
    });
  });
});
