import { afterEach, expect, vi, beforeAll } from 'vitest';
import { applyDomSpies as baseApplyDomSpies } from './helpers/test-dom-vitest.js';
import { eventBus } from '../js/event-bus.js';
import { logger } from '../js/logger.js';

export const applyDomSpies = baseApplyDomSpies;

export function resetEventBus() {
  if (eventBus?.clear) eventBus.clear();
  else eventBus.removeAllListeners?.();
}

// Suppress VM Modules ExperimentalWarning and logger output globally in tests
// Filter Node process warnings to ignore ExperimentalWarning for ESM modules
process.removeAllListeners('warning');
process.on('warning', warning => {
  if (warning.name === 'ExperimentalWarning') return;
  console.warn(warning);
});

beforeAll(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'debug').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'child').mockImplementation(() => logger);
});

// Apply DOM spies once so document API is mocked for all suites
if (global.document) {
  applyDomSpies();
}

// Phase 2 Enhancement: Setup browser APIs for DOM testing
// localStorage mock (happy-dom provides this, but ensure it's available)
if (!global.localStorage) {
  const localStorageMock = {
    store: {},
    getItem: vi.fn(key => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => { localStorageMock.store[key] = String(value); }),
    removeItem: vi.fn(key => { delete localStorageMock.store[key]; }),
    clear: vi.fn(() => { localStorageMock.store = {}; })
  };
  global.localStorage = localStorageMock;
}

// Canvas API basic mock for visualization tests
if (!global.HTMLCanvasElement) {
  global.HTMLCanvasElement = class HTMLCanvasElement {
    constructor() {
      this.getContext = vi.fn(() => ({
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn()
      }));
    }
  };
}

// Phase 3: Advanced Integration Test Environment
// WebRTC API mocking for audio integration tests
if (!global.navigator?.mediaDevices) {
  global.navigator = {
    ...global.navigator,
    mediaDevices: {
      getUserMedia: vi.fn(() => Promise.resolve({
        getTracks: () => [{ 
          stop: vi.fn(),
          kind: 'audio',
          enabled: true,
          readyState: 'live'
        }],
        getAudioTracks: () => [{ 
          stop: vi.fn(),
          kind: 'audio', 
          enabled: true,
          readyState: 'live'
        }],
        getVideoTracks: () => []
      })),
      enumerateDevices: vi.fn(() => Promise.resolve([
        { deviceId: 'mic1', kind: 'audioinput', label: 'Mock Microphone' }
      ]))
    }
  };
}

// AudioWorklet and Web Audio API mocking
if (!global.AudioContext) {
  global.AudioContext = class AudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
    }
    createMediaStreamSource() { 
      return { 
        connect: vi.fn(),
        disconnect: vi.fn()
      }; 
    }
    createAnalyser() { 
      return { 
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteFrequencyData: vi.fn(),
        getByteTimeDomainData: vi.fn(),
        fftSize: 2048,
        frequencyBinCount: 1024,
        smoothingTimeConstant: 0.8
      }; 
    }
    close() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  };
  global.webkitAudioContext = global.AudioContext;
}

// MediaRecorder API for recording integration tests
if (!global.MediaRecorder) {
  global.MediaRecorder = class MediaRecorder {
    constructor(stream, options = {}) {
      this.stream = stream;
      this.state = 'inactive';
      this.mimeType = options.mimeType || 'audio/webm';
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      this.onstart = null;
      this.onpause = null;
      this.onresume = null;
    }
    start(timeslice) { 
      this.state = 'recording';
      if (this.onstart) this.onstart();
      setTimeout(() => {
        if (this.ondataavailable) {
          this.ondataavailable({ 
            data: new Blob(['mock audio data'], { type: this.mimeType })
          });
        }
      }, 10);
    }
    stop() { 
      this.state = 'inactive';
      setTimeout(() => {
        if (this.onstop) this.onstop();
      }, 10);
    }
    pause() { 
      this.state = 'paused';
      if (this.onpause) this.onpause();
    }
    resume() { 
      this.state = 'recording';
      if (this.onresume) this.onresume();
    }
  };
  
  // MediaRecorder static methods
  global.MediaRecorder.isTypeSupported = vi.fn((type) => {
    return ['audio/webm', 'audio/wav', 'audio/mp4'].includes(type);
  });
}

// Advanced timer management and async utilities for complex flows
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;

// Export utilities for integration tests
global.integrationTestUtils = {
  flushPromises: () => new Promise(resolve => originalSetTimeout(resolve, 0)),
  waitForNextTick: () => new Promise(resolve => process.nextTick(resolve)),
  simulateAsyncDelay: (ms = 10) => new Promise(resolve => originalSetTimeout(resolve, ms)),
  waitForEvent: (emitter, event, timeout = 1000) => {
    return new Promise((resolve, reject) => {
      const timer = originalSetTimeout(() => {
        reject(new Error(`Event ${event} not received within ${timeout}ms`));
      }, timeout);
      
      emitter.once(event, (...args) => {
        clearTimeout(timer);
        resolve(args);
      });
    });
  }
};

// Make vi globally available (Vitest's equivalent to Jest's jest)
global.jest = vi;
