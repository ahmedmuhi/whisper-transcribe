# Plan 005: Fix the undefined microphone error message and the FSM status-string drift

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 50164c9..HEAD -- js/constants.js js/permission-manager.js js/recording-state-machine.js tests/permission-manager.vitest.js tests/recording-state-machine.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sequence after 003 so test counts verify cleanly)
- **Category**: bug / tech-debt
- **Planned at**: commit `50164c9`, 2026-06-11

## Why this matters

Two related violations of this repo's constants discipline (CLAUDE.md: "event
names, DOM ids, storage keys, user-facing messages (`MESSAGES`) … all live in
`js/constants.js` … No magic strings in modules"):

1. **A real user-facing bug**: when `getUserMedia` throws a `TypeError` (the
   spec-mandated error for invalid constraints, also thrown by some browsers
   on insecure contexts), `js/permission-manager.js:228` assigns
   `message = MESSAGES.INVALID_REQUEST` — **a key that does not exist** in
   `MESSAGES`. The status line then renders the literal string `undefined`
   (or blank) instead of a usable diagnostic, on a real failure path.

2. **Two-sources-of-truth drift**: the recording state machine emits hardcoded
   status strings — `'Recording... Click to stop'`
   (`js/recording-state-machine.js:161`) and `'Recording paused'` (`:179`) —
   while the matching constants `MESSAGES.RECORDING_IN_PROGRESS`
   (`'Recording... Click again to stop'` — note the wording has already
   drifted) and `MESSAGES.RECORDING_PAUSED` sit **unused** in
   `js/constants.js:285-286`. A copy change must hunt literals; the constants
   lie about what the UI shows.

## Current state

`js/permission-manager.js:222-233` (inside the error-name `switch` of the
permission error handler):

```js
            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
                message = MESSAGES.MICROPHONE_NOT_SUITABLE;
                break;

            case 'TypeError':
                message = MESSAGES.INVALID_REQUEST;   // ← key does not exist
                break;

            default:
                message = `${MESSAGES.MICROPHONE_ERROR_PREFIX}${error.message}`;
```

`js/constants.js:284-290` (the Recording States group of `MESSAGES`):

```js
  // Recording States
  RECORDING_IN_PROGRESS: 'Recording... Click again to stop',   // unused, wording drifted
  RECORDING_PAUSED: 'Recording paused',                        // unused
  RECORDING_CANCELLED: 'Recording cancelled',
  FINISHING_RECORDING: 'Finishing...',
```

`js/constants.js:322-331` (the Error Messages group — style exemplar for the
new constant; note the `⚠️`-prefixed entries like `MICROPHONE_IN_USE`,
`MICROPHONE_NOT_SUITABLE`):

```js
  ERROR_PREFIX: 'Error: ',
  MICROPHONE_IN_USE: '⚠️ Microphone is already in use by another application.',
  MICROPHONE_NOT_SUITABLE: '⚠️ No microphone meets the requirements. Try with a different microphone.',
```

`js/recording-state-machine.js:158-182`:

```js
    async handleRecordingState() {
        eventBus.emit(APP_EVENTS.RECORDING_STARTED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: 'Recording... Click to stop',   // ← line 161, magic string
            type: 'info'
        });
    }
    ...
    async handlePausedState() {
        eventBus.emit(APP_EVENTS.RECORDING_PAUSED);
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: 'Recording paused',             // ← line 179, magic string
            type: 'info'
        });
    }
```

Verified facts you can rely on:
- No test anywhere references the literals `'Recording... Click to stop'`,
  `'Recording... Click again to stop'`, or asserts `'Recording paused'` as a
  status string (grep across `tests/` at planning time: only source hits).
- No production or test code references `MESSAGES.INVALID_REQUEST` except the
  one broken use site.
- `js/recording-state-machine.js` already imports `MESSAGES`? **Check**: it
  imports from `./constants.js` — confirm `MESSAGES` is in the import list; if
  not, add it.
- The canonical wording decision: **adopt the live string**
  `'Recording... Click to stop'` as the value of
  `MESSAGES.RECORDING_IN_PROGRESS`. The live UI is what 2.0 shipped and what
  users see; "Click again" referred to the pre-2.0 toggle-mic interaction.
  This keeps user-visible behavior byte-identical.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Single test file | `npx vitest run tests/permission-manager.vitest.js` | all pass |
| Single test file | `npx vitest run tests/recording-state-machine.vitest.js` | all pass |
| Full suite | `npx vitest run 2>&1 \| tail -6` | all pass, +2 tests vs baseline |
| Coverage gate | `npm run test:coverage` | exit 0 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `js/constants.js` — add `INVALID_REQUEST`, update `RECORDING_IN_PROGRESS` value
- `js/recording-state-machine.js` — replace two literals with constants
- `tests/permission-manager.vitest.js` — add one test
- `tests/recording-state-machine.vitest.js` — add one or two assertions/tests

**Out of scope** (do NOT touch, even though they look related):

