---
goal: Refactor Audio Handler Integration Tests to Use Proper Navigator.mediaDevices Mocking
version: 1.0
date_created: 2025-07-05
last_updated: 2025-07-05
owner: Development Team
tags: [refactor, test, mocking, browser-api]
---

# Introduction

The `tests/audio-handler-integration.test.js` suite currently assigns `navigator.mediaDevices` directly, causing test contamination and inconsistent behavior across Jest ES6 VM Modules with the `jsdom` environment. This plan refactors the tests to define the `mediaDevices` property via `Object.defineProperty(global.navigator, 'mediaDevices', ...)` with `writable` and `configurable` flags, and restores the original property in `afterEach` to ensure isolation.

## 1. Requirements & Constraints

- **REQ-001**: Define `navigator.mediaDevices` using `Object.defineProperty(global.navigator, 'mediaDevices', { value: mock, writable: true, configurable: true })` instead of direct assignment.
- **REQ-002**: Properties must be both **writable** and **configurable** to allow redefinition between tests.
- **CON-001**: No changes to application source code—only test files are modified.
- **CON-002**: Maintain compatibility with Jest ES6 VM Modules (`--experimental-vm-modules`) and the `jsdom` environment.
- **GUD-001**: Follow patterns established in other test suites (e.g., error-recovery tests) for global object mocking.

## 2. Implementation Steps

1. Open `tests/audio-handler-integration.test.js` in the editor.
2. At the top of the file (outside any `describe`), backup the original `mediaDevices` reference:
   ```js
   const _originalMediaDevices = global.navigator.mediaDevices;
   ```
3. Inside the existing (or new) `beforeEach` block, redefine `navigator.mediaDevices`:
   ```js
   beforeEach(() => {
     Object.defineProperty(global.navigator, 'mediaDevices', {
       value: {
         getUserMedia: jest.fn().mockResolvedValue(new MediaStream()),
         enumerateDevices: jest.fn().mockResolvedValue([])
       },
       writable: true,
       configurable: true
     });
     // ...existing setup code...
   });
   ```
4. In an `afterEach` block, restore the original property and clear mocks:
   ```js
   afterEach(() => {
     Object.defineProperty(global.navigator, 'mediaDevices', {
       value: _originalMediaDevices,
       writable: true,
       configurable: true
     });
     jest.clearAllMocks();
   });
   ```
5. Remove any direct assignments like `navigator.mediaDevices = ...` from within tests.
6. Ensure existing integration logic remains unchanged and references the mocked API.

## 3. Alternatives

- **ALT-001**: Use `jest.spyOn(global.navigator, 'mediaDevices', 'get')` to mock the getter. Rejected for complexity and compatibility issues.
- **ALT-002**: Delete and recreate `global.navigator` properties wholesale. Rejected for risk of losing other navigator methods.
- **ALT-003**: Create a custom Jest environment pre-populating `mediaDevices`. Overkill for a single test file.

## 4. Dependencies

- **DEP-001**: Jest ES6 VM Modules configuration (`--experimental-vm-modules`).
- **DEP-002**: `jsdom` test environment provided by Jest.
- **DEP-003**: Existence of `tests/audio-handler-integration.test.js` file and its structure.

## 5. Files

- **FILE-001**: `tests/audio-handler-integration.test.js` — Primary test file to update.
- **FILE-002**: `tests/setupTests.js` — Verify no conflicting global mocks.

## 6. Testing

- **TEST-001**: Run only `audio-handler-integration.test.js` to verify it passes and uses the mock as intended.
- **TEST-002**: Run the full test suite to confirm no regressions or leaked mocks.
- **TEST-003**: Inspect call counts on `getUserMedia` and `enumerateDevices` across test cases to ensure isolation.

## 7. Risks & Assumptions

- **RISK-001**: If `global.navigator` is non-configurable, `Object.defineProperty` may throw. Mitigation: wrap define calls in try/catch and fallback to direct assignment.
- **ASSUMPTION-001**: `global.navigator` exists and supports property redefinition in Jest's `jsdom` environment.
- **ASSUMPTION-002**: No other tests depend on the legacy `navigator.mediaDevices` definition within this file.

## 8. Related Specifications / Further Reading

- Jest Manual Mocks for Global Objects: https://jestjs.io/docs/manual-mocks#mocking-global-objects
- MDN MediaDevices API: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices
