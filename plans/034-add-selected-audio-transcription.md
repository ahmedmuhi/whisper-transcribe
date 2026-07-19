# Plan 034: Add Selected Audio upload, validation, review, and transcription

> **Required executor profile**: use `gpt-5.6-sol` with **extra-high (`xhigh`)** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: Follow the plan step by step and run every
> verification. “Upload audio” means selecting a local Audio Source; selection
> must never automatically send audio to Azure. Keep the File/Blob in memory,
> out of events/logs/storage, until the User explicitly chooses Transcribe. Stop
> on any STOP condition instead of inventing a second transcription pipeline.
> Update `plans/README.md` when done unless the reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- index.html css/styles.css js/main.js js/ui.js js/audio-handler.js js/api-client.js js/auth-interaction-controller.js js/constants.js js/event-bus.js js/model-adapters/ tests/`
> Plans 031–033 must be complete. Reconcile their final UI, auth-safety, and
> API-client interfaces before proceeding; material drift is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/033-implement-safe-auth-recovery-user-menu.md`
- **Category**: enhancement
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/117

## Why this matters

Downloading an Unsent Recording during authentication recovery is only useful
inside Whisper Transcribe if the User can later select that file and finish the
transcription. Local files are also a genuine day-to-day Audio Source in their
own right. This plan adds that capability using the accepted interaction: an
idle secondary action, transient drag/drop affordance, local review, explicit
Transcribe, and the same final transcript behavior as microphone capture.

Binding sources:

- Selected Audio resolution:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/108#issuecomment-5009032462>
- Primary-source prototype commits: `4ea8173` (Variant B outcome) and `2ec3be9`
  (final combined prototype notes)
- Canonical interaction contract:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>

## Current state

- `index.html:159-169` permanently renders `Nothing transcribed yet` and a
  microphone-only hint. The accepted idle copy is:

  ```text
  Record or upload audio
  Drop an audio file here
  ```

  There is no permanent decorative upload icon in the transcript area.
- `index.html:188+` and `js/ui.js:_controlConfig()` expose one idle
  `Start recording` action. Upload is visible only in authenticated idle state;
  once recording starts, the existing expanded recording island completely
  replaces it.
- `js/audio-handler.js` owns microphone capture and Unsent Recording. Do not
  overload `RecordingStateMachine` with file-selection states; a selected local
  File is not a recording lifecycle transition.
- `AzureAPIClient.transcribe(Blob)` already accepts a Blob-like value and emits
  the shared success/error lifecycle. Reuse it; do not build another fetch or
  token path.
- `js/model-adapters/whisper.js` enforces a 25 MB maximum and maps supported MIME
  types to MP3/MP4/MPEG/MPGA/M4A/WAV/WebM filenames.
- `js/model-adapters/mai-transcribe.js` converts through the existing audio
  converter and enforces a strict under-300-MB limit on the converted WAV.
  That post-conversion limit remains authoritative and must happen before fetch.
- `js/ui.js:746-772` appends successful text and persists it. Selected Audio
  success must use this same path and existing `Transcription complete` status;
  do not add a file-specific success banner.
- `AuthInteractionController` from Plan 033 owns navigation safety. Selected
  Audio must register with that one safety boundary rather than create another
  redirect/logout rule.

Inspect the accepted disposable artifact without merging it:

```bash
git show 4ea8173:AUTH-EXPERIENCE-PROTOTYPE.md
git show 4ea8173:js/prototypes/upload-journey.prototype.js
git show 4ea8173:css/upload-journey.prototype.css
```

Do not copy prototype fixtures, scenario/variant controls, inert actions, or
fake filenames into production.

### Domain language

- **Audio Source**: audio provided for transcription, either microphone capture
  or a selected local file.
- **Selected Audio**: a local Audio Source held in memory for review before
  transcription. It has not yet been sent to Azure.
- Avoid “uploaded audio” before the explicit Azure request and avoid “pending
  upload”; both incorrectly imply transmission.

### Canonical state and presentation

The controller owns these states independently of RecordingStateMachine:

```text
idle -> checking -> ready -> transcribing -> idle (success)
                    |             |
                    |             -> failed -> transcribing (Retry) | idle (Remove)
                    -> unsupported | tooLarge -> checking (Choose another) | idle
```

Accepted Variant B behavior:

- Idle: island shows `Start recording` and secondary `Upload audio`; transcript
  uses the two-line idle copy.
- Drag: only while authenticated/idle, temporarily highlight transcript as
  `Drop an audio file here`; leaving restores normal transcript immediately.
- Selected: ordinary island disappears so a second Audio Source cannot start.
- Checking: transcript surface says `Checking format and file size…` and
  `Nothing has been sent to Azure.`
- Ready: transcript surface shows filename, duration, size, format once; verdict
  names selected model once (`Ready for …`); actions `Transcribe` and `Remove`.
- Unsupported: explain accepted formats and offer `Choose another` / `Remove`.
- Too large: name selected model, actual size, and model limit; offer
  `Choose another` / `Remove`.
- Transcribing: honest indeterminate progress, not a fabricated percentage;
  other Audio Source controls remain unavailable.
- Azure failure: retain Selected Audio and offer `Retry` without re-selection
  plus `Remove`.
- Success: append through the existing transcript path, show the ordinary
  `Transcription complete`, release Selected Audio, and restore idle controls.
  No green `Transcript added`, filename banner, or separate completion screen.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Focused controller tests | `npx vitest run tests/selected-audio.vitest.js tests/audio-source-coordination.vitest.js tests/model-adapters.vitest.js tests/audio-handler-integration.vitest.js` | all pass |
| UI/layout tests | `npx vitest run tests/selected-audio-ui.vitest.js tests/island-controls.vitest.js tests/island-layout-css.vitest.js tests/auth-recovery.vitest.js` | all pass |
| Full coverage | `npm run test:coverage` | all pass; thresholds unchanged |
| Build/lint | `npm run build && npm run lint` | both exit 0 |
| Dependencies/audit/size | `npm run deps:check && npm run deps:check:prod && npm audit --audit-level=high && npm run size` | all exit 0 |
| Browser smoke | `npm run test:browser` | recording and Selected Audio deterministic paths pass |

## Suggested executor toolkit

- Use the accepted prototype only as a visual/state reference.
- Reuse the existing model adapters and `AzureAPIClient`; the API client remains
  the only bearer owner from Plan 032.
- Follow event-payload privacy from Plan 027: emit state/metadata only. Never put
  a File, Blob, ArrayBuffer, object URL, token, or Target URI in event history.
- Use native `<input type="file">`, drag events, buttons, and status semantics;
  verify with a real browser at desktop and 390 px if browser tooling is available.

## Scope

**In scope (only these files):**

- `index.html`
- `css/styles.css`
- `js/main.js`
- `js/ui.js`
- `js/selected-audio-controller.js` (create)
- `js/audio-source-coordinator.js` (create only if needed to enforce one active
  source; do not create a second network client)
- `js/audio-handler.js` (source availability/safety integration only)
- `js/api-client.js` (reuse/validation seam only; no auth ownership change)
- `js/auth-interaction-controller.js` (extend its existing one safety registry)
- `js/constants.js`
- `js/event-bus.js`
- `js/model-adapters/whisper.js` and `js/model-adapters/mai-transcribe.js` only
  if extracting a side-effect-free validation helper avoids duplicate rules
- `tests/selected-audio.vitest.js` (create)
- `tests/selected-audio-ui.vitest.js` (create)
- `tests/audio-source-coordination.vitest.js` (create)
- `tests/audio-handler-integration.vitest.js`
- `tests/model-adapters.vitest.js`
- `tests/auth-recovery.vitest.js`
- `tests/island-controls.vitest.js`
- `tests/island-layout-css.vitest.js`
- `tests/ui-event-bus-proper.vitest.js`
- `tests/helpers/mock-settings-dom.js` only if new production DOM requires it
- `tests/browser/transcription-smoke.spec.js`
- `tests/browser/selected-audio.spec.js` (create)
- `tests/browser/fakes/authentication-factory.js` (test-build scenario only)
- `tests/browser/fixtures/selected-audio.*` (create a generated/harmless fixture
  through existing global setup rather than committing private audio)

