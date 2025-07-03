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

// Safety net to ensure DOM spies remain active
afterEach(() => {
  if (global.document) {
    expect(jest.isMockFunction(global.document.getElementById)).toBe(true);
  }
  if (typeof eventBus.getEvents === 'function') {
    expect(eventBus.getEvents().length).toBe(0);
  } else if (eventBus.listenerCount) {
    expect(eventBus.listenerCount()).toBe(0);
  }
});
