# Plan 013: Remove confirmed-dead legacy UI plumbing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3697029..HEAD -- js/constants.js js/ui.js js/event-bus.js tests/settings-workflow.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" evidence below against live code before proceeding. Any
> mismatch is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `3697029`, 2026-07-12

## Why this matters

The 2.0 Dynamic Island refactor replaced the old microphone/pause/cancel DOM
controls, but six legacy IDs remain in `ID` and in a broad settings-workflow
fixture. The same UI constructor also queries four settings elements that are
owned by `Settings` and never read by `UI`. These remnants make tests appear to
exercise controls that no longer exist and make ownership less clear.

This is deliberately a conservative dead-code sweep. Event-bus outputs are not
dead merely because this repository has no listener: they can be lifecycle or
domain observation contracts. Duplicated sanitizer logic, adapter metadata,
and the `cancelRecording` wrapper require separate design decisions and are not
part of this mechanical cleanup.

## Current state

### Retired IDs

`js/constants.js` still defines these six `ID` entries, none of which occurs in
`index.html` or production JavaScript outside the constants declaration:

```javascript
MIC_BUTTON:    'mic-button',
PAUSE_BUTTON:  'pause-button',
CANCEL_BUTTON: 'cancel-button',
THEME_MODE:    'theme-mode',
PAUSE_ICON:    'pause-icon',
PLAY_ICON:     'play-icon',
```

Do not confuse `ID.THEME_MODE` with the live
`STORAGE_KEYS.THEME_MODE = 'themeMode'`, which must remain.

`tests/settings-workflow.vitest.js:46-48` adds all six retired IDs to the
generic mock element map. Later setup assigns `ID.MIC_BUTTON` to an unused
`micButton` variable (`:529-540`); the actual assertions already use
`ui.primaryAction` (`:553-625`). One other setup write at `:348` sets the
retired mock's `disabled` property but no assertion reads it.

### Unused UI-owned references

`js/ui.js:51-58` currently caches:

```javascript
this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);
this.themeToggle = document.getElementById(ID.THEME_TOGGLE);
this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
this.moonIcon = document.getElementById(ID.MOON_ICON);
this.sunIcon = document.getElementById(ID.SUN_ICON);
```

Only `themeToggle`, `moonIcon`, and `sunIcon` are read later in `UI`.
`settingsButton`, `settingsModal`, `closeModalButton`, and
`saveSettingsButton` have no second `this.<name>` occurrence. The corresponding
ID constants remain live because `js/settings.js:39-42,194-210,466-479` owns
and uses those elements.

### Orphan event documentation

