# Plan 008: Add a MAI-Transcribe 1.5 transcription-style setting (Readability vs Verbatim)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat aa3b28c..HEAD -- js/model-adapters/mai-transcribe.js js/constants.js js/settings.js index.html tests/model-adapters.vitest.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (feature, user-requested)
- **Effort**: M
- **Risk**: LOW — additive; the default path is byte-identical to today
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `aa3b28c`, 2026-06-16

## Why this matters

The app lets the user transcribe with **MAI-Transcribe 1.5**, which Microsoft
ships with two output styles controlled by one request field, `transcribeStyle`
(nested inside the `enhancedMode` object of the multipart `definition` form
field):

- **Readability (default)** — *omit* `transcribeStyle` entirely. Microsoft
  returns a readability-optimized transcript: filler words, false starts, and
  disfluencies are cleaned up. This is the app's current, only behavior.
- **Verbatim** — send `"transcribeStyle": "verbatim"`. Microsoft preserves the
  original spoken content including "um/uh", repetitions, and false starts.

The user wants to choose between these in the UI. Today there is no control and
the field is never sent, so every MAI request is implicitly Readability.

**Hard domain constraints** (from Microsoft Learn —
`https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe`,
captured here so you need not browse):

- `transcribeStyle` is supported **only on `mai-transcribe-1.5`** — **not** on
  `mai-transcribe-1` (1.0), **not** on `whisper`, **not** on `whisper-translate`.
- Omitting the field is the documented default (readability). Therefore the
  Readability choice must send a request **byte-identical to today's** — do
  NOT send `"transcribeStyle":"readability"` or any empty/null value. Only the
  literal `"verbatim"` is ever serialized.

## Design decisions (made from existing code patterns — see "If you'd change these")

1. **Placement: the API Settings modal**, not the sidebar. The setting is
   model-gated (1.5-only), and the modal already has the show/hide pattern for
   model-specific sections (`#whisper-settings`, `#mai-transcribe-settings` via
   `updateSettingsVisibility`). The sidebar has no gating affordance at all.
2. **Control: a two-option `<select>`** (Readability default / Verbatim),
   cloned from the existing `#settings-model-select` form-group. Two *named*
   options read better as a labeled select than an on/off toggle, and the
   option `value`s can be the enum strings the Settings module reads directly.
3. **A new 1.5-only container** `#mai-transcribe-15-settings` (mirrors the
   existing `#mai-transcribe-settings` `display:none` + JS-reveal pattern),
   because `#mai-transcribe-settings` is shown for *both* MAI 1.0 and 1.5 and
   must not gain a 1.5-only control.
4. **Default = Readability**, represented by the *value* `'readability'` stored
   in localStorage so the select hydrates correctly, but **the adapter only
   ever emits the field when the value is `'verbatim'`** — so Readability stays
   byte-identical to today regardless of what is stored.

If you (the executor) find a reason these are wrong, that is a STOP condition —
report, don't redesign.

## Current state

### Adapter — `js/model-adapters/mai-transcribe.js` (whole file, 53 lines)

One factory builds both MAI adapters; `apiModel` is the only in-scope signal
that distinguishes 1.5 from 1.0. `buildRequest` reads `config` only for
`config.apiKey` today.

```js
import { API_PARAMS, DEFAULT_WAV_FILENAME, MESSAGES, MODEL_TYPES, STORAGE_KEYS } from '../constants.js';
import { convertToWav } from '../audio-converter.js';
import { parseMaiTranscribeResponse } from './response-parsers.js';

function createMaiTranscribeModelAdapter(id, label, apiModel) {
    return {
        id,
        label,
        storageKeys: {
            apiKey: STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY,
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        },
        async buildRequest(audioBlob, config, onProgress) {
            if (onProgress) {
                onProgress(MESSAGES.CONVERTING_AUDIO);
            }

            const formData = new FormData();
            const wavBlob = await convertToWav(audioBlob);
            formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({
                enhancedMode: {
                    enabled: true,
                    model: apiModel,
                    task: 'transcribe'
                }
            }));

            return {
                headers: { [API_PARAMS.MAI_API_KEY_HEADER]: config.apiKey },
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    };
}

export const maiTranscribeModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE,
    'Azure MAI-Transcribe 1',
    MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL
);

export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE_1_5,
    'Azure MAI-Transcribe 1.5',
    MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
);
```

