# Plan 029: Lint tests, Playwright scaffolding, and repository tooling

> **Executor instructions**: Broaden linting deliberately by environment. Do
> not silence the initial error set globally. Follow every gate and stop if the
> change requires test-environment refactoring.
>
> **Drift check (run first)**: `git diff --stat 7c2f2c0..HEAD -- eslint.config.js package.json package-lock.json tests playwright.config.js playwright.live.config.js scripts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: Plan 028
- **Category**: dx
- **Planned at**: refreshed at commit `7c2f2c0`, 2026-07-13 (after Plan 028)

## Why this matters

The advertised lint gate covers only `js/**/*.js`: about 5,238 production lines
while roughly 8,901 lines of tests and tooling are excluded. The Playwright
server, live-contract path, configs, and consolidated tests can accumulate
undefined names and unused imports without CI noticing. Add environment-specific
flat-config blocks, then repair real findings instead of disabling useful rules.

## Current state

- `package.json` uses `eslint "js/**/*.js"` and the same narrow fix glob.
- `eslint.config.js` applies browser globals to every JS file and has no Vitest,
  Node, or Playwright blocks.
- A read-only broad probe at planning time reported 1,194 errors; most were
  expected missing `global`/Vitest globals, but it also found real unused imports
  in `tests/visualization-stop-expanded.vitest.js` and
  `tests/vitest-setup.js`, plus irregular whitespace in `eslint.config.js`.
- Vitest intentionally uses globals. This plan configures them; it does not
  migrate tests to explicit imports or Node environment.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| New lint gate | `npm run lint` | all tracked JS/MJS/config/test surfaces pass |
| Fix check | `npm run lint:fix && git diff --check` | formatter-safe fixes only; inspect diff |
| Full gates | `npm test && npm run test:coverage && npm run test:browser && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**:

- `eslint.config.js`
- `package.json` and `package-lock.json` only if a direct lint-environment dev
  dependency is intentionally added
- tracked `*.js`/`*.mjs` config, test, helper, browser, and `scripts/` files
  solely for lint findings
- `plans/README.md` status

**Out of scope**: production refactors, test behavior rewrites, global Vitest
setup architecture, moving tests to Node, formatter introduction, toolchain
major upgrades, archived plan formatting, generated artifacts, or CSS/Markdown.

## Git workflow

- Branch: `chore/029-lint-tests-tooling`
- Commit: `chore: lint tests and tooling`
- Do not push unless instructed.

## Steps

### Step 1: Define environment-specific flat config

Keep ignores for generated/vendor directories. Add separate blocks for:

1. Browser production modules (`js/**/*.js`) with current globals/rules.
2. Happy DOM Vitest tests/helpers/setup with browser, Node compatibility globals
   actually used, and Vitest globals.
3. Node tooling (`*.config.js`, `tests/browser/**/*.mjs`,
   `tests/browser-live/**/*.js`, `scripts/**/*.mjs`) with Node globals; browser
   test specs should rely on imported Playwright symbols.

Prefer the official `globals` package only if it is added as an explicit dev
dependency and reduces error-prone hand-maintenance. Do not expose Node globals
to production browser modules.

**Verify**: `npx eslint "js/**/*.js" "tests/**/*.{js,mjs}"
"*.config.js" "scripts/**/*.mjs"` runs with environment errors removed and
shows only genuine code findings.

### Step 2: Broaden npm scripts

Set `lint` and `lint:fix` to the same complete tracked JS/MJS surface. Avoid
`eslint .` if it would scan archived/generated/unrelated paths unpredictably;
use explicit globs or correct ignores.

**Verify**: both scripts resolve identical files and `npm run lint` exits 0
after Step 3.

### Step 3: Fix genuine findings minimally

Remove unused imports/variables, prefix intentionally unused mock parameters,
and repair irregular whitespace. Do not restructure tests, change assertions,
or bulk-reformat files. For each changed test/tool file, inspect the diff and
run its relevant test or server probe.

**Verify**: `npm run lint` exits 0 with no warnings/errors; `git diff --check`
passes.

### Step 4: Put the broader gate through CI's existing command

No CI workflow change should be necessary because CI already runs
`npm run lint`. Confirm the command now covers all intended surfaces and the
full suite/browser smoke remain green.

## Test plan

- ESLint config itself passes.
- Production files do not receive Node/Vitest globals.
- Test globals are recognized without changing Vitest's global mode.
- Node scripts/configs reject accidental browser-only or undefined globals.
- Every mechanically changed test file still passes.

## Done criteria

- [ ] `npm run lint` covers production, tests, browser/live scaffolding, configs,
  helpers, and local server scripts.
- [ ] Environment globals are scoped, not globally weakened.
- [ ] No rule is disabled repo-wide merely to make migration pass.
- [ ] No test semantics or global setup architecture changes.
- [ ] All gates pass and diff is mechanically scoped.

## STOP conditions

- The broad gate requires refactoring the Vitest global setup or moving tests
  between environments.
- More than mechanical changes are needed in production code.
- A lint plugin major upgrade is required.
- Full or browser tests fail twice after a lint-only correction.

## Maintenance notes

New JS/MJS directories must be added to the explicit lint surface or matched by
the chosen stable glob. Keep globals least-privilege by execution environment.
