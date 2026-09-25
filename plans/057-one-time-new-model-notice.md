# Plan 057: Show a one-time "New" notice for a newly added model

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: this plan builds on plan 056. Confirm 056 has
> landed in your working tree:
> `grep -n "MAI_TRANSCRIBE_2:" js/constants.js` → one match, and
> `grep -n "maiTranscribe2ModelAdapter" js/model-adapters/index.js` → at least one match.
> If either is missing, STOP. Then run
> Let `BASE056` be the last plan-056 commit on your branch
> (`git log -1 --format=%H --grep='MAI-Transcribe 2'`; if nothing matches, use
> the branch tip at the moment 056 was reported done). Line numbers below are
> from `bdf23f9`; plan 056 edits `js/settings.js`, `js/settings-surface.js` and
> `index.html`, so locate code by the quoted text, not by line number.

> **Maintainer ruling, 2026-09-25 (size budget).** Plan 056 as first executed
> measured the `application` bundle at 22.54 kB against the 22.5 kB budget
> (baseline 22.31 kB). The User ruled: raise the `application` limit in
> `package.json` to **23.5 kB**, once, to cover plans 056 and 057 together. This
> is the only budget change allowed; the other two budgets stay as they are.
> If either plan still exceeds 23.5 kB, the size STOP condition applies again.

> **Maintainer ruling, 2026-09-25 (gear marker).** The first implementation put
> the "New" text pill on the gear; a screenshot showed it covering the top half
> of the cog and ending 1 px from the initials badge. The User ruled: on the
> **gear only**, replace the text pill with a small accent **dot** (about 8 px)
> on the gear's top-right corner, no text. Everything else is unchanged: the
> "New" text pills on both Model rows, the ` · New` option suffix, and the gear's
> accessible name "Quick settings, new model available".

## Status

- **Priority**: P2
- **Effort**: S/M
- **Risk**: LOW
- **Depends on**: plans/056-add-mai-transcribe-2.md
- **Category**: direction
- **Planned at**: commit `bdf23f9` (+ plan 056), 2026-09-25
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/142

## Why this matters

Plan 056 adds MAI-Transcribe 2, but nothing tells an existing User it exists.
They would only find it by opening the Model dropdown. The maintainer wants the
pattern other apps use for new features: a small "New" marker that points at
the new model **once**. After the User has opened settings one time, the marker
is gone for good, whether or not they switched models. The marker is driven by a
flag on the model's adapter, so the next new model gets the same treatment by
setting one property.

## Decisions already made (do not re-open)

1. **Where the marker shows** while a model is unacknowledged:
   - a small "New" pill on the header gear button (`#quick-settings-button`);
   - a "New" pill beside the **Model** label in the quick-settings popover;
   - a "New" pill beside the **Transcription model** row title in the full
     settings modal;
   - the model's entry in both model dropdowns reads `MAI-Transcribe 2 · New`
     (a native `<option>` can only hold text, so the pill cannot go inside it).
2. **When it goes away**: the first time the User opens **either** the popover
   or the settings modal, the model is recorded as acknowledged in
   `localStorage`. From that moment:
   - the gear pill disappears immediately (the User has found it);
   - the pills inside the popover/modal and the ` · New` option suffix stay
     for the rest of **that page load**, so the User actually sees what was
     new in the surface they just opened (including popover → All settings);
   - on the next page load nothing shows.
3. **Driven by adapter metadata**: an adapter opts in with `announceAsNew: true`.
   Only `maiTranscribe2ModelAdapter` sets it. Acknowledgement is stored per
   model id, so a future model with the flag shows the notice again even for a
   User who acknowledged MAI-Transcribe 2.
4. **Brand-new Users see it too** (they land on MAI-Transcribe 2 by default;
   the notice is harmless and one-time).
5. **Storage rule**: the acknowledgement is a new non-secret browser-local
   preference. `CLAUDE.md`'s persistence list must be updated to include it.

## Current state

- `js/settings.js` — owns preferences and both model selects.
  `_renderModelOptions()` (at `bdf23f9`, lines 345–356) fills
  `#model-select` and `#settings-model-select` from `listModelAdapters()`:
  ```js
  option.textContent = adapter.optionLabel || adapter.label || adapter.id;
  ```
  The cross-tab `storage` handler lives in the constructor (`this._storageHandler`).
- `js/settings-surface.js` — owns the gear, the popover, and the modal.
  `openPopover()` (lines 225–231) and `openModal()` (lines 254–268) are the
  two entry points. `openModal()` closes the popover first and emits
  `APP_EVENTS.UI_SETTINGS_OPENED`. The surface holds `this.settings`.