### Constants — `js/constants.js`

```js
// STORAGE_KEYS (lines 42-53) — snake_case string values:
export const STORAGE_KEYS = {
  MODEL:                'transcription_model',
  WHISPER_URI:          'whisper_uri',
  WHISPER_API_KEY:      'whisper_api_key',
  MAI_TRANSCRIBE_URI:     'mai_transcribe_uri',
  MAI_TRANSCRIBE_API_KEY: 'mai_transcribe_api_key',
  THEME_MODE:           'themeMode',
  RECORDING_ENVIRONMENT: 'recording_environment',
  INPUT_DEVICE:          'input_device',
  SIDEBAR_PINNED:        'sidebar_pinned',
  TRANSCRIPT_RECORD:     'transcript_record'
};

// RECORDING_ENVIRONMENTS (lines 55-62) — the enum-shape template to clone:
export const RECORDING_ENVIRONMENTS = {
  QUIET: 'quiet',
  NOISY: 'noisy'
};

// API_PARAMS (lines 72-79):
export const API_PARAMS = {
  FILE:            'file',
  LANGUAGE:        'language',
  API_KEY_HEADER:  'api-key',
  MAI_API_KEY_HEADER: 'Ocp-Apim-Subscription-Key',
  MAI_AUDIO_FIELD:    'audio',
  MAI_DEFINITION_FIELD: 'definition'
};

// MODEL_TYPES (lines 99-106) — note the TWO 1.5 strings, used in different roles:
export const MODEL_TYPES = {
  WHISPER_TRANSLATE: 'whisper-translate',
  WHISPER:           'whisper',
  MAI_TRANSCRIBE:    'mai-transcribe',
  MAI_TRANSCRIBE_1_5: 'mai-transcribe-1.5',          // internal id / select value / registry key
  MAI_TRANSCRIBE_API_MODEL: 'mai-transcribe-1',
  MAI_TRANSCRIBE_1_5_API_MODEL: 'mai-transcribe-1.5' // value written into enhancedMode.model — gate on THIS in the adapter
};

// ID (Object.freeze, lines 150-212) — relevant existing entries:
//   "Modals & panes" group ends with:  MAI_TRANSCRIBE_SETTINGS: 'mai-transcribe-settings',  (line 181)
//   "Selectors / inputs" group has:    MAI_TRANSCRIBE_KEY: 'mai-transcribe-key',            (line 191)

// Standalone default constant template (lines 214-220):
export const DEFAULT_LANGUAGE  = 'en';
```

### Settings — `js/settings.js`

Constructor caches form elements (lines 36-63), incl.
`this.recordingEnvironmentSelect = document.getElementById(ID.RECORDING_ENVIRONMENT);` (line 53).

`updateSettingsVisibility()` (lines 413-422) — the model-gated show/hide,
re-run from `init`, both model-change listeners, and `openSettingsModal`:

```js
    updateSettingsVisibility() {
        const currentModel = this.getCurrentModelFromSettings();
        const isMai = this._isMaiModel(currentModel);
        if (this.whisperSettings) {
            this.whisperSettings.style.display = isMai ? 'none' : 'block';
        }
        if (this.maiTranscribeSettings) {
            this.maiTranscribeSettings.style.display = isMai ? 'block' : 'none';
        }
    }
```

`loadSettingsToForm()` hydrates the recording-environment select (lines 484-487) —
the exact pattern to clone:

```js
        const savedEnv = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT) || RECORDING_ENVIRONMENTS.QUIET;
        if (this.recordingEnvironmentSelect) {
            this.recordingEnvironmentSelect.value = savedEnv;
        }
```

