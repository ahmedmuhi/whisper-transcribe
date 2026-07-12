/**
 * @fileoverview Tests for AudioHandler integration with MediaRecorder and audio processing.
 * Verifies edge cases in audio handling, cleanup after errors, and timer accuracy.
 */

import { vi } from 'vitest';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

// Backup original mediaDevices API for restoration
const _originalMediaDevices = global.navigator.mediaDevices;

// Mock dependencies
vi.mock('../js/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../js/status-helper.js', () => ({
  showTemporaryStatus: vi.fn()
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
const createAudioChunk = (size = 1024, type = 'audio/webm') => {
  return {
    size,
    type,
    arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(size)))
  };
};

// Import modules before tests
let AudioHandler, AzureAPIClient, eventBus, APP_EVENTS, AUDIO_UPLOAD_LIMIT_ERROR_CODE, RECORDING_STATES, MESSAGES;

beforeAll(async () => {
  ({ eventBus, APP_EVENTS } = await import('../js/event-bus.js'));
  ({ AUDIO_UPLOAD_LIMIT_ERROR_CODE, RECORDING_STATES, MESSAGES } = await import('../js/constants.js'));
  ({ AudioHandler } = await import('../js/audio-handler.js'));
  ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('AudioHandler Integration', () => {
  let audioHandler;
  let mockSettings;
  let mockApiClient;
  let eventBusEmitSpy;
  let mockMediaRecorder;
  let mediaRecorderEventHandlers;
  let mockStream;
  let trackStopSpy;
  
  beforeEach(() => {
    vi.clearAllMocks();
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
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      requestData: vi.fn(),
      state: 'inactive',
      mimeType: 'audio/webm',
      addEventListener: vi.fn((event, handler) => {
        mediaRecorderEventHandlers[event].push(handler);
      }),
      removeEventListener: vi.fn()
    };
    
    // Mock MediaRecorder constructor
    global.MediaRecorder = vi.fn(() => mockMediaRecorder);
    
    // Mock stream
    trackStopSpy = vi.fn();
    mockStream = {
      getAudioTracks: vi.fn(() => [{ kind: 'audio' }]),
      getTracks: vi.fn(() => [{
        kind: 'audio',
        stop: trackStopSpy,
        readyState: 'live'
      }])
    };
    
    // Mock getUserMedia
    // Define mock mediaDevices API
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream)
      },
      writable: true,
      configurable: true
    });
    
    // Create mock settings
    mockSettings = {
      getCurrentModel: vi.fn().mockReturnValue('whisper'),
      openSettingsModal: vi.fn(),
      getModelConfig: vi.fn().mockReturnValue({
        apiKey: 'test-api-key',
        uri: 'https://test-uri.com'
      })
    };
    
    // Create mock API client
    mockApiClient = {
      validateConfig: vi.fn(),
      transcribe: vi.fn().mockResolvedValue('Test transcription result')
    };
    
    // Create AudioHandler instance
    audioHandler = new AudioHandler(mockApiClient, mockSettings);
    
    // Spy on event bus emissions
    eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
  });

  const expectRecorderFailureRecovery = (startedVisualization = true) => {
    const visualizationStarts = eventBusEmitSpy.mock.calls.filter(
      ([event]) => event === APP_EVENTS.VISUALIZATION_START
    );
    const visualizationStops = eventBusEmitSpy.mock.calls.filter(
      ([event]) => event === APP_EVENTS.VISUALIZATION_STOP
    );
    const errorTransitions = eventBusEmitSpy.mock.calls.filter(
      ([event, data]) => event === APP_EVENTS.RECORDING_STATE_CHANGED
        && data?.newState === RECORDING_STATES.ERROR
    );
    const recordingTransitions = eventBusEmitSpy.mock.calls.filter(
      ([event, data]) => event === APP_EVENTS.RECORDING_STATE_CHANGED
        && data?.newState === RECORDING_STATES.RECORDING
    );

    expect(trackStopSpy).toHaveBeenCalledTimes(1);
    expect(audioHandler.timerInterval).toBeNull();
    expect(audioHandler.audioChunks).toHaveLength(0);
    expect(audioHandler.recordingStartTime).toBeNull();
    expect(audioHandler.mediaRecorder).toBeNull();
    expect(audioHandler.activeStream).toBeNull();
    expect(audioHandler._activeRecordingSession).toBeNull();
    expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
    expect(errorTransitions).toHaveLength(1);
    expect(eventBusEmitSpy.mock.calls.filter(
      ([event]) => event === APP_EVENTS.RECORDING_ERROR
    )).toHaveLength(1);
    expect(visualizationStarts).toHaveLength(startedVisualization ? 1 : 0);
    expect(visualizationStops).toHaveLength(startedVisualization ? 1 : 0);
    expect(recordingTransitions).toHaveLength(startedVisualization ? 1 : 0);
  };
  
  afterEach(() => {
    // Restore original mediaDevices API
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: _originalMediaDevices,
      writable: true,
      configurable: true
    });
    vi.clearAllMocks();
    applyDomSpies();
    resetEventBus();
  });
  
  describe('MediaRecorder Integration Edge Cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('handles different states of MediaRecorder safely', async () => {
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Set MediaRecorder to inactive state (already stopped)
      mockMediaRecorder.state = 'inactive';
      
      // Call safeStopRecorder directly with inactive state - should not throw
      expect(() => {
        audioHandler.safeStopRecorder();
      }).not.toThrow();
      
      // Call safeStopRecorder with null recorder - should not throw
      audioHandler.mediaRecorder = null;
      expect(() => {
        audioHandler.safeStopRecorder();
      }).not.toThrow();
    });
    
    it('recovers when MediaRecorder construction throws', async () => {
      global.MediaRecorder.mockImplementationOnce(() => {
        throw new Error('MediaRecorder constructor failed');
      });

      await audioHandler.startRecordingFlow();

      expectRecorderFailureRecovery(false);
    });

    it('recovers when MediaRecorder.start() throws', async () => {
      mockMediaRecorder.start.mockImplementationOnce(() => {
        throw new Error('MediaRecorder.start() failed');
      });

      await audioHandler.startRecordingFlow();

      expectRecorderFailureRecovery(false);
    });

    it.each(['recording', 'paused'])('recovers when MediaRecorder.stop() throws from %s state', async (state) => {
      await audioHandler.startRecordingFlow();

      if (state === 'paused') {
        await audioHandler.togglePause();
      }

      // Force mediaRecorder to the state under test.
      mockMediaRecorder.state = state;
      mockMediaRecorder.stop = vi.fn(() => {
        throw new Error('MediaRecorder.stop() failed');
      });

      await audioHandler.stopRecordingFlow();

      expectRecorderFailureRecovery();
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

    it('preserves an MP4 container selected by MediaRecorder', async () => {
      mockMediaRecorder.mimeType = 'audio/mp4';

      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';
      mediaRecorderEventHandlers.dataavailable.forEach(handler => {
        handler({ data: createAudioChunk(1024, 'audio/mp4') });
      });

      await audioHandler.stopRecordingFlow();
      await Promise.all(mediaRecorderEventHandlers.stop.map(handler => handler()));

      expect(mockApiClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'audio/mp4' }),
        expect.any(Function)
      );
    });

    it('uses a chunk container when MediaRecorder does not expose one', async () => {
      mockMediaRecorder.mimeType = '';

      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';
      mediaRecorderEventHandlers.dataavailable.forEach(handler => {
        handler({ data: createAudioChunk(1024, 'audio/mp4') });
      });

      await audioHandler.stopRecordingFlow();
      await Promise.all(mediaRecorderEventHandlers.stop.map(handler => handler()));

      expect(mockApiClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'audio/mp4' }),
        expect.any(Function)
      );
    });

    it('uses audio/webm as the safe fallback when recorder and chunks have no type', async () => {
      mockMediaRecorder.mimeType = '';

      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';
      mediaRecorderEventHandlers.dataavailable.forEach(handler => {
        handler({ data: createAudioChunk(1024, '') });
      });

      await audioHandler.stopRecordingFlow();
      await Promise.all(mediaRecorderEventHandlers.stop.map(handler => handler()));

      expect(mockApiClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'audio/webm' }),
        expect.any(Function)
      );
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

  describe('Transcription retry', () => {
    it('emits one structured lifecycle for a successful transcription', async () => {
      mockSettings.getModelConfig.mockReturnValue({
        model: 'whisper',
        apiKey: 'test-api-key',
        uri: 'https://test.azure.com'
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue('text/plain') },
        text: vi.fn().mockResolvedValue('Test transcription result')
      });
      audioHandler.apiClient = new AzureAPIClient(mockSettings);
      audioHandler.stateMachine.currentState = RECORDING_STATES.STOPPING;

      await audioHandler.stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
      await expect(audioHandler.sendToAzureAPI(new Blob(['audio'], { type: 'audio/webm' })))
        .resolves.toEqual({ success: true });

      expect(eventBusEmitSpy.mock.calls.filter(
        ([event]) => event === APP_EVENTS.API_REQUEST_START
      )).toEqual([[APP_EVENTS.API_REQUEST_START, {
        model: 'whisper',
        message: MESSAGES.SENDING_TO_WHISPER
      }]]);
      expect(eventBusEmitSpy.mock.calls.filter(
        ([event]) => event === APP_EVENTS.API_REQUEST_SUCCESS
      )).toEqual([[APP_EVENTS.API_REQUEST_SUCCESS, {
        model: 'whisper',
        transcriptionLength: 'Test transcription result'.length
      }]]);
    });

    it('carries an upload-limit error code through sendToAzureAPI', async () => {
      const uploadLimitError = new Error('Azure Whisper accepts recordings up to 25 MB. Make a shorter recording and try again.');
      uploadLimitError.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
      mockApiClient.transcribe.mockRejectedValueOnce(uploadLimitError);

      await expect(audioHandler.sendToAzureAPI(new Blob(['audio'], { type: 'audio/webm' }))).resolves.toEqual({
        success: false,
        error: uploadLimitError.message,
        code: AUDIO_UPLOAD_LIMIT_ERROR_CODE
      });
    });

    it('retains an oversized blob for error handling without offering Retry', async () => {
      const uploadLimitError = new Error('Azure Whisper accepts recordings up to 25 MB. Make a shorter recording and try again.');
      uploadLimitError.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
      mockApiClient.transcribe.mockRejectedValueOnce(uploadLimitError);
      audioHandler.audioChunks = [new Uint8Array([1, 2, 3])];

      await audioHandler.processAndSendAudio(mockStream);

      expect(audioHandler.pendingRetryBlob).toBeInstanceOf(Blob);
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({
          newState: RECORDING_STATES.ERROR,
          canRetry: false
        })
      );
    });

    it('preserves failed audio and retries the same blob', async () => {
      const trackStopSpy = vi.fn();
      const mockStream = {
        getTracks: vi.fn(() => [{
          kind: 'audio',
          stop: trackStopSpy,
          readyState: 'live'
        }])
      };
      mockApiClient.transcribe
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce('Recovered transcription');
      audioHandler.audioChunks = [new Uint8Array([1, 2, 3])];

      await audioHandler.processAndSendAudio(mockStream);

      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
      expect(trackStopSpy).toHaveBeenCalled();
      expect(audioHandler.pendingRetryBlob).toBeInstanceOf(Blob);
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({
          newState: RECORDING_STATES.ERROR,
          canRetry: true
        })
      );
      const failedAudioBlob = audioHandler.pendingRetryBlob;

      await audioHandler.retryPendingTranscription();

      // Retry must actually ENTER processing via the legal error→processing edge.
      // (The old code did error→idle then an illegal idle→processing that silently
      //  no-oped, so the app never reached processing — yet still ended on idle,
      //  which is exactly why the end-state assertions below passed despite the bug.)
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({
          newState: RECORDING_STATES.PROCESSING,
          oldState: RECORDING_STATES.ERROR
        })
      );
      // The PROCESSING transition above is the real proof the retry path ran; the
      // spinner + disable are now rendered from that state by the UI (no FSM events).
      // No illegal-transition error should be surfaced to the user during retry.
      const invalidTransitionEmits = eventBusEmitSpy.mock.calls.filter(
        ([event, payload]) =>
          event === APP_EVENTS.ERROR_OCCURRED &&
          /Invalid state transition/i.test(payload?.message ?? '')
      );
      expect(invalidTransitionEmits).toHaveLength(0);

      expect(mockApiClient.transcribe).toHaveBeenCalledTimes(2);
      expect(mockApiClient.transcribe.mock.calls[1][0]).toBe(failedAudioBlob);
      expect(audioHandler.pendingRetryBlob).toBeNull();
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_TRANSCRIPTION_READY,
        { text: 'Recovered transcription' }
      );
    });

    it('emits one structured lifecycle for each user-initiated retry', async () => {
      mockSettings.getModelConfig.mockReturnValue({
        model: 'whisper',
        apiKey: 'test-api-key',
        uri: 'https://test.azure.com'
      });
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          headers: { get: vi.fn().mockReturnValue(null) },
          text: vi.fn().mockResolvedValue('Bad request')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue('text/plain') },
          text: vi.fn().mockResolvedValue('Recovered transcription')
        });
      audioHandler.apiClient = new AzureAPIClient(mockSettings);
      audioHandler.audioChunks = [new Uint8Array([1, 2, 3])];
      audioHandler.stateMachine.currentState = RECORDING_STATES.PROCESSING;

      await audioHandler.processAndSendAudio(mockStream);
      await audioHandler.retryPendingTranscription();

      expect(eventBusEmitSpy.mock.calls.filter(
        ([event]) => event === APP_EVENTS.API_REQUEST_START
      )).toEqual([
        [APP_EVENTS.API_REQUEST_START, {
          model: 'whisper',
          message: MESSAGES.SENDING_TO_WHISPER
        }],
        [APP_EVENTS.API_REQUEST_START, {
          model: 'whisper',
          message: MESSAGES.SENDING_TO_WHISPER
        }]
      ]);
      expect(eventBusEmitSpy.mock.calls.filter(
        ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
      )).toEqual([[APP_EVENTS.API_REQUEST_ERROR, {
        error: 'API responded with status: 400',
        status: 400,
        details: 'Bad request'
      }]]);
      expect(eventBusEmitSpy.mock.calls.filter(
        ([event]) => event === APP_EVENTS.API_REQUEST_SUCCESS
      )).toEqual([[APP_EVENTS.API_REQUEST_SUCCESS, {
        model: 'whisper',
        transcriptionLength: 'Recovered transcription'.length
      }]]);
    });

    it('ignores retry clicks when there is no failed transcription payload', async () => {
      await audioHandler.retryPendingTranscription();

      expect(mockApiClient.transcribe).not.toHaveBeenCalled();
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });

    it('retries through the retry button event', async () => {
      const mockStream = {
        getTracks: vi.fn(() => [{
          kind: 'audio',
          stop: vi.fn(),
          readyState: 'live'
        }])
      };
      mockApiClient.transcribe
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce('Recovered from event');
      audioHandler.audioChunks = [new Uint8Array([4, 5, 6])];

      await audioHandler.processAndSendAudio(mockStream);
      eventBus.emit(APP_EVENTS.RETRY_BUTTON_CLICKED);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockApiClient.transcribe).toHaveBeenCalledTimes(2);
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_STATE_CHANGED,
        expect.objectContaining({
          newState: RECORDING_STATES.PROCESSING,
          oldState: RECORDING_STATES.ERROR
        })
      );
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });
  });
  
  describe('Timer Accuracy During Long Recordings', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('maintains accurate timer during recording sessions', async () => {
      // Mock Date.now for controlled testing
      const originalDateNow = Date.now;
      Date.now = vi.fn().mockReturnValue(1000000);
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Initial time should be set
      expect(audioHandler.recordingStartTime).toBe(1000000);
      
      // Verify timer interval was started
      expect(audioHandler.timerInterval).not.toBeNull();
      
      // Advance time 30 seconds and trigger timer update
      Date.now = vi.fn().mockReturnValue(1030000);
      vi.advanceTimersByTime(1000);
      
      // Timer display should show 30 seconds
      expect(audioHandler.currentTimerDisplay).toBe('00:30');
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_TIMER_UPDATE,
        { display: '00:30' }
      );
      
      // Advance time to 5 minutes and 15 seconds
      Date.now = vi.fn().mockReturnValue(1000000 + 5*60*1000 + 15*1000);
      vi.advanceTimersByTime(1000);
      
      // Timer should show 5:15
      expect(audioHandler.currentTimerDisplay).toBe('05:15');
      
      // Verify long recording is handled correctly (1 hour+)
      Date.now = vi.fn().mockReturnValue(1000000 + 65*60*1000);
      vi.advanceTimersByTime(1000);
      
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
    it('handles a registered fatal MediaRecorder error without processing a later stop event', async () => {
      await audioHandler.startRecordingFlow();

      // Force mediaRecorder to active state
      mockMediaRecorder.state = 'recording';

      // Trigger error event
      const error = new Error('MediaRecorder error');
      expect(mediaRecorderEventHandlers.error).toHaveLength(1);
      await mediaRecorderEventHandlers.error[0]({ error });
      await Promise.all(mediaRecorderEventHandlers.stop.map(handler => handler()));

      expect(mockApiClient.transcribe).not.toHaveBeenCalled();
      expectRecorderFailureRecovery();
    });

    it('recovers to ERROR when a fatal MediaRecorder error arrives while cancelling', async () => {
      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';

      await audioHandler.cancelRecording();
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.CANCELLING);
      expect(mediaRecorderEventHandlers.error).toHaveLength(1);

      await mediaRecorderEventHandlers.error[0]({
        error: new Error('MediaRecorder error while cancelling')
      });
      await Promise.all(mediaRecorderEventHandlers.stop.map(handler => handler()));

      expect(mockApiClient.transcribe).not.toHaveBeenCalled();
      expectRecorderFailureRecovery();
    });

    it('recovers to ERROR when a fatal MediaRecorder error arrives during discard confirmation', async () => {
      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';
      audioHandler.currentTimerDisplay = '00:10';

      await audioHandler.requestDiscard();
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.CONFIRMING_DISCARD);
      expect(mediaRecorderEventHandlers.error).toHaveLength(1);

      await mediaRecorderEventHandlers.error[0]({
        error: new Error('MediaRecorder error during discard confirmation')
      });
      await Promise.all(mediaRecorderEventHandlers.stop.map(handler => handler()));

      expect(mockApiClient.transcribe).not.toHaveBeenCalled();
      expectRecorderFailureRecovery();
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
      
      // Should show error in status
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_STATUS_UPDATE,
        expect.objectContaining({ message: expect.stringContaining('API error'), type: 'error' })
      );
      
      // Should still clean up resources
      expect(audioHandler.audioChunks).toHaveLength(0);
      expect(audioHandler.timerInterval).toBeNull();
      expect(audioHandler.mediaRecorder).toBeNull();
      
      // Spinner is hidden by the UI rendering the ERROR state (no FSM spinner event).

      // Should be in ERROR state (persistent — user clicks mic to retry)
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
    });

    it('should NOT emit API_REQUEST_ERROR from audio handler (Issue 2 regression guard)', async () => {
      mockSettings.getModelConfig.mockReturnValue({
        model: 'whisper',
        apiKey: 'test-key',
        uri: 'https://test.azure.com'
      });
      mockApiClient.transcribe.mockRejectedValue(new Error('Transcription failed'));

      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';
      await audioHandler.stopRecordingFlow();

      await new Promise(resolve => setTimeout(resolve, 50));

      const errorEmits = eventBusEmitSpy.mock.calls.filter(
        ([event]) => event === APP_EVENTS.API_REQUEST_ERROR
      );
      expect(errorEmits).toHaveLength(0);
    });

    it('stops tracks in the stream after processing', async () => {
      // Create a mock stream with track stop spy
      const trackStopSpy = vi.fn();
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ kind: 'audio' }]),
        getTracks: vi.fn(() => [{
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

  describe('Lifecycle — destroy()', () => {
    it('should unsubscribe all event bus listeners', () => {
      // 4 original listeners (CANCEL_BUTTON_CLICKED retired) + 3 discard-flow listeners
      expect(audioHandler._unsubscribers.length).toBe(7);

      audioHandler.destroy();

      expect(audioHandler._unsubscribers).toEqual([]);
      // Verify the API_CONFIG_MISSING listener was removed
      expect(eventBus.events.has(APP_EVENTS.API_CONFIG_MISSING)).toBe(false);
    });

    it('should destroy its permission manager after unsubscribing from the event bus', () => {
      const permissionManagerDestroySpy = vi.spyOn(audioHandler.permissionManager, 'destroy');

      audioHandler.destroy();

      expect(eventBus.events.has(APP_EVENTS.API_CONFIG_MISSING)).toBe(false);
      expect(permissionManagerDestroySpy).toHaveBeenCalledTimes(1);
    });

    it('should not throw if destroy() is called twice', () => {
      audioHandler.destroy();
      expect(() => audioHandler.destroy()).not.toThrow();
    });
  });
});
