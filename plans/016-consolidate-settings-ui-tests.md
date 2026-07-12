# Plan 016: Consolidate Settings and UI tests without losing behavior coverage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 86987bd..HEAD -- js/settings.js tests/settings-unit.vitest.js tests/settings-workflow.vitest.js tests/status-reset.vitest.js tests/status-ownership.vitest.js tests/visualization-stop-expanded.vitest.js tests/visualization.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tests, tech-debt
- **Planned at**: commit `86987bd`, 2026-07-12

## Why this matters

The Settings and UI suites contain a dead production wrapper tested by a full
duplicate validation matrix, an exact status-line duplicate, repeated workflow
assertions, and visualization tests whose names promise real cleanup while they
only call a mock. Removing those tests blindly would lose confidence; this plan
retains the strongest behavior-level assertion for every contract, replaces
weak cases where necessary, and removes the unused production method that only
the tests call. Happy DOM remains the test environment.

## Current state

- `js/settings.js:559-566` contains `validateConfiguration()`, a thin wrapper
  around `getValidationErrors()`:

  ```js
  validateConfiguration() {
      const errors = this.getValidationErrors();
      if (errors.length > 0) {
          eventBus.emit(APP_EVENTS.SETTINGS_VALIDATION_ERROR, { errors });
          return false;
      }
      return true;
  }
  ```

  A repository search at the planned commit finds no production caller; the
  only calls are in `tests/settings-unit.vitest.js`.

- `tests/settings-unit.vitest.js:652-812` gives that unused wrapper 12 direct
  tests, while `getValidationErrors()` and the real `saveSettings()` path have
  their own coverage. The same file also has five separate whitespace cases at
  lines 254-300 for one regular expression.

- `tests/settings-workflow.vitest.js:221-307` already has the two load-bearing
  workflows: `page reload → SETTINGS_LOADED → primary control enabled (real
  path)` and `save settings → SETTINGS_SAVED → primary control enabled (real
  path)`. Weaker listener-only and Issue #32/#34 repetitions appear later in
  the same file.

- `tests/status-reset.vitest.js` has one test. Its complete contract is
  subsumed by `tests/status-ownership.vitest.js:42-52`, which additionally
  checks modifier-class, inline-style, and timeout cleanup.

- `tests/visualization-stop-expanded.vitest.js:288-304` says it proves audio
  node disconnection and context close, but the controller is mocked and the
  assertions only prove `mockController.stop()` was called. The real cleanup
  contract is already asserted in `tests/visualization.vitest.js:123-141`.
  The `handles already disconnected audio nodes gracefully` case at lines
  306-327 throws from a mocked controller; it never executes the guarded
  `source.disconnect()` in `js/visualization.js`.

- Repository conventions from `CLAUDE.md`: tests use Vitest + Happy DOM;
  event-bus state is reset between tests; production coupling remains through
  `APP_EVENTS`; status ownership and reduced-motion behavior are regression
  contracts. Preserve those conventions.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline inventory | `npx vitest list --json | jq 'length'` | prints `393` before edits |
| Focused Settings | `npx vitest run tests/settings-unit.vitest.js tests/settings-workflow.vitest.js` | all remaining tests pass |
| Focused UI | `npx vitest run tests/status-ownership.vitest.js tests/visualization-stop-expanded.vitest.js tests/visualization.vitest.js` | all remaining tests pass |
| Full tests | `npm test` | all files/tests pass |
| Coverage | `npm run test:coverage` | exit 0; thresholds remain statements 85, branches 80, functions 70, lines 85 |
| Lint | `npm run lint` | exit 0 |
| Dependency check | `npm run deps:check:prod` | exit 0 |
| Size | `npm run size` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `js/settings.js`
- `tests/settings-unit.vitest.js`
- `tests/settings-workflow.vitest.js`
- `tests/status-reset.vitest.js` (delete)
- `tests/visualization-stop-expanded.vitest.js`
- `tests/visualization.vitest.js`
- `plans/README.md` (status only)

`tests/status-ownership.vitest.js` is read-only evidence: do not modify it.

**Out of scope**:

- `tests/vitest-setup.js` and Node-environment migration.
- Production Settings validation behavior in `getValidationErrors()` or
  `saveSettings()`.
- UI/FSM behavior, CSS, Playwright tests, and browser-test configuration.
- Adding unrelated coverage gaps; Plan 018 owns those.
- Reformatting entire legacy test files.

