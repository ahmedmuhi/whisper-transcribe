# Plan 037: Qualify one immutable keyless release candidate across CI, Pages, and all 12 browser paths

> **Required executor profile**: use `gpt-5.6-sol` with **extra-high (`xhigh`)** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: This is an evidence and release-candidate plan, not
> a bug-fixing plan. Freeze one commit, run the required gates against it, and
> record only sanitized evidence. If code/config/build/deployment behavior must
> change, invalidate the candidate, return to the owning implementation plan,
> create a new commit, and restart every affected gate. Every Pages, Microsoft,
> Azure, browser-live, potentially billable, or OIDC dispatch requires explicit
> operator approval. Stop on every STOP condition. Update `plans/README.md` when
> done unless the reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- package.json package-lock.json vite.config.js auth/ js/ index.html css/ tests/ playwright.config.js playwright.live.config.js .github/workflows/ README.md CLAUDE.md .env.example plan/2.0-design.md spec/ docs/`
> Plans 031–036 must be implemented and reconciled. This expected broad diff is
> the candidate under test; any further unreviewed change after freezing is a
> STOP/invalidation condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 031, 032, 033, 034, 035, and 036
- **Category**: validation
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/120

## Why this matters

Wayfinder proved the architecture with a disposable harness, not that the final
production implementation is correct. Acceptance must belong to one immutable
commit whose exact artifact is built by CI, deployed to GitHub Pages, exercised
in real Edge/Chrome/Safari sessions, and used by the OIDC contract. This plan
prevents a green result from one revision being cited for a different release
and makes every live/security claim auditable without publishing sensitive data.

Binding source:
<https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>.

## Current state and required candidate contract

The completed implementation must provide:

- Vite production build with the main app and `/auth/redirect.html` bridge;
- sole production dependency `@azure/msal-browser` at the approved exact pin;
- Actions-built Pages artifact, no committed `dist/`;
- single-tenant redirect-only MSAL with sessionStorage and silent readiness;
- direct browser-to-Azure bearer requests for exactly Whisper and MAI-Transcribe 1.5;
- no key inputs/headers/fallback; remove-only startup cleanup;
- authentication-safe recording and Selected Audio;
- accepted User menu/upload interactions;
- protected two-model GitHub OIDC contract;
- reconciled docs/ADR/runbook.

Prior Wayfinder issue 113 is supporting feasibility evidence only. Do not cite
its four prototype POSTs as release acceptance.

### Immutable candidate rule

Record one full 40-character Git SHA before testing. Every result must identify
that SHA. GitHub Pages must serve `dist/` built from it, and each workflow run's
`headSha` must match it.

Any change to these areas invalidates affected live evidence:

```text
authentication | token/request path | model adapters | audio conversion |
UI gating/recovery | Vite/build | callback | workflow | Pages deployment
```

A documentation-only correction may reuse live/billable results only when:

1. `git diff <tested-sha>..<new-sha>` contains docs/metadata that provably cannot
   alter `dist/`, workflow, config, or tests;
2. production artifact hashes are identical;
3. normal CI/docs gates rerun on the new SHA;
4. the exception and both SHAs are recorded in the sanitized ledger.

Never remove a User's Azure role merely to recreate 403. The workload identity's
pre-role 403 from Plan 035 may carry forward only under the exact artifact-identical
documentation exception above; otherwise stop and agree a safe evidence strategy.

### Live success matrix

Twelve cells, exactly:

| Browser | Origin | Model |
|---|---|---|
| current Edge | local `http://127.0.0.1:4173` | Whisper |
| current Edge | local | MAI-Transcribe 1.5 |
| current Edge | GitHub Pages | Whisper |
| current Edge | GitHub Pages | MAI-Transcribe 1.5 |
| current Chrome | local | Whisper |
| current Chrome | local | MAI-Transcribe 1.5 |
| current Chrome | GitHub Pages | Whisper |
| current Chrome | GitHub Pages | MAI-Transcribe 1.5 |
| current Safari on macOS | local | Whisper |
| current Safari on macOS | local | MAI-Transcribe 1.5 |
| current Safari on macOS | GitHub Pages | Whisper |
| current Safari on macOS | GitHub Pages | MAI-Transcribe 1.5 |

Use real installed browsers. Playwright WebKit is not Safari evidence. Each cell
makes one approved harmless transcription request with no planned retry. A
retry/failure is recorded and investigated; do not silently make extra calls.

For each browser/origin session (six sessions), also prove:

- checking state appears before readiness;
- while signed out, recording and Upload audio are unavailable;
- Continue with Microsoft completes the redirect bridge when interaction is needed;
- Target URI remains manual, non-secret configuration;
- no legacy key entry remains;
- no application token appears in ordinary localStorage, Settings, event history, or logs;
- one new-tab attempt uses silent SSO when possible and displays explicit
  Continue with Microsoft when browser policy requires interaction;
