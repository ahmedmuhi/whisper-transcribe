# Plan 056: Add MAI-Transcribe 2 alongside MAI-Transcribe 1.5, with a Clean/Verbatim style dropdown

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bdf23f9..HEAD -- js/ index.html css/ tests/ spec/ CLAUDE.md README.md docs/design-log.md`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

> **Maintainer ruling, 2026-09-25 (size budget).** Plan 056 as first executed
> measured the `application` bundle at 22.54 kB against the 22.5 kB budget
> (baseline 22.31 kB). The User ruled: raise the `application` limit in
> `package.json` to **23.5 kB**, once, to cover plans 056 and 057 together. This
> is the only budget change allowed; the other two budgets stay as they are.
> If either plan still exceeds 23.5 kB, the size STOP condition applies again.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the settings surface every User sees, and changes the out-of-box model)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `bdf23f9`, 2026-09-25
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/141

## Why this matters

Microsoft released MAI-Transcribe 2 (public preview, model version
2026-09-03): more accurate, faster, 60 languages with automatic language
detection. The maintainer wants it selectable **next to** MAI-Transcribe 1.5
(1.5 stays as a comparison and fallback while 2 is in preview), and wants 2 to
be what a browser with no saved model choice starts on.

Two API differences make this more than a registry entry. First, 2 takes its
style option in a different place (`enhancedMode.modelOptions.transcribeStyle`,
not `enhancedMode.transcribeStyle`). Second, **2 defaults to verbatim**, while
1.5 defaults to the readable style the app relies on today. So copying the
1.5 adapter unchanged would silently fill every MAI-Transcribe 2 transcript with
"um"s and false starts. The maintainer also asked that the style never be left
to a hidden default: the existing Verbatim on/off switch becomes a visible
**Transcription style** dropdown (Clean | Verbatim), and for MAI-Transcribe 2 the
app always sends the chosen value explicitly.

## Decisions already made (do not re-open)

These were settled with the maintainer. Implement them exactly:

1. **Model identity**: id `mai-transcribe-2`; label `Azure MAI-Transcribe 2`;
   option label `MAI-Transcribe 2`. MAI-Transcribe 1.5 stays registered and
   selectable, unchanged.
2. **Request shape for 2** (the shape the Microsoft Foundry playground
   generates, lowercase model name, **no `task` field**):
   ```json
   { "enhancedMode": { "enabled": true, "model": "mai-transcribe-2",
                       "modelOptions": { "transcribeStyle": "clean" } } }
   ```
   `transcribeStyle` is `"verbatim"` when the stored preference is verbatim,
   and `"clean"` for everything else (readability, missing, unknown). It is
   **always present** for 2. No `diarization`, `phraseList`, `locales`, or
   `timestamps` — out of scope by decision.
3. **Request shape for 1.5 is byte-for-byte unchanged**: it still sends
   `{ enabled: true, model: 'mai-transcribe-1.5', task: 'transcribe' }` and adds
   `transcribeStyle: 'verbatim'` directly on `enhancedMode` only when verbatim is
   chosen. Clean on 1.5 sends no style field, because Microsoft documents only
   `"verbatim"` for 1.5 and 1.5's default is already the readable style. Write
   that reason into a code comment — the maintainer does not want it to be
   hidden behaviour.
4. **One shared style preference**, stored exactly as today
   (`STORAGE_KEYS.MAI_TRANSCRIBE_STYLE` = `'mai_transcribe_style'`, values
   `'readability'` | `'verbatim'`). The UI labels `'readability'` as **Clean**.
   No storage migration: existing values keep working.
5. **One shared Target URI**. Both MAI models call the same Speech resource
   route (`…/speechtotext/transcriptions:transcribe?api-version=2025-10-15`) and
   differ only inside the request body. Both adapters declare
   `storageKeys.uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI`. There is **one**
   Connection row, retitled `MAI-Transcribe Target URI`. The User pastes
   nothing new.
6. **Default model**: `DEFAULT_MODEL_TYPE` becomes `mai-transcribe-2`. A saved
   `transcription_model` value is never rewritten (the existing
   validate-and-reset logic only resets unknown values, and 1.5 stays known).
7. **Upload limit**: both MAI models use "under 250 MB" (Microsoft's REST
   reference: audio "shorter than 2 hours … and smaller than 250 MB"). The
   shared constant changes from `(300 * 1024 * 1024) - 1` to
   `(250 * 1024 * 1024) - 1`.
8. **Style dropdown placement**: a Transcription style `<select>` in the full
   settings Model category (replacing the Verbatim switch row) **and** in the
   quick-settings popover directly under Model. Both stay in sync, like Noise
   cancellation and Theme. Both are visible only while the current model
   supports a transcription style (both MAI models; not Whisper, not GPT
   Transcribe).
9. **Proof**: one guarded live-contract case for `mai-transcribe-2`, reusing
   the existing MAI Target URI secret. You never run the live test.

## Current state

Files and roles (all excerpts verified at `bdf23f9`):

- `js/model-adapters/mai-transcribe.js` — factory
  `createMaiTranscribeModelAdapter({...})` and the single export
  `maiTranscribe15ModelAdapter`. Request body today (lines 81–96):
  ```js
  const formData = new FormData();
  formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
  const enhancedMode = {
      enabled: true,
      model: apiModel,
      task: 'transcribe'
  };
  if (config?.transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
      enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
  }
  formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode }));
  ```
  The 1.5 instance (lines 103–119):
  ```js
  export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter({
      id: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
      label: 'Azure MAI-Transcribe 1.5',
      optionLabel: 'MAI-Transcribe 1.5',
      uiOrder: 2,
      apiModel: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL,
      uploadLimitLabel: 'under 300 MB',
      uploadLimitVerdict: 'under 300 MB after conversion',
      uri: {
          rowId: 'maiUri',
          inputId: ID.MAI_TRANSCRIBE_URI,
          badgeId: ID.MAI_URI_BADGE,
          title: 'MAI-Transcribe 1.5 Target URI',
          subtitle: 'Your Azure MAI-Transcribe endpoint · HTTPS only',
          keywords: 'mai transcribe target uri endpoint https azure connection'
      }
  });
  ```
  The factory also runs the size check against `MAI_TRANSCRIBE_MAX_UPLOAD_BYTES`
  after WAV conversion (line 75) and reports `formatAudioUploadLimitMessage(label, uploadLimitLabel)`.
- `js/model-adapters/index.js` — the registry `Map` (insertion order has no
  production meaning) and `listModelAdapters()`, which sorts by numeric
  `uiOrder`. Current `uiOrder`: Whisper 1 (`js/model-adapters/whisper.js:27`),
  MAI 1.5 2, GPT Transcribe 3 (`js/model-adapters/gpt-transcribe.js:30`).
- `js/model-adapters/response-parsers.js` — `parseMaiTranscribeResponse` reads
  `combinedPhrases[].text`. MAI-Transcribe 2 returns the same shape
  (`{ durationMilliseconds, combinedPhrases: [{ text }], phrases: [...] }`).
  **Reuse it unchanged.**
- `js/constants.js`:
  - line 46 `MAI_TRANSCRIBE_URI: 'mai_transcribe_uri'`, line 48 `MAI_TRANSCRIBE_STYLE: 'mai_transcribe_style'`
  - lines 94–106 `MAI_TRANSCRIBE_STYLES = { READABILITY: 'readability', VERBATIM: 'verbatim' }`,
    `DEFAULT_MAI_TRANSCRIBE_STYLE`, with a doc comment saying only VERBATIM is ever sent
  - lines 116–121 `API_PARAMS` (`MAI_AUDIO_FIELD`, `MAI_DEFINITION_FIELD`, `MAI_TRANSCRIBE_STYLE_FIELD: 'transcribeStyle'`)
  - lines 130–135 `MODEL_TYPES` (`MAI_TRANSCRIBE_1_5`, `MAI_TRANSCRIBE_1_5_API_MODEL`, …)
  - line 147 `MAI_TRANSCRIBE_MAX_UPLOAD_BYTES = (300 * 1024 * 1024) - 1;`
  - line 164 `DEFAULT_MODEL_TYPE = MODEL_TYPES.MAI_TRANSCRIBE_1_5;`
  - lines 346–347 `ID.VERBATIM_SETTING: 'verbatim-setting'`, `ID.VERBATIM_TOGGLE: 'verbatim-toggle'`
    (the `ID` JSDoc block has no `@property` lines for these two)
  - line 550 `MESSAGES.SENDING_TO_MAI_TRANSCRIBE: 'Sending to Azure MAI-Transcribe API...'` — reuse for 2.
- `js/settings.js` — owns every preference. The MAI-1.5-only couplings you must
  generalise:
  - line 370: `const mai = this.uriFields.get(MODEL_TYPES.MAI_TRANSCRIBE_1_5);` (alias lookup)
  - lines 54–63 `renderConnectionRows()` creates **one row per adapter** with a
    `uri` block — two MAI adapters would create two rows with the same element ids.
  - lines 358–375 `_resolveUriFields()` keys `this.uriFields` by adapter id, one entry per adapter.
  - lines 556–559 `_getUriBadgeState()` shows "Required for the active model" only when
    `model === this.getCurrentModel()` — with a shared row that comparison must
    compare **storage keys**, not ids.
  - lines 135–136, 171, 175, 206–216, 407–414, 526–540: the verbatim switch
    (`verbatimSetting`, `verbatimToggle`, `loadVerbatimToggle()`,
    `updateVerbatimVisibility()`, the `change` listener that writes
    `'verbatim'`/`'readability'`).
  - lines 145–148: the cross-tab `storage` handler calls `loadVerbatimToggle()`.
  - lines 618–632: `getModelConfig()` adds `transcribeStyle` when
    `_isMaiModel(model)`, and `_isMaiModel` is `model === MODEL_TYPES.MAI_TRANSCRIBE_1_5`.
- `js/settings-surface.js:345–349`:
  ```js
  /** The verbatim row belongs to MAI-Transcribe 1.5 only, search included. */
  _isRowAllowed(row) {
      if (row.dataset.settingsRow !== 'verbatim') return true;
      return this.settings?.getCurrentModel?.() === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
  }
  ```
  The surface filters **modal rows only** (`this.rows` = `[data-settings-row]`
  inside the modal). It does not filter the popover.
- `index.html`:
  - lines 69–87: the quick-settings popover. Its Model field:
    ```html
    <label class="quick-settings-field" for="model-select">Model
        <select id="model-select"></select>
    </label>
    ```
  - lines 306–315: the verbatim row:
    ```html
    <div class="settings-row" id="verbatim-setting" data-settings-row="verbatim" data-category="model"
         data-keywords="verbatim filler words false starts mai transcribe" hidden>
        <div class="settings-row-copy">
            <label class="settings-row-title" for="verbatim-toggle">Verbatim transcription<span class="settings-row-chip" aria-hidden="true">Model</span></label>
            <p class="settings-row-subtitle">Keep filler words and false starts · MAI-Transcribe 1.5 only</p>
        </div>
        <div class="settings-row-control">
            <input type="checkbox" id="verbatim-toggle" role="switch">
        </div>
    </div>
    ```
  - lines 295–304: the Model row with `<select id="settings-model-select">` — the
    exemplar for a `<select>` inside `.settings-row-control`.
- `css/styles.css:1361–1375` styles `.quick-settings-field` and its `select`;
  reuse that class for the popover style field so no new CSS is needed.
- `js/api-client.js:450–461` `validateConfig()` already forwards a truthy
  `config.transcribeStyle` — **no change needed there**.
- `tests/browser-live/live-azure.contract.spec.js:21–43` — `modelCases`, one
  frozen object per registered model. `tests/live-contract-hygiene.vitest.js:71–76`
  requires exactly one `model: '<id>'` line per registry id, so a new adapter
  **must** get a case. The authorization probe is per resource, not per model:
  do not change it or the workflow YAML.

Conventions to match:
- Adapters are frozen objects; UI metadata lives on the adapter (see
  `js/model-adapters/gpt-transcribe.js` for the most recent exemplar).
- Every literal (ids, storage names, messages, enum values) lives in
  `js/constants.js`. No magic strings in modules.
- Settings apply instantly: a `change` writes storage and syncs the twin
  control. Follow the noise toggle at `js/settings.js:397–405` exactly — it
  writes storage, then calls `_applyNoiseEnvironment()` to sync both controls.
- DOM is built node by node, never with `innerHTML` holding values.
- Comments are sparse and explain *why*, as in the existing files.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| One test file | `npx vitest run tests/<name>.vitest.js` | all pass |
| Full suite + coverage | `npm run test:coverage` | all pass; thresholds 85/80/70/85 met |
| Lint | `npm run lint` | exit 0 |
| Dependencies | `npm run deps:check` and `npm run deps:check:prod` | exit 0 |
| Build | `npm run build` | exit 0 |
| Size | `npm run size` (after `npm run build`) | every budget passes; `application` ≤ 22.5 kB |
| Browser | `npm run test:browser` | all pass |
| NEVER | `npm run test:browser:live` | do not run — protected, billable, operator-only |

## Scope

**In scope** (the only files you should modify):
- `js/constants.js`
- `js/model-adapters/mai-transcribe.js`
- `js/model-adapters/index.js`
- `js/model-adapters/gpt-transcribe.js` — only its `uiOrder` value
- `js/settings.js`
- `js/settings-surface.js`
- `index.html` — the popover Model area and the verbatim row only
- `tests/*.vitest.js` files that reference the verbatim switch, the MAI upload
  limit, the MAI Target URI row, model option lists, `uiOrder`, or the default
  model (found with the greps in Step 8)
- `tests/browser/auth-menu-recovery.spec.js` — lines 66–70 (exact option-text
  list: add `'MAI-Transcribe 2'` second) and lines 87–88 (`#verbatim-setting`)
- `tests/browser-live/live-azure.contract.spec.js` — add one case
- `spec/spec-design-api-client.md`
- `CLAUDE.md` (the project file in the repo root) — the three passages named in Step 10
- `README.md` — model list and setup lines named in Step 10
- `docs/design-log.md` — one decision entry
- `package.json` — only the `application` size-limit value, 22.5 kB → 23.5 kB (ruling above)
- `plans/README.md` — your status row

**Out of scope** (do NOT touch):
- `js/api-client.js`, `js/authentication-*.js`, `js/token-provider.js` — the
  config already flows through; auth is unrelated.
- `js/model-adapters/response-parsers.js` — the parser already fits.
- `tests/browser-live/authorization-probe*.js`, `.github/workflows/*` — the
  probe is per resource and both MAI models share the resource.
- `GLOSSARY.md` — must stay byte-for-byte unchanged.
- `package.json` size budgets — except the one ruled change of the `application` limit to 23.5 kB (see the ruling above).
- Any "New" badge or notice — that is plan 057.
- `tools/architecture-map/` — separate tool, not a gate.

## Git workflow

- Branch: `advisor/056-add-mai-transcribe-2`, created from the commit this plan
  was written on (`bdf23f9`) or the operator-given base.
- Conventional commits, matching `git log` (e.g. `feat(models): add gpt-transcribe adapter`).
  Suggested: `feat(models): add MAI-Transcribe 2 alongside 1.5`,
  `feat(settings): replace the verbatim switch with a transcription style dropdown`,
  `docs: record the MAI-Transcribe 2 decisions`.
- Do NOT push or open a PR.

## Steps

### Step 0: Baseline

Run `npm ci`, `npm run test:coverage`, `npm run lint`, `npm run build`,
`npm run size`. Record the test count and the `application` size.

**Verify**: all exit 0. If the baseline already fails, STOP.

### Step 1: Constants

In `js/constants.js`:

- `MODEL_TYPES`: add `MAI_TRANSCRIBE_2: 'mai-transcribe-2'` and
  `MAI_TRANSCRIBE_2_API_MODEL: 'mai-transcribe-2'`, next to the 1.5 pair.
- `DEFAULT_MODEL_TYPE = MODEL_TYPES.MAI_TRANSCRIBE_2;`
- `MAI_TRANSCRIBE_MAX_UPLOAD_BYTES = (250 * 1024 * 1024) - 1;` and update the
  doc comment above the upload constants to cite the Speech REST reference
  (`https://learn.microsoft.com/rest/api/speechtotext/transcriptions/transcribe`:
  under 2 hours and under 250 MB), keeping the other links.
- `API_PARAMS`: add `MAI_MODEL_OPTIONS_FIELD: 'modelOptions'`.
- Add, next to `MAI_TRANSCRIBE_STYLES`:
  ```js
  /**
   * The literal MAI-Transcribe 2 expects inside enhancedMode.modelOptions for
   * each stored style. 2 defaults to verbatim, so the value is always sent.
   * @constant {Object<string, string>} MAI_TRANSCRIBE_2_STYLE_VALUES
   */
  export const MAI_TRANSCRIBE_2_STYLE_VALUES = Object.freeze({
    [MAI_TRANSCRIBE_STYLES.READABILITY]: 'clean',
    [MAI_TRANSCRIBE_STYLES.VERBATIM]: 'verbatim'
  });
  ```
- Rewrite the `MAI_TRANSCRIBE_STYLES` doc comment: the stored preference is
  shared by both MAI models; `readability` is shown as "Clean"; 1.5 omits the
  field for readability, 2 always sends a value.
- `ID`: replace `VERBATIM_SETTING` / `VERBATIM_TOGGLE` with
  `TRANSCRIBE_STYLE_SETTING: 'transcribe-style-setting'`,
  `TRANSCRIBE_STYLE_SELECT: 'transcribe-style-select'`,
  `QUICK_TRANSCRIBE_STYLE_FIELD: 'quick-transcribe-style-field'`,
  `QUICK_TRANSCRIBE_STYLE_SELECT: 'quick-transcribe-style-select'`, and update
  `@property` lines for the four new ids (the `ID` JSDoc block above the
  object; the old verbatim ids had none).

**Verify**: `npm run lint` → exit 0 (the old ID names are now unresolved in
`settings.js`; that is expected until Step 5 — if lint does not flag it,
continue; unit tests will be red until Step 8).

### Step 2: The adapter factory and the MAI-Transcribe 2 adapter

In `js/model-adapters/mai-transcribe.js`:

1. Add a factory parameter `buildEnhancedMode(transcribeStyle)` and replace the
   inline `enhancedMode` construction with
   `const enhancedMode = buildEnhancedMode(config?.transcribeStyle);`.
2. Add a factory parameter-free flag on the returned object:
   `supportsTranscribeStyle: true` (both MAI adapters support a style; the
   settings UI keys off this flag instead of a model id).
3. Hoist the Target URI row into one shared frozen constant used by both
   adapters, so the two adapters carry the **same object**:
   ```js
   // Both MAI models call the same Speech resource route and differ only inside
   // the request body, so they share one stored Target URI and one settings row.
   const MAI_TRANSCRIBE_URI_ROW = Object.freeze({
       rowId: 'maiUri',
       inputId: ID.MAI_TRANSCRIBE_URI,
       badgeId: ID.MAI_URI_BADGE,
       title: 'MAI-Transcribe Target URI',
       subtitle: 'Your Azure MAI-Transcribe endpoint, used by MAI-Transcribe 2 and 1.5 · HTTPS only',
       keywords: 'mai transcribe target uri endpoint https azure connection'
   });
   ```
   and pass `uri: MAI_TRANSCRIBE_URI_ROW` (the factory's
   `Object.freeze(uri)` on an already frozen object is harmless; keep it).
4. 1.5 keeps its exact bytes:
   ```js
   buildEnhancedMode(transcribeStyle) {
       const enhancedMode = { enabled: true, model: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL, task: 'transcribe' };
       // 1.5 documents only "verbatim"; its default is already the readable style,
       // so Clean sends no field and keeps the request exactly as it has always been.
       if (transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
           enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
       }
       return enhancedMode;
   }
   ```
   Its labels become `uploadLimitLabel: 'under 250 MB'`,
   `uploadLimitVerdict: 'under 250 MB after conversion'`, `uiOrder: 3`.
   The `apiModel` factory parameter may be removed if nothing else uses it.
5. Add and export `maiTranscribe2ModelAdapter`:
   - `id: MODEL_TYPES.MAI_TRANSCRIBE_2`, `label: 'Azure MAI-Transcribe 2'`,
     `optionLabel: 'MAI-Transcribe 2'`, `uiOrder: 2`,
     `uploadLimitLabel: 'under 250 MB'`, `uploadLimitVerdict: 'under 250 MB after conversion'`,
     `uri: MAI_TRANSCRIBE_URI_ROW`
   - ```js
     buildEnhancedMode(transcribeStyle) {
         // MAI-Transcribe 2 defaults to verbatim, so the style is always explicit.
         // hasOwn, not `??`: an inherited name such as 'toString' must not select a value.
         const style = Object.hasOwn(MAI_TRANSCRIBE_2_STYLE_VALUES, transcribeStyle)
             ? MAI_TRANSCRIBE_2_STYLE_VALUES[transcribeStyle]
             : MAI_TRANSCRIBE_2_STYLE_VALUES[MAI_TRANSCRIBE_STYLES.READABILITY];
         return {
             enabled: true,
             model: MODEL_TYPES.MAI_TRANSCRIBE_2_API_MODEL,
             [API_PARAMS.MAI_MODEL_OPTIONS_FIELD]: {
                 [API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD]: style
             }
         };
     }
     ```
6. Update the file's `@fileoverview` to say it holds both MAI adapters.

In `js/model-adapters/index.js` register the new adapter: import it and add
its Map entry **immediately after** the MAI 1.5 entry. (The file's two comments
disagree about whether insertion order matters; presentation order comes from
`uiOrder`, and the only order-sensitive code is the test-only cross-shape
parser, which both MAI adapters share.)
In `js/model-adapters/gpt-transcribe.js` change `uiOrder: 3` to `uiOrder: 4`.
Resulting presentation order: Whisper (1), MAI-Transcribe 2 (2),
MAI-Transcribe 1.5 (3), GPT Transcribe (4).

**Verify**: `npx vitest run tests/model-adapters.vitest.js` — existing 1.5
request-shape tests must still pass unchanged. Expected failures until Step 8:
the upload-limit message tests ("300" → "250") and
`expect(modelAdapterRegistry.size).toBe(3)` at `tests/model-adapters.vitest.js:151`.
Nothing else may fail.

### Step 3: One Connection row per shared Target URI

In `js/settings.js`:

- `renderConnectionRows()` (line 54): keep a `Set` of rendered
  `adapter.storageKeys?.uri` values and skip an adapter whose storage key was
  already rendered. Add one comment line: adapters that share a stored Target
  URI share one row.
- `_resolveUriFields()` (line 358): same de-duplication by storage key; the map
  stays keyed by the id of the **first** adapter (in `listModelAdapters()`
  order) for each storage key. The alias lookup at line 370 must find the MAI
  field by storage key, not by `MODEL_TYPES.MAI_TRANSCRIBE_1_5`: e.g. iterate
  `this.uriFields` and pick the entry whose adapter's `storageKeys.uri` is
  `STORAGE_KEYS.MAI_TRANSCRIBE_URI`. The Whisper alias is unchanged.
- `_getUriBadgeState(uri, model)` (line 556): "Required for the active model"
  must show when the **current model's storage key equals this row's storage
  key**. Add a small helper that returns `this.adapterRegistry.get(id)?.storageKeys?.uri`
  without throwing, and compare those.

**Verify**: `npx vitest run tests/registry-driven-model-ui.vitest.js tests/settings-persistence.vitest.js`
→ the existing `maiUri` row assertions still find exactly one row
(`tests/registry-driven-model-ui.vitest.js:210`). Failures limited to verbatim /
upload-limit / option-count expectations are expected until Step 8.

### Step 4: Markup — the style dropdown in both surfaces

In `index.html`:

1. Replace the verbatim row (lines 306–315) with:
   ```html
   <div class="settings-row" id="transcribe-style-setting" data-settings-row="transcribeStyle" data-category="model"
        data-keywords="transcription style clean verbatim filler words false starts mai transcribe" hidden>
       <div class="settings-row-copy">
           <label class="settings-row-title" for="transcribe-style-select">Transcription style<span class="settings-row-chip" aria-hidden="true">Model</span></label>
           <p class="settings-row-subtitle">Clean removes filler words and false starts · Verbatim keeps them · MAI-Transcribe only</p>
       </div>
       <div class="settings-row-control">
           <select id="transcribe-style-select">
               <option value="readability">Clean</option>
               <option value="verbatim">Verbatim</option>
           </select>
       </div>
   </div>
   ```
2. In the popover, directly after the Model `<label>` (line 72), add:
   ```html
   <label class="quick-settings-field" id="quick-transcribe-style-field" for="quick-transcribe-style-select" hidden>Transcription style
       <select id="quick-transcribe-style-select">
           <option value="readability">Clean</option>
           <option value="verbatim">Verbatim</option>
       </select>
   </label>
   ```
   Update the popover's HTML comment ("the three controls changed most often")
   so it stays true.

The option `value`s must equal `MAI_TRANSCRIBE_STYLES` values exactly.

**Verify**: `grep -c 'verbatim-toggle\|verbatim-setting' index.html` → `0`;
`grep -c 'transcribe-style-select' index.html` → `4` (two `for=` plus two `id=`).

### Step 5: Settings — the style preference

In `js/settings.js`:

- Replace `verbatimSetting` / `verbatimToggle` with
  `transcribeStyleSetting`, `transcribeStyleSelect`, `quickTranscribeStyleField`,
  `quickTranscribeStyleSelect` (from the new `ID` constants).
- Replace `loadVerbatimToggle()` with `loadTranscribeStyle()` that sets **both**
  selects to `this._getTranscribeStyle()` (which is unchanged: `'verbatim'` if
  stored exactly, otherwise `DEFAULT_MAI_TRANSCRIBE_STYLE`). Call it where
  `loadVerbatimToggle()` was called (constructor storage handler line 147,
  `init()` line 171).
- Replace the switch listener (lines 407–414) with one `change` listener per
  select, following the noise-toggle pattern: accept only a value in
  `Object.values(MAI_TRANSCRIBE_STYLES)`, write it to
  `STORAGE_KEYS.MAI_TRANSCRIBE_STYLE`, then `loadTranscribeStyle()` so the twin
  select matches.
- Replace `_isMaiModel(model)` with
  `supportsTranscribeStyle(model = this.getCurrentModel())` returning
  `this.adapterRegistry.get(model)?.supportsTranscribeStyle === true`. It is
  public because the surface calls it. `getModelConfig()` uses it.
- Rename `updateVerbatimVisibility()` to `updateTranscribeStyleVisibility()`:
  - always update the popover field, null-guarded like every other Settings
    DOM reference (hand-built test fixtures lack it):
    `if (this.quickTranscribeStyleField) this.quickTranscribeStyleField.hidden = !this.supportsTranscribeStyle();`
    (the surface never filters the popover);
  - then, as today, delegate modal-row visibility to `this.surface.refreshRows()`
    when a surface is wired, else set `transcribeStyleSetting.hidden` directly.
  - Rewrite its doc comment: the style belongs to adapters that declare
    `supportsTranscribeStyle`; Whisper and GPT Transcribe never send it.
- Update its two call sites (`init()` line 175, `_handleModelChange()` line 471).

In `js/settings-surface.js:345–349`:
```js
/** The transcription style row shows only for models that take a style, search included. */
_isRowAllowed(row) {
    if (row.dataset.settingsRow !== 'transcribeStyle') return true;
    return this.settings?.supportsTranscribeStyle?.() === true;
}
```
Remove the `MODEL_TYPES` import from `settings-surface.js` if nothing else uses
it (lint will tell you).

**Verify**: `grep -rn "verbatimToggle\|VERBATIM_TOGGLE\|VERBATIM_SETTING\|_isMaiModel\|loadVerbatimToggle\|updateVerbatimVisibility" js/`
→ no matches. `grep -rn "MAI_TRANSCRIBE_1_5" js/settings.js js/settings-surface.js` → no matches.
`npm run lint` → exit 0.

### Step 6: Live contract case

In `tests/browser-live/live-azure.contract.spec.js`, add to `modelCases`
(after the MAI 1.5 case):
```js
Object.freeze({
    label: 'MAI-Transcribe 2',
    model: 'mai-transcribe-2',
    targetName: 'AZURE_MAI_TRANSCRIBE_TARGET_URI',
    hostnameSuffix: '.cognitiveservices.azure.com',
    storageName: 'mai_transcribe_uri'
}),
```
It reuses the existing protected MAI Target URI because both models share the
resource. Do not add a secret name, do not touch `requiredProtectedNames`.

**Verify**: `npx vitest run tests/live-contract-hygiene.vitest.js` → all pass.

### Step 7: Docs that describe behaviour

- `spec/spec-design-api-client.md`:
  - §2 "Transcription style" definition (line 39): shared MAI preference;
    Clean/readability omits the field for 1.5; 2 always sends
    `modelOptions.transcribeStyle` as `"clean"` or `"verbatim"`.
  - §3 table row "Model, manual Target URI, and MAI style persistence": the
    optional field applies to adapters that declare `supportsTranscribeStyle`.
  - §4 adapter table (line 73): add a `mai-transcribe-2` row
    (`STORAGE_KEYS.MAI_TRANSCRIBE_URI`, shared with 1.5; WAV `audio` plus JSON
    `definition` with `enhancedMode.modelOptions.transcribeStyle` always set).
  - Line ~84: "at or above 300 MiB" → "at or above 250 MiB".
  - §4.1 checklist: add that adapters sharing a resource share
    `storageKeys.uri` and one `uri` row object, and that
    `supportsTranscribeStyle` drives the style dropdown.
  - The paragraph at lines 150–154 and AC-011: describe both shapes exactly.
  - AC-005 still says "exactly Whisper and MAI-Transcribe 1.5" — reword to
    "every registered adapter satisfies the adapter contract", matching §4.
  - §10: "exact two-model request/response contracts" → registry-wide wording.

**Verify**: `grep -n "300 MiB\|exactly Whisper and MAI" spec/spec-design-api-client.md` → no matches.

### Step 8: Tests

Find every test coupled to the changed behaviour:
```
grep -rln "verbatim\|VERBATIM" tests/
grep -rn "300 MB\|MAI_TRANSCRIBE_MAX_UPLOAD_BYTES\|uiOrder\|DEFAULT_MODEL_TYPE" tests/
grep -rn "MAI-Transcribe 1.5 Target URI" tests/
grep -rn "size).toBe(3)\|defaults to MAI-Transcribe 1.5" tests/
```
At `bdf23f9` the verbatim hits are in `settings-persistence`, `settings-unit`,
`settings-sidebar`, `settings-surface`, `settings-workflow`, `model-adapters`,
`api-client-validation` (all `.vitest.js`), and
`tests/browser/auth-menu-recovery.spec.js`. **`palette-themes.vitest.js` is a
false positive** (the English word "verbatim" at lines 64 and 177): do not edit
it. Several files build their own DOM fixture with the old `verbatim-toggle`
checkbox (e.g. `tests/settings-persistence.vitest.js:50–51`, and
`tests/settings-unit.vitest.js:24–54`): update fixtures to the new two-select
markup from Step 4.

Known hard-coded sites the greps may not surface, each of which must change:
- `tests/settings-unit.vitest.js:134–151` — "defaults to MAI-Transcribe 1.5 when
  no model is saved" and the reset test expecting
  `setItem(MODEL, MAI_TRANSCRIBE_1_5)`: both now expect `MAI_TRANSCRIBE_2`
  (rename the test title accordingly).
- `tests/model-adapters.vitest.js:151` — registry size becomes 4; also add MAI 2
  to the per-adapter `storageKeys` assertions (~line 145) and the `it.each`
  scope list (~lines 154–158).
- `tests/registry-driven-model-ui.vitest.js:39` — the fake adapter's
  `uiOrder: 3` now ties with MAI 1.5; change it to `uiOrder: 5`, and the
  expected order at lines 108–113 becomes
  `[WHISPER, MAI_TRANSCRIBE_2, MAI_TRANSCRIBE_1_5, GPT_TRANSCRIBE, FAKE_MODEL]`.
- The **fake settings objects** in `tests/settings-surface.vitest.js:175–178`
  and `tests/settings-sidebar.vitest.js:61–62` only have `getCurrentModel`.
  The surface now calls `settings.supportsTranscribeStyle()`, so add
  `supportsTranscribeStyle: vi.fn(() => [MODEL_TYPES.MAI_TRANSCRIBE_2, MODEL_TYPES.MAI_TRANSCRIBE_1_5].includes(model))`
  (using each file's own current-model variable). Without it the style row is
  never shown; that is a fixture gap, **not** a reason to hit the STOP
  condition about the surface's filtering model.

Convert, do not delete: every existing assertion about the switch becomes the
equivalent assertion about the select (checked ↔ `value === 'verbatim'`).
Then add the new tests listed in the Test plan.

**Verify**: `npm run test:coverage` → all pass, thresholds met, test count ≥
the Step 0 count.

### Step 9: Browser and size gates

Update `tests/browser/auth-menu-recovery.spec.js`: lines 66–70 expect the
option texts `['Azure Whisper', 'MAI-Transcribe 2', 'MAI-Transcribe 1.5', 'Azure GPT Transcribe']`;
lines 87–88 use the new row id `#transcribe-style-setting` and comment (the
style row is hidden for Whisper). Then run `npm run build`,
`npm run size`, `npm run test:browser`.

