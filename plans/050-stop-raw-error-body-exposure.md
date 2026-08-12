# Plan 050: Stop logging and broadcasting raw Azure error bodies; remove the ?debug URL switch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- js/api-client.js js/logger.js tests/api-client-errors.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

Azure error bodies routinely contain resource paths, deployment names and
correlation identifiers — exactly the "real identifier / Target URI" class
this repo's CLAUDE.md forbids in any artifact. Today the full raw body is
(a) written to the console at ERROR level, which runs in production, and
(b) attached to the thrown error's `apiContext.details`, from which it flows
into `API_REQUEST_ERROR` / `ERROR_OCCURRED` event payloads (the event bus can
retain the last 50 payloads when history is enabled). Any screenshot, HAR, or
bug report from a production session can leak endpoint identifiers.
Separately, `js/logger.js` promotes any visitor to DEBUG-level logging purely
from a `?debug` query parameter — verbose logging reachable in production by
URL alone.

## Current state

- `js/api-client.js` — inside `_createApiError` (lines ~325–352):

```js
const errorText = await response.text();
const retryAfterSeconds = this._parseRetryAfterSeconds(response.headers?.get?.('Retry-After'));
logger.child('AzureAPIClient').error('API Error Details:', errorText);
```

and, after the user-facing `message` is built from `_extractErrorDetail`:

```js
const error = new Error(message);
error.apiContext = {
    status: response.status,
    details: errorText,
    retryAfter: retryAfterSeconds
};
return error;
```

Note: the user-facing `message` comes from `_extractErrorDetail` (a bounded,
sanitized detail) — that stays. Only the raw `errorText` copies go.

- `js/logger.js` — level resolution (lines ~53–61):

```js
// Check for debug flag in URL
if (typeof window !== 'undefined' && window.location && window.location.search) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('debug')) {
        return 'development';
    }
}
```

- 401/403 deliberately never read the response body (`_createApiError`'s
  early path) — do not change that.
- `errorText` is still needed as input to `_extractErrorDetail`; keep the
  local variable, remove its *exposure*.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Focused tests | `npx vitest run tests/api-client-errors.vitest.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `js/api-client.js`
- `js/logger.js`
- `tests/api-client-errors.vitest.js`
- The logger test file if one exists (`ls tests/ | grep -i logger`); create
  `tests/logger.vitest.js` if none exists.

**Out of scope** (do NOT touch, even though they look related):
- `js/error-handler.js` and `js/event-bus.js` — once `apiContext.details` no
  longer carries the raw body, downstream is clean without changes.
- The 401/403 no-body-read branches in `_createApiError`.
- `_extractErrorDetail` — its bounded extraction is the sanctioned detail path.

## Git workflow

- Branch: `advisor/050-error-body-exposure`
- Commit style: conventional commits, e.g. `fix(security): stop exposing raw API error bodies and URL-gated debug logging`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the raw-body log line

In `_createApiError`, delete
`logger.child('AzureAPIClient').error('API Error Details:', errorText);`.
If an error-level breadcrumb is desired, log status and model only, e.g.
`logger.child('AzureAPIClient').error('API error', response.status);`

**Verify**: `grep -n "API Error Details" js/api-client.js` → no matches

### Step 2: Drop the raw body from `apiContext`

Replace `details: errorText` with the already-extracted bounded detail used
for the message (the `detail` variable produced by `_extractErrorDetail`), or
remove the field entirely if `detail` is empty. Keep `status` and
`retryAfter` unchanged.

**Verify**: `grep -n "details: errorText" js/api-client.js` → no matches

### Step 3: Remove the ?debug URL promotion

In `js/logger.js`, delete the `urlParams.has('debug')` block. Level selection
must depend only on the build environment detection that precedes it.

**Verify**: `grep -n "debug" js/logger.js` → no URL-parameter branch remains

### Step 4: Tests

1. In `tests/api-client-errors.vitest.js` (follow the existing mock-response
   pattern): drive a 500 with a body containing a sentinel like
   `https://real-resource.example/deployment-name` and assert that (a) the
   thrown error's `apiContext.details` does not contain the sentinel URL, and
   (b) no logger call received the full raw body (spy on the logger child).
2. Logger test: with `window.location.search = '?debug'` (Happy DOM), assert
   the resolved level is NOT development/DEBUG.

**Verify**: `npm test` → all pass, including new tests

## Test plan

Covered by Step 4; model the api-client tests on the existing 500-retry cases
in `tests/api-client-errors.vitest.js`. Check whether any existing test
asserts `apiContext.details === errorText` — if one does, update it to the
new bounded-detail expectation (that assertion IS the old behavior).

## Done criteria

- [ ] `npm test` exits 0; new leakage tests exist and pass
- [ ] `npm run lint` exits 0
- [ ] `grep -rn "errorText" js/api-client.js` shows it used only as
      `_extractErrorDetail` input
- [ ] `js/logger.js` has no URL-controlled level path
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code (drift).
- Removing `?debug` breaks a documented workflow (search README, CLAUDE.md,
  docs/ for `?debug` first — if it is documented, report instead of deleting).
- Retry behavior tests fail after Step 2 — `retryAfter` handling must be
  untouched; report rather than adjusting retry code.

## Maintenance notes

- Developers lose the `?debug` switch; `npm start` (dev build) still gets
  development-level logging via environment detection. If a runtime toggle is
  ever wanted, it should be a build flag, not a URL parameter.
- Reviewer should scrutinize: that `_extractErrorDetail`'s output is genuinely
  bounded (it is today) and that no other call site reads
  `apiContext.details` expecting the full body
  (`grep -rn "apiContext" js/ tests/`).
