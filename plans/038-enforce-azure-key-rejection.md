# Plan 038: Enforce Azure key rejection one resource at a time and retire every legacy key

> **Required executor profile**: use `gpt-5.6-sol` with **extra-high (`xhigh`)** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: This is the final human-operated production
> cutover. Do not change application code, broaden RBAC, or let a workflow
> modify Azure configuration. Confirm the active Azure tenant/subscription,
> obtain explicit approval immediately before every external stage, change one
> resource at a time, and stop at the first failed gate. Never print or publish
> a real identifier, URI, key, token, audio, transcript, authentication body,
> or private diagnostic. Update `plans/README.md` when done unless the reviewer
> maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- package.json package-lock.json vite.config.js auth/ js/ index.html css/ tests/ playwright.config.js playwright.live.config.js .github/workflows/ README.md CLAUDE.md .env.example plan/2.0-design.md spec/ docs/`
> Compare the result with the immutable candidate accepted by Plan 037. Any
> candidate mismatch or unqualified behavior change is a STOP condition.

> **Completion amendment (2026-07-19)**: This plan is complete against
> immutable candidate `95fd3f46533c1807844f3ec9e1dee55bf1111335`
> (`keyless-rc-03`). The owner explicitly waived the planned 24-hour waiting
> period after the accepted Windows and macOS production coverage, ordinary
> use, both resource-specific bearer gates, and a final protected two-model
> OIDC run. The Azure data plane returned HTTP 403—not the generically
> documented HTTP 401—for a privately verified current key after enforcement;
> the same keys reached media validation before enforcement (Whisper HTTP 400,
> MAI HTTP 415), both Entra bearer paths continued to succeed, and no response
> body was read. The provider also rejected key regeneration while
> `disableLocalAuth=true`. Each resource was therefore handled independently:
> temporarily enable local authentication, regenerate Key1 and Key2 with no
> output, immediately disable local authentication again, and verify literal
> `true` before touching the next resource. Replacement key values were never
> read. Both resources are now enforced, the legacy CI key secret is absent,
> and the migration is forward-only. This amendment supersedes the narrower
> 401-only, mandatory-wait, and rotate-while-disabled instructions below for
> this completed execution; those original clauses remain as planning history.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: CRITICAL
- **Depends on**: Plan 037
- **Category**: migration
- **Status**: DONE (2026-07-19)
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/121

## Why this matters

Removing API keys from Whisper Transcribe does not prevent another old tab,
script, copied key, or retired workflow from authenticating while Azure local
authentication remains enabled. The destination is resource-enforced
keylessness: both retained model resources reject keys, while the production
application and the narrow GitHub OIDC workload continue to transcribe with
Microsoft Entra bearer tokens.

This operation is deliberately last. Plan 037 must first prove one immutable
keyless release candidate across CI, Pages, Edge, Chrome, Safari, both origins,
and both models. Green tests never grant permission to perform this cutover.

Binding source:
<https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>.

## Current state and final contract

At planning time:

- the browser application still has an API-key implementation;
- Azure local authentication remains enabled on both resources;
- the legacy live contract uses a stored MAI key;
- no Azure resource, RBAC assignment, key slot, or GitHub secret is changed by
  this plan document.

Plans 031–037 must leave the system in this pre-cutover state:

- production is fully keyless and has no API-key input/header/fallback;
- startup removes only `whisper_api_key` and `mai_transcribe_api_key` without
  reading their values;
- the accepted candidate is deployed and its 12 browser paths pass;
- the protected GitHub OIDC identity has only the exact data-plane
  transcription roles and succeeds for both models;
- all known non-key callers have been migrated or retired;
- key authentication is still temporarily accepted by Azure solely as a
  human-controlled rollback boundary.

The final order is fixed:

```text
closed caller inventory
  -> approve + enforce Whisper
  -> verify bearer app + OIDC success + same-key rejection
  -> approve + enforce MAI-Transcribe 1.5
  -> verify bearer app + OIDC success + same-key rejection
  -> owner-reviewed stabilization decision + final OIDC run
  -> unlock, rotate both slots, and immediately re-lock one resource at a time
  -> delete legacy secret/private cutover copies
  -> declare forward-only
