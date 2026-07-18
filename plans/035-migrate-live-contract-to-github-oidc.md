# Plan 035: Migrate the live two-model Azure contract to a least-privilege GitHub OIDC identity

> **Required executor profile**: use `gpt-5.6-terra` with **high** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: Follow this plan step by step. Source changes can
> be prepared and deterministically tested without Azure. Every live,
> potentially billable, Entra, RBAC, GitHub-environment, secret-deletion, or
> workflow-dispatch step requires fresh explicit operator approval at the named
> checkpoint. Never print or upload an access token, Target URI, identity detail,
> audio, response body, trace, HAR, or screenshot. Stop on any STOP condition.
> Update `plans/README.md` when done unless the reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- .github/workflows/live-azure-contract.yml package.json package-lock.json playwright.live.config.js tests/browser-live/ vite.config.js js/api-client.js js/model-adapters/`
> Plan 032 must be complete. Reconcile its token-provider and built-test seams
> before proceeding; a material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/032-replace-api-keys-with-entra-bearer-auth.md`
- **Category**: security
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/118

## Why this matters

The current manually triggered live contract stores an Azure API key in a
GitHub environment and injects it into browser localStorage. That path would
remain a live key-dependent caller after the product becomes keyless. This plan
retains the valuable opt-in service contract, covers both supported models, and
authenticates the workflow through a separate federated workload identity with
only the two required data-plane roles—no API key, client secret, RBAC
management, key listing, or resource configuration authority.

Binding sources:

- Migration/cutover resolution:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/111#issuecomment-5009683428>
- Canonical evidence/authority contract:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>
- GitHub OIDC with Azure:
  <https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect>
- Azure Login v3 documentation: <https://github.com/Azure/login>

## Current state

`.github/workflows/live-azure-contract.yml:1-39` is manual and protected, but
it requires only MAI URI/key secrets and runs one Playwright path:

```yaml
on:
  workflow_dispatch:
jobs:
  live-contract:
    environment: live-azure
    # ...
    env:
      AZURE_MAI_TRANSCRIBE_URI: ${{ secrets.AZURE_MAI_TRANSCRIBE_URI }}
      AZURE_MAI_TRANSCRIBE_API_KEY: ${{ secrets.AZURE_MAI_TRANSCRIBE_API_KEY }}
    run: npm run test:browser:live
```

`tests/browser-live/live-azure.contract.spec.js:7-17` reads the key and writes
it to localStorage:

```js
const key = process.env.AZURE_MAI_TRANSCRIBE_API_KEY;
localStorage.setItem('mai_transcribe_api_key', config.key);
```

`playwright.live.config.js` correctly disables trace, screenshot, and video and
uses a 300-second timeout. Preserve those no-artifact controls.

The existing harmless spoken fixture is
`tests/browser-live/fixtures/spoken-phrase.wav`. It is already repository test
data; do not upload it as a workflow artifact or echo its content. Do not add
personal/live audio.

After Plan 032:

- AzureAPIClient accepts an injected narrow token provider and alone constructs
  `Authorization: Bearer ...`;
- adapters are credential-blind and support exactly Whisper and MAI-Transcribe 1.5;
- a build-time-only authentication factory is the approved deterministic/live
  test seam; production output must contain no test provider.

### Workload identity contract

Create one tooling identity separate from the User-facing SPA registration.
It may be an Entra application/service principal with one GitHub federated
credential. It has:

- no client secret or certificate;
- a federated subject restricted to this public repository's protected
  `live-azure` environment;
- exactly `Cognitive Services OpenAI User` on the Whisper resource;
- exactly `Cognitive Services Speech User` on the MAI resource;
- no subscription/resource-group role, Reader role, RBAC write, resource write,
  key-listing, or configuration authority;
- no permission to disable local authentication or rotate keys.

The workflow requests the Cognitive Services audience. It does not reuse the
SPA registration and does not test interactive MSAL sign-in; Plan 037 owns the
real browser/MSAL matrix.

### Protected configuration names

Use protected `live-azure` environment secrets/variables with names only in
source; never publish their values:

```text
AZURE_OIDC_CLIENT_ID
AZURE_TENANT_ID
AZURE_WHISPER_TARGET_URI
AZURE_MAI_TRANSCRIBE_TARGET_URI
```

No subscription identifier is required by the data-plane contract. Configure
`azure/login@v3` with `allow-no-subscriptions: true` so the identity does not
need a management-plane Reader assignment merely to establish CLI context.

### Live evidence stages

1. Before data-plane roles: authenticate by OIDC and make authorization-only,
   no-audio probes; require genuine HTTP 403 for both endpoints.
2. Human owner assigns the two narrow roles at their individual resources.
3. Run exactly one harmless transcription through each retained model, with no
   Playwright retries. Record sanitized pass/fail, status class, workflow URL,
   commit SHA, and date only.
