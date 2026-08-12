# Plan 053: Drive model UI from the adapter registry and enforce per-model upload limits at selection time

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- js/model-adapters/ js/settings.js js/selected-audio-controller.js js/ui.js js/constants.js index.html`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 048/051/052 may have landed
> first — their changes are expected and compatible.)

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/052-retire-two-adapter-invariant.md (docs no longer
  forbid new adapters); plans/051-auth-boundary-test-hardening.md recommended
  first (safety net)
- **Category**: tech-debt
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

The adapter seam covers scope, URI storage key, FormData, and parsing — but
the user-visible half of a model is hand-enumerated across ~6 files: two
`<select>`s, two selected-audio panels per model, a Connection URI row plus
element ids, storage keys, messages, and a model-specific size branch. Adding
one model is a lockstep multi-file edit whose failure mode is a silent blank
panel. Worse, the selection-time size gate exists only for Whisper: a large
file on any other model runs a full decode/resample/encode (GB-scale memory,
can OOM the tab) before its limit is checked. After this plan, a new model is
registered by writing one adapter object with UI metadata; plan 054 then adds
`gpt-transcribe` as nearly pure adapter work.

## Current state

- `js/model-adapters/whisper.js` — the exemplar adapter (frozen object):
  `id`, `label: 'Azure Whisper'`, `scope`, `storageKeys.uri`,
  `buildRequest`, `parseResponse`. The MAI adapter is a factory in
  `js/model-adapters/mai-transcribe.js`; registry in
  `js/model-adapters/index.js` (a `Map` of id → adapter).
- `index.html:62-64` and `:323-326` — both selects hand-list:

```html
<select id="model-select">
    <option value="whisper">Azure Whisper</option>
    <option value="mai-transcribe-1.5">MAI-Transcribe 1.5</option>
</select>
```

- `index.html:137-171` — per-model panels `data-selected-state="ready-whisper"`,
  `ready-mai-transcribe-1.5`, `tooLarge-whisper`, `tooLarge-mai-transcribe-1.5`,
  each with verdict copy and identical action buttons; consumed at
  `js/ui.js:520-527`:

```js
const panelState = [SELECTED_AUDIO_STATES.READY, SELECTED_AUDIO_STATES.TOO_LARGE].includes(state)
    ? `${state}-${snapshot.model}`
    : state;
