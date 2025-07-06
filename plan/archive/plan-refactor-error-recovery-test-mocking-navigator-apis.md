---
goal: Refactor Error Recovery Tests to Use Proper Navigator API Mocking
version: 1.0
date_created: 2025-07-05  
last_updated: 2025-07-05  
own er: Development Team
tags: [refactor, test, mocking, browser-api]
---

# Introduction

The `tests/error-recovery.test.js` suite currently assigns `navigator.mediaDevices` and `navigator.permissions` directly, leading to test contamination and inconsistent behavior in an ES6 module environment. This plan refactors the tests to define these properties via `Object.defineProperty` on the global `navigator` object with `writable` and `configurable` flags. Each test will reset the navigator properties in a `beforeEach` block to ensure isolation.

## 1. Requirements & Constraints

- **REQ-001**: Define `navigator.mediaDevices` using `Object.defineProperty(global.navigator, 'mediaDevices', { ... })` instead of direct assignment.
- **REQ-002**: Define `navigator.permissions` similarly with proper flags.
- **REQ-003**: Properties must be both `writable: true` and `configurable: true` to allow redefinition between tests.
- **CON-001**: No changes to application source code—only test files are modified.
- **CON-002**: Maintain compatibility with Jest ES6 VM Modules and `jsdom` environment.
- **GUD-001**: Follow patterns from localStorage mocking in settings tests (using `Object.defineProperty`).

## 2. Implementation Steps

1. Locate `tests/error-recovery.test.js` and open the file.
2. At the top of the file or inside the existing `beforeEach`, add:
   ```javascript
   // Backup original navigator references
   const _originalMediaDevices = global.navigator.mediaDevices;
   const _originalPermissions = global.navigator.permissions;

   beforeEach(() => {
     // Define mock mediaDevices API
     Object.defineProperty(global.navigator, 'mediaDevices', {
       value: { getUserMedia: jest.fn(), enumerateDevices: jest.fn() },
       writable: true,
       configurable: true
     });

     // Define mock permissions API
     Object.defineProperty(global.navigator, 'permissions', {
       value: { query: jest.fn().mockResolvedValue({ state: 'prompt', addEventListener: jest.fn(), removeEventListener: jest.fn() }) },
       writable: true,
       configurable: true
     });
   });
   ```
3. In an `afterEach`, restore the original navigator properties:
   ```javascript
   afterEach(() => {
     Object.defineProperty(global.navigator, 'mediaDevices', {
       value: _originalMediaDevices,
       writable: true,
       configurable: true
     });
     Object.defineProperty(global.navigator, 'permissions', {
       value: _originalPermissions,
       writable: true,
       configurable: true
     });
     jest.clearAllMocks();
   });
   ```
4. Remove any direct assignments to `navigator.mediaDevices = ...` or `navigator.permissions = ...` within the test file.
5. Run the suite to confirm `error-recovery.test.js` passes in isolation and does not affect other tests.

## 3. Alternatives

- **ALT-001**: Use `jest.spyOn(global.navigator, 'mediaDevices', 'get')` to mock the getter. Rejected for verbosity and complexity.
- **ALT-002**: Assign directly to `global.navigator` via property deletion and redefinition. Less explicit and may break in locked environments.
- **ALT-003**: Use a custom Jest environment that predefines these properties. Overkill for a single test file.

## 4. Dependencies

- **DEP-001**: Jest ES6 VM Modules configuration (`--experimental-vm-modules`).
- **DEP-002**: `jsdom` environment provided by Jest for global `navigator`.
- **DEP-003**: Existing `error-recovery.test.js` file structure.

## 5. Files

- **FILE-001**: `tests/error-recovery.test.js` — Primary test file to update.
- **FILE-002**: `tests/setupTests.js` — Confirm no conflicting navigator mocks.

## 6. Testing

- **TEST-001**: Run only `error-recovery.test.js` to verify passing tests.
- **TEST-002**: Run the full test suite to ensure no regressions.
- **TEST-003**: Confirm navigator mocks are reset between test cases by inspecting call counts.

## 7. Risks & Assumptions

- **RISK-001**: `Object.defineProperty` may fail if global.navigator is non-configurable in some environments. Mitigation: check `configurable` status or wrap in try/catch.
- **ASSUMPTION-001**: `global.navigator` exists and is mutable in Jest’s `jsdom`.
- **ASSUMPTION-002**: No other tests rely on direct navigator assignments in `error-recovery.test.js`.

## 8. Related Specifications / Further Reading

- Jest Manual Mocks for Global Objects: https://jestjs.io/docs/manual-mocks#mocking-global-objects
- MDN MediaDevices API: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices
- MDN Permissions API: https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