4. Only after both succeed, delete the legacy MAI API-key GitHub secret.
5. A final two-model run is repeated for Plan 037's immutable candidate and
   after resource cutover in Plan 038.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| List live tests | `npx playwright test --config playwright.live.config.js --list` | exactly the intended OIDC contract cases listed |
| Local guarded run | `npm run test:browser:live` | clear skip/fail-safe when protected configuration/token is absent; no key path |
| Deterministic tests | `npm run test:coverage && npm run test:browser` | all pass; no live call |
| Build/lint/deps | `npm run build && npm run lint && npm run deps:check && npm run deps:check:prod` | all exit 0 |
| Audit/size | `npm audit --audit-level=high && npm run size` | both exit 0 |
| Workflow syntax | `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/live-azure-contract.yml', aliases: true); puts 'valid'"` | prints `valid` |
| Dispatch (approval only) | `gh workflow run live-azure-contract.yml --ref <candidate-sha> -f stage=<stage>` | workflow queued for the exact SHA/stage |

## Suggested executor toolkit

- Use `azure/login@v3`; at plan time v3.0.0 is current. Reconfirm the supported
  major and review release/security notes before changing the workflow.
- Azure Login warns that CLI output is logged by default. Set
  `AZURE_CORE_OUTPUT=none` at job level and use explicit output only while
  capturing the access token into a shell variable.
- Use the existing Playwright live config's no-trace/no-screenshot/no-video
  posture. Never upload a Playwright report from this workflow.
- Use `azure-rbac` guidance if available when the human owner assigns roles, but
  do not grant any broader role to make setup easier.

## Scope

**In-scope repository files (only these):**

- `.github/workflows/live-azure-contract.yml`
- `playwright.live.config.js`
- `package.json` and `package-lock.json` only if the canonical live command changes
- `vite.config.js` (OIDC-live build alias only)
- `tests/browser-live/live-azure.contract.spec.js`
- `tests/browser-live/authorization-probe.contract.spec.js` (create if keeping
  no-audio 403 evidence separate improves safety)
- `tests/browser-live/oidc-authentication-factory.js` (create; live-test build only)
- `tests/browser-live/fixtures/spoken-phrase.wav` (reuse unchanged)
- `tests/live-contract-hygiene.vitest.js` (create for workflow/source scans)

**In-scope external operations, each separately approved:**

- Create one Entra workload app/service principal and one federated credential.
- Add protected environment identifier/Target URI values without printing them.
- Run the pre-role 403 workflow stage.
- Assign the two named resource-scoped data-plane roles.
- Run two potentially billable transcription calls.
- Delete the legacy GitHub environment API-key secret after proof.

**Out of scope:**

- Reusing or modifying the User-facing SPA registration.
- Client secrets/certificates, API keys, subscription/resource-group roles,
  Reader, Contributor, Owner, User Access Administrator, or custom broad roles.
- Any workflow permission to assign RBAC, list keys, change resources, disable
  local auth, rotate keys, or deploy Pages.
- Interactive MSAL/browser sign-in, the 12-path matrix, or Safari evidence.
- Automatic schedule/push/PR triggering; the live workflow remains
  `workflow_dispatch` only and protected.
- Traces, videos, screenshots, HAR, response bodies, logs containing headers,
  or uploaded audio/transcription artifacts.
- Product test hooks, localStorage token injection, or production-bundle OIDC code.

## Git workflow

- Branch: `advisor/035-live-contract-oidc`
- Rebase onto completed Plan 032; Plans 033/034 are not a source dependency.
- Suggested commits:
  1. `test(live): replace key injection with OIDC token provider`
  2. `ci(live): cover both Azure models through protected OIDC`
- Do not push, merge, dispatch, create identities, assign roles, or delete a
  secret unless the operator explicitly authorizes that stage.

## Steps

### Step 1: Make the live browser harness accept an in-memory workload token

Create a Vite live-test mode that aliases the authentication factory to a
test-only provider under `tests/browser-live/`. The provider receives the token
at runtime through a Playwright-exposed function or an equivalently ephemeral
in-process channel. Requirements:

- token is never a Vite environment variable or compiled into `dist/`;
- token is never assigned to `window` data, localStorage, sessionStorage,
  IndexedDB, event history, logs, test annotations, snapshots, or attachments;
- the production build excludes the entire live provider;
- only AzureAPIClient receives it through Plan 032's narrow token provider;
- the live page is ready without invoking interactive MSAL;
- when no token exists, the spec skips/fails safely before any endpoint call.

Configure Target URIs in the isolated browser context as ordinary model
configuration without logging them. Dispose the context after the run.

**Verify**:

```bash
npx vitest run tests/live-contract-hygiene.vitest.js
npm run build
! rg -n "oidc-authentication-factory|AZURE_OIDC|live-contract-token" dist
```

