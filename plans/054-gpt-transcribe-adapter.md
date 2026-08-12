# Plan 054: Add the gpt-transcribe model adapter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- js/model-adapters/ js/constants.js`
> This plan REQUIRES plans 052 and 053 to have landed in your working tree
> (docs no longer say "exactly two adapters"; model UI renders from the
> registry; per-model size gate exists). If they have not, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/052-retire-two-adapter-invariant.md,
  plans/053-registry-driven-model-ui.md
- **Category**: direction
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

The maintainer deployed the Azure OpenAI `gpt-transcribe` model
(GlobalStandard, version 2026-07-28) on the same Azure AI Services resource
that already hosts the app's whisper deployment — same endpoint host pattern,
same `https://cognitiveservices.azure.com/.default` scope, same
`Authorization: Bearer` transport. This plan registers it as the third
transcription model. After plan 053, that means: one new adapter file, a
registry entry, a few constants, and tests — the UI (selects, Connection row,
panels, size gate) generates itself from the adapter's metadata.

## Current state

- `js/model-adapters/whisper.js` — the exemplar this adapter mirrors almost
  exactly (frozen object; `buildRequest` size check → FormData; whisper's
  Azure endpoint speaks the same `/audio/transcriptions` FormData protocol).
  As of plan 053 it also declares `maxUploadBytes`, `uploadLimitLabel`,
  `uploadLimitAppliesTo`, and a `uri` metadata block — copy that shape.
- `js/model-adapters/response-parsers.js` — `parseWhisperResponse` handles
  `string` and `{ text }` shapes. The Azure OpenAI transcription default
  response for gpt-transcribe is `{ text: "..." }` — **reuse
  `parseWhisperResponse`; do not write a new parser.**
- `js/model-adapters/index.js` — registry Map; insertion order carries no
  production semantics (plan 052).
- `js/constants.js` — `MODEL_TYPES` (~line 97), `STORAGE_KEYS` (~line 42),
  `WHISPER_MAX_UPLOAD_BYTES` (~line 110), `MESSAGES.SENDING_TO_WHISPER`
  (~line 503), `API_PARAMS`.
- Facts about the deployment (from the operator; do not hard-code any URI):
  deployment name `gpt-transcribe`, Azure OpenAI audio route, inline upload
  limit **25 MB** (same class as whisper), limit applies to the **source**
  upload. The user pastes their own Target URI in settings, exactly like the
  other models. Adapters MUST NOT contain credentials, URIs, or header
  construction (CLAUDE.md).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Focused | `npx vitest run tests/model-adapters.vitest.js` | all pass |
| Full suite | `npm run test:coverage` | all pass, thresholds met |
| Browser | `npm run test:browser` | all pass |
| Lint | `npm run lint` | exit 0 |
| NEVER | `npm run test:browser:live` | do not run (operator-gated, billable) |

## Scope

**In scope** (the only files you should modify):
- `js/model-adapters/gpt-transcribe.js` (create)
- `js/model-adapters/index.js`
- `js/constants.js`
- `tests/model-adapters.vitest.js`
- The plan-053 registry-driven test file (extend its fake-adapter proof to
  also assert the real third adapter renders)
- `spec/spec-design-api-client.md` — add one row to the adapter table

**Out of scope** (do NOT touch):
- `index.html`, `js/settings.js`, `js/ui.js`,
  `js/selected-audio-controller.js` — plan 053 made these registry-driven;
  needing to edit them means 053's contract has a gap (STOP condition).
- `tests/browser-live/` and the live-contract spec — registering the guarded
  live case needs a protected Target URI only the operator can provision.
  The hygiene test (plan 052 version) iterates the registry and WILL demand
  a guarded case for `gpt-transcribe`: add the spec entry it checks for as a
  placeholder ONLY if the hygiene test cannot otherwise pass — and if so,
  record that in your completion report. Do not invent URIs or secrets.
- `js/api-client.js`, auth modules.

## Git workflow

- Branch: `advisor/054-gpt-transcribe-adapter`
- Commit style: `feat(models): add gpt-transcribe adapter`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Constants

In `js/constants.js` add, following existing style exactly:

- `MODEL_TYPES.GPT_TRANSCRIBE: 'gpt-transcribe'`
- `STORAGE_KEYS.GPT_TRANSCRIBE_URI: 'gpt_transcribe_uri'`
- `GPT_TRANSCRIBE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;` next to
  `WHISPER_MAX_UPLOAD_BYTES`, with a doc comment citing the Azure OpenAI
  audio quickstart
- `MESSAGES.SENDING_TO_GPT_TRANSCRIBE: 'Sending to Azure GPT Transcribe API...'`

**Verify**: `npm run lint` → exit 0