**Verify**: all exit 0; `application` within 22.5 kB.

### Step 10: Executor-facing and User-facing docs

- `CLAUDE.md` (repo root):
  - line ~129: the popover carries Model, Transcription style (shown only for
    models that take one), Noise cancellation, Theme, and the All settings link.
  - lines ~143–146: "Noise cancellation, theme, and transcription style stay in
    sync across the popover and the modal, and the transcription style controls
    are visible only while the current model's adapter declares
    `supportsTranscribeStyle` (both MAI models)."
  - In "Models, Settings…": one sentence that adapters sharing a resource share
    `storageKeys.uri` and one Connection row.
- `README.md`: line 12 still says "Two Transcription Models"; list all four.
  Lines ~88 and ~123: mention MAI-Transcribe 2 alongside 1.5 and the shared
  Target URI. Do not add real URIs or resource names.
- `docs/design-log.md`: add a short section "MAI-Transcribe 2 alongside 1.5"
  in the existing decision style: why 2 is additive, why the style is always
  explicit for 2, why the Target URI is shared, why 1.5's Clean still omits
  the field.

**Verify**: `grep -n "mai-transcribe-1.5. is the current model\|Two Transcription Models" CLAUDE.md README.md` → no matches;
`git diff --stat -- GLOSSARY.md` → empty.

