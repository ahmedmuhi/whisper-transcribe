import { afterEach, expect, jest } from '@jest/globals';
import { applyDomSpies as baseApplyDomSpies } from './helpers/test-dom.js';

export const applyDomSpies = baseApplyDomSpies;

// Apply DOM spies once so document API is mocked for all suites
if (global.document) {
  applyDomSpies();
}

// Safety net to ensure DOM spies remain active
afterEach(() => {
  if (global.document) {
    expect(jest.isMockFunction(global.document.getElementById)).toBe(true);
  }
});
