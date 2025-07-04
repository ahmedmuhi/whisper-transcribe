import { afterEach, expect, jest, beforeAll } from '@jest/globals';
import { applyDomSpies as baseApplyDomSpies } from './helpers/test-dom.js';
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
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  jest.spyOn(logger, 'debug').mockImplementation(() => {});
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});
  jest.spyOn(logger, 'child').mockImplementation(() => logger);
});
// Apply DOM spies once so document API is mocked for all suites
if (global.document) {
  applyDomSpies();
}
