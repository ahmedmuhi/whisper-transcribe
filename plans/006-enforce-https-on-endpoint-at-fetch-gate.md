# Plan 006: Enforce HTTPS on the endpoint URI at the fetch gate, not only at settings-save time

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 50164c9..HEAD -- js/api-client.js js/settings.js js/constants.js tests/api-client-errors.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (security, S effort)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sequence after 003 so test counts verify cleanly)
- **Category**: security
- **Planned at**: commit `50164c9`, 2026-06-11

## Why this matters

The app sends the user's Azure Speech **API key as a request header** plus
their recorded audio to a user-configured endpoint URI. The `https:`
requirement on that URI is enforced in exactly one place: settings-form
validation at save time (`js/settings.js:566`). The gate that runs immediately
before every `fetch` — `AzureAPIClient.validateConfig()`,
`js/api-client.js:405-412` — only checks that the URI *parses* (`new URL`),
never the protocol. `Settings.getModelConfig()` feeds it values read straight
from `localStorage` with no re-check.

Any URI that reaches localStorage without passing the save form — persisted
before the https guard existed, written by another tab/extension/devtools, or
restored from a backup — is used verbatim. An `http://` endpoint transmits the
API key and audio in cleartext. The fix is a one-clause defense-in-depth check
at the gate that already exists for syntax.

## Current state

`js/api-client.js:405-412` (tail of `validateConfig()` — the only validation
before `fetch(config.uri, …)` at `js/api-client.js:64`):

```js
        // Basic URI validation
        try {
            new URL(normalizedConfig.uri);
        } catch {
            const error = new Error(`${MESSAGES.INVALID_URI_FORMAT} for ${normalizedConfig.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri', model: normalizedConfig.model });
            throw error;
        }

        return normalizedConfig;
```

`js/settings.js:563-572` (inside `getValidationErrors()` — the save-time-only
https check, with its magic string):

```js
        } else {
            try {
                const url = new URL(uri);
                if (url.protocol !== 'https:') {
                    errors.push('URI must use HTTPS');
                }
            } catch {
                errors.push(MESSAGES.INVALID_URI_FORMAT);
            }
        }
```

`js/constants.js:278-282` (the API Validation group of `MESSAGES`, where the
new constant belongs):

```js
  // API Validation
  API_KEY_REQUIRED: 'API key is required',
  URI_REQUIRED: 'URI is required',
  INVALID_URI_FORMAT: 'Invalid URI format',
  INVALID_API_KEY_CHARACTERS: 'API key contains unsupported characters. Paste only the raw Speech resource key.',
```

Conventions that apply:
- Every `validateConfig()` failure both **emits** `APP_EVENTS.API_CONFIG_MISSING`
  (with a `missing` discriminator + `model`) and **throws** — match that shape
  exactly (see the three earlier checks at `js/api-client.js:387-403`).
- User-facing strings live in `MESSAGES` (`js/constants.js`) — note the
  existing settings-side check violates this with a literal; this plan fixes
  that too.
- Test fixtures for insecure URIs already exist on the settings side:
  `'http://insecure.openai.azure.com/'` (`tests/settings-persistence.vitest.js:218`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Target test file | `npx vitest run tests/api-client-errors.vitest.js` | all pass |
| Settings tests | `npx vitest run tests/settings-unit.vitest.js tests/settings-persistence.vitest.js` | all pass |
| Full suite | `npx vitest run 2>&1 \| tail -6` | all pass, +2 tests vs baseline |
| Lint / coverage | `npm run lint` / `npm run test:coverage` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `js/constants.js` — add `MESSAGES.URI_MUST_BE_HTTPS`
- `js/api-client.js` — protocol check in `validateConfig()`
- `js/settings.js` — replace the `'URI must use HTTPS'` literal with the constant
- `tests/api-client-errors.vitest.js` — add tests

**Out of scope** (do NOT touch):

- No localhost/`http://127.0.0.1` exception — the app already requires a
  secure context for `getUserMedia`, so an http endpoint has no legitimate
  current use. (If a future local-Whisper-endpoint feature lands, this is the
  line to revisit — see Maintenance notes.)
- The other `validateConfig` checks, the sanitization regexes, and
  `getModelConfig()` — unchanged.
- Settings-form UX/copy beyond the constant swap.

## Git workflow

- Branch: `fix/006-https-at-fetch-gate`
- Single commit, e.g. `fix(security): enforce https on the endpoint URI at the fetch gate`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the message constant

