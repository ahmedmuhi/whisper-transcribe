# Plan 020: Make transcript autosave observable and navigation-safe

> **Executor instructions**: Follow this plan step by step. Run every verification
> command before continuing. If a STOP condition occurs, stop and report; do not
> improvise. Update only this plan's status row in `plans/README.md` unless the
> reviewer says they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- js/transcript-store.js js/ui.js js/constants.js tests/transcript-store.vitest.js tests/transcript-autosave.vitest.js tests/transcript-actions.vitest.js`
> If any listed file changed, compare the live behavior with the excerpts below;
> semantic drift in the store return contract or autosave listener is a STOP.

## Status

- **Priority**: P1
- **Effort**: S/M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

The product promises that a refresh does not cost transcript work, but the last
500 ms of typing is only held in a timer and storage write failures are silently
swallowed. A quick navigation or unavailable/quota-exhausted localStorage can
therefore lose valuable text while the UI continues to imply it is recoverable.
Make persistence outcomes explicit, flush pending edits on `pagehide`, and warn
without clearing or otherwise disrupting the transcript.

## Current state

- `js/transcript-store.js:41-52` returns nothing and catches `setItem` failures:

  ```js
  save(text) {
      if (!this.storage) return;
      // ...
      try {
          this.storage.setItem(this.key, JSON.stringify({ text: value, savedAt: Date.now() }));
      } catch (error) {
          logger.child('TranscriptStore').debug('Failed to persist transcript:', error);
      }
  }
  ```

- `js/ui.js:157-166` schedules persistence after 500 ms but registers no
  `pagehide`/unload flush. `persistTranscript()` at `:789-792` ignores the save
  result.
- `grabTranscript()` persists before copying and clearing. If persistence fails,
  clearing after clipboard success must not silently claim Restore is available.
- `README.md:19-20` makes reload-safe autosave a user-facing promise.
- Follow existing UI feedback conventions: emit `UI_STATUS_UPDATE` through
  `_emitStatus()`; do not write status DOM directly.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npx vitest run tests/transcript-store.vitest.js tests/transcript-autosave.vitest.js tests/transcript-actions.vitest.js tests/status-ownership.vitest.js` | all pass |
| Full tests | `npm test` | all tests pass |
| Coverage | `npm run test:coverage` | thresholds pass |
| Browser regression | `npm run test:browser` | Chromium smoke passes |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | every command exits 0 |

## Scope

**In scope**:

- `js/transcript-store.js`
- `js/ui.js`
- `js/constants.js`
- `tests/transcript-store.vitest.js`
- `tests/transcript-autosave.vitest.js`
- `tests/transcript-actions.vitest.js`
- `plans/README.md` (status only)

**Out of scope**:

- Multiple transcript slots, history, cloud sync, Entra, or Cosmos DB.
- IndexedDB, service workers, runtime dependencies, or changing the 500 ms
  normal typing debounce.
- More Playwright tests; the existing reload smoke is the regression gate.
- Changing Grab's clipboard-first product semantics beyond preventing a false
  Restore promise when persistence fails.

## Git workflow

- Branch: `fix/020-transcript-autosave-reliability`
- Commit: `fix: make transcript autosave failure-aware`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Make the store report persistence outcomes

Write failing tests first. Change `TranscriptStore.save()` and `clear()` to
return booleans: `true` only when the requested storage mutation succeeds;
`false` when no backend exists or storage rejects. Preserve `load()` and `has()`
shapes and never throw storage exceptions to callers.

**Verify**: `npx vitest run tests/transcript-store.vitest.js` → new success,
no-backend, rejected-write, and rejected-clear assertions pass.

### Step 2: Centralize UI handling of a failed save

Have `UI.persistTranscript()` return the store result. On a failed save of
non-empty text, emit one actionable temporary error using a new `MESSAGES`
constant (for example, that autosave is unavailable and the text should be
copied before leaving). Do not repeatedly toast on every debounce: retain a
small UI flag and reset it after the next successful save.

For empty text, treat a failed clear as a storage failure too, but do not erase
the visible textarea or claim Restore state changed when the backing operation
failed.

**Verify**: focused autosave tests prove one warning per failure streak and
recovery after a successful write.

### Step 3: Flush pending edits on pagehide

Store a named `pagehide` handler on the UI instance. If an autosave timer is
pending, clear it and synchronously call `persistTranscript()` once. Do not use
`beforeunload`, dialogs, async work, or network calls. Register the handler once
during setup and make repeated `init()` calls unable to duplicate it.

**Verify**: use fake timers in `tests/transcript-autosave.vitest.js`; type, fire
`pagehide` before 500 ms, and assert the latest value is saved exactly once and
the delayed callback does not save again.

### Step 4: Keep Grab recoverability honest

Before clearing the textarea after clipboard success, require the pre-copy
persistence attempt to have succeeded. If it failed, keep the text visible,
allow the successful clipboard copy to stand, and show the storage warning
rather than claiming the text is restorable.

**Verify**: `tests/transcript-actions.vitest.js` covers storage failure +
clipboard success, storage success + clipboard success, and clipboard failure.

### Step 5: Run all gates and audit scope

Run every command in the table, then `git diff --check` and
`git diff --name-only`. Only scoped files may appear.

## Test plan

- Store mutation methods return true/false for success, missing backend, and
  thrown storage operations.
- A pending edit is flushed once on `pagehide`.
- A failed save produces one user-visible warning and never clears text.
- A later successful save resets failure suppression.
- Grab remains recoverable and existing reload/autosave behavior stays green.

## Done criteria

- [ ] Storage failures are observable without throwing.
- [ ] Pending transcript edits flush synchronously on `pagehide` exactly once.
- [ ] Failed persistence never causes the visible transcript to be cleared.
- [ ] Existing single-slot semantics and 500 ms debounce remain.
- [ ] Focused, full, coverage, browser, lint, Knip, and size gates pass.
- [ ] No out-of-scope file changes.

## STOP conditions

- Correct behavior requires asynchronous work during `pagehide`.
- The change requires a new storage backend or changing single-slot semantics.
- Preventing Grab data loss requires changing clipboard behavior beyond the
  narrow failure branch.
- A verification command fails twice after a reasonable in-scope correction.

## Maintenance notes

The boolean store contract is the future backend seam: a cloud implementation
may later return a Promise, but this plan deliberately keeps today's local
synchronous boundary. Review warning suppression carefully so errors are useful
without turning every keystroke into a toast.
