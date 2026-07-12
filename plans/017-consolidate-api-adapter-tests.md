# Plan 017: Consolidate API validation, adapter, and retry tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 86987bd..HEAD -- tests/api-client-validation.vitest.js tests/api-client-errors.vitest.js tests/mai-transcribe.vitest.js tests/model-adapters.vitest.js tests/response-parsers.vitest.js js/api-client.js js/model-adapters`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tests, tech-debt
- **Planned at**: commit `86987bd`, 2026-07-12

## Why this matters

The API tests currently repeat the same configuration failures, built-in
adapter request shapes, and response-parser cases across three files. The
duplication makes contract changes expensive and obscures the genuinely unique
retry behavior. This plan gives each layer one owner: direct configuration in
`api-client-validation`, transcribe/error/retry orchestration in
`api-client-errors`, built-in adapter integration in `model-adapters`, and pure
shape parsing in `response-parsers`.

## Current state

- `js/api-client.js:404-450` normalizes configuration and has four failure
  branches: missing key, unsafe key, missing URI, invalid URI, plus a separate
  HTTPS-protocol rejection. Each failure emits `API_CONFIG_MISSING` before
  throwing.

- `tests/api-client-validation.vitest.js` has 17 tests. The early direct tests
  already assert both thrown error and event payload, but the final
  `Event Emission on Configuration Issues` block repeats three of those cases.
  Valid configuration is likewise repeated across generic, Whisper, MAI,
  HTTPS, and key sections.

- `tests/api-client-errors.vitest.js:159-240` repeats direct `validateConfig()`
  event assertions. Its valuable boundary tests call `transcribe()` and prove
  no request is sent for invalid credentials or insecure HTTP endpoints; those
  must remain.

- `tests/model-adapters.vitest.js:154-270` already verifies full Whisper,
  Whisper Translate, and MAI request/response behavior. The MAI case asserts
  the subscription header, WAV filename/type, `definition`, absence of legacy
  fields, conversion, progress messages, and response precedence.

- `tests/mai-transcribe.vitest.js` repeats those adapter and parser contracts.
  Its unique value is retry behavior, especially the 429 → 200 recovery with
  `Retry-After` at current lines 205-220.

- `tests/model-adapters.vitest.js:272-303` repeats the immediately preceding
  MAI 1.5 test with the same model, header, fields, conversion, and progress
  assertions.

- `tests/response-parsers.vitest.js` is the canonical pure-parser suite and
  must remain. `tests/browser/transcription-smoke.spec.js` remains the real
  browser multipart/worker/CORS integration and is not part of this plan.

- The successful-retry gap recorded in the old plans index is obsolete:
  `tests/mai-transcribe.vitest.js:205-220` already tests retryable response →
  success, two fetches, `Retry-After`, progress, and returned text. Preserve
  that contract while moving it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline inventory | `npx vitest list --json | jq 'length'` | prints `393` before edits |
| Validation | `npx vitest run tests/api-client-validation.vitest.js` | all canonical validation cases pass |
| API orchestration | `npx vitest run tests/api-client-errors.vitest.js` | all error/retry cases pass |
| Adapter/parser | `npx vitest run tests/model-adapters.vitest.js tests/response-parsers.vitest.js` | all adapter/parser cases pass |
| Full tests | `npm test` | all tests pass |
| Coverage | `npm run test:coverage` | exits 0 with existing thresholds |
| Lint | `npm run lint` | exits 0 |
| Dependency check | `npm run deps:check:prod` | exits 0 |
| Size | `npm run size` | exits 0 |

## Scope

**In scope** (the only files you should modify):

- `tests/api-client-validation.vitest.js`
- `tests/api-client-errors.vitest.js`
- `tests/mai-transcribe.vitest.js` (delete after unique retry coverage moves)
- `tests/model-adapters.vitest.js`
- `plans/README.md` (status only)

**Read-only evidence**:

- `js/api-client.js`
- `js/model-adapters/**`
- `tests/response-parsers.vitest.js`

**Out of scope**:

- Any production JavaScript change.
- Changing retry counts, timeouts, backoff, error text, request fields, model
  identifiers, parser precedence, or validation semantics.
- Worker/converter testing; shared WAV encoding and browser execution are
  already covered elsewhere.