## Test plan

Pattern files: `tests/model-adapters.vitest.js` (request-shape tests parse the
`definition` field out of `FormData`), `tests/registry-driven-model-ui.vitest.js`
(registry-driven DOM), `tests/settings-persistence.vitest.js` (storage + DOM).

New tests (all must pass):

1. `model-adapters`: MAI 2 with `transcribeStyle` undefined → `definition`
   deep-equals `{ enhancedMode: { enabled: true, model: 'mai-transcribe-2', modelOptions: { transcribeStyle: 'clean' } } }`.
2. `model-adapters`: MAI 2 with `'readability'` → `'clean'`; with `'verbatim'` → `'verbatim'`;
   with `'bogus'` and with `'toString'` → `'clean'`.
3. `model-adapters`: MAI 2 `definition` has no `task` key and no top-level
   `diarization`, `phraseList`, `locales`.
4. `model-adapters`: MAI 1.5 `definition` for readability is exactly
   `{ enhancedMode: { enabled: true, model: 'mai-transcribe-1.5', task: 'transcribe' } }`
   and for verbatim adds only `transcribeStyle: 'verbatim'` (keep the existing
   tests; add one if a case is missing).
5. `model-adapters`: both MAI adapters have `storageKeys.uri === STORAGE_KEYS.MAI_TRANSCRIBE_URI`,
   `supportsTranscribeStyle === true`, and the **same** `uri` object
   (`toBe`); Whisper and GPT do not declare `supportsTranscribeStyle`.