**Out of scope:**

- File persistence, history/library, cloud storage, batch upload, URL import,
  server-side jobs, background upload, resumable upload, or multiple selections.
- Automatic transcription on selection/drop.
- Preview playback/editor/waveform for selected files unless required to obtain
  safe duration metadata; no new media player feature.
- New Azure request/token client, API-key fallback, backend, or model.
- Changes to MSAL/cache/scope/callback, User-menu design, Pages, OIDC, RBAC, or Azure.
- Persisting File/Blob contents in localStorage, sessionStorage, IndexedDB,
  events, logs, analytics, or test artifacts.

## Git workflow

- Branch: `advisor/034-selected-audio`
- Rebase onto completed Plan 033.
- Suggested commits:
  1. `feat(audio): add selected audio state and validation`
  2. `feat(ui): add upload and transcript review flow`
  3. `test(audio): cover selected audio recovery and browser flow`
- Do not push, merge, or make live Azure/Microsoft/GitHub calls without operator instruction.

## Steps

### Step 1: Create a memory-only Selected Audio owner

Implement `SelectedAudioController` as the sole owner of the selected File and
its lifecycle. It receives Settings/model access, AuthenticationService
readiness, and the existing AzureAPIClient through injection. It must not import
MSAL, build Authorization, or call fetch directly.

The controller:

- accepts one File at a time only while authenticated and idle;
- stores it only on the controller instance;
- exposes a safe snapshot with state plus display metadata (name, size,
  duration, normalized format, model), never the File;
- emits state-changed events without File/Blob/object URL/URI/token;
- makes no Azure call during `checking` or `ready`;
- releases references/object URLs on Remove, success, replacement, or teardown;
- retains the File on retryable Azure failure;
- revalidates when the selected Transcription Model changes and does not silently
  send against the old model/Target URI.

Do not add Selected Audio states to `RECORDING_STATES` or
`RecordingStateMachine`.

**Verify**:

```bash
npx vitest run tests/selected-audio.vitest.js -t "memory|state|event|model"
```

Expected: state transitions and privacy assertions pass; zero network calls
before explicit Transcribe.

### Step 2: Reuse one authoritative local validation path

Define one supported local-file allowlist consistent with current Whisper
behavior and accepted copy: MP3, MP4, MPEG/MPGA, M4A, WAV, and WebM. Normalize
MIME parameters and use extension fallback only when browser File MIME is empty;
do not trust a conflicting extension over a present unsupported MIME.

Validation stages:

1. selection/checking: non-empty file, supported type/extension, finite size,
   Whisper 25 MB limit when selected, and any safe source-size precheck for MAI;
2. explicit Transcribe: reuse adapter conversion/validation, including MAI's
   strict under-300-MB converted-WAV gate, before fetch.

If MAI conversion discovers an unsupported/corrupt file or oversized result,
return to the corresponding Selected Audio validation state with zero Azure
request; do not mislabel it as a service failure.

Obtain duration with a short-lived object URL/media metadata path. Revoke every
URL on success/error/timeout. A missing duration must be handled honestly rather
than hanging checking forever; use `Duration unavailable` if the file otherwise
passes and the browser cannot expose metadata.

Keep model adapters authoritative. If a reusable side-effect-free validator is
extracted, both controller and `buildRequest` call it so validation cannot drift.

**Verify**:

```bash
npx vitest run tests/selected-audio.vitest.js tests/model-adapters.vitest.js
```

Expected: supported formats, empty/unknown/conflicting type, duration failure,
25-MB boundary, converted 300-MB boundary, zero-fetch validation failures, and
object-URL cleanup pass.

### Step 3: Add idle file selection and transient drag/drop

Add an accessible hidden/native file input and an `Upload audio` secondary
button beside Start recording only in authenticated idle state. Button activation
opens the picker. Drag/drop is accepted only when:

- authentication is ready;
- no recording lifecycle is active;
- no Unsent Recording exists;
- no Selected Audio already exists;
- exactly one file is present.

