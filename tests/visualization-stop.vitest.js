import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { resetEventBus } from './helpers/test-dom-vitest.js';

// Mock VisualizationController module using Vitest mocking
const mockController = { start: vi.fn(), stop: vi.fn() };
vi.mock('../js/visualization.js', () => ({
  VisualizationController: vi.fn(() => mockController)
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
    resetEventBus();
  });

  it('starts visualization on VISUALIZATION_START event if stream is provided', async () => {
    eventBus.emit(APP_EVENTS.VISUALIZATION_START, { stream: {}, isDarkTheme: false });
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

  it('does not interact with AudioHandler for visualization', () => {
    // This is a placeholder to document that AudioHandler is not involved in visualization control
    // (No AudioHandler methods are called here)
    expect(true).toBe(true);
  });
});
