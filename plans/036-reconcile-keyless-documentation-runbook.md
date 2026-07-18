# Plan 036: Reconcile keyless documentation and add the sanitized operator runbook

> **Required executor profile**: use `gpt-5.6-terra` with **high** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: Follow this plan step by step. Documentation is a
> release gate, not follow-up polish. Verify every command, symbol, storage rule,
> role name, and workflow against the implemented repository before writing it.
> Use placeholders only: never put a real tenant, subscription, client,
> principal, resource, Target URI, token, key, auth response, or audio in a
> tracked document or public issue. Stop on any STOP condition. Update
> `plans/README.md` when done unless the reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- README.md CLAUDE.md CONTEXT.md package.json .env.example .gitignore plan/2.0-design.md spec/ docs/adr/ docs/keyless-operator-runbook.md .github/workflows/`
> Plans 031–035 must be complete or represented by their final rebased code.
> Compare every documented command/symbol with the live implementation; drift is
> a STOP condition, not a reason to document an intended-but-absent feature.

## Status

- **Priority**: P1
- **Effort**: M/L
- **Risk**: LOW
- **Depends on**: Plans 031, 032, 033, 034, and 035
- **Category**: docs
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/119

## Why this matters

The active README and developer guide currently direct Users to put API keys in
localStorage and describe a no-build, zero-runtime-dependency architecture.
Shipping keyless authentication while those instructions remain would recreate
the exact unsafe path the migration removes. This plan reconciles every active
contract, preserves the domain vocabulary, and provides one sanitized,
human-gated operator runbook for Entra, OIDC, release evidence, rollback,
resource enforcement, and key invalidation.

The canonical documentation gate is:
<https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>.

## Current state

### Stale User and architecture documentation

`README.md:3-5`, `58-80`, and `132-149` currently say:

```text
No build step, no bundler, no runtime dependencies
Your Azure target URI and API key
Credentials are stored ... in local storage
Enable GitHub Pages ... Serve the branch containing the code
Microsoft account sign-in ... future 3.0
```

Those claims are all false after Plans 031–035.

`CLAUDE.md:7-32` repeats no-build/zero-runtime assumptions and old commands.
`CLAUDE.md:42` lists Whisper Translate and adapter credential storage. Its
architecture guidance must describe the new authentication owner without
teaching future agents to spread MSAL/token logic.

`package.json:6` describes a no-build app. Its final scripts must be treated as
the command source of truth; docs copy them exactly rather than guessing.

`.env.example:3-21` currently documents API-key examples. Plan 032 should have
removed them; this plan verifies that only non-secret public SPA placeholders
and safe test placeholders remain.

### Stale tracked design contracts

`spec/spec-design-api-client.md` currently requires:

- three models including Whisper Translate;
- Settings-provided API keys;
- adapter-built `api-key` / `Ocp-Apim-Subscription-Key` headers;
- API-key validation acceptance criteria.

`spec/spec-design-recording-state-machine.md` documents only microphone
recording. It must explain authentication readiness and Selected Audio without
incorrectly adding file states to RecordingStateMachine.

`plan/2.0-design.md` is the active interaction design. Reconcile sidebar/menu,
Audio Source, auth gate, and recovery portions only where the implementation now
changes the design; do not rewrite historical archive files.

### Generated JSDoc boundary

The working directory may contain ignored generated HTML under `docs/`, but
`git ls-files docs` is empty at the planned commit. `CLAUDE.md` explicitly says
there is no generated-JSDoc workflow and tracked specs are authoritative. Plan
031 creates a tracked `docs/adr/` exception. This plan must not commit stale
generated HTML. It adds one explicitly tracked runbook alongside the ADR and
keeps generated HTML ignored.

### Agreed domain vocabulary

Preserve/integrate these definitions verbatim in `CONTEXT.md` if it is tracked
on the implementation branch; do not silently overwrite a User-owned untracked
copy:

- **User**: a person using Whisper Transcribe; avoid Customer/tenant/administrator.
- **Bring-your-own Azure**: each User authorizes an Azure transcription resource
  available to them; its owner retains access/quota/billing responsibility.
- **Transcription Model**: selected Azure speech model; selection determines Target URI.
- **Target URI**: endpoint address; identifies destination but does not authorize.
- **Unsent Recording**: valuable captured audio not yet accepted for transcription.
- **Audio Source**: microphone capture or selected local audio.
- **Selected Audio**: local Audio Source held for review; not yet sent to Azure.

If `CONTEXT.md` remains untracked when execution begins, STOP and ask the User
whether to include that existing file; never replace or delete it as collateral.

## Required final documentation truth

- Browser-only static runtime; Vite/npm build and GitHub Actions Pages deployment.
- Vanilla JavaScript; no UI framework/backend.
- Exact pinned MSAL is the sole production dependency; Vite is build-time.
- Single-tenant Microsoft sign-in; full-page redirects; sessionStorage;
  `/auth/redirect.html`; no client secret.
- Bring-your-own Azure with manual Target URI per model.
- Exactly Whisper and MAI-Transcribe 1.5; no Whisper Translate or key fallback.
- `Cognitive Services OpenAI User` and `Cognitive Services Speech User`, assigned
  externally at individual resources.
- AuthenticationService owns MSAL; AzureAPIClient alone constructs bearer auth;
  adapters are credential-blind.
- 401 auth recovery, 403 RBAC guidance, bounded 429/5xx retries.
- Recording/upload gated until ready; no unsafe redirect/logout; Unsent Recording recovery.
- Selected Audio is memory-only, explicit Transcribe, accepted Variant B.
- Unified initials-only User menu and accepted nested settings.
- Targeted remove-only legacy key cleanup every startup.
- Manual protected two-model OIDC contract with a separate narrow workload identity.
- Edge, Chrome, and Safari on macOS are the acceptance browsers.
- Resource enforcement is human-gated, staged, reversible during 24-hour
  stabilization, then forward-only after both key slots rotate.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Canonical install/build | `npm ci && npm run build` | both exit 0 |
| Complete verification | `npm run lint && npm run test:coverage && npm run deps:check && npm run deps:check:prod && npm audit --audit-level=high && npm run size && npm run test:browser` | all exit 0 |
| Docs stale-term scan | see Step 7 | no active stale key/no-build/Translate claims |
| Tracked docs check | `git ls-files docs` | only approved ADR/runbook paths, no generated HTML |
| Markdown diff | `git diff --check -- README.md CLAUDE.md CONTEXT.md package.json .env.example plan/2.0-design.md spec docs .gitignore` | exit 0 |

## Suggested executor toolkit

- Read the final code before each document; implementation is the source for
  commands/symbols, while Wayfinder is the source for intent/security constraints.
- Use the documentation-and-ADRs skill if available, preserving Plan 031's
  accepted ADR rather than creating a competing architecture decision.
- For the runbook, use official Microsoft/GitHub sources linked in the ADR and
  Plans 031/035/038. Do not rely on a blog or copy live CLI output.

## Scope

**In scope (only these files):**

- `README.md`
- `CLAUDE.md`
- `CONTEXT.md` only if the User-owned file is explicitly included/tracked before execution
- `package.json` (description/script naming reconciliation only; no dependency redesign)
- `.env.example`
- `.gitignore` (track the runbook while generated docs remain ignored)
- `plan/2.0-design.md`
- `spec/spec-design-api-client.md`
- `spec/spec-design-recording-state-machine.md`
- `docs/adr/0001-adopt-vite-and-msal-browser.md` (accuracy/link corrections only;
  do not reverse the accepted decision)
- `docs/keyless-operator-runbook.md` (create)

**Out of scope:**

- Any product JavaScript, HTML, CSS, test, workflow, dependency, Azure, Entra,
  RBAC, Pages, GitHub secret/variable, key, or browser-storage change.
- Committing generated JSDoc HTML, fonts, scripts, source renderings, coverage,
  screenshots, HAR, traces, or live evidence artifacts.
- Historical files under `plan/archive/`; they are records, not active guidance.
- Publishing real identifiers, Target URIs, tokens, keys, authentication
  responses, audio, transcript bodies, identity screenshots, or private command output.
- Expanding scope to multi-tenant, resource discovery, app-managed RBAC,
  backend, hosted transcription, shared resources, or API-key fallback.

## Git workflow

- Branch: `advisor/036-keyless-docs-runbook`
- Rebase onto completed Plans 031–035 and use their final commands/symbols.
- Suggested commits:
  1. `docs: reconcile keyless application guidance`
  2. `docs: add sanitized keyless cutover runbook`
- Do not push/merge or perform any external operation unless instructed.

## Steps

### Step 1: Inventory every active stale contract against final code

Before editing, run:

```bash
rg -n -i "api[ -]?key|subscription key|Ocp-Apim|whisper[- ]translate|no[ -]?build|no runtime|zero runtime|raw ES module|static-server|sidebar|settings modal|future.*Entra|Cosmos|backend" \
  README.md CLAUDE.md package.json .env.example CONTEXT.md plan/2.0-design.md spec docs/adr 2>/dev/null
