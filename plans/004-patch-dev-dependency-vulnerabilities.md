# Plan 004: Patch the dev-dependency vulnerabilities (npm audit fix + happy-dom major)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 50164c9..HEAD -- package.json package-lock.json vitest.config.js`
> Plan 003 is EXPECTED to have touched these files first (anchored test glob,
> `engines` field, lockfile version sync) — that is not drift. Run
> `npm audit 2>&1 | tail -3` and confirm vulnerabilities are still reported;
> if it already reports 0 vulnerabilities, this plan is done — mark it DONE
> and stop.

## Status

- **Priority**: P1
- **Effort**: S (audit fix) + M buffer (happy-dom major bump fallout)
- **Risk**: MED — happy-dom 18→20 is a breaking major used as the DOM
  environment for all 378 tests
- **Depends on**: plans/003-make-quality-gates-measure-only-the-repo.md
  (honest test counts; clean lockfile so this diff stays readable)
- **Category**: security / migration
- **Planned at**: commit `50164c9`, 2026-06-11

## Why this matters

`npm audit` reports **14 vulnerabilities (3 critical, 5 high)** in the dev
toolchain. None ship to users — this repo has zero runtime dependencies and
serves only `js/*.js` to the browser — but contributors and CI runners execute
this toolchain. The two critical items that matter:

- **happy-dom ≤ 20.8.8** — VM context escape → remote code execution
  (GHSA-37j7-fg3j-429f). happy-dom is the test DOM environment
  (`vitest.config.js` → `environment: 'happy-dom'`); the fix requires a
  **major bump 18 → 20.10.2+** (no patched 18.x line exists).
- **vitest < 3.2.6** — Vitest UI server arbitrary file read+execute
  (GHSA-5xrq-8626-4rwp). Fixed by the semver-compatible **3.2.6**, which plain
  `npm audit fix` applies (verified via `npm audit fix --dry-run`). Do NOT
  jump to vitest 4 in this plan.

The remaining high/moderate items (vite path traversal, flatted, ReDoS in
minimatch/picomatch/brace-expansion) are transitive and clear with the same
non-breaking `npm audit fix`.

## Current state

- `package.json` devDependencies (all dev; no runtime deps exist):
  `@eslint/js ^9.30.1`, `@size-limit/file ^11.2.0`, `@vitest/coverage-v8 ^3.2.4`,
  `eslint ^9.30.1`, `eslint-plugin-unused-imports ^4.1.4`, `happy-dom ^18.0.1`,
  `husky ^9.1.7`, `knip ^5.61.3`, `size-limit ^11.2.0`, `vitest ^3.2.4`.
- `npm audit fix --dry-run` (run 2026-06-11) confirms: the vite/vitest critical
  chain is fixable without breaking changes; only happy-dom requires the major.
- Tests: `tests/*.vitest.js`, 32 files / 378 tests, all green at planning time.
  `tests/vitest-setup.js` defines happy-dom-dependent fakes (MediaRecorder,
  AudioContext, getUserMedia stubs) — this file is where happy-dom 20 behavior
  changes are most likely to surface.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Audit | `npm audit 2>&1 \| tail -5` | see per-step expectations |
| Non-breaking fixes | `npm audit fix` | exit 0 |
| happy-dom bump | `npm install -D happy-dom@^20.10.2` | exit 0 |
| Tests | `npx vitest run 2>&1 \| tail -6` | `32 passed` files / `378 passed` tests |
| Coverage gate | `npm run test:coverage` | exit 0, thresholds met |
| Lint | `npm run lint` | exit 0 |
| Prod-dep gate | `npm run deps:check:prod` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `package.json` (dependency version ranges only)
- `package-lock.json` (via npm commands only)
- `tests/vitest-setup.js` and individual `tests/*.vitest.js` files — ONLY if
  the happy-dom 20 bump breaks specific tests, and only minimal adaptations
  that preserve each test's intent.

**Out of scope** (do NOT touch):