Expected: hygiene tests pass and production output contains no live-test seam.

### Step 2: Expand the contract to both credential-blind adapters

Refactor the live spec to execute exactly these cases when fully configured:

```text
Azure Whisper          -> one harmless transcription -> expected fixture word
MAI-Transcribe 1.5     -> one harmless transcription -> expected fixture word
```

Use the production built app, AzureAPIClient, conversion worker/fallback, model
adapters, and response parsers. Keep Playwright retries at zero and do not add a
controller-level retry. Existing AzureAPIClient bounded retries remain product
behavior; record the observed request count privately and require one POST per
model for clean acceptance.

Assertions must not include or print Target URI, Authorization, response body,
full transcript, identity, or audio. Assert a harmless expected word in memory,
then discard it with the context.

**Verify**:

```bash
npx playwright test --config playwright.live.config.js --list
npm run test:browser:live
```

Expected before protected input: intended cases list; local run makes zero live
requests and reports the explicit guard rather than attempting key fallback.

### Step 3: Add a protected OIDC workflow with no management authority

Rewrite `.github/workflows/live-azure-contract.yml`:

- retain `workflow_dispatch` only;
- add a required `stage` input constrained to `authorization-probe` or
  `transcription-contract`;
- environment remains `live-azure` with human protection;
- permissions exactly `contents: read` and `id-token: write`;
- set `AZURE_CORE_OUTPUT: none`;
- run `azure/login@v3` with protected client/tenant identifiers and
  `allow-no-subscriptions: true`;
- acquire one Cognitive Services access token with:

  ```bash
  az account get-access-token \
    --resource https://cognitiveservices.azure.com \
    --query accessToken -o tsv
  ```

- immediately register the value with `::add-mask::` before passing it through
  `GITHUB_ENV` or another job-local mechanism;
- never echo the token or run `az account show`;
- validate required protected values by presence only;
- install/build/run only the selected stage;
- upload no artifact and leave trace/screenshot/video off;
- always run `az logout`/Azure Login cleanup after the test.

Use shell options that stop on failure, but never `set -x`.