`js/event-bus.js:226` documents `APP_ERROR`, but the `APP_EVENTS` object has no
`APP_ERROR` member; the actual application error event is `ERROR_OCCURRED`.
Remove only the orphan property line. Do not rename or remove
`ERROR_OCCURRED`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npx vitest run tests/settings-workflow.vitest.js tests/ui-event-bus-proper.vitest.js` | all focused tests pass |
| Full tests | `npm test` | all repository tests pass |
| Coverage | `npm run test:coverage` | exit 0 and configured thresholds pass |
| Lint | `npm run lint` | exit 0, no errors |
| Dead-code scan | `npm run deps:check` | exit 0 |
| Production dependencies | `npm run deps:check:prod` | exit 0 |
| Size | `npm run size` | exit 0; JavaScript remains below 100 kB |

## Scope

**In scope** (the only implementation/test files to modify):

- `js/constants.js`
- `js/ui.js`
- `js/event-bus.js`
- `tests/settings-workflow.vitest.js`
- `plans/README.md` (status update only)

**Out of scope** (do NOT touch):

- Any `APP_EVENTS` member or event emission. Emit-only events are retained as
  domain/lifecycle observation contracts pending a dedicated API decision.
- `STORAGE_KEYS.THEME_MODE` and all theme behavior.
- Live settings IDs (`SETTINGS_BUTTON`, `SETTINGS_MODAL`, `CLOSE_MODAL`,
  `SAVE_SETTINGS`) and `js/settings.js`, which owns those DOM elements.
- Sanitizer regex consolidation between settings and API validation.
- Adapter `storageKeys` metadata or any model-selection logic.
- `AudioHandler.cancelRecording` and its tests; removing a public wrapper is
  not a mechanical dead-code change.
- General test consolidation or removal of behavior tests.

## Git workflow

- Branch: `chore/013-dead-ui-plumbing`
- One atomic commit after all gates pass.
- Commit message: `chore(ui): remove retired control plumbing`
- Do not push or open a PR unless explicitly instructed.

## Steps

### Step 1: Make the test fixture match the live control surface

In `tests/settings-workflow.vitest.js`:

1. Remove `ID.MIC_BUTTON`, `ID.PAUSE_BUTTON`, `ID.CANCEL_BUTTON`,
   `ID.PAUSE_ICON`, `ID.PLAY_ICON`, and `ID.THEME_MODE` from the mock-ID array
   at the top of the file.
2. Remove the unused setup statement
   `mockElements.get(ID.MIC_BUTTON).disabled = true`.
3. Remove the `micButton` declaration and its two setup assignments in the
   `Microphone Activation Issue Analysis` block. Do not alter assertions on
   `ui.primaryAction`; those already test the live control.

**Verify**:

```bash
rg -n "ID\.(MIC_BUTTON|PAUSE_BUTTON|CANCEL_BUTTON|PAUSE_ICON|PLAY_ICON|THEME_MODE)|micButton" tests/settings-workflow.vitest.js
```

Expected: no output, exit 1 because there are no matches.

### Step 2: Remove the retired constants and unused UI queries

In `js/constants.js`, remove only the six `ID` entries listed above and their
matching JSDoc `@property` lines. Preserve similarly named live storage keys and
all current Dynamic Island IDs.

In `js/ui.js`, remove only these four constructor assignments:

```javascript
this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);
this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
```

Retain `themeToggle`, `moonIcon`, and `sunIcon`. Do not remove the corresponding
ID constants because `Settings` uses them.

**Verify**:

```bash
rg -n "'(mic-button|pause-button|cancel-button|pause-icon|play-icon|theme-mode)'" js/constants.js
rg -n "this\.(settingsButton|settingsModal|closeModalButton|saveSettingsButton)" js/ui.js
```

Expected: both commands produce no output. Then run:

```bash
rg -n "THEME_MODE|SETTINGS_BUTTON|SETTINGS_MODAL|CLOSE_MODAL|SAVE_SETTINGS" js/settings.js js/ui.js js/constants.js
```

Expected: live storage/theme and Settings-owned DOM references remain.

### Step 3: Correct the event-bus JSDoc inventory

Delete only this orphan line from the `APP_EVENTS` JSDoc block in
`js/event-bus.js`:

```javascript
* @property {string} APP_ERROR - Emitted when application encounters critical error
```

Do not alter the `APP_EVENTS` object.

**Verify**:

```bash
rg -n "APP_ERROR|ERROR_OCCURRED" js/event-bus.js
```

Expected: no `APP_ERROR`; the live `ERROR_OCCURRED` declaration remains.

### Step 4: Run all gates and prove scope

Run every command from the command table, followed by:

```bash
git diff --check
git status --short
```

Expected: all gates exit 0; only the four in-scope implementation/test files
and the plan status update are modified. No dependency or generated file is
added.

## Test plan

- No new behavior test is required because production behavior does not change.
- Existing settings workflow tests prove the fixture still constructs Settings
  and UI correctly without retired IDs.
- Existing UI event-bus tests prove the Dynamic Island primary/secondary
  controls remain wired.
- Full coverage protects imports and constant consumers across the repository.

## Done criteria

- [ ] All six retired `ID` entries and their stale test fixtures are gone.
- [ ] `STORAGE_KEYS.THEME_MODE` and live Settings-owned IDs remain.
- [ ] Four unused UI constructor queries are gone; live theme refs remain.
- [ ] Orphan `APP_ERROR` JSDoc is gone; `ERROR_OCCURRED` remains.
- [ ] No event constants or event emissions changed.
- [ ] Focused and full tests pass.
- [ ] Coverage, lint, both dependency checks, and size gate pass.
- [ ] `git diff --check` passes and scope contains no unrelated files.
- [ ] `plans/README.md` is updated only after reviewer approval.

## STOP conditions

Stop and report; do not improvise if:

- Drift changes any reference count or makes a supposedly dead identifier live.
- A retired ID appears in `index.html` or production code outside its constants
  declaration.
- Removing a UI query requires changing `Settings` or runtime behavior.
- Any event constant/emission appears necessary to modify.
- A test failure suggests the legacy mock represented live behavior rather than
  stale setup.
- A gate fails twice after one reasonable correction attempt.

## Maintenance notes

- Reference counts alone are not sufficient to delete event-bus outputs; those
  remain until the application defines whether events are internal-only or a
  supported observation contract.
- The duplicated sanitizer patterns and adapter `storageKeys` issue remain
  separate backlog items.
- Future control refactors should update `ID`, `index.html`, UI queries, and test
  fixtures in the same change so stale phantom controls do not recur.
