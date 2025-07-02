/**
 * @fileoverview Tests for visualization behavior, cleanup and edge cases.
 * Verifies proper visualization startup, shutdown, theme handling, and memory leak prevention.
 */

import { jest } from '@jest/globals';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { COLORS } from '../js/constants.js';

// Mock window.requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = jest.fn(cb => {
  // Return a fake animation ID
  return setTimeout(cb, 0);
});

global.cancelAnimationFrame = jest.fn(id => {
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
      getByteFrequencyData: jest.fn(array => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
      }),
      connect: jest.fn()
    };
  }
  
  createMediaStreamSource() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn()
    };
  }
  
  close() {
    this.state = 'closed';
  }
}

global.AudioContext = MockAudioContext;
global.webkitAudioContext = MockAudioContext;

// Mock VisualizationController module using ESM mocking
const mockController = { start: jest.fn(), stop: jest.fn() };
jest.unstable_mockModule('../js/visualization.js', () => ({
  VisualizationController: jest.fn(() => mockController)
}));

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
      fillRect: jest.fn(),
      fillStyle: null
    };
    
    // Mock canvas getContext
    const mockCanvas = document.getElementById('visualizer');
    mockCanvas.getContext = jest.fn(() => mockCanvasContext);
    
    // Create UI instance
    ui = new UI();
    
    // Initialize element
    ui.visualizer = document.getElementById('visualizer');
    
    // Register event handlers
    ui.setupEventBusListeners();
    
    // Spy on UI clearVisualization
    jest.spyOn(ui, 'clearVisualization').mockImplementation(() => {});
    
    // Clear mock calls
    mockController.start.mockClear();
    mockController.stop.mockClear();
    ui.clearVisualization.mockClear();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Basic Visualization Control', () => {
    it('starts visualization on VISUALIZATION_START event if stream is provided', async () => {
      eventBus.emit(APP_EVENTS.VISUALIZATION_START, { 
        stream: {}, 
        isDarkTheme: false 
      });
      
      // Wait for async import to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockController.start).toHaveBeenCalled();
    });

    it('does not start visualization if VISUALIZATION_START event is missing stream', async () => {
      eventBus.emit(APP_EVENTS.VISUALIZATION_START, { isDarkTheme: false });
      
      // Wait for async import to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockController.start).not.toHaveBeenCalled();
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
    it('cleans up visualization when error occurs during recording', async () => {
      // Setup a visualization controller
      ui.visualizationController = mockController;
      
      // Simulate error event
      eventBus.emit(APP_EVENTS.RECORDING_ERROR, { error: 'Test error' });
      
      // Visualization should be stopped and cleaned up
      expect(mockController.stop).toHaveBeenCalled();
      expect(ui.visualizationController).toBeNull();
      expect(ui.clearVisualization).toHaveBeenCalled();
    });
    
    it('cleans up visualization when recording is cancelled', async () => {
      // Setup a visualization controller
      ui.visualizationController = mockController;
      
      // Simulate cancellation event
      eventBus.emit(APP_EVENTS.RECORDING_CANCELLED);
      
      // Visualization should be stopped and cleaned up
      expect(mockController.stop).toHaveBeenCalled();
      expect(ui.visualizationController).toBeNull();
      expect(ui.clearVisualization).toHaveBeenCalled();
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
      expect(ui.clearVisualization).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Theme Switching During Visualization', () => {
    it('applies theme correctly to new visualization', async () => {
      // Import actual VisualizationController for theme testing
      jest.resetModules();
      const { VisualizationController } = await import('../js/visualization.js');
      
      // Create a mock stream
      const mockStream = { getAudioTracks: () => [{ kind: 'audio' }] };
      
      // Mock dark theme
      document.body.classList.add('dark-theme');
      
      // Create a real controller to test theme application
      const realController = new VisualizationController(
        mockStream,
        document.getElementById('visualizer'),
        true
      );
      
      // Check if dark theme background color is used
      realController.start();
      expect(mockCanvasContext.fillStyle).toBe(COLORS.CANVAS_DARK_BG);
      
      // Clean up
      realController.stop();
      document.body.classList.remove('dark-theme');
    });
  });
  
  describe('Multiple Rapid Start/Stop Cycles', () => {
    it('handles multiple start/stop cycles without memory leaks', async () => {
      // Track created controllers
      const controllers = [];
      const originalControllerConstructor = jest.requireMock('../js/visualization.js').VisualizationController;
      
      // Override mock to track instances
      jest.unstable_mockModule('../js/visualization.js', () => ({
        VisualizationController: jest.fn((...args) => {
          const controller = originalControllerConstructor(...args);
          controllers.push(controller);
          return controller;
        })
      }));
      
      // Get reference to mocked module
      const { VisualizationController } = await import('../js/visualization.js');
      
      // Reset UI instance to use our new mock
      ui = new UI();
      ui.visualizer = document.getElementById('visualizer');
      ui.setupEventBusListeners();
      
      // Multiple rapid cycles
      for (let i = 0; i < 5; i++) {
        // Start visualization
        eventBus.emit(APP_EVENTS.VISUALIZATION_START, { 
          stream: { getAudioTracks: () => [{ kind: 'audio' }] }, 
          isDarkTheme: false 
        });
        
        // Wait for async import
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Stop visualization
        eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
        
        // Wait between cycles
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Each controller should have been stopped
      controllers.forEach(controller => {
        expect(controller.stop).toHaveBeenCalled();
      });
      
      // UI should not have a reference to any controller at the end
      expect(ui.visualizationController).toBeNull();
    });
  });
  
  describe('Memory Leak Prevention', () => {
    it('properly disconnects audio nodes and closes audio context when stopped', async () => {
      // Reset mocks to use actual implementation for this test
      jest.resetModules();
      
      // Import actual VisualizationController
      const { VisualizationController } = await import('../js/visualization.js');
      
      // Mock stream and audio nodes with spies
      const mockSource = {
        connect: jest.fn(),
        disconnect: jest.fn()
      };
      
      const mockAnalyser = {
        fftSize: 0,
        frequencyBinCount: 32,
        getByteFrequencyData: jest.fn(),
        connect: jest.fn()
      };
      
      const mockAudioContext = {
        createAnalyser: jest.fn(() => mockAnalyser),
        createMediaStreamSource: jest.fn(() => mockSource),
        close: jest.fn(),
        state: 'running'
      };
      
      // Create controller with mock objects
      const controller = new VisualizationController(
        { getAudioTracks: () => [{ kind: 'audio' }] },
        document.getElementById('visualizer'),
        false
      );
      
      // Replace with our mocks
      controller.audioContext = mockAudioContext;
      controller.source = mockSource;
      controller.analyser = mockAnalyser;
      
      // Simulate animation frame
      controller.animationId = requestAnimationFrame(() => {});
      
      // Stop controller
      controller.stop();
      
      // Verify all cleanup occurred
      expect(cancelAnimationFrame).toHaveBeenCalledWith(controller.animationId);
      expect(mockSource.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
    
    it('handles already disconnected audio nodes gracefully', async () => {
      // Reset mocks to use actual implementation for this test
      jest.resetModules();
      
      // Import actual VisualizationController
      const { VisualizationController } = await import('../js/visualization.js');
      
      // Mock source with disconnect that throws error
      const mockSource = {
        connect: jest.fn(),
        disconnect: jest.fn(() => {
          throw new Error('Already disconnected');
        })
      };
      
      // Mock audio context with close that throws error
      const mockAudioContext = {
        createAnalyser: jest.fn(() => ({
          fftSize: 0,
          frequencyBinCount: 32,
          getByteFrequencyData: jest.fn()
        })),
        createMediaStreamSource: jest.fn(() => mockSource),
        close: jest.fn(() => {
          throw new Error('Already closed');
        }),
        state: 'closed'  // Already closed state
      };
      
      // Create controller with mock objects
      const controller = new VisualizationController(
        { getAudioTracks: () => [{ kind: 'audio' }] },
        document.getElementById('visualizer'),
        false
      );
      
      // Replace with our mocks
      controller.audioContext = mockAudioContext;
      controller.source = mockSource;
      
      // Stop should not throw even though disconnect and close throw
      expect(() => {
        controller.stop();
      }).not.toThrow();
      
      // Verify calls were still attempted
      expect(mockSource.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });
});