`saveSettings()` persists the recording-environment select (lines 614-616):

```js
        if (this.recordingEnvironmentSelect) {
            localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, this.recordingEnvironmentSelect.value);
        }
```

`getModelConfig()` (lines 682-690) — builds the object handed to the adapter.
It returns exactly `{ model, apiKey, uri }` today; `getCurrentModel()` reads the
MAIN selector:

```js
    getModelConfig() {
        const model = this.getCurrentModel();
        const isMai = this._isMaiModel(model);
        return {
            model,
            apiKey: localStorage.getItem(isMai ? STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY : STORAGE_KEYS.WHISPER_API_KEY),
            uri: localStorage.getItem(isMai ? STORAGE_KEYS.MAI_TRANSCRIBE_URI : STORAGE_KEYS.WHISPER_URI)
        };
    }

    _isMaiModel(model) {
        return model === MODEL_TYPES.MAI_TRANSCRIBE || model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
    }
```

**Auto-propagation fact** (so you do NOT touch api-client.js): `validateConfig()`
in `js/api-client.js` does `{ ...config }` and overrides only `apiKey`/`uri`,
then `transcribe()` passes that object straight to `adapter.buildRequest`. Any
new field on `getModelConfig()`'s return reaches the adapter unchanged.

### Markup — `index.html` (settings modal, lines 244-281)

```html
            <div class="form-group">
                <label for="settings-model-select">Model</label>
                <select id="settings-model-select">
                    <option value="whisper">Whisper (Stable)</option>
                    <option value="mai-transcribe">MAI-Transcribe 1 (Preview)</option>
                    <option value="mai-transcribe-1.5">MAI-Transcribe 1.5 (Preview)</option>
                </select>
            </div>

            <input type="hidden" id="recording-environment" value="quiet">

            <div id="whisper-settings" style="display: none;"> ... </div>

            <div id="mai-transcribe-settings" style="display: none;">
                <h4 class="settings-section-title">MAI-Transcribe</h4>
                <div class="form-group">
                    <label for="mai-transcribe-uri">Target URI</label>
                    <input type="text" id="mai-transcribe-uri" placeholder="...">
                    <small>Copy the endpoint from Azure Foundry Portal</small>
                </div>
                <div class="form-group">
                    <label for="mai-transcribe-key">API Key</label>
                    <input type="password" id="mai-transcribe-key" placeholder="Enter Speech resource key">
                </div>
            </div>

            <button id="save-settings" class="save-button">Save Settings</button>
```

### Tests

`tests/model-adapters.vitest.js` — `createSettings(model, overrides)` (lines
51-60) is the injection seam; `getFormEntry(key)` (84-86) reads a multipart
field. The MAI 1.5 request-shape test (lines 272-303) asserts the whole
`enhancedMode` via `toEqual`:

```js
        expect(JSON.parse(getFormEntry(API_PARAMS.MAI_DEFINITION_FIELD).value)).toEqual({
            enhancedMode: {
                enabled: true,
                model: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL,
                task: 'transcribe'
            }
        });
```

`tests/settings-persistence.vitest.js` — the MAI 1.5 `getModelConfig` test
(lines 256-282) asserts an **exact** `toEqual` that WILL break when the field is
added, and must be updated:

```js
            expect(config).toEqual({
                model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
                apiKey: maiApiKey,
                uri: maiApiUri,
            });
```

The whisper `getModelConfig` test (lines 249-253) asserts a 3-field object and
must STAY 3 fields (the new field is 1.5-only).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Adapter tests | `npx vitest run tests/model-adapters.vitest.js tests/mai-transcribe.vitest.js` | all pass |
| Settings tests | `npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js` | all pass |
| Full suite | `npx vitest run 2>&1 \| tail -6` | `Test Files 32 passed (32)`, tests = 384 + your new ones |
| Lint | `npm run lint` | exit 0 |
| Coverage gate | `npm run test:coverage` | exit 0, thresholds 85/80/70/85 met |

## Scope

**In scope** (the only files you may modify):

