---
title: Recording and Audio Source State Design Specification
version: 2.0
date_created: 2025-07-07
last_updated: 2026-07-18
owner: Speech-to-Text Transcription App Team
tags: [design, state-machine, recording, selected-audio, authentication, architecture, app]
---

# Introduction

This specification defines the implemented microphone
`RecordingStateMachine` and its composition with authentication readiness,
Unsent Recording recovery, and the separate `SelectedAudioController`.

The recording FSM remains microphone-only. Selected Audio is not represented by
new recording states. The two owners share one `AzureAPIClient`, one transcript
completion path, and one Audio Source safety boundary.

## 1. Purpose and scope

The recording FSM makes microphone lifecycle transitions predictable and gives
the UI one source of truth for recording controls. `AudioHandler` coordinates
the browser recording APIs, authentication readiness, Azure submission, and
recovery around that FSM.

`SelectedAudioController` owns one local file independently. Application
bootstrap composes both owners so a User cannot activate microphone capture and
Selected Audio at the same time.

This specification covers:

- the exact nine microphone recording states and transition matrix;
- event and control-render ownership;
- authentication and Target URI readiness before recording activation;
- memory-only Unsent Recording retention and navigation safety;
- the separate Selected Audio lifecycle and explicit Transcribe boundary;
- success, authentication, authorization, and retry convergence.

It does not define MSAL internals, model request shapes, Azure RBAC mutation, or
transcript storage implementation.

## 2. Domain definitions

- **Audio Source**: microphone capture or selected local audio supplied by the
  User for transcription.
- **Unsent Recording**: valuable captured audio not yet accepted for
  transcription. It remains memory-only in `AudioHandler` until success or an
  explicit discard.
- **Selected Audio**: a local Audio Source held in memory for review and not yet
  sent to Azure.
- **Authentication readiness**: a safe state returned by
  `AuthenticationService.ensureTokenReady(scope)` before microphone access or a
  Selected Audio submission.
- **Navigation safety**: token-free state used to block redirect/logout while an
  Audio Source could be lost.

## 3. Component ownership

| Concern | Owner |
|---|---|
| Microphone lifecycle state and legal transitions | `RecordingStateMachine` |
| MediaRecorder, stream, chunks, Unsent Recording, retry Blob | `AudioHandler` |
| One memory-only local File and its validation/transcription state | `SelectedAudioController` |
| Authentication state and token readiness | `AuthenticationService` |
| Redirect/logout recovery choices | `AuthInteractionController` |
| One-Audio-Source coordination | `SelectedAudioController.getAudioSafetyState()` composed with `AudioHandler.setAudioSourceCoordinator()` |
| Recording/Selected Audio presentation and completion | `UI` via event bus |
| Azure request, bearer header, errors, bounded retries | shared `AzureAPIClient` |
| Transcript persistence | `TranscriptStore` after `UI_TRANSCRIPTION_READY` |

The FSM MUST NOT own a File, Blob, token, Target URI, User identity, DOM node, or
Azure request. Selected Audio MUST NOT transition the recording FSM.

## 4. Readiness and Audio Source activation

The UI starts in authentication checking. While authentication is not ready,
the idle recording action and Upload audio action are unavailable. A signed-out
or interaction-required User sees explicit **Continue with Microsoft** instead.

Every microphone start still validates prerequisites defensively, even when the
UI is already ready:

```text
User chooses Start recording
  -> reject when Selected Audio exists
  -> protect authentication-failed Unsent Recording
  -> transition IDLE/ERROR -> INITIALIZING
  -> verify browser recording support
  -> require manual Target URI and validate HTTPS
  -> ensure token readiness for the selected adapter scope
  -> request microphone permission
  -> start MediaRecorder
  -> transition INITIALIZING -> RECORDING
```

Authentication readiness therefore occurs before microphone permission and
before active `RECORDING`, although the FSM enters `INITIALIZING` to render the
in-progress prerequisite check. A failure returns to `IDLE` without recording.

Selected Audio selection requires authentication `READY`, no current File, and
`AudioHandler` safety state `SAFE`. A Selected Audio Transcribe action checks
readiness again for the snapshotted model before calling Azure.

## 5. RecordingStateMachine contract

### 5.1 Exact states

| State | Meaning | Handler-owned emissions |
|---|---|---|
| `IDLE` | Ready for a new microphone attempt | default `UI_STATUS_UPDATE` |
| `INITIALIZING` | Checking prerequisites and starting MediaRecorder | initializing status |
| `RECORDING` | Microphone capture active | `RECORDING_STARTED`, recording status |
| `PAUSED` | Capture paused | `RECORDING_PAUSED`, paused status |
| `STOPPING` | Recorder stop/data flush in progress | `RECORDING_STOPPED`, finishing status, `VISUALIZATION_STOP` |
| `PROCESSING` | Captured Blob is being transcribed | processing status |
| `CANCELLING` | Capture is being discarded and cleaned | `RECORDING_CANCELLED`, cancelled status |
| `CONFIRMING_DISCARD` | Substantial active recording awaits Keep/Discard | `DISCARD_CONFIRM_REQUESTED` with duration label |
| `ERROR` | Capture or transcription failed | `RECORDING_ERROR`, error status |

