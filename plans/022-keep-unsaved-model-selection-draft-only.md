# Plan 022: Keep unsaved settings-model changes draft-only

> **Executor instructions**: Follow all steps and verifications. Stop on drift
> or a STOP condition. Touch only scoped files.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- js/settings.js tests/settings-persistence.vitest.js tests/settings-workflow.vitest.js`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

Changing the model inside Settings immediately mutates the main session model,
even though comments and events say the choice is form-only until Save. Closing
the dialog without saving can therefore send the next recording through a
different model and credential namespace. Preserve the main selector as the
active session source until a validated Save commits the draft.

## Current state

`js/settings.js:177-194` currently performs this on modal change:

```js
const newModel = e.target.value;
if (this.modelSelect) {
    this.modelSelect.value = newModel;
}
this.updateSettingsVisibility();
// Do NOT emit any events until settings are saved
```

`closeSettingsModal()` at `:482-485` only hides the modal. `getModelConfig()`
at `:734-741` reads `modelSelect.value`, so the unsaved draft becomes active.
The main selector itself deliberately supports session-only switching and must
keep that behavior; only the modal draft is isolated by this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/settings-persistence.vitest.js tests/settings-workflow.vitest.js tests/settings-unit.vitest.js` | all pass |
| Full/browser | `npm test && npm run test:browser` | all pass |
| Quality | `npm run test:coverage && npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**: `js/settings.js`, `tests/settings-persistence.vitest.js`,
`tests/settings-workflow.vitest.js`, and `plans/README.md` status.

**Out of scope**: changing model options, surfacing Whisper Translate, storage
keys, validation rules, credentials, sidebar behavior, or modal accessibility
(Plan 025).

## Git workflow

- Branch: `fix/022-settings-model-draft`
- Commit: `fix: keep unsaved model selection draft-only`
- Do not push unless instructed.

## Steps

### Step 1: Characterize the leak

Capture the modal model `change` listener using the existing DOM-spy pattern.
Open on Whisper, change the modal to MAI, close by close button semantics, and
assert the main selector and `getModelConfig().model` remain Whisper. Add the
same assertion for backdrop close. The tests must fail before production edits.

**Verify**: focused persistence test fails only on the unsaved model leak.

### Step 2: Separate modal draft from active selection

On modal change, update only the modal's form visibility and fields. Do not
write `modelSelect.value`. Keep `getCurrentModelFromSettings()` as the draft
source for validation/save and `getCurrentModel()` as the active session source.
On a successful `saveSettings()`, commit the validated model to the main
selector before emitting model/settings events. Preserve event order and the
main selector's independent session-only change behavior.

**Verify**: modal close tests pass; existing successful-save and main-selector
session-switch tests pass unchanged.

### Step 3: Cover reopen and validation failure

Assert reopening Settings resets the draft to the current active model. Assert
an invalid Save leaves the modal open and does not mutate the active selector.
Assert a valid Save changes active and persisted models exactly once.

**Verify**: all three focused Settings files pass.

### Step 4: Run all gates and scope checks

Run the command table plus `git diff --check` and `git diff --name-only`.

## Test plan

- Close button and backdrop discard an unsaved model draft.
- Invalid Save cannot leak the draft.
- Valid Save commits modal → active → persisted model and existing events.
- Main selector remains a session-only model switch.

## Done criteria

- [ ] Modal changes cannot affect the active model before successful Save.
- [ ] Closing and reopening restores the active model into the draft.
- [ ] Save/event/storage contracts remain unchanged.
- [ ] All gates pass with only scoped files changed.

## STOP conditions

- Existing product tests prove that modal changes are intentionally live
  session switches despite the current comments/save contract.
- Isolation requires changing adapter metadata or credential storage.
- A required gate fails twice after an in-scope fix.

## Maintenance notes

Plan 025 may later change the modal element and close mechanism; it must preserve
this draft/commit boundary. Review the successful-save ordering carefully so
listeners never observe the previous active model.
