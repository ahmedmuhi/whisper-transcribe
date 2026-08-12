# Plan 051: Test the auth token guards, logout fail-closed branches, real registry lookups, and staleness guards

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- js/authentication-service.js js/auth-interaction-controller.js js/api-client.js js/selected-audio-controller.js tests/`
> If any in-scope production file changed since this plan was written, compare
> the "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive tests only — zero production-code changes)
- **Depends on**: none (recommended before plan 053's refactor)
- **Category**: tests
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

Coverage is 94% overall, but the uncovered 6% is concentrated in exactly the
guards that protect the app's two hardest invariants: (1) no malformed or
absent MSAL result may become a `Bearer` header or leak MSAL detail in an
error, and (2) a failed download/discard must never fall through to a
redirect or logout. Additionally, every consumer test stubs
`getScopeForModel`, so no test proves the real adapter registry returns the
real scope — a classic mock-tests-the-mock gap. These tests are the safety
net plans 053/054 (registry refactor + new adapter) will rely on.

**This plan adds tests only. If any new test fails against current
production code, that is a STOP condition — report the failure, do not
"fix" production code.**

## Current state

### A. AuthenticationService token guards — `js/authentication-service.js:79-96`

```js
async getAccessToken(scope) {
    if (this.#state !== AUTHENTICATION_STATES.READY) {
        throw this.#createSafeTokenError(this.#state);
    }
    const account = this.#client.getActiveAccount();
    if (!account) {
        throw this.#createSafeTokenError(
            this.#setState(AUTHENTICATION_STATES.SIGNED_OUT)
        );
    }
    ...
    if (typeof authenticationResult?.accessToken !== 'string' || !authenticationResult.accessToken) {
        throw this.#createSafeTokenError(AUTHENTICATION_STATES.AUTHENTICATION_ERROR);
    }
