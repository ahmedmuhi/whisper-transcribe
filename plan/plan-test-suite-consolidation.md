# Test Suite Consolidation & Cleanup Plan

Audit date: 2026-04-06. Current state: 27 test files, ~295 tests. The suite has grown organically and needs cleanup.

## Critical Issues (Fix First)

### 5 Broken Test Files
These files reference `ID.GPT4O_SETTINGS`, `ID.GPT4O_URI`, `ID.GPT4O_KEY` which were removed when GPT-4o was replaced with MAI-Transcribe. They crash at import time.

| File | Issue |
|---|---|
| `settings-dom-caching.vitest.js` | Stale `ID.GPT4O_*` refs |
| `settings-persistence.vitest.js` | Stale `ID.GPT4O_*` refs |
| `settings-workflow-fixes.vitest.js` | Stale `ID.GPT4O_*` refs + duplicate import on line 10 |
| `settings-workflow-issues.vitest.js` | Stale `ID.GPT4O_*` refs |
| `settings-save-modal.vitest.js` | Duplicate import on line 10 |

**Fix:** Update all `GPT4O_*` references to `MAI_TRANSCRIBE_*`. Remove duplicate imports.

### Jest API Mismatch
3 files use `jest.useFakeTimers()` / `jest.advanceTimersByTime()` via a compatibility shim (`global.jest = vi`). This is fragile and may silently produce incorrect results.

| File |
|---|
| `audio-handler-integration.vitest.js` |
| `error-recovery.vitest.js` |
| `recording-integration.vitest.js` |

**Fix:** Replace all `jest.*` calls with `vi.*` equivalents.

### Stale Model Reference
- `api-client-validation.vitest.js` line 159: Tests `gpt-4o` model which no longer exists.
**Fix:** Replace with `mai-transcribe`.

## Remove Redundant Files

| Remove | Keep (superset) | Reason |
|---|---|---|
| `ui-event-bus.vitest.js` (17 tests) | `ui-event-bus-proper.vitest.js` (20 tests) | Strict subset |
| `visualization-stop.vitest.js` (4 tests) | `visualization-stop-expanded.vitest.js` (10 tests) | Strict subset + has a no-op test |
| `settings-validation.vitest.js` (23 tests) | `settings-helper-methods.vitest.js` (56 tests) | Almost entirely duplicated |

**Net impact:** -3 files, -44 tests removed, zero coverage loss.

## Remove Dead Files

| File | Reason |
|---|---|
| `tests/setupTests.js` | Legacy Jest setup file, imports `@jest/globals` and non-existent `test-dom.js`. Only `vitest-setup.js` is active. |

## Consolidation Candidates

These files have heavy overlap and could be merged into fewer, better-organized files:

### Settings Tests (8 files → 3-4 files)
Currently: `settings-dom-caching`, `settings-helper-methods`, `settings-persistence`, `settings-save-modal`, `settings-sidebar-behavior`, `settings-validation`, `settings-workflow-fixes`, `settings-workflow-issues`

Proposed:
- `settings-unit.vitest.js` — sanitization, validation, DOM caching (merge helper-methods + validation + dom-caching)
- `settings-persistence.vitest.js` — save/load/events (keep, fix stale refs)
- `settings-sidebar.vitest.js` — sidebar behavior (keep as-is)
- `settings-workflow.vitest.js` — end-to-end workflows (merge workflow-fixes + workflow-issues + save-modal + microphone-activation-analysis)

### Recording Tests (3 files → 2 files)
Currently: `audio-handler-integration`, `recording-integration`, `error-recovery`

Significant overlap in error recovery and lifecycle testing. Consider merging `error-recovery` into `recording-integration` since they test the same flows.

## Missing Test Coverage

These source modules have no or inadequate direct tests:

| Module | Current Coverage | Recommendation |
|---|---|---|
| `js/logger.js` | None (always mocked) | Add basic unit tests: log levels, `child()` scoping, environment detection |
| `js/event-bus.js` | None (used but not tested directly) | Add unit tests: on/off/once, priority ordering, history tracking, clear |
| `js/visualization.js` | Always mocked | Add unit tests: start/stop lifecycle, canvas rendering setup, cleanup |
| `js/recording-state-machine.js` | Only `canInvokeStop()` tested | Add: `transitionTo()` valid/invalid, `getState()`, all query methods, state handlers |
| `js/status-helper.js` | 1 edge case test | Add: color mapping, duration=0, missing element handling |

### Implementation Status (2026-04-06)

Missing direct coverage implementation has been started and completed for the modules listed above.

Added/expanded test suites:
- `tests/logger.vitest.js`
- `tests/event-bus.vitest.js`
- `tests/visualization.vitest.js`
- `tests/recording-state-machine.vitest.js` (expanded from single `canInvokeStop()` focus)
- `tests/status-helper.vitest.js`

Validation run:
- `npm run test -- tests/logger.vitest.js tests/event-bus.vitest.js tests/visualization.vitest.js tests/recording-state-machine.vitest.js tests/status-helper.vitest.js`
- Result: 5 files passed, 40 tests passed.

## Misplaced Test

- `jsdoc-generation.vitest.js` — runs `npx jsdoc` as a subprocess. This is a build/tooling check, not a unit test. Should be a separate CI step or moved to a `tests/tooling/` directory.

## Summary

| Action | Files Affected | Tests Impact |
|---|---|---|
| Fix broken files (GPT4O refs, imports) | 5 files | ~31 tests restored |
| Fix Jest→Vitest API calls | 3 files | Tests become reliable |
| Remove redundant files | -3 files | -44 tests (no coverage loss) |
| Remove dead setup file | -1 file | — |
| Consolidate settings tests | 8 → 3-4 files | Same tests, fewer files |
| Add missing coverage | +5 new files | +~30-40 new tests |

**Target state:** ~20 test files (down from 27), ~280 tests, all green, no broken/stale/redundant tests, and coverage for currently-untested modules.
