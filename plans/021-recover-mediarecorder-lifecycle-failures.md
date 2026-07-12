# Plan 021: Recover atomically from MediaRecorder lifecycle failures

> **Executor instructions**: Execute each step and verification in order. Stop
> on any STOP condition. Modify only scoped files and update only the plan status
> row unless the reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- js/audio-handler.js js/constants.js tests/audio-handler-integration.vitest.js tests/recording-integration.vitest.js`
> Changes to startup ordering, stop handling, or the recorder mock are semantic
> drift and require reconciliation before execution.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

Recorder startup currently enters `RECORDING` before construction/start can
fail, but `RECORDING → ERROR` is illegal; a live microphone can be left behind.
Likewise, `stop()` exceptions are swallowed after entering `STOPPING`, and the
existing test explicitly accepts the stranded state. Fatal MediaRecorder error
events are not handled at all. Make construction, start, runtime error, and stop
failure paths terminate tracks, stop visualization/timers, and land in one
recoverable `ERROR` state without double cleanup.

## Current state

- `js/audio-handler.js:130-145` acquires a stream, transitions to `RECORDING`,
  then calls `startRecording(stream)` inside the outer catch.
- `js/constants.js:414` does not permit `RECORDING → ERROR`, so a constructor or
  `start()` exception cannot complete the attempted error transition.
- `startRecording()` registers only `dataavailable` and `stop` listeners
  (`:187-208`), not the standard fatal `error` event.
- `safeStopRecorder()` catches and emits `RECORDING_ERROR` (`:222-228`) but does
  not report failure to `stopRecordingFlow()`. The test at
  `tests/audio-handler-integration.vitest.js:183-205` expects `STOPPING`.
- `cleanup()` resets local fields but does not own stream tracks; recovery must
  receive/retain the active stream explicitly.
- Preserve the FSM as the single UI control source and use existing error-state
  status rendering; do not reintroduce granular button events.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/audio-handler-integration.vitest.js tests/recording-integration.vitest.js tests/recording-state-machine.vitest.js tests/ui-event-bus-proper.vitest.js` | all pass |
| Full/coverage | `npm test && npm run test:coverage` | all pass and thresholds hold |
| Browser | `npm run test:browser` | existing real recorder smoke passes |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all exit 0 |

## Scope

**In scope**:

- `js/audio-handler.js`
- `js/constants.js` only if one user-facing recorder failure message is needed
- `tests/audio-handler-integration.vitest.js`
- `tests/recording-integration.vitest.js`
- `plans/README.md` (status only)

**Out of scope**:

- Changing the legal FSM matrix unless startup recovery cannot be made atomic
  while remaining in `INITIALIZING`; prefer correct operation ordering.
- MIME/container selection (Plan 023), size limits (Plan 024), API retry policy,
  or permission subscription cleanup (Plan 026).
- New Playwright cases or physical-microphone testing.

## Git workflow

- Branch: `fix/021-mediarecorder-lifecycle-recovery`
- Commit: `fix: recover from recorder lifecycle failures`
- Do not push unless instructed.

## Steps

### Step 1: Add red tests for each failure boundary

Extend the existing recorder mock and write tests for: constructor throws,
`start()` throws, a fatal `error` event, and `stop()` throws. Each must assert
tracks stopped, timers cleared, visualization stopped where it started, partial
recorder state cleared, and final FSM state `ERROR`. Assert one user-facing
error transition, not merely a detached `RECORDING_ERROR` event.

**Verify**: focused AudioHandler test file fails against current production for
the expected stranded/leaked-resource reasons.

### Step 2: Make startup commit only after MediaRecorder starts

Keep the FSM in `INITIALIZING` while constructing the recorder, registering
handlers, and invoking `start(250)`. Only after `start()` returns successfully
transition to `RECORDING`, start visualization, establish timer state, and emit
recording semantics. If setup fails, stop every acquired track and roll back
partial resources before transitioning `INITIALIZING → ERROR`.

Avoid a transient `RECORDING` event for a recorder that never started. If the
browser's `start` event is needed to prove readiness, STOP: that is a larger
async contract decision than this plan assumes.

**Verify**: constructor/start failure tests pass and normal recording tests
retain event order expected by the real browser smoke.

### Step 3: Handle fatal recorder error events

Register one `error` listener alongside `dataavailable`/`stop`. Route it through
an idempotent recovery helper that stops tracks, visualization, and timer,
cleans local recording fields, and transitions the current active state to
`ERROR` only when legal. Guard against the subsequent browser `stop` event
running processing or cleanup twice.

Replace the current no-op “cleans up after MediaRecorder errors” test: today it
iterates an empty handler array and then tests a normal stop.

**Verify**: the fatal-event test invokes a real registered mock listener and
asserts no transcription request occurs.

### Step 4: Return stop success and recover on failure

Make `safeStopRecorder()` return a clear result or throw to its owning flow;
do not swallow and orphan the exception. `stopRecordingFlow()` must transition
`STOPPING → ERROR`, stop retained tracks, and clean timer/visualization on
failure. Ensure successful `stop()` still waits for the normal stop event so
captured chunks are processed exactly once.

**Verify**: replace the old expectation of stranded `STOPPING` with `ERROR` and
resource cleanup; normal stop/transcription tests remain green.

### Step 5: Run all gates

Run the command table, `git diff --check`, and a scope audit.

## Test plan

- Constructor failure and `start()` failure before `RECORDING` commit.
- Fatal MediaRecorder `error` event, including later `stop` event idempotence.
- Synchronous `stop()` failure from recording and paused states.
- Normal stop still transcribes one blob; confirmed discard still reaches IDLE.
- Tracks, timers, visualization, and FSM state are asserted in every branch.

## Done criteria

- [ ] No setup failure can leave the FSM in `RECORDING` or a track live.
- [ ] Fatal recorder errors are actually subscribed and tested.
- [ ] Stop failure cannot leave the FSM in `STOPPING`.
- [ ] Normal capture, discard, retry, and Chromium smoke remain unchanged.
- [ ] All gates pass and scope is clean.

## STOP conditions

- Correct startup requires awaiting the asynchronous recorder `start` event.
- Browser behavior requires changing the FSM transition matrix.
- Recovery cannot distinguish a failure from the normal stop event without a
  new cross-module lifecycle abstraction.
- Two reasonable in-scope attempts fail a required gate.

## Maintenance notes

Plans 023 and 024 build on this lifecycle boundary; land this first. Review for
double transitions and double track stopping—both should be harmless but the
test suite must prove transcription never runs after a fatal recorder failure.