```

Classify every match as stale, historical/explicitly rejected, or a necessary
negative statement such as “no API-key fallback.” Keep a private checklist; do
not dump document contents into a public issue.

Also inspect final `package.json`, workflows, public configuration module,
AuthenticationService, API client, adapters, User menu, Selected Audio
controller, and tests. If documented names differ, use code's exact names only
when they do not violate domain language.

**Verify**: every active stale match has one named destination document/section.

### Step 2: Rewrite README as the User and contributor entry point

Update README sections to cover:

- value proposition and features: Microsoft sign-in, recording, Selected Audio,
  two models, transcript persistence, unified menu;
- privacy: Audio Sources go directly to the User's Azure endpoint; selected and
  unsent audio remain memory-only in the app; MSAL owns session token cache;
- prerequisites: Node version, supported browsers, single-tenant registration,
  external Azure resources/RBAC;
- configuration: public SPA identifiers, exact callbacks, manual Target URIs,
  no key field, no app-managed RBAC;
- first-use journey: checking → Continue with Microsoft → ready;
- upload journey and explicit Transcribe;
- exact development/build/preview/verify commands from package.json;
- Actions-based Pages artifact deployment, not branch publication;
- architecture ownership and sole runtime dependency exception;
- role names and link to sanitized operator runbook;
- roadmap: remove the claim that Entra/backend is a future 3.0 feature. Keep
  genuinely future ideas only when they do not contradict Bring-your-own Azure.

Do not advertise Firefox as acceptance-tested unless Plan 037 adds real evidence;
state Edge, Chrome, and Safari on macOS as supported acceptance browsers.

**Verify**:

```bash
rg -n "Microsoft|Target URI|Cognitive Services OpenAI User|Cognitive Services Speech User|Upload audio|npm run build|GitHub Actions|Edge|Chrome|Safari|operator runbook" README.md
```

Expected: every required User/developer concept appears.

### Step 3: Rewrite CLAUDE.md as the exact executor architecture guide

Replace obsolete no-build/key/Translate guidance with:

- exact canonical scripts and whether each writes `dist/`;
- Vite multi-page layout and callback bridge constraints;
- production dependency boundary;
- bootstrap order: remove-only legacy cleanup before Settings/auth initialization;
- AuthenticationService/token-provider/AzureAPIClient/adapter ownership;
- safe auth event payload rule and 401/403/retry distinction;
- exactly two adapters and scope metadata;
- User-menu/Settings ownership;
- recording FSM vs Selected Audio controller separation;
- one Audio Source at a time and navigation-safety controller;
- test-build auth doubles excluded from production;
- OIDC live workflow separate from SPA/live browser matrix;
- public sanitization and external approval rules.

Keep still-true conventions: event bus, recording FSM ownership, transcript
store, status CSS, reduced motion, proportional confirmation, test naming.

**Verify**:

```bash
rg -n "AuthenticationService|AzureAPIClient|SelectedAudio|Audio Source|Vite|auth/redirect.html|sessionStorage|OIDC|401|403" CLAUDE.md
```

Expected: architecture owner/boundary references are complete and exact.

### Step 4: Reconcile package metadata and public environment template

Set package description to a truthful concise Vite-built, browser-only,
Bring-your-own Azure application description. Ensure scripts expose exactly one
canonical command for development, build, preview, unit/coverage, lint, full and
production dependency checks, audit/high-critical gate (directly or through
verify), size, deterministic browser, and opt-in live contract.

Do not change package versions/dependency choices in this docs plan. If scripts
are missing, STOP and return to their owning implementation plan rather than
smuggling tooling changes here.

`.env.example` documents public SPA identifier placeholders and fake
deterministic-test configuration only. Explicitly state they are public build
configuration, not secrets; forbid client secrets and Target URI/key examples.

**Verify**:

```bash
jq -e '.description | test("no-build|zero-runtime"; "i") | not' package.json
! rg -n "API_KEY|SUBSCRIPTION_KEY|CLIENT_SECRET|OPENAI_API_KEY" .env.example
rg -n "VITE_ENTRA_CLIENT_ID|VITE_ENTRA_TENANT_ID" .env.example
```

Expected: truthful metadata and no credential placeholder.

### Step 5: Update API-client and state specifications

`spec/spec-design-api-client.md` must define:

- exactly two model adapters;
- manual Target URI + adapter scope metadata;
- injected token provider and AzureAPIClient bearer ownership;
- adapter credential blindness;
- request-local token lifetime and forbidden storage/event/log locations;
- HTTPS validation and browser FormData boundary;
- 401 vs 403 vs 429/5xx behavior;
- remove-only legacy cleanup as a separate startup migration, not API-client responsibility;
- acceptance criteria/tests for no key path and no token leakage.

`spec/spec-design-recording-state-machine.md` must define:

- authentication readiness before idle recording activation;
- Unsent Recording retention and navigation safety;
- the recording FSM remains microphone-only;
- Selected Audio has a separate state owner and uses the one API client;
- one active Audio Source;
- success convergence and auth/authorization recovery;
- new event/state ownership diagrams/tables only when they match code exactly.

Increment spec version/date consistently. Remove Whisper Translate/API-key
requirements rather than marking them current-but-deprecated.

**Verify**:

```bash
! rg -n "whisper-translate|Whisper-Translate|Ocp-Apim-Subscription-Key|API Key.*required|api-key.*header" spec
rg -n "Authorization|Bearer|token provider|401|403|Selected Audio|Unsent Recording|Audio Source" spec/*.md
```

Expected: stale requirements absent; new contract terms present.

### Step 6: Reconcile the active interaction design and ADR

Update only active sections of `plan/2.0-design.md` to reflect:

- auth checking/signed-out contextual island;
- safe recovery/download/discard;
- initials-only nested User menu replacing sidebar/modal;
- Audio Source idle actions and Variant B Selected Audio states;
- no automatic upload/redirect;
- existing transcript completion convergence.

Preserve historical rationale and unrelated design tokens. Do not edit archive files.

Review Plan 031's ADR for final script/path/version accuracy. Keep its status
Accepted and its decision unchanged. Add links to official MSAL bridge, Vite
Pages, and the runbook if absent.

**Verify**:

```bash
rg -n "Continue with Microsoft|Unsent Recording|User menu|Upload audio|Selected Audio" plan/2.0-design.md
rg -n "Accepted|Vite|MSAL|redirect bridge|GitHub Actions" docs/adr/0001-adopt-vite-and-msal-browser.md
```

Expected: active design and ADR describe final implemented decisions.

### Step 7: Create the sanitized human-operated runbook

Adjust `.gitignore` narrowly so `docs/keyless-operator-runbook.md` is tracked
while generated `docs/*.html`, fonts, source renderings, coverage, and other
ignored output remain untracked.

Create `docs/keyless-operator-runbook.md` with these sections:

1. **Safety and authority** — human-gated stages; never paste output; no CI
   cutover permission; exact sanitization list.
2. **Private placeholder inventory** — define shell placeholders such as
   `<private-tenant>`, `<private-resource-group>`, `<private-resource-name>`,
   `<candidate-sha>`; never include values.
3. **Azure CLI context preflight** — on this host run
   `az account get-access-token -o none`, inspect `azwho`/`az account show`, list
   subscriptions, and explicitly choose one. Never assume context.
4. **SPA registration** — single tenant, SPA platform, delegated Cognitive
   Services impersonation only, exact two callback URLs, no Graph/secret/cert,
   User consent boundary.
5. **Application build configuration** — public client/tenant variable names,
   manual Target URIs, sessionStorage, callback response header requirements.
6. **User RBAC** — exact two role names at individual resources; app diagnoses
   but never assigns.
7. **GitHub Pages** — Actions source, candidate SHA, `dist/` artifact, rollback
   commit, no identifier-bearing artifact.
8. **GitHub OIDC** — separate workload identity, environment federation,
   protected value names, pre-role 403, exact roles, two-model success, no
   management authority.
9. **Known-caller inventory and browser cleanup** — refresh/close old tabs;
   per-browser/origin cleanup; explicit owner confirmation.
10. **Pre-cutover evidence** — full automated gates, 12-path matrix, live 401,
    Safari real evidence, candidate invalidation rules, evidence ledger template.
11. **Whisper enforcement** — private resource ID resolution, set
    `properties.disableLocalAuth=true` with output suppressed, poll/show only
    the boolean, app bearer, OIDC, current-key no-audio 401, stop/rollback.
12. **MAI enforcement** — repeat independently only after Whisper passes.
13. **Rollback** — set only affected resource false, keep keyless app, old app
    redeploy requires separate emergency decision.
14. **24-hour stabilization** — elapsed time, ordinary production session,
    final OIDC, unexplained-error gate.
15. **Forward-only invalidation** — rotate Key1 and Key2 for both resources with
    CLI output `none`, delete private copies/legacy secret, store no new keys.
16. **Sanitized evidence ledger** — candidate SHA, workflow URLs, browser/version,
    dates, model/origin, pass/fail, HTTP class only.

Use command templates that cannot print keys. Prefer generic resource update:

```bash
az resource update --ids "$private_resource_id" \
  --set properties.disableLocalAuth=true --output none

az resource show --ids "$private_resource_id" \
  --query properties.disableLocalAuth --output tsv

az cognitiveservices account keys regenerate \
  --name "$private_resource_name" \
  --resource-group "$private_resource_group" \
  --key-name Key1 --output none
```

Repeat rotation explicitly for Key2 and both resources. Warn that propagation
may take minutes; verify data-plane behavior, not just the property.

**Verify**:

```bash
rg -n "Safety and authority|SPA registration|GitHub OIDC|Known-caller|12-path|Whisper enforcement|MAI enforcement|24-hour|Key1|Key2|evidence ledger" docs/keyless-operator-runbook.md
! rg -n "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|https://[^ <]*\.(openai|cognitiveservices)\.azure\.com" docs/keyless-operator-runbook.md
```

Expected: every stage present; no GUID or concrete Azure Target URI.

### Step 8: Prove no active stale setup path remains

Run a final classified scan:

```bash
rg -n -i "api[ -]?key|subscription key|Ocp-Apim|whisper[- ]translate|no[ -]?build|no runtime|zero runtime|raw ES module|branch.*GitHub Pages|future.*Entra|Cosmos.*backend" \
  README.md CLAUDE.md package.json .env.example CONTEXT.md plan/2.0-design.md spec docs/adr docs/keyless-operator-runbook.md 2>/dev/null
```

Allowed matches are only:

- explicit statements that API-key fallback is forbidden/removed;
- remove-only legacy cleanup/cutover/rotation/401 verification in the runbook;
- ADR rejected alternatives;
- historical context clearly labelled as superseded.

Every other match is a failure. Then prove generated docs remain untracked:

```bash
git ls-files docs
```

Expected: only `docs/adr/0001-adopt-vite-and-msal-browser.md` and
`docs/keyless-operator-runbook.md` (plus any separately approved tracked doc),
never generated HTML/font/source files.

### Step 9: Run the full repository gate

Documentation-only changes must still run the canonical artifact/test gates:

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
git diff --check
```

Expected: all pass. Do not run live OIDC/Azure/browser matrix calls here.

## Test plan

- No new product test is required unless a documented command exposes a missing
  script—then return to the owning plan rather than changing source here.
- Run all existing automated gates to prove examples/config do not drift.
- Shell/rg checks for stale terms, concrete GUIDs/Azure endpoints, credential
  variable names, generated docs, and runbook section completeness.
- Manually click/resolve all relative Markdown links locally and verify public
  Microsoft/GitHub links target primary documentation.
- Cross-check every role/command/status against final implementation and
  canonical Wayfinder text.

## Done criteria

- [ ] README documents final sign-in, models, manual Target URIs, RBAC, upload, browsers, Vite, testing, privacy, and Actions Pages flow.
- [ ] CLAUDE.md documents exact commands and authentication/token/UI/Selected Audio/OIDC ownership.
- [ ] Package description/scripts and `.env.example` contain no obsolete no-build/key guidance.
- [ ] API-client and state specs match bearer auth, two models, 401/403, readiness, Unsent Recording, and separate Selected Audio state.
- [ ] Active design matches accepted Variant A/Variant B interactions.
- [ ] Accepted Vite/MSAL ADR remains accurate and tracked.
- [ ] Sanitized runbook covers every setup/evidence/cutover/rollback/rotation stage with placeholders only.
- [ ] No active doc instructs API-key entry/storage or calls Entra a future feature.
- [ ] Generated JSDoc HTML remains ignored/untracked.
- [ ] Domain vocabulary is preserved; User-owned `CONTEXT.md` was not overwritten.
- [ ] All canonical automated gates pass.
- [ ] No external configuration/live call occurred.
- [ ] Only in-scope files changed and `plans/README.md` was updated as instructed.

## STOP conditions

Stop and report instead of improvising if:

- `gpt-5.6-terra` with high effort is unavailable.
- Any implementation plan is incomplete or final code contradicts Wayfinder.
- `CONTEXT.md` remains untracked/ambiguous and inclusion would overwrite User work.
- A documented setup requires a real identifier, Target URI, credential, auth
  response, audio, private screenshot, or live command output.
- A canonical script/feature is absent or failing; return to its owning plan
  instead of documenting aspiration or modifying source here.
- Role names, scope, redirect path, storage boundary, or Azure property cannot be
  verified against primary documentation/final code.
- Generated JSDoc appears tracked or active but has no reproducible generation
  workflow; report whether to remove/reintroduce it rather than committing stale output.
- Documentation reveals a newly discovered vulnerability/credential location
  that cannot be safely generalized in the public issue.

## Maintenance notes

- README is User-facing; CLAUDE is executor-facing; specs are component
  contracts; ADR records the build decision; the runbook is private-operator
  procedure written with public-safe placeholders. Keep those roles distinct.
- Any future auth, model, Target URI, workflow, or Azure API-family change must
  update the corresponding active docs in the same PR.
- Never paste a live evidence artifact into docs. The operational issue stores
  only the sanitized ledger described by Plan 037.