## Git workflow

- Branch: `test/016-settings-ui-test-consolidation`
- Use a single logical commit: `test: consolidate settings and UI coverage`.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Capture the baseline and prove the dead wrapper has no caller

Run:

```bash
npx vitest list --json | jq 'length'
rg -n "validateConfiguration\(" js tests --glob '*.js' --glob '*.vitest.js'
```

The first command must print `393`. The search may show the declaration in
`js/settings.js` and calls in `tests/settings-unit.vitest.js`; it must show no
other `js/**` caller. Save the output in the execution notes, not in a new repo
file.

**Verify**: both commands exit 0 and the caller set matches the description.

### Step 2: Remove the unused Settings wrapper and its duplicate matrix

In `js/settings.js`, delete the `validateConfiguration()` JSDoc and method at
current lines 550-566. Do not change `sanitizeInputs()`,
`getValidationErrors()`, or `saveSettings()`.

In `tests/settings-unit.vitest.js`:

1. Delete the complete `describe('validateConfiguration Method', ...)` block.
2. Under `Integration Between Methods`, delete
   `should sanitize inputs before validating configuration` and
   `should use same validation logic in both methods`; keep the
   `getValidationErrors()` integration case.
3. Delete the two misleading edge tests named `should handle validation
   methods with null values` and `should handle validation methods with
   undefined values`; they pin a TypeError from the now-removed wrapper rather
   than a supported contract.
4. In `should handle URL constructor exceptions gracefully`, retain only the
   `getValidationErrors()` assertion; remove the wrapper call/assertion.
5. In `should handle missing DOM elements gracefully`, retain
   `sanitizeInputs()` and `getValidationErrors()` assertions and the expected
   required-field errors; remove every wrapper call/assertion.

**Verify**:

```bash
! rg -n "validateConfiguration\(" js tests --glob '*.js' --glob '*.vitest.js'
npx vitest run tests/settings-unit.vitest.js
```

Expected: the search finds nothing and the Settings unit file passes.

### Step 3: Replace the repeated sanitizer cases with one stronger contract

In `tests/settings-unit.vitest.js`, replace the five API-key tests named:

- `should trim whitespace from API key`
- `should remove newlines from API key`
- `should remove tabs from API key`
- `should remove carriage returns from API key`
- `should handle multiple whitespace characters`

with one test named `removes whitespace and invisible paste artifacts from API
keys`. Build one valid mock key, insert a mixture of spaces, `\n`, `\t`, `\r`,
and at least one `\u200B` zero-width space before/inside/after it, call
`sanitizeInputs()`, and assert that the original valid key remains. Keep the
empty and null tests because they exercise different branches.

**Verify**: `npx vitest run tests/settings-unit.vitest.js` → all tests pass.

### Step 4: Retain only the strongest Settings workflow assertions

In `tests/settings-workflow.vitest.js`, delete these tests because the named
stronger coverage survives:

| Remove | Stronger surviving coverage |
|---|---|
| `should emit SETTINGS_LOADED when checkInitialSettings finds complete configuration` | `page reload → SETTINGS_LOADED → primary control enabled (real path)` |
| `should call checkRecordingPrerequisites when SETTINGS_LOADED is emitted` | same real page-reload path |
| `should include explicit duration in success message` | `save settings → SETTINGS_SAVED → primary control enabled (real path)` asserts the full payload |
| `should still work with existing SETTINGS_UPDATED events` | `SETTINGS_UPDATED → checkRecordingPrerequisites → primary enabled` |
| `should still work with existing SETTINGS_SAVED events` | real save path plus `responds to SETTINGS_SAVED by enabling the primary control` |
| `should handle the complete workflow: open settings → save valid settings → verify all fixes` | real save path plus modal tests in `settings-persistence.vitest.js` |
| `should test microphone activation after valid settings save (Issue #3)` | real save path actually asserts `ui.ready` and the enabled primary control |
| `should handle invalid settings correctly (should NOT trigger fixes)` | invalid-save cases in `settings-persistence.vitest.js` assert no storage write/events |
| `responds to SETTINGS_SAVED by enabling the primary control` | real save path already crosses the same event and asserts readiness |

Keep the incomplete-initial-settings case, the two real-path workflow tests,
the persistence-across-reload case, direct valid/invalid prerequisite tests,
and the `SETTINGS_UPDATED` behavior test.