6. `model-adapters`: a converted WAV of `MAI_TRANSCRIBE_MAX_UPLOAD_BYTES + 1`
   bytes is rejected by MAI 2 with the "under 250 MB" message.
7. `registry-driven-model-ui`: exactly one `[data-settings-row="maiUri"]` row
   with four adapters registered; model options render in the order
   whisper, mai-transcribe-2, mai-transcribe-1.5, gpt-transcribe.
8. `settings-persistence`: with empty storage, `getCurrentModel()` is
   `'mai-transcribe-2'` and nothing is written to `transcription_model`;
   with `transcription_model = 'mai-transcribe-1.5'` stored, it stays
   `'mai-transcribe-1.5'` after construction.
9. `settings-persistence`: typing a valid URI in the shared MAI row stores it
   under `mai_transcribe_uri`; `getModelConfig().uri` returns it for **both**
   MAI models.
10. `settings-persistence`: with the MAI URI empty, the shared row's badge says
    "Required for the active model" when the current model is MAI 2 **and**
    when it is MAI 1.5, and "Not set" when it is Whisper.
11. `settings-unit` or `settings-persistence`: changing the popover select to
    Verbatim writes `'verbatim'` and updates the modal select, and vice versa;
    a cross-tab `storage` event for `mai_transcribe_style` updates both.
