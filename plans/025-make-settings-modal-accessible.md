# Plan 025: Make the settings modal keyboard and focus correct

> **Executor instructions**: Follow the plan step by step, preserve Plan 022's
> draft semantics, and stop on any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- index.html css/styles.css js/settings.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 022
- **Category**: bug
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

The settings surface declares `role="dialog"` and `aria-modal="true"` but only
toggles CSS display. Opening does not move focus inside, Tab is not contained,
Escape does not close it, and closing does not restore focus. Keyboard and
screen-reader users can interact with content behind a supposedly modal surface.
Use the repository's native discard dialog pattern and preserve a safe fallback.

## Current state

- `index.html:235-280` uses a `<div id="settings-modal" class="modal"
  role="dialog" aria-modal="true">` with a manual backdrop.
- `js/settings.js:467-485` only writes `style.display` and emits open/close.
- The document Escape listener at `settings.js:316-328` controls only the
  sidebar.
- `index.html:225-232` and `js/ui.js:134-146,620-656` are the established native
  `<dialog>`/`cancel` safe-default exemplar.
- Plan 022 makes modal model choice draft-only; all close paths here must invoke
  the same discard-draft behavior.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js tests/settings-sidebar.vitest.js tests/ui-event-bus-proper.vitest.js` | all pass |
| Full/browser | `npm test && npm run test:coverage && npm run test:browser` | all pass |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**: `index.html`, `css/styles.css`, `js/settings.js`,
`tests/settings-persistence.vitest.js`, `tests/settings-unit.vitest.js`, and
`plans/README.md` status.

**Out of scope**: visual redesign, modal exit animation, custom select controls,
credential validation/storage, sidebar accessibility beyond avoiding Escape
conflicts, and new Playwright tests.

## Git workflow

- Branch: `fix/025-settings-modal-accessibility`
- Commit: `fix: make settings modal focus-safe`
- Do not push unless instructed.

## Steps

### Step 1: Add accessibility behavior tests

Using the existing DOM-spy style, assert: open moves focus to the model selector
or first invalid credential field; Escape/cancel closes; close button, backdrop,
and successful Save share close cleanup; closing restores focus to the settings
button; repeated open/close does not duplicate handlers. Pin Plan 022's draft
rollback on every non-save close path.

**Verify**: new tests fail against display-only behavior.

### Step 2: Adopt native dialog semantics with a fallback

Convert the settings container to `<dialog>` and use `showModal()` / `close()`
when available. Preserve `aria-labelledby`; let native modality contain focus.
Add a `cancel` listener that prevents default only as needed and routes through
the normal close function. Retain a tested fallback for environments lacking
`showModal`, following the discard dialog's no-stranding principle.

Update CSS from full-screen div assumptions to dialog + `::backdrop` while
preserving current appearance, mobile sizing, and reduced motion.

**Verify**: markup/CSS tests and modal management tests pass.

### Step 3: Manage entry and return focus

Before opening, remember the invoking element (normally `settingsButton`). After
the modal is shown, focus the first invalid active credential input, otherwise
the modal model selector. On every close path, restore focus if the saved element
is still connected. Do not steal focus when startup opens Settings before a
meaningful invoker exists.

**Verify**: focus entry/return tests pass for manual and startup opening.

### Step 4: Resolve Escape ownership

Ensure Escape closes the topmost settings dialog without also changing sidebar
state. The native dialog cancel handler should own the event while open; the
existing document handler continues to own Escape otherwise.

**Verify**: settings-sidebar and modal tests prove one outcome per Escape.

### Step 5: Run all gates and scope audit

Run the command table, `git diff --check`, and inspect the full HTML/CSS/JS diff.

## Test plan

- Native open/close/cancel, unsupported-dialog fallback, and repeated cycles.
- Focus on first invalid field; fallback focus on model selector.
- Return focus to invoker.
- Escape does not also close/unpin sidebar.
- Save commits; close/cancel/backdrop discard modal draft per Plan 022.

## Done criteria

- [ ] Settings is truly modal when native dialog is available.
- [ ] Keyboard focus enters, remains modal, and returns on close.
- [ ] Escape and every visible close path are safe and consistent.
- [ ] Draft/save, styling, reduced-motion, and browser smoke behavior remain.
- [ ] All gates pass with only scoped files changed.

## STOP conditions

- Native dialog conversion breaks the existing browser smoke after one direct
  CSS/markup correction.
- Focus containment requires a third-party library.
- Plan 022 is not merged or its draft semantics differ from this plan.
- A gate fails twice after reasonable in-scope work.

## Maintenance notes

Do not implement a second custom focus trap on top of native `<dialog>`. Future
modal animation work must preserve `close()` timing, Escape, and return focus.