- Playwright specs/configuration and live Azure workflow.
- Vitest configuration or environment migration.

## Git workflow

- Branch: `test/017-api-adapter-test-consolidation`
- Use one logical commit: `test: consolidate API adapter coverage`.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Record the baseline and map every duplicate to its survivor

Run:

```bash
npx vitest list --json | jq 'length'
npx vitest list --json | jq -r '.[] | select(.file|test("(api-client-validation|api-client-errors|mai-transcribe|model-adapters|response-parsers)")) | (.file|split("/")[-1])+" :: "+.name'
```

Expected: `393`, followed by the current test titles. Use this inventory while
editing. Do not delete a behavior unless this plan names its survivor or moves
it first.

### Step 2: Make `api-client-validation` the single direct-validation contract

Refactor `tests/api-client-validation.vitest.js` without changing production:

1. Keep one valid-configuration test that asserts the complete normalized
   `{model, apiKey, uri}` result and absence of `API_CONFIG_MISSING`.
2. Keep model identity coverage for MAI only if the valid test is table-driven
   across Whisper and MAI; do not retain separate generic/Whisper/MAI tests that
   assert only `.model`.
3. Replace repeated negative tests with one `it.each` table whose title contains
   a case label so every runtime test has a unique name. Cover exactly:
   - empty API key → `API_KEY_REQUIRED`, `missing: 'apiKey'`;
   - null API key → same contract;
   - unsafe/non-visible API-key character →
     `INVALID_API_KEY_CHARACTERS`, `missing: 'validApiKey'`;
   - empty URI → `URI_REQUIRED`, `missing: 'uri'`;
   - URI without a protocol/malformed URI → `INVALID_URI_FORMAT`,
     `missing: 'validUri'`;
   - `http:` URI → `URI_MUST_BE_HTTPS`, `missing: 'httpsUri'`.
4. Every negative row must assert both the thrown message and the exact
   `API_CONFIG_MISSING` payload including model. This replaces the entire final
   `Event Emission on Configuration Issues` block.
5. Retain one normalization case containing whitespace/invisible artifacts in
   both key and URI; assert the returned config is sanitized. Do not replicate
   the Settings form sanitizer matrix from Plan 016.

Avoid mocked `global.URL` when a real invalid URL string exercises the same
branch. Restore any global modified by a test.

**Verify**: `npx vitest run tests/api-client-validation.vitest.js` → all cases
pass and Vitest prints unique case names.

### Step 3: Remove direct-validation duplication from `api-client-errors`

In the `Configuration Validation Errors` section of
`tests/api-client-errors.vitest.js`:

- Keep the transcribe-boundary tests that prove invalid configuration prevents
  `fetch`: missing configuration (one representative is sufficient), unsafe
  header characters, and insecure `http:` URI.
- Delete direct `validateConfig()` repetitions named:
  - `should emit event when validateConfig is called with missing API key`;
  - `should emit event when validateConfig is called with missing URI`;
  - `should emit event when validateConfig is called with invalid URI format`;
  - `should reject an insecure (http) URI in validateConfig`.
- If both missing-key and missing-URI transcribe tests assert the same
  short-circuit shape, retain them only when they assert distinct public error
  messages/events; otherwise use a labelled `it.each` table. Do not remove the
  no-`fetch` assertion.

**Verify**:

```bash
npx vitest run tests/api-client-validation.vitest.js tests/api-client-errors.vitest.js
```

Expected: all direct validation branches and all public no-network boundaries
remain covered.

### Step 4: Move the unique retry contracts before deleting the MAI duplicate suite

Move the unique retry behavior from `tests/mai-transcribe.vitest.js` into a
clearly named `Retry status behavior` section in
`tests/api-client-errors.vitest.js`:

1. Preserve the 429 → success case: first response 429 with `Retry-After: 1`,
   second response 200; assert returned transcript, two fetches, `_sleep(1000)`,
   retry progress text, `API_REQUEST_SUCCESS`, and no `API_REQUEST_ERROR`.
2. Preserve the exhausted-429 message case only if its `Retry-After` detail is
   not already asserted by the existing rate-limit test. Prefer strengthening
   the existing test over adding a near-duplicate.
3. Strengthen the existing non-retryable 400 test to assert one fetch and no
   sleep; do not move a second 400 test solely to retain the old file.