There are exactly nine states. `CONFIRMING_DISCARD` leaves the recorder running
under the dialog until Keep or Discard is selected.

### 5.2 Exact transition matrix

```javascript
const STATE_TRANSITIONS = {
    idle: ['initializing', 'error'],
    initializing: ['recording', 'error', 'idle'],
    recording: ['paused', 'stopping', 'cancelling', 'confirmingDiscard'],
    paused: ['recording', 'stopping', 'cancelling', 'confirmingDiscard'],
    stopping: ['processing', 'error'],
    processing: ['idle', 'error'],
    cancelling: ['idle'],
    confirmingDiscard: ['recording', 'paused', 'cancelling'],
    error: ['idle', 'processing']
};
```

`transitionTo(newState, data)` validates first. An invalid transition logs
through the centralized error handler, returns `false`, and leaves state
unchanged. A valid transition stores `previousState`, updates current state,
emits `RECORDING_STATE_CHANGED`, and then awaits the target handler. If a
handler throws, the new state has already committed and the caller owns
recovery.

### 5.3 Interface

```javascript
class RecordingStateMachine {
    constructor(audioHandler)
    getState(): string
    canTransitionTo(newState): boolean
    transitionTo(newState, data?): Promise<boolean>
    isIdle(): boolean
    isRecording(): boolean
    isPaused(): boolean
    isProcessing(): boolean
    canRecord(): boolean
    canPause(): boolean
    canResume(): boolean
    canInvokeStop(): boolean
    canCancel(): boolean
}
```

`canRecord()` is true in `IDLE` or `ERROR`. `canInvokeStop()` is true in
`RECORDING`, `PAUSED`, `STOPPING`, or `CANCELLING`. Those are FSM capabilities,
not complete application readiness; authentication, configuration, and
Audio Source coordination are checked by the surrounding owners.

## 6. Event and presentation ownership

Every successful transition first emits:

```javascript
{
    newState: '<RECORDING_STATES value>',
    oldState: '<previous value>',
    ...safeTransitionData
}
```

`RECORDING_STATE_CHANGED` is the sole recording-control render input for labels,
enabled state, visible actions, and processing indicator. FSM handlers emit
only their documented domain/status/visualization/discard events. They MUST NOT
emit or manipulate granular button/spinner/reset presentation.

No recording event may contain captured chunks, an Unsent Recording Blob,
Selected Audio File, token, Target URI, authentication response, or transcript
body. `UI_TRANSCRIPTION_READY` is the deliberate transcript-content event and is
not part of the FSM state payload.

## 7. Unsent Recording lifecycle and navigation safety

When MediaRecorder stops normally, `AudioHandler` constructs the captured Blob
and assigns it to `pendingRetryBlob` before calling Azure. That Blob is the
Unsent Recording. It remains in application memory during `PROCESSING` and after
a failed submission.

On success, `AudioHandler` clears the Blob, clears recovery metadata, empties
chunks, and transitions `PROCESSING -> IDLE`.

On failure, `AudioHandler` retains the same Blob and transitions
`PROCESSING -> ERROR` with a safe message and retry capability:

- ordinary retryable application/service failures may use the explicit Retry
  action (`ERROR -> PROCESSING`);
- upload-limit failures are not retryable without a new Audio Source;
- HTTP 401 and 403 require external recovery rather than blind retry.

`getAudioSafetyState()` exposes only:

- `UNSENT` whenever `pendingRetryBlob` exists, including while that Blob is in
  its initial `PROCESSING` attempt or an explicit retry;
- otherwise, `ACTIVE` while microphone initialization, capture, stop,
  processing, or cancellation is active; or
- `SAFE` otherwise.

`AuthInteractionController` uses that token-free state before full-page sign-in
or logout:

- `ACTIVE` blocks navigation;
- `SELECTED` blocks navigation until Selected Audio is removed;
- `UNSENT` offers a local download while retaining the Blob, followed by an
  explicit Continue, or an explicit proportional discard followed by redirect;
- `SAFE` permits the requested redirect.

Downloading marks only that the browser download lifecycle was initiated; it
does not discard the Blob or navigate. No module automatically redirects,
uploads, logs out, or discards an Audio Source.

## 8. Selected Audio contract

`SelectedAudioController` privately owns one `File` and exposes only a frozen,
safe display snapshot. The exact states are:

| State | Entry/meaning | Allowed User recovery |
|---|---|---|
| `IDLE` | no File | Select an Audio Source |
| `CHECKING` | local format/size/duration validation | wait |
| `READY` | accepted for snapshotted model; nothing sent | Transcribe, Remove, or Replace through chooser |
| `UNSUPPORTED` | format or decode cannot be accepted | Choose another or Remove |
| `TOO_LARGE` | model upload limit exceeded | Choose another or Remove |
| `TRANSCRIBING` | explicit request active | wait; navigation remains unsafe |
| `FAILED` | same File retained with safe error | Retry or Remove |

