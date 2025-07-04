---
goal: Suppress Logger Output During Tests
version: 1.0
date_created: 2025-07-05
last_updated: 2025-07-05
owner: Development Team
tags: [refactor, test, logging]
---

# Introduction

Many test suites produce console output via the application `logger` (e.g., INFO and DEBUG messages). This noise clutters test runs and obscures failures. To improve test readability, we will suppress or mock out logger methods globally in `tests/setupTests.js`.

## 1. Requirements & Constraints

- **REQ-001**: All logger methods (`info`, `debug`, `warn`, `error`) must be replaced with no-op functions during tests.
- **REQ-002**: Suppression must be global—no per-test boilerplate.
- **REQ-003**: Tests depending on logger method calls (e.g., spies on error logging) must continue working.
- **CON-001**: Do not modify application source code; changes only in test setup.
- **CON-002**: Maintain compatibility with Jest ES6 VM Modules and `jsdom` environment.
- **GUD-001**: Follow Jest manual mock patterns for modules.

## 2. Implementation Steps

1. Open `tests/setupTests.js`.
2. Import the `logger` from the application code:
   ```js
   import { logger } from '../js/logger.js';
   ```
3. Replace each method on the `logger` object with a Jest mock or no-op:
   ```js
   beforeAll(() => {
     jest.spyOn(logger, 'info').mockImplementation(() => {});
     jest.spyOn(logger, 'debug').mockImplementation(() => {});
     jest.spyOn(logger, 'warn').mockImplementation(() => {});
     jest.spyOn(logger, 'error').mockImplementation(() => {});
   });
   ```
4. If the logger has a `child` factory that returns new loggers, stub `logger.child` to return an object with the same mocked methods.
5. Ensure exports from `setupTests.js` remain unchanged so existing test imports still work.
6. Run the full test suite to verify no console output appears and all tests pass.

## 3. Alternatives

- **ALT-001**: Redirect `console.log` and related methods instead of mocking `logger`. Rejected because it may suppress other intended console output from third-party libraries.
- **ALT-002**: Create a custom Jest environment that silences all console output. Rejected for complexity and broader impact.

## 4. Dependencies

- **DEP-001**: Jest ES6 VM Modules configuration (`--experimental-vm-modules`).
- **DEP-002**: `jest` global APIs (`jest.spyOn`).
- **DEP-003**: Application `logger` module at `js/logger.js`.

## 5. Files

- **FILE-001**: `tests/setupTests.js` — Primary setup file to update.

## 6. Testing

- **TEST-001**: Run `npm test` and confirm no log messages appear during tests.
- **TEST-002**: Specifically inspect that suites which spy on `logger.error` still detect calls when errors are thrown.

## 7. Risks & Assumptions

- **RISK-001**: Over-mocking may hide legitimate error logs needed for debugging test failures.
- **ASSUMPTION-001**: Tests do not rely on log output content for assertions, except via spies on `logger` methods.

## 8. Related Specifications / Further Reading

- Jest Manual Mocks: https://jestjs.io/docs/manual-mocks
- MDN SpyOn: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Spy
