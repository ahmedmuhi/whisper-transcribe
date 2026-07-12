# Plan 019: Make adapter metadata authoritative for credential storage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 382e9ff..HEAD -- js/settings.js js/model-adapters/index.js js/model-adapters/whisper.js js/model-adapters/whisper-translate.js js/model-adapters/mai-transcribe.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js tests/model-adapters.vitest.js CLAUDE.md spec/spec-design-api-client.md`
> If any listed file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. A semantic
> mismatch in adapter registration, credential persistence, or the Settings
> test fixtures is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (Plans 013 and 016–018 are already merged)
- **Category**: tech-debt
- **Planned at**: commit `382e9ff`, 2026-07-12

## Why this matters

Every registered model adapter already declares the localStorage keys for its
URI and API key, but `Settings` ignores that metadata and independently maps
models to the same keys with MAI-versus-Whisper branches. The two mappings can
drift: a future adapter can be fully registered for requests yet silently read
or write the wrong credential namespace in Settings. Make adapter
`storageKeys` the single source of truth for the **model-to-credential-key
mapping**, while keeping `STORAGE_KEYS` as the single source of truth for the
literal persisted strings. This is an internal refactor: existing key names,
saved data, validation, UI behavior, events, and request behavior must not
change.

## Current state

### Adapter metadata exists and is complete

All three registered adapters already provide `{ apiKey, uri }` metadata.
Whisper Translate deliberately shares the standard Whisper credential slot.

`js/model-adapters/whisper.js:8-14`:

```js
export const whisperModelAdapter = {
    id: MODEL_TYPES.WHISPER,
    label: 'Azure Whisper',
    storageKeys: {
        apiKey: STORAGE_KEYS.WHISPER_API_KEY,
        uri: STORAGE_KEYS.WHISPER_URI
    },
```

`js/model-adapters/whisper-translate.js:8-14` has the same two storage values,
and `js/model-adapters/mai-transcribe.js:9-16` creates MAI adapters with:

```js
storageKeys: {
    apiKey: STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY,
    uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
},
```

The registry is a `Map` in `js/model-adapters/index.js:9-14`. Its insertion
order is a response-parser contract and must not change:

```js
export const modelAdapterRegistry = new Map([
    [maiTranscribe15ModelAdapter.id, maiTranscribe15ModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter],
    [whisperTranslateModelAdapter.id, whisperTranslateModelAdapter]
]);
```

### Settings duplicates the mapping

`js/settings.js` imports `STORAGE_KEYS` but not the adapter registry. It chooses
credential keys independently in three places:

1. `loadSettingsToForm()` directly reads both namespaces
   (`js/settings.js:491-514`):

   ```js
   const whisperUri = localStorage.getItem(STORAGE_KEYS.WHISPER_URI);
   const whisperKey = localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY);
   // ...
   const maiUri = localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI);
   const maiKey = localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY);
   ```

2. `saveSettings()` branches on `_isMaiModel()` to select the write keys
   (`js/settings.js:613-626`).
3. `getModelConfig()` uses two MAI-versus-Whisper ternaries to select the read
   keys (`js/settings.js:696-703`).

Those direct credential-key references must disappear from `js/settings.js`.
References to other application keys such as `STORAGE_KEYS.MODEL`,
`RECORDING_ENVIRONMENT`, `INPUT_DEVICE`, and `SIDEBAR_PINNED` remain correct;
they are not model-adapter metadata.

### UI-family branching is separate and stays

`Settings._isMaiModel()` is also used to choose visible form sections, active
DOM inputs, and API-key validation rules (`js/settings.js:445-453,529-534,
557-571`). Those branches describe the current UI and validation families,
not credential persistence. Keep them unchanged. In particular, the existing
unit test that an unknown model falls back to Whisper **inputs** remains a UI
helper contract; it does not authorize unknown models to use Whisper
**storage**.

### Existing test and dependency-injection conventions

- `AzureAPIClient` accepts a registry in its constructor and stores it on the
  instance (`js/api-client.js:25-35`). Match this pattern in `Settings` so tests
  can prove metadata is consumed without mutating the singleton registry.
- `tests/settings-persistence.vitest.js` owns localStorage save/load and
  `getModelConfig()` behavior. It uses `createLocalStorageMock()` and real
  `Settings` instances.
- `tests/model-adapters.vitest.js:104-152` already injects a fake registry into
  `AzureAPIClient`; its fake adapter includes `storageKeys`. Add the general
  adapter-metadata invariant next to this registry coverage.
