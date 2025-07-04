import { afterEach, expect, jest } from '@jest/globals';
import { applyDomSpies as baseApplyDomSpies } from './helpers/test-dom.js';
import { eventBus } from '../js/event-bus.js';

export const applyDomSpies = baseApplyDomSpies;

export function resetEventBus() {
  if (eventBus?.clear) eventBus.clear();
  else eventBus.removeAllListeners?.();
}

// Apply DOM spies once so document API is mocked for all suites
if (global.document) {
  applyDomSpies();
}
