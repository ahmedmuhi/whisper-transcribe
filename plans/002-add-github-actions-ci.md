# Plan 002: Enforce the existing quality gates in GitHub Actions CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3a83f9c..HEAD -- package.json .husky/ .github/`
> If `package.json` scripts or the husky hooks changed since this plan was
> written, compare the "Current state" excerpts against the live files before
> proceeding; on a mismatch, treat it as a STOP condition. If `.github/workflows/`
> already exists with a CI workflow, STOP — this plan is superseded.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tests
- **Planned at**: commit `3a83f9c`, 2026-06-11

## Why this matters

The repo has a strong verification story — 378 Vitest tests, coverage
thresholds (statements 85 / branches 80 / functions 70 / lines 85), ESLint,
knip production-dependency checks, and a size-limit budget — but ALL of it
runs only in local husky hooks. `git push --no-verify` bypasses everything,
hooks don't run for collaborators who haven't run `npm ci`, and PR merges
(this repo merges PRs, e.g. #62, #63) get no automated gate. A single GitHub
Actions workflow makes the existing gates authoritative server-side. Nothing
new is invented: CI runs exactly the commands the hooks already run, plus the
size budget.

## Current state

- There is **no** `.github/` directory in the repo.
- This is a no-build static app (vanilla ES modules): no build step, no
  artifacts. CI only needs Node + `npm ci` + the existing scripts.
- The repo's GitHub remote default branch is `main`; PRs are merged into it.
- Local dev Node is v24 (`node --version` → v24.x); `package.json` has no
  `engines` field.

The gates as they exist today:

```
# .husky/pre-commit
npm run lint

# .husky/pre-push
npm run test:coverage && npm run deps:check:prod
```

```json
// package.json (scripts — verbatim at commit 3a83f9c)
"scripts": {
    "test": "vitest run",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage",
    "prepare": "husky",
    "lint": "eslint \"js/**/*.js\"",
    "lint:fix": "eslint --fix \"js/**/*.js\"",
    "deps:check": "knip",
    "deps:check:prod": "knip --production --dependencies",
    "size": "size-limit"
}
```

All four CI commands (`lint`, `test:coverage`, `deps:check:prod`, `size`) run
offline against the checked-out tree — no secrets, no services, no browser
install needed (Vitest uses happy-dom, not a real browser).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Lint | `npm run lint` | exit 0, no output |
| Tests + coverage gate | `npm run test:coverage` | exit 0; all tests pass; thresholds hold |
| Prod-deps gate | `npm run deps:check:prod` | exit 0 |
| Size budget | `npm run size` | exit 0; `js/*.js` ≤ 100 kB |
| YAML sanity check | `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(/\t/.test(s))throw new Error('tabs in YAML');console.log('ok')"` | prints `ok` |

(There is no YAML parser in the dev dependencies; the tab check plus running
the four commands locally is the verification. Do not add new devDependencies
for this plan.)

## Scope

**In scope** (the only files you should create/modify):

- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch):

- `.husky/` — keep the local hooks exactly as they are; CI complements them,
  it does not replace them.
- `package.json` — no new scripts, no `engines` field, no devDependencies.
- Branch-protection settings — enabling "require status checks" is a GitHub
  UI/API action for the repo owner, not a file change; mention it in your
  completion report instead.

## Git workflow

- Branch: `feat/github-actions-ci`
- One commit, message style: `chore(ci): add GitHub Actions workflow enforcing lint, coverage, deps and size gates`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the workflow file

Create `.github/workflows/ci.yml` with exactly this content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Tests with coverage thresholds
        run: npm run test:coverage

      - name: Production dependency check (knip)
        run: npm run deps:check:prod

      - name: Size budget
        run: npm run size
```

Rationale you should preserve if you adjust anything: the four run steps are
the husky pre-commit + pre-push gates plus the size budget; Node 24 matches
the local dev environment; `cache: npm` keeps runs fast; the concurrency
group cancels superseded runs on force-push; the 10-minute timeout is ~5×
the local suite duration (the full local run is ~10 s of tests plus install).

**Verify**: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(/\t/.test(s))throw new Error('tabs in YAML');console.log('ok')"` → prints `ok`.

### Step 2: Prove every CI command passes locally

Run the exact four commands the workflow runs, in order, from the repo root.

**Verify**: `npm run lint` → exit 0.
**Verify**: `npm run test:coverage` → exit 0, all tests pass, coverage table printed, no threshold errors.
**Verify**: `npm run deps:check:prod` → exit 0.
**Verify**: `npm run size` → exit 0, reports size within the 100 kB limit.

If any of these fails locally, STOP — the working tree has a pre-existing
failure that CI would surface; report it rather than "fixing" unrelated code.

### Step 3: Confirm scope

**Verify**: `git status --porcelain` → only `.github/workflows/ci.yml`
(untracked) and, if you maintain the index, `plans/README.md`.

## Test plan

- No unit tests for a workflow file. The verification is Step 2 (every
  command CI will run passes locally at the same commit) plus the YAML tab
  check. Full end-to-end validation happens on the first push/PR after the
  operator merges this — note in your completion report that the first
  GitHub-side run should be watched.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and contains the four run steps
      `npm run lint`, `npm run test:coverage`, `npm run deps:check:prod`,
      `npm run size` (`grep -c "npm run" .github/workflows/ci.yml` → 4, plus the `npm ci` install step)
- [ ] All four commands exit 0 when run locally
- [ ] No tabs in the YAML file
- [ ] `git status --porcelain` shows only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `.github/workflows/` already exists (someone added CI since this plan was
  written — reconcile instead of overwriting).
- Any Step 2 command fails at the current commit — that is a pre-existing
  red gate; CI must not be tuned (thresholds lowered, steps removed) to make
  it pass.
- `package.json` scripts differ from the excerpt above.

## Maintenance notes

- If a script is renamed in `package.json` (e.g. `test:coverage`), this
  workflow must be updated in the same PR — there is no other coupling.
- When Node 24 leaves LTS, bump `node-version` here; consider adding an
  `engines` field to `package.json` at the same time (deferred from this
  plan to keep scope to one file).
- Recommend to the repo owner (not a file change): enable branch protection
  on `main` requiring the `checks` job, so `--no-verify` pushes and PR merges
  cannot bypass the gates.
- Coverage reports land in `coverage/` locally; the workflow doesn't upload
  them as artifacts — add `actions/upload-artifact` later only if someone
  actually needs the HTML report from CI.