12. `settings-surface`/`settings-sidebar`: the style row and the popover
    style field are visible for both MAI models, hidden for Whisper and GPT
    Transcribe, including while searching "verbatim" or "clean".
13. `api-client-validation`: `validateConfig()` forwards `transcribeStyle` for
    MAI 2.

## Done criteria

- [ ] `npm run test:coverage` exits 0; thresholds met; tests 1–13 exist and pass
- [ ] `npm run lint`, `npm run deps:check`, `npm run deps:check:prod` exit 0
- [ ] `npm run build` and `npm run size` exit 0; the only `package.json` change is the `application` limit at 23.5 kB
- [ ] `npm run test:browser` exits 0
- [ ] `grep -rn "verbatimToggle\|VERBATIM_TOGGLE\|_isMaiModel" js/ tests/` → no matches
- [ ] `grep -rn "300 MB\|300 \* 1024" js/ tests/ spec/ README.md CLAUDE.md` → no matches
- [ ] `grep -n "DEFAULT_MODEL_TYPE = MODEL_TYPES.MAI_TRANSCRIBE_2" js/constants.js` → one match
- [ ] `git diff --stat bdf23f9 -- GLOSSARY.md js/api-client.js js/model-adapters/response-parsers.js .github/` → empty
- [ ] `git diff --name-only bdf23f9` lists only in-scope files
- [ ] `plans/README.md` row for 056 updated (unless a reviewer maintains it)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows changes and an excerpt above no longer matches.
- `npm run size` exceeds a budget. Report the measured size and the Step 0
  baseline; do not raise the budget (a previous plan needed an explicit
  maintainer ruling for exactly this).
