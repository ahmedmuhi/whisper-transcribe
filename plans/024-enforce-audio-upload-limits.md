# Plan 024: Enforce model-specific audio upload limits before network submission

> **Executor instructions**: Follow steps in order and stop on any STOP
> condition. This plan protects service contracts; do not invent a lower product
> recording-duration cap.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- js/audio-handler.js js/constants.js js/model-adapters/whisper.js js/model-adapters/whisper-translate.js js/model-adapters/mai-transcribe.js tests/audio-handler-integration.vitest.js tests/model-adapters.vitest.js`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 021 and 023
- **Category**: perf
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

Recording length and accumulated bytes are currently unbounded. Azure OpenAI
Whisper rejects files over 25 MB; the MAI speech endpoint documents a 500 MB /
five-hour input ceiling. Today an oversized recording consumes memory and
conversion time before receiving a predictable service error, and the same blob
can be offered for futile retry. Encode limits in the adapters and reject before
fetch, while leaving any stricter UX duration policy to a later product decision.

## Current state

- `js/audio-handler.js:187-188` appends every `dataavailable` blob indefinitely.
- `processAndSendAudio()` creates one complete Blob without a size check.
- Whisper adapters append captured audio directly. MAI converts to WAV first,
  so its relevant upload size is the resulting `wavBlob.size`.
- `tests/audio-handler-integration.vitest.js:430-438` explicitly supports a
  timer beyond an hour; this plan does not impose an arbitrary time cutoff.
- Error/status text belongs in `MESSAGES`; model request rules belong in
  adapters, consistent with `CLAUDE.md`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/model-adapters.vitest.js tests/audio-handler-integration.vitest.js tests/recording-integration.vitest.js tests/ui-event-bus-proper.vitest.js` | all pass |
| Full/browser | `npm test && npm run test:coverage && npm run test:browser` | all pass |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**: `js/constants.js`, the three model adapter files,
`js/audio-handler.js` only for retry classification/user messaging,
`tests/model-adapters.vitest.js`, `tests/audio-handler-integration.vitest.js`,
and `plans/README.md` status.

**Out of scope**: automatic stop at an invented duration, streaming uploads,
batch transcription, chunk persistence, conversion optimization, history, or
new Playwright tests.

## Git workflow

- Branch: `fix/024-audio-upload-limits`
- Commit: `fix: enforce transcription upload limits`
- Do not push unless instructed.

## Steps

### Step 1: Pin the limits and error contract

Add named byte constants with source comments for Whisper 25 MB and MAI 500 MB.
Add one shared user-facing message that names the selected model's maximum in
human-readable units and recommends making a shorter recording. Tests must use
small injected/overridden boundary values or Blob size stubs—never allocate
hundreds of megabytes.

**Verify**: constants and adapter boundary tests compile but fail before guards.

### Step 2: Guard Whisper before FormData construction

In both Whisper adapters, reject when the captured Blob exceeds the Whisper
limit; accept exactly the limit. Throw an error with stable metadata identifying
the failure as non-retryable input validation. Do not construct FormData or
invoke fetch after rejection.

**Verify**: below/equal/above boundary tests pass for both adapters.

### Step 3: Guard MAI after conversion and before FormData

Convert using the existing path, inspect the produced WAV size, and reject an
oversized result before appending/request construction. Accept the exact limit.
Do not add a pre-conversion estimate that could reject valid audio.

**Verify**: mocked converter boundary cases pass and the definition/request
shape remains unchanged for accepted audio.

### Step 4: Make limit failures non-retryable in the UI

Carry a stable error property/code through `sendToAzureAPI()` so
`processAndSendAudio()` does not show Retry for an unchanged oversized blob.
Preserve retry for network/transient errors and for configuration errors after
the user can change settings. Do not redesign all HTTP retry classification.

**Verify**: AudioHandler tests prove the blob is retained only as needed for
error reporting but `canRetry` is false for the limit code and true for the
existing recoverable network case.

### Step 5: Run all gates and scope checks

Run every command above, `git diff --check`, and `git diff --name-only`.

## Test plan

- Whisper and Translate accept `limit` and reject `limit + 1`.
- MAI checks converted WAV size, not source WebM size.
- Rejected input creates no request and exposes no Retry button.
- Normal retry, request bodies, Chromium smoke, and live-test configuration are
  unchanged; do not run the live workflow.

## Done criteria

- [ ] Every adapter enforces its documented upload byte ceiling.
- [ ] Boundary equality is explicitly tested without huge allocations.
- [ ] Oversized audio never reaches fetch and is not offered for identical retry.
- [ ] No arbitrary duration limit or new dependency is introduced.
- [ ] All gates pass and scope is clean.

## STOP conditions

- Current official service documentation no longer supports the stated limits.
- Enforcing MAI's limit requires materializing an extra full-size WAV copy.
- Correct behavior requires automatic stopping at a product-selected duration.
- Two in-scope attempts fail a required gate.

## Maintenance notes

Service limits are temporally unstable; review them when adapters or API
versions change. Keep the constants next to request contracts and cite the
official endpoint documentation in comments without embedding credentials.
