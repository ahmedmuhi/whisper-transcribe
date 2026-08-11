# Plan 041: Adopt the "Whisper App" mock UI (gear popover, settings modal, floating island)

> **Executor instructions**: this plan is the durable record of a redesign whose
> binding specification is `/tmp/whisper-redesign/contract.md` (DOM ids, module
> contract, CSS contract, test contract) and whose visual reference is
> `/tmp/whisper-redesign/mock.dc.html`. If you are executing rather than
> reading, the contract wins on every detail; this plan explains *why* each
> decision was made so a later reader does not have to reconstruct it. Update
> your row in `plans/README.md` when done unless the reviewer maintains the
> index.
>
> **Drift check (run first)**:
> `git diff --stat 6cad1d2..HEAD -- index.html css/styles.css js/main.js js/ui.js js/settings.js js/constants.js js/event-bus.js tests/`
> Plan 040 (MAI verbatim toggle) must already be in the tree: this redesign
> moves that control, it does not add it.

## Status

- **Priority**: P1 (product direction, User-requested)
- **Effort**: L
- **Risk**: MED. No network, authentication, or audio-lifecycle code changes,
  but the settings persistence semantics change and roughly a dozen test files
  assert the old DOM.
- **Depends on**: plan 033 (User menu, being replaced), plan 040 (verbatim
  toggle, being relocated), and the Coastal Teal / Rust token commit `6cad1d2`
- **Category**: ui (direction)
- **Planned at**: commit `6cad1d2`, branch `theme/teal-rust-andika`, 2026-08-11

## Why this matters

The User designed a replacement interface in Claude Design ("Whisper App") and
accepted it. The palette and type half of that mock already shipped in `6cad1d2`
(Coastal Teal on white, deep teal in dark mode, rust `--accent-warm`, Andika
plus JetBrains Mono). This plan lands the structural half.

The interface it replaces has three problems the mock fixes:

1. **Settings are buried behind identity.** Everything, model choice,
   microphone, Target URIs, theme, Azure help, sign out, hangs off the initials
   avatar. A person looking for "which model am I using" has to think of it as
   an account question. The mock separates the two: a gear opens settings, the
   avatar is a plain identity badge with no menu behind it.
2. **The frequent settings cost the most clicks.** Model and noise cancellation
   are changed often; Target URIs are set once. The old menu treats them the
   same. The mock gives the frequent three (model, noise cancellation, theme) a
   one-click popover and moves everything into a full settings modal reachable
   from `All settings…` or `Ctrl ,`.
3. **Settings are unfindable once there are enough of them.** Nested panels have
   no search. The modal has a sidebar with search across every row's keywords, a
   category chip on each result, and a plain "No settings match" empty state.

The main screen changes for the same reason: the control cluster becomes a
floating pill instead of a bordered card, and the visualizer strip appears only
while audio is actually being captured, so an idle screen is the transcript and
nothing else.

## What changes

**Header.** The wordmark stays. To its right: a gear button
(`#quick-settings-button`, `aria-haspopup="dialog"`) and a plain initials badge
(`#user-badge`, `title` = display name, no click behavior). The gear is always
visible; the badge appears only once authentication reaches READY, so a
signed-out person can still reach settings and fix a Target URI.

**Quick-settings popover** (`#quick-settings`): model select, noise-cancellation
switch, a Sys / Light / Dark segmented control, and a footer with `All settings…`
plus a `Ctrl ,` key chip. Closes on outside click and Escape, returns focus to
the gear.

**Settings modal** (`#settings-modal`, native `<dialog>`): a 232px sidebar
holding search, the four categories (Model, Microphone, Appearance, Connection)
and an account footer (avatar, display name, Sign out); a content pane with the
category heading, a close button, and the setting rows. Rows carry
`data-category` and `data-keywords` so search can match without a parallel data
structure in JavaScript. Both Target URI fields are visible at once, each with a
live status badge. The verbatim row stays gated to MAI-Transcribe 1.5, including
while searching.

**Main screen.** The transcription card keeps Grab; the textarea loses its
border. `#visualizer-container` is hidden unless the recording state machine is
in RECORDING, PAUSED, or STOPPING, and `#status` beneath it becomes the centred
mono caption. The control cluster keeps every existing id and label and gains
`#record-dot`, an 8px pulsing dot shown while recording (static and muted while
paused).

