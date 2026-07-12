# Plan 023: Preserve the browser-selected recording container

> **Executor instructions**: Follow this plan exactly, run every gate, and stop
> on any STOP condition. Update only the plan status row in the index.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- js/audio-handler.js js/constants.js js/model-adapters/whisper.js js/model-adapters/whisper-translate.js tests/audio-handler-integration.vitest.js tests/model-adapters.vitest.js`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 021
- **Category**: bug
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

`MediaRecorder` selects a supported container and exposes it as `mimeType`, but
the application relabels every recording `audio/webm` and every Whisper upload
`recording.webm`. Browsers that produce MP4 or another Azure-supported format
can therefore send bytes under incorrect MIME and filename metadata. Carry the
actual container from capture into the adapter while preserving Chromium WebM
and MAI's deliberate WAV conversion.

## Current state

- `js/audio-handler.js:182` constructs `new MediaRecorder(stream)` without
  forcing a type; the browser selects one.
- `processAndSendAudio()` at `:373` uses
  `new Blob(this.audioChunks, { type: 'audio/webm' })` unconditionally.
- `DEFAULT_FILENAME = 'recording.webm'` at `js/constants.js:227` is used by both
  Whisper adapters.
- MAI accepts the captured blob only as decoder input and uploads a converted
  `recording.wav`; that path must remain unchanged.
- MDN's `dataavailable` guidance constructs the final Blob with
  `mediaRecorder.mimeType`. Azure Whisper supports MP3, MP4, MPEG, MPGA, M4A,
  WAV, and WebM. Do not add a codec or runtime dependency.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/audio-handler-integration.vitest.js tests/model-adapters.vitest.js tests/recording-integration.vitest.js` | all pass |
| Full/browser | `npm test && npm run test:coverage && npm run test:browser` | all pass |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all exit 0 |

## Scope

**In scope**:

- `js/audio-handler.js`
- `js/constants.js`
- `js/model-adapters/whisper.js`
- `js/model-adapters/whisper-translate.js`
- `tests/audio-handler-integration.vitest.js`
- `tests/model-adapters.vitest.js`
- `plans/README.md` status

**Out of scope**:

- MAI WAV format, audio conversion/resampling, Worker code, recording limits,
  configurable language, or surfacing Whisper Translate.
- Multi-browser Playwright expansion; use deterministic unit/integration
  coverage and retain the existing Chromium smoke.
- Forcing one MIME type when the browser naturally produces an Azure-supported
  type.

## Git workflow

- Branch: `fix/023-recording-container-metadata`
- Commit: `fix: preserve recorded audio container metadata`
- Do not push unless instructed.

## Steps

### Step 1: Define the capture metadata contract with tests

Extend the MediaRecorder mock with `mimeType`. Cover at least WebM and MP4.
After stop, assert the Blob passed to the API client has the recorder-selected
type. Add an empty/unknown type case that uses a documented safe fallback.

**Verify**: AudioHandler tests fail against the hardcoded WebM Blob.

### Step 2: Preserve the recorder-selected MIME type

Capture the recorder MIME type before cleanup and build the combined Blob with
it. If it is empty, use the first non-empty chunk type; only then fall back to
the existing WebM type. Normalize parameters (such as codecs) only for filename
mapping, not for the Blob's actual `type`.

**Verify**: WebM, MP4, and fallback capture tests pass.

### Step 3: Select a matching Whisper filename

Add a small pure helper or adapter-local mapping from supported MIME/container
to an ASCII filename extension. Pass a filename matching the Blob type to both
Whisper adapters. Preserve `recording.webm` for WebM and existing tests; cover
MP4/M4A/WAV types. Unknown types must fail clearly before fetch rather than
lying about WebM.

Do not change the adapter public registry shape unless a small shared helper
cannot express this safely.

**Verify**: adapter tests inspect native FormData stand-in entries and prove
matching type/filename pairs for Whisper and Translate.

### Step 4: Prove MAI is unchanged

Assert MAI still receives captured input, converts it, and uploads
`audio/wav` as `recording.wav` with the same definition body.

**Verify**: focused adapter tests and browser smoke pass.

### Step 5: Run all gates and scope audit

Run the command table, `git diff --check`, and `git diff --name-only`.

## Test plan

- Recorder WebM → WebM Blob → `recording.webm`.
- Recorder MP4 → MP4 Blob → `recording.mp4`.
- Empty recorder MIME falls back to chunk type, then existing WebM default.
- Unsupported type fails before fetch with an actionable message.
- MAI remains WAV-only at the upload boundary.

## Done criteria

- [ ] The final capture Blob uses actual recorder/chunk MIME metadata.
- [ ] Whisper upload filename matches its container.
- [ ] Chromium/WebM and MAI/WAV behavior remains byte/request compatible.
- [ ] No new browser matrix or dependency is added.
- [ ] All gates pass and scope is clean.

## STOP conditions

- The executor cannot identify a stable selected MIME type from MediaRecorder or
  emitted chunks in the real Chromium smoke.
- Azure support requires transcoding non-WebM Whisper audio.
- The fix requires changes to the MAI converter/worker.
- A gate fails twice after an in-scope attempt.

## Maintenance notes

When adding a capture format, update the MIME-to-extension test matrix. Keep
container metadata separate from MAI's model-required WAV normalization.
