# Plan 009: Revert the MAI-Transcribe 1.5 style toggle — always readability-optimized

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. Commit per the git
> workflow. SKIP updating `plans/README.md` — your reviewer maintains the index.
> Audit every claim in your report against an actual tool result.
>
> **Drift check (run first)**: `git log --oneline -3` must show `c37a9b4` (the
> PR #70 merge) as an ancestor of HEAD, and `git status` must be clean. If
> `c37a9b4` is not in history, or the 7 files below have been modified since the
> merge, STOP and report.

## Status

- **Priority**: P1 (product decision — user reverted the feature)
- **Effort**: S
- **Risk**: LOW — a clean revert of a self-contained, recently-merged feature
- **Depends on**: none (this reverts plan 008)
- **Category**: chore / revert
- **Planned at**: commit `c37a9b4`, 2026-06-16

## Why this matters

Plan 008 added a UI toggle letting the user pick MAI-Transcribe 1.5's
`transcribeStyle` between **readability-optimized** (default) and **verbatim**.
The user has decided they only ever want **readability-optimized** and no
toggle.

Key fact that makes this a pure revert: **readability-optimized is the
field-absent default.** Per Microsoft's API
(`https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe`):
*"By default, the model returns a readability-optimized transcript. You can set
the value to `verbatim` to preserve the original spoken content…"* There is no
`"transcribeStyle":"readability"` value to send — readability is what you get
when the field is **omitted**. The app already omitted the field before plan
008 (every MAI 1.5 request was readability). Plan 008 only added the *verbatim*
escape hatch. Therefore "always readability" = remove plan 008 = the app's
original, well-tested behavior. No new "force readability" code is needed (and
none is possible).

## Current state

Plan 008 was merged as PR #70, merge commit `c37a9b4` (parent 1 = `d490c1e`
mainline; parent 2 = `f39a642` the feature). It changed exactly these 7 files
(215 insertions, 12 deletions): `index.html`, `js/constants.js`,
`js/model-adapters/mai-transcribe.js`, `js/settings.js`,
`tests/model-adapters.vitest.js`, `tests/settings-persistence.vitest.js`,
`tests/settings-unit.vitest.js`.

The only commit on main after the feature (`d490c1e`) touched only `plans/`, so
the 7 files are untouched since the merge and the revert applies cleanly.

The current adapter (post-008) gates the field:
```js
            const enhancedMode = { enabled: true, model: apiModel, task: 'transcribe' };
            if (apiModel === MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
                && config.transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
                enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
            }
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode }));
```
After the revert it returns to the original unconditional:
```js
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({
                enhancedMode: { enabled: true, model: apiModel, task: 'transcribe' }
            }));
```
which sends **no** `transcribeStyle` → Microsoft returns readability-optimized.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Install | `npm install` | exit 0 |
| Revert | `git revert -m 1 -n c37a9b4` | clean (no conflicts) |
| Full suite | `npx vitest run 2>&1 \| tail -6` | `Test Files 32 passed (32)`, `Tests 384 passed (384)` |
| Lint | `npm run lint` | exit 0 |
| Coverage | `npm run test:coverage` | exit 0, thresholds met |

## Scope

**In scope**: only the 7 files listed above, reverted via `git revert`. Do not
hand-edit them.

**Out of scope** (do NOT touch):
- `plans/**` — the plan-008 doc stays as the historical record; the reviewer
  marks it REVERTED in the index.
- Any file not in plan 008's diff.

## Git workflow

- Branch: `revert/009-mai-style-toggle`
- The `git revert -m 1 -n c37a9b4` stages the inverse diff without committing
  (so you can set a clean message). Then commit:
  `revert: remove MAI-Transcribe 1.5 style toggle; always readability-optimized (reverts #70)`
  with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Do NOT push or open a PR.

## Steps

### Step 1: Create the branch and run the revert

From the fresh worktree (HEAD = `c37a9b4`): create/switch to
`revert/009-mai-style-toggle`, then `git revert -m 1 -n c37a9b4`.

**Verify**: `git status` shows the 7 files staged as modified/deleted-content
(reverted), no conflicts. `git diff --cached --stat` shows the inverse of the
008 diff (≈12 insertions, 215 deletions across the same 7 files).

### Step 2: Confirm the code is back to pre-008 state

**Verify**:
- `grep -rn "transcribeStyle\|MAI_TRANSCRIBE_STYLE\|mai-transcribe-15-settings\|mai-transcribe-style\|MAI_TRANSCRIBE_STYLES" js/ index.html tests/` → **no matches** (every trace of the toggle is gone).
- `git diff --cached aa3b28c -- js/ index.html tests/model-adapters.vitest.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js` → **empty** (the working tree for these files equals the pre-008 commit `aa3b28c`).

If either still shows toggle remnants, STOP — the revert was incomplete.

### Step 3: Commit

Commit with the message in the git-workflow section.

**Verify**: `git log --oneline -1` shows your revert commit; `git status` clean.

### Step 4: Full gate

**Verify**: `npx vitest run 2>&1 | tail -6` → `Test Files 32 passed (32)`,
`Tests 384 passed (384)` (back to the pre-008 count); `npm run lint` → exit 0;
`npm run test:coverage` → exit 0, thresholds met.

## Done criteria

ALL must hold:
- [ ] `grep -rn "transcribeStyle\|mai-transcribe-style\|MAI_TRANSCRIBE_STYLE" js/ index.html tests/` → no matches
- [ ] `git diff aa3b28c -- js/ index.html tests/` → empty (code identical to pre-008)
- [ ] `npx vitest run` → 32 files / 384 tests pass
- [ ] `npm run lint` and `npm run test:coverage` exit 0
- [ ] `git status` clean; only the revert commit added; no `plans/` changes

## STOP conditions

- `c37a9b4` is not an ancestor of HEAD, or the 7 files changed since the merge
  (drift — the revert may conflict).
- `git revert` reports a conflict — report it; do not hand-resolve.
- After revert, `grep` still finds toggle remnants, or the suite is not exactly
  384 tests — report the discrepancy.

## Maintenance notes

- This returns MAI-Transcribe 1.5 to **always readability-optimized** (no
  `transcribeStyle` sent), which is Microsoft's default and the app's original
  behavior. Whisper / whisper-translate / MAI 1.0 are unaffected (they never
  carried the field).
- Plan 008 remains documented in `plans/`; if verbatim is ever wanted again, it
  is re-runnable. A reviewer should confirm the MAI 1.5 request body is exactly
  `{"enhancedMode":{"enabled":true,"model":"mai-transcribe-1.5","task":"transcribe"}}`.