Remove empty `describe` blocks and obsolete Issue #32/#34 comments only when
their last test is gone. Do not rename surviving tests unnecessarily.

**Verify**: `npx vitest run tests/settings-workflow.vitest.js` → all remaining
tests pass.

### Step 5: Delete the exact status duplicate

Delete `tests/status-reset.vitest.js`. Do not move its test elsewhere;
`status-ownership.vitest.js` already contains the stronger replacement.

**Verify**:

```bash
test ! -e tests/status-reset.vitest.js
npx vitest run tests/status-ownership.vitest.js tests/status-helper.vitest.js
```

Expected: the file is absent and both surviving status suites pass.

### Step 6: Make visualization cleanup tests tell the truth

In `tests/visualization-stop-expanded.vitest.js`:

1. Delete `properly disconnects audio nodes and closes audio context when
   stopped`; it is identical in behavior to the earlier
   `stops visualization on VISUALIZATION_STOP event` and cannot observe real
   audio resources.
2. Delete `handles already disconnected audio nodes gracefully`; its mocked
   controller exception does not exercise audio-node cleanup.
3. Combine the two incorrectly named `cleans up visualization when recording
   state transitions ...` cases into a table-driven test named `retains the
   controller until an explicit VISUALIZATION_STOP for state-only changes`.
   Cover `{recording → error}` and `{cancelling → idle}` and assert retention.
4. Replace fixed `setTimeout(10)` sleeps in the rapid-cycle test with
   `vi.waitFor()` on the observable `start`/`stop` calls. If the existing
   `vi.doMock()` cannot reliably create fresh controller instances because the
   module is already cached, simplify the case to repeated event cycles using
   the established module-level `mockController`; do not add production hooks.

In `tests/visualization.vitest.js`, add one direct resilience test: make the
real controller's `source.disconnect()` and `audioContext.close()` throw, call
`stop()`, and assert it does not throw, clears the history, and paints the
background. This is the truthful replacement for the deleted mock case.

**Verify**:

```bash
npx vitest run tests/visualization-stop-expanded.vitest.js tests/visualization.vitest.js
```

Expected: both files pass with no fixed real-time sleeps.

### Step 7: Run all repository gates and inspect the scope

Run every full verification command from the command table. Then run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: only the in-scope files are changed; `status-reset.vitest.js` is the
only deleted test file; no whitespace errors; all gates pass. The final test
count must be lower than 393, but do not target a number by deleting extra
tests.

## Test plan

- No new product behavior is introduced.
- One new direct visualization resilience test replaces a misleading mock test.
- One mixed-artifact sanitizer test replaces five regex-equivalent cases.
- Strong workflow, status ownership, Settings validation, and real cleanup
  contracts remain.
- Full coverage thresholds must not be reduced or excluded.

## Done criteria

- [ ] `validateConfiguration` has no declaration or call in `js/` or `tests/`.
- [ ] `tests/status-reset.vitest.js` is deleted and status ownership tests pass.
- [ ] The five API-key whitespace tests are replaced by one stronger mixed-artifact test.
- [ ] Every removed workflow test has its named stronger survivor.
- [ ] Visualization cleanup assertions execute either the real controller or an explicitly scoped UI event contract.
- [ ] `npm test`, `npm run test:coverage`, `npm run lint`, `npm run deps:check:prod`, and `npm run size` all exit 0.
- [ ] Coverage thresholds/configuration are unchanged.
- [ ] No files outside Scope are modified, except the status update in `plans/README.md`.

## STOP conditions

Stop and report back if:

- `validateConfiguration()` has any production caller.
- A listed stronger workflow/status assertion no longer exists or no longer
  proves the stated behavior.
- Removing a duplicate lowers coverage below the existing thresholds.
- Visualization cleanup requires a production hook or production behavior
  change to test.
- Any step requires changing `vitest-setup.js`, CSS, Playwright, or public UI
  behavior.
- A verification fails twice after a reasonable correction.

## Maintenance notes

- Future Settings validation changes should be tested once at
  `getValidationErrors()` and once through the real `saveSettings()` workflow,
  not repeated through a wrapper.
- UI event tests may mock controller boundaries; resource-lifecycle tests must
  instantiate the real controller.
- Do not convert the suite to Node as part of this work. The global setup is
  browser-shaped, and the full Happy DOM suite currently completes quickly.