- The application is a no-build ES-module browser app with zero runtime
  dependencies. `js/main.js` must continue to construct `new Settings()` with
  no arguments.

### Architectural constraints

- `CLAUDE.md` says model-specific behavior belongs in registered adapters and
  new model types should not create branches elsewhere.
- `plan/2.0-design.md:17-28` requires a single source of truth and no new
  runtime dependencies.
- `spec/spec-design-api-client.md:168-180` documents the adapter registry as
  the model extension seam. The adapter contract currently omits the fact that
  Settings consumes `storageKeys`; update the spec when the refactor lands.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused settings/adapter tests | `npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js tests/model-adapters.vitest.js` | all tests pass (baseline: 69 before this plan) |
| Full tests | `npm test` | all tests pass (baseline: 342) |
| Coverage | `npm run test:coverage` | exit 0; thresholds remain statements 85 / branches 80 / functions 70 / lines 85 |
| Browser startup/integration | `npm run test:browser` | Chromium smoke passes |
| Lint | `npm run lint` | exit 0 |
| Full dead-code check | `npm run deps:check` | exit 0 |
| Production dependency check | `npm run deps:check:prod` | exit 0 |
| Size | `npm run size` | exit 0 and remains below 100 kB |

Fresh worktrees do not share `node_modules`. Run `npm ci` first only if the
focused test command cannot resolve local tooling.

## Scope

**In scope** (the only files the executor may modify):

- `js/settings.js`
- `tests/settings-persistence.vitest.js`
- `tests/model-adapters.vitest.js`
- `CLAUDE.md`
- `spec/spec-design-api-client.md`
- `plans/README.md` (status only)

**Read-only evidence** (inspect but do not modify):

- `js/constants.js`
- `js/model-adapters/index.js`
- `js/model-adapters/whisper.js`
- `js/model-adapters/whisper-translate.js`
- `js/model-adapters/mai-transcribe.js`
- `js/api-client.js`
- `js/main.js`
- `tests/settings-unit.vitest.js`
- `tests/settings-workflow.vitest.js`
- `plan/2.0-design.md`

**Out of scope**:

- Changing any localStorage key string or adding a migration. Existing browser
  data must continue to work without rewriting.
- Adding, removing, reordering, or changing request/response behavior of model
  adapters.
- Refactoring `AzureAPIClient._getModelAdapter()` or its dependency injection.
- Generalizing model-specific form containers, DOM inputs, or key validation
  into more adapter metadata. They are UI/product contracts, not this storage
  mapping.
- Removing `_isMaiModel()`; it remains required for visibility, active inputs,
  and validation.
- Surfacing Whisper Translate in the UI or adding configurable language.
- Consolidating Settings/API sanitizers.
- Removing emit-only domain/lifecycle events or `cancelRecording`.
- TranscriptStore/history work, Playwright restructuring, toolchain upgrades,
  or unrelated cleanup found while editing Settings.
- Running the live-Azure workflow; the deterministic Chromium smoke is enough
  for this behavior-preserving refactor.

## Git workflow

- Branch: `refactor/019-adapter-storage-keys`
- Commit: `refactor: use adapter credential storage metadata`
- Keep implementation, tests, and the small architecture-doc updates in one
  atomic commit; they describe one contract change.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Pin the adapter metadata contract

In `tests/model-adapters.vitest.js`:

1. Import `modelAdapterRegistry` from `js/model-adapters/index.js` and
   `STORAGE_KEYS` from constants (extend the existing constants import).
2. Add one registry-level test that iterates every registered adapter and
   asserts:
   - `adapter.id` equals its `Map` key;
   - `storageKeys` has non-empty string `apiKey` and `uri` properties.
3. Also pin the intentional sharing topology:
   - Whisper and Whisper Translate both use `WHISPER_API_KEY` / `WHISPER_URI`;
   - MAI-Transcribe 1.5 uses `MAI_TRANSCRIBE_API_KEY` /
     `MAI_TRANSCRIBE_URI`.

Do not change registry insertion order or adapter objects to make the test
pass; the current adapters already satisfy this contract.

**Verify**: `npx vitest run tests/model-adapters.vitest.js` → all existing
tests plus the new metadata-contract test pass.

### Step 2: Prove Settings consumes injected metadata

In `tests/settings-persistence.vitest.js`, add focused tests before changing
production code:

1. Create a fake model id and a fake adapter registry `Map` whose adapter has
   unique credential keys such as `custom_model_api_key` and
   `custom_model_uri`. The adapter needs only `id` and `storageKeys`; Settings
   must not depend on request-builder/parser methods.
