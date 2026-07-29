# Plan 040: Add a MAI-Transcribe 1.5 verbatim transcription toggle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dc45b1c..HEAD -- js/constants.js js/settings.js js/api-client.js js/model-adapters/mai-transcribe.js index.html CLAUDE.md tests/model-adapters.vitest.js tests/api-client-validation.vitest.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js tests/browser/transcription-smoke.spec.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (feature, user-requested)
- **Effort**: M
- **Risk**: LOW — additive and opt-in; the default path stays byte-identical on the wire
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `dc45b1c`, 2026-07-29

## Why this matters

MAI-Transcribe 1.5 ships two output styles behind one request field,
`transcribeStyle`, nested inside the `enhancedMode` object of the multipart
`definition` form field:

- **Readability** — *omit* `transcribeStyle` entirely. Microsoft returns a
  readability-optimized transcript: filler words, false starts, and
  disfluencies are cleaned up. This is the app's current and only behavior.
- **Verbatim** — send `"transcribeStyle": "verbatim"`. Microsoft preserves the
  original spoken content including "um/uh", repetitions, and false starts.

The User wants to choose per-preference in the UI. Today there is no control and
the field is never sent, so every MAI request is implicitly Readability.

**Hard domain constraint** (from Microsoft Learn,
`https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe`,
captured here so you need not browse): readability is the *field-absent*
default. There is no `"transcribeStyle":"readability"` value to send. Only the
literal string `verbatim` is ever serialized onto the wire. Therefore the
Readability path must produce a request **byte-identical to today's**.

**Product decisions already made by the User — implement these, do not
re-litigate them:**

1. The control is an on/off **switch labelled "Verbatim transcription"**, placed
   in the User menu's **Model panel** directly under the Transcription model
   dropdown, and visible only while MAI-Transcribe 1.5 is the selected model.
2. It **saves immediately** on change (the Noise Cancellation idiom), not on
   "Save changes".
3. **Default is Readability** (switch off) when nothing is stored. Verbatim is
   opt-in.

### Prior art you must know about