During a valid drag over the page/transcript, temporarily highlight the
transcript and show `Drop an audio file here`. `dragleave`, Escape, invalid drop,
or cancel restores the ordinary transcript immediately. Prevent the browser
from navigating to a dropped file. Do not make a permanent icon look clickable.

Once a file is selected, hide/remove both idle Audio Source buttons until the
file is removed or succeeds.

**Verify**:

```bash
npx vitest run tests/selected-audio-ui.vitest.js tests/audio-source-coordination.vitest.js tests/island-controls.vitest.js
```

Expected: picker/drop/leave/cancel/concurrency/idle-copy cases pass; no automatic request.

### Step 4: Render canonical Variant B review and recovery states

Make the transcript surface the Selected Audio workspace. Render only safe
metadata via `textContent`, never HTML from the filename. Implement checking,
ready, unsupported, too-large, transcribing, and failed states exactly as the
accepted contract describes.

Use an indeterminate status/spinner for Azure work. Do not invent a percentage
or imply local checking sent audio. In ready state show the selected model only
once. In failure state preserve the file and Retry action. Choose another opens
the picker/replacement flow; Remove returns idle.

All buttons need accurate accessible names, focus progression, status roles,
and disabled states. Reduced motion must remove animation without losing state.

**Verify**:

```bash
npx vitest run tests/selected-audio-ui.vitest.js tests/island-layout-css.vitest.js
```

Expected: every accepted state, focus, escaping filename, narrow layout, and
reduced-motion assertion passes.

### Step 5: Send through the one authenticated transcription path

On explicit Transcribe or Retry:

1. ask the existing authentication-readiness boundary to prove readiness;
2. if interaction is required, retain Selected Audio and enter the one auth
   recovery/safety flow; never redirect automatically;
3. call `AzureAPIClient.transcribe(selectedFile, onProgress)` exactly once;
4. let the adapter perform model-specific body/conversion/limit behavior;
5. on success emit/use the existing transcription-ready path;
6. clear Selected Audio only after text is accepted by the existing UI path;
7. on retryable service failure retain it; on 401/403 use Plan 033 recovery;
8. never place File metadata or audio in API lifecycle events beyond existing
   safe model/status fields.

Do not bypass bounded retries or add a second retry loop at controller level.

**Verify**:

```bash
npx vitest run tests/selected-audio.vitest.js tests/api-client-errors.vitest.js tests/auth-recovery.vitest.js
```

Expected: explicit single submission, bounded API retry only, retained failure,
401/403 safety, and no duplicate POST pass.

### Step 6: Converge success with microphone transcription

Selected Audio success must call the same append/persist/status behavior as
microphone success. Assert:

- text appends with the existing divider;
- `Transcription complete` is the only success status;
- transcript autosave/Restore still works;
- File reference and object URL are released;
- normal idle Record/Upload controls return;
- no filename-specific or green added banner exists.

**Verify**:

```bash
npx vitest run tests/selected-audio-ui.vitest.js tests/transcript-autosave.vitest.js tests/transcript-actions.vitest.js
```

Expected: selected and microphone success share one observable completion path.

### Step 7: Extend authentication navigation safety to Selected Audio

Register SelectedAudioController with the single safety interface from Plan 033.
While Selected Audio exists:

- no automatic sign-in, token-recovery redirect, or logout;
- simple dismiss keeps the file/retry path;
- confirmed Remove/discard is required before navigation;
- because the original file already exists on the User's device, do not create a
  redundant automatic download or claim it was uploaded;
- after return from sign-in, the User may select the original file again.

Do not duplicate the Unsent Recording recovery controller.

**Verify**:

```bash
npx vitest run tests/auth-recovery.vitest.js tests/audio-source-coordination.vitest.js
```

Expected: Selected Audio blocks navigation/logout until explicit removal and
zero redirects occur while retained.

### Step 8: Add deterministic real-browser coverage

Generate a harmless local audio fixture in test setup; do not use personal or
live audio. In the compile-time fake-auth build, exercise:

- upload button → picker → checking → ready → explicit Transcribe → existing transcript;
- drag/drop → ready without automatic request;
- unsupported type;
- Whisper oversized file with zero POST;
- failed Azure request → Retry without re-selection;
- recording hides Upload and Selected Audio hides recording;
- completion restores idle copy/actions;
- desktop and 390 px no overflow;
- no console/page errors;
- one preflight/POST with fake bearer auth for a successful case;
- no File/audio/token in localStorage/sessionStorage/event-history inspection.

**Verify**:

```bash
npm run test:browser
```

Expected: all deterministic browser cases pass with no live Azure call.

### Step 9: Run the integrated quality and privacy gates

```bash
npm run build
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
git diff --check
```

Then scan production code:

```bash
! rg -n "localStorage.*(file|audio|blob)|sessionStorage.*(file|audio|blob)|IndexedDB|indexedDB|Transcript added|pending upload|Uploaded audio" js index.html
```

Expected: all gates pass; no persistence or rejected terminology/extra success UI exists.

## Test plan

- Unit tests for the full Selected Audio state graph and invalid transitions.
- Validation matrix for supported formats, empty/conflicting MIME, zero-byte,
  duration failure, Whisper size boundary, MAI post-conversion size boundary,
  and adapter decode failure before network.
- Event/log/storage privacy tests with a sentinel filename/audio byte sequence.
- Source coordination tests proving only one Audio Source can be active.
- Auth-safety tests proving Selected Audio prevents redirects/logouts.
- UI tests for accepted Variant B states, metadata escaping, focus, status,
  narrow layout, and reduced motion.
- Playwright success/drop/failure/concurrency cases against the built app and
  existing local HTTPS stub.
- Preserve all microphone, worker, retry, transcript, and Settings tests.

## Done criteria

- [ ] Authenticated idle UI offers Start recording + Upload audio and the accepted transcript copy.
- [ ] Drag/drop is transient, idle-only, and cannot navigate the browser to the file.
- [ ] Selection/drop never makes an Azure request; explicit Transcribe is required.
- [ ] Selected Audio is memory-only and File/Blob/object URL never enters storage/events/logs.
- [ ] Local validation names supported formats/model limits and makes zero request on failure.
- [ ] Ready/transcribing/failed states match accepted Variant B and are accessible/responsive.
- [ ] Retry retains the same File and does not add a second retry loop.
- [ ] Recording and Selected Audio cannot run concurrently.
- [ ] Authentication interaction/logout cannot navigate while Selected Audio exists.
- [ ] Success uses ordinary transcript append/autosave/`Transcription complete` and restores idle.
- [ ] No file-specific completion banner or fabricated progress percentage exists.
- [ ] All canonical build, test, lint, dependency, audit, size, and browser gates pass.
- [ ] No live Azure/Microsoft/GitHub action or configuration change occurred.
- [ ] Only in-scope files changed and `plans/README.md` was updated as instructed.

## STOP conditions

Stop and report instead of improvising if:

- `gpt-5.6-sol` with extra-high (`xhigh`) effort is unavailable.
- Plans 031–033 are incomplete or their API/auth/navigation-safety boundaries differ materially.
- File support or a size limit cannot be derived from the retained model adapters
  without duplicating/contradicting their authoritative validation.
- Implementing upload would require a backend, server persistence, direct fetch,
  API-key fallback, token access, or a second retry engine.
- Selected Audio must enter localStorage/sessionStorage/IndexedDB/events/logs to work.
- Browser duration/decode behavior cannot fail safely without hanging or sending audio.
- The accepted Variant B cannot fit desktop/390 px or remain keyboard accessible
  without materially changing the decision; report evidence instead.
- Any real identifier, Target URI, token, key, authentication response, or audio
  would enter a file/log/issue/artifact.
- A live/billable request or external change is required without explicit approval.

## Maintenance notes

- Treat model adapters as the source of truth for format/body/converted-size
  rules. UI copy should derive from shared metadata rather than duplicate magic limits.
- A future batch/history feature needs a new domain/architecture decision; this
  controller deliberately owns one memory-only Selected Audio item.
- Reviewers should trace every success and retry through AzureAPIClient and
  confirm no File/Blob appears in events or application storage.
- If a future Audio Source is added, extend the one coordinator/safety registry;
  do not add parallel recording/auth/logout logic.