2. Configure the test's saved model and mock form selectors to use the fake
   id. Use the Whisper input elements and a valid 32-character hexadecimal key
   because input/validation-family behavior is intentionally outside this
   plan.
3. Construct `new Settings(fakeRegistry)` and prove both directions:
   - `saveSettings()` writes URI/API key to the fake adapter's keys and does
     not write them to the built-in Whisper or MAI credential keys;
   - `getModelConfig()` reads the values through the same fake keys and
     returns `{ model, apiKey, uri }` unchanged.
4. Add one fail-closed test for an adapter with missing/incomplete
   `storageKeys`. Arrange a valid built-in model during construction, then
   select the broken model before invoking the credential resolver or
   `getModelConfig()` so constructor initialization is not the subject. Assert
   a clear error naming the model and missing credential-storage metadata.
5. Destroy every additional `Settings` instance in `finally`/cleanup so event
   listeners and timers do not leak.

These tests must fail against the current hard-coded Settings implementation;
otherwise they do not prove the refactor.

**Verify**: `npx vitest run tests/settings-persistence.vitest.js` → the new
metadata-consumption tests fail for the expected reason before Step 3, then
pass after Steps 3–5. Existing real Whisper and MAI persistence cases must stay.

### Step 3: Inject the adapter registry into Settings

In `js/settings.js`:

1. Import `modelAdapterRegistry` from `./model-adapters/index.js`.
2. Change the constructor to accept an optional
   `adapterRegistry = modelAdapterRegistry`, store it as
   `this.adapterRegistry`, and update the constructor JSDoc.
3. Do not change `js/main.js`; its existing `new Settings()` call must use the
   default registry.

This mirrors `AzureAPIClient`'s existing constructor injection and makes the
storage mapping testable without mutating a global singleton.

**Verify**: run the focused three-file command. Existing tests may still pass,
while the new fake-registry persistence assertions remain red until Step 4.

### Step 4: Add one strict credential-key resolver

Add a private helper in `Settings`, named `_getCredentialStorageKeys(model)`:

1. Resolve the adapter with `this.adapterRegistry.get(model)`.
2. Read `adapter.storageKeys` and validate that both `apiKey` and `uri` are
   non-empty strings.
3. Return exactly `{ apiKey, uri }` (or the existing metadata object without
   mutation).
4. If the adapter is absent or metadata is incomplete, throw a clear error
   that names the model and says credential storage metadata is missing. Never
   fall back to Whisper keys: silently crossing credential namespaces is the
   drift this plan removes.

Do not log keys or credential values. The key **names** are configuration
metadata, but error messages still only need the model id.

**Verify**: the fail-closed test from Step 2 passes. Existing
`_getActiveInputs()` unknown-model behavior in `tests/settings-unit.vitest.js`
still passes because that helper is intentionally independent.

### Step 5: Route every credential read/write through metadata

Refactor only credential persistence in `js/settings.js`:

1. Add a small helper for loading one model's stored credentials into supplied
   cached inputs, or perform equivalent clear calls through
   `_getCredentialStorageKeys(model)`.
2. In `loadSettingsToForm()`, load the visible Whisper fields via
   `MODEL_TYPES.WHISPER` metadata and the visible MAI fields via
   `MODEL_TYPES.MAI_TRANSCRIBE_1_5` metadata. Continue loading both groups when
   the modal opens so switching models in the modal preserves the current UX.
   Do not separately load Whisper Translate: it deliberately shares the
   Whisper keys and has no visible settings group.
3. In `saveSettings()`, replace the credential-storage `isMai` branch with one
   metadata lookup for `currentModel`, then write the URI and API key using the
   returned keys. Keep the `_isMaiModel()` uses involved in input selection and
   validation.
4. In `getModelConfig()`, resolve the selected model's metadata and read both
   credential values from it.
5. Preserve `STORAGE_KEYS.MODEL`, recording-environment persistence, all event
   payloads/order, modal behavior, and public return shapes exactly.

After this step, this command must print nothing:

```bash
rg -n 'STORAGE_KEYS\.(WHISPER_URI|WHISPER_API_KEY|MAI_TRANSCRIBE_URI|MAI_TRANSCRIBE_API_KEY)' js/settings.js
```

**Verify**: `npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js` → all tests pass, including fake metadata, real Whisper/MAI persistence, UI-family selection, validation, and DOM caching.

### Step 6: Document the adapter storage contract

