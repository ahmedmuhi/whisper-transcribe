# Plan 018: Add targeted behavior coverage after test consolidation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 86987bd..HEAD -- tests/discard-flow.vitest.js tests/transcript-store.vitest.js tests/transcript-autosave.vitest.js tests/visualization.vitest.js tests/error-handler.vitest.js tests/ui-event-bus-proper.vitest.js js/audio-handler.js js/transcript-store.js js/ui.js js/visualization.js js/error-handler.js`
> Plans 016 and 017 intentionally change some tests outside this plan's Scope.
> They do not change the six production contracts below. If an in-scope file
> changed, compare the "Current state" excerpts against live code; a semantic
> mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S/M
- **Risk**: LOW
- **Depends on**: plans/016-consolidate-settings-ui-tests.md and plans/017-consolidate-api-adapter-tests.md
- **Category**: tests
- **Planned at**: commit `86987bd`, 2026-07-12

## Why this matters

After duplicate tests are removed, the suite should spend its budget on branch
boundaries and failure behavior that can lose a transcript or strand a user.
Six compact additions cover the exact discard threshold, storage write
failure, the real autosave debounce listener, visualizer sampling math, error
fallback precedence, and native dialog failure. This plan changes tests only;
all six production paths already implement the intended behavior.

## Current state

1. **Discard threshold** — `js/audio-handler.js:293-306` uses a strict `<`:

   ```js
   if (this.getTimerMilliseconds() < DISCARD_CONFIRM_MIN_MS) {
       await this.cancelRecording();
       return;
   }
   await this.stateMachine.transitionTo(RECORDING_STATES.CONFIRMING_DISCARD, {
       durationLabel: this.currentTimerDisplay
   });
   ```

   `tests/discard-flow.vitest.js` covers 5 seconds and 24:31, not 9/10 seconds.

2. **Storage failure** — `TranscriptStore.save()` catches `setItem()` failures
   and debug-logs them (`js/transcript-store.js:48-52`), but the test storage
   never throws.

3. **Autosave debounce** — `js/ui.js:157-166` registers an `input` listener,
   clears the previous timer, and persists after 500 ms. Existing
   `transcript-autosave` tests call `persistTranscript()` directly and never
   invoke the listener.

4. **Visualizer math** — `js/visualization.js:71-80` computes RMS from byte
   time-domain samples and clamps `rms * 15` to 1. Lines 104-109 append samples
   while retaining a fixed rolling-buffer length. Existing tests start the
   lifecycle but never execute the sampling interval.

5. **Error fallback** — `js/error-handler.js:17-21` uses
   `context.code || error.name || 'UNKNOWN_ERROR'` and
   `error.message || MESSAGES.ERROR_OCCURRED`; only the `error.name` + message
   path is tested.

6. **Dialog failure** — `js/ui.js:631-639` emits `DISCARD_KEPT` both when
   `showModal` is unavailable and when it throws. The unavailable branch is
   tested in `ui-event-bus-proper`; the throwing branch is not.

- Repository convention: use Vitest spies/fake timers, reset the singleton
  event bus, restore globals/timers in `afterEach`, and assert emitted
  `APP_EVENTS` rather than adding test-only production hooks.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Discard/UI | `npx vitest run tests/discard-flow.vitest.js tests/ui-event-bus-proper.vitest.js` | all cases pass |
| Transcript | `npx vitest run tests/transcript-store.vitest.js tests/transcript-autosave.vitest.js` | all cases pass |
| Math/error | `npx vitest run tests/visualization.vitest.js tests/error-handler.vitest.js` | all cases pass |
| Full tests | `npm test` | all tests pass |
| Coverage | `npm run test:coverage` | exit 0; coverage rises or stays above existing thresholds |
| Lint | `npm run lint` | exit 0 |
| Dependency check | `npm run deps:check:prod` | exit 0 |
| Size | `npm run size` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `tests/discard-flow.vitest.js`
- `tests/transcript-store.vitest.js`
- `tests/transcript-autosave.vitest.js`
- `tests/visualization.vitest.js`
- `tests/error-handler.vitest.js`
- `tests/ui-event-bus-proper.vitest.js`
- `plans/README.md` (status only)

