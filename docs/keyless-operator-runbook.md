# Keyless operator runbook

This is a public-safe procedure for future human-operated setup, qualification,
and cutover. Plan 038 completed this procedure on 2026-07-19 against
`keyless-rc-03`; its sanitized completion record is the canonical historical
evidence. For future operations, the authorization rules below still apply.

## 1. Safety and authority

Repository documentation and deterministic tests grant no authority to mutate
Microsoft Entra, Azure, GitHub settings, GitHub environments, Pages, RBAC,
resources, keys, secrets, browser data, or any other external state.

Apply these rules at every stage:

- A human operator owns the procedure. CI and the OIDC workflow may gather only
  the evidence explicitly allowed to them; they can never perform cutover.
- Obtain fresh approval before every external read, identity/federation change,
  role assignment, workflow dispatch, live or billable call, deployment,
  resource update, rollback, key rotation, secret deletion, or browser-data
  cleanup.
- Change one resource at a time. Whisper must complete its full gate before MAI
  begins. Stop at the first unexpected result.
- Never paste, attach, commit, upload, or publish a real tenant, subscription,
  client, principal, role-assignment, resource, resource-group, deployment, or
  workflow-internal identifier; a Target URI; token; key; client credential;
  authentication request/response; response body; Azure/GitHub command output;
  browser console/devtools export; HAR; trace; screenshot; audio; transcript;
  private artifact hash manifest; or private diagnostic.
- Do not enable shell tracing. Do not type literal private values into command
  text or shell history; populate the named shell variables privately and use
  those variables only for the approved command. Never put private values in
  tracked files, artifacts, issue comments, screenshots, or logs.
- Use `--output none` for mutations that might otherwise print sensitive data.
  Query only the one safe boolean when verifying local-authentication state.
- A green automated or live workflow is evidence, not authorization for the
  next stage.

The application remains bearer-only throughout. Never restore an application
key field or fallback as a setup, recovery, or rollback shortcut.

## 2. Private placeholder inventory

Keep actual values in a private operator worksheet, not in this repository.
The angle-bracket forms below describe required private inputs and must never be
replaced in tracked documentation:

| Shell name | Private worksheet value |
|---|---|
| `private_tenant` | `<private-tenant>` |
| `private_subscription` | `<private-subscription>` |
| `private_spa_client_id` | `<private-spa-client>` |
| `private_workload_client_id` | `<private-workload-client>` |
| `private_resource_id` | `<private-resource-id>` for the resource currently gated |
| `private_resource_name` | `<private-resource-name>` resolved from that same ID |
| `private_resource_group` | `<private-resource-group>` resolved from that same ID |
| `private_target_uri` | `<private-target-uri>` held only where the approved stage needs it |
| `candidate_sha` | `<candidate-sha>` for the immutable release under qualification |
| `rollback_sha` | `<rollback-sha>` for the previous production build, retained privately during stabilization |
| `private_repository` | `<private-repository>` used only for approved GitHub CLI operations |
| `private_legacy_secret_name` | `<private-legacy-secret-name>` resolved by name only |
| `private_workflow_run` | `<private-workflow-run>` used to locate approved evidence |

Use separate values for Whisper and MAI. Never reuse one unresolved variable for
both targets, never rely on a wildcard or broad resource group, and unset
operational shell variables when a stage ends.

Public build identifiers for the SPA are not credentials, but they are still
excluded from screenshots, issue output, and reusable evidence artifacts under
this runbook's sanitization policy.

## 3. Azure CLI context preflight

This host provides `az`, `azwho`, `azsubs`, and `azuse`. Before any Azure read or
write, force a conditional-access check, inspect the active context privately,
list available subscriptions, and explicitly select the approved one:

```bash
az account get-access-token -o none
azwho
az account show --query '{name:name, tenant:tenantId, subscription:id}' -o jsonc
azsubs
azuse '<approved-subscription-name-or-id>'
az account show --query '{name:name, tenant:tenantId, subscription:id}' -o jsonc
```

`azuse` is the host wrapper around `az account set --subscription` and then
`azwho`. If the wrapper is unavailable on a future host, use the primary command:

```bash
az account set --subscription '<approved-subscription-name-or-id>'
```

The User must privately confirm the exact tenant and subscription after
selection. Do not assume context from a previous terminal, browser, runbook, or
session. Do not capture the output. Stop if reauthentication fails, context is
ambiguous, or the target cannot be resolved to one exact resource ID with the
expected provider shape.

