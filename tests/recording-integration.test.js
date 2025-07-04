/**
 * @fileoverview Integration tests for the complete recording workflow.
 * Tests the full recording start → stop → transcription flow and other recording lifecycles.
 */

import { jest } from '@jest/globals';
import { applyDomSpies, resetEventBus } from './setupTests.js';

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
const mockMediaStreamTrack = {
  kind: 'audio',
  id: 'mock-track-id',
  label: 'Mock audio track',
  enabled: true,
  muted: false,
  readyState: 'live',
  stop: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  clone: jest.fn(() => mockMediaStreamTrack)
};

const mockStream = {
  id: 'mock-stream-id',
  active: true,
  getAudioTracks: jest.fn(() => [mockMediaStreamTrack]),
  getVideoTracks: jest.fn(() => []),
  getTracks: jest.fn(() => [mockMediaStreamTrack]),
  addTrack: jest.fn(),
  removeTrack: jest.fn(),
  clone: jest.fn(() => mockStream),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// Mock DOMException for browser API errors
global.DOMException = function(message, name) {
  this.message = message;
  this.name = name;
  Error.captureStackTrace && Error.captureStackTrace(this, global.DOMException);
};
global.DOMException.prototype = Object.create(Error.prototype);
global.DOMException.prototype.constructor = global.DOMException;

// Mock MediaRecorder events and methods
class MockMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.eventListeners = {
      dataavailable: [],
      stop: [],
      pause: [],
      resume: [],
      error: []
    };
    this._stopping = false;
    this._debugLog = []; // For debugging event firing sequence
  }

  addEventListener(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
    this._debugLog.push(`addEventListener: ${event}`);
  }

  removeEventListener(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index !== -1) {
        this.eventListeners[event].splice(index, 1);
        this._debugLog.push(`removeEventListener: ${event}`);
      }
    }
  }

  // Reset method for test isolation
  _reset() {
    this.state = 'inactive';
    this._stopping = false;
    this._debugLog = [];
    // Clear all event listeners
    Object.keys(this.eventListeners).forEach(event => {
      this.eventListeners[event] = [];
    });
  }

  start(timeslice) {
    this.state = 'recording';
    
    // Immediately simulate data being available
    setTimeout(() => {
      if (this.state === 'recording') {
        const event = { data: new Blob(['test audio data'], { type: 'audio/webm' }) };
        this.eventListeners.dataavailable?.forEach(callback => callback(event));
      }
    }, 5);
  }

  stop() {
    if (this.state !== 'inactive' && !this._stopping) {
      this._stopping = true;
      this.state = 'inactive';
      this._debugLog.push('stop() called');
      
      // Create a sample audio chunk before stopping
      const event = { data: new Blob(['final audio data'], { type: 'audio/webm' }) };
      this.eventListeners.dataavailable?.forEach(callback => {
        this._debugLog.push('dataavailable fired');
        callback(event);
      });
      
      // Fire stop event with proper async handling for both normal and cancellation flows
      // Use nextTick to ensure it runs after current execution but still synchronously for test timing
      Promise.resolve().then(() => {
        this._debugLog.push('stop event fired');
        this.eventListeners.stop?.forEach(callback => callback());
        this._stopping = false;
      });
    }
  }

  pause() {
    if (this.state === 'recording') {
      this.state = 'paused';
      this.eventListeners.pause?.forEach(callback => callback());
    }
  }

  resume() {
    if (this.state === 'paused') {
      // Use Promise.resolve() to delay state change so event handler can see 'paused' state
      Promise.resolve().then(() => {
        this.state = 'recording';
        this.eventListeners.resume?.forEach(callback => callback());
      });
    }
  }

  requestData() {
    const event = { data: new Blob(['test audio data'], { type: 'audio/webm' }) };
    this.eventListeners.dataavailable?.forEach(callback => callback(event));
  }
}

// Define browser mocks using Object.defineProperty for ES6 compatibility
Object.defineProperty(global, 'MediaRecorder', {
  value: jest.fn((stream) => new MockMediaRecorder(stream)),
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'Blob', {
  value: function(content, options) {
    return { content, options, size: content ? content.length * 100 : 1024 };
  },
  writable: true,
  configurable: true
});

// Mock navigator APIs using Object.defineProperty
Object.defineProperty(global, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue(mockStream)
    },
    permissions: {
      query: jest.fn().mockResolvedValue({ state: 'granted' })
    },
    userAgent: 'Mozilla/5.0 (Test Environment)'
  },
  writable: true,
  configurable: true
});

// Mock window APIs if not already defined
if (typeof global.window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {},
    writable: true,
    configurable: true
  });
}

// Add MediaRecorder and navigator to window
global.window.MediaRecorder = global.MediaRecorder;
global.window.navigator = global.navigator;

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
  
  // Helper function for standardized async operation waiting
  const waitForAsyncOperations = async (cycles = 3, timerAdvance = 50) => {
    for (let i = 0; i < cycles; i++) {
      await Promise.resolve();
    }
    if (timerAdvance > 0) {
      jest.advanceTimersByTime(timerAdvance);
    }
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers(); // Use fake timers for all tests
    applyDomSpies();
    
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
    jest.clearAllMocks();
    jest.useRealTimers(); // Restore real timers after each test
    applyDomSpies();
    resetEventBus();
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
      
      // Wait for the MediaRecorder stop event to be processed
      await waitForAsyncOperations(3, 50);
      
      // Verify processing state
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.PROCESSING })
      );
      
      // Verify API request was made
      expect(mockApiClient.transcribe).toHaveBeenCalled();
      
      // Wait for transcription to complete and cleanup to finish
      await waitForAsyncOperations(4, 100);
      
      // Should return to idle state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Transcription should be displayed
      expect(transcriptionReadySpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_TRANSCRIPTION_READY,
        expect.objectContaining({ text: expect.any(String) })
      );
      
      // Wait for final cleanup operations to complete
      await waitForAsyncOperations(2, 25);
      
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
      
      // Cancel recording and check state immediately 
      const cancelPromise = audioHandler.cancelRecording();
      
      // Check cancelling state immediately - before any async operations
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.CANCELLING);
      
      // Now wait for the cancellation to complete
      await cancelPromise;
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ newState: RECORDING_STATES.CANCELLING })
      );
      expect(recordingCancelledSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_CANCELLED);
      
      // Wait for cancellation to complete
      await waitForAsyncOperations(3, 100);
      
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
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle API validation errors', async () => {
      // Make validateConfig throw an error with 'configure' in the message to trigger API_CONFIG_MISSING
      mockApiClient.validateConfig.mockImplementation(() => {
        throw new Error('Failed to configure API key');
      });
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Wait for error processing
      await waitForAsyncOperations(2, 50);
      
      // Should enter error state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
      expect(stateChangeSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({ 
          newState: RECORDING_STATES.ERROR,
          error: expect.stringContaining('configure')
        })
      );
      
      // Settings modal should be opened (triggered by API_CONFIG_MISSING event)
      expect(mockSettings.openSettingsModal).toHaveBeenCalled();
      
      // Should transition back to idle after error (via setTimeout)
      jest.advanceTimersByTime(3000);
      await waitForAsyncOperations(1, 0);
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
      
      // Wait for transcription error processing
      await waitForAsyncOperations(4, 100);
      
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
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

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
      
      // Wait for full stop sequence including cleanup
      await waitForAsyncOperations(4, 100);
      
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
      
      // Wait for async resume operations to complete
      await waitForAsyncOperations(2, 50);
      
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
      
      // Wait for complete async state machine cycle including final transition to idle
      await waitForAsyncOperations(4, 100);
      
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