```

Do not combine the two enforcement changes into one command or approval.

## Required Azure context discipline

This WSL host shares the User's Windows Azure CLI profile. Before any Azure
read or write, force conditional-access reauthentication and establish context:

```bash
az account get-access-token -o none
azwho
az account show --query '{name:name, tenant:tenantId, subscription:id}' -o jsonc
azsubs
```

Privately compare the result with the intended tenant/subscription. Do not
assume either from a previous session. If the context is wrong, select the
approved subscription with one of:

```bash
azuse '<approved-subscription-name-or-id>'
# or
az account set --subscription '<approved-subscription-name-or-id>'
```

Run `az account show` again and ask the User to confirm. Never paste its values
into the public issue. If the intended tenant/subscription is uncertain, STOP.

Resolve each resource privately to an exact Azure resource ID. Do not put IDs,
names, groups, endpoints, or Target URIs in shell history, plan comments, issue
comments, logs, screenshots, or artifacts. Use shell variables populated from
the private operator worksheet, and unset them when the stage completes:

```bash
read -rsp 'Whisper resource ID: ' whisper_resource_id; printf '\n'
read -rsp 'MAI resource ID: ' mai_resource_id; printf '\n'
test -n "$whisper_resource_id" && test -n "$mai_resource_id"
test "$whisper_resource_id" != "$mai_resource_id"
```

Before writing, inspect each exact target read-only and privately confirm its
resource type, name, group, location, and current `disableLocalAuth` property:

```bash
az resource show --ids "$whisper_resource_id" \
  --query '{type:type,name:name,resourceGroup:resourceGroup,location:location,disableLocalAuth:properties.disableLocalAuth}' -o jsonc
az resource show --ids "$mai_resource_id" \
  --query '{type:type,name:name,resourceGroup:resourceGroup,location:location,disableLocalAuth:properties.disableLocalAuth}' -o jsonc
```

These commands reveal private identifiers in the terminal; do not capture or
publish the output. If either resource does not expose the expected property or
is not the privately inventoried transcription resource, STOP. Do not guess a
different provider/API shape.

## Known-caller inventory gate

A shared key cannot prove who copied it, so absolute deletion proof is
impossible. The accepted gate is a closed inventory plus the User's explicit
confirmation that no other caller depends on either resource key.

Privately inventory, at minimum:

- production GitHub Pages in current Edge, Chrome, and Safari profiles;
- local-development copies in those profiles;
- every still-open old application tab;
- repository code, history-relevant workflow/config, local scripts, shell
  profiles/history, private notes, password managers, and downloaded files;
- repository/environment/organization GitHub secret **names** (never values);
- the former manual live-Azure contract and its replacement OIDC workflow;
- other applications, automations, people, or machines that could use either
  key.

Safe repository/current-configuration checks include:

```bash
git grep -n -E "Ocp-Apim-Subscription-Key|[\"']api-key[\"']|whisper_api_key|mai_transcribe_api_key" -- ':!plans/**'
gh secret list --repo ahmedmuhi/whisper-transcribe
gh variable list --repo ahmedmuhi/whisper-transcribe
```

List protected-environment secret names only after privately resolving the
environment name from the implemented workflow. Never use an API call that
attempts to reveal secret values.

Require the User to state explicitly that the inventory is complete and no
unlisted application, secret, script, person, or machine depends on either key.
Do not wait for unopened browser profiles: resource-side enforcement and later
rotation neutralize those copies. Tell the User to close or refresh every old
Whisper Transcribe tab before the first resource change; an already-open tab
cannot be remotely replaced.

## Private valid-key rejection probe

Each resource gate requires a **currently valid** resource key to receive HTTP
401 after local authentication is disabled. It must send no audio and must not
read a response body. Do not put the key in a command argument, history, file,
environment variable, log, or issue.

Use the privately verified endpoint and resource-appropriate legacy header name.
The following pattern reads the key without echo and sends curl configuration
through standard input, so the key is neither an argument nor a file:

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
test "$key_status" = '401'
unset key_status
```