An earlier version of this feature exists in the repo's history. `plans/008-mai-transcribe-style-setting.md`
added a Readability/Verbatim **dropdown in the old settings modal** (merged as
PR #70), and `plans/009-revert-mai-style-toggle.md` reverted it wholesale (PR
#71) because the User decided at the time they only ever wanted readability.
**Do not re-run plan 008 and do not `git revert` the revert.** Three things it
relied on are no longer true at `dc45b1c`, and following it would produce a
toggle that silently changes nothing on the wire:

- `js/api-client.js` used to spread `{ ...config }`, so new Settings fields
  reached adapters for free. It now builds an explicit two-key allow-list.
  Plan 008 declared touching that file a STOP condition; **this plan requires
  changing it** (Step 3).
- MAI-Transcribe 1.0 was removed (plan 010). Only one MAI adapter remains, so
  008's `apiModel === MAI_TRANSCRIBE_1_5_API_MODEL` gate is now redundant.
- The settings modal was replaced by nested User-menu panels (plan 033), and
  `updateSettingsVisibility()` no longer gates anything by model.

Plan 008 is still useful as background reading, but every excerpt in it is
stale. Trust *this* plan's "Current state" section.

## Current state

Files and their roles:

- `js/constants.js` — single source of truth for storage keys, request field
  names, DOM ids, and enums. No magic strings anywhere else.
- `js/model-adapters/mai-transcribe.js` — builds the MAI multipart request.
  Currently ignores its `config` argument entirely.
- `js/api-client.js` — `validateConfig()` normalizes what Settings returns
  before handing it to the adapter. This is the gate the new field must pass.
- `js/settings.js` — owns preference load/save and the User-menu form behavior.
- `index.html` — the User-menu panel markup.
- `css/styles.css` — already contains the `.user-menu-switch` class the new
  control reuses. **No CSS change is needed.**

### Adapter — `js/model-adapters/mai-transcribe.js:22-81`

Note `_config`: the underscore marks it deliberately unused (the ESLint config
at `eslint.config.js:7` is `'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]`).
You will rename it to `config` in Step 2, at which point it must actually be
used or lint fails.

```js
function createMaiTranscribeModelAdapter(id, label, apiModel) {
    return Object.freeze({
        id,
        label,
        scope: COGNITIVE_SERVICES_SCOPE,
        storageKeys: Object.freeze({
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        }),
        async buildRequest(audioBlob, _config, onProgress) {
            // ... format guard, WAV conversion, upload-size guard (lines 31-62) ...
            const formData = new FormData();
            formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({
                enhancedMode: {
                    enabled: true,
                    model: apiModel,
                    task: 'transcribe'
                }
            }));

            return {
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    });
}
```

Its import block (`js/model-adapters/mai-transcribe.js:5-17`) pulls named
constants from `../constants.js` in roughly alphabetical order:
`AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE, AUDIO_UPLOAD_LIMIT_ERROR_CODE,
API_PARAMS, DEFAULT_WAV_FILENAME, formatAudioUploadLimitMessage,
MAI_TRANSCRIBE_MAX_UPLOAD_BYTES, MESSAGES, MODEL_TYPES, STORAGE_KEYS,
SUPPORTED_AUDIO_FORMATS_LABEL, resolveSupportedAudioFormat`.

### The propagation gate — `js/api-client.js:446-478`

**This is the load-bearing fact of the whole plan.** `validateConfig()` builds
an explicit allow-list. A `transcribeStyle` added to `getModelConfig()` and
nothing else would be **dropped here, silently**, and every unit test that
stubs Settings directly would still pass:

```js
    validateConfig() {
        const config = this.settings.getModelConfig();
        const normalizedConfig = {
            model: config.model,
            uri: typeof config.uri === 'string'
                ? config.uri.replace(/\s+/g, '')
                : config.uri
        };

        if (!normalizedConfig.uri) { /* throws */ }
        // ... URL parse + https checks (lines 461-475) ...
        return normalizedConfig;
    }
```

The allow-list is deliberate hygiene from the key-removal work (plan 032):
arbitrary Settings fields must not flow into request builders. **Keep it an
allow-list.** Do not replace it with `{ ...config }`.

`transcribe()` at `js/api-client.js:52-56` is what feeds the adapter:

```js
        const config = this.validateConfig();
        const adapter = this._getModelAdapter(config.model);
        // ...
        const { body, statusMessage } = await adapter.buildRequest(audioBlob, config, onProgress);
```

### Settings — `js/settings.js`

Two persistence idioms coexist. **The new toggle follows the immediate-commit
one.**

*Immediate commit* — Noise Cancellation, `js/settings.js:114-122`. This is your
structural exemplar:

```js
        this.noiseToggle?.addEventListener('change', () => {
            const environment = this.noiseToggle.checked
                ? RECORDING_ENVIRONMENTS.NOISY
                : RECORDING_ENVIRONMENTS.QUIET;
            localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, environment);
            if (this.recordingEnvironmentSelect) {
                this.recordingEnvironmentSelect.value = environment;
            }
        });
```

with its loader at `js/settings.js:62-71` (`loadNoiseToggle()`), called from
both `init()` (line 47) and `loadSettingsToForm()` (line 220).

*Draft/commit* — model and Target URI, committed in `saveSettings()`
(`js/settings.js:277-325`). Not the idiom for this control.

Constructor element caching, `js/settings.js:29-40`:

```js
        this.modelSelect = document.getElementById(ID.MODEL_SELECT);
        this.settingsModelSelect = document.getElementById(ID.SETTINGS_MODEL_SELECT);
        // ...
        this.noiseToggle = document.getElementById(ID.NOISE_TOGGLE);
        this.inputDeviceSelect = document.getElementById(ID.INPUT_DEVICE);
```

`init()`, `js/settings.js:45-56`:

```js
    init() {
        this.loadSavedModel();
        this.loadNoiseToggle();
        this.loadThemeMode();
        this.setupEventListeners();
        this.updateSettingsVisibility();
        this._offPermissionGranted = eventBus.on(/* ... */);
        this.checkInitialSettings();
    }
```

The Model-panel select's change listener, `js/settings.js:100-106`:

```js
        this.modelSelect?.addEventListener('change', (event) => {
            const model = event.target.value;
            const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
            if (this.settingsModelSelect) this.settingsModelSelect.value = model;
            logger.child('Settings').info('UI model switched:', model, '(session only)');
            eventBus.emit(APP_EVENTS.UI_MODEL_SWITCHED, { model, savedModel });
        });
```

`loadSettingsToForm()`, `js/settings.js:214-222`, and the model accessors plus
`getModelConfig()`, `js/settings.js:340-358`:

```js
    getCurrentModel() {
        return this.modelSelect?.value || DEFAULT_MODEL_TYPE;
    }

    getCurrentModelFromSettings() {
        return this.settingsModelSelect?.value || this.getCurrentModel();
    }

    getModelConfig() {
        const model = this.getCurrentModel();
        return {
            model,
            uri: localStorage.getItem(this._getTargetUriStorageKey(model))
        };
    }

    _isMaiModel(model) {
        return model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
    }
```

`saveSettings()` syncs the Model-panel select at `js/settings.js:305`:

```js
        if (this.modelSelect) this.modelSelect.value = currentModel;
```

**Why gating on `getCurrentModel()` (the Model-panel select) is correct here:**
`getModelConfig()` reads that same select, so what the toggle is gated on and
what actually gets sent can never disagree. `getCurrentModelFromSettings()`
(the hidden Settings-panel mirror) is for the draft/commit flow and is **not**
what this control keys off.

### Constants — `js/constants.js`

```js
// STORAGE_KEYS, lines 41-49:
export const STORAGE_KEYS = {
  MODEL:                'transcription_model',
  WHISPER_URI:          'whisper_uri',
  MAI_TRANSCRIBE_URI:     'mai_transcribe_uri',
  THEME_MODE:           'themeMode',
  RECORDING_ENVIRONMENT: 'recording_environment',
  INPUT_DEVICE:          'input_device',
  TRANSCRIPT_RECORD:     'transcript_record'
};

// RECORDING_ENVIRONMENTS, lines 55-58 — the enum shape to clone:
export const RECORDING_ENVIRONMENTS = {
  QUIET: 'quiet',
  NOISY: 'noisy'
};

// API_PARAMS, lines 67-72:
export const API_PARAMS = {
  FILE:            'file',
  LANGUAGE:        'language',
  MAI_AUDIO_FIELD:    'audio',
  MAI_DEFINITION_FIELD: 'definition'
};

// MODEL_TYPES, lines 81-85 — note the two 1.5 strings serve different roles:
export const MODEL_TYPES = {
  WHISPER:           'whisper',
  MAI_TRANSCRIBE_1_5: 'mai-transcribe-1.5',          // internal id / select value / registry key
  MAI_TRANSCRIBE_1_5_API_MODEL: 'mai-transcribe-1.5' // value written into enhancedMode.model
};

// DEFAULT_MODEL_TYPE, line 110 — the standalone-default shape to clone:
export const DEFAULT_MODEL_TYPE = MODEL_TYPES.MAI_TRANSCRIBE_1_5;

// ID (Object.freeze, starts line 205). Relevant existing entries:
//   MODEL_SELECT: 'model-select',            (line 237)
//   SETTINGS_MODEL_SELECT: 'settings-model-select',  (line 238)
//   NOISE_TOGGLE: 'noise-toggle',            (line 242)
//   INPUT_DEVICE: 'input-device',            (line 243)
```

### Markup — `index.html:280-298`

The Model panel (where the new control goes) and the Microphone panel (whose
switch markup you are cloning):

```html
                    <div data-menu-panel="model" hidden>
                        <label class="user-menu-field" for="model-select">Transcription model
                            <select id="model-select">
                                <option value="whisper">Azure Whisper</option>
                                <option value="mai-transcribe-1.5">MAI-Transcribe 1.5</option>
                            </select>
                        </label>
                        <a id="model-help" class="user-menu-support" href="https://learn.microsoft.com/azure/ai-services/openai/concepts/models" target="_blank" rel="noopener noreferrer">Help me choose a model</a>
                    </div>

                    <div data-menu-panel="microphone" hidden>
                        <label class="user-menu-field" for="input-device">Input device
                            <select id="input-device"><option value="">System Default</option></select>
                        </label>
                        <label class="user-menu-switch" for="noise-toggle">
                            <span><strong>Noise Cancellation</strong><small>Filter background hum and static</small></span>
                            <input type="checkbox" id="noise-toggle" role="switch">
                        </label>
                    </div>
```

`js/user-menu.js:207-208` hides and shows whole panels generically by
`data-menu-panel`; it needs **no** change for a control nested inside one.

### Tests

- `tests/model-adapters.vitest.js` — the injection seam is
  `createSettings(model, overrides)` at lines 61-69, which stubs
  `getModelConfig()`. `getFormEntry(name)` (lines 103-105) reads one multipart
  field. The MAI 1.5 request-shape test at lines 389-420 asserts the whole
  `definition` with `toEqual`:

```js
        expect(JSON.parse(getFormEntry(API_PARAMS.MAI_DEFINITION_FIELD).value)).toEqual({
            enhancedMode: {
                enabled: true,
                model: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL,
                task: 'transcribe'
            }
        });
```

  Because these tests drive the **real** `AzureAPIClient.transcribe()`, an
  override set via `createSettings` only reaches the adapter if Step 3 landed.
  That makes them the honest end-to-end proof of the propagation fix.

- `tests/api-client-validation.vitest.js` — stubs `getModelConfig` (line 11)
  and asserts `validateConfig()` output with `toEqual` (lines 63, 106).

- `tests/settings-persistence.vitest.js` — builds a real DOM string with `ID.`
  interpolation (lines ~20-40, including `<input id="${ID.NOISE_TOGGLE}" type="checkbox">`)
  and uses real `localStorage`. **The `it.each` at lines 303-317 will break in
  Step 4** and must be updated:

```js
    it.each([
        [MODEL_TYPES.WHISPER, STORAGE_KEYS.WHISPER_URI],
        [MODEL_TYPES.MAI_TRANSCRIBE_1_5, STORAGE_KEYS.MAI_TRANSCRIBE_URI]
    ])('retrieves the committed configuration for %s', (model, uriKey) => {
        localStorage.setItem(STORAGE_KEYS.MODEL, model);
        localStorage.setItem(uriKey, 'https://target.invalid/transcribe');
        const settings = new Settings();

        expect(settings.getModelConfig()).toEqual({
            model,
            uri: 'https://target.invalid/transcribe'
        });
        settings.destroy();
    });
```

  The separate `fixture-model` `getModelConfig` assertion at lines 288-291 uses
  a custom non-MAI model and **must stay a two-key object** — do not touch it.

- `tests/settings-unit.vitest.js` — same DOM-template idiom (lines ~14-30).
- `tests/browser/transcription-smoke.spec.js:116-122` — the real-Chromium
  assertion of the same `definition` shape. It is a **regression guard for the
  default path and must stay green unchanged.**

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Adapter + validation tests | `npx vitest run tests/model-adapters.vitest.js tests/api-client-validation.vitest.js` | all pass |
| Settings tests | `npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js tests/settings-workflow.vitest.js tests/settings-sidebar.vitest.js` | all pass |
| Full suite | `npx vitest run 2>&1 \| tail -6` | `Test Files 42 passed (42)`, `Tests 540 passed (540)` **plus your new tests** |
| Lint | `npm run lint` | exit 0 |
| Coverage gate | `npm run test:coverage` | exit 0, thresholds 85/80/70/85 met |
| Dependency gate | `npm run deps:check` | exit 0 |
| Deterministic browser | `npm run test:browser` | all pass |

Baseline measured at `dc45b1c`: **42 test files, 540 tests, all passing.**

Do **not** run `npm run test:browser:live` — it is the protected, potentially
billable live Azure stage and requires fresh operator approval.

## Scope

**In scope** (the only files you may modify):

- `js/constants.js`
- `js/model-adapters/mai-transcribe.js`
- `js/api-client.js`
- `js/settings.js`
- `index.html`
- `CLAUDE.md` (exactly one sentence — Step 6)
- `tests/model-adapters.vitest.js`
- `tests/api-client-validation.vitest.js`
- `tests/settings-persistence.vitest.js`
- `tests/settings-unit.vitest.js`
- `tests/settings-sidebar.vitest.js` and `tests/settings-workflow.vitest.js` —
  **only** if a null cached element makes one of them fail, and then only to
  register the new element ids in their DOM template. Nothing else.

**Out of scope** (do NOT touch, even though they look related):

- `css/styles.css` — `.user-menu-switch` already exists and is reused verbatim.
  Adding a class would also risk the CSS-token tests
  (`tests/status-tokens.vitest.js`, `tests/island-layout-css.vitest.js`,
  `tests/color-constants-sync.vitest.js`) which read the stylesheet.
- `tests/browser/transcription-smoke.spec.js` — the default-path regression
  guard. If it goes red, your gate is wrong; fix the code, not the test.
- `js/user-menu.js` — panel show/hide is generic and already works.
- `js/model-adapters/whisper.js`, `index.js`, `response-parsers.js` —
  `transcribeStyle` is request-only and MAI-only; it never affects parsing.
- `js/event-bus.js` — no new event. The preference is read at request time.
- `plans/008-*.md` and `plans/009-*.md` — historical record; leave them alone.
- The `saveSettings()` draft/commit path — the toggle commits immediately and
  must **not** be added to it.

## Git workflow

- Branch: `advisor/040-mai-verbatim-toggle`
- Conventional commits, matching `git log` (e.g. `fix(auth): share MSAL session across tabs`).
  Single commit: `feat(settings): add MAI-Transcribe 1.5 verbatim transcription toggle`
  with trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Do NOT push or open a PR unless the operator instructed it. Husky runs lint on
  pre-commit and coverage plus `deps:check:prod` on pre-push.

## Steps

### Step 1: Add the constants

In `js/constants.js`:

1. In `STORAGE_KEYS` (after `MAI_TRANSCRIBE_URI`, line 44), add:
   `MAI_TRANSCRIBE_STYLE:   'mai_transcribe_style',`
2. Immediately after the `RECORDING_ENVIRONMENTS` block (after line 58), add the
   enum and its default, cloning the `RECORDING_ENVIRONMENTS` / `DEFAULT_MODEL_TYPE` shapes:

```js
/**
 * MAI-Transcribe 1.5 transcription styles. READABILITY is the default and is a
 * sentinel meaning "omit transcribeStyle entirely", which is how Microsoft's
 * readability-optimized default is selected. Only VERBATIM is ever sent.
 * @constant {Object} MAI_TRANSCRIBE_STYLES
 */
export const MAI_TRANSCRIBE_STYLES = {
  READABILITY: 'readability',
  VERBATIM: 'verbatim'
};

/** @constant {string} DEFAULT_MAI_TRANSCRIBE_STYLE @default 'readability' */
export const DEFAULT_MAI_TRANSCRIBE_STYLE = MAI_TRANSCRIBE_STYLES.READABILITY;
```

3. In `API_PARAMS` (after `MAI_DEFINITION_FIELD`, line 71 — mind the comma),
   add: `MAI_TRANSCRIBE_STYLE_FIELD: 'transcribeStyle'`
4. In `ID`, after `NOISE_TOGGLE` (line 242), add both ids:
   ```js
   VERBATIM_SETTING: 'verbatim-setting',
   VERBATIM_TOGGLE: 'verbatim-toggle',
   ```

**Verify**: `node -e "import('./js/constants.js').then(m=>console.log(m.MAI_TRANSCRIBE_STYLES.VERBATIM, m.DEFAULT_MAI_TRANSCRIBE_STYLE, m.API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD, m.STORAGE_KEYS.MAI_TRANSCRIBE_STYLE, m.ID.VERBATIM_TOGGLE, m.ID.VERBATIM_SETTING))"`
→ prints `verbatim readability transcribeStyle mai_transcribe_style verbatim-toggle verbatim-setting`

### Step 2: Emit `transcribeStyle` from the MAI adapter, gated to verbatim

In `js/model-adapters/mai-transcribe.js`:

1. Add `MAI_TRANSCRIBE_STYLES` to the existing `../constants.js` import, after
   `MAI_TRANSCRIBE_MAX_UPLOAD_BYTES`.
2. Rename the `_config` parameter to `config` in the `buildRequest` signature
   (line 30).
3. Replace the inline `formData.append(API_PARAMS.MAI_DEFINITION_FIELD, ...)`
   (lines 66-72) with a built object so the field can be appended **last**,
   preserving `enabled, model, task` key order so the Readability path
   serializes byte-identically to today:

```js
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

The strict `=== MAI_TRANSCRIBE_STYLES.VERBATIM` comparison is the real
guarantee: any other value, `undefined`, or a missing config omits the field
and yields readability. Use optional chaining on `config` — some adapter unit
tests call `buildRequest` without one.

**Verify**: `npx vitest run tests/model-adapters.vitest.js` → all existing tests
still pass. No current test sets `transcribeStyle`, so the field is never added
and the serialized output is unchanged.

> The existing MAI 1.5 test at lines 389-420 asserts the exact three-key
> `enhancedMode` with no `transcribeStyle`. It **must stay green unchanged** —
> do not edit it. If it fails here, your gate is appending unconditionally: fix
> the adapter, not the test.

### Step 3: Let `transcribeStyle` through the api-client allow-list

**This is the step plan 008 did not need and this plan cannot work without.**

In `js/api-client.js`, inside `validateConfig()` (lines 446-477), after
`normalizedConfig` is built and **before** the `if (!normalizedConfig.uri)`
guard, add exactly:

```js
        if (config.transcribeStyle) {
            normalizedConfig.transcribeStyle = config.transcribeStyle;
        }
```

Conditional, so a Whisper config keeps its exact `{ model, uri }` shape and no
`transcribeStyle: undefined` key appears anywhere.

Do **not** convert `normalizedConfig` to a `{ ...config }` spread. The
allow-list is intentional: it stops arbitrary Settings fields reaching request
builders. You are widening it by exactly one known field.

Also extend the `@returns` JSDoc on line 443 from
`{{uri: string, model: string}}` to
`{{uri: string, model: string, transcribeStyle?: string}}`.

**Verify**: `npx vitest run tests/api-client-validation.vitest.js` → all pass
(no existing case sets the field, and `toEqual` comparisons are unaffected).

### Step 4: Thread the preference through Settings

In `js/settings.js`:

1. **Import**: add `DEFAULT_MAI_TRANSCRIBE_STYLE` and `MAI_TRANSCRIBE_STYLES`
   to the existing `./constants.js` import (lines 5-12), keeping alphabetical order.
2. **Constructor** (after the `noiseToggle` line, line 38), cache both elements:
   ```js
   this.verbatimSetting = document.getElementById(ID.VERBATIM_SETTING);
   this.verbatimToggle = document.getElementById(ID.VERBATIM_TOGGLE);
   ```
3. **Add two helpers** next to `loadNoiseToggle()` (after line 71):
   ```js
   _getTranscribeStyle() {
       return localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE) === MAI_TRANSCRIBE_STYLES.VERBATIM
           ? MAI_TRANSCRIBE_STYLES.VERBATIM
           : DEFAULT_MAI_TRANSCRIBE_STYLE;
   }

   loadVerbatimToggle() {
       if (this.verbatimToggle) {
           this.verbatimToggle.checked = this._getTranscribeStyle() === MAI_TRANSCRIBE_STYLES.VERBATIM;
       }
   }
   ```
   `_getTranscribeStyle()` fails closed: anything not exactly `'verbatim'`
   (absent key, empty string, stale value, hand-edited junk) reads as readability.
4. **Add the visibility gate** next to `updateSettingsVisibility()` (after line 171):
   ```js
   /** The verbatim switch is MAI-Transcribe 1.5 only; Whisper never sends the field. */
   updateVerbatimVisibility() {
       if (this.verbatimSetting) {
           this.verbatimSetting.hidden = !this._isMaiModel(this.getCurrentModel());
       }
   }
   ```
5. **`init()`** (lines 45-56): call `this.loadVerbatimToggle();` right after
   `this.loadNoiseToggle();`, and `this.updateVerbatimVisibility();` right after
   `this.updateSettingsVisibility();`.
6. **Model-select listener** (lines 100-106): add `this.updateVerbatimVisibility();`
   as the last statement inside the handler.
7. **New change listener** in `setupEventListeners()`, directly after the
   `noiseToggle` listener block (after line 122) — same immediate-commit idiom:
   ```js
   this.verbatimToggle?.addEventListener('change', () => {
       localStorage.setItem(
           STORAGE_KEYS.MAI_TRANSCRIBE_STYLE,
           this.verbatimToggle.checked
               ? MAI_TRANSCRIBE_STYLES.VERBATIM
               : MAI_TRANSCRIBE_STYLES.READABILITY
       );
   });
   ```
8. **`loadSettingsToForm()`** (lines 214-222): add `this.loadVerbatimToggle();`
   right after `this.loadNoiseToggle();` so reopening the menu reflects stored state.
9. **`saveSettings()`**: after `if (this.modelSelect) this.modelSelect.value = currentModel;`
   (line 305), add `this.updateVerbatimVisibility();` so committing a model
   change from the Settings panel re-gates the switch. Add **nothing else** to
   `saveSettings()` — the toggle is not part of the draft.
10. **`getModelConfig()`** (lines 348-354): include the field for MAI 1.5 only:
    ```js
    getModelConfig() {
        const model = this.getCurrentModel();
        const config = {
            model,
            uri: localStorage.getItem(this._getTargetUriStorageKey(model))
        };
        if (this._isMaiModel(model)) {
            config.transcribeStyle = this._getTranscribeStyle();
        }
        return config;
    }
    ```

**Verify**: `npx vitest run tests/settings-persistence.vitest.js` → the
`it.each` case `retrieves the committed configuration for mai-transcribe-1.5`
now FAILS on `toEqual` because of the extra `transcribeStyle: 'readability'`
key. That exact failure is expected and is fixed in Step 7. Confirm the whisper
case still passes and that **nothing else** fails. Any other failure is a
STOP condition.

### Step 5: Add the markup

In `index.html`, inside `<div data-menu-panel="model">`, between the closing
`</label>` of the model field (line 286) and the `#model-help` link (line 287):

