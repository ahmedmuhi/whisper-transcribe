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

// Make vi globally available (Vitest's equivalent to Jest's jest)
global.jest = vi;
