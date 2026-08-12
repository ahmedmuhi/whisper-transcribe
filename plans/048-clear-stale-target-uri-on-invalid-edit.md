# Plan 048: Clear the stored Target URI when the field is edited into an invalid value

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- js/settings.js tests/settings-persistence.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

When a user edits a Target URI field into a non-empty *invalid* value (for
example deletes the `https://` prefix), the field shows an error badge — but
the previously stored valid URI stays in `localStorage` and keeps being used
for uploads. Audio is sent to an endpoint the user believes they have removed,
and the effective endpoint is no longer displayed anywhere. CLAUDE.md's
contract is "persists only while the value is valid HTTPS"; the code violates
it on exactly the invalid-edit branch.

## Current state

- `js/settings.js` — `_handleUriInput` (lines 245–256). Note `_validateUri`
  returns `null` when VALID and an error-message string when INVALID, so
  `!this._validateUri(uri)` means "valid":

```js
_handleUriInput(uriInput, model) {
    this._sanitizeUriInput(uriInput);
    const uri = uriInput.value.trim();
    if (!uri) {
        localStorage.removeItem(this._getTargetUriStorageKey(model));
    } else if (!this._validateUri(uri)) {
        localStorage.setItem(this._getTargetUriStorageKey(model), uri);
    }
    eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
    this.renderUriBadges();
}
```

There is no branch for "non-empty and invalid": the method falls through,
leaving any previously stored URI live.

- `js/settings.js` — `_validateUri` (lines 363–371) returns
  `MESSAGES.URI_REQUIRED` / `MESSAGES.URI_MUST_BE_HTTPS` /
  `MESSAGES.INVALID_URI_FORMAT`, or `null` for a valid HTTPS URL.
- Repo convention: instant apply, no Save button, no draft state. Fields
  validate on `input`. Do not add any debounce or confirm step.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Tests | `npx vitest run tests/settings-persistence.vitest.js` | all pass |
| Full suite | `npm test` | all pass (663+ tests) |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `js/settings.js`
- `tests/settings-persistence.vitest.js`

**Out of scope** (do NOT touch, even though they look related):
- `js/api-client.js` `validateConfig()` — its missing-URI error path is
  correct and already tested; this plan makes it fire in the right cases.
- `_renderUriBadge` / badge markup — badge behavior is already correct.
- The URI `<input>` elements in `index.html`.

## Git workflow

- Branch: `advisor/048-clear-stale-target-uri`
- Commit style: conventional commits, e.g. `fix(settings): clear stored Target URI on invalid edit`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the invalid-branch removal

In `_handleUriInput`, add an `else` branch so a non-empty invalid value
removes the stored key, making stored state always mirror a valid visible
value:

```js
if (!uri) {
    localStorage.removeItem(this._getTargetUriStorageKey(model));
} else if (!this._validateUri(uri)) {
    localStorage.setItem(this._getTargetUriStorageKey(model), uri);
} else {
    localStorage.removeItem(this._getTargetUriStorageKey(model));
}
```

**Verify**: `npm run lint` → exit 0

### Step 2: Add regression tests

In `tests/settings-persistence.vitest.js`, find the existing describe covering
Target URI persistence (search for `whisper_uri` or `_handleUriInput`
consumers) and follow its setup pattern. Add cases:

1. Stored valid URI + field edited to `http://insecure.example` (invalid
   scheme) → stored key is removed, `SETTINGS_UPDATED` emitted.
2. Stored valid URI + field edited to `not-a-url` → stored key removed.
3. Field edited from empty to a valid `https://` URI → stored (existing
   behavior still passes).
4. Field emptied → key removed (existing behavior still passes).

**Verify**: `npx vitest run tests/settings-persistence.vitest.js` → all pass,
including 2+ new tests

## Test plan

Covered by Step 2. Model the new tests after the existing storage-assertion
style in `tests/settings-persistence.vitest.js` (direct `localStorage`
assertions after driving the input handler).

## Done criteria

- [ ] `npm test` exits 0; new invalid-edit tests exist and pass
- [ ] `npm run lint` exits 0
- [ ] Manual trace: `_handleUriInput` has no fall-through path that leaves a
      stored key while the visible value is invalid
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `_handleUriInput` no longer matches the excerpt (drift).
- ~~Any existing test asserts the current keep-stale behavior on the invalid
  branch~~ **RESOLVED by maintainer ruling (first execution attempt correctly
  stopped here):** `tests/settings-persistence.vitest.js:318` ("keeps the last
  valid Target URI while the field is mid-edit and invalid") deliberately pins
  the keep-stale behavior. The maintainer ruled that CLAUDE.md's
  "persists only while the value is valid HTTPS" contract WINS: safety over
  mid-edit tolerance. UPDATE that test (rename it to reflect the new contract,
  e.g. "clears the stored Target URI the moment the field becomes invalid",
  and assert the key is removed after each invalid `typeUri` call). Do not
  delete it — convert it. Its sibling at :305 ("never stores the invalid
  value") already matches the new contract and stays as-is.
- The fix appears to require touching `js/api-client.js`.

## Maintenance notes

- Plan 053 (registry-driven model UI) generalizes URI-row wiring per adapter;
  this fix lives in `_handleUriInput`, which survives that refactor — but if
  053 lands first, re-run these tests against the generalized handler.
- Reviewer should scrutinize: a user typing a new URI character-by-character
  now clears the stored key at the first invalid keystroke. That matches the
  documented "persists only while valid" contract and the badge already
  reports it; it is a behavior change worth one explicit PR sentence.