```html
                        <label class="user-menu-switch" for="verbatim-toggle" id="verbatim-setting" hidden>
                            <span><strong>Verbatim transcription</strong><small>Keep filler words and false starts</small></span>
                            <input type="checkbox" id="verbatim-toggle" role="switch">
                        </label>
```

Reuse `.user-menu-switch` exactly as the Noise Cancellation control does. Start
`hidden`; `updateVerbatimVisibility()` reveals it at init when MAI 1.5 is the
selected model.

**Verify**: `grep -o "verbatim-toggle\|verbatim-setting" index.html | wc -l` → `3`
(the `for`, the `id` on the label, and the `id` on the input). Count matches,
not matching lines: the prescribed label places its `for` and `id` on one line.

### Step 6: Update the architecture guide

In `CLAUDE.md`, line 117-119 currently reads:

```
Both declare `https://cognitiveservices.azure.com/.default`. Browser-local
persistence is limited to non-secret model, manual HTTPS Target URI,
microphone, theme, and transcript data.
```

Add the new preference to that list, keeping the surrounding prose and the
80-column wrapping intact — for example `... manual HTTPS Target URI,
microphone, transcription style, theme, and transcript data.` Change nothing
else in `CLAUDE.md`.

**Verify**: `grep -n "transcription style" CLAUDE.md` → one match in that sentence.

### Step 7: Tests

**7a. Adapter request shape — `tests/model-adapters.vitest.js`.** Import
`MAI_TRANSCRIBE_STYLES` alongside the file's other constants. Clone the MAI 1.5
test at lines 389-420 and add three cases:

- *Verbatim on 1.5 emits the field*: `createApiClient(createSettings(MODEL_TYPES.MAI_TRANSCRIBE_1_5, { transcribeStyle: MAI_TRANSCRIBE_STYLES.VERBATIM }))`;
  assert the parsed `definition` `toEqual` `{ enhancedMode: { enabled: true,
  model: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL, task: 'transcribe',
  transcribeStyle: MAI_TRANSCRIBE_STYLES.VERBATIM } }`. Reference constants, not
  string literals. **This case is the end-to-end proof of Step 3** — if it fails
  with the field absent, `validateConfig()` is still stripping it.
- *Readability on 1.5 omits it*: same with
  `{ transcribeStyle: MAI_TRANSCRIBE_STYLES.READABILITY }`; assert the exact
  three-key `enhancedMode` (no `transcribeStyle`).
- *Whisper ignores it entirely*: `createSettings(MODEL_TYPES.WHISPER, { transcribeStyle: MAI_TRANSCRIBE_STYLES.VERBATIM })`;
  assert `getFormEntry(API_PARAMS.MAI_DEFINITION_FIELD)` is `undefined` and the
  request still carries `API_PARAMS.FILE`.

The existing no-override 1.5 test stays unchanged as the default-path guard.

**7b. Propagation — `tests/api-client-validation.vitest.js`.** Add two cases
following the file's existing `mockSettings.getModelConfig.mockReturnValue(...)`
idiom:

- MAI 1.5 config including `transcribeStyle: 'verbatim'` → `validateConfig()`
  returns an object whose `transcribeStyle` is `'verbatim'`.
- A Whisper config with no `transcribeStyle` → the returned object has no such
  key. Assert with `expect(Object.keys(result)).toEqual(['model', 'uri'])` so a
  future `{ ...config }` regression is caught.

**7c. Settings — `tests/settings-persistence.vitest.js`.**

- Register the new elements in the DOM template (beside the `ID.NOISE_TOGGLE`
  line): `<label id="${ID.VERBATIM_SETTING}"><input id="${ID.VERBATIM_TOGGLE}" type="checkbox"></label>`
- **UPDATE** the `it.each` at lines 303-317 so the MAI 1.5 expectation includes
  `transcribeStyle: DEFAULT_MAI_TRANSCRIBE_STYLE` while the Whisper expectation
  stays two keys. Simplest shape: add a third tuple element carrying the
  expected extra fields and spread it into the `toEqual`. Leave the
  `fixture-model` assertion at lines 288-291 as a two-key object.
- **ADD**: flipping `verbatimToggle.checked = true` and dispatching `change`
  writes `'verbatim'` to `STORAGE_KEYS.MAI_TRANSCRIBE_STYLE`; flipping back
  writes `'readability'`.
- **ADD**: with `'verbatim'` already stored, a fresh `Settings` hydrates
  `verbatimToggle.checked === true`, and `getModelConfig().transcribeStyle` is
  `'verbatim'` when the model is MAI 1.5.
- **ADD**: with a junk value such as `'VERBATIM '` stored, `getModelConfig().transcribeStyle`
  is `'readability'` and the toggle renders unchecked (fail-closed).

**7d. Visibility — `tests/settings-unit.vitest.js`.** Register the same two
elements in that file's DOM template, then add one test that sets
`settings.modelSelect.value` to `MODEL_TYPES.WHISPER` and then to
`MODEL_TYPES.MAI_TRANSCRIBE_1_5`, calling `settings.updateVerbatimVisibility()`
each time and asserting `settings.verbatimSetting.hidden` is `true` then `false`.

If `tests/settings-sidebar.vitest.js` or `tests/settings-workflow.vitest.js`
errors on a null element, register the two ids in its template too — that
registration only, nothing else. If they pass untouched, leave them alone.

**Verify**: `npx vitest run tests/model-adapters.vitest.js tests/api-client-validation.vitest.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js`
→ all pass, including the new cases.

### Step 8: Full gate

**Verify**, all from the repo root:

- `npx vitest run 2>&1 | tail -6` → 42 files pass, 540 baseline tests plus your
  new ones, zero failures.
- `npm run lint` → exit 0.
- `npm run test:coverage` → exit 0, thresholds met.
- `npm run deps:check` → exit 0.
- `npm run test:browser` → all pass, `tests/browser/transcription-smoke.spec.js`
  green **without having been edited**.

## Test plan

- **Adapter (7a)**: verbatim emits the field; explicit readability omits it; the
  untouched existing test covers the no-preference default; Whisper never gets a
  MAI definition. Pattern: `tests/model-adapters.vitest.js:389-420`, injected
  through the `createSettings(model, overrides)` seam at lines 61-69.
- **Propagation (7b)**: the api-client allow-list forwards `transcribeStyle` for
  MAI and keeps Whisper's config shape at exactly two keys. Pattern: the
  existing `validateConfig` cases in `tests/api-client-validation.vitest.js`.
- **Persistence (7c)**: toggle writes immediately; stored value hydrates the
  switch and reaches `getModelConfig()`; unknown values fail closed to
  readability. Pattern: the recording-environment/noise-toggle tests in the same
  file.
- **Gating (7d)**: the switch is hidden for Whisper and shown for MAI 1.5.
- **Regression guard**: `tests/browser/transcription-smoke.spec.js:116-122`
  proves in real Chromium that the default request body is unchanged.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] The Step 1 `node -e` constant check prints the six expected values
- [ ] `grep -rn "'verbatim'\|'readability'\|'transcribeStyle'" js/` returns
      matches **only** in `js/constants.js` (no magic strings in modules)
- [ ] `grep -n "transcribeStyle" js/api-client.js` → present (Step 3 landed)
- [ ] `grep -n "\.\.\.config" js/api-client.js` → no match (allow-list intact)
- [ ] `grep -o "verbatim-toggle\|verbatim-setting" index.html | wc -l` → `3`
- [ ] `npx vitest run` → 42 files pass; the new adapter, validation, persistence,
      and visibility tests exist and pass
- [ ] `npm run lint`, `npm run test:coverage`, and `npm run deps:check` exit 0
- [ ] `npm run test:browser` passes with `tests/browser/transcription-smoke.spec.js` unmodified
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt does not match the live code (drift since `dc45b1c`).
- After Step 4, a settings test **other than** the MAI 1.5 `it.each` case named
  in Steps 4 and 7c fails. Investigate before "fixing".
- The verbatim adapter test in 7a fails with the field absent even though Step 2
  looks correct — that means `transcribeStyle` is being stripped somewhere other
  than `validateConfig()`; report the location rather than adding a spread.
- `tests/browser/transcription-smoke.spec.js` goes red. The default path must be
  byte-identical; do not edit that file to make it pass.
- Making the toggle work appears to require an `APP_EVENTS` addition, a
  `css/styles.css` change, or edits to `js/user-menu.js`.
- Microsoft's contract turns out to be anything other than the literal
  `verbatim` string inside `enhancedMode` — this plan hard-codes that shape.
- You conclude the control belongs in the Settings panel, should be a dropdown,
  should commit via "Save changes", or should default to verbatim. Those are
  settled product decisions; report, do not redesign.

## Maintenance notes

- **Two independent gates, both deliberate.** `Settings.getModelConfig()` adds
  `transcribeStyle` only for MAI 1.5, and the adapter emits the field only on an
  exact `'verbatim'` match. The adapter-side gate is the real guarantee; the
  Settings-side one keeps the Whisper config shape clean. Keep both.
- **`js/api-client.js` is now the choke point.** Any future per-model request
  option must be added to the `validateConfig()` allow-list explicitly. If a new
  option ever appears to "not reach the adapter", this is the first place to
  look. Do not solve it with a spread.
- **The toggle bypasses draft/commit by design.** It writes on change like Noise
  Cancellation and theme. If Settings ever grows a global "discard draft"
  affordance, this control is deliberately outside it.
- If Microsoft adds further `transcribeStyle` values, widen
  `MAI_TRANSCRIBE_STYLES` and the adapter comparison together, and revisit
  whether a two-state switch is still the right control.
- **A reviewer should confirm**: with the toggle off, the MAI 1.5 request body
  is exactly `{"enhancedMode":{"enabled":true,"model":"mai-transcribe-1.5","task":"transcribe"}}`;
  the Whisper request is unchanged in every case; and no access token,
  Target URI, or transcript text appears in any new test fixture or log line.
- Plans 008 and 009 remain the historical record of the first attempt. If this
  feature is ever reverted again, revert *this* plan's commit — do not resurrect
  008.