Before enforcement, the operator may use one separately approved no-audio probe
to prove the supplied key is current; expect a non-401 application/media error,
not a successful transcription. Do not inspect or retain its body. If current
validity cannot be proven safely, STOP rather than accepting a meaningless 401
or 403 from a stale/incorrect key or an unrelated authorization failure.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Reauthenticate | `az account get-access-token -o none` | exit 0 before pipeline starts |
| Confirm context | `azwho && az account show ... && azsubs` | User privately confirms exact tenant/subscription |
| Read local-auth state | `az resource show --ids "$resource_id" --query properties.disableLocalAuth -o tsv` | expected current boolean |
| Enforce one resource | `az resource update --ids "$resource_id" --set properties.disableLocalAuth=true --output none` | exit 0 |
| Roll back affected resource | `az resource update --ids "$resource_id" --set properties.disableLocalAuth=false --output none` | exit 0, only after approval |
| Rotate one slot | `az cognitiveservices account keys regenerate --name "$resource_name" --resource-group "$resource_group" --key-name Key1 --output none` | exit 0; key value not returned |
| Delete legacy GitHub secret | `gh secret delete '<privately-resolved-secret-name>' --env '<protected-environment>' --repo ahmedmuhi/whisper-transcribe` | secret name no longer listed |

Use only explicit, privately verified IDs/names. Never use globs, broad resource
groups, subscription-wide mutation, unresolved variables, or looped enforcement.

## Suggested executor toolkit

- Use `az` plus the host's `azwho`, `azsubs`, and `azuse` helpers for exact
  resource context.
- Use GitHub CLI only for the approved protected OIDC run, secret-name listing,
  and final legacy-secret deletion.
- Use the Plan 036 runbook and Plan 037 sanitized ledger; never upload Azure CLI
  output, HAR, authentication traces, audio, or response bodies.
- Perform each resource gate manually. Do not write a script or workflow that
  can advance both resources.

## Scope

**In-scope repository mutation:**

- Plan status, sanitized completion evidence, and the operator-runbook
  correction required by observed provider behavior.
- No product source, test, workflow, or runtime configuration change.

**In-scope external actions, each requiring explicit approval:**

- Read-only Azure context/resource checks.
- One optional pre-enforcement no-audio valid-key check per resource.
- Set `disableLocalAuth=true` on Whisper, then independently on MAI.
- If and only if a gate fails, set it back to `false` on the affected resource.
- One application bearer transcription and one protected OIDC contract success
  per model during its enforcement gate; avoid duplicates already safely
  observable in an approved run.
- One same-key no-audio 401/403 rejection per enforced resource after a
  pre-enforcement media-layer baseline.
- Ordinary production use and one final two-model OIDC run after the default
  stabilization interval or an explicit owner waiver.
- Rotate Key1 and Key2 on both resources through the provider-required
  per-resource unlock/rotate/re-lock sequence.
- Delete the legacy GitHub API-key secret and private cutover copies.
- Post only sanitized outcomes to the public operational issue.

**Out of scope:**

- Any application fallback to API keys or automatic Azure rollback.
- Redeploying the old key-based application; that requires a separate explicit
  emergency decision.
- CI/OIDC permission to change RBAC, list/regenerate keys, or modify resources.
- Broadening User/workload RBAC, creating a backend, multi-tenant support,
  resource discovery, another model, or another identity.
- Resource deletion, endpoint/deployment mutation, key display/export, or
  publishing any identifier/credential/private response.

## Git workflow

- Operate only against the immutable accepted SHA from Plan 037.
- No product commit occurs in this plan. If a code/config/docs correction is
  needed, stop, create a new candidate through the owning plan, and requalify.
- Keep the exact previous production commit/ref and the Azure re-enable command
  documented privately during stabilization; neither is active.
- Do not push, merge, deploy, or tag unless explicitly instructed.

## Steps

### Step 1: Reconfirm the immutable release and authority boundary

Read Plan 037's sanitized ledger and privately inspect underlying run evidence.
Confirm all automated gates, Pages artifact, six auth sessions, 12 successful
paths, browser-readable 401s, token-validated OIDC pre-role 401/403 denial and
post-role success evidence, and documentation
blocker are complete for the same candidate SHA.

Confirm the OIDC federated credential/role surface has only data-plane
transcription access—no resource write, RBAC, key list/regenerate, or local-auth
authority. Confirm no workflow advances cutover after a green run.

**Verify**: the User explicitly authorizes cutover preparation for the named
candidate; no Azure mutation yet.

### Step 2: Authenticate, set Azure context, and resolve exact targets

Run the required Azure context discipline above. Resolve two distinct resource
IDs privately and inspect both read-only. Record publicly only:

```text
Azure context: confirmed privately
Whisper target: resolved, local auth currently enabled
MAI target: resolved, local auth currently enabled
```

Do not record names or identifiers. If either is already enforced unexpectedly,
stop and reconcile state rather than assuming prior success.

### Step 3: Close the known-caller inventory

Complete every inventory category, confirm Plan 035's key workflow has been
migrated, and identify the exact legacy GitHub secret scheduled for deletion.
Refresh/close old browser tabs. Obtain the User's explicit no-other-caller
confirmation.

**Verify**: public ledger records only `Known-caller inventory: closed; owner
confirmation received`, with date and candidate SHA.

### Step 4: Pre-stage resource-specific rollback without activating it

Privately prepare these exact commands, substituting only the affected verified
resource ID at execution time:

```bash
az resource update --ids "$resource_id" \
  --set properties.disableLocalAuth=false --output none
az resource show --ids "$resource_id" \
  --query properties.disableLocalAuth -o tsv
```

Confirm the previous production commit remains identifiable. Do not run the
rollback and do not deploy the old build. Ensure the operator understands that
only the affected resource rolls back; the other resource remains unchanged.

### Step 5: Approval checkpoint — enforce Whisper only

Show the User the closed inventory, candidate evidence, exact private Whisper
target, and rollback command. Request explicit approval for Whisper.

After approval:

```bash
resource_id="$whisper_resource_id"
az resource update --ids "$resource_id" \
  --set properties.disableLocalAuth=true --output none
az resource show --ids "$resource_id" \
  --query properties.disableLocalAuth -o tsv
```

Require literal `true`. Allow a bounded propagation interval documented by the
provider/observed readback; poll read-only, never sleep blindly for a long
period. Do not touch MAI.

### Step 6: Gate Whisper enforcement

With separate approval for potentially billable calls:

1. production candidate transcribes one harmless fixture through Whisper with
   the signed-in User's bearer token;
2. protected OIDC workflow succeeds through Whisper using its narrow identity;
3. the privately verified current Whisper key is rejected with HTTP 401 or
   403 and no audio after the same key reached a media-layer status before
   enforcement;
4. no browser/workflow makes a key request or leaks a credential.

Record only pass/fail, HTTP status class, date, workflow URL, candidate SHA, and
retry count. If every check passes, unset `resource_id` and request permission
to proceed. If any check fails, go immediately to Step 7.

### Step 7: Whisper failure path — stop and roll back only Whisper

Do not retry blindly and do not touch MAI. Explain the sanitized failed gate and
request approval to restore Whisper local authentication. After approval:

```bash
resource_id="$whisper_resource_id"
az resource update --ids "$resource_id" \
  --set properties.disableLocalAuth=false --output none
test "$(az resource show --ids "$resource_id" \
  --query properties.disableLocalAuth -o tsv)" = 'false'
unset resource_id
```

Leave the keyless production application deployed. Diagnose under a new scoped
decision/plan. Redeploy the old key application only through a separate explicit
emergency authorization. Plan 038 remains BLOCKED, not partially successful.

### Step 8: Approval checkpoint — enforce MAI-Transcribe 1.5 only

Only after Whisper's complete gate passes, show that evidence and request a new
explicit approval for MAI. Then:

```bash
resource_id="$mai_resource_id"
az resource update --ids "$resource_id" \
  --set properties.disableLocalAuth=true --output none
az resource show --ids "$resource_id" \
  --query properties.disableLocalAuth -o tsv
```

Require literal `true`. Do not modify Whisper during this stage.

### Step 9: Gate MAI enforcement

With separate approval for potentially billable calls:

1. production candidate transcribes one harmless fixture through MAI with the
   signed-in User's bearer token;
2. protected OIDC workflow succeeds through MAI using its narrow identity;
3. the privately verified current MAI key is rejected with HTTP 401 or 403 and
   no audio after the same key reached a media-layer status before enforcement;
4. no browser/workflow makes a key request or leaks a credential.

If every check passes, both resources enter stabilization. If any MAI check
fails, request approval and set `disableLocalAuth=false` on **MAI only** using
Step 7's command with `mai_resource_id`. Whisper stays enforced. Keep the
keyless app deployed and stop for diagnosis.

### Step 10: Stabilization decision