**Removed**: the whole `#user-menu` tree, `js/user-menu.js`, every
`.user-menu*` CSS rule, the save button and its rules, and the "Help & Azure
setup" menu row. The auth-context "View Azure setup" recovery action inside the
island stays, because that one appears exactly when a 403 makes it useful.

**Added**: `js/settings-surface.js`, a `SettingsSurface` class owning the
popover, the modal, search, category nav, account presentation, and sign out.
`Settings` keeps owning preferences and persistence and gains
`setSurface(surface)` so `openSettingsModal(invoker)` can delegate to it.

## Decision: instant apply, no Save button

Every control writes on change. There is no draft, no commit, no
"Save changes", no discard-on-close. `saveSettings()`, the draft/prepare/discard
methods, `getValidationErrors()` and `getSettingsFocusTarget()` are deleted
rather than left dormant.

Why:

- The app already had two persistence idioms living side by side. Noise
  cancellation, theme, input device, and (since plan 040) verbatim all wrote
  immediately; only model and the Target URIs went through draft/commit. Two
  idioms in one settings surface is a bug factory, and it was the direct cause
  of plan 022 (unsaved model changes leaking into requests).
- Draft/commit existed to protect a half-typed Target URI from being used. The
  redesign protects that case more precisely: a URI field persists **only while
  the value parses as HTTPS**. A half-typed value never reaches storage, so
  there is nothing to commit or roll back. An emptied field removes the stored
  key, which is the only way to unset a Target URI.
- The status badge makes the rule visible instead of implicit:
  `✓ Valid HTTPS`, `Must be HTTPS`, `Invalid URI format`,
  `Required for the active model`, `Not set`. Badge colours come from the
  `--status-*` tokens, not the mock's hexes, because the mock's success green
  fails WCAG AA on white (see `6cad1d2`).
- Model choice becomes honest again. The old code emitted a session-only
  `UI_MODEL_SWITCHED` from one select and persisted from another; the two could
  disagree. Now one change handler syncs both selects, persists, and emits the
  documented event sequence.

The cost of instant apply is that a mistyped URI is not recoverable by closing
the dialog. That is acceptable: the value is a Target URI the User pasted from
the Azure portal, not authored prose, and it is never destructive to re-paste.

## Decision: logout safety is preserved exactly, in its own dialog

`AuthInteractionController` remains the sole navigation-safety coordinator.
Sign out in the modal calls `authInteractionController.logOut()` and reacts to
the same four results the old User menu did:

| Result | What the User sees | Available actions |
|---|---|---|
| `UNSENT` | "Protect the Unsent Recording before logging out." | Download recording, then Continue to log out; or Discard recording and log out |
| `ACTIVE` | "Finish or discard the recording before logging out." | Cancel |
| `SELECTED` | "Remove Selected Audio before logging out." | Cancel |
| `BLOCKED` | `MESSAGES.LOGOUT_FAILED` | Cancel |

The only change is where that conversation happens. It used to live inside the
User menu's own markup, so deleting the menu would have deleted the protection
with it. It now has a dedicated `<dialog id="logout-dialog">` that no other
surface owns. There is still no automatic redirect, no automatic download, and
no automatic discard: Download initiates the file, then the button is replaced
by Continue to log out, and only that second explicit press navigates.

This keeps `plan/2.0-design.md` principle 1 (proportional challenge) and
principle 4 (explicit network intent) intact through a surface rewrite. If a
reviewer finds any path where sign out can navigate while audio is at risk, that
is a release blocker, not a polish item.

## Scope

**In scope**:

- `index.html`, `css/styles.css`
- `js/constants.js` (new ids; remove ids that no longer resolve), `js/event-bus.js`
- `js/settings.js` (rewritten for instant apply), `js/settings-surface.js` (new),
  `js/main.js` (construction), `js/ui.js` (record dot, `viz-active`, `island-paused`)
- `js/user-menu.js` (deleted)
- Tests listed under "Test impact"
- `CLAUDE.md` (the "Models, Settings, and User menu" section describes a surface
  that will no longer exist)
- `plan/2.0-design.md` (dated decision entry), `plans/README.md` (status row)

**Out of scope**, deliberately:

- `js/authentication-service.js`, `js/auth-interaction-controller.js`,
  `js/api-client.js`, `js/audio-handler.js`, the model adapters, the recording
  state machine, `TranscriptStore`. No request, token, or audio behavior
  changes in this plan.
- The colour and type tokens. They shipped in `6cad1d2`; this plan consumes
  them and adds no new raw hex except the `#E3A72C` warn badge, which clears AA
  on both surfaces.
