# Plan 049: Release the microphone when the blob is built, and report Active (not Unsent) during an in-flight upload

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- js/audio-handler.js tests/audio-handler-integration.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

Two related defects in `js/audio-handler.js`:

1. **Mic held through the upload.** The capture `MediaStream` tracks are
   stopped only *after* `await this.sendToAzureAPI(audioBlob)` resolves, so
   the browser's "microphone in use" indicator and the open device persist for
   the entire upload-and-retry window (up to `TRANSCRIPTION_MAX_TOTAL_MS`,
   180 s). On the failure path the tracks are never stopped at all.
2. **Wrong navigation-safety state mid-upload.** `pendingRetryBlob` is set
   *before* the upload starts, and `getAudioSafetyState()` checks it *first* —
   so during `PROCESSING` the app reports `UNSENT` instead of `ACTIVE`. The
   logout dialog then offers "Discard recording and log out" mid-request,
   contradicting CLAUDE.md's "active audio blocks navigation" and nulling a
   Blob the in-flight request path still references.

## Current state

- `js/audio-handler.js` — `processAndSendAudio` (region around lines 674–684):

```js
const audioBlob = new Blob(this.audioChunks, {
    type: recorderMimeType || chunkWithMimeType?.type || 'audio/webm'
});
this.pendingRetryBlob = audioBlob;
this.pendingRetryDownloadInitiated = false;

const result = await this.sendToAzureAPI(audioBlob);
this.stopStreamTracks(stream);
this.audioChunks.length = 0;
```

- `js/audio-handler.js` — `getAudioSafetyState()` (lines 106–111):

```js
getAudioSafetyState() {
    if (this.pendingRetryBlob) return AUDIO_SAFETY_STATES.UNSENT;
    return ACTIVE_AUDIO_SAFETY_STATES.has(this.stateMachine.getState())
        ? AUDIO_SAFETY_STATES.ACTIVE
        : AUDIO_SAFETY_STATES.SAFE;
}
```

- `ACTIVE_AUDIO_SAFETY_STATES` (near the top of `js/audio-handler.js`, line
  ~28) includes `PROCESSING`.
- `stopStreamTracks(stream)` is an existing idempotent helper in the same
  file — calling it twice on the same stream is safe (stopping a stopped
  track is a no-op in the MediaStream API).
- Existing test `tests/audio-handler-integration.vitest.js` (~line 260)
  asserts `PROCESSING → ACTIVE` but only with `pendingRetryBlob` unset; the
  real mid-upload combination (both true) is untested.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Focused tests | `npx vitest run tests/audio-handler-integration.vitest.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `js/audio-handler.js`
- `tests/audio-handler-integration.vitest.js`

**Out of scope** (do NOT touch, even though they look related):
- `js/auth-interaction-controller.js` and `js/settings-surface.js` — their
  dialog routing is correct once `getAudioSafetyState()` reports honestly.
- `js/recording-state-machine.js` and `STATE_TRANSITIONS` in
  `js/constants.js` — no FSM change is needed.
- `recoverFromRecorderError` / retry flow beyond what Step 1 states.

## Git workflow

- Branch: `advisor/049-mic-release-audio-safety`
- Commit style: conventional commits, e.g. `fix(audio): release mic before upload; report Active during in-flight transcription`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stop the capture tracks as soon as the Blob is assembled

In `processAndSendAudio`, move the `stopStreamTracks(stream)` call to
immediately after the `Blob` is constructed (before `pendingRetryBlob` is
assigned), and KEEP the existing post-await call as an idempotent backstop:

```js
const audioBlob = new Blob(this.audioChunks, { ... });
this.stopStreamTracks(stream);          // release the microphone now
this.pendingRetryBlob = audioBlob;
this.pendingRetryDownloadInitiated = false;

const result = await this.sendToAzureAPI(audioBlob);
this.stopStreamTracks(stream);          // idempotent backstop
```

This also fixes the failure path: if `sendToAzureAPI` throws or returns
failure, the tracks were already stopped.

**Verify**: `npx vitest run tests/audio-handler-integration.vitest.js` → all pass

### Step 2: Reorder `getAudioSafetyState()`

Active FSM states must win over the pending-retry Blob:

```js
getAudioSafetyState() {
    if (ACTIVE_AUDIO_SAFETY_STATES.has(this.stateMachine.getState())) {
        return AUDIO_SAFETY_STATES.ACTIVE;
    }
    return this.pendingRetryBlob
        ? AUDIO_SAFETY_STATES.UNSENT
        : AUDIO_SAFETY_STATES.SAFE;
}
```

**Verify**: `npx vitest run tests/audio-handler-integration.vitest.js` → all pass

### Step 3: Add regression tests

In `tests/audio-handler-integration.vitest.js`, following the harness pattern
already used near line 260:

1. Drive a recording into `PROCESSING` with the API promise held open
   (unresolved mock), assert `getAudioSafetyState()` returns `ACTIVE` even
   though `pendingRetryBlob` is set.
2. Assert every track of the session stream has received `stop()` before the
   API promise resolves (spy on the track's `stop`).
3. Reject the API promise; assert the state becomes `UNSENT` (Blob retained
   for retry) and tracks are stopped.

**Verify**: `npx vitest run tests/audio-handler-integration.vitest.js` → all
pass, including 3 new tests

## Test plan

Covered by Step 3. Also run the full suite: the existing
`PROCESSING → ACTIVE`-with-no-blob test and the retry-flow tests
(`_canRetryTranscription`) must still pass unchanged — they pin behavior this
plan must not alter.

## Done criteria

- [ ] `npm test` exits 0; 3 new tests exist and pass
- [ ] `npm run lint` exits 0
- [ ] In `processAndSendAudio`, `stopStreamTracks` appears before the
      `sendToAzureAPI` await (`grep -n "stopStreamTracks" js/audio-handler.js`)
- [ ] `getAudioSafetyState` checks the FSM state set before `pendingRetryBlob`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code (drift).
- Any existing test asserts `UNSENT` during `PROCESSING` — that means the
  ordering is load-bearing somewhere this plan didn't foresee; report which
  test.
- Moving the track stop breaks a Playwright deterministic test under
  `tests/browser/` (run only if CI does; do not run `test:browser:live`).
- The fix appears to require changes to `js/auth-interaction-controller.js`.

## Maintenance notes

- The visualization controller also holds the stream; releasing tracks early
  stops the waveform at the moment processing begins, which is the correct
  user-visible behavior (recording has ended). If a reviewer sees a frozen
  waveform during upload, that is expected, not a regression.
- Deferred (recorded in the audit backlog, not this plan): the
  device-loss-mid-recording stranding (`handleRecorderStop` silently returns
  when the FSM is not STOPPING/CANCELLING) — a separate M-effort fix.