**Read-only production evidence**:

- `js/audio-handler.js`
- `js/transcript-store.js`
- `js/ui.js`
- `js/visualization.js`
- `js/error-handler.js`

**Out of scope**:

- Any production-code change. A failing characterization is a reportable
  finding, not authorization to fix production.
- Playwright/browser coverage, live Azure, API/adapter tests, Vitest setup, or
  Node-environment migration.
- Changing thresholds, constants, messages, timers, or public behavior.
- Adding worker-equivalence or 503→200 tests: the audit rejected those as
  duplicate/structurally guaranteed coverage.

## Git workflow

- Start only after Plans 016 and 017 are merged/rebased into the branch.
- Branch: `test/018-targeted-test-gaps`
- Commit: `test: cover targeted behavior gaps`
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Pin both sides of the exact discard threshold

In `tests/discard-flow.vitest.js`:

1. Change the short-recording case from `00:05` to `00:09` and keep assertions
   that `cancelRecording()` runs without entering `CONFIRMING_DISCARD`.
2. Add a case at exactly `00:10`. Assert `cancelRecording()` is not called and
   the transition is exactly:

   ```js
   transitionTo(RECORDING_STATES.CONFIRMING_DISCARD, {
       durationLabel: '00:10'
   })
   ```

Retain the long-duration stakes and paused-return tests; they prove different
behavior.

**Verify**: `npx vitest run tests/discard-flow.vitest.js` → all cases pass.

### Step 2: Exercise transcript storage write failure

In `tests/transcript-store.vitest.js`, import `vi` if needed and add one test
using a storage object whose `setItem()` throws a quota-style error. Assert:

- `store.save('valuable transcript')` does not throw;
- `setItem` was attempted once with the configured key and a serialized record.

Do not assert a browser-specific `DOMException` name; the contract is graceful
degradation for any unavailable storage backend. Do not change
`TranscriptStore.save()` to return a new status value.

**Verify**: `npx vitest run tests/transcript-store.vitest.js` → all cases pass.

### Step 3: Test the actual autosave input debounce

In `tests/transcript-autosave.vitest.js`, add a test using Vitest fake timers:

1. Call `ui.setupEventListeners()` so the production `input` listener is
   registered on `ui.transcriptElement`.
2. Find that listener from the element's `addEventListener.mock.calls`; assert
   it exists instead of indexing blindly.
3. Set the transcript to `first`, invoke the handler, advance 300 ms, set it to
   `latest`, and invoke the handler again.
4. At 499 ms after the second input, assert the store has not persisted the
   edit; at 500 ms, assert the stored text is `latest`.
5. Spy on `ui.persistTranscript()` and assert exactly one call. Also assert
   `updateRestoreAffordance()` runs immediately for input and after persistence.
6. Restore real timers in `finally` or `afterEach`, even if an assertion fails.

Do not call `persistTranscript()` directly in this new test; the listener and
timer are the subject.

**Verify**: `npx vitest run tests/transcript-autosave.vitest.js` → all cases
pass without real-time waits.

### Step 4: Cover RMS amplitude and rolling-buffer sampling

In `tests/visualization.vitest.js`, use the existing real
`VisualizationController` and `MockAudioContext`:

1. Add a labelled `it.each` table for `_sampleAmplitude()`:
   - all bytes `128` → exactly `0`;
   - all bytes `136` → approximately `0.9375` (`(136-128)/128 * 15`);
   - all bytes `255` → exactly `1` after clamping.
2. For each case, replace/mock `getByteTimeDomainData` to fill the supplied
   byte, call `_sampleAmplitude()`, and use `toBeCloseTo` only for the fractional
   case.
3. Add one fake-timer test for the sampling interval: start with a small
   `maxBars`, make `_sampleAmplitude()` return a known value, advance 100 ms,
   and assert the new value is at the right edge while history length remains
   `maxBars`. Stop the controller before restoring timers.

