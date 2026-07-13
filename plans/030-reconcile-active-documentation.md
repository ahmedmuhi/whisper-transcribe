# Plan 030: Reconcile active model and state-machine documentation

> **Executor instructions**: Derive documentation from live code and tests, not
> archived plans. Make no behavior changes. Stop if an apparent mismatch is an
> unresolved product decision.
>
> **Drift check (run first)**: `git diff --stat 4dd870c..HEAD -- README.md CLAUDE.md spec/spec-design-recording-state-machine.md spec/spec-design-api-client.md js/constants.js js/recording-state-machine.js js/model-adapters/index.js index.html`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: Plan 027
- **Category**: docs
- **Planned at**: refreshed at commit `4dd870c`, 2026-07-13 (after Plans 027–029)

## Why this matters

The active README advertises removed MAI-Transcribe 1 and hidden Whisper
Translate as selectable features. The current FSM specification says there are
nine states but its event table and matrix omit `CONFIRMING_DISCARD`, omit
`ERROR → PROCESSING`, and require granular button/spinner events deliberately
removed by the 2.0 single-state rendering design. These are active instructions
for users and agents; leaving them stale risks wrong provisioning and
reintroducing dual UI ownership.

## Current state

- `README.md:36-41` says multiple models include Whisper Translate and MAI
  “1 and newer 1.5 preview.” Both selectors in `index.html` expose only Whisper
  and MAI 1.5; `settings.js` deliberately validates against visible options.
- The Translate adapter remains registered internally. Until the separate
  product direction is selected and live-verified, developer docs may describe
  it as an internal adapter but user docs must not call it selectable.
- `spec/spec-design-recording-state-machine.md:138-161` lists retired
  `UI_BUTTON_*`/spinner events and an eight-state matrix.
- `js/constants.js:411-420` is the authoritative nine-state matrix.
- `js/recording-state-machine.js:125-280` is the authoritative state-handler
  event list after Plan 027 removes bare API lifecycle ownership.
- `plan/2.0-design.md:25-28` makes `RECORDING_STATE_CHANGED` the single control
  rendering source of truth.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Contract scans | `rg -n 'MAI-Transcribe 1|whisper-translate|UI_BUTTON_|UI_SPINNER_|CONFIRMING_DISCARD|ERROR.*PROCESSING' README.md CLAUDE.md spec/*.md` | only accurate/current references remain |
| Tests | `npm test` | all tests pass |
| Docs-adjacent quality | `npm run lint && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**:

- `README.md`
- `CLAUDE.md` only if its wording needs to distinguish registered from selectable
- `spec/spec-design-recording-state-machine.md`
- `spec/spec-design-api-client.md` only to keep Plan 027 lifecycle ownership
  wording consistent
- `plans/README.md` status

**Read-only authorities**: `js/constants.js`, `js/recording-state-machine.js`,
`js/model-adapters/index.js`, `index.html`, relevant current tests, and
`plan/2.0-design.md`.

**Out of scope**: source behavior, surfacing Translate, product language
settings, archived `plan/archive/**` documents, generated docs, or redesigning
the spec format.

## Git workflow

- Branch: `docs/030-reconcile-active-contracts`
- Commit: `docs: reconcile model and state machine contracts`
- Do not push unless instructed.

## Steps

### Step 1: Correct the user-visible model set

Update README Highlights/Setup so selectable models are exactly Azure Whisper
and MAI-Transcribe 1.5. Remove MAI 1 claims. Do not market Whisper Translate as
available; optionally note it only in Architecture as a registered internal
adapter awaiting product exposure. Preserve the product-direction option in the
Improve roadmap rather than silently deciding it here.

**Verify**: scan README against both `<select>` option values.

### Step 2: Replace the FSM transition matrix

Generate the specification matrix directly from `STATE_TRANSITIONS`, including
all nine keys and `ERROR → PROCESSING` retry. Add `CONFIRMING_DISCARD` to the
event table and explain that the recorder continues while awaiting Keep/Discard.

**Verify**: compare every documented edge against the constants map; no missing
or extra edge remains.

### Step 3: Replace retired UI event contracts

Remove claims that state handlers emit granular button-enable, spinner, pause,
or controls-reset events. Document `RECORDING_STATE_CHANGED` as the single
control render input and list only events actually emitted by each handler after
Plan 027. Update acceptance criteria AC-005/006/008 and requirements REQ-017 as
needed. Preserve domain events and status updates that still exist.

**Verify**: `rg -n 'UI_BUTTON_|UI_SPINNER_|UI_CONTROLS_RESET' spec/spec-design-recording-state-machine.md` prints no retired contract references.

### Step 4: Align API lifecycle ownership and metadata

Confirm API spec says AzureAPIClient alone emits one structured start and one
terminal event per logical transcription. Update `last_updated`/version metadata
in both specs consistently when content changes. Do not add claims unsupported
by tests.

**Verify**: API event table matches Plan 027 tests and emit sites.

### Step 5: Run checks and audit docs diff

Run the command table and `git diff --check`. Review every factual model/state/
event claim against live code before committing.

## Test plan

Documentation-only: use exact `rg` scans, full tests, and manual one-to-one
comparison of selector values, transition edges, and handler emit sites. Do not
add tests that parse prose merely to freeze wording.

## Done criteria

- [ ] README describes only models users can currently select.
- [ ] Active specs contain all and only current states/transitions/events.
- [ ] Single-state control rendering and API lifecycle ownership are explicit.
- [ ] No archived plan is rewritten.
- [ ] Tests/quality commands and diff checks pass.

## STOP conditions

- The operator decides to surface Whisper Translate now; that requires a
  direction/feature plan before user documentation.
- Plan 027 is unmerged or its final event ownership differs from this plan.
- Live code and tests disagree about a transition or event contract.
- A check fails twice after a documentation-only correction.

## Maintenance notes

Update active specs in the same PR whenever state transitions, visible models,
or lifecycle event ownership changes. Archived plans are history, not current
contract sources.