- `js/constants.js`
- `js/model-adapters/mai-transcribe.js`
- `js/settings.js`
- `index.html`
- `tests/model-adapters.vitest.js`
- `tests/settings-persistence.vitest.js`
- `tests/settings-unit.vitest.js`
- (only if the constructor-caching change makes a required-element list reject:
  `tests/settings-workflow.vitest.js` — to register the new element ID. Touch
  it ONLY for that registration, nothing else.)

**Out of scope** (do NOT touch):

- `js/api-client.js` — the `{ ...config }` spread already propagates the field;
  adding plumbing here is unnecessary and would be flagged by `/simplify`.
- `js/model-adapters/whisper.js`, `whisper-translate.js`, `index.js`,
  `response-parsers.js` — `transcribeStyle` is request-only and MAI-1.5-only.
- `js/event-bus.js` — no new event is needed.
- The sidebar markup and the noise/device controls.
- CSS — reuse existing classes (`.form-group`, plain `<label>`, `<select>`);
  do not add new classes (CSS-token tests read the stylesheet).

## Git workflow

- Branch: `feat/008-mai-transcribe-style`
- Single commit: `feat(settings): add MAI-Transcribe 1.5 verbatim/readability style setting`
  with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Do NOT push or open a PR unless the operator instructed it. (Pre-commit runs
  lint; pre-push runs coverage + deps:check:prod.)

## Steps

### Step 1: Add the constants

In `js/constants.js`:

1. In `STORAGE_KEYS` (after `MAI_TRANSCRIBE_API_KEY`, line 47), add:
   `MAI_TRANSCRIBE_STYLE:   'mai_transcribe_style',`
2. Immediately after the `RECORDING_ENVIRONMENTS` block (after line 62), add a
   new enum + default, cloning the `RECORDING_ENVIRONMENTS` / `DEFAULT_LANGUAGE`
   shapes:

```js
/**
 * MAI-Transcribe 1.5 transcription styles. READABILITY is the default and is a
 * sentinel meaning "omit transcribeStyle entirely" (preserves Microsoft's
 * readability-optimized default); only VERBATIM is ever sent on the wire.
 * @constant {Object} MAI_TRANSCRIBE_STYLES
 */
export const MAI_TRANSCRIBE_STYLES = {
  READABILITY: 'readability',
  VERBATIM: 'verbatim'
};

/** @constant {string} DEFAULT_MAI_TRANSCRIBE_STYLE @default 'readability' */
export const DEFAULT_MAI_TRANSCRIBE_STYLE = MAI_TRANSCRIBE_STYLES.READABILITY;
```

3. In `API_PARAMS` (after `MAI_DEFINITION_FIELD`, line 78), add:
   `MAI_TRANSCRIBE_STYLE_FIELD: 'transcribeStyle'`
   (mind the comma on the preceding line).
4. In `ID` — "Modals & panes" group, after `MAI_TRANSCRIBE_SETTINGS` (line 181):
   `MAI_TRANSCRIBE_15_SETTINGS: 'mai-transcribe-15-settings',`
   and in the "Selectors / inputs" group, after `MAI_TRANSCRIBE_KEY` (line 191):
   `MAI_TRANSCRIBE_STYLE: 'mai-transcribe-style',`

**Verify**: `node -e "import('./js/constants.js').then(m=>console.log(m.MAI_TRANSCRIBE_STYLES.VERBATIM, m.DEFAULT_MAI_TRANSCRIBE_STYLE, m.API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD, m.STORAGE_KEYS.MAI_TRANSCRIBE_STYLE, m.ID.MAI_TRANSCRIBE_STYLE, m.ID.MAI_TRANSCRIBE_15_SETTINGS))"`
→ prints `verbatim readability transcribeStyle mai_transcribe_style mai-transcribe-style mai-transcribe-15-settings`

### Step 2: Emit `transcribeStyle` from the MAI adapter, gated to 1.5 + verbatim

In `js/model-adapters/mai-transcribe.js`:

1. Add `MAI_TRANSCRIBE_STYLES` to the existing constants import.
2. Replace the inline `formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode: { ... } }))`
   (lines 25-31) with a built object so the field can be conditionally added
   **last** (keeping `enabled, model, task` order so the Readability path
   serializes byte-identically to today):

```js
            const enhancedMode = {
                enabled: true,
                model: apiModel,
                task: 'transcribe'
            };
            if (apiModel === MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
                && config.transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
                enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
            }
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode }));
```

The `apiModel === MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL` gate is what keeps
the 1.0 adapter (same factory) from ever emitting the field. Whisper adapters
never reach this code.

**Verify**: `npx vitest run tests/model-adapters.vitest.js tests/mai-transcribe.vitest.js` →
all existing tests still pass (no current test sets `transcribeStyle`, so the
field is never added and serialized output is unchanged).

> Note: `tests/mai-transcribe.vitest.js` has a test ("should send MAI-Transcribe
> 1.5 API model…", ~lines 168-184) that asserts the full `definition` `toEqual`
> `{ enhancedMode: { enabled, model, task } }` with NO `transcribeStyle`. It
> uses a config without `transcribeStyle`, so the gate omits the field and this
> test MUST stay green **unchanged** — do not edit it. If it fails after Step 2,
> your gate is wrong (you are appending the field unconditionally): fix the
> adapter, not the test.

### Step 3: Thread the preference through Settings

In `js/settings.js`:

1. **Import**: add `MAI_TRANSCRIBE_STYLES` and `DEFAULT_MAI_TRANSCRIBE_STYLE` to
   the existing `./constants.js` import.
2. **Constructor** (near line 53, by `recordingEnvironmentSelect`): cache
   ```js
   this.maiTranscribe15Settings = document.getElementById(ID.MAI_TRANSCRIBE_15_SETTINGS);
   this.maiTranscribeStyleSelect = document.getElementById(ID.MAI_TRANSCRIBE_STYLE);
   ```
3. **`updateSettingsVisibility()`** (lines 413-422): after the
   `maiTranscribeSettings` block, add a 1.5-ONLY gate (note: explicit
   `=== MODEL_TYPES.MAI_TRANSCRIBE_1_5`, NOT `isMai`, which also matches 1.0):
   ```js
   if (this.maiTranscribe15Settings) {
       this.maiTranscribe15Settings.style.display =
           currentModel === MODEL_TYPES.MAI_TRANSCRIBE_1_5 ? 'block' : 'none';
   }
   ```
4. **`loadSettingsToForm()`** (after the recording-environment block, ~line 487):
   ```js
   const savedStyle = localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE) || DEFAULT_MAI_TRANSCRIBE_STYLE;
   if (this.maiTranscribeStyleSelect) {
       this.maiTranscribeStyleSelect.value = savedStyle;
   }
   ```
5. **`saveSettings()`** (after the recording-environment persist, ~line 616):
   ```js
   if (this.maiTranscribeStyleSelect) {
       localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE, this.maiTranscribeStyleSelect.value);
   }
   ```
6. **`getModelConfig()`** (lines 682-690): include `transcribeStyle` ONLY for
   the 1.5 model so whisper/1.0 config shape is unchanged:
   ```js
   getModelConfig() {
       const model = this.getCurrentModel();
       const isMai = this._isMaiModel(model);
       const config = {
           model,
           apiKey: localStorage.getItem(isMai ? STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY : STORAGE_KEYS.WHISPER_API_KEY),
           uri: localStorage.getItem(isMai ? STORAGE_KEYS.MAI_TRANSCRIBE_URI : STORAGE_KEYS.WHISPER_URI)
       };
       if (model === MODEL_TYPES.MAI_TRANSCRIBE_1_5) {
           config.transcribeStyle = localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE) || DEFAULT_MAI_TRANSCRIBE_STYLE;
       }
       return config;
   }
   ```

**Verify**: `npx vitest run tests/settings-persistence.vitest.js` → the MAI 1.5
`getModelConfig` test will now FAIL on `toEqual` (expected — fixed in Step 5).
Confirm the FAILURE is exactly that test's missing `transcribeStyle`, not
anything else.

### Step 4: Add the markup

In `index.html`, immediately after the `#mai-transcribe-settings` closing
`</div>` (line 279) and before the Save button:

```html
            <div id="mai-transcribe-15-settings" style="display: none;">
                <div class="form-group">
                    <label for="mai-transcribe-style">Transcription style</label>
                    <select id="mai-transcribe-style">
                        <option value="readability">Readability (cleaned up)</option>
                        <option value="verbatim">Verbatim (keep every word)</option>
                    </select>
                    <small>Verbatim keeps filler words and false starts; Readability removes them. MAI-Transcribe 1.5 only.</small>
                </div>
            </div>
```

The `<option value>`s MUST equal the enum strings (`readability`/`verbatim`) so
Settings reads them directly.

**Verify**: `grep -n "mai-transcribe-15-settings\|mai-transcribe-style" index.html`
→ both ids present once.

### Step 5: Tests

**5a. Adapter request shape — `tests/model-adapters.vitest.js`** (clone the MAI
1.5 test at lines 272-303). Add four tests:

- *Verbatim on 1.5 includes the field*: `createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5, { transcribeStyle: 'verbatim' })`;
  assert the `definition` `toEqual` has `enhancedMode` with
  `enabled/model(MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL)/task` **plus**
  `transcribeStyle: 'verbatim'`. (Reference the constant
  `MAI_TRANSCRIBE_STYLES.VERBATIM` / `API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD`,
  not literals — import them at the top like the file's other constants.)
- *Readability/default on 1.5 omits the field*: once with
  `{ transcribeStyle: 'readability' }` and once with no override; both assert
  the **exact existing** `toEqual` object (no `transcribeStyle`).
- *1.0 + verbatim omits*: clone the 1.0 test (lines 232-270) with
  `createSettings(MODEL_TYPES.MAI_TRANSCRIBE, { transcribeStyle: 'verbatim' })`;
  assert the 1.0 `definition` `toEqual` is unchanged (no `transcribeStyle`).
- *whisper + verbatim has no MAI definition at all*: clone the whisper request
  test (find it: `grep -n "WHISPER" tests/model-adapters.vitest.js`) with a
  `{ transcribeStyle: 'verbatim' }` override; assert
  `getFormEntry(API_PARAMS.MAI_DEFINITION_FIELD)` is `undefined`.

**5b. Settings persistence — `tests/settings-persistence.vitest.js`**:

- **UPDATE** the MAI 1.5 `getModelConfig` `toEqual` (lines 275-279) to include
  `transcribeStyle: DEFAULT_MAI_TRANSCRIBE_STYLE` (import it; the localStorage
  mock returns null for the style key, so the default applies). Leave the
  whisper `getModelConfig` test (249-253) as a 3-field object — do not add the
  field there.
- **ADD** a save test (clone the MAI 1.5 save test — `grep -n "MAI 1.5" tests/settings-persistence.vitest.js`):
  set the style select's value to `'verbatim'`, call `saveSettings()`, assert
  `localStorageMock.setItem` was called with
  `(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE, 'verbatim')`.
- **ADD** a read-back test (clone the recording-environment persistence test —
  `grep -n "recording environment" tests/settings-persistence.vitest.js`): with
  the style key returning `'verbatim'`, construct `Settings`, `openSettingsModal()`,
  assert `maiTranscribeStyleSelect.value === 'verbatim'`.

**5c. Visibility gating — `tests/settings-unit.vitest.js`** (this file does NOT
mock `updateSettingsVisibility` and builds a full mock-element map): register
the new element ids in that map, then add a test that sets
`settingsModelSelect.value` to whisper, then `mai-transcribe`, then
`mai-transcribe-1.5`, calling `updateSettingsVisibility()` each time and
asserting `maiTranscribe15Settings.style.display` is `'none'`, `'none'`,
`'block'` respectively.

**Register the new ids** in every settings test's required-element list so the
`Settings` constructor caches them (the constructor calls `getElementById` for
both new ids). Find the lists: `grep -n "MAI_TRANSCRIBE_KEY\|RECORDING_ENVIRONMENT" tests/settings-*.vitest.js`
and add `ID.MAI_TRANSCRIBE_STYLE` and `ID.MAI_TRANSCRIBE_15_SETTINGS` alongside.
If a list is missing them and a test errors on a null element, that is the
signal to register; if all tests pass without it, do not add gratuitously.

**Verify**: `npx vitest run tests/model-adapters.vitest.js tests/mai-transcribe.vitest.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js`
→ all pass, including the new tests.

### Step 6: Full gate

**Verify**: `npx vitest run 2>&1 | tail -6` → `Test Files 32 passed (32)`, all
pass (384 baseline + your new tests); `npm run lint` → exit 0;
`npm run test:coverage` → exit 0 with thresholds met.

## Test plan

- **Adapter (5a)**: 1.5+verbatim emits the field; 1.5+readability and 1.5+default
  omit it (byte-identical regression guard); 1.0+verbatim omits (proves the
  apiModel gate); whisper+verbatim has no MAI definition (proves cross-model
  isolation). Pattern: clone `model-adapters.vitest.js:272-303`; inject via the
  `createSettings(model, overrides)` seam (lines 51-60).
- **Persistence (5b)**: update the now-4-field 1.5 `getModelConfig` `toEqual`;
  save writes the style key; modal open hydrates the select.
- **Visibility (5c)**: the 1.5-only container shows for 1.5 and hides for
  whisper and 1.0. Pattern: `settings-unit.vitest.js` model-branch tests.

## Done criteria

ALL must hold:

- [ ] `node -e "..."` constant check from Step 1 prints the six expected values
- [ ] `grep -rn "'verbatim'\|'transcribeStyle'\|'readability'" js/` returns **no**
      matches outside `js/constants.js` (no magic strings in modules)
- [ ] `grep -n "mai-transcribe-15-settings" index.html` → present
- [ ] `npx vitest run` → all pass; new adapter + persistence + visibility tests exist and pass
- [ ] `npm run lint` and `npm run test:coverage` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt does not match the live code (drift since `aa3b28c`).
- Adding the field to `getModelConfig` breaks a settings test OTHER than the
  one MAI 1.5 `toEqual` named in Step 3/5b — investigate before "fixing".
- A test requires changing `js/api-client.js` to make the field reach the
  adapter — it should not; the `{ ...config }` spread already carries it.
- You conclude the control belongs in the sidebar, or should be a toggle, or
  that 1.0/whisper should also support the field — those are design changes;
  report instead of implementing.
- Microsoft's value turns out to be anything other than the literal `verbatim`
  inside `enhancedMode` — stop and report (the plan hard-codes that contract).

## Maintenance notes

- **The gate is doubly enforced**: `getModelConfig` only includes
  `transcribeStyle` for 1.5, AND the adapter only emits it when
  `apiModel === MAI_TRANSCRIBE_1_5_API_MODEL`. Keep both — the two MAI adapters
  share one factory, so the adapter-side gate is the real guarantee; the
  Settings-side gate keeps the config shape clean for whisper/1.0 tests.
- **Two selectors, by design**: `getModelConfig` keys off `getCurrentModel()`
  (the MAIN selector, session-only) while `updateSettingsVisibility` keys off
  `getCurrentModelFromSettings()` (the MODAL selector). This asymmetry is the
  existing pattern — do not "unify" it.
- If Microsoft later adds more `transcribeStyle` values or extends support to
  1.0, widen `MAI_TRANSCRIBE_STYLES` and the adapter gate together; the select
  options and the enum are the single sources of truth.
- A reviewer should confirm: the Readability/default request body is unchanged
  (diff a 1.5 default request against a pre-change one), and whisper/1.0 configs
  did not gain the field.