Primary references: [Azure CLI account
commands](https://learn.microsoft.com/en-us/cli/azure/account?view=azure-cli-latest)
and [Azure CLI generic resource
commands](https://learn.microsoft.com/en-us/cli/azure/resource?view=azure-cli-latest).

## 4. SPA registration

Create or reconcile one User-facing Microsoft Entra application as follows:

1. Select **Accounts in this organizational directory only** (single tenant).
2. Add the **Single-page application** platform.
3. Register exactly these callback URLs:

   ```text
   http://127.0.0.1:4173/auth/redirect.html
   https://ahmedmuhi.github.io/whisper-transcribe/auth/redirect.html
   ```

4. Add only the delegated `Microsoft Cognitive Services / user_impersonation`
   permission needed for the application's
   `https://cognitiveservices.azure.com/.default` request scope.
5. Add no Microsoft Graph permission, application permission, client secret,
   certificate, additional redirect, implicit grant, or multi-tenant audience.
6. Apply the tenant's User/admin consent policy deliberately. Delegated consent
   authorizes the SPA to act on behalf of the signed-in User; Azure RBAC must
   separately authorize that User at each resource. Do not confuse consent with
   resource access.

The app is a public client. A browser cannot protect a client credential, and
this registration must have none.

Primary references: [register a single-tenant
application](https://learn.microsoft.com/en-us/graph/auth-register-app-v2),
[permissions and delegated
consent](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview),
and [MSAL Browser](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/about-msal-browser).

## 5. Application build configuration

Only these public Vite build names configure the SPA registration:

```text
VITE_ENTRA_CLIENT_ID
VITE_ENTRA_TENANT_ID
```

For local development, put their public values in an ignored local environment
file. For Pages, provide the same names as GitHub repository variables consumed
by `.github/workflows/pages.yml`. They are not secrets and must not be confused
with the separately protected OIDC values.

Target URIs are not Vite variables. The User enters one manual HTTPS Target URI
for Whisper and one for MAI in the initials-only User menu. Settings persist
those non-secret destinations locally; they never authorize access. Do not put
them in source, `.env.example`, the Pages build variables, a public issue, or an
evidence artifact.

`AuthenticationService` derives `/auth/redirect.html`, uses full-page redirects,
and configures MSAL's cache in `sessionStorage`. The callback must remain a
separate Vite entry and run only `broadcastResponseToMainFrame`.

Verify both callback responses without beginning sign-in:

- exact HTTP 2xx HTML at the local and Pages callback URLs;
- no `Cross-Origin-Opener-Policy` header;
- no `X-Frame-Options` or Content Security Policy directive that prevents the
  redirect bridge from communicating with the main frame;
- no application bootstrap, Azure call, storage read, source map, or test/live
  authentication provider in the production artifact.

Record only pass/fail for these header checks. Never record an authentication
URL or response. See the [MSAL redirect bridge
requirements](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
and [MSAL cache
configuration](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/configuration).

## 6. User RBAC

The resource owner assigns exactly the role needed by the signed-in User at each
individual resource:

- `Cognitive Services OpenAI User` on the Whisper resource;
- `Cognitive Services Speech User` on the MAI-Transcribe 1.5 resource.

Do not assign at resource-group or subscription scope. Do not add Contributor,
Owner, User Access Administrator, a key-listing role, or a custom broad role to
make a request pass. The app's HTTP 403 guidance diagnoses missing resource
authorization; the app never assigns or verifies a role itself.

Role propagation can take time. Reconfirm the exact assignment privately by
role name, principal, and individual-resource scope, but publish no assignment
or principal identifier.

Primary references: [Azure built-in
roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles)
and [Speech resource
RBAC](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/role-based-access-control).

## 7. GitHub Pages

Configure the repository's Pages publishing source as **GitHub Actions**, never
as a branch. Freeze the reviewed `candidate_sha`, keep `rollback_sha` privately,
and require `.github/workflows/pages.yml` to run at the candidate:

```text
npm ci
npm run build -- --mode pages
actions/upload-pages-artifact with path dist/
actions/deploy-pages through the github-pages environment
```

Verify the workflow head SHA, root page, callback, hashed assets under the
repository base path, and production-bundle exclusions. The deployed `dist/`
necessarily embeds the two public SPA build identifiers; it must contain no
Target URI, credential, live OIDC provider, test token marker, source map, audio,
or private output.

Do not download, attach, or preserve an identifier-bearing deployment artifact
as public evidence. Record the candidate SHA, sanitized workflow URL, outcome,
and header pass/fail only. Rollback during the later stabilization window means
redeploying the privately recorded previous application commit; it does not
automatically change either Azure resource.

Follow GitHub's [custom Pages workflow
contract](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [publishing-source
configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 8. GitHub OIDC

These Plan 035 external stages are future and pending. They require fresh human
approval; do not infer completion from the tracked workflow.

Create a tooling identity separate from the User-facing SPA. It is a dedicated
single-tenant workload application/service principal with:

- one federated credential restricted to this repository's protected
  `live-azure` GitHub Environment subject and the standard Azure token-exchange
  audience;
- no client secret or certificate;
- no subscription requirement in the workflow;
- no management, Reader, RBAC-write, resource-write, key-list/regenerate, or
  local-authentication authority.

The protected environment holds these names without printing their values:

```text
AZURE_OIDC_CLIENT_ID
AZURE_TENANT_ID
AZURE_WHISPER_TARGET_URI
AZURE_MAI_TRANSCRIBE_TARGET_URI
```

The manual workflow grants only `contents: read` and `id-token: write`, pins
Azure Login 3.0.0 to its reviewed release commit, uses
`allow-no-subscriptions: true`, sets `AZURE_CORE_OUTPUT=none`, masks the Cognitive
Services access token before job-local propagation, and always logs out. The
production bundle must exclude the live authentication factory and every OIDC
token marker.

Sequence the evidence stages:

1. Configure federation with zero Azure roles.
2. Run the `authorization-probe` stage. Before either body-blind, no-audio POST,
   it must validate without logging that the token audience, tenant, workload
   client, and lifetime match the protected contract. Each endpoint must then
   return genuine HTTP 401 or 403. Microsoft documents that a 401
   `Principal does not have access to API/Operation` can represent successful
   authentication without data-plane permission, so 401 is accepted only after
   the token contract passes. HTTP 400 means authorization was accepted; every
   other status stops the sequence. See [Microsoft Entra keyless authentication
   troubleshooting](https://learn.microsoft.com/en-us/azure/ai-foundry/model-inference/how-to/configure-entra-id?pivots=ai-foundry-portal&tabs=rest).
3. The human owner assigns `Cognitive Services OpenAI User` to the workload
   principal at the individual Whisper resource and `Cognitive Services Speech
   User` at the individual MAI resource.
4. Run `transcription-contract` at the immutable candidate for exactly one
   harmless request per model, no retry, artifact, trace, screenshot, video, or
   response-body logging.
5. Only after both pass, separately approve deletion of the legacy protected
   key secret by its privately resolved name. Never read it first.

The workflow gathers evidence only. It cannot configure its own federation,
assign its own roles, change a resource, enforce key rejection, rotate a key, or
delete a secret.

Primary references: [GitHub OIDC in
Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure),
[GitHub-to-Azure OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect),
and [Azure Login 3.0.0](https://github.com/Azure/login/releases/tag/v3.0.0).

## 9. Known-caller inventory and browser cleanup

Before resource enforcement, close the key-caller inventory privately and
obtain the resource owner's explicit confirmation that no unlisted application,
secret, script, person, or machine depends on either resource key.

Inventory at minimum:

- deployed Pages and local-development copies in current Edge, Chrome, and
  Safari on macOS;
- every still-open old Whisper Transcribe tab;
- current repository code, workflow/config history relevant to active callers,
  local scripts, shell profiles/history, private notes, password managers, and
  downloaded files;
- repository, environment, and organization GitHub secret names, never values;
- the former live key workflow and the replacement protected OIDC workflow;
- every other application, automation, person, or machine that could call
  either resource.

Safe current-repository checks are:

```bash
git grep -n -E "Ocp-Apim-Subscription-Key|[\"']api-key[\"']|whisper_api_key|mai_transcribe_api_key" -- ':!plans/**'
gh secret list --repo "$private_repository"
gh variable list --repo "$private_repository"
```

Run GitHub CLI only after approval and list names only. Resolve the protected
environment privately before listing its names; never request a secret value.

For each of Edge, Chrome, and Safari on macOS, treat the local origin and Pages
origin separately. The normal migration is the candidate's targeted startup
cleanup, not a broad browser-data wipe:

1. Recover or discard any Unsent Recording and remove Selected Audio before
   cleanup; both are memory-only and closing the tab releases them.
2. Refresh or close every old application tab so no stale JavaScript remains
   active.
3. Open the accepted candidate once at that origin. Before Settings or
   authentication initializes, its idempotent startup migration removes only
   `whisper_api_key` and `mai_transcribe_api_key` without reading either value.
4. Verify the transcript, Target URIs, model, microphone, and theme remain
   intact and that no legacy key field or key-backed request path exists.

Do not clear all site data as part of the key migration: that would also erase
unrelated browser-local configuration and transcript content. A separately
approved sign-out or privacy cleanup may clear a wider origin later, but it is
not evidence that the targeted migration works.

Unopened browser profiles do not block final retirement: resource enforcement
and later four-slot rotation neutralize unknown old copies. Record publicly only
`Known-caller inventory: closed; owner confirmation received`, the date, and the
candidate SHA.

## 10. Pre-cutover evidence

No enforcement begins until one immutable candidate passes every deterministic
gate and the separately approved live evidence. From a clean candidate checkout:

```bash
npm ci
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

Also require normal CI and Pages runs at the same SHA, the frameable callback,
production artifact exclusions, and the exact 12-path matrix:

| Browser | Origins | Models |
|---|---|---|
| current Edge | local and GitHub Pages | Whisper and MAI-Transcribe 1.5 |
| current Chrome | local and GitHub Pages | Whisper and MAI-Transcribe 1.5 |
| current Safari on macOS | local and GitHub Pages | Whisper and MAI-Transcribe 1.5 |

That is 3 browsers × 2 origins × 2 models = 12 separately approved harmless
transcription calls with no planned retry. Real Safari is required; Playwright
WebKit is not Safari evidence.

Across the six browser/origin authentication sessions, verify checking,
signed-out gating, Continue with Microsoft, callback completion, manual Target
URI configuration, no legacy key UI/storage, initials-only User menu, new-tab
silent SSO or explicit interaction fallback, logout, and same-tab token renewal.

Separately approve four invalid-placeholder, no-audio bearer probes: both models
from local and Pages origins. Each must return browser-readable HTTP 401 without
reading a body. Require the protected OIDC token-validated pre-role HTTP 401/403
evidence and post-role one-request-per-model success at the candidate. Preserve
no live audio, transcript, authentication response, identity screenshot, HAR,
trace, response body, or console export.

Any change to authentication, token/request paths, adapters, conversion, Audio
Source gating/recovery, Vite, callback, workflow, Pages, or the built artifact
invalidates affected evidence. A documentation-only correction may reuse live
results only under the reviewed artifact-identical SHA exception in Plan 037.

## 11. Whisper enforcement

This is a future Plan 038 stage. It requires a completed Plan 037 candidate,
closed caller inventory, exact private target resolution, and immediate approval
for Whisper only.

Privately set one exact `private_resource_id` to the verified Whisper resource.
Reconfirm its provider shape and current local-auth state without capturing or
publishing the private inspection. Then enforce and read back only the boolean:

```bash
az resource update --ids "$private_resource_id" \
  --set properties.disableLocalAuth=true --output none

az resource show --ids "$private_resource_id" \
  --query properties.disableLocalAuth --output tsv
```

Require literal `true`. Provider propagation can take several minutes; repeat
only the read-only boolean query at bounded operator-chosen intervals. Do not
assume that property readback proves data-plane enforcement.

With separate approval for potentially billable calls, gate Whisper:

1. one production candidate transcription with the signed-in User's bearer
   token;
2. one protected OIDC Whisper success with no retry;
3. one no-audio request using a privately confirmed currently valid Whisper key
   through the legacy `api-key` header, requiring HTTP 401 or 403 after the
   same key reached a media-layer status before enforcement; and
4. no key request, response body, credential leak, or retry from the app or
   workflow.

The current-key probe must neither echo nor store the key. Use this stdin-only
curl configuration pattern after privately supplying the exact no-audio probe
URL and resource-appropriate legacy header name:

```bash
read -rsp 'Current resource key (not stored): ' current_resource_key; printf '\n'
read -rsp 'Private no-audio probe URL: ' private_probe_url; printf '\n'
read -r -p 'Legacy key header name: ' legacy_header_name

key_status="$({
  printf 'url = "%s"\n' "$private_probe_url"
  printf 'request = "POST"\n'
  printf 'header = "%s: %s"\n' "$legacy_header_name" "$current_resource_key"
  printf 'silent\nshow-error\noutput = "/dev/null"\nwrite-out = "%%{http_code}"\n'
} | curl --config -)"

unset current_resource_key private_probe_url legacy_header_name
test "$key_status" = '401' || test "$key_status" = '403'
unset key_status
```

Before enforcement, a separately approved no-audio probe may establish that the
key is currently valid by requiring a media-layer error without reading its
body. The post-enforcement status must differ from that baseline. Without this
same-key proof, a 401 or 403 could come from an invalid key, wrong endpoint, or
unrelated authorization failure and is not evidence. Microsoft guidance uses
401 for disabled local authentication; individual Cognitive Services data
planes may instead return 403.

If every check passes, leave Whisper enforced and stop for approval before MAI.
If any check fails, perform no more calls, do not touch MAI, and use the rollback
section for Whisper only after fresh approval.

Microsoft documents the `disableLocalAuth` property and propagation behavior in
[Disable local authentication in Foundry
Tools](https://learn.microsoft.com/en-us/azure/ai-services/disable-local-auth).

## 12. MAI enforcement

Begin only after the complete Whisper gate passes and the User gives a new
approval for the distinct MAI resource. Resolve a new exact
`private_resource_id`; never reuse an ambiguous Whisper value.

```bash
az resource update --ids "$private_resource_id" \
  --set properties.disableLocalAuth=true --output none

az resource show --ids "$private_resource_id" \
  --query properties.disableLocalAuth --output tsv
```

Require literal `true`, allow bounded propagation, and verify data-plane
behavior independently:

1. one production candidate MAI transcription with the signed-in User's bearer
   token;
2. one protected OIDC MAI success with no retry;
3. one no-audio request using a privately confirmed currently valid MAI key
   through the legacy `Ocp-Apim-Subscription-Key` header, requiring HTTP 401
   or 403 after the same-key media-layer baseline;
4. no key request, response body, credential leak, or retry from the app or
   workflow.

Use the stdin-only probe pattern from Whisper with the MAI-specific private
inputs. If the MAI gate fails, request approval and roll back MAI only. Whisper
remains enforced. Keep the bearer-only application deployed and stop for a new
diagnostic decision.

## 13. Rollback

Rollback is available only before final key rotation and only for the affected
resource whose gate failed. It requires fresh approval.

```bash
az resource update --ids "$private_resource_id" \
  --set properties.disableLocalAuth=false --output none

az resource show --ids "$private_resource_id" \
  --query properties.disableLocalAuth --output tsv
```

Require literal `false` after propagation. Do not change the other resource.
Leave the bearer-only application deployed. Redeploying the previous
key-dependent application is not this rollback; it requires a separate emergency
decision with its own risk review and authority.

Record only the affected model label, date, failed gate class, rollback
pass/fail, and candidate SHA. Never record a target, command output, response
body, or credential.

## 14. Stabilization decision

The default rollback window starts only after Whisper and MAI independently
pass every enforcement gate and lasts for at least 24 elapsed hours:

- keep `properties.disableLocalAuth=true` on both resources;
- retain the private `rollback_sha` and resource-specific re-enable procedure,
  but do not activate either;
- perform at least one ordinary production session, not only a fixture test;
- monitor sanitized application and workflow outcomes only;
- investigate every unexplained authentication, authorization, CORS, timeout,
  or transcription failure before closing the window;
- rotate no key and delete no private copy or legacy secret.

After the chosen interval, request approval for one final protected two-model
OIDC run. Require one successful call per model, no retry, and both read-only
`disableLocalAuth` queries still returning `true`. Any unexplained error,
missing ordinary-use evidence, retry, or changed candidate keeps the window
open or causes a stop; time alone is insufficient.

For a sole-operator service, the owner may explicitly waive only the elapsed
time after reviewing accepted cross-device production coverage, ordinary use,
both resource-specific enforcement gates, and the final OIDC result. Record
the waiver and its rationale; never record the default interval as having
elapsed. The owner made that waiver for the 2026-07-19 Plan 038 execution after
Windows and macOS acceptance passed.

## 15. Forward-only invalidation

Only after the complete stabilization gate, explain that rotating both slots on
both resources invalidates unknown copied legacy keys and makes this migration
forward-only. Obtain explicit destructive-action approval.

Resolve `private_resource_name` and `private_resource_group` privately from each
already verified resource ID. Confirm both local-auth booleans remain `true`.

The Cognitive Services provider may reject regeneration while
`disableLocalAuth=true`. Handle only one exact resource at a time using this
bounded sequence:

1. set that resource's `disableLocalAuth=false` and verify literal `false`;
2. regenerate its Key1 and Key2 sequentially with `--output none`;
3. immediately set `disableLocalAuth=true` and verify literal `true`;
4. only then repeat for the second resource.

Install an error trap that attempts to set the active resource back to `true`.
Never unlock both resources at once, never call a key-list command, and never
read replacement values. The regeneration commands remain distinct:

```bash
az cognitiveservices account keys regenerate \
  --name "$private_whisper_resource_name" \
  --resource-group "$private_whisper_resource_group" \
  --key-name Key1 --output none

az cognitiveservices account keys regenerate \
  --name "$private_whisper_resource_name" \
  --resource-group "$private_whisper_resource_group" \
  --key-name Key2 --output none

az cognitiveservices account keys regenerate \
  --name "$private_mai_resource_name" \
  --resource-group "$private_mai_resource_group" \
  --key-name Key1 --output none

az cognitiveservices account keys regenerate \
  --name "$private_mai_resource_name" \
  --resource-group "$private_mai_resource_group" \
  --key-name Key2 --output none
```

Never run a key-list command afterward. If either verified resource type does
not support this exact command, stop before rotation and amend the runbook from
provider-authoritative guidance. Do not display, copy, download, or store any
new key. Verify both resources report `disableLocalAuth=true` after the second
resource is re-locked.

Section 8's Plan 035 sequence normally removes the old MAI live-contract secret
after its two-model OIDC success. Re-list secret names only. If that exact
secret is already absent, do not issue another delete. If the closed caller
inventory identified a separate remaining legacy key secret, stop unless its
exact name and ownership are unambiguous, then separately approve deleting only
that secret:

```bash
gh secret delete "$private_legacy_secret_name" \
  --env live-azure \
  --repo "$private_repository"
```

Delete private cutover copies and clear private clipboard/note/shell material.
Unset every operational variable. Confirm both exact resources still report
`disableLocalAuth=true` and the OIDC identity still lacks resource, RBAC, and key
authority. Do not make another transcription solely for closure without
separate approval.

After both slots rotate, re-enabling local authentication is no longer this
runbook's rollback. It becomes a new security incident decision. See the
[Azure CLI key regeneration
reference](https://learn.microsoft.com/en-us/cli/azure/cognitiveservices/account/keys?view=azure-cli-latest#az-cognitiveservices-account-keys-regenerate).

## 16. Sanitized evidence ledger

The public operational issue may contain only these fields:

```text
candidate SHA | date | sanitized workflow URL | browser + version |
origin label | model | pass/fail | HTTP status class | retry count |
approval checkpoint | notes without identifiers
```

Recommended entries:

```text
Prerequisites: pass
Known-caller inventory: closed; owner confirmation received
SPA callbacks: local pass | Pages pass | frameability pass
12-path matrix: 12/12 pass | real Safari confirmed | retries 0
401 boundary: local Whisper pass | local MAI pass | Pages Whisper pass | Pages MAI pass
OIDC: pre-role token-validated 401/403 pass | post-role Whisper pass | post-role MAI pass
Whisper enforcement: boolean true | app bearer pass | OIDC pass | same-key no-audio HTTP 401/403
MAI enforcement: boolean true | app bearer pass | OIDC pass | same-key no-audio HTTP 401/403
Stabilization: default interval met or explicit owner waiver | ordinary session pass | final OIDC pass | unexplained errors 0
Retirement: Whisper unlock/Key1/Key2/re-lock pass | MAI unlock/Key1/Key2/re-lock pass | replacement values unread | legacy secret removed
Final: both resources enforce key rejection | forward-only date recorded
```

Workflow URLs are allowed only when their logs and permissions are already
sanitized; never quote their output. Browser evidence records the browser name
and version, not a profile, account, machine, screenshot, or devtools export.
HTTP evidence records only the status/class required by the gate, never a body.

Before posting, scan the proposed ledger for GUID-shaped values, Azure endpoint
hosts, Target URIs, client/principal/resource/subscription names, token/key
markers, email/user identity, authentication fragments, audio/transcript text,
and private output. If a required claim cannot be made without one of those,
keep the detail private and publish only pass/fail or stop for a new evidence
decision.
