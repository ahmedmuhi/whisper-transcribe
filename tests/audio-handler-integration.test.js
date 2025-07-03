/**
 * @fileoverview Tests for AudioHandler integration with MediaRecorder and audio processing.
 * Verifies edge cases in audio handling, cleanup after errors, and timer accuracy.
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

// Mock DOM elements
document.body.innerHTML = `
  <div id="status"></div>
  <div id="timer">00:00</div>
  <button id="mic-button"></button>
  <button id="pause-button"></button>
  <button id="cancel-button"></button>
  <div id="transcript"></div>
  <div id="spinner-container" style="display: none;"></div>
  <canvas id="visualizer"></canvas>
`;

// Create mock audio chunks for testing
const createAudioChunk = (size = 1024) => {
  return {
    size,
    type: 'audio/webm',
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(size)))
  };
};

// Import modules before tests
let AudioHandler, eventBus, APP_EVENTS, RECORDING_STATES;

beforeAll(async () => {
  ({ eventBus, APP_EVENTS } = await import('../js/event-bus.js'));
  ({ RECORDING_STATES } = await import('../js/constants.js'));
  ({ AudioHandler } = await import('../js/audio-handler.js'));
});

describe('AudioHandler Integration', () => {
  let audioHandler;
  let mockUI;
  let mockSettings;
  let mockApiClient;
  let eventBusEmitSpy;
  let mockMediaRecorder;
  let mediaRecorderEventHandlers;
  
  beforeEach(() => {
    jest.clearAllMocks();
    applyDomSpies();
    
    // Reset event handlers
    mediaRecorderEventHandlers = {
      dataavailable: [],
      stop: [],
      pause: [],
      resume: [],
      error: []
    };
    
    // Mock MediaRecorder
    mockMediaRecorder = {
      start: jest.fn(),
      stop: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      requestData: jest.fn(),
      state: 'inactive',
      addEventListener: jest.fn((event, handler) => {
        mediaRecorderEventHandlers[event].push(handler);
      }),
      removeEventListener: jest.fn()
    };
    
    // Mock MediaRecorder constructor
    global.MediaRecorder = jest.fn(() => mockMediaRecorder);
    
    // Mock stream
    const mockStream = {
      getAudioTracks: jest.fn(() => [{ kind: 'audio' }]),
      getTracks: jest.fn(() => [{
        kind: 'audio',
        stop: jest.fn(),
        readyState: 'live'
      }])
    };
    
    // Mock getUserMedia
    global.navigator = {
      mediaDevices: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream)
      }
    };
    
    // Create mock UI
    mockUI = {
      micButton: document.getElementById('mic-button'),
      pauseButton: document.getElementById('pause-button'),
      cancelButton: document.getElementById('cancel-button'),
      statusElement: document.getElementById('status'),
      timerElement: document.getElementById('timer'),
      transcriptElement: document.getElementById('transcript'),
      spinnerContainer: document.getElementById('spinner-container'),
      visualizer: document.getElementById('visualizer'),
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
    eventBusEmitSpy = jest.spyOn(eventBus, 'emit');
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    applyDomSpies();
    resetEventBus();
  });
  
  describe('MediaRecorder Integration Edge Cases', () => {
    it('handles different states of MediaRecorder safely', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Set MediaRecorder to inactive state (already stopped)
      mockMediaRecorder.state = 'inactive';
      
      // Try to stop when already inactive - should not throw
      expect(() => {
        audioHandler.stopRecording();
      }).not.toThrow();
      
      // Call safeStopRecorder directly with inactive state
      expect(() => {
        audioHandler.safeStopRecorder();
      }).not.toThrow();
      
      // Call safeStopRecorder with null recorder - should not throw
      audioHandler.mediaRecorder = null;
      expect(() => {
        audioHandler.safeStopRecorder();
      }).not.toThrow();
    });
    
    it('handles MediaRecorder errors gracefully', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';
      
      // Make stop method throw error
      mockMediaRecorder.stop = jest.fn(() => {
        throw new Error('MediaRecorder.stop() failed');
      });
      
      // Try to stop recording - should not throw
      await audioHandler.stopRecordingFlow();
      
      // Should emit error event
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_ERROR,
        expect.objectContaining({ error: expect.any(String) })
      );
      
      // Should still transition to stopping state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.STOPPING);
    });
    
    it('implements graceful stop with proper timing for GPT-4o model', async () => {
      // Set model to GPT-4o
      mockSettings.getCurrentModel.mockReturnValue('gpt-4o-transcribe');
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';
      
      // Call stopRecordingFlow which should use gracefulStop for GPT-4o
      await audioHandler.stopRecordingFlow();
      
      // gracefulStop should have requested data and delayed the stop
      expect(mockMediaRecorder.requestData).toHaveBeenCalled();
      
      // After delay, MediaRecorder.stop should be called
      jest.advanceTimersByTime(800);
      expect(mockMediaRecorder.stop).toHaveBeenCalled();
    });
  });
  
  describe('Audio Chunk Processing', () => {
    it('collects and processes audio chunks correctly', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';
      
      // Simulate dataavailable events
      const chunk1 = createAudioChunk(1024);
      const chunk2 = createAudioChunk(2048);
      
      // Trigger dataavailable events
      mediaRecorderEventHandlers.dataavailable.forEach(handler => {
        handler({ data: chunk1 });
        handler({ data: chunk2 });
      });
      
      // Verify chunks are collected
      expect(audioHandler.audioChunks).toHaveLength(2);
      expect(audioHandler.audioChunks).toContain(chunk1);
      expect(audioHandler.audioChunks).toContain(chunk2);
      
      // Stop recording to trigger processing
      await audioHandler.stopRecordingFlow();
      
      // Trigger stop event
      mediaRecorderEventHandlers.stop.forEach(handler => {
        handler();
      });
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should create a Blob with the chunks
      expect(mockApiClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ 
          size: expect.any(Number),
          type: 'audio/webm'
        }),
        expect.any(Function)
      );
      
      // Should clear chunks after processing
      expect(audioHandler.audioChunks).toHaveLength(0);
    });
    
    it('handles empty audio chunks gracefully', async () => {
      // Start recording but don't generate any chunks
      await audioHandler.startRecordingFlow();
      
      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';
      
      // Stop recording with empty chunks
      await audioHandler.stopRecordingFlow();
      
      // Trigger stop event
      mediaRecorderEventHandlers.stop.forEach(handler => {
        handler();
      });
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should still call transcribe with an empty blob
      expect(mockApiClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ 
          size: 0,
          type: 'audio/webm'
        }),
        expect.any(Function)
      );
    });
  });
  
  describe('Timer Accuracy During Long Recordings', () => {
    it('maintains accurate timer during recording sessions', async () => {
      // Mock Date.now for controlled testing
      const originalDateNow = Date.now;
      Date.now = jest.fn().mockReturnValue(1000000);
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Initial time should be set
      expect(audioHandler.recordingStartTime).toBe(1000000);
      
      // Verify timer interval was started
      expect(audioHandler.timerInterval).not.toBeNull();
      
      // Advance time 30 seconds and trigger timer update
      Date.now = jest.fn().mockReturnValue(1030000);
      jest.advanceTimersByTime(1000);
      
      // Timer display should show 30 seconds
      expect(audioHandler.currentTimerDisplay).toBe('00:30');
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_TIMER_UPDATE,
        { display: '00:30' }
      );
      
      // Advance time to 5 minutes and 15 seconds
      Date.now = jest.fn().mockReturnValue(1000000 + 5*60*1000 + 15*1000);
      jest.advanceTimersByTime(1000);
      
      // Timer should show 5:15
      expect(audioHandler.currentTimerDisplay).toBe('05:15');
      
      // Verify long recording is handled correctly (1 hour+)
      Date.now = jest.fn().mockReturnValue(1000000 + 65*60*1000);
      jest.advanceTimersByTime(1000);
      
      // Timer should show 65:00
      expect(audioHandler.currentTimerDisplay).toBe('65:00');
      
      // Restore Date.now
      Date.now = originalDateNow;
    });
    
    it('converts timer display to milliseconds correctly', async () => {
      // Setup timer display values manually
      audioHandler.currentTimerDisplay = '00:30';
      expect(audioHandler.getTimerMilliseconds()).toBe(30 * 1000);
      
      audioHandler.currentTimerDisplay = '02:15';
      expect(audioHandler.getTimerMilliseconds()).toBe(2 * 60 * 1000 + 15 * 1000);
      
      audioHandler.currentTimerDisplay = '65:00';
      expect(audioHandler.getTimerMilliseconds()).toBe(65 * 60 * 1000);
    });
  });
  
  describe('Cleanup After Recording Errors', () => {
    it('cleans up resources after MediaRecorder errors', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';
      
      // Trigger error event
      const error = new Error('MediaRecorder error');
      mediaRecorderEventHandlers.error.forEach(handler => {
        handler({ error });
      });
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Stopping should still work after error
      await audioHandler.stopRecordingFlow();
      
      // Trigger stop event
      mediaRecorderEventHandlers.stop.forEach(handler => {
        handler();
      });
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should have cleaned up resources
      expect(audioHandler.audioChunks).toHaveLength(0);
      expect(audioHandler.timerInterval).toBeNull();
      expect(audioHandler.mediaRecorder).toBeNull();
      
      // Should be back in idle state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });
    
    it('cleans up resources after API errors', async () => {
      // Make API call fail
      mockApiClient.transcribe.mockRejectedValueOnce(new Error('API error'));
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';
      
      // Stop recording to trigger API call
      await audioHandler.stopRecordingFlow();
      
      // Trigger stop event
      mediaRecorderEventHandlers.stop.forEach(handler => {
        handler();
      });
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should emit API error event
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.API_REQUEST_ERROR,
        expect.objectContaining({ error: 'API error' })
      );
      
      // Should still clean up resources
      expect(audioHandler.audioChunks).toHaveLength(0);
      expect(audioHandler.timerInterval).toBeNull();
      expect(audioHandler.mediaRecorder).toBeNull();
      
      // Should hide spinner even after error
      expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SPINNER_HIDE);
      
      // Should be back in idle state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });
    
    it('stops tracks in the stream after processing', async () => {
      // Create a mock stream with track stop spy
      const trackStopSpy = jest.fn();
      const mockStream = {
        getAudioTracks: jest.fn(() => [{ kind: 'audio' }]),
        getTracks: jest.fn(() => [{
          kind: 'audio',
          stop: trackStopSpy,
          readyState: 'live'
        }])
      };
      
      // Update getUserMedia mock
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Stop recording
      await audioHandler.stopRecordingFlow();
      
      // Trigger stop event
      mediaRecorderEventHandlers.stop.forEach(handler => {
        handler();
      });
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Track stop should be called
      expect(trackStopSpy).toHaveBeenCalled();
    });
  });
});