In `js/constants.js`, in the `// API Validation` group (after
`INVALID_URI_FORMAT`, ~line 281), add:

```js
  URI_MUST_BE_HTTPS: 'URI must use HTTPS',
```

**Verify**: `node -e "import('./js/constants.js').then(m => console.log(m.MESSAGES.URI_MUST_BE_HTTPS))"` → `URI must use HTTPS`

### Step 2: Enforce the protocol in `validateConfig()`

In `js/api-client.js`, replace the syntax-only block (shown in Current state)
so a parsed URL is also protocol-checked, following the existing emit+throw
shape:

```js
        // Basic URI validation
        let parsedUri;
        try {
            parsedUri = new URL(normalizedConfig.uri);
        } catch {
            const error = new Error(`${MESSAGES.INVALID_URI_FORMAT} for ${normalizedConfig.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri', model: normalizedConfig.model });
            throw error;
        }

        if (parsedUri.protocol !== 'https:') {
            const error = new Error(`${MESSAGES.URI_MUST_BE_HTTPS} for ${normalizedConfig.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'httpsUri', model: normalizedConfig.model });
            throw error;
        }

        return normalizedConfig;
```

**Verify**: `npx vitest run tests/api-client-errors.vitest.js tests/api-client-validation.vitest.js`
→ all existing tests pass (their fixtures are https; verified at planning time).

### Step 3: Swap the settings-side literal for the constant

In `js/settings.js:567`, change `errors.push('URI must use HTTPS');` to
`errors.push(MESSAGES.URI_MUST_BE_HTTPS);` (`MESSAGES` is already imported).

**Verify**: `grep -rn "must use HTTPS" js/` → only `js/constants.js`;
`npx vitest run tests/settings-unit.vitest.js tests/settings-persistence.vitest.js` → all pass
(those tests assert the same string value, which is unchanged).

### Step 4: Add the fetch-gate regression tests

In `tests/api-client-errors.vitest.js`, inside
`describe('Configuration Validation Errors')`, add two tests modeled on
`'should emit event when validateConfig is called with invalid URI format'`
(line ~201):

1. Settings mock returns `uri: 'http://insecure.openai.azure.com/'` (valid key
   otherwise) → `validateConfig()` throws an error whose message contains
   `MESSAGES.URI_MUST_BE_HTTPS`, and `API_CONFIG_MISSING` is emitted with
   `expect.objectContaining({ missing: 'httpsUri' })`.
2. `transcribe(new Blob())` with the same config rejects **without**
   `global.fetch` being called (`expect(global.fetch).not.toHaveBeenCalled()`)
   — proving the key never leaves over cleartext.

**Verify**: `npx vitest run tests/api-client-errors.vitest.js` → all pass
including the 2 new tests.

### Step 5: Full gate

**Verify**: `npx vitest run 2>&1 | tail -6` all pass; `npm run lint` exit 0;
`npm run test:coverage` exit 0.

## Test plan

- New (2): https rejection at `validateConfig` (message + event shape), and
  no-fetch-on-insecure-URI via `transcribe`.
- Pattern: `tests/api-client-errors.vitest.js:201` for emit+throw validation
  tests; insecure-URI fixture style from `tests/settings-persistence.vitest.js:218`.
- Existing settings-side https tests keep passing unchanged (same string value).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "must use HTTPS" js/ | grep -v constants.js` → no matches
- [ ] `grep -n "httpsUri" js/api-client.js` → one emit site
- [ ] `npx vitest run` → all pass, +2 tests vs. pre-plan baseline
- [ ] `npm run lint` and `npm run test:coverage` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `validateConfig` or `getValidationErrors` excerpts don't match the live
  code (drift).
- Any existing test fails because it feeds an `http://` URI to the API client
  as a *valid* fixture — that contradicts the planning-time grep and means the
  https rule has a consumer to discuss, not steamroll.
- You find any code path that calls `fetch` with a settings-derived URI
  *without* going through `validateConfig()` — report it; it needs the same
  guard and is out of this plan's scope.

## Maintenance notes

- If a local/self-hosted transcription endpoint feature is ever added
  (direction backlog: non-Azure provider spike), an explicit, user-visible
  localhost exception can be added **here** (`missing: 'httpsUri'` branch) —
  do not weaken the general rule.
- Reviewers: check the two new tests assert on `MESSAGES.URI_MUST_BE_HTTPS`
  (the constant), not a re-typed literal.
