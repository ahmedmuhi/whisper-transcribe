/**
 * @fileoverview Tests for error handling and recovery scenarios.
 * Validates system resilience in the face of permission denials, API failures,
 * configuration issues, and state machine error states.
 */

import { vi } from 'vitest';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

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
  <button id="mic-button"></button>
  <button id="pause-button"></button>
  <button id="cancel-button"></button>
  <div id="transcript"></div>
  <div id="spinner-container" style="display: none;"></div>
  <div id="settings-modal" style="display: none;"></div>
`;

// Backup original navigator properties for test isolation
const _originalMediaDevices = global.navigator.mediaDevices;
const _originalPermissions = global.navigator.permissions;

// Mock local storage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn(key => {
      delete store[key];
    })
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import modules after setting up mocks
let AudioHandler, RecordingStateMachine, PermissionManager, AzureAPIClient, Settings;
let eventBus, APP_EVENTS, RECORDING_STATES, MESSAGES;

beforeAll(async () => {
  ({ eventBus, APP_EVENTS } = await import('../js/event-bus.js'));
  ({ RECORDING_STATES, MESSAGES } = await import('../js/constants.js'));
  ({ RecordingStateMachine } = await import('../js/recording-state-machine.js'));
  ({ PermissionManager } = await import('../js/permission-manager.js'));
  ({ AudioHandler } = await import('../js/audio-handler.js'));
  ({ AzureAPIClient } = await import('../js/api-client.js'));
  ({ Settings } = await import('../js/settings.js'));
});

describe('Error Recovery Scenarios', () => {
  let audioHandler;
  let mockUI;
  let mockSettings;
  let mockApiClient;
  let permissionManager;
  let eventBusEmitSpy;
  
  beforeEach(() => {
    // Ensure MediaRecorder exists so browser support check passes
    Object.defineProperty(global, 'MediaRecorder', {
      value: function () {},
      writable: true,
      configurable: true
    });
    // Reset navigator mocks for each test
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true
    });
    Object.defineProperty(global.navigator, 'permissions', {
      value: { query: vi.fn() },
      writable: true,
      configurable: true
    });
    vi.clearAllMocks();
    applyDomSpies();
    
    // Create mock UI
    mockUI = {
      micButton: document.getElementById('mic-button'),
      pauseButton: document.getElementById('pause-button'),
      cancelButton: document.getElementById('cancel-button'),
      statusElement: document.getElementById('status'),
      transcriptElement: document.getElementById('transcript'),
      spinnerContainer: document.getElementById('spinner-container'),
      settingsModal: document.getElementById('settings-modal'),
      checkRecordingPrerequisites: vi.fn().mockReturnValue(true),
      updateTimer: vi.fn(),
      setStatus: vi.fn(),
      setRecordingState: vi.fn(),
      setPauseState: vi.fn(),
      updateTranscription: vi.fn(),
      openSettingsModal: vi.fn()
    };
    
    // Create mock settings
    mockSettings = {
      getCurrentModel: vi.fn().mockReturnValue('whisper'),
      openSettingsModal: vi.fn(),
      getModelConfig: vi.fn().mockReturnValue({
        apiKey: 'test-api-key',
        uri: 'https://test-uri.com'
      }),
      saveSettings: vi.fn()
    };
    
    // Create mock API client
    mockApiClient = {
      validateConfig: vi.fn(),
      transcribe: vi.fn().mockResolvedValue('Test transcription result')
    };
    
    // Create permission manager
    permissionManager = new PermissionManager(mockUI);
    
    // Create AudioHandler instance
    audioHandler = new AudioHandler(mockApiClient, mockUI, mockSettings);
    
    // Replace the permission manager with our controlled instance
    audioHandler.permissionManager = permissionManager;
    
    // Spy on event bus emissions
    eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
  });
  
  afterEach(() => {
    // Restore original navigator properties
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: _originalMediaDevices,
      writable: true,
      configurable: true
    });
    Object.defineProperty(global.navigator, 'permissions', {
      value: _originalPermissions,
      writable: true,
      configurable: true
    });
    vi.clearAllMocks();
    applyDomSpies();
    resetEventBus();
  });

  describe('Permission Denial Recovery', () => {
    it('should handle initial microphone permission denial', async () => {
      // Mock permission denial
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(permissionError);
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Should emit app error occurred event with permission denial
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.ERROR_OCCURRED,
        expect.objectContaining({
          code: 'NotAllowedError',
          message: 'Permission denied'
        })
      );
      
      // Status should be updated with error message  
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_STATUS_UPDATE,
        expect.objectContaining({ 
          message: expect.stringContaining('Error:'),
          type: 'error'
        })
      );
      
      // Should be in error state after permission denial
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
      
      // Now mock permission granted
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [{ kind: 'audio' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      
      // Try recording again
      await audioHandler.startRecordingFlow();
      
      // Should now be in recording state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
    });
    
    it('should provide helpful instructions for permission recovery', async () => {
      // Mock permission denial
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(permissionError);
      
      // Set user agent to Chrome
      const originalUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        configurable: true
      });
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Should emit permission denied with Chrome-specific instructions
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_STATUS_UPDATE,
        expect.objectContaining({
          message: expect.stringContaining(MESSAGES.PERMISSION_CHROME),
          type: 'error'
        })
      );
      
      // Restore user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true
      });
    });
  });
  
  describe('API Failure Recovery', () => {
    it('should recover from network failures during transcription', async () => {
      // Setup for successful recording start
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [{ kind: 'audio' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      
      // Mock MediaRecorder
      const mockMediaRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'dataavailable') {
            setTimeout(() => {
              callback({ data: new Blob(['test audio data']) });
            }, 10);
          }
          if (event === 'stop') {
            setTimeout(() => {
              callback();
            }, 10);
          }
        }),
        state: 'inactive'
      };
      global.MediaRecorder = vi.fn(() => mockMediaRecorder);
      
      // First API call fails with network error
      mockApiClient.transcribe.mockRejectedValueOnce(new Error('Network failure'));
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Verify in recording state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      
      // Stop recording to trigger transcription
      mockMediaRecorder.state = 'recording';
      await audioHandler.stopRecordingFlow();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should show error but return to idle state
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.API_REQUEST_ERROR,
        expect.objectContaining({ error: 'Network failure' })
      );
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Second attempt should succeed
      mockApiClient.transcribe.mockResolvedValueOnce('Successful transcription');
      mockMediaRecorder.state = 'inactive';
      
      // Try again
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      await audioHandler.startRecordingFlow();
      mockMediaRecorder.state = 'recording';
      await audioHandler.stopRecordingFlow();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should emit transcription ready event
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_TRANSCRIPTION_READY,
        expect.objectContaining({ text: 'Successful transcription' })
      );
    });
    
    it('should recover from API authentication errors', async () => {
      // Setup for successful recording start
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [{ kind: 'audio' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      
      // Mock MediaRecorder
      const mockMediaRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'dataavailable') {
            setTimeout(() => {
              callback({ data: new Blob(['test audio data']) });
            }, 10);
          }
          if (event === 'stop') {
            setTimeout(() => {
              callback();
            }, 10);
          }
        }),
        state: 'inactive'
      };
      global.MediaRecorder = vi.fn(() => mockMediaRecorder);
      
      // API call fails with authentication error
      mockApiClient.transcribe.mockRejectedValueOnce(new Error('Invalid API key'));
      
      // Start recording
      await audioHandler.startRecordingFlow();
      
      // Verify in recording state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
      
      // Stop recording to trigger transcription
      mockMediaRecorder.state = 'recording';
      await audioHandler.stopRecordingFlow();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should show authentication error
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.API_REQUEST_ERROR,
        expect.objectContaining({ error: 'Invalid API key' })
      );
      
      // Should return to idle state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });
  });
  
  describe('Configuration Recovery', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should automatically open settings modal when API configuration is missing', async () => {
      // Make validateConfig throw a configuration error
      mockApiClient.validateConfig.mockImplementationOnce(() => {
        throw new Error('API key is required');
      });
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Should emit API configuration missing event
      expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.API_CONFIG_MISSING);
      
      // Settings modal should be opened
      expect(mockSettings.openSettingsModal).toHaveBeenCalled();
      
      // Should go to error state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
      
      // After timeout, should return to idle
      jest.advanceTimersByTime(3000);
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
    });
    
    it('should recover after fixing configuration', async () => {
      // First call fails with configuration error
      mockApiClient.validateConfig.mockImplementationOnce(() => {
        throw new Error('API key is required');
      });
      
      // Try to start recording
      await audioHandler.startRecordingFlow();
      
      // Should go to error state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.ERROR);
      
      // Wait for timeout to return to idle
      jest.advanceTimersByTime(3000);
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Fix configuration
      mockApiClient.validateConfig.mockImplementationOnce(() => true);
      
      // Setup for successful recording
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [{ kind: 'audio' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      
      // Mock MediaRecorder
      const mockMediaRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        state: 'inactive'
      };
      global.MediaRecorder = vi.fn(() => mockMediaRecorder);
      
      // Try recording again
      await audioHandler.startRecordingFlow();
      
      // Should now be in recording state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
    });
  });
  
  describe('State Machine Error Handling', () => {
    it('should handle transitions to error state and recover', async () => {
      // Directly transition to error state
      await audioHandler.stateMachine.transitionTo(RECORDING_STATES.ERROR, {
        error: 'Test error message'
      });
      
      // Should emit recording error event
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.RECORDING_ERROR, 
        expect.objectContaining({ error: 'Test error message' })
      );
      
      // Should update UI with error
      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        APP_EVENTS.UI_STATUS_UPDATE,
        expect.objectContaining({
          message: expect.stringContaining('Test error message'),
          type: 'error'
        })
      );
      
      // Should be able to transition back to idle
      const result = await audioHandler.stateMachine.transitionTo(RECORDING_STATES.IDLE);
      expect(result).toBe(true);
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Should be able to start recording again
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [{ kind: 'audio' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
      
      // Setup MediaRecorder
      const mockMediaRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        state: 'inactive'
      };
      global.MediaRecorder = vi.fn(() => mockMediaRecorder);
      
      // Try to start recording
      mockApiClient.validateConfig.mockImplementationOnce(() => true);
      await audioHandler.startRecordingFlow();
      
      // Should transition to recording state
      expect(audioHandler.stateMachine.getState()).toBe(RECORDING_STATES.RECORDING);
    });
    
    it('should recover from invalid state transitions without breaking the app', async () => {
      // Create a new state machine
      const stateMachine = new RecordingStateMachine(audioHandler);
      
      // Attempt an invalid transition
      const result = await stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
      
      // Should fail gracefully
      expect(result).toBe(false);
      
      // State should remain unchanged
      expect(stateMachine.getState()).toBe(RECORDING_STATES.IDLE);
      
      // Valid transition should still work
      const validResult = await stateMachine.transitionTo(RECORDING_STATES.INITIALIZING);
      expect(validResult).toBe(true);
      expect(stateMachine.getState()).toBe(RECORDING_STATES.INITIALIZING);
    });
  });
});