**Verify**:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/live-azure-contract.yml', aliases: true); puts 'valid'"
rg -n "workflow_dispatch|id-token: write|contents: read|azure/login@v3|allow-no-subscriptions|AZURE_CORE_OUTPUT|add-mask|az logout" .github/workflows/live-azure-contract.yml
! rg -n "AZURE_.*API_KEY|pull_request|schedule:|push:|upload-artifact|set -x" .github/workflows/live-azure-contract.yml
```

Expected: syntax valid, required safeguards present, forbidden triggers/key paths absent.

### Step 4: Deterministically prove the workflow cannot leak or broaden authority

Add source-level tests that parse/inspect the workflow and live harness:

- exact permissions;
- protected environment;
- manual trigger only;
- no subscription ID requirement and no management command;
- no API-key variable/header/storage path;
- no artifact upload/trace/video/screenshot;
- token masked before environment propagation;
- both model cases;
- production build excludes the provider;
- absent configuration makes zero fetches.

Do not mock a green live service and call that OIDC evidence; these are hygiene
tests only.

**Verify**:

```bash
npx vitest run tests/live-contract-hygiene.vitest.js
npm run lint
npm run test:coverage
npm run test:browser
```

Expected: all deterministic gates pass with zero Azure request.

### Step 5: Approval checkpoint — create the federated tooling identity

STOP and request explicit approval before this external stage, even if prior
planning approval exists.

After approval, the human/operator:

1. confirms Azure CLI context per host rules (`az account get-access-token -o none`,
   then `azwho`/`az account show`; never assume subscription/tenant);
2. creates a dedicated single-tenant workload application/service principal;
3. creates one GitHub federated identity credential restricted to the
   `live-azure` environment subject and standard Azure token-exchange audience;
4. creates no secret/certificate;
5. assigns no Azure role yet;
6. stores only the protected identifier values/Target URIs in the GitHub
   environment without printing them.

Record privately the object references needed for cleanup/operations. Public
evidence records only “workload identity + environment federation configured.”

**Verify (sanitized)**:

```text
Federated login succeeds; no client credential exists; zero Azure RBAC roles are assigned.
```

Do not paste command output into the issue.

### Step 6: Approval checkpoint — prove genuine pre-role HTTP 403

Request approval to dispatch the `authorization-probe` stage. It obtains a real
OIDC token and sends an authorization-only POST without audio to each endpoint.
Require browser/process-readable HTTP 403 for both. A 400 means authorization
was accepted and the probe is invalid; a 401 means token/audience/federation is
wrong. Stop on either rather than relabeling it.

The workflow must suppress response bodies and endpoint values. Record only:

```text
candidate SHA | workflow URL | date | Whisper HTTP 403 | MAI HTTP 403
```

**Verify**: the protected workflow completes its expected-denial stage with two
403 statuses and zero audio/transcription call.

### Step 7: Approval checkpoint — assign exactly two narrow roles

Request explicit RBAC approval. The human owner assigns:

- `Cognitive Services OpenAI User` at the individual Whisper resource;
- `Cognitive Services Speech User` at the individual MAI resource.

Do not grant at resource-group/subscription scope. Do not let the workload
identity assign its own role. Privately verify effective assignments by role
name/scope; publish no principal/resource/role-assignment identifier.

**Verify (sanitized)**: exactly two expected resource-scoped data-plane roles;
no management/key-list/configuration role.

### Step 8: Approval checkpoint — run the two-model live contract

Request approval for exactly two potentially billable harmless requests. Pin
the workflow to the exact candidate/ref under review. Require:

- OIDC login through the protected environment;
- one successful Whisper POST and expected word;
- one successful MAI POST and expected word;
- no retry, artifact, trace, screenshot, video, response body, or log warning;
- no key/localStorage token path;
- sanitized workflow evidence only.

If either model fails, stop. Do not add a role, secret, key fallback, or broad
permission ad hoc.

### Step 9: Approval checkpoint — delete the legacy GitHub API-key secret

Only after Step 8 succeeds, request approval and delete the old MAI API-key
secret from the protected `live-azure` environment. Do not read it first and do
not recreate it under another name. Confirm presence/absence by secret name only.

Retain the two Target URI configurations and OIDC identifiers. The final live
workflow must fail clearly if OIDC configuration is absent; it must never look
for the deleted key.

**Verify (sanitized)**: legacy API-key secret name absent; OIDC contract can be
dispatched again without it.

### Step 10: Run the integrated non-live gates

```bash
npm run build
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
npx playwright test --config playwright.live.config.js --list
git diff --check
```

Expected: all deterministic gates pass; live cases list but do not run without
protected inputs.

## Test plan

- Source-level workflow hygiene assertions for permissions, triggers,
  environment, token masking, no key path, no artifacts, and no management commands.
- Production-bundle scan proving the OIDC live provider/token markers are absent.
- Local absent-config run proving zero fetch and no fallback.
- Test-build-only Playwright contract for both production adapters.
- One real pre-role 403 per model, no audio, after explicit approval.
- One real successful transcription per model after exact roles, after approval.
- Repeat the two-model success at Plan 037's immutable SHA and Plan 038 cutover.

## Done criteria

- [ ] Live workflow is protected and manual-only with exact OIDC permissions.
- [ ] Separate workload identity has no secret/certificate and no management/key authority.
- [ ] Identity federation is restricted to the repository's protected environment.
- [ ] Pre-role authorization-only probes produce genuine 403 for both endpoints.
- [ ] Exactly the two named resource-scoped roles are assigned.
- [ ] Live contract covers Whisper and MAI through production client/adapters with one clean POST each.
- [ ] Token remains process/browser memory only and is masked; no token/key enters storage/logs/artifacts.
- [ ] Production build contains no OIDC test provider or token marker.
- [ ] Legacy API-key workflow path and GitHub secret are removed only after success.
- [ ] No subscription/resource management, RBAC write, key listing, local-auth, or rotation authority exists in CI.
- [ ] Sanitized evidence records SHA/workflow/date/status classes only.
- [ ] All deterministic quality/security gates pass.
- [ ] Only in-scope files/external stages changed and `plans/README.md` was updated as instructed.

## STOP conditions

Stop and report instead of improvising if:

- `gpt-5.6-terra` with high effort is unavailable.
- Plan 032's token-provider/client boundary is incomplete or would require a production test hook.
- OIDC requires a client secret/certificate, subscription-wide role, Reader,
  management permission, key access, or reuse of the SPA registration.
- The workflow token cannot be masked before propagation or could enter an artifact/log/trace.
- A pre-role probe returns anything other than genuine 403; diagnose federation,
  audience, existing role, endpoint, and request order privately before proceeding.
- Either successful model call retries, returns unexpected content, or needs a broader role.
- Any step would expose a real identifier, Target URI, token, key,
  authentication response, audio, transcript, HAR, or identity-bearing screenshot.
- The operator has not explicitly approved the current external/live stage.
- Direct browser/data-plane behavior fails after known configuration causes are
  exhausted. Do not create a backend or key fallback; return to Wayfinder.

## Maintenance notes

- OIDC federation and the User-facing MSAL SPA are intentionally different
  identities and flows. Never consolidate them for convenience.
- Keep Azure Login and other actions on reviewed supported majors; action
  upgrades require renewed permission/logging review.
- The workflow produces evidence only. It must never automate RBAC or resource cutover.
- Plan 037 repeats the live contract at the immutable candidate SHA; Plan 038
  repeats it after each resource disables local authentication.