- `js/**` — no source changes; if a test failure seems to require a source
  change, that is a STOP condition (it means happy-dom was masking or causing
  behavior the maintainer must rule on).
- **vitest 3 → 4**, eslint 9 → 10, knip 5 → 6, size-limit 11 → 12 majors —
  recorded in the plans/README.md backlog; not this plan.
- `vitest.config.js` — no config changes should be needed for vitest 3.2.6.

## Git workflow

- Branch: `fix/004-dev-dep-vulns`
- Two commits, so a test regression bisects cleanly:
  1. `fix(deps): npm audit fix — non-breaking security patches`
  2. `fix(deps): bump happy-dom to 20.x for GHSA-37j7-fg3j-429f`
- Do NOT push or open a PR unless the operator instructed it. Pre-push runs
  coverage + deps:check:prod.

## Steps

### Step 1: Record the baseline

Run `npx vitest run 2>&1 | tail -6` and `npm audit 2>&1 | tail -5`.

**Verify**: 378 tests pass; audit reports 14 vulnerabilities (or fewer if the
ecosystem moved — record the actual number).

### Step 2: Apply the non-breaking fixes

Run `npm audit fix` (NO `--force`). Commit as the first commit.

**Verify**:
- `npm audit 2>&1 | tail -5` → only the happy-dom advisory chain remains
  (expect 1 critical, possibly a couple of related lines; nothing about vite/vitest).
- `npx vitest run 2>&1 | tail -6` → 378 tests pass.
- `node -e "console.log(require('./node_modules/vitest/package.json').version)"` → `3.2.6` (or higher 3.x)

### Step 3: Bump happy-dom to the patched major

Run `npm install -D happy-dom@^20.10.2`.

**Verify**: `npm audit 2>&1 | tail -3` → `found 0 vulnerabilities`.

### Step 4: Run the suite and absorb happy-dom 20 fallout

Run `npx vitest run 2>&1 | tail -30`.

- If all 378 pass: done, commit.
- If tests fail: read each failure; expected failure class is DOM behavior
  drift (element defaults, event timing, missing/changed happy-dom APIs used
  by the fakes in `tests/vitest-setup.js`). Adapt the **test/setup code only**,
  preserving what each test asserts. Re-run until green.

**Verify**: `npx vitest run 2>&1 | tail -6` → `Test Files  32 passed (32)`,
`Tests  378 passed (378)`.

### Step 5: Full gates

**Verify**: `npm run test:coverage` exit 0 with thresholds met;
`npm run lint` exit 0; `npm run deps:check:prod` exit 0.

## Test plan

No new tests. The existing 378-test suite is the regression net — it must pass
unmodified in intent (setup/adaptation edits allowed, assertion meaning
changes are not).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm audit 2>&1 | tail -3` → `found 0 vulnerabilities`
- [ ] `npx vitest run` → 378 tests pass (file count = `ls tests/*.vitest.js | wc -l`)
- [ ] `npm run test:coverage` exits 0 (thresholds 85/80/70/85 met)
- [ ] `npm run lint` and `npm run deps:check:prod` exit 0
- [ ] `git diff main --stat` touches only `package.json`, `package-lock.json`, and (if needed) `tests/**`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm audit fix` (without `--force`) changes a **major** version of anything
  (check `git diff package.json` after Step 2).
- More than ~10 tests fail after the happy-dom bump, or any failure looks like
  a genuine source bug surfaced by the newer DOM (not a test-environment
  artifact) — report the failure list instead of patching tests en masse.
- Fixing a test would require changing its assertions' meaning or touching `js/**`.
- Coverage drops below thresholds after the bump (instrumentation shift) —
  report numbers; do not lower thresholds.

## Maintenance notes

- vitest 3 → 4 (+ `@vitest/coverage-v8` 4) remains in the backlog; when it
  happens, happy-dom 20 is already compatible.
- Renovate/dependabot is not configured; without CI (plan 002) and a bot,
  audit rot will recur — worth raising when CI lands.
- Reviewers: the only risk surface is test-environment drift; scrutinize any
  edited test for weakened assertions.
