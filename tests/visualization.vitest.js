import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualizationController } from '../js/visualization.js';
import { COLORS } from '../js/constants.js';

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.analyser = {
      fftSize: 0,
      getByteTimeDomainData: vi.fn((array) => {
        array.fill(128);
      })
    };
    this.source = {
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    this.close = vi.fn(async () => {
      this.state = 'closed';
    });
  }

  createAnalyser() {
    return this.analyser;
  }

  createMediaStreamSource() {
    return this.source;
  }
}

function createCanvasMock({ width = 200, height = 100, withRoundRect = true } = {}) {
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    rect: vi.fn()
  };

  if (withRoundRect) {
    ctx.roundRect = vi.fn();
  }

  const canvas = {
    width,
    height,
    parentElement: {
      offsetWidth: width,
      offsetHeight: height
    },
    getContext: vi.fn(() => ctx)
  };

  return { canvas, ctx };
}

describe('VisualizationController direct behavior', () => {
  let rafSpy;
  let cancelRafSpy;

  beforeEach(() => {
    let rafId = 100;
    rafSpy = vi.fn(() => ++rafId);
    cancelRafSpy = vi.fn();

    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelRafSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sets up audio graph and initial canvas sizing in constructor', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const { canvas } = createCanvasMock({ width: 250, height: 80 });
    const controller = new VisualizationController({}, canvas, false);

    expect(controller.analyser.fftSize).toBe(256);
    expect(controller.source.connect).toHaveBeenCalledWith(controller.analyser);
    expect(controller.maxBars).toBe(Math.floor(250 / 5));
    expect(addListenerSpy).toHaveBeenCalledWith('resize', controller.resizeHandler);
  });

  it('starts lifecycle: pre-fills history, draws frame, and starts sampler interval', () => {
    const { canvas, ctx } = createCanvasMock();
    const controller = new VisualizationController({}, canvas, true);

    controller.start();

    expect(controller.amplitudeHistory).toHaveLength(controller.maxBars);
    expect(controller.sampleTimerId).not.toBeNull();
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.roundRect).toHaveBeenCalled();
  });

  it('uses rect fallback when roundRect is unavailable', () => {
    const { canvas, ctx } = createCanvasMock({ withRoundRect: false });
    const controller = new VisualizationController({}, canvas, false);

    controller.start();

    expect(ctx.rect).toHaveBeenCalled();
  });

  it('trims history when canvas width shrinks', () => {
    const { canvas } = createCanvasMock({ width: 300, height: 100 });
    const controller = new VisualizationController({}, canvas, false);

    controller.amplitudeHistory = new Array(80).fill(0.5);
    canvas.parentElement.offsetWidth = 40;
    controller.updateCanvasSize();

    expect(controller.maxBars).toBe(Math.floor(40 / 5));
    expect(controller.amplitudeHistory).toHaveLength(controller.maxBars);
  });

  it('stops lifecycle and cleans up timers, raf, audio, and resize listener', async () => {
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { canvas, ctx } = createCanvasMock();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const controller = new VisualizationController({}, canvas, false);

    controller.start();
    const sampleTimerId = controller.sampleTimerId;
    const animationId = controller.animationId;
    await controller.stop();

    expect(clearIntervalSpy).toHaveBeenCalledWith(sampleTimerId);
    expect(cancelRafSpy).toHaveBeenCalledWith(animationId);
    expect(removeListenerSpy).toHaveBeenCalledWith('resize', controller.resizeHandler);
    expect(controller.source.disconnect).toHaveBeenCalledTimes(1);
    expect(controller.audioContext.close).toHaveBeenCalledTimes(1);
    expect(controller.amplitudeHistory).toEqual([]);
    expect(ctx.fillStyle).toBe(COLORS.CANVAS_LIGHT_BG);
  });

  it('supports repeated stop calls safely', async () => {
    const { canvas } = createCanvasMock();
    const controller = new VisualizationController({}, canvas, false);

    controller.start();
    await controller.stop();
    await controller.stop();
  });
});