- `index.html`:
  - lines 55–62: the gear button (an icon-only `<button>` with
    `aria-label="Quick settings"`). **Plan 056 inserts a Transcription style
    field right after the popover Model label; leave it alone.**
  - lines 70–72: popover `<label class="quick-settings-field" for="model-select">Model …`.
  - line 298: modal `<label class="settings-row-title" for="settings-model-select">Transcription model<span class="settings-row-chip" aria-hidden="true">Model</span></label>`.
    **Do not reuse `.settings-row-chip`**: the surface hides every
    `.settings-row-chip` unless a search is active (`settings-surface.js:327–328`).
- `css/styles.css:1269–1315` — the gear is a 34 px circle with
  `position: relative` and a `::before` that provides the 44 px hit target.
  CLAUDE.md rule: decorative elements must never change a button's hit
  target, so the gear pill must be `position: absolute` and must not change
  the button's box.
- Tested colour pair to reuse: `--text-on-accent` on `--accent` is asserted
  ≥ 4.5:1 in all eight palette forms (`tests/palette-themes.vitest.js`,
  `FILL_PAIRS`). Use exactly that pair; do not introduce new colours.
- `.settings-row-chip` (`css/styles.css:1810`) is the size/shape exemplar:
  `padding: 1px 9px; border-radius: var(--radius-full); font-size: 0.75rem;`.
- Reduced motion is a hard requirement: add no animation to the pill.
- Conventions: every literal (storage names, ids, text) goes in
  `js/constants.js`; DOM is built node by node, never via `innerHTML`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| One test file | `npx vitest run tests/<name>.vitest.js` | all pass |
| Full suite + coverage | `npm run test:coverage` | all pass; thresholds met |
| Lint | `npm run lint` | exit 0 |
| Dependencies | `npm run deps:check` and `npm run deps:check:prod` | exit 0 |
| Build + size | `npm run build && npm run size` | exit 0; `application` ≤ 22.5 kB |
| Browser | `npm run test:browser` | all pass |
| NEVER | `npm run test:browser:live` | do not run |

## Scope

**In scope**:
- `js/constants.js`
- `js/model-adapters/mai-transcribe.js` — add `announceAsNew: true` to the MAI 2 adapter only (via the factory)
- `js/settings.js`
- `js/settings-surface.js`
- `index.html` — the gear button, the popover Model label, the modal Model row title
- `css/styles.css` — one `.new-model-pill` rule block plus the gear-positioned variant
- `tests/new-model-notice.vitest.js` (create)
- `tests/browser/new-model-notice.spec.js` (create)
- Existing tests that assert exact option text or the gear's accessible name, if any break
- `CLAUDE.md` (repo root) — persistence list and SettingsSurface paragraph
- `docs/design-log.md` — one short decision entry
- `plans/README.md` — your status row

**Out of scope**:
- Any change to model selection, the default model, Target URIs, or styles (plan 056).
- `GLOSSARY.md` (must stay byte-for-byte unchanged).
- Size budgets in `package.json` (the 23.5 kB `application` limit is already set by plan 056).
- A generic "what's new" or changelog system — only new models, only this marker.

## Git workflow

- Branch: continue on the 056 branch, or `advisor/057-new-model-notice` on top of it.
- Conventional commit, e.g. `feat(settings): show a one-time New notice for new models`.
- Do NOT push or open a PR.

## Steps

### Step 1: Constants

In `js/constants.js` add:
- `STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS: 'acknowledged_new_models'` (value: a
  JSON array of adapter ids).
- `ID.QUICK_SETTINGS_NEW_PILL: 'quick-settings-new-pill'`,
  `ID.QUICK_MODEL_NEW_PILL: 'quick-model-new-pill'`,
  `ID.SETTINGS_MODEL_NEW_PILL: 'settings-model-new-pill'` (with JSDoc `@property` lines).
- Text: `NEW_MODEL_PILL_TEXT: 'New'`, `NEW_MODEL_OPTION_SUFFIX: ' · New'`,
  `QUICK_SETTINGS_LABEL: 'Quick settings'`,
  `QUICK_SETTINGS_NEW_MODEL_LABEL: 'Quick settings, new model available'` —
  put them where similar UI strings live (`MESSAGES` or a small frozen object
  next to it; match the file).

**Verify**: `npm run lint` → exit 0.

### Step 2: Adapter flag

In `js/model-adapters/mai-transcribe.js`, let the factory accept
`announceAsNew` (default `false`) and include it on the frozen adapter only when
true (so Whisper/GPT/1.5 shapes are unchanged). Pass `announceAsNew: true` for
the MAI-Transcribe 2 adapter.