1. In `CLAUDE.md`'s **Model adapters** paragraph, state that each registered
   adapter's `storageKeys` maps that model to its credential namespace and is
   consumed by Settings. Preserve the warning that registry insertion order
   controls response parse precedence.
2. In `spec/spec-design-api-client.md`, add a compact adapter interface/contract
   near the model-specific interface section. Document required `id`, `label`,
   `storageKeys.apiKey`, `storageKeys.uri`, `buildRequest`, and `parseResponse`
   fields. State that `STORAGE_KEYS` owns literal persisted values and adapter
   metadata owns model-to-key association.
3. Do not expand this into a Settings specification rewrite or change product
   claims in README.

**Verify**:

```bash
rg -n 'storageKeys' CLAUDE.md spec/spec-design-api-client.md
```

Expected: both files describe the Settings-consumed credential mapping.

### Step 7: Run all gates and audit scope

Run every command in the command table, then:

```bash
git diff --check
git status --short
git diff --stat
git diff --name-only -- js
```

Expected production diff: only `js/settings.js`. Expected total diff: only the
five implementation/test/doc files in Scope plus the plan status row. Review
the full diff and confirm no credential value, localStorage key string, event
payload, adapter order, or model selection behavior changed.

## Test plan

| Contract | Required evidence |
|---|---|
| Registry completeness | Every registered adapter has non-empty URI/API-key storage metadata and its id matches the Map key |
| Sharing topology | Whisper Translate shares Whisper keys; MAI uses its distinct existing keys |
| Metadata-driven save | Injected fake adapter causes Settings to write only the fake keys |
| Metadata-driven load/config | Injected fake adapter causes Settings to read the fake keys and return the unchanged config shape |
| Fail closed | Missing adapter metadata produces an explicit model-named error, never Whisper fallback |
| Regression | Existing Whisper/MAI form load, save, retrieval, validation, events, and model reset tests remain green |
| Real browser | Chromium smoke proves the changed startup module graph and normal persisted-transcription path still initialize |

## Done criteria

- [ ] `Settings` accepts an optional adapter registry and defaults to
  `modelAdapterRegistry`; `new Settings()` remains valid.
- [ ] All credential URI/API-key reads and writes in `js/settings.js` resolve
  keys through adapter `storageKeys`.
- [ ] No direct Whisper/MAI credential-key reference remains in
  `js/settings.js` (the exact `rg` command in Step 5 returns no matches).
- [ ] Literal values in `STORAGE_KEYS` are unchanged; no storage migration is
  added.
- [ ] `_isMaiModel()` remains in use for UI visibility, active inputs, and
  validation only—not credential persistence.
- [ ] Fake-registry tests prove Settings consumes metadata for both save and
  retrieval; incomplete metadata fails closed.
- [ ] Registry tests pin metadata completeness and the intentional
  Whisper/Translate sharing topology.
- [ ] `CLAUDE.md` and the API-client spec document the adapter storage contract.
- [ ] Focused tests, full Vitest, coverage, deterministic Chromium smoke, lint,
  both Knip checks, and size budget all pass.
- [ ] No runtime dependency, public event/API shape, adapter order, request
  behavior, or file outside Scope changes.

## STOP conditions

Stop and report back if:

- Any registered adapter lacks complete `{ apiKey, uri }` metadata at execution
  time; do not invent or migrate keys inside this plan.
- Importing the registry into `settings.js` creates a circular-dependency or
  module-initialization failure.
- Existing browser data would require a localStorage migration or key rename.
- The fake-registry test cannot be made to fail against the old hard-coded
  implementation without altering unrelated UI/validation behavior.
- Passing the focused suite requires changing `js/main.js`, `js/api-client.js`,
  any adapter, constants, DOM markup, event contracts, or sanitization rules.
- Browser smoke exposes a startup or module-graph regression and still fails
  after one direct in-scope correction.
- Any verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- A future model adapter must declare complete credential `storageKeys`; the
  registry test is the enforcement point.
- Sharing storage metadata is intentional for Whisper and Whisper Translate.
  If they later require different credentials, change adapter metadata and add
  a product-level migration plan rather than branching in Settings.
- UI grouping is still explicitly two-family. A future model with a new form or
  validation shape will require a separate UI design/refactor; do not overload
  `storageKeys` with DOM or validation metadata casually.
- Keep `STORAGE_KEYS` in `constants.js` as the only owner of persisted string
  literals. Adapter objects should reference those constants, not inline key
  strings.
- Emit-only lifecycle/domain events, duplicated sanitizers, and
  `cancelRecording` were deliberately excluded from Plan 013 and remain
  separate contracts/refactors after this plan.