### Step 2: The adapter

Create `js/model-adapters/gpt-transcribe.js`, mirroring
`js/model-adapters/whisper.js` structurally:

```js
export const gptTranscribeModelAdapter = Object.freeze({
    id: MODEL_TYPES.GPT_TRANSCRIBE,
    label: 'Azure GPT Transcribe',
    scope: COGNITIVE_SERVICES_SCOPE,
    storageKeys: Object.freeze({ uri: STORAGE_KEYS.GPT_TRANSCRIBE_URI }),
    maxUploadBytes: GPT_TRANSCRIBE_MAX_UPLOAD_BYTES,
    uploadLimitLabel: 'up to 25 MB',
    uploadLimitAppliesTo: 'source',
    uri: Object.freeze({
        rowId: 'gptTranscribeUri',
        inputId: 'gpt-transcribe-uri',
        badgeId: 'gpt-transcribe-uri-badge',
        title: 'GPT Transcribe Target URI',
        subtitle: 'Your Azure GPT Transcribe endpoint · HTTPS only',
        keywords: 'gpt transcribe target uri endpoint https azure connection openai'
    }),
    async buildRequest(audioBlob) {
        // size guard identical in shape to whisper's, using the GPT constant
        // FormData: append API_PARAMS.FILE with the whisper filename helper
        // Do NOT append a language field (unverified against this API; see
        // Maintenance notes)
        return { body: formData, statusMessage: MESSAGES.SENDING_TO_GPT_TRANSCRIBE };
    },
    parseResponse: parseWhisperResponse
});
```

(Element-id literals in the `uri` block follow the convention plan 053
established — if 053 centralized generated ids differently, match 053.)

**Verify**: `npm run lint` → exit 0

### Step 3: Register it

Add to `js/model-adapters/index.js`:

```js
import { gptTranscribeModelAdapter } from './gpt-transcribe.js';
...
[gptTranscribeModelAdapter.id, gptTranscribeModelAdapter]
```

Position: append last. Order carries no semantics (plan 052).

**Verify**: `npx vitest run tests/model-adapters.vitest.js` → existing tests pass

### Step 4: Tests

In `tests/model-adapters.vitest.js`, following the whisper adapter's test
pattern:

1. `buildRequest` on a small Blob → FormData contains the file part, no
   language part; statusMessage is the GPT message.
2. `buildRequest` on a >25 MB Blob → throws with
   `AUDIO_UPLOAD_LIMIT_ERROR_CODE`, `retryable === false`.
3. `parseResponse({ text: 'hi' })` → `'hi'` (via the shared parser).
4. `getScopeForModel('gpt-transcribe')` → the Cognitive Services scope
   (extends plan 051's real-registry test).
5. Extend the plan-053 registry-rendering test: both selects contain
   `gpt-transcribe`, a Connection row and both panels generate, and the
   selection-time gate fires TOO_LARGE for an oversized file.

**Verify**: `npm run test:coverage` → all pass, thresholds met

### Step 5: Spec row + full gates

Add the gpt-transcribe row to the adapter table in
`spec/spec-design-api-client.md` (model id, label, scope, storage key,
"original audio in `file`; default JSON response"). Run the full gate set.

**Verify**: `npm test && npm run lint && npm run test:browser && npm run size` → all pass

## Test plan

Covered in Step 4; ~5 new tests. The browser suite validates the generated
UI end to end with the third model present.

## Done criteria

- [ ] All gate commands above exit 0
- [ ] `modelAdapterRegistry.size === 3` asserted in a test
- [ ] Selecting `gpt-transcribe` in the generated UI shows its Connection
      row and panels (covered by the extended 053 test or browser suite)
- [ ] No adapter file contains a real URI, credential, or header construction
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 052/053 are not in the working tree (drift check).
- Completing the feature requires editing `index.html`, `js/settings.js`,
  `js/ui.js`, or `js/selected-audio-controller.js` — that is a gap in 053's
  contract; report the gap.
- The hygiene test demands live-contract entries that cannot be satisfied
  without inventing protected names — report exactly what it demands.

## Maintenance notes

- **Language field deliberately omitted**: whisper sends `language=en`; the
  gpt-transcribe API's support for that field is unverified here. First live
  transcription (operator-run) should confirm; if accents/language detection
  misbehave, adding `language` to `buildRequest` is a one-line follow-up.
- **Live contract**: the operator must provision a protected
  `AZURE_GPT_TRANSCRIBE_TARGET_URI` and a guarded live case before this model
  is exercised in `test:browser:live` — tracked outside this plan.
- The deployment currently has 10 GlobalStandard capacity units; billing is
  per token. Nothing in the app needs to know that.