**Verify**: `node -e "import('./js/model-adapters/index.js').then(m=>console.log([...m.modelAdapterRegistry.values()].filter(a=>a.announceAsNew).map(a=>a.id)))"`
→ `[ 'mai-transcribe-2' ]` (if the import fails because of browser-only
imports, verify with a Vitest assertion in Step 6 instead).

### Step 3: Markup

In `index.html`:
- Inside the gear button, after the `<svg>`:
  `<span id="quick-settings-new-pill" class="new-model-pill new-model-pill--gear" aria-hidden="true" hidden>New</span>`
- In the popover Model label, right after the text `Model`:
  `<span id="quick-model-new-pill" class="new-model-pill" aria-hidden="true" hidden>New</span>`
- In the modal Model row title, right after `Transcription model` and before
  the chip: `<span id="settings-model-new-pill" class="new-model-pill" aria-hidden="true" hidden>New</span>`

The pills are `aria-hidden` because the screen-reader signal is carried by the
gear's accessible name and the option text.

### Step 4: CSS

Add one block near `.settings-row-chip`:
```css
/* One-time marker for a newly added model; the tested on-accent pair keeps AA in every palette. */
.new-model-pill {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: var(--radius-full);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.3;
    vertical-align: baseline;
}

/* Sits on the gear's corner without changing the button's box or hit target. */
.new-model-pill--gear {
    position: absolute;
    top: -6px;
    right: -10px;
    margin-left: 0;
    pointer-events: none;
}
```
Make sure `[hidden]` still wins (if a rule sets `display` on an element that can
be `hidden`, the codebase's existing `[hidden]` handling must apply — check how
`.uri-badge`/`.user-badge` hide and match it).

**Verify**: `npm run lint` → exit 0.

### Step 5: Behaviour

In `js/settings.js`:
- All new methods read `this.adapterRegistry` (the injected registry), never
  the module-level `modelAdapterRegistry`, so tests can inject a fake registry.
- `_readAcknowledgedNewModels()` → array of strings from
  `STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS`; invalid JSON or a non-array → `[]`.
- `getUnacknowledgedNewModels()` → ids of adapters with `announceAsNew === true`
  that are not in the acknowledged list.
- In the constructor/`init()`, compute once
  `this.newModelIdsThisLoad = new Set(this.getUnacknowledgedNewModels())`
  **before** `_renderModelOptions()`. `_renderModelOptions()` appends
  `NEW_MODEL_OPTION_SUFFIX` to the option text of those ids.
- Show `#quick-model-new-pill` and `#settings-model-new-pill` when
  `newModelIdsThisLoad.size > 0`. They stay for this page load (decision 2).
- `acknowledgeNewModels()` → writes the union of the stored list and every
  currently announced id to storage (valid JSON array, no duplicates), and
  returns whether anything changed. Must be idempotent.
- Extend the existing `storage` handler: when
  `event.key === STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS || event.key === null`,
  ask the surface to refresh the gear marker (another tab acknowledged).
  Intended edge case, do not "fix": on `key === null` (another tab cleared
  storage) the gear pill may come back while this tab's row pills and option
  suffix are not recomputed until the next load.

In `js/settings-surface.js`:
- `refreshNewModelMarker()` → shows `#quick-settings-new-pill` and sets the
  gear `aria-label` to `QUICK_SETTINGS_NEW_MODEL_LABEL` when
  `this.settings?.getUnacknowledgedNewModels?.().length > 0`; otherwise hides
  the pill and restores `QUICK_SETTINGS_LABEL`. Call it from `init()`.
- At the start of `openPopover()` and `openModal()` (after the early-return
  guards), call `this.settings?.acknowledgeNewModels?.()` then
  `this.refreshNewModelMarker()`.
- Wire the Settings storage handler to call `refreshNewModelMarker()` (e.g. via
  `this.surface?.refreshNewModelMarker?.()` in Settings, matching how Settings
  already calls `this.surface?.refreshRows()`).

**Verify**: `npm run lint` → exit 0.

### Step 6: Tests

Create `tests/new-model-notice.vitest.js`, modelled on
`tests/registry-driven-model-ui.vitest.js`, which uses `installProductionBody`
with a real `new Settings(registry)` over the production `index.html` body.
(`tests/settings-surface.vitest.js` uses a fake settings object and cannot
exercise option text or row pills.) Wire the pair in the same order as
`js/main.js`: `new Settings(registry)`, then
`new SettingsSurface({ settings, ... })`, `settings.setSurface(surface)`,
`surface.init()`. Cases:

1. Empty storage → gear pill visible, gear `aria-label` is the "new model
   available" text, both row pills visible, the MAI 2 option text in both
   selects ends with ` · New`, other options unchanged.
2. `openPopover()` → storage holds `["mai-transcribe-2"]`, gear pill hidden,
   gear label back to `Quick settings`; row pills and option suffix still
   present (same page load).