The default rollback window is at least 24 hours after both complete gates pass.
During that window:

- local authentication remains disabled on both resources;
- the previous commit and resource-specific re-enable procedure remain privately
  available but inactive;
- perform at least one ordinary production use session (not only a test);
- monitor only normal sanitized application/workflow outcomes;
- investigate any unexplained authentication, authorization, or transcription
  failure before closing the window;
- do not rotate/delete anything yet.

After the chosen stabilization interval, request approval and run the protected
two-model OIDC contract once more. Require one successful call per model/no
retry and both `disableLocalAuth` readbacks still `true`.

The sole operator may explicitly waive the elapsed-time portion when accepted
cross-device production evidence, ordinary use, both independent enforcement
gates, and the final OIDC contract already establish the required confidence.
Record the waiver; never describe a waived interval as elapsed. That waiver was
given for this execution on 2026-07-19.

### Step 11: Approval checkpoint — rotate all four key slots

Only after the full stabilization gate passes, explain that rotation invalidates
every unknown copied legacy key and makes the migration forward-only. Request
explicit destructive-action approval.

Resolve account names/groups privately from the already verified resource IDs
without printing them:

```bash
whisper_name="$(az resource show --ids "$whisper_resource_id" --query name -o tsv)"
whisper_group="$(az resource show --ids "$whisper_resource_id" --query resourceGroup -o tsv)"
mai_name="$(az resource show --ids "$mai_resource_id" --query name -o tsv)"
mai_group="$(az resource show --ids "$mai_resource_id" --query resourceGroup -o tsv)"
test -n "$whisper_name" && test -n "$whisper_group" && test -n "$mai_name" && test -n "$mai_group"
```

Confirm local auth is `true`-disabled on both. Azure may reject regeneration
while local authentication is disabled. Operate on one exact resource at a
time: temporarily set only that resource to `false`, rotate both slots with no
output, immediately set it back to `true`, and verify literal `true` before
touching the other resource. Install a failure trap that attempts to re-lock
the active resource. Never leave both resources unlocked simultaneously.

The four regeneration commands remain sequential and return no key values:

```bash
az cognitiveservices account keys regenerate --name "$whisper_name" \
  --resource-group "$whisper_group" --key-name Key1 --output none
az cognitiveservices account keys regenerate --name "$whisper_name" \
  --resource-group "$whisper_group" --key-name Key2 --output none
az cognitiveservices account keys regenerate --name "$mai_name" \
  --resource-group "$mai_group" --key-name Key1 --output none
az cognitiveservices account keys regenerate --name "$mai_name" \
  --resource-group "$mai_group" --key-name Key2 --output none
```

Do **not** run `keys list` afterward. If the verified resource type does not
support these exact commands, STOP before rotation and use provider-authoritative
guidance under a separately reviewed amendment; do not invent a command. After
each resource's two commands, restore `disableLocalAuth=true` and verify it
before continuing.

### Step 12: Delete the legacy secret and private cutover copies

After rotation succeeds, request explicit approval to delete the privately
identified old GitHub API-key secret. Delete only that exact secret and verify
its name no longer appears. Do not delete unrelated environment values.

Destroy any private cutover key copy, temporary note, clipboard content, or
shell variable. Unset all operational variables:

```bash
unset whisper_resource_id mai_resource_id
unset whisper_name whisper_group mai_name mai_group
unset resource_id current_resource_key private_probe_url legacy_header_name key_status
```

Confirm no regenerated key was displayed, copied, downloaded, or stored. Browser
profiles never reopened are now harmless because their old keys have been
rotated and both resources reject local authentication.

### Step 13: Final read-only verification and declaration

Reauthenticate/reconfirm Azure context, then verify both exact resources report
`disableLocalAuth=true`. Run no extra transcription unless separately approved.
Confirm the OIDC identity still lacks control-plane/key authority and CI cannot
perform cutover.

Record a final sanitized statement:

```text
candidate SHA | both resources enforce key rejection | all four legacy key
slots rotated | legacy CI secret removed | stabilization completed or owner
waiver recorded | forward-only date
```

Do not include identifiers or command output. Mark the plan DONE. Any future
re-enabling of local authentication requires a new explicit incident decision;
the product never falls back automatically.

## Failure and rollback contract