- account menu identity is dynamic and logout returns to signed-out gating.

Use the same harmless local fixture for consistency; do not attach it or the
transcript to evidence. The deterministic suite, not the live matrix, owns all
UI error variants and microphone/Selected Audio behavior details.

### Additional real-service boundaries

- Same-tab silent token acquisition/renewal without an hourly password/MFA
  prompt; record only pass/fallback. If proving actual expiry requires a long
  session, use one matrix cell after expiry rather than adding an unapproved call.
- Safari new-tab/third-party-cookie failure must degrade to explicit full-page
  Continue with Microsoft, never popup/backend.
- Four invalid-placeholder, no-audio bearer probes: both models from local and
  Pages origins. Require browser-readable HTTP 401; do not read/log body.
- Plan 035: genuine pre-role OIDC 403 for both endpoints and post-role successful
  two-model OIDC contract.

### Sanitized evidence ledger

Maintain one comment/checklist on this plan's GitHub issue containing only:

```text
candidate SHA | date | workflow URL | browser + version | origin label |
model | pass/fail | HTTP status class | retry count | notes without identifiers
```

Never attach/paste auth traces, identity screenshots, HAR, devtools exports,
tokens, headers, Target URIs, resource/tenant/client/principal/subscription IDs,
audio, transcripts, response bodies, or private console output.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Freeze SHA | `candidate_sha=$(git rev-parse HEAD); test -n "$candidate_sha"; printf '%s\n' "$candidate_sha"` | one 40-character SHA |
| Clean install | `npm ci` | exit 0 |
| Production build | `npm run build` | exit 0; main + callback emitted |
| Full automated baseline | `npm run lint && npm run test:coverage && npm run deps:check && npm run deps:check:prod && npm audit --audit-level=high && npm run size && npm run test:browser` | all exit 0 |
| Production deps | `npm ls --omit=dev --depth=0` | only approved MSAL production package |
| Clean tree | `git status --short` | empty in candidate worktree |
| CI watch (approval after push) | `gh run watch <run-id> --exit-status` | CI succeeds for candidate SHA |
| Pages watch (approval) | `gh run watch <pages-run-id> --exit-status` | deploy succeeds and head SHA matches |
| OIDC watch (approval) | `gh run watch <oidc-run-id> --exit-status` | two-model protected run succeeds at candidate SHA |

## Suggested executor toolkit

- Use browser-testing-with-devtools for real Edge/Chrome and actual Safari on
  macOS; do not replace Safari with an emulator.
- Use GitHub CLI only to inspect/dispatch/watch approved workflows and record
  their public URLs—not to print protected settings.
- Use the runbook from Plan 036 for private setup and evidence templates.
- Use a spreadsheet/private scratchpad for sensitive execution details, then
  transcribe only sanitized outcomes to the public ledger.

## Scope

**In-scope repository mutation:**

- `plans/README.md` status only, unless the reviewer maintains it.
- No product, test, workflow, config, or documentation file may change while a
  candidate is under qualification.

**In-scope external actions, each explicitly approved:**

- Push/tag/ref needed to expose the exact candidate to CI/workflows.
- Configure GitHub Pages publishing source as GitHub Actions if not already done.
- Configure protected public SPA build variables privately if not already done.
- Deploy the candidate Pages artifact.
- Real Microsoft sign-in/new-tab/renewal checks.
- Exactly 12 harmless potentially billable transcription calls for the matrix.
- Four invalid-placeholder, no-audio 401 probes.
- Protected two-model OIDC run (and Plan 035 evidence completion if pending).
- Post sanitized evidence to this plan's public issue.

**Out of scope:**

- Fixing any defect inside this issue; invalidate and return to owning plan.
- Azure local-auth change, key test/rotation, secret deletion not already owned
  by Plan 035, or resource rollback (Plan 038).
- New Entra permission, broader RBAC, backend, key fallback, multi-tenant, model,
  endpoint discovery, or test bypass.
- Screenshots/HAR/traces/artifact uploads containing identity or request data.
- Automated CI promotion from green tests into Azure enforcement.

## Git workflow

- Qualification ref: use a dedicated candidate branch/tag pointing at the exact
  SHA; record SHA, never rely only on a mutable branch name.
- No commits during qualification. Any required commit creates a new candidate.
- Do not merge/push/tag/deploy unless the operator instructs that action.

## Steps

### Step 1: Reconcile all prerequisites without changing state

Read Plans 031–036 status/done criteria and verify their implementation exists.
Confirm privately that:

- SPA registration/callbacks from Wayfinder remain available;
- protected Pages public identifier variables are configured or ready;
- manual Target URIs and required User RBAC exist;
- OIDC identity/workflow/roles are ready or staged per Plan 035;
- no known key caller remains except the legacy workflow path scheduled for deletion;
- Pages still serves the old app until approved candidate deployment, if applicable.

Do not read secret/key values. If a prerequisite is incomplete, stop and finish
its plan rather than marking it accepted here.

**Verify**: prerequisite checklist on the private runbook is complete; public
ledger says only `Prerequisites: pass` or names a non-sensitive blocker.

### Step 2: Freeze and fingerprint the candidate

Use a clean worktree/checkout of the intended commit. Record:

```bash
candidate_sha=$(git rev-parse HEAD)
git status --short
git show -s --format='%H %cI %s' "$candidate_sha"
npm ci
npm run build
find dist -type f -print0 | sort -z | xargs -0 sha256sum > /tmp/whisper-transcribe-dist.sha256
```

Keep the artifact hash manifest private/local; post only one aggregate SHA-256
if useful, not filenames containing anything sensitive. Confirm `dist/` has no
source maps unless explicitly reviewed and safe.

**Verify**: clean tree; one candidate SHA; deterministic second clean build has
identical file hashes.

### Step 3: Run the complete automated quality/security baseline

From the clean candidate:

```bash
npm run build
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
npm ls --omit=dev --depth=0
git status --short
```

Also run the final automated security scans/tests from Plans 032–035 proving:

- remove-only key cleanup, no read/rewrite;
- no key input/header/path outside cleanup;
- tokens absent from settings/localStorage/events/adapters/logs/app cache;
- signed-out and interaction-required Audio Source gating;
- 401/403 no retry; 429/5xx bounded retry;
- Unsent Recording/Selected Audio navigation safety;
- accepted menus/upload/accessibility/responsive behavior;
- test providers absent from production bundle.

Do not lower/focus/skip a gate. A failure invalidates the candidate.

**Verify**: every command exits 0; worktree remains clean.

### Step 4: Verify candidate CI at the exact SHA

After explicit approval to push the candidate ref, require the normal CI
workflow to succeed. Inspect run metadata and confirm `headSha` equals
`candidate_sha`. Preserve only workflow URL/status/SHA in the public ledger.

If CI rebuild hashes differ from local due to nondeterministic output, investigate
before proceeding. Do not accept “local green” as CI evidence.

### Step 5: Approval checkpoint — deploy the exact Pages artifact

Request explicit approval to switch Pages from legacy branch publishing to
GitHub Actions (if not already switched) and dispatch/allow Plan 031's Pages
workflow for the candidate ref.

After deployment verify:

- workflow `headSha` is candidate SHA;
- site root HTTP 2xx;
- `/auth/redirect.html` HTTP 2xx HTML;
- callback has no COOP or frame-blocking X-Frame-Options header;
- main assets load under `/whisper-transcribe/` with no 404;
- no source map/test bundle/live OIDC provider is publicly served;
- browser console is clean before sign-in.

Record only sanitized headers relevant to frameability (presence/absence), never
auth response/request data.

### Step 6: Approval checkpoint — exercise six browser/origin auth sessions

Request approval for real Microsoft interactions. For current Edge, Chrome, and
Safari on macOS, test local and Pages sessions:

1. start with the app signed out for that tab/origin;
2. confirm checking then Continue; recording/upload remain unavailable;
3. complete full-page redirect through the exact bridge;
4. confirm dynamic User identity/menu and ready state;
5. inspect application-owned storage/events/logs without copying MSAL cache;
   legacy keys absent and no application token present;
6. open a new tab and observe best-effort silent SSO or explicit Continue;
7. in Safari, confirm privacy restrictions degrade to interactive redirect, not
   popup/backend/error loop;
8. verify logout returns to signed-out gating without deleting non-secret settings/transcript.

Do not capture identity-bearing screenshots or authentication traces. Record
browser/version/origin/pass/fallback only.

### Step 7: Approval checkpoint — run the 12 successful transcription cells

Request approval for exactly 12 potentially billable calls. For each cell in
the table:

- use the configured manual Target URI privately;
- select the named model;
- choose the same harmless local Audio Source;
- verify review then explicit Transcribe (no selection auto-send);
- observe exactly one POST/no retry;
- require browser-readable HTTP 2xx and expected harmless word;
- confirm ordinary completion and no credential/token leak.

If a cell fails or retries, stop that browser/origin/model sequence, record a
sanitized failure, and diagnose without making unapproved extra calls. Do not
substitute another browser for Safari.

### Step 8: Approval checkpoint — prove live 401 readability without audio

From local and Pages application origins, use a private devtools/controlled
browser expression with an obviously invalid placeholder bearer value and no
audio/body. For each retained endpoint, inspect only `response.status`; never
read body or capture network export. Expected four results:

```text
local Whisper 401 | local MAI 401 | Pages Whisper 401 | Pages MAI 401
```

These probes cannot transcribe and are separate from the 12 approved calls.
Any CORS-masked error or non-401 invalidates the boundary and requires diagnosis.

### Step 9: Complete the candidate OIDC evidence

Require Plan 035's protected workflow to reference the candidate SHA and:

- preserve the genuine pre-role 403 evidence (exact candidate or the strict
  artifact-identical docs exception);
- succeed for both models after narrow roles;
- make one clean POST per model/no retry;
- expose no key/secret/artifact;
- record workflow URL/date/status only.

Do not remove roles merely to recreate denial. If earlier evidence cannot carry
forward safely, stop and request a new evidence decision.

### Step 10: Verify silent renewal and ordinary use

In one approved browser/origin session, keep the app active through a token
renewal boundary or use an already-approved non-production test technique that
causes MSAL to perform a real silent renewal without exposing tokens. The User
should see no password/MFA prompt unless tenant policy requires interaction. If
interaction is required, verify explicit safe recovery.

Fold the successful post-renewal transcription into one of the 12 cells where
possible. Do not add a thirteenth billable call without approval.

### Step 11: Close and independently audit the sanitized ledger

Check every matrix cell and workflow entry against actual evidence. A second
human/reviewer should verify:

- all references use candidate SHA;
- 12 distinct cells, no simulated Safari;
- approved call/probe counts reconcile;
- OIDC/CI/Pages run links match SHA;
- no sensitive text/artifact is attached;
- failures/retries are not omitted;
- candidate worktree remains clean.

Only then mark Plan 037 DONE and authorize Plan 038 to begin.

## Test plan

- Automated: clean install/build; full lint/coverage/Knip/audit/size/Playwright;
  security scans and built-output test-double exclusion.
- GitHub: CI + Pages + OIDC workflows at exact candidate SHA.
- Real auth: six browser/origin sessions, new-tab behavior, Safari fallback,
  same-tab silent renewal.
- Live success: exactly 12 model/origin/browser cells with harmless fixture.
- Live failure boundary: four invalid-placeholder/no-audio browser-readable 401s;
  Plan 035's genuine OIDC 403 before roles.
- Evidence: sanitized ledger audit and approved call-count reconciliation.

## Done criteria

- [ ] One 40-character immutable candidate SHA anchors every non-exempt result.
- [ ] Two clean builds are artifact-identical and no test/source-map leakage is served.
- [ ] Every automated quality/security gate passes without weakening thresholds.
- [ ] CI, Pages, and OIDC workflow head SHAs match candidate (or documented artifact-identical docs exception for pre-role 403 only).
- [ ] Pages serves main app and frameable callback from the built `dist/` artifact.
- [ ] Six real auth sessions pass across Edge/Chrome/Safari × local/Pages.
- [ ] All 12 successful model/origin/browser cells pass with no planned retry.
- [ ] New-tab and silent-renewal behavior degrade correctly when interaction is required.
- [ ] Four no-audio invalid-bearer probes return browser-readable 401.
- [ ] Genuine pre-role OIDC 403 and post-role two-model successes are recorded safely.
- [ ] Ledger contains only allowed fields and approved call counts reconcile.
- [ ] Candidate worktree remains clean; no source/config changed during qualification.
- [ ] Explicit approvals were obtained for every external/live stage.
- [ ] `plans/README.md` was updated as instructed.

## STOP conditions

Stop and invalidate/report instead of improvising if:

- `gpt-5.6-sol` with extra-high (`xhigh`) effort is unavailable.
- Any prerequisite plan is incomplete or docs/code disagree.
- Worktree is dirty, build is nondeterministic, or workflow head SHA differs.
- Any automated gate fails, is skipped, focused, weakened, or requires source change.
- Pages does not serve the exact callback/artifact or sends incompatible headers.
- A browser requires popup/backend/key fallback, or Safari is replaced by WebKit simulation.
- Any matrix call fails/retries and additional calls lack approval.
- 401 is CORS-masked/non-401, or OIDC evidence lacks genuine 403/narrow-role success.
- Candidate code/build/deploy/auth/request changes after evidence starts.
- Any real identifier, Target URI, token, key, auth response, audio, transcript,
  HAR, trace, or identity-bearing screenshot would enter public evidence.
- An external/live action lacks explicit approval.

## Maintenance notes

- This ledger is the acceptance record for one release only. Later auth/request/
  build/deployment changes require a new candidate and affected evidence.
- Keep simulated application states deterministic; reserve real services only
  for boundaries a test double cannot prove.
- Green CI never grants authority to begin Plan 038. The User explicitly starts
  each cutover stage after reviewing this ledger.
