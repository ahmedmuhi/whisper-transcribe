---
goal: Refactor Magic Values in Timer Logic
version: 1.0
date_created: 2025-07-05
owner: Development Team
tags: [refactor, technical-debt, constants]
---

# Introduction

This plan describes how to remove hard-coded "magic" values for timer intervals, display formats, and related delays by centralizing them into named constants. This improves maintainability, configurability, and readability of the timing logic in the application.

## 1. Requirements & Constraints

- **REQ-001**: All timer-related numeric values (e.g., 1000ms interval) must be defined in `js/constants.js`.
- **REQ-002**: All display format strings (e.g., "MM:SS") must use descriptive constant identifiers.
- **CON-001**: Do not alter existing timer behavior or introduce visible timing regressions.
- **CON-002**: Maintain ES module imports and existing constants organization structure.
- **GUD-001**: Follow existing code style and naming conventions in `constants.js`.

## 2. Implementation Steps

1. Open `js/constants.js` and add new entries under a `TIMER_CONFIG` object:
   - `TIMER_CONFIG.INTERVAL_MS` (ms between timer updates)
   - `TIMER_CONFIG.DEFAULT_DISPLAY` (initial timer display string)
   - `TIMER_CONFIG.GRACEFUL_STOP_DELAY_MS` (delay before recorder flush)
2. In `js/audio-handler.js`, replace hard-coded values:
   - Replace `1000` in `startTimer()` with `TIMER_CONFIG.INTERVAL_MS`.
   - Replace default display `'00:00'` in constructor and cleanup with `TIMER_CONFIG.DEFAULT_DISPLAY`.
   - Use `TIMER_CONFIG.GRACEFUL_STOP_DELAY_MS` as the default `delayMs` in `gracefulStop()`.
3. Update `js/recording-state-machine.js`:
   - Search for any occurrences of numeric timer values (e.g., `1000`, `60000`).
   - If found, replace with corresponding `TIMER_CONFIG` constants or compute from them:
     - Use `TIMER_CONFIG.INTERVAL_MS` where applicable.
     - For conversion factors (minutes to ms), define separate constants if needed.
   - Import `TIMER_CONFIG` and update import statements.
4. Import `TIMER_CONFIG` where needed in any modules using timer logic:
   ```js
   import { TIMER_CONFIG } from './constants.js';
   ```
5. Add or verify comments in `js/constants.js`:
   - Ensure each `TIMER_CONFIG` property has descriptive JSDoc explaining purpose and usage.
   - Group `TIMER_CONFIG` under related constants section.
6. Remove leftover numeric literals or magic strings:
   - Run `grep -R "\b1000\b" js/` to locate any direct usages.
   - Replace each with the appropriate `TIMER_CONFIG` constant or new named constant.
   - Commit and run tests to confirm no regression.

## 3. Alternatives

- **ALT-001**: Leave magic values inline and document them. (Rejected: defeats maintainability goal.)
- **ALT-002**: Expose timer settings via user configuration. (Overengineering for current scope.)

## 4. Dependencies

- **DEP-001**: `js/constants.js` must be accessible and imported by timer modules.
- **DEP-002**: Existing timer tests must adapt to use constants rather than inline values.

## 5. Files

- **FILE-001**: `js/constants.js` — add `TIMER_CONFIG` constants.
- **FILE-002**: `js/audio-handler.js` — replace magic values.
- **FILE-003**: `js/recording-state-machine.js` — update timer logic if applicable.
- **FILE-004**: `tests/` — update or add tests for timer behavior.

## 6. Testing

- **TEST-001**: Verify that `startTimer()` increments time at the configured interval.
- **TEST-002**: Verify timer display matches the format pattern constant.
- **TEST-003**: Confirm graceful stop executes after `GRACEFUL_STOP_DELAY_MS`.
- **TEST-004**: Run full recording flow tests to ensure no regression in timing behavior.

## 7. Risks & Assumptions

- **RISK-001**: Mistyping constant names may break timer functionality.
- **ASSUMPTION-001**: All magic values are documented and discovered via code search.
- **ASSUMPTION-002**: No dependent third-party code expects literal values.

## 8. Related Specifications / Further Reading

- Coding Conventions for Constants: https://github.com/ahmedmuhi/whisper-transcribe/blob/main/js/constants.js
- JSDOC_STYLE_GUIDE.md — documentation of constant definitions
