# Plan 031: Adopt Vite/MSAL packaging and deploy the built static artifact through GitHub Actions

> **Required executor profile**: use `gpt-5.6-terra` with **high** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- package.json package-lock.json .gitignore index.html vite.config.js auth/ scripts/static-server.mjs tests/browser/ playwright.config.js eslint.config.js knip.json .github/workflows/ docs/adr/`
> If any in-scope file changed, compare the excerpts below with live code before
> proceeding. A material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/114

## Why this matters

Current MSAL Browser v5 is distributed through npm, and its redirect bridge is
a package import that must be resolved by a bundler. Whisper Transcribe can
remain a static browser-only application, but its literal no-build deployment
cannot support the agreed authentication contract. This plan introduces only
the packaging and deployment foundation: Vite, the dedicated callback entry,
built-artifact quality gates, and a GitHub Actions Pages workflow. It does not
implement sign-in or change any Azure caller.

The binding design source is the canonical Wayfinder resolution:
<https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>.
The packaging decision is:
<https://github.com/ahmedmuhi/whisper-transcribe/issues/109#issuecomment-5008352236>.

## Current state

- `package.json:6-24` describes a no-build app, has no production dependency,
  runs a custom Node static server, and measures raw `js/*.js` rather than the
  shipped artifact:

  ```json
  "description": "A no-build browser app ...",
  "scripts": {
    "start": "node scripts/static-server.mjs",
    "test:browser": "playwright test",
    "size": "size-limit"
  },
  "size-limit": [{ "path": "js/*.js", "limit": "100 kB" }]
  ```

- `js/main.js` and every application module are vanilla ES modules. This plan
  must preserve that architecture; Vite is a build tool, not permission to add
  React, Vue, routing, SSR, or a runtime server.
- `index.html` loads `./js/main.js` as a module and is currently served directly
  from the repository root.
- `playwright.config.js:20-32` expects the app at
  `http://127.0.0.1:4173` and starts `tests/browser/static-server.mjs`.
- `tests/browser/static-server.mjs:59-84` currently serves files directly from
  the repository root. The real-browser smoke test therefore does not exercise
  a production build.
- `.github/workflows/ci.yml` runs lint, coverage, production Knip, size-limit,
  and the Chromium smoke test, but does not build.
- GitHub Pages is currently a legacy publication from `main:/`. No Pages Actions
  workflow is tracked. Switching the live publishing source remains an external
  action requiring explicit operator approval.
- `.gitignore:20-25` ignores `docs/` wholesale. The required ADR needs a tracked
  exception beneath `docs/adr/`; ignored generated JSDoc HTML must remain
  ignored.
- Baseline at the planned commit: `npm test -- --reporter=dot` passes 31 files / 404 tests.
- Versions vetted on 2026-07-18:
  - production: `@azure/msal-browser` `5.17.1` (exact pin);
  - development: `vite` `8.1.5` (exact pin).
  Re-verify that both versions still resolve and are not deprecated before
  installing. A newer version is not an automatic substitution; refresh this
  plan first if either pin is unavailable or has a high/critical advisory.

The callback contract is fixed:

```text
source/output path: /auth/redirect.html
local URI:          http://127.0.0.1:4173/auth/redirect.html
production URI:     https://ahmedmuhi.github.io/whisper-transcribe/auth/redirect.html
```

The callback runs only `broadcastResponseToMainFrame` from
`@azure/msal-browser/redirect-bridge`, may display `Completing sign-in…`, must
remain frameable, and must not receive `Cross-Origin-Opener-Policy` or a
frame-blocking `X-Frame-Options` header.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Clean install | `npm ci` | exit 0 using the committed lockfile |
| Production build | `npm run build` | exit 0; `dist/index.html` and `dist/auth/redirect.html` exist |
| Local development | `npm start` | Vite listens only on `http://127.0.0.1:4173` and fails if the port is occupied |
| Preview | `npm run preview` | built application is served from loopback, not a production server |
| Unit/coverage | `npm run test:coverage` | all tests pass; thresholds remain 85/80/70/85 or higher |
| Lint | `npm run lint` | exit 0 |
| Dependency checks | `npm run deps:check && npm run deps:check:prod` | both exit 0 |
| Vulnerabilities | `npm audit --audit-level=high` | exit 0; no high/critical findings |
| Shipped size | `npm run size` | exit 0 against files under `dist/` |
| Browser smoke | `npm run test:browser` | Chromium smoke passes against a freshly built `dist/` |

## Suggested executor toolkit

- Use the official Vite static-deployment guide:
  <https://vite.dev/guide/static-deploy>.
- Use Microsoft's v5 redirect-bridge guide, especially its Vite multi-page
  entry and COOP warning:
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge>.
- Use GitHub's custom Pages workflow contract:
  <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>.
- Use the repository's browser-testing conventions in
  `tests/browser/transcription-smoke.spec.js` and
  `tests/browser/static-server.mjs`; preserve the real socket-level CORS stub.

## Scope

**In scope (only these files):**

- `package.json`
- `package-lock.json`
- `.gitignore`
- `index.html` (entry/build-path changes only)
- `vite.config.js` (create)
- `auth/redirect.html` (create)
- `scripts/static-server.mjs` (remove after Vite replaces its supported role)
- `playwright.config.js`
- `tests/browser/static-server.mjs`
- `tests/browser/transcription-smoke.spec.js` (build-path assertions only;
  authentication changes belong to Plan 032)
- `tests/vite-build.vitest.js` (create if a focused build-contract test is useful)
- `eslint.config.js`
- `knip.json`
- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml` (create)
- `docs/adr/0001-adopt-vite-and-msal-browser.md` (create)

**Out of scope:**

- Any sign-in, account, token, API-client, model-adapter, Settings, recording,
  or upload behavior.
- Removing API keys or Whisper Translate; Plan 032 owns that atomic migration.
- Porting prototype UI; Plans 033 and 034 own it.
- Creating or changing an Entra registration, its redirect URIs, GitHub
  repository variables, or GitHub Pages settings.
- Triggering a Pages deployment. The workflow is committed here; live
  configuration and candidate deployment require a separate explicit approval.
- Any backend, framework, service worker, SSR, or generated bundle committed to Git.

## Git workflow

- Branch: `advisor/031-vite-msal-pages-packaging`
- Use conventional commits matching repository history, for example:
  `build: adopt Vite static packaging` and `ci: deploy the Vite Pages artifact`.
- Keep the ADR with the build-boundary commit it explains.
- Do not push, merge, change Pages settings, or run the Pages workflow unless
  the operator explicitly authorizes those actions.

## Steps

### Step 1: Pin the one runtime dependency and the narrow build tool

Install exact versions, producing a reviewed lockfile:

```bash
npm install --save-exact @azure/msal-browser@5.17.1
npm install --save-dev --save-exact vite@8.1.5
```

Update `package.json` so:

- `@azure/msal-browser` is the only entry under `dependencies`;
- Vite remains under `devDependencies`;
- `start` runs Vite at host `127.0.0.1`, port `4173`, with strict port binding;
- `build` runs `vite build`;
- `preview` serves the built result from a fixed loopback port with strict port
  behavior;
- no script invokes the retired `scripts/static-server.mjs`;
- `dist/` is ignored and never committed.

Do not import MSAL into the application yet. The dedicated bridge in Step 3 is
the legitimate consumer until Plan 032 adds the authentication service.

**Verify**:

```bash
npm ls --depth=0 @azure/msal-browser vite
```

Expected: exact versions `5.17.1` and `8.1.5`; no missing/invalid package.

### Step 2: Configure Vite as a vanilla multi-page static build

Create `vite.config.js` with `defineConfig`. Preserve `index.html` as the main
entry and add `auth/redirect.html` as a second Rollup input. The configuration
must support both locations without hard-coding a private identifier:

- development serves the app at `/` on `127.0.0.1:4173`;
- the Pages build uses the public `/whisper-transcribe/` base;
- the emitted callback path remains `auth/redirect.html`;
- assets use Vite's generated hashed filenames under `dist/assets/`;
- `emptyOutDir` remains enabled;
- no server proxy or backend is configured.

Use an explicit build mode or public base-path argument rather than detecting a
private environment. `npm run build` must have one canonical deterministic
result; the Pages workflow invokes the documented Pages base configuration.

Update ESLint/Knip inputs so `vite.config.js`, the bridge entry, and any new
test helper are measured. Delete `scripts/static-server.mjs` only after
`npm start` has been replaced and no references remain.

**Verify**:

```bash
npm run build
test -f dist/index.html
test -f dist/auth/redirect.html
test ! -e dist/js/main.js
git check-ignore dist/index.html
```

Expected: all commands exit 0; `dist/` is generated and ignored.

### Step 3: Build the dedicated MSAL v5 redirect bridge

Create `auth/redirect.html` as a standalone Vite entry. Its only executable
behavior is:

```js
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
await broadcastResponseToMainFrame();
```

Handle a bridge failure without printing the error object, authentication
response, URL fragment/query, or token. A generic visible failure message is
acceptable; application logging is not. The page must not import `js/main.js`,
bootstrap UI, read storage, access the microphone, or call Azure.

Add a focused deterministic assertion (Vitest or built-output inspection) that
proves both HTML entries exist and the callback does not contain/import normal
application entry points. Do not test MSAL internals.

**Verify**:

```bash
npm run build
rg -n "Completing sign-in|Processing authentication" dist/auth/redirect.html
! rg -n "js/main|AudioHandler|AzureAPIClient|localStorage|microphone" auth/redirect.html
```

Expected: callback copy exists; forbidden application concerns do not.

### Step 4: Make deterministic browser testing exercise `dist/`

Change the test server to serve a freshly generated build rather than source
files from the repository root. Retain its local HTTPS Azure stub, genuine
OPTIONS + POST observation, `[::1]:4175` readiness listener, request-size bound,
and no-store responses. Update worker and asset assertions to tolerate Vite's
hashed output while still proving the real audio worker executes.

Do not alter the current API-key expectation yet; Plan 032 replaces it with a
fake bearer-token boundary atomically. This step only changes where the tested
app came from.

The Playwright web-server command must build once before serving. It must not
reuse a developer server, and a second immediate run must remain reliable.

**Verify**:

```bash
npm run test:browser
npm run test:browser
```

Expected: one deterministic smoke test passes twice consecutively; each run
serves a newly built artifact and observes one preflight and one POST.

### Step 5: Move every automated gate to the production artifact

Update `package.json` and `.github/workflows/ci.yml` so CI performs:

1. `npm ci`;
2. `npm run build`;
3. lint;
4. coverage without lowering thresholds;
5. full and production Knip checks;
6. `npm audit --audit-level=high`;
7. size-limit against generated JavaScript under `dist/assets/`;
8. the built-app Chromium smoke test.

Replace the raw `js/*.js` size target. Establish the new generated baseline,
record it in the ADR, and set the smallest practical ceiling: round the observed
Brotli size of each shipped entry up to the next 5 kB and allow no more than one
additional 5 kB step. Do not retain an unmeasured wildcard, delete the gate, or
raise it simply until CI turns green.

**Verify**:

```bash
npm run build
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
```

Expected: every command exits 0. Coverage thresholds are unchanged or higher;
size-limit reports generated assets, not `js/*.js`.

### Step 6: Add the GitHub Actions Pages artifact workflow

Create `.github/workflows/pages.yml` following GitHub's static Pages contract:

- `contents: read`, `pages: write`, and `id-token: write` only;
- a `github-pages` environment and deployment URL from `deploy-pages`;
- `npm ci` and the canonical production build;
- upload only `dist/` via `actions/upload-pages-artifact`;
- deploy via `actions/deploy-pages`;
- concurrency group `pages`;
- `workflow_dispatch` plus the final agreed main-branch trigger;
- no secrets, audio, tokens, Target URIs, or authentication traces as artifacts.

Use current supported major action lines vetted at execution time. At plan time
the official releases are `actions/configure-pages@v6`,
`actions/upload-pages-artifact@v5`, and `actions/deploy-pages@v5`.

Do not switch the repository's Pages source or trigger the workflow in this
step. Record those as explicit operator actions for Plan 037.

**Verify**:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/pages.yml', aliases: true); puts 'valid'"
rg -n "npm ci|npm run build|upload-pages-artifact|path:.*dist|deploy-pages" .github/workflows/pages.yml
```

Expected: YAML parses and every required build/deploy stage is present.

### Step 7: Record the build-boundary ADR

Change `.gitignore` narrowly so `docs/adr/**` can be tracked while ignored
generated JSDoc HTML at `docs/*` remains ignored. Create
`docs/adr/0001-adopt-vite-and-msal-browser.md` with:

- status `Accepted` and date;
- context: current v5 bridge requires a bundler and CDN delivery is deprecated;
- decision: Vite, vanilla JS, exact MSAL runtime pin, generated `dist/`, GitHub
  Actions Pages artifact, no committed bundles;
- consequences: Node/npm build required; static/browser-only runtime retained;
  one runtime dependency exception; built-output tests and size gate;
- rejected choices: handwritten OAuth/PKCE, retired CDN, third-party ESM CDN,
  committed generated bundle, UI framework, backend;
- callback/COOP/frameability constraints;
- upgrade note: MSAL updates are security-relevant and require bridge/browser
  regression testing.

Do not include deployment-specific identifiers other than the already-public
application URLs above.

**Verify**:

```bash
git check-ignore -q docs/index.html
test "$(git check-ignore docs/adr/0001-adopt-vite-and-msal-browser.md || true)" = ""
rg -n "Accepted|Vite|MSAL|static|redirect bridge|GitHub Actions" docs/adr/0001-adopt-vite-and-msal-browser.md
```

Expected: generated docs remain ignored, the ADR is trackable, and all decision
elements are present.

## Test plan

- Preserve all 404 baseline unit tests.
- Add a focused build contract that proves both Vite HTML entries are emitted,
  generated assets are referenced, and `dist/` is not source-controlled.
- Adapt `tests/browser/transcription-smoke.spec.js` only enough to exercise the
  build and hashed worker; preserve its real MediaRecorder → worker → CORS stub
  → transcript → reload chain.
- Run the browser test twice to retain the WSL readiness regression proof.
- Parse both workflow YAML files and inspect the Pages artifact path.
- Do not add any live Microsoft, Azure, or GitHub request to automated CI.

## Done criteria

- [ ] `@azure/msal-browser@5.17.1` is the sole production dependency and Vite is an exact dev pin.
- [ ] `npm start` serves Vite at exactly `127.0.0.1:4173`; the old supported static server is gone.
- [ ] `npm run build` emits ignored `dist/index.html` and `dist/auth/redirect.html`.
- [ ] The redirect entry runs only the MSAL v5 bridge and contains no app/transcription logic.
- [ ] `npm run test:coverage`, lint, both Knip checks, audit, size, and browser smoke all pass.
- [ ] Coverage thresholds are not lowered.
- [ ] The size budget measures shipped `dist` JavaScript and its new ceiling is justified in the ADR.
- [ ] CI builds before testing the artifact and rejects high/critical vulnerabilities.
- [ ] `.github/workflows/pages.yml` builds and uploads only `dist/`; it contains no private values.
- [ ] No `dist/` file is tracked: `git ls-files dist | wc -l` prints `0`.
- [ ] The ADR is tracked while generated JSDoc HTML remains ignored.
- [ ] No authentication, API-key, UI, Azure, Entra, or live Pages state was changed.
- [ ] Only in-scope files changed and `plans/README.md` was updated as instructed.

## STOP conditions

Stop and report instead of improvising if:

- `gpt-5.6-terra` with high effort is unavailable.
- Either pinned package is unavailable, deprecated, fails the Node 24 baseline,
  or has a high/critical advisory.
- Vite cannot emit `auth/redirect.html` at the exact path for both build bases.
- The bridge requires application logic, a router, a popup, COOP, or a
  frame-blocking header.
- Built Playwright testing would require a production-only test hook or weaken
  the real socket-level CORS/worker assertions.
- The shipped-size increase cannot be bounded and justified without removing or
  silently relaxing the existing size gate.
- Any step requires an Entra, Azure, GitHub Pages, repository variable, or live
  deployment change without fresh operator approval.
- Any real identifier, Target URI, token, authentication response, key, or audio
  would enter a committed file, log, issue, or artifact.
- The implementation starts adding authentication behavior; that belongs to Plan 032.

## Maintenance notes

- MSAL and its redirect bridge form a security-sensitive runtime boundary.
  Dependency upgrades must repeat build, size, callback header, Edge/Chrome/Safari,
  and silent/interactive authentication tests.
- Reviewers should verify the production bundle contains no test alias/hook and
  the callback chunk contains no normal application code.
- `vite preview` is for local verification only; GitHub Pages remains a static host.
- Plan 032 will add public build-time tenant/client configuration and a real
  authentication consumer. Reconcile this plan first if it changes those seams.