Selection is memory-only. Snapshots/events may contain name, size, optional
duration, format, model, state, and safe error metadata, but never the File,
bytes, object URL, token, or Target URI. Temporary metadata object URLs are
revoked on every outcome.

A model change revalidates the current File unless it is already transcribing.
Before submission the controller checks that the current model still matches
the validated snapshot and ensures authentication readiness for that model's
scope. This prevents stale/ABA model submission.

## 9. One API client and success convergence

Both Audio Sources call the same injected `AzureAPIClient`:

```text
microphone: STOPPING -> PROCESSING -> AzureAPIClient ─┐
                                                     ├─ UI_TRANSCRIPTION_READY
Selected Audio: READY -> TRANSCRIBING -> AzureAPIClient ┘
                                                               │
                                                               └─ UI append + TranscriptStore autosave
```

On Selected Audio success, the controller emits `UI_TRANSCRIPTION_READY`, emits
the temporary completion status, removes the File, and returns to `IDLE`.
On microphone success, `AudioHandler` emits the same transcription-ready and
completion events, clears the Unsent Recording, and transitions to recording
`IDLE`.

The convergence guarantees identical append/divider/autosave behavior without
putting file states into the recording FSM.

## 10. Authentication and authorization recovery

- **Not ready before capture/submit**: emit safe
  `AUTHENTICATION_STATE_CHANGED`, keep network/microphone action gated, and
  present explicit Continue with Microsoft when appropriate.
- **HTTP 401**: retain the Audio Source. For microphone capture, present
  download/discard authentication recovery; for Selected Audio, retain the File
  in `FAILED` for explicit recovery. Never retry or redirect automatically.
- **HTTP 403**: retain the Audio Source and present Azure setup/RBAC guidance.
  The app never assigns a role or broadens authorization.
- **HTTP 429/selected 5xx/timeouts**: use only the bounded API-client behavior;
  then retain the Audio Source for explicit retry when the boundary is
  exhausted.

## 11. Acceptance criteria

- **AC-001**: The FSM implements exactly the nine documented states and exact
  transition matrix.
- **AC-002**: Invalid transitions return false without changing state.
- **AC-003**: Every valid transition emits `RECORDING_STATE_CHANGED` before the
  target handler's documented events.
- **AC-004**: Recording controls render only from recording state changes; no
  handler directly manipulates DOM or emits granular control commands.
- **AC-005**: Signed-out, interaction-required, configuration-failed, or
  authentication-failed state prevents microphone and Upload audio activation.
- **AC-006**: A start attempt verifies HTTPS configuration and token readiness
  before microphone permission and before entering `RECORDING`.
- **AC-007**: A failed microphone submission retains one memory-only Unsent
  Recording until success or explicit discard.
- **AC-008**: Authentication redirect and logout cannot lose active, Unsent, or
  Selected Audio; download alone does not navigate.
- **AC-009**: Selected Audio uses the separate seven-state controller and never
  adds a recording FSM state.
- **AC-010**: Only one Audio Source can be active.
- **AC-011**: Selected Audio sends nothing before explicit Transcribe and
  retains the same File for explicit Retry after ordinary failure.
- **AC-012**: Both sources use the one API client and converge through
  `UI_TRANSCRIPTION_READY` to transcript append/autosave.
- **AC-013**: HTTP 401 and 403 cause distinct, non-retrying recovery while
  retaining valuable audio.
- **AC-014**: No state, snapshot, event, log, or storage record contains audio
  bytes, a File/Blob, bearer token, authentication response, or Target URI.

## 12. Verification

Primary deterministic coverage includes:

- `tests/recording-state-machine.vitest.js` — exact transitions, handler order,
  query methods, and single control-render event;
- `tests/recording-integration.vitest.js` and
  `tests/audio-handler-integration.vitest.js` — MediaRecorder lifecycle,
  readiness, processing, and completion;
- `tests/auth-recovery.vitest.js` and `tests/discard-flow.vitest.js` — Unsent
  Recording download/discard/navigation safety;
- `tests/audio-source-coordination.vitest.js` — one active Audio Source;
- `tests/selected-audio.vitest.js` and `tests/selected-audio-ui.vitest.js` —
  memory-only File state, model revalidation, explicit Transcribe, and recovery;
- `tests/browser/auth-menu-recovery.spec.js` — built-browser checking, 401, 403,
  User menu, and narrow layout behavior;
- `tests/browser/selected-audio.spec.js` — built-browser Variant B selection,
  local validation, explicit request, retry, privacy, and success convergence.

Any change to authentication readiness, navigation safety, recording states,
Selected Audio, API error categories, or completion events requires the full
coverage, lint, dependency, audit, size, and deterministic browser gates.
