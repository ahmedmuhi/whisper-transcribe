# Plan 028: Provide one supported local-development command and runtime baseline

> **Executor instructions**: Execute the plan as written. The local server is a
> developer tool, not production application architecture. Stop if it requires
> a runtime dependency or browser-test API behavior.
>
> **Drift check (run first)**: `git diff --stat f9e36fe..HEAD -- package.json package-lock.json README.md CLAUDE.md .github/workflows/ci.yml tests/browser/static-server.mjs`

## Status

- **Priority**: P2
- **Effort**: S/M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: refreshed at commit `f9e36fe`, 2026-07-13

## Why this matters

Contributors can install and test the repository but the docs never provide a
command that serves the ES modules. `CLAUDE.md` instead says to find any static
server. The engine range also advertises EOL Node 20 while all CI lanes use Node
24. Add a zero-runtime-dependency `npm start`, document the URL and `?debug`, and
declare a currently supported Node floor without mixing in toolchain majors.

## Current state

- `package.json` has test/lint/browser scripts but no `start`/`dev`.
- `README.md:87-102` lists verification only; `CLAUDE.md:7` warns `file://`
  cannot load the application.
- `js/logger.js:45-62` already enables debug/info on localhost or with `?debug`.
- `package.json:8` declares `node >=20`; CI and live workflows use Node 24.
  Node 20 reached EOL on 2026-03-24. Choose `>=22` so both maintained LTS lines
  remain valid; CI continues to prove Node 24.
- `tests/browser/static-server.mjs` includes certificates, Azure stubs, test
  observation endpoints, and fixed ports; it must not become the dev server.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Server test | `npm start` | prints local URL and serves `/`, JS, CSS with correct MIME; terminate manually |
| HTTP probe | `curl -fsS http://127.0.0.1:4173/ >/dev/null` | exit 0 while server runs |
| Full gates | `npm test && npm run test:coverage && npm run test:browser && npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**:

- `scripts/static-server.mjs` (new)
- `package.json`
- `package-lock.json` engine metadata only
- `README.md`
- `CLAUDE.md`
- optionally `.nvmrc` if set to the same CI major
- `plans/README.md` status

**Read-only exemplar**: `tests/browser/static-server.mjs` for safe path and MIME
handling only.

**Out of scope**: reusing Azure test endpoints/certificates, hot reload,
bundlers, runtime dependencies, deployment workflows, toolchain majors,
`.editorconfig`, or lint expansion (Plan 029).

## Git workflow

- Branch: `chore/028-local-development-command`
- Commit: `chore: add supported local development server`
- Do not push unless instructed.

## Steps

### Step 1: Add a minimal safe static server

Create a Node built-in HTTP server that serves the repository root, maps `/` to
`index.html`, uses correct HTML/JS/CSS/common asset MIME types, rejects traversal,
returns 404 for missing files, and logs its URL. Default to
`127.0.0.1:4173`; accept validated `HOST`/`PORT` environment overrides. Add
graceful SIGINT/SIGTERM shutdown. Do not expose browser-test observation or API
stub routes.

**Verify**: start it, probe `/`, `/js/main.js`, `/css/styles.css`, a missing path,
and a traversal attempt; expect 200/correct MIME, 404, and 404 respectively.

### Step 2: Add npm start and update the Node contract

Add `"start": "node scripts/static-server.mjs"`. Raise engines to `>=22` and
update lockfile metadata only. If adding `.nvmrc`, use `24` to match CI while
keeping the package floor `>=22`.

**Verify**: `npm start` works from a clean checkout and `npm install` engine
metadata is internally consistent.

### Step 3: Document local running and debug mode

In README, separate Install, Run, Test, and Browser-test commands; tell users to
open the printed loopback URL and stop with Ctrl+C. In CLAUDE, replace “any
static server” ambiguity with `npm start`, retain the no-build rule, and document
localhost/`?debug` logging. Note that headed browser tests need a GUI but normal
Playwright is headless.

**Verify**: `rg -n 'npm start|\?debug|127\.0\.0\.1' README.md CLAUDE.md` finds
accurate instructions in both docs.

### Step 4: Run gates and audit zero-runtime dependencies

Run all commands; `npm run deps:check:prod` must still prove zero runtime deps.

## Test plan

- Manual/curl probes for root, ES modules, CSS, missing files, and traversal.
- Environment port override and invalid port fail-fast.
- Existing browser test server and Playwright ports remain independent.

## Done criteria

- [ ] `npm start` serves the real app using Node built-ins only.
- [ ] Node floor is supported and aligned with CI documentation.
- [ ] README and CLAUDE document running, stopping, and debug mode.
- [ ] No test stub/certificate behavior leaks into the dev server.
- [ ] All gates pass; production dependencies remain zero.

## STOP conditions

- Port 4173 conflicts with a required persistent local service and no simple
  environment override resolves it.
- Correct serving requires a dependency or bundler.
- Lockfile changes exceed engine metadata without an intentional install reason.
- A gate fails twice after an in-scope correction.

## Maintenance notes

Plan 029 must include `scripts/**/*.mjs` in lint. If deployment later gains a
real server, keep this tool explicitly local rather than turning it into runtime
architecture accidentally.