- Before rotation, a failed resource gate may restore local authentication on
  that resource only, after explicit approval.
- The application remains keyless throughout; it never silently consumes a key.
- The second resource never advances after a first-resource failure.
- A browser/runtime error never changes Azure state automatically.
- The old key-based application is not automatically redeployed.
- After stabilization, four-slot rotation, and legacy-secret deletion, the
  migration is forward-only. Re-enabling keys becomes a new incident decision,
  not this plan's rollback.

## Test plan

- Read-only: exact Azure context, exact targets, current/enforced local-auth
  state, candidate SHA, caller inventory, OIDC privilege boundary.
- Whisper gate: one app bearer success, one narrow OIDC success, one valid-key
  no-audio 401/403 after a same-key pre-enforcement media status, no retry/leak.
- MAI gate: same four checks, independently.
- Stabilization: the default 24-hour interval or an explicit owner waiver, one
  ordinary production session, no unexplained failure, final two-model OIDC run.
- Retirement: Key1 + Key2 rotated for both resources without listing values;
  legacy secret/private copies removed; both resources still enforced.
- Evidence: sanitized ledger audit with approvals, dates, candidate SHA,
  workflow URLs/status classes/retry counts only.

## Done criteria

- [x] Required executor model/effort was used or User approved the active execution path.
- [x] Plan 037's immutable candidate and all evidence gates were reverified.
- [x] Azure tenant/subscription and two exact resources were privately confirmed.
- [x] Known-caller inventory closed and User confirmed no other key dependency.
- [x] Old tabs were closed/refreshed before enforcement.
- [x] Whisper alone was enforced and passed app bearer, narrow OIDC, and verified same-key rejection gates.
- [x] MAI alone was enforced afterward and passed the same gates.
- [x] No automatic fallback/rollback or OIDC control-plane authority exists.
- [x] Ordinary production use and the final OIDC run passed with no unexplained failures; the sole owner explicitly waived the 24-hour elapsed-time requirement.
- [x] Key1 and Key2 were regenerated on both resources through the provider-required per-resource unlock/rotate/re-lock sequence.
- [x] Legacy GitHub key secret and all private cutover copies were deleted.
- [x] Regenerated key values were never read, logged, downloaded, or stored.
- [x] Final readback confirms both resources still reject local authentication.
- [x] Every external/destructive stage had explicit User approval or the User's standing completion authorization.
- [x] Public ledger contains no identifier, credential, URI, audio, transcript, or private response.
- [x] Migration is declared forward-only and `plans/README.md` is updated.

## STOP conditions

Stop before improvising if:

- `gpt-5.6-sol` with extra-high (`xhigh`) effort is unavailable.
- Plan 037 is incomplete, evidence SHAs differ, or the candidate changed.
- Azure authentication/context expires or tenant/subscription/resource identity
  is not explicitly confirmed.
- Caller inventory is open or the User knows another key-dependent caller.
- A target/property/provider shape differs from the verified plan.
- Any external stage lacks immediate explicit approval.
- The app bearer or narrow OIDC check fails, retries unexpectedly, or leaks data.
- A current valid key does not return browser/client-readable HTTP 401 or 403
  after enforcement, its pre-enforcement validity was not safely established,
  or the post-enforcement status does not differ from the media-layer baseline.
- A failure would require touching both resources, broadening RBAC, using a key
  fallback, or automatically redeploying the old app.
- The stabilization decision lacks ordinary use/final OIDC success, contains an
  unexplained auth/transcription failure, or omits an explicit elapsed-time
  waiver when the default 24-hour interval is shortened.
- Key rotation would print/read/store values or the resource does not support
  the exact provider command.
- Secret target is ambiguous, unrelated data could be deleted, or private
  evidence would have to be published.

## Maintenance notes

- Keep `disableLocalAuth=true` as the desired state on both resources and audit
  it periodically with read-only checks.
- Keep OIDC data-plane-only; a workflow must never gain local-auth, key, RBAC,
  or resource-management permissions.
- Browser startup cleanup remains idempotent indefinitely for profiles opened
  months later, even though rotated keys are already unusable.
- Treat any request to restore key authentication as a new security/incident
  decision with caller inventory and explicit User authority.
- Future auth/request/build changes need a new immutable candidate qualification;
  this plan's evidence applies only to its recorded SHA and cutover date.