3. `openModal()` alone (no popover first) → same acknowledgement.
4. Re-constructing Settings + surface with the acknowledgement stored → no
   pills, no suffix, plain gear label.
5. Corrupt stored value (`'not json'`, `'{}'`) → treated as nothing
   acknowledged, notice shows, and acknowledging writes a valid array.
6. A fake registry with a second `announceAsNew` adapter and MAI 2 already
   acknowledged → notice shows for the second adapter only.
7. A `storage` event for `acknowledged_new_models` from another tab → gear
   pill hides.
8. `acknowledgeNewModels()` twice → stored array has no duplicates.

Update any existing test that asserts the exact MAI 2 option text or the
gear's `aria-label` so it runs with the acknowledgement pre-seeded (preferred)
rather than changing its expectation. Known one:
`tests/browser/auth-menu-recovery.spec.js:66–70` asserts exact option texts
after `openQuickSettings` clicks the gear, so the ` · New` suffix is present on
that same page load. Seed `acknowledged_new_models` = `["mai-transcribe-2"]` in
its `addInitScript` (lines ~29–41).

Create `tests/browser/new-model-notice.spec.js`, modelled on the setup in
`tests/browser/auth-menu-recovery.spec.js` (same app-opening helper pattern):
fresh storage → `#quick-settings-new-pill` visible → click the gear → reload →
pill hidden and the MAI 2 option text has no ` · New`. `page.addInitScript`
re-runs on every navigation including reload, so in this spec rely on
Playwright's fresh per-test context for empty storage and **never** clear
localStorage or remove `acknowledged_new_models` inside an init script. Also assert the gear's
bounding box is identical with and without the pill (hit-target rule).

**Verify**: `npm run test:coverage` → all pass; `npm run test:browser` → all pass.

### Step 7: Docs

- `CLAUDE.md` (repo root): in "Models, Settings, and the settings surface",
  extend "Browser-local persistence is limited to …" with "the new-model notice
  acknowledgement". In the `SettingsSurface` paragraph add one sentence: an
  adapter with `announceAsNew` gets a one-time New marker on the gear, the
  Model rows, and its option text, acknowledged the first time either surface
  opens.
- `docs/design-log.md`: short entry "One-time New marker for new models":
  why the in-surface pills persist for the rest of the page load, why the
  gear pill hides at once, why acknowledgement is per model id.

**Verify**: `git diff --stat -- GLOSSARY.md` → empty.

## Test plan

See Step 6: eight Vitest cases in `tests/new-model-notice.vitest.js` and one
Playwright spec in `tests/browser/new-model-notice.spec.js`.

## Done criteria

- [ ] `npm run test:coverage`, `npm run lint`, `npm run deps:check`, `npm run deps:check:prod` exit 0
- [ ] `npm run build && npm run size` exit 0; no budget changed beyond the 23.5 kB already set by 056
- [ ] `npm run test:browser` exits 0, including the new spec
- [ ] `grep -n "announceAsNew" js/model-adapters/*.js` → only the MAI 2 adapter sets it to true
- [ ] `grep -rn "acknowledged_new_models" js/` → only `js/constants.js`
- [ ] `grep -A14 "^\.new-model-pill" css/styles.css | grep -c "animation\|transition"` → `0`
- [ ] `git diff --name-only $BASE056` lists only in-scope files; `git diff --stat bdf23f9 -- GLOSSARY.md` → empty
- [ ] `plans/README.md` row for 057 updated (unless a reviewer maintains it)

## STOP conditions

- Plan 056 is not present (see drift check).
- `npm run size` exceeds a budget — report numbers, do not raise it.
- The gear pill changes the gear's box or the 44 px hit target and absolute
  positioning cannot avoid it.
- Showing/hiding the modal pill seems to need changes to the surface's
  category/search filtering.
- An existing test would need a changed expectation about behaviour (not just
  seeded storage) to pass.

## Maintenance notes

- **Announcing the next model**: set `announceAsNew: true` on its adapter.
  Remove the flag from MAI-Transcribe 2 at the same time (or once it is no
  longer new); ids already stored in `acknowledged_new_models` are harmless.
- The acknowledgement list only grows. It is a handful of short ids, so no
  pruning is needed.
- If the popover or modal gains another way to open (a new shortcut path),
  it must go through `openPopover()`/`openModal()` or it will not acknowledge.
  `Ctrl/Cmd + ,` already goes through `openModal()`, and so does `API_CONFIG_MISSING` recovery via `Settings.openSettingsModal()`.
- Reviewer focus: the hit-target assertion, the `aria-label` swap, and that
  corrupt storage cannot throw during bootstrap.