- Making the style row or popover field hide/show correctly seems to need
  changes to the surface's category/search model beyond `_isRowAllowed`.
- An existing assertion about 1.5's request bytes would have to change to
  make the suite pass — 1.5's request must stay identical.
- Any test needs a real Target URI, key, token, or resource name.
- The live-contract hygiene test demands edits to the authorization probe or
  the workflow YAML.

## Maintenance notes

- **Existing Users who never picked a model now land on 2.** The default only
  applies when `transcription_model` is absent, which includes anyone who
  always used the old default without touching the dropdown. That is the
  agreed behaviour; mention it in the PR description.
- **Preview model.** If MAI-Transcribe 2 later rejects the lowercase name or
  the missing `task`, the live-contract case is where it shows (a 400). The fix
  lives in `maiTranscribe2ModelAdapter.buildEnhancedMode` only.
- **Retiring 1.5** later: remove its adapter and registry entry; the shared
  URI row and style controls keep working because they key off storage key and
  `supportsTranscribeStyle`, not model ids. Follow plan 010's validate-and-reset
  pattern for saved `mai-transcribe-1.5` values.
- **Deferred by decision**: diarization, word/segment timestamps, keyword
  biasing (`phraseList.phrases`), forced `locales`. Keyword biasing is the one
  most likely to be wanted later; it would be a new settings field plus a
  top-level `phraseList` in the definition.
- The one-time "New" notice for this model is plan 057.
- Reviewer focus: the exact `definition` JSON for both MAI models; that the
  shared row is rendered once and its badge logic compares storage keys; that
  both selects stay in sync and hide for non-MAI models.