- Other unused constants (`ID.MIC_BUTTON`, `ID.PAUSE_BUTTON`, etc.) and dead
  events (`DEVICE_CHANGED`, `RECORDING_ERROR`) — a separate backlog item
  ("dead-code sweep") covers them; mixing it in here muddies review.
- `js/permission-manager.js` beyond nothing — the use site at line 228 is
  already correct once the constant exists; do not restructure the switch.
- Any other hardcoded string elsewhere in the repo.

## Git workflow

- Branch: `fix/005-status-message-constants`
- Single commit, e.g. `fix(status): define INVALID_REQUEST message and source FSM status text from MESSAGES`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the missing `INVALID_REQUEST` message

In `js/constants.js`, in the `// Error Messages` group (directly after the
`MICROPHONE_NOT_SUITABLE` line, ~line 325), add:

```js
  INVALID_REQUEST: '⚠️ Microphone request was invalid. Please refresh the page and try again.',
```

(Style matches the sibling `⚠️`-prefixed microphone errors.)

**Verify**: `node -e "import('./js/constants.js').then(m => console.log(m.MESSAGES.INVALID_REQUEST))"`
→ prints the message (constants.js is DOM-free and imports cleanly in Node).

### Step 2: Reconcile and use the recording-status constants

1. In `js/constants.js:285`, change the value of `RECORDING_IN_PROGRESS` to
   the live wording: `'Recording... Click to stop'`.
2. In `js/recording-state-machine.js`, confirm `MESSAGES` is imported from
   `./constants.js` (add it to the existing import if absent), then replace
   line 161's literal with `MESSAGES.RECORDING_IN_PROGRESS` and line 179's
   literal with `MESSAGES.RECORDING_PAUSED`.

**Verify**:
- `grep -rn "Recording... Click" js/` → only `js/constants.js`
- `grep -rn "'Recording paused'" js/` → only `js/constants.js`
- `npx vitest run tests/recording-state-machine.vitest.js` → all pass

### Step 3: Add the regression tests

1. In `tests/permission-manager.vitest.js`, add a test in the
   `describe('Permission Request Flow')` block, modeled structurally on
   `'should handle microphone in use error'` (line ~211): make the mocked
   `getUserMedia` reject with an error whose `name` is `'TypeError'`, and
   assert a `UI_STATUS_UPDATE` emission whose `message` equals
   `MESSAGES.INVALID_REQUEST` (import `MESSAGES` the same way the file's
   existing tests import constants) — i.e. the message is defined and not
   the string `"undefined"`.
2. In `tests/recording-state-machine.vitest.js`, near the existing pause test
   (it asserts `APP_EVENTS.RECORDING_PAUSED` at ~line 125), add/extend
   assertions that entering RECORDING emits `UI_STATUS_UPDATE` with
   `message: MESSAGES.RECORDING_IN_PROGRESS` and entering PAUSED emits
   `message: MESSAGES.RECORDING_PAUSED` — referencing the constants, not
   string literals, so future copy changes don't break tests.

**Verify**: `npx vitest run tests/permission-manager.vitest.js tests/recording-state-machine.vitest.js`
→ all pass, including the new tests.

### Step 4: Full gate

**Verify**: `npx vitest run 2>&1 | tail -6` → all pass (baseline + new tests);
`npm run lint` → exit 0; `npm run test:coverage` → exit 0.

## Test plan

- New: permission-manager `TypeError` → `MESSAGES.INVALID_REQUEST` status
  (the exact regression this plan fixes).
- New/extended: FSM RECORDING and PAUSED status messages asserted via the
  `MESSAGES` constants.
- Pattern exemplars: `tests/permission-manager.vitest.js:211`
  (`'should handle microphone in use error'`) and
  `tests/recording-state-machine.vitest.js:125` (pause-event assertion).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "INVALID_REQUEST" js/constants.js` → exactly one definition line
- [ ] `grep -rn "Recording... Click" js/ | grep -v constants.js` → no matches
- [ ] `grep -rn "'Recording paused'" js/ | grep -v constants.js` → no matches
- [ ] `npx vitest run` → all pass, count increased vs. pre-plan baseline
- [ ] `npm run lint` and `npm run test:coverage` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift since `50164c9`).
- Any *existing* test fails after the string swap — that means something does
  pin the literal text after all; report which test rather than editing it.
- `MESSAGES.RECORDING_IN_PROGRESS` or `RECORDING_PAUSED` turn out to have a
  production consumer (grep finds a use outside `recording-state-machine.js`
  and `constants.js`) — the wording change would then alter another surface.

## Maintenance notes

- The status line's *colors/ownership* are governed by `js/status-helper.js`
  and CSS tokens (test-enforced); this plan deliberately touches neither.
- Future copy edits to recording status text now happen in one place
  (`MESSAGES`); reviewers should reject new literals in FSM handlers.
- The wider dead-constants sweep (unused `ID.*` entries, dead events,
  duplicated sanitizer regexes) remains in the plans/README.md backlog.
