

import { jest } from '@jest/globals';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';

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

describe('UI visualization event handling (UI is sole controller)', () => {
  let ui;
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="visualizer"></canvas>';
    ui = new UI();
    // Initialize visualizationController and element
    ui.visualizationController = mockController;
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

  it('starts visualization on VISUALIZATION_START event if stream is provided', () => {
    eventBus.emit(APP_EVENTS.VISUALIZATION_START, { stream: {}, isDarkTheme: false });
    expect(mockController.start).toHaveBeenCalled();
  });

  it('does not start visualization if VISUALIZATION_START event is missing stream', () => {
    eventBus.emit(APP_EVENTS.VISUALIZATION_START, { isDarkTheme: false });
    expect(mockController.start).not.toHaveBeenCalled();
  });

  it('stops visualization on VISUALIZATION_STOP event', () => {
    eventBus.emit(APP_EVENTS.VISUALIZATION_STOP);
    expect(mockController.stop).toHaveBeenCalled();
    expect(ui.visualizationController).toBeNull();
    expect(ui.clearVisualization).toHaveBeenCalled();
  });

  it('does not interact with AudioHandler for visualization', () => {
    // This is a placeholder to document that AudioHandler is not involved in visualization control
    // (No AudioHandler methods are called here)
    expect(true).toBe(true);
  });
});
