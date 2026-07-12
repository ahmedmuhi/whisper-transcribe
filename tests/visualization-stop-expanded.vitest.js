/**
 * @fileoverview Tests for visualization behavior, cleanup and edge cases.
 * Verifies proper visualization startup, shutdown, theme handling, and memory leak prevention.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { COLORS } from '../js/constants.js';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

// Mock window.requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = vi.fn(cb => {
  // Return a fake animation ID
  return setTimeout(cb, 0);
});

global.cancelAnimationFrame = vi.fn(id => {
  clearTimeout(id);
});

// Mock AudioContext and related audio APIs
class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = {};
  }
  
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn(array => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
      }),
      connect: vi.fn()
    };
  }
  
  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }
  
  close() {
    this.state = 'closed';
  }
}

global.AudioContext = MockAudioContext;
global.webkitAudioContext = MockAudioContext;

// Mock VisualizationController module using ESM mocking
const mockController = { start: vi.fn(), stop: vi.fn() };
vi.mock('../js/visualization.js', () => ({
  VisualizationController: vi.fn(() => mockController)
}));

// Load the mocked module to avoid "Must use import" errors when the UI lazily
// imports VisualizationController.
const { VisualizationController } = await import('../js/visualization.js');

// Import UI after mocking
let UI;
beforeAll(async () => {
  ({ UI } = await import('../js/ui.js'));
});

describe('Visualization Event Handling and Cleanup', () => {
  let ui;
  let mockCanvasContext;
  
  beforeEach(() => {
    // Create DOM elements
    document.body.innerHTML = `
      <div id="visualizer-container">
        <canvas id="visualizer"></canvas>
      </div>
      <button id="mic-button"></button>
      <button id="pause-button"></button>
      <button id="cancel-button"></button>
    `;
    
    // Mock canvas context
    mockCanvasContext = {
      fillRect: vi.fn(),
      fillStyle: null
    };
    
    // Mock canvas getContext
    const mockCanvas = document.getElementById('visualizer');
    mockCanvas.getContext = vi.fn(() => mockCanvasContext);
    
    // Create UI instance
    ui = new UI();
    
    // Initialize element
    ui.visualizer = document.getElementById('visualizer');
    
    // Register event handlers
    ui.setupEventBusListeners();
    
    // Spy on UI clearVisualization
    vi.spyOn(ui, 'clearVisualization').mockImplementation(() => {});
    
    // Clear mock calls
    mockController.start.mockClear();
    mockController.stop.mockClear();
    ui.clearVisualization.mockClear();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    applyDomSpies();
    resetEventBus();
  });
  
  describe('Basic Visualization Control', () => {
    it('starts visualization on VISUALIZATION_START event if stream is provided', async () => {
      eventBus.emit(APP_EVENTS.VISUALIZATION_START, { 
        stream: {}, 
        isDarkTheme: false 
      });
      
      await vi.waitFor(() => expect(mockController.start).toHaveBeenCalled());
    });

    it('does not start visualization if VISUALIZATION_START event is missing stream', async () => {
      eventBus.emit(APP_EVENTS.VISUALIZATION_START, { isDarkTheme: false });
      
      await vi.waitFor(() => expect(mockController.start).not.toHaveBeenCalled());
    });

    it('stops visualization on VISUALIZATION_STOP event', () => {
      // Set up an existing controller first
      ui.visualizationController = mockController;
      
      eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
      
      expect(mockController.stop).toHaveBeenCalled();
      expect(ui.visualizationController).toBeNull();
      expect(ui.clearVisualization).toHaveBeenCalled();
    });
  });
  
  describe('Visualization Cleanup on Unexpected Errors', () => {
    it.each([
      { oldState: 'recording', newState: 'error' },
      { oldState: 'cancelling', newState: 'idle' }
    ])('retains the controller until an explicit VISUALIZATION_STOP for state-only changes', ({ oldState, newState }) => {
      ui.visualizationController = mockController;

      eventBus.emit(APP_EVENTS.RECORDING_STATE_CHANGED, { newState, oldState });

      expect(ui.visualizationController).toBe(mockController);
    });
    
    it('safely handles multiple stop calls without crashing', () => {
      // Set up controller
      ui.visualizationController = mockController;
      
      // Stop visualization multiple times
      eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
      eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
      eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
      
      // Should call stop only once since controller is set to null after first call
      expect(mockController.stop).toHaveBeenCalledTimes(1);
      expect(ui.clearVisualization).toHaveBeenCalledTimes(3); // clearVisualization is called each time
    });
  });
  
  describe('Theme Switching During Visualization', () => {
    it('applies theme correctly to new visualization', async () => {
      // For this test, we need to ensure the VisualizationController uses our mock canvas
      const mockStream = { getAudioTracks: () => [{ kind: 'audio' }] };
      
      // Mock dark theme on the canonical target (the <html> element)
      document.documentElement.classList.add('dark-theme');

      try {
        // Test the UI's visualization start event handling with dark theme
        eventBus.emit(APP_EVENTS.VISUALIZATION_START, {
          stream: mockStream,
          isDarkTheme: true
        });

        await vi.waitFor(() => expect(mockController.start).toHaveBeenCalled());

        // The UI must derive the dark flag from <html> and pass it as arg index 2
        expect(VisualizationController).toHaveBeenCalledWith(
          mockStream,
          expect.anything(),
          true
        );
      } finally {
        // Clean up so the class never leaks into other tests
        document.documentElement.classList.remove('dark-theme');
      }
    });
  });
  
  describe('Multiple Rapid Start/Stop Cycles', () => {
    it('handles multiple start/stop cycles without memory leaks', async () => {
      for (let i = 0; i < 5; i++) {
        eventBus.emit(APP_EVENTS.VISUALIZATION_START, { 
          stream: { getAudioTracks: () => [{ kind: 'audio' }] }, 
          isDarkTheme: false 
        });

        await vi.waitFor(() => expect(mockController.start).toHaveBeenCalledTimes(i + 1));

        eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
        expect(mockController.stop).toHaveBeenCalledTimes(i + 1);
        expect(ui.visualizationController).toBeNull();
      }
    });
  });
});