```

A model with no matching panel renders an empty workspace (every panel
hidden) — the silent-blank failure mode.

- `index.html:382-403` — one hand-written Connection row per model
  (`data-settings-row="whisperUri"` / `"maiUri"`) with per-model input/badge
  ids from `js/constants.js:296-299` (`WHISPER_URI`, `WHISPER_URI_BADGE`,
  `MAI_TRANSCRIBE_URI`, `MAI_URI_BADGE`).
- `js/settings.js` — per-model fields `whisperUriInput`/`whisperUriBadge`/
  `maiTranscribeUriInput`/`maiUriBadge` (lines ~51-54), pairwise calls in
  `loadTargetUris()` (~165-168) and `renderUriBadges()` (~301-308), listener
  wiring per field, and `_getSelectableModels()` (~147-152) reading the DOM
  options as the allow-list.
- `js/selected-audio-controller.js:265-273` — the whisper-only size gate:

```js
if (model === MODEL_TYPES.WHISPER && file.size > WHISPER_MAX_UPLOAD_BYTES) {
    this.#setSnapshot({ state: SELECTED_AUDIO_STATES.TOO_LARGE, ... });
    return false;
}
```

- `js/constants.js` — `WHISPER_MAX_UPLOAD_BYTES = 25 * 1024 * 1024`,
  `MAI_TRANSCRIBE_MAX_UPLOAD_BYTES = (300 * 1024 * 1024) - 1` (~line 110).
- Conventions: constants and ids centralized in `js/constants.js`; DOM built
  in `index.html` (no framework); frozen adapter objects; settings apply
  instantly; tests pin the settings-modal row search/filtering
  (`js/settings-surface.js` reads rows generically via
  `data-settings-row` / `data-category` / `data-keywords` — generated rows
  must carry the same attributes).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Full suite | `npm test` | all pass |
| Coverage | `npm run test:coverage` | thresholds met |
| Lint | `npm run lint` | exit 0 |
| Browser suite | `npm run test:browser` | all pass (builds its own dist) |
| NEVER | `npm run test:browser:live` | do not run |

## Scope

**In scope** (the only files you should modify):
- `js/model-adapters/whisper.js`, `js/model-adapters/mai-transcribe.js`,
  `js/model-adapters/index.js`
- `js/settings.js`, `js/selected-audio-controller.js`, `js/ui.js`
- `js/constants.js`
- `index.html`
- `package.json` and `tests/vite-build.vitest.js` — ONLY the application
  size-budget value (maintainer-approved raise to 22 kB; see STOP conditions)
- `tests/` files whose assertions reference the changed surfaces
- `spec/spec-design-api-client.md` — ONLY the adapter-addition checklist
  items that this plan collapses (mark them adapter-declared)

**Out of scope** (do NOT touch):
- `js/api-client.js`, `js/authentication-*.js`, `js/token-provider.js`
- `js/settings-surface.js` — keep it generic; if a change there seems
  required, STOP and report
- `css/styles.css` — reuse existing classes; no visual redesign
- `auth/redirect.html`, `vite.config.js`
- `tests/browser-live/` and the live workflow

## Git workflow

- Branch: `advisor/053-registry-driven-model-ui`
- Commit per step; conventional commits, e.g.
  `refactor(models): declare upload limits and UI metadata on adapters`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend the adapter contract with UI metadata

Add to BOTH adapters (frozen, alongside existing fields):

```js
maxUploadBytes: WHISPER_MAX_UPLOAD_BYTES,      // number | null
uploadLimitLabel: 'up to 25 MB',               // copy for the tooLarge verdict
uploadLimitAppliesTo: 'source',                // 'source' | 'converted'
uri: Object.freeze({
    rowId: 'whisperUri',                        // data-settings-row value
    inputId: ELEMENT_IDS.WHISPER_URI,
    badgeId: ELEMENT_IDS.WHISPER_URI_BADGE,
    title: 'Whisper Target URI',
    subtitle: 'Your Azure Whisper endpoint · HTTPS only',
    keywords: 'whisper target uri endpoint https azure connection'
})
```

For MAI: `maxUploadBytes: MAI_TRANSCRIBE_MAX_UPLOAD_BYTES`,
`uploadLimitAppliesTo: 'converted'` (its documented limit applies after WAV
conversion), plus its existing row values (`maiUri`, current ids, current
copy). Keep existing ids/copy byte-identical so no test churn from Step 1.

**Verify**: `npm test` → all pass (metadata addition breaks nothing)

### Step 2: Generate the model options from the registry

In `js/settings.js` (bootstrap path that already owns both selects), replace
the static options by populating both `<select>`s from
`modelAdapterRegistry.values()` → `new Option(adapter.label, adapter.id)`,
then remove the hard-coded `<option>`s from both selects in `index.html`.
`_getSelectableModels()` now derives from the registry keys instead of DOM
options (its validate-and-reset consumers keep working — same value set).

**Verify**: `npm test` → all pass; `grep -c "option value=\"whisper\"" index.html` → 0

### Step 3: Generate the Connection URI rows

In `index.html`, replace the two hand-written Connection rows with a single
container (e.g. `<div id="connection-rows"></div>`) placed exactly where the
whisper row starts. In `js/settings.js`, at construction, build one row per
adapter from `adapter.uri` metadata, reproducing the EXACT current DOM shape
(row div with `data-settings-row`/`data-category="connection"`/
`data-keywords`, label + chip, subtitle, badge span, `input[type=url]` with
`autocomplete="off" spellcheck="false"`). Replace the per-model
field/badge/listener pairs (`whisperUriInput`, `maiTranscribeUriInput`, …)
with a `Map` keyed by adapter id, and iterate it in `loadTargetUris()`,
`renderUriBadges()`, and listener setup. `_handleUriInput` logic (including
plan 048's invalid-branch clear, if landed) is unchanged — it just receives
the input from the map.

Build rows with `document.createElement` (no `innerHTML` with dynamic
values — repo security convention).

**Verify**: `npx vitest run tests/settings-persistence.vitest.js tests/settings-surface.vitest.js tests/settings-sidebar.vitest.js` → all pass (these pin
row search/filter/badge behavior; failures mean the generated DOM diverged —
fix the generation, not the tests, unless an assertion hard-codes "static
markup exists in index.html")

### Step 4: Generate the ready/tooLarge panels

Keep the four static per-model panels' *shape* but generate them: add a
container inside the selected-audio workspace; at UI construction, for each
adapter create `ready-<id>` and `tooLarge-<id>` panels cloning the existing
structure (verdict copy from `adapter.label` and `adapter.uploadLimitLabel`;
identical action buttons with the same `data-selected-action` values). Remove
the four static panels from `index.html`. In `js/ui.js`, add a fallback: if
no panel matches `panelState`, log a warning and show the generic `failed`
panel rather than rendering nothing (kills the silent-blank failure mode).

**Verify**: `npm test` → all pass; `npm run test:browser` → all pass
(the Playwright deterministic suite exercises the selected-audio panels)

### Step 5: Per-model selection-time size gate

In `js/selected-audio-controller.js` `#validateCurrentFile`, replace the
whisper-only branch with an adapter lookup:

```js
const adapter = this.#adapterRegistry?.get(model);   // inject registry like Settings does
const limit = adapter?.maxUploadBytes ?? null;
if (limit !== null && file.size > limit) {
    // TOO_LARGE snapshot, as the current whisper branch does
}
```

For `uploadLimitAppliesTo: 'converted'` adapters (MAI), the source file can
legitimately exceed the converted limit only when the source is *more*
compressed than 16 kHz mono 16-bit WAV — which is essentially always — so
applying the same source-size ceiling is a conservative correct gate: a
source file at or over the converted ceiling cannot convert to under it.
Keep the existing post-conversion check in `mai-transcribe.js` as backstop.

**Verify**: `npx vitest run tests/selected-audio.vitest.js` → all pass, plus
new cases below

### Step 6: Retire now-dead per-model constants

Remove from `js/constants.js` any `ELEMENT_IDS` entries that became
adapter-declared duplicates ONLY if nothing else references them
(`grep -rn "WHISPER_URI_BADGE" js/ tests/`). Prefer leaving a constant in
place over breaking an untouched consumer. Update the spec checklist items
that this plan collapsed.

**Verify**: `npm run lint && npm run deps:check` → exit 0

## Test plan

- New: registry-driven rendering — a test registering a fake third adapter
  (id `fake-model`, label, limits, uri metadata) into a test-scoped registry
  copy and asserting: both selects gain the option, a Connection row is
  generated with badge behavior, ready/tooLarge panels exist, and the size
  gate fires TOO_LARGE for an oversized file on `fake-model`. This test is
  the proof plan 054 needs.
- New: MAI oversized file now hits TOO_LARGE at selection (no conversion
  started — assert the converter mock was not called).
- New: `js/ui.js` unknown-panel fallback shows the failed panel + warning.
- Pattern: follow `tests/settings-persistence.vitest.js` and
  `tests/selected-audio.vitest.js` harnesses.
- Verification: `npm run test:coverage` → thresholds met;
  `npm run test:browser` → pass.

## Done criteria

- [ ] `npm test` and `npm run test:browser` exit 0
- [ ] `npm run lint`, `npm run deps:check`, `npm run size` exit 0
- [ ] `grep -n "mai-transcribe-1.5" index.html` → no matches (model identity
      no longer hand-written in HTML)
- [ ] `grep -n "MODEL_TYPES.WHISPER && file.size" js/selected-audio-controller.js` → no matches
- [ ] A fake-adapter registration test exists and passes
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `js/settings-surface.js` requires modification to keep row search/filter
  working with generated rows.
- The Playwright deterministic suite fails on panel focus/visibility after
  Step 4 and the fix is not a faithful-generation bug.
- ~~`npm run size` fails — do not raise the budget~~ **RESOLVED by maintainer
  ruling (first execution attempt correctly stopped here):** the application
  bundle sat at 20.45 kB of a 20.5 kB budget before this plan; registry-driven
  rendering cannot fit in 50 bytes. The maintainer explicitly approved raising
  the application budget to **22 kB** as a reviewed decision (deliberate
  architecture growth, more models expected). As part of this plan, update the
  application budget from `20.5 kB` to `22 kB` in BOTH places: the size-limit
  config in `package.json` AND the literal assertion in
  `tests/vite-build.vitest.js` (search for `20.5 kB`). Touch no other budget
  (the redirect and authentication budgets stay). `npm run size` failing
  AFTER the raise remains a STOP condition.
- Any excerpt mismatch (drift), including plans 048/051/052 having changed
  in-scope lines in ways these steps did not anticipate.

## Maintenance notes

- After this plan, "add a model" = write one adapter file + registry entry +
  `MODEL_TYPES`/`STORAGE_KEYS`/`MESSAGES` constants + tests. Plan 054
  exercises exactly that path; keep its diff honest as validation.
- Reviewer scrutiny: byte-identical copy for existing models (labels,
  verdicts, subtitles) — diff rendered DOM in the browser tests; and that the
  generated rows preserve `data-keywords` search behavior.
- The `uploadLimitAppliesTo` distinction exists so a future model with a
  post-conversion limit and *un*compressed sources can opt out of the
  conservative source gate — do not remove it as "unused".