```

None of these three throw-paths executes in any test. The analogous
`ensureTokenReady` early-returns (lines 61–65) are likewise uncovered.
Existing harness: `tests/authentication-service.vitest.js` (MSAL client fake
from ~line 284; the rejected-promise path is covered at ~line 348 — follow
its pattern).

### B. AuthInteractionController fail-closed branches — `js/auth-interaction-controller.js:50-99`

```js
try {
    if (!this.audioSafety.downloadUnsentRecording()) {
        return { state: AUTH_RECOVERY_STATES.BLOCKED };
    }
} catch {
    return { state: AUTH_RECOVERY_STATES.BLOCKED };
}
```

The `false`-return and throw branches of `downloadUnsentRecording` and
`discardUnsentRecording` (both the redirect and logout variants), the
`confirmDiscard` *throwing* case, and the post-discard "still not SAFE"
recheck are all uncovered. Existing harness:
`tests/auth-recovery.vitest.js` builds the real controller with an injected
`audioSafety` stub (~line 55) — these tests are stub-return variations.

### C. Real registry lookups — `js/api-client.js:398-416`

```js
_getModelAdapter(model) {
    const adapter = this.adapterRegistry.get(model);
    if (!adapter) {
        throw new Error(`Unsupported transcription model: ${model}`);
    }
    return adapter;
}
getScopeForModel(model) {
    return this._getModelAdapter(model).scope;
}
```

`getScopeForModel` is stubbed in every consumer test
(`tests/audio-handler-integration.vitest.js:148`,
`tests/recording-integration.vitest.js:284`, `tests/selected-audio.vitest.js:49`,
`tests/discard-flow.vitest.js:36`) and never tested against the real
registry. The unsupported-model throw is uncovered.

### D. SelectedAudioController staleness guards — `js/selected-audio-controller.js:193-230`

```js
if (file !== this.#file || generation !== this.#generation) return false;
...
const text = await this.#api.transcribe(file, ...);
if (file !== this.#file || generation !== this.#generation) return false;
eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, { text });
```

All three staleness early-returns are uncovered — nothing verifies that
removing/replacing the File mid-transcribe suppresses the stale
`UI_TRANSCRIPTION_READY`. `destroy()` (line ~312) is never called in any test.
Existing harness: `tests/selected-audio.vitest.js`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| One file | `npx vitest run tests/<name>.vitest.js` | all pass |
| Full suite + coverage | `npm run test:coverage` | all pass, thresholds met |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify — all test files):
- `tests/authentication-service.vitest.js`
- `tests/auth-recovery.vitest.js`
- `tests/model-adapters.vitest.js`
- `tests/selected-audio.vitest.js`

**Out of scope** (do NOT touch):
- ANY file under `js/` — this plan is additive tests only.
- `tests/browser/`, `tests/browser-live/`.
- Existing passing assertions — do not rewrite or delete any.

## Git workflow

- Branch: `advisor/051-auth-boundary-tests`
- Commit style: e.g. `test(auth): cover token-guard and fail-closed logout branches`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: AuthenticationService guard tests

In `tests/authentication-service.vitest.js`, in the token/redirect-boundary
describe, add:

1. State not READY → `getAccessToken('scope')` rejects; error message equals
   the safe categorized message (assert exact equality with the MESSAGES
   constant used by `#createSafeTokenError`) and contains no token-shaped
   substring.
2. `getActiveAccount()` → null → rejects; state observed as SIGNED_OUT.
3. `acquireTokenSilent` resolving `{}` → rejects safely.
4. `acquireTokenSilent` resolving `{ accessToken: 123 }` → rejects safely.
5. Same-shape cases for `ensureTokenReady`: not-READY returns current state;
   null account returns SIGNED_OUT; `{}` result returns AUTHENTICATION_ERROR.

**Verify**: `npx vitest run tests/authentication-service.vitest.js` → all pass

### Step 2: AuthInteractionController fail-closed tests

In `tests/auth-recovery.vitest.js`, parameterize the `audioSafety` stub:

1. `downloadUnsentRecording` returns `false` → `{ state: BLOCKED }`, redirect
   spy not called.
2. `downloadUnsentRecording` throws → BLOCKED, no redirect.
3. `discardUnsentRecording` returns `false` / throws → BLOCKED, no redirect —
   in BOTH `discardUnsentAndContinue` and the logout variant.
4. `confirmDiscard` throws → BLOCKED (distinct from resolving `false` →
   CANCELLED, already covered).
5. Post-discard recheck: `getAudioSafetyState` still returns UNSENT after a
   "successful" discard → returns that state, no redirect.

**Verify**: `npx vitest run tests/auth-recovery.vitest.js` → all pass

### Step 3: Real registry tests

In `tests/model-adapters.vitest.js`, construct the real `AzureAPIClient` with
the real `modelAdapterRegistry` and assert:

1. `getScopeForModel('whisper')` and `getScopeForModel('mai-transcribe-1.5')`
   both return `'https://cognitiveservices.azure.com/.default'`.
2. `getScopeForModel('nope')` throws `Unsupported transcription model: nope`.

**Verify**: `npx vitest run tests/model-adapters.vitest.js` → all pass

### Step 4: Staleness and destroy tests

In `tests/selected-audio.vitest.js`, using the existing harness:

1. Hold `api.transcribe` open (unresolved promise); call `remove()`; resolve;
   assert NO `UI_TRANSCRIPTION_READY` was emitted and the snapshot did not
   mutate to a success state.
2. Same but replace the file via a second `select()` before resolving —
   assert the resolved old transcription is discarded.
3. Call `destroy()`, then emit a model-change; assert no snapshot emission.

**Verify**: `npx vitest run tests/selected-audio.vitest.js` → all pass

## Test plan

This plan IS the test plan. Expected: ~15 new tests across four files.

## Done criteria

- [ ] `npm run test:coverage` exits 0; thresholds still met or improved
- [ ] `js/authentication-service.js` lines 80–96 show covered in the coverage
      report (`coverage/coverage-final.json`)
- [ ] `npm run lint` exits 0
- [ ] `git status` shows only the four test files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any new test FAILS against current production code — that is a real bug
  discovery; report the failing case and expected/actual instead of changing
  `js/`.
- The excerpts don't match the live code (drift).
- A test cannot be written without modifying production code (e.g. a seam is
  missing) — report which one.

## Maintenance notes

- These tests pin the fail-closed vocabulary (`BLOCKED` / `DOWNLOADED` /
  `CANCELLED`) and the safe-error contract; plan 053's refactor and plan
  054's new adapter must keep them green.
- Deferred to the audit backlog (not this plan): the SettingsSurface ↔ real
  controller integration test, device-preference flow tests, Retry-After
  date-form tests, MAI decode-failure mapping, wall-clock sleeps, and the
  assertion-free visualization test.