Do not export private constants or add production hooks. The values above are
derived from the documented formula and current `AMPLITUDE_SCALE = 15`.

**Verify**: `npx vitest run tests/visualization.vitest.js` → all cases pass and
no timer remains pending.

### Step 5: Cover error code/message precedence and fallbacks

In `tests/error-handler.vitest.js`, retain the existing normal case and add:

1. A context-precedence case where `context.code` differs from `error.name`;
   assert the emitted code is the context code and the same context object is
   included.
2. A fallback case using an error-like object with empty/missing `name` and
   `message`; assert code `UNKNOWN_ERROR` and message
   `MESSAGES.ERROR_OCCURRED`. Import `MESSAGES` rather than duplicating its
   string.

Assert the exact `ERROR_OCCURRED` payload. Do not loosen the existing test to
`objectContaining`.

**Verify**: `npx vitest run tests/error-handler.vitest.js` → all cases pass.

### Step 6: Cover native dialog failure safety

In the `Discard dialog` section of
`tests/ui-event-bus-proper.vitest.js`, add one case adjacent to the existing
supported/unavailable cases:

- assign `ui.discardDialog.showModal = vi.fn(() => { throw new Error(...) })`;
- ensure `ui.discardDialog.open` is false;
- emit `DISCARD_CONFIRM_REQUESTED` with a duration;
- assert `showModal` was attempted once;
- assert `DISCARD_KEPT` was emitted exactly once;
- assert `DISCARD_CONFIRMED` was not emitted.

This is a safety fallback: failure to display a dialog must keep, never discard
or strand, the recording.

**Verify**: `npx vitest run tests/ui-event-bus-proper.vitest.js` → all cases
pass.

### Step 7: Run all gates and verify test-only scope

Run every command in the command table, then:

```bash
git status --short
git diff --check
git diff --stat
git diff --name-only -- js
```

Expected: all gates pass; the last command prints nothing; only the six test
files and the plans status row changed.

## Test plan

| Contract | Cases |
|---|---|
| Discard threshold | 9 seconds silent; exactly 10 seconds confirm |
| Storage failure | throwing `setItem` is swallowed after one attempt |
| Autosave | repeated input debounces to one write of latest text at 500 ms |
| Visualizer | silence, fractional RMS, clamp, fixed-length interval append |
| Error handler | normal, context-code precedence, unknown/generic fallback |
| Dialog safety | supported, unavailable, and throwing `showModal` |

## Done criteria

- [ ] All six contract groups above have explicit tests in their named files.
- [ ] Tests use fake timers or observable promises; no new fixed real-time sleeps.
- [ ] Event payloads and boundary values are exact, not broad truthy assertions.
- [ ] No production file is modified.
- [ ] `npm test`, `npm run test:coverage`, `npm run lint`, `npm run deps:check:prod`, and `npm run size` exit 0.
- [ ] Coverage configuration/thresholds are unchanged.
- [ ] No file outside Scope is modified, except `plans/README.md` status.

## STOP conditions

Stop and report back if:

- Any intended characterization fails against unchanged production code.
- Testing a path requires exporting a private constant, adding a production
  hook, or weakening an assertion.
- Plan 016 or 017 changed an in-scope test fixture so the specified pattern no
  longer applies.
- Fake timers cannot be fully restored or create cross-test leakage.
- A verification fails twice after a reasonable test-only correction.

## Maintenance notes

- Boundary tests should remain next to the owning behavior rather than in a
  generic edge-case file.
- Storage tests should stay backend-agnostic; quota, privacy mode, and disabled
  storage all enter through the same thrown `setItem` seam.
- If the visualizer amplification formula changes intentionally, update the
  derived fractional expectation and document the new tuning rationale.
- Playwright already covers real Chromium capture, worker execution, WAV,
  multipart, DOM, and reload persistence. Do not migrate these small branch
  tests into Playwright.
