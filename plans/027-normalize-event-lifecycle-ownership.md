# Plan 027: Normalize API lifecycle events and opt in to event history

> **Executor instructions**: Follow all steps, preserve event names, and stop on
> any contract mismatch. Update only the plan's index status.
>
> **Drift check (run first)**: `git diff --stat e646249..HEAD -- js/event-bus.js js/api-client.js js/audio-handler.js js/recording-state-machine.js tests/event-bus.vitest.js tests/model-adapters.vitest.js tests/audio-handler-integration.vitest.js tests/recording-state-machine.vitest.js`

## Status

- **Priority**: P2
- **Effort**: S/M
- **Risk**: LOW
- **Depends on**: Plan 021
- **Category**: tech-debt
- **Planned at**: refreshed at commit `e646249`, 2026-07-13 (after Plans 021, 023, 024, and 026)

## Why this matters

One successful transcription emits API start and success twice from different
layers, with one structured payload and one empty payload. Separately, EventBus
retains the last 50 full payloads—including MediaStreams and transcript text—in
production although no production caller reads history. Give the API client
sole lifecycle ownership and make diagnostic history explicit opt-in, reducing
ambiguous contracts and unnecessary sensitive-object retention.

## Current state

- `RecordingStateMachine.handleProcessingState()` emits bare
  `API_REQUEST_START`; `AzureAPIClient.transcribe()` emits the structured start.
- `AzureAPIClient` emits structured `API_REQUEST_SUCCESS`; `AudioHandler` emits
  it again with `{}` at `js/audio-handler.js:590`.
- `spec/spec-design-api-client.md:148-155` already describes the structured API
  client payloads as the contract.
- `EventBus.emit()` unconditionally pushes `{eventName,data,timestamp}` and caps
  at 50 (`js/event-bus.js:100-115`). `getHistory`/history assertions are used
  only by EventBus tests.
- Debug logging is separately controlled by `debugMode`; credentials are not
  currently emitted, but transcript text and a live stream are.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/event-bus.vitest.js tests/model-adapters.vitest.js tests/audio-handler-integration.vitest.js tests/recording-state-machine.vitest.js tests/ui-event-bus-proper.vitest.js` | all pass |
| Full/browser | `npm test && npm run test:coverage && npm run test:browser` | all pass |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**: the four production modules in the drift check, their four named
test files, and `plans/README.md` status.

**Out of scope**: renaming/removing other domain events, changing API retries,
removing `once`/priority APIs, logger redesign, spec edits (Plan 030), analytics,
or telemetry.

## Git workflow

- Branch: `refactor/027-event-lifecycle-ownership`
- Commit: `refactor: normalize API lifecycle events`
- Do not push unless instructed.

## Steps

### Step 1: Pin exactly-once API lifecycle behavior

Add an integration assertion around one successful transcription: exactly one
structured `API_REQUEST_START` and one structured `API_REQUEST_SUCCESS`. Pin one
structured error on failure. Ensure retry attempts remain internal to one
logical API lifecycle rather than emitting terminal success/error per attempt.

**Verify**: new exactly-once assertions fail against current duplicates.

### Step 2: Make AzureAPIClient the sole API lifecycle owner

Remove the bare start emission from the FSM processing handler and the empty
success emission from AudioHandler. Keep recording state/status transitions in
those layers. Do not change the API client's structured payloads or error owner.

**Verify**: focused API/FSM/AudioHandler/UI tests pass and exactly-once assertions
hold for initial transcription and user-initiated retry.

### Step 3: Make EventBus history opt-in

Default history recording to disabled. Provide an explicit constructor option
or `setHistoryEnabled(true)` used only by diagnostics/tests. Disabling must clear
retained entries. `getHistory()` remains safe and returns an empty/copy result;
event delivery, once, priority, and debug logging do not depend on history.

Do not automatically couple history to debug logging unless tests and docs make
that choice explicit; either opt-in mechanism is acceptable, not both.

**Verify**: EventBus tests cover default no-retention, enabled capped history,
copy safety, and clearing on disable.

### Step 4: Scan payload retention and run gates

Use `rg -n 'getHistory|eventHistory|API_REQUEST_(START|SUCCESS)' js tests` to
confirm no production consumer and exactly the intended emitters. Run all gates
and `git diff --check`.

## Test plan

- One logical transcription: one structured start and one terminal event.
- Internal retry still produces one logical lifecycle.
- EventBus delivers normally with history disabled.
- Opt-in history caps at 50, returns a copy, and clears when disabled.
- Stream/transcript payloads are not retained by default.

## Done criteria

- [ ] AzureAPIClient solely owns API start/success/error emissions.
- [ ] Structured payload shapes remain as documented.
- [ ] Production EventBus retains no history unless explicitly enabled.
- [ ] No unrelated events or public listener APIs are removed.
- [ ] All gates pass and scope is clean.

## STOP conditions

- A production listener demonstrably depends on the duplicate or empty event.
- A production feature consumes event history.
- Exactly-once ownership requires changing adapter retry behavior.
- A gate fails twice after a reasonable fix.

## Maintenance notes

Plan 030 updates the FSM spec after this lands. Future telemetry must subscribe
to structured API events, not reintroduce lifecycle emits from orchestration or
state-rendering layers.