Use the generic API client fixtures in `api-client-errors.vitest.js`. The retry
algorithm is adapter-independent; do not keep MAI-only setup just for retry.

**Verify**: `npx vitest run tests/api-client-errors.vitest.js` → the recovery,
exhaustion, non-retry, deadline, and timeout paths all pass.

### Step 5: Remove adapter/parser/validation duplication

In `tests/model-adapters.vitest.js`, delete only
`keeps MAI-Transcribe 1.5 request shape with the 1.5 API model` at current
lines 272-303. The immediately preceding `keeps the existing MAI-Transcribe
request and parsed text behavior` uses the same 1.5 model and asserts every
request property plus response precedence.

Then delete `tests/mai-transcribe.vitest.js` entirely. Before deletion, verify
the following ownership map:

| Old MAI suite behavior | Surviving owner |
|---|---|
| subscription header, `audio`, `definition`, WAV filename/type, absent legacy fields, progress | `model-adapters.vitest.js` comprehensive MAI case |
| Whisper header/no conversion | comprehensive Whisper adapter case |
| combined phrases, Whisper text/JSON, precedence, empty/unknown shapes | `model-adapters.vitest.js` plus `response-parsers.vitest.js` |
| MAI config accepted / missing key rejected | canonical `api-client-validation.vitest.js` matrix |
| retry recovery/exhaustion/non-retry | moved/strengthened `api-client-errors.vitest.js` cases |

**Verify**:

```bash
test ! -e tests/mai-transcribe.vitest.js
npx vitest run tests/model-adapters.vitest.js tests/response-parsers.vitest.js tests/api-client-validation.vitest.js tests/api-client-errors.vitest.js
```

Expected: deleted file absent; all four surviving suites pass.

### Step 6: Run all gates and inspect the final inventory

Run all full commands from the command table, followed by:

```bash
npx vitest list --json | jq 'length'
git status --short
git diff --check
git diff --stat
```

Expected: the total is below 393 because duplicate runtime cases were removed;
all gates pass; only in-scope test files and the plans status row changed. Do
not chase a target count by deleting additional coverage.

## Test plan

- Direct validation: labelled valid/invalid matrix with result, thrown error,
  and exact event payload.
- Public boundary: invalid configuration never reaches `fetch`.
- Retry: 429 → 200 success, exhausted 429, non-retryable 400, existing deadline
  and AbortController cases.
- Adapters: one comprehensive integration test per registered built-in model.
- Parsers: retain the focused pure-parser suite unchanged.

## Done criteria

- [ ] `tests/mai-transcribe.vitest.js` is deleted only after every behavior in the ownership map survives.
- [ ] Direct validation cases have unique labelled names and assert both error and event payload.
- [ ] At least one transcribe-boundary invalid-config test proves `fetch` is not called.
- [ ] The 429 → success case proves two attempts, Retry-After sleep, success event, and no error event.
- [ ] Exactly one comprehensive MAI 1.5 adapter contract remains in `model-adapters.vitest.js`.
- [ ] No production JavaScript is modified.
- [ ] `npm test`, `npm run test:coverage`, `npm run lint`, `npm run deps:check:prod`, and `npm run size` exit 0.
- [ ] Coverage thresholds/configuration are unchanged.
- [ ] No files outside Scope are modified, except `plans/README.md` status.

## STOP conditions

Stop and report back if:

- Any `mai-transcribe.vitest.js` behavior lacks the named surviving owner.
- Retry behavior differs by adapter in production code.
- The 429 → success test cannot be moved without changing production.
- Consolidation changes an error message, event payload, retry count, request
  field, parser precedence, or model identifier.
- Coverage falls below existing thresholds.
- A verification fails twice after a reasonable correction.

## Maintenance notes

- New adapters belong in `model-adapters.vitest.js`; parser edge shapes belong
  in `response-parsers.vitest.js`; retry behavior belongs in
  `api-client-errors.vitest.js`.
- Do not restore a model-named integration file unless that model introduces a
  genuinely adapter-specific orchestration contract not expressible in the
  existing adapter suite.
- The real browser multipart/WAV/worker contract remains owned by Playwright;
  do not duplicate it with larger JavaScript mocks.