- New `APP_EVENTS`. The existing events carry everything the new surfaces need.

## Test impact

Expect roughly a dozen test files to move. None of them should be weakened to
go green; change an expectation only where this plan deliberately changed the
behavior.

- `tests/user-menu.vitest.js` is deleted and replaced by
  `tests/settings-surface.vitest.js`: `computeInitials` (copied verbatim, the
  function is unchanged), popover open/close/outside-click/Escape/ARIA, modal
  open/close and focus return to the invoker, `Ctrl ,`, category nav, search
  filtering including verbatim gating and the no-results state, account
  presentation hidden until READY, and all four sign-out results.
- The four settings test files (`settings-unit`, `settings-persistence`,
  `settings-workflow`, `settings-sidebar`) lose every draft/commit expectation
  and gain instant-apply ones: a model change persists at once and emits the
  documented sequence; a URI persists only while valid; an emptied URI removes
  the key; badge text and class per state; noise and theme stay in sync across
  the popover and the modal.
- Island and UI tests (`island-controls`, `island-layout-css`,
  `mic-button-effects`, `ui-event-bus-proper`, `discard-flow`,
  `status-ownership`, `auth-recovery`, and whatever else the run reveals) update
  selectors for `#record-dot`, the `viz-active` class, the removed user menu,
  and the two new dialogs.
- Fixtures load the new DOM from `index.html` the same way the current tests do;
  follow `tests/helpers/`, do not invent a second fixture idiom.
- Coverage thresholds stay at 85/80/70/85.

## Verification gates

| Purpose | Command | Expected |
|---|---|---|
| Full suite | `npx vitest run 2>&1 \| tail -6` | zero failures |
| Lint | `npm run lint` | exit 0 |
| Coverage | `npm run test:coverage` | exit 0, 85/80/70/85 met |
| Dependencies | `npm run deps:check` | exit 0, `js/user-menu.js` gone and unreferenced |
| Real browser | `npm run test:browser` | all pass |

Do not run `npm run test:browser:live`; it is the protected, potentially
billable Azure stage and needs fresh operator approval.

## Done criteria

- [ ] `grep -rn "user-menu" index.html css/styles.css js/ tests/` returns nothing
- [ ] `js/user-menu.js` and `tests/user-menu.vitest.js` no longer exist
- [ ] `grep -n "saveSettings\|getValidationErrors\|getSettingsFocusTarget" js/` returns nothing
- [ ] Every new DOM id in the contract appears in `ID` in `js/constants.js`, and
      every `ID` entry resolves against `index.html`
- [ ] Sign out with an Unsent Recording opens `#logout-dialog` and cannot
      navigate before Download then Continue, or an explicit Discard
- [ ] Every new animation has a `prefers-reduced-motion` end-state rule
- [ ] The five verification gates above pass
- [ ] `CLAUDE.md`, `plan/2.0-design.md`, and `plans/README.md` describe the new
      surfaces

## STOP conditions

Stop and report rather than improvising if:

- Preserving logout safety appears to need a change inside
  `AuthInteractionController`, `AudioHandler`, or `SelectedAudioController`.
  This plan is a presentation change; the safety owners keep their contracts.
- Making a test pass appears to need weakening an assertion that this plan did
  not deliberately change.
- Instant apply appears to need a token, an access token, or any authentication
  response to pass through `Settings`. Nothing of the sort may enter it.
- The visualizer or record dot needs the recording state machine to gain a
  state or a transition. The UI renders from `RECORDING_STATE_CHANGED`; it does
  not add states.
- A contract id conflicts with an existing one, or the contract and the mock
  disagree on behavior. The contract wins, but say so in the handoff.

## Maintenance notes

- **`SettingsSurface` owns presentation; `Settings` owns preferences.** If a
  new setting arrives, it needs a row in `index.html` with `data-category` and
  `data-keywords`, an id in `ID`, and a handler in `Settings`. It needs nothing
  in `SettingsSurface`, which is generic over rows on purpose.
- **Search is data-driven.** Keywords live in the markup so a row cannot become
  unfindable through a JavaScript oversight. A row with no `data-keywords` is a
  bug.
- **The gear is always visible, the badge is not.** That asymmetry is
  deliberate: `API_CONFIG_MISSING` recovery has to be reachable before sign-in.
- **Do not reintroduce a Save button.** If a future setting genuinely needs
  staged edits, give that one control its own confirm step rather than
  restoring a global draft/commit layer over instant-apply controls.
