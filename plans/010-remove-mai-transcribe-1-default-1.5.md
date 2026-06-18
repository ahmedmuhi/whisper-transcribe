# Plan 010: Remove MAI-Transcribe 1 entirely; make MAI-Transcribe 1.5 the out-of-box default

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. Audit every claim in your report against an actual tool
> result.
>
> **Drift check (run first)**:
> `git log --oneline -1` should show `a231de2` (the PR #71 revert merge) as
> HEAD or an ancestor, and `git status` must be clean. Then re-verify the
> "Current state" line anchors below against the live files; line numbers drift,
> so locate edits by the quoted text, not the number. On a mismatch, compare the
> excerpt against live code before proceeding; if the code no longer matches,
> treat it as a STOP condition.

## Status

- **Priority**: P1 (product decision — user removing a model and changing the default)
- **Effort**: M
- **Risk**: MED — this deletes a public model constant and an adapter, flips the
  app default, and adds a localStorage migration. Several existing tests
  reference the MAI-1 constant and must be repointed/deleted in lockstep; the
  migration interacts with how the test DOM mocks the model `<select>` (see
  Step 4's fail-open rule). All of it is mechanical, but it touches the gated
  test suite, so the test edits are part of the plan, not an afterthought.
- **Depends on**: none (sequence after 009; the MAI-1.5 style toggle was
  reverted in 009, so the adapter is back to its plain pre-008 shape)
- **Category**: chore / product decision
- **Planned at**: commit `a231de2`, 2026-06-18

## Why this matters

MAI-Transcribe 1 (`mai-transcribe`, wire model `mai-transcribe-1`) and
MAI-Transcribe 1.5 (`mai-transcribe-1.5`, wire model `mai-transcribe-1.5`)
currently both ship as selectable preview models. The user has decided to drop
MAI-1 completely and promote MAI-1.5 to the **out-of-box default** (replacing
Whisper as the no-saved-preference fallback). The two MAI models share the same
endpoint family, credentials, request shape, and response parser; MAI-1 differs
only by the `enhancedMode.model` wire string. So removing it is a clean deletion
of one constant pair, one adapter export, two `<option>` lines, and the matching
test references — plus a default flip and a one-time validate-and-reset for any
user who already saved `mai-transcribe`.

The default flip needs a migration because the saved preference lives in
`localStorage` under `STORAGE_KEYS.MODEL` and survives across versions. A user
who previously selected MAI-1 would, after this change, load a model id that no
longer exists in the dropdown — leaving the `<select>` value pointing at a
removed option (blank/undefined selection). The migration in `loadSavedModel()`
detects that and rewrites the stored value to the new default.

## Decisions (settled with the user — verified technically sound here, not re-litigated)

1. **Remove MAI-1 entirely**: delete the `maiTranscribeModelAdapter` export and
   its `createMaiTranscribeModelAdapter(...)` call site; remove its import +
   registry entry from `index.js`; delete `MODEL_TYPES.MAI_TRANSCRIBE` and
   `MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL` from `constants.js`; remove both MAI-1
   `<option>` lines from `index.html`.
2. **Flip the default** from `MODEL_TYPES.WHISPER` to
   `MODEL_TYPES.MAI_TRANSCRIBE_1_5` at all three empty-state fallback sites in
   `settings.js`. All three flip — see Step 2 for each one's role and why
   consistency is required.
3. **Validate-and-reset migration** in `loadSavedModel()`: if the saved model is
   not one of the currently-available/selectable models, overwrite it to the
   default (1.5) and persist back. Source of truth = the actual `<option>`
   values in `this.modelSelect` — **with a fail-open guard** when the option set
   is empty (justified in Step 4; this is what keeps the change compatible with
   the adapter registry's hidden `whisper-translate` entry AND with the test DOM
   mocks that have no `<option>` children).
4. **Keep surviving constants verbatim**: `MAI_TRANSCRIBE_1_5: 'mai-transcribe-1.5'`
   and `MAI_TRANSCRIBE_1_5_API_MODEL: 'mai-transcribe-1.5'` are unchanged. The
   wire value `'mai-transcribe-1.5'` sent in `enhancedMode.model` is the real
   Azure model name and MUST NOT change.
5. **Labels unchanged**: dropdown text stays `MAI-Transcribe 1.5 (Preview)` and
   `Whisper (Stable)`. No test asserts that visible text (verified). The adapter
   `.label` field is dead metadata (verified: only consumers of `.label` in
   `js/` are device labels in `settings.js:400`/`permission-manager.js` and the
   control-button `cfg.label` in `ui.js` — none read an adapter's `.label`).
6. **Dropdown order unchanged** (Whisper first, MAI-1.5 second). Selection is
   `.value`-driven; order is cosmetic. The `createMaiTranscribeModelAdapter`
   factory stays as-is (now single-use — inlining is a separate `/simplify`
   call, out of scope here).
7. **Simplify `_isMaiModel`** to `return model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;`.

## Current state (verified at `a231de2`)

`js/constants.js` `MODEL_TYPES` block (lines ~99–106):

```js
export const MODEL_TYPES = {
  WHISPER_TRANSLATE: 'whisper-translate',
  WHISPER:           'whisper',
  MAI_TRANSCRIBE:    'mai-transcribe',          // ← delete
  MAI_TRANSCRIBE_1_5: 'mai-transcribe-1.5',
  MAI_TRANSCRIBE_API_MODEL: 'mai-transcribe-1', // ← delete
  MAI_TRANSCRIBE_1_5_API_MODEL: 'mai-transcribe-1.5'
};
```

`js/model-adapters/index.js` (whole file):

```js
import { whisperModelAdapter } from './whisper.js';
import { whisperTranslateModelAdapter } from './whisper-translate.js';
import { maiTranscribeModelAdapter, maiTranscribe15ModelAdapter } from './mai-transcribe.js';

// Order matters for AzureAPIClient.parseResponse(): adapters are tried in legacy parse precedence.
export const modelAdapterRegistry = new Map([
    [maiTranscribeModelAdapter.id, maiTranscribeModelAdapter],   // ← delete this line + the import binding
    [maiTranscribe15ModelAdapter.id, maiTranscribe15ModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter],
    [whisperTranslateModelAdapter.id, whisperTranslateModelAdapter]
]);
```

`js/model-adapters/mai-transcribe.js` (lines 43–47, the MAI-1 export to delete;
the factory at 9–41 and the 1.5 export at 49–53 stay):

```js
export const maiTranscribeModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE,
    'Azure MAI-Transcribe 1',
    MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL
);
```

`index.html` — two MAI-1 option lines (line 79 in the side-panel `#model-select`,
line 248 in the modal `#settings-model-select`):

```html
<option value="mai-transcribe">MAI-Transcribe 1 (Preview)</option>
```

`js/settings.js` — three default-fallback sites and `_isMaiModel`:

- `loadSavedModel()` line 101:
  `const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || MODEL_TYPES.WHISPER;`
- main-UI change handler line 122:
  `const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || MODEL_TYPES.WHISPER;`
- `saveSettings()` line 604:
  `const previousModel = localStorage.getItem(STORAGE_KEYS.MODEL) || MODEL_TYPES.WHISPER;`
- `_isMaiModel(model)` line 692–694:
  `return model === MODEL_TYPES.MAI_TRANSCRIBE || model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;`

`AzureAPIClient.parseResponse` (`js/api-client.js:384–395`) iterates
`this.adapterRegistry.values()` in insertion order and returns the first parser
that doesn't throw. Both MAI adapters use `parseMaiTranscribeResponse`
(`js/model-adapters/response-parsers.js:19`); whisper + whisper-translate use
`parseWhisperResponse`. **Removing the MAI-1 registry entry does not change
parse precedence**: the registry still tries a `parseMaiTranscribeResponse`
adapter (now MAI-1.5) before the whisper parsers, so `combinedPhrases`-first
sniffing is byte-for-byte preserved for whisper/whisper-translate. State this in
the report.

Baseline (verified): `npx vitest run` → **32 files / 384 tests pass**.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Tests | `npm test` | `Test Files 32 passed (32)`, `Tests 382 passed (382)` (see delta below) |
| Lint | `npm run lint` | exit 0 |
| Prod deps | `npm run deps:check:prod` | exit 0 |
| Size | `npm run size` | exit 0, under 100 kB |
| Coverage | `npm run test:coverage` | exit 0, thresholds met (stmts 85 / branches 80 / funcs 70 / lines 85) |

## Scope

**In scope** (the only files you should modify):

- `js/constants.js` — remove two `MODEL_TYPES` entries
- `js/model-adapters/index.js` — remove the MAI-1 import binding + registry entry
- `js/model-adapters/mai-transcribe.js` — remove the `maiTranscribeModelAdapter` export
- `index.html` — remove the two MAI-1 `<option>` lines
- `js/settings.js` — flip three defaults, add the migration, simplify `_isMaiModel`
- `README.md` — **no change** (verified; see Step 7)
- Test files (Step 8): `tests/mai-transcribe.vitest.js`,
  `tests/model-adapters.vitest.js`, `tests/api-client-errors.vitest.js`,
  `tests/api-client-validation.vitest.js`, `tests/settings-persistence.vitest.js`,
  `tests/settings-unit.vitest.js`, `tests/settings-workflow.vitest.js`
  (**added during execution** — see Step 8h; the original "no edit" prediction
  was wrong, the default flip breaks one of its tests)

**Out of scope** (do NOT touch):

- `spec/spec-design-api-client.md` — it still references `mai-transcribe` /
  `mai-transcribe-1` (lines 31, 135, 137, 246–253, …) and already omits MAI-1.5.
  This drift is recorded as backlog item #4 in `plans/README.md` and is a
  separate doc-fix task. `spec/` is `knip`-ignored and not part of any gate, so
  leaving it does not break the pre-push hook. Note it in your report; do not
  fix it here.
- Inlining `createMaiTranscribeModelAdapter` (single-use after this change) — a
  `/simplify` call, out of scope.
- The `SENDING_TO_MAI_TRANSCRIBE` message constant — still used by the surviving
  1.5 adapter; keep it.
- ~~`tests/settings-workflow.vitest.js` — no edit needed.~~ **CORRECTED during
  execution:** this prediction was wrong. The file never references
  `MODEL_TYPES.MAI_TRANSCRIBE`, but the Step-2 default flip breaks one of its
  tests, so it is now **in scope** with a one-line fix — see Step 8h.

## Git workflow

- Branch: `chore/010-remove-mai1-default-15`
- Single commit, e.g.
  `chore: remove MAI-Transcribe 1; default to MAI-Transcribe 1.5 with reset migration`
- End the commit message with trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the MAI-1 constants

In `js/constants.js`, delete the two MAI-1 lines from `MODEL_TYPES`, leaving:

```js
export const MODEL_TYPES = {
  WHISPER_TRANSLATE: 'whisper-translate',
  WHISPER:           'whisper',
  MAI_TRANSCRIBE_1_5: 'mai-transcribe-1.5',
  MAI_TRANSCRIBE_1_5_API_MODEL: 'mai-transcribe-1.5'
};
```

**Verify**:
`grep -n "MAI_TRANSCRIBE:\|MAI_TRANSCRIBE_API_MODEL:" js/constants.js` → no matches.
`node -e "import('./js/constants.js').then(m => console.log(m.MODEL_TYPES.MAI_TRANSCRIBE, m.MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL))"` → `undefined undefined`.

### Step 2: Flip the three defaults in `js/settings.js`

Change each `|| MODEL_TYPES.WHISPER` fallback to `|| MODEL_TYPES.MAI_TRANSCRIBE_1_5`:

- **`loadSavedModel()` (line ~101)** — the empty-storage default. This is the
  primary out-of-box default: a brand-new user with no saved preference lands on
  MAI-1.5. **Flip.**
- **main-UI `change` handler (line ~122)** — reads the prior saved model only to
  populate `savedModel` in the `UI_MODEL_SWITCHED` event payload (session-only
  switch; nothing is persisted here). If storage is empty, the "previous" model
  should report the same default the app actually booted with. **Flip** for
  consistency — if this stayed `WHISPER` while `loadSavedModel` used 1.5, the
  event payload would claim a previous model the user never saw.
- **`saveSettings()` `previousModel` (line ~604)** — reads the prior saved model
  to decide whether to emit `SETTINGS_MODEL_CHANGED` (`currentModel !==
  previousModel`). With empty storage, the default must match `loadSavedModel`'s
  default so that saving the (unchanged) default does not spuriously fire a
  "model changed" event. **Flip.**

All three flip. None should stay `WHISPER` — divergence would make the
session-only "previous model" bookkeeping lie about what the app defaulted to.

**Verify**: `grep -n "MODEL_TYPES.WHISPER\b" js/settings.js` → no matches
(the only `MODEL_TYPES.WHISPER` references were these three; whisper is now
referenced only via the `<option value="whisper">` in HTML and the adapter).

### Step 3: Simplify `_isMaiModel` (line ~692)

```js
    _isMaiModel(model) {
        return model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
    }
```

**Verify**: `grep -n "MAI_TRANSCRIBE\b" js/settings.js` → no matches (only
`MAI_TRANSCRIBE_1_5`, `MAI_TRANSCRIBE_URI`, `MAI_TRANSCRIBE_API_KEY`,
`MAI_TRANSCRIBE_SETTINGS`, `MAI_TRANSCRIBE_KEY` remain — all survivors).

### Step 4: Add the validate-and-reset migration in `loadSavedModel()`

Replace the body of `loadSavedModel()` (currently lines ~100–106) with a version
that validates the saved value against the **selectable `<option>` set** and
resets to the default when it isn't selectable:

```js
    loadSavedModel() {
        const defaultModel = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        let savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || defaultModel;

        // Validate against the selectable dropdown options (the real UI set),
        // not the adapter registry — the registry includes the hidden
        // 'whisper-translate' adapter that is not a dropdown option, so
        // validating against it could leave a stored 'whisper-translate'
        // pointing at no visible selection. If the saved model is no longer
        // selectable (e.g. the removed 'mai-transcribe'), reset to the default
        // and persist the correction.
        const selectable = this._getSelectableModels();
        if (selectable.length > 0 && !selectable.includes(savedModel)) {
            savedModel = defaultModel;
            localStorage.setItem(STORAGE_KEYS.MODEL, savedModel);
        }

        this.modelSelect.value = savedModel;
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = savedModel;
        }
    }

    /**
     * The set of model ids the user can actually pick from the main dropdown.
     * Read from the live <option> values so the selectable set is the single
     * source of truth (not the adapter registry, which carries hidden models).
     * Returns [] when no options are present (e.g. a mocked test DOM) so callers
     * can fail open and skip validation rather than wrongly resetting.
     *
     * @private
     * @returns {string[]} Selectable model ids
     */
    _getSelectableModels() {
        const options = this.modelSelect?.options
            ? Array.from(this.modelSelect.options)
            : [];
        return options.map(o => o.value).filter(Boolean);
    }
```

**Why the source of truth is the `<option>` set, not the registry** (verified):
the adapter registry (`js/model-adapters/index.js`) intentionally includes
`whisper-translate`, which is **not** present in either `<select>` in
`index.html` (confirmed: no `whisper-translate` option exists). Validating
against the registry would treat a stored `whisper-translate` as "available" and
assign it to the dropdown, leaving the visible selector blank (no matching
option). The `<option>` values are exactly the selectable UI set, so they are
the correct authority.

**Why the `selectable.length > 0` fail-open guard is mandatory** (verified
against the test DOM): the Settings unit/persistence/workflow suites mock the
model `<select>` with plain stub objects
(`tests/helpers/mock-settings-dom.js` `createMockElement` /
`createStatefulMockElement`, and `tests/helpers/test-dom-vitest.js`
`applyDomSpies`). None of those mocks expose real `<option>` children or an
`.options` collection. Without the guard, `_getSelectableModels()` would return
`[]`, every saved model (including `'whisper'`) would be judged "not selectable"
and reset to 1.5, and `getModelConfig()` (which reads `this.modelSelect.value`)
would return the wrong model — breaking, e.g.,
`tests/settings-persistence.vitest.js:230` ("should return the correct config for
the Whisper model", which seeds `STORAGE_KEYS.MODEL = 'whisper'` and expects
`whisper` back). The guard makes validation a no-op when there is no real option
set, so the migration only fires in the real browser DOM (and in the two new
tests in Step 8, which build a select with real options). This also means the
default-flip in `loadSavedModel` (Step 2) is what those mock-DOM tests exercise
for the empty-storage path, and it stays correct.

> Implementation note: happy-dom `<select>` elements expose `.options` (an
> `HTMLOptionsCollection`); plain `<div>` stubs and the hand-rolled mocks do
> not. The optional-chain + `Array.from` guard handles both. Do not switch to
> `querySelectorAll('option')` — the hand-rolled mocks stub `querySelectorAll`
> to return `[]` too, but `.options` is the idiomatic select API and reads
> clearer.

**Verify** (after Step 8 adds the regression tests):
`npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js tests/settings-workflow.vitest.js` → all pass.

### Step 5: Remove the MAI-1 adapter export

In `js/model-adapters/mai-transcribe.js`, delete the `maiTranscribeModelAdapter`
export (the `createMaiTranscribeModelAdapter(MODEL_TYPES.MAI_TRANSCRIBE, …)`
call, lines ~43–47). Keep the factory function and the `maiTranscribe15ModelAdapter`
export. The `MODEL_TYPES` import stays (still used by the 1.5 export).

**Verify**: `grep -n "maiTranscribeModelAdapter\b" js/model-adapters/mai-transcribe.js`
→ no matches (only `maiTranscribe15ModelAdapter` remains).

### Step 6: Remove the MAI-1 registry entry + import

In `js/model-adapters/index.js`:
- Change the import to `import { maiTranscribe15ModelAdapter } from './mai-transcribe.js';`
- Delete the `[maiTranscribeModelAdapter.id, maiTranscribeModelAdapter],` line.
- Keep the `// Order matters …` comment verbatim (precedence unchanged — the
  rationale in "Current state").

Resulting registry:

```js
export const modelAdapterRegistry = new Map([
    [maiTranscribe15ModelAdapter.id, maiTranscribe15ModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter],
    [whisperTranslateModelAdapter.id, whisperTranslateModelAdapter]
]);
```

**Verify**: `grep -rn "maiTranscribeModelAdapter\b" js/` → no matches anywhere.
(The dangling-import lint rule `unused-imports/no-unused-imports: error` would
fail the gate if the import binding were left behind — this is why the import
must be edited, not just the Map entry.)

### Step 7: Remove the MAI-1 `<option>` lines from `index.html`

Delete the `<option value="mai-transcribe">MAI-Transcribe 1 (Preview)</option>`
line from both `#model-select` (~line 79) and `#settings-model-select` (~line
248). Leave the `whisper` and `mai-transcribe-1.5` options, in their current
order.

**README check (verified — no edit needed)**: `README.md` mentions
"MAI Transcribe" only generically (line 39 "plus MAI Transcribe", line 70
"Azure Whisper or MAI Transcribe") with no version number and no statement about
which model is the default. Both remain accurate after this change. Do not edit
README.

**Verify**: `grep -n "mai-transcribe\b" index.html` → no matches
(only `mai-transcribe-1.5`, plus the unrelated `mai-transcribe-settings` /
`mai-transcribe-uri` / `mai-transcribe-key` element ids remain).

### Step 8: Update the tests

The strategy: repoint generic "a MAI model" stand-ins to the surviving
`'mai-transcribe-1.5'` / `MODEL_TYPES.MAI_TRANSCRIBE_1_5`; delete the
MAI-1-specific wire-value assertion that becomes a duplicate; add two
regression tests for the default flip and the reset migration.

**8a. `tests/mai-transcribe.vitest.js`**
- Header comment + `describe` names mention "MAI-Transcribe-1" — relabel to
  "MAI-Transcribe" (cosmetic; not asserted).
- `mockMaiTranscribeConfig()` default (line ~35): change
  `model: MODEL_TYPES.MAI_TRANSCRIBE` → `model: MODEL_TYPES.MAI_TRANSCRIBE_1_5`.
- "should send audio and definition fields for MAI-Transcribe" (line ~150): the
  assertion `expect(definition.enhancedMode.model).toBe(MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL)`
  (line 164) now asserts the **1.5** wire model. Change it to
  `MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL`. With the default config repointed,
  this test now asserts exactly what the separate test
  "should send MAI-Transcribe 1.5 API model when 1.5 is selected" (line ~168)
  already asserts. **Delete the line-168 test** as a now-exact duplicate (its
  `mockMaiTranscribeConfig({ model: MODEL_TYPES.MAI_TRANSCRIBE_1_5 })` is
  identical to the repointed default). **Net: −1 test** in this file.
- "should validate MAI-Transcribe configuration" (line ~327): the assertion
  `expect(config.model).toBe(MODEL_TYPES.MAI_TRANSCRIBE)` (line 331) →
  `MODEL_TYPES.MAI_TRANSCRIBE_1_5` (config is now repointed via the helper).

**8b. `tests/model-adapters.vitest.js`**
- "keeps the existing MAI-Transcribe request and parsed text behavior"
  (line ~232): `createSettings(MODEL_TYPES.MAI_TRANSCRIBE)` →
  `createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5)`, and the definition assertion
  `model: MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL` (line 257) →
  `MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL`. This now mirrors the existing
  "keeps MAI-Transcribe 1.5 request shape with the 1.5 API model" test
  (line ~272). They are not byte-identical (different response payloads, the
  1.5 test asserts the full `enhancedMode` object via `toEqual`, the repointed
  one asserts headers + fields + a `parseResponse` shape-sniff), so **keep
  both** — but if the executor judges them now-redundant, dropping the repointed
  one is acceptable (note it in the report). Default plan: keep both, **net 0**.

**8c. `tests/api-client-errors.vitest.js`** (lines ~142, ~154)
- These use `model: 'mai-transcribe'` as a generic MAI stand-in in the
  "reject API keys unsafe for fetch headers" test. Repoint both the config
  `model` (line 142) and the `API_CONFIG_MISSING` payload assertion
  `model: 'mai-transcribe'` (line 154) to `'mai-transcribe-1.5'`. Behavior is
  identical (the test asserts header-unsafe key rejection, model-agnostic).

**8d. `tests/api-client-validation.vitest.js`** (lines ~118, ~129, ~179, ~189,
~196, ~223, ~232)
- Repoint every `model: 'mai-transcribe'` and `'mai-transcribe'` payload
  assertion to `'mai-transcribe-1.5'` (lines 118/129 unsafe-key test;
  179/196 "include model name in error messages"; 223/232 "MAI-Transcribe Model
  Validation"). The `config.model` round-trip assertion at line 232 becomes
  `expect(config.model).toBe('mai-transcribe-1.5')`.
- **Line 189**: `expect(error.message).toContain('mai-transcribe')`. After
  repointing the model to `'mai-transcribe-1.5'`, the thrown message is
  `"mai-transcribe-1.5 API key is required"` (see `validateConfig`,
  `js/api-client.js:417`), and `'mai-transcribe-1.5'.includes('mai-transcribe')`
  is **true** — so this `.toContain('mai-transcribe')` substring assertion still
  holds with no change required. (You may tighten it to
  `.toContain('mai-transcribe-1.5')` for clarity; not required. Verified the
  message is interpolated from `normalizedConfig.model`, so the substring is
  present.)

**8e. `tests/settings-persistence.vitest.js`** (lines ~190, ~194, ~196, ~448)
- "should emit UI_MODEL_SWITCHED when the main UI model is changed": the event
  `{ target: { value: 'mai-transcribe' } }` (line 190) and the two assertions on
  `'mai-transcribe'` (lines 194, 196) use MAI-1 only as an arbitrary "some other
  model" the user switched to. Repoint all three to `'mai-transcribe-1.5'`. The
  `savedModel: 'whisper'` expectation (line 197) stays — storage is seeded
  `'whisper'` in this test's `getItem` mock, so the session-switch reports the
  seeded value, not the new default. (This test seeds storage explicitly, so the
  Step-2 default flip does not affect it.)
- "should not save MAI API key with unsupported header characters" (line ~448):
  `SETTINGS_MODEL_SELECT.value = MODEL_TYPES.MAI_TRANSCRIBE` →
  `MODEL_TYPES.MAI_TRANSCRIBE_1_5`. Behavior identical (`_isMaiModel` is true for
  1.5, so the MAI validation path runs).

**8f. `tests/settings-unit.vitest.js`** (lines ~312, ~343, ~410)
- "should use MAI inputs when MAI model is selected" (line 312) and "should
  select MAI inputs for MAI model" (line 343): `settingsModelSelect.value =
  'mai-transcribe'` → `MODEL_TYPES.MAI_TRANSCRIBE_1_5` (these assert the MAI
  branch of `_getActiveInputs` / `sanitizeInputs`; with MAI-1 gone, 1.5 is the
  MAI representative). Note there is already a parallel "should select MAI inputs
  for MAI 1.5 model" test at line ~355 — after repointing line 343, that pair
  becomes redundant; **delete the line-343 test** ("should select MAI inputs for
  MAI model") since line 355 covers it identically. Keep the line-312
  `sanitizeInputs` test (no 1.5 twin exists for it). **Net: −1 test** in this
  file.
- "should reject unsupported header characters for MAI API keys" (line ~406–417):
  uses `MODEL_TYPES.MAI_TRANSCRIBE` at line 410 → `MODEL_TYPES.MAI_TRANSCRIBE_1_5`.

**8g. New regression tests (ADD two)** — put them where a real model `<select>`
with options can be built. The cleanest home is the "Settings DOM Caching"
describe in `tests/settings-unit.vitest.js` (it already builds real happy-dom
elements via `document.createElement`), OR a small new describe that appends a
real `<select id="model-select">` with `<option value="whisper">` and
`<option value="mai-transcribe-1.5">` so `_getSelectableModels()` returns a
non-empty set:

1. **Default flip (empty storage)**: with `localStorage.getItem(STORAGE_KEYS.MODEL)`
   returning `null` and a real `#model-select` carrying the two options,
   `new Settings()` ⇒ `modelSelect.value === 'mai-transcribe-1.5'`. Asserts the
   out-of-box default.
2. **Reset migration (stale saved value)**: seed
   `localStorage.getItem(STORAGE_KEYS.MODEL)` → `'mai-transcribe'` (the removed
   model) with the same two-option select; `new Settings()` ⇒
   `modelSelect.value === 'mai-transcribe-1.5'` **and**
   `localStorage.setItem` was called with `(STORAGE_KEYS.MODEL, 'mai-transcribe-1.5')`
   (migration persisted). Use a `localStorage` mock that records `setItem`.

**Net: +2 tests.**

**8h. `tests/settings-workflow.vitest.js` — DISCOVERED DURING EXECUTION (was wrongly scoped "no edit").**
The Step-2 default flip breaks exactly one test:
`Complete workflow integration with fixes > save settings → SETTINGS_SAVED →
primary control enabled (real path)` (~line 257, asserting `ui.ready === true`
at ~line 305).

Root cause (verified): this test reuses the `settings` instance built in the
`describe`'s `beforeEach` (~line 118) *while `localStorage.getItem` returns
`null`*. With the new default, `loadSavedModel()` resolves empty storage to
`mai-transcribe-1.5` and writes it to the main `#model-select`. The test body
then seeds whisper storage + whisper creds and sets only the **modal** selector
(`SETTINGS_MODEL_SELECT`) to `'whisper'` (~line 261), never the **main**
selector. `getModelConfig()` reads readiness off the *main* selector
(`getCurrentModel()` → `this.modelSelect.value` === `mai-transcribe-1.5`, whose
creds are unseeded) → config invalid → `ui.ready === false`. The sibling tests
(~135, ~223) pass because they construct a *fresh* `new Settings()` **after**
seeding storage, so their main selector resolves to `'whisper'`. This is a
test-only artifact: in the real browser, picking a model in the modal fires a
`change` event that syncs the main selector (`settings.js` modal-change handler);
the mock assigns `.value` directly and bypasses that sync.

**Fix (one line, intent-preserving)**: in that test body, mirror the modal
selector onto the main selector right after ~line 261:

```js
            mockElements.get(ID.SETTINGS_MODEL_SELECT).value = 'whisper';
            mockElements.get(ID.MODEL_SELECT).value = 'whisper'; // ← add: mirror the modal→main change-sync the direct .value set bypasses
```

This represents exactly what the real-DOM `change` handler does, makes
`getCurrentModel()` return `'whisper'` (matching the seeded whisper creds), and
restores `ui.ready === true`. Do NOT seed storage in the shared `beforeEach`
(it would perturb the other tests in the block) and do NOT weaken the migration
or its guard. **Net: 0 tests** (count unchanged).

**File-level test-count delta**: −1 (mai-transcribe.vitest dup) −1 (settings-unit
MAI dup) +2 (new regressions) = **0 net… but** the two deletions remove tests
that the repoints would otherwise duplicate, and the two adds are new — so the
arithmetic is `384 − 1 − 1 + 2 = 384`. If the executor instead *keeps* the two
would-be duplicates (acceptable — they still pass after repointing), the count
is `384 + 2 = 386`. **Expected final: 384 (preferred, dedup) or 386 (if
duplicates kept).** Either is acceptable; report which path you took and the
exact final number. Test **file** count stays **32**.

> Do not be alarmed if your number differs by ±1 from a judgment call on the
> `model-adapters.vitest.js` pair (8b) — state your final count and the dedup
> decisions you made; the gate is "all green + coverage thresholds", not an
> exact count.

### Step 9: Full gate

Run, in order, and confirm each:

```
npm test
npm run lint
npm run deps:check:prod
npm run size
npm run test:coverage
```

**Expected**: `npm test` → 32 files pass, 384 (or 386) tests pass; `npm run
lint` exit 0 (no dangling-import error); `npm run deps:check:prod` exit 0;
`npm run size` under 100 kB; `npm run test:coverage` exit 0 with thresholds met
(removing a dead adapter + a branch in `_isMaiModel` slightly *raises* function
and branch coverage — it cannot lower it).

## Test plan

- **Repointed** (MAI-1 stand-in → MAI-1.5): `mai-transcribe.vitest.js` config
  helper + validation assertion; `model-adapters.vitest.js` MAI request test;
  `api-client-errors.vitest.js` ×2; `api-client-validation.vitest.js` ×5
  (the `.toContain('mai-transcribe')` one survives by substring);
  `settings-persistence.vitest.js` ×4; `settings-unit.vitest.js` ×3.
- **Deleted** (now-duplicate after repoint): the "send MAI-Transcribe 1.5 API
  model when 1.5 is selected" test in `mai-transcribe.vitest.js`; the "select
  MAI inputs for MAI model" test in `settings-unit.vitest.js`.
- **Added** (regression): empty-storage default ⇒ 1.5; stale `'mai-transcribe'`
  ⇒ reset to 1.5 + persisted.
- **In scope, one-line fix** (discovered during execution): `settings-workflow.vitest.js`
  — the default flip breaks its "save settings → … primary control enabled"
  test; mirror the modal selector onto the main `#model-select` in that test
  body (Step 8h). All other tests in that file stay green untouched.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "MAI_TRANSCRIBE:\|MAI_TRANSCRIBE_API_MODEL:\|'mai-transcribe'\|\"mai-transcribe\"\|maiTranscribeModelAdapter\b" js/ index.html` → no matches (the removed model is gone from production code; only `mai-transcribe-1.5` and the unrelated `MAI_TRANSCRIBE_URI/KEY/SETTINGS` survivors remain)
- [ ] `grep -n "MODEL_TYPES.WHISPER\b" js/settings.js` → no matches (all three defaults flipped)
- [ ] `_isMaiModel` is the single-comparison form
- [ ] `loadSavedModel()` contains the validate-and-reset block + `_getSelectableModels()` helper with the empty-set fail-open guard
- [ ] Registry `// Order matters …` comment unchanged; MAI-1 entry + import removed
- [ ] `npm test` → 32 files pass; 384 or 386 tests pass (report which)
- [ ] `npm run lint`, `npm run deps:check:prod`, `npm run size`, `npm run test:coverage` all exit 0; coverage thresholds met
- [ ] `git status` shows no modified files outside the in-scope list (no `spec/`, no `README.md`)

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts no longer match the live files (drift since
  `a231de2`).
- After the change, any test OUTSIDE the in-scope test list fails — the removal
  should be invisible to integration/recording flows; a failure elsewhere means
  a hidden coupling to `MODEL_TYPES.MAI_TRANSCRIBE`.
- The reset-migration regression test cannot be made to fire because the test
  `<select>` has no real `<option>` set — that means the fail-open guard is
  swallowing it; build the select with real options (Step 8g) rather than
  weakening the guard.
- Making the suite green tempts you to validate against the adapter registry
  instead of the `<option>` set, or to drop the `selectable.length > 0` guard —
  both break the design (registry has hidden `whisper-translate`; mocks have no
  options). Report instead.
- `npm run deps:check:prod` flags `maiTranscribe15ModelAdapter` or
  `createMaiTranscribeModelAdapter` as unused — that means the registry edit in
  Step 6 dropped the wrong binding; recheck.

## Maintenance notes

- The wire value `'mai-transcribe-1.5'` (`MAI_TRANSCRIBE_1_5_API_MODEL`) is the
  real Azure model name and is sent as `enhancedMode.model`; it is kept
  versioned so a future MAI-2 can be added as a new constant pair + adapter
  without disturbing 1.5. Do not collapse the two `_1_5` constants even though
  they currently hold the same string — one is the app's model id, the other is
  the wire value; they are conceptually distinct.
- The reset-migration is intentionally one-directional and silent (it just
  corrects a now-invalid stored id to the default). It is keyed off the live
  dropdown `<option>` set, so if a future model is added to the dropdown it is
  automatically considered valid with no migration-code change.
- `spec/spec-design-api-client.md` still describes `mai-transcribe-1` and omits
  MAI-1.5; this is pre-existing drift tracked as backlog item #4 in
  `plans/README.md`. A doc-only follow-up should update the spec to describe the
  two-model-down-to-one reality; it is deliberately out of this plan's scope and
  does not affect any gate.
- Inlining the now-single-use `createMaiTranscribeModelAdapter` factory is a
  reasonable `/simplify` follow-up; left as-is here to keep this diff a pure
  removal + default flip.
