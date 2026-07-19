# Plan 032: Replace every API-key path with centralized Microsoft Entra bearer authentication

> **Required executor profile**: use `gpt-5.6-sol` with **extra-high (`xhigh`)** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This is an atomic security migration: do not leave a merged state
> that sends bearer tokens while still accepting, displaying, or persisting API
> keys. If a STOP condition occurs, stop and report rather than adding a fallback.
> Update `plans/README.md` when done unless the reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- js/main.js js/api-client.js js/audio-handler.js js/settings.js js/ui.js js/constants.js js/event-bus.js js/model-adapters/ index.html .env.example vite.config.js playwright.config.js tests/ .github/workflows/pages.yml package.json package-lock.json eslint.config.js knip.json`
> Plan 031 must be complete first. Compare every excerpt below with the rebased
> code; a material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/031-adopt-vite-msal-pages-packaging.md`
- **Category**: security
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/115

## Why this matters

The browser currently persists durable per-model Azure keys and each adapter
constructs its own key header. The accepted destination is one single-tenant
MSAL SPA in which short-lived delegated tokens are managed by MSAL, only the
API client sees a request-local token, and every selectable model is keyless.
This plan performs that security boundary atomically, removes the dead Whisper
Translate path, and scrubs only the two legacy key entries without reading
their values.

Binding sources:

- Canonical specification:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>
- Authentication ownership:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/110#issuecomment-5008422399>
- Verified direct-browser evidence:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/113#issuecomment-5009476543>

## Current state

### Bootstrap and ownership

`js/main.js:11-22` synchronously creates five objects and gives
`AzureAPIClient` only `Settings`:

```js
document.addEventListener('DOMContentLoaded', () => {
    const settings = new Settings();
    const transcriptStore = new TranscriptStore();
    const ui = new UI();
    const apiClient = new AzureAPIClient(settings);
    const audioHandler = new AudioHandler(apiClient, settings);
    ui.init(settings, transcriptStore);
});
```

Authentication initialization must become explicit and asynchronous, while
legacy key deletion must run synchronously before Settings, MSAL, UI, or any
other application component initializes.

### Durable key paths

`js/constants.js:42-82` owns both legacy local-storage names and both key
header names:

```js
WHISPER_API_KEY: 'whisper_api_key',
MAI_TRANSCRIBE_API_KEY: 'mai_transcribe_api_key',
API_KEY_HEADER: 'api-key',
MAI_API_KEY_HEADER: 'Ocp-Apim-Subscription-Key'
```

`js/settings.js:822-831`, `956-964`, and `1036-1043` read, display, save, and
return the key:

```js
const storedApiKey = localStorage.getItem(apiKey);
localStorage.setItem(apiKeyStorageKey, apiKey);
return { model, apiKey: localStorage.getItem(apiKey), uri: localStorage.getItem(uri) };
```

`index.html` contains password inputs `#whisper-key` and
`#mai-transcribe-key`. `.env.example` still documents mock/deprecated key
variables.

On every startup the implementation must invoke only:

```js
localStorage.removeItem('whisper_api_key');
localStorage.removeItem('mai_transcribe_api_key');
```

It must never call `getItem`, copy, display, migrate, log, emit, transmit, or
rewrite either value. Every other setting and the saved transcript remain.

### Adapter and request coupling

`js/model-adapters/whisper.js:18-40` declares a key storage entry and creates a
key header. `js/model-adapters/mai-transcribe.js` does the same with the Speech
header. `js/api-client.js:37-59` trusts adapter-provided headers:

```js
const { headers, body, statusMessage } = await adapter.buildRequest(audioBlob, config, onProgress);
await this._fetchWithRetry(config.uri, { method: 'POST', headers, body }, ...);
```

The target boundary is:

```text
AuthenticationService -> narrow token provider -> AzureAPIClient
                                                -> Authorization: Bearer ...
model adapter -> body + status + immutable scope (never a token/header)
```

Both retained adapters use exactly:

```text
https://cognitiveservices.azure.com/.default
```

Do not substitute the newer Foundry `/openai/v1` audience: the retained
Whisper Target URI uses the versioned `/openai/deployments/...` API family.

### Model set and retry behavior

`js/model-adapters/index.js:5-14` still registers the unselectable
`whisper-translate` adapter. It must be deleted along with its constants, tests,
and docs references (active documentation is reconciled fully in Plan 036).

`js/api-client.js:12-14` retries only 429 and selected 5xx responses, so 401/403
are not currently retried. Preserve that property and add explicit categories:

- 401: authentication/token failure; interaction recovery, never blind retry;
- 403: signed-in identity lacks Azure RBAC; external setup guidance, never retry;
- 429/500/502/503/504: retain the existing bounded retry policy.

`_createApiError` currently logs the complete response body and exposes it as
event `details`. Authentication/authorization response bodies must not enter
logs or events.

### Domain language

Use these exact meanings in code comments, tests, and messages:

- **User**: a person using Whisper Transcribe; never “customer” or hard-coded
  individual identity.
- **Transcription Model**: the selected Azure speech model; it selects one
  Target URI.
- **Target URI**: non-secret destination configuration; it does not authorize.
- **Unsent Recording**: valuable recorded audio not yet accepted for
  transcription; do not call it “unsafe audio” or “temporary blob.”

## Target authentication contract

- Single-tenant `PublicClientApplication`, tenant-specific authority,
  authorization code + PKCE, no client secret/certificate.
- Public build configuration names: `VITE_ENTRA_CLIENT_ID` and
  `VITE_ENTRA_TENANT_ID`. Values are never written to this plan/issue and must be
  resolved privately at build/deploy time.
- `cacheLocation: 'sessionStorage'`; do not configure localStorage, cookies, or
  an application cache.
- Dedicated redirect URI derived for the current origin/base and ending in
  `/auth/redirect.html`.
- Full-page redirect APIs only. No popup API anywhere.
- Initialize MSAL and handle redirect completion before declaring authentication
  state.
- Active tab: `acquireTokenSilent` with the active account.
- New tab with no cached account: one best-effort `ssoSilent`; on failure show
  signed-out/interaction-required state rather than looping.
- Access tokens exist only in MSAL's session cache and a local variable inside
  the token-provider → API-client call. No event or application object exposes
  an authentication result.

## Commands you will need

These commands assume Plan 031's scripts exist.

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Focused auth tests | `npx vitest run tests/authentication-service.vitest.js tests/legacy-credential-cleanup.vitest.js tests/api-client-validation.vitest.js tests/api-client-errors.vitest.js tests/model-adapters.vitest.js tests/audio-handler-integration.vitest.js` | all pass |
| Full coverage | `npm run test:coverage` | all pass; thresholds not lowered |
| Production build | `npm run build` | exit 0 with public identifiers supplied through a safe test/build fixture |
| Lint | `npm run lint` | exit 0 |
| Dependencies | `npm run deps:check && npm run deps:check:prod` | exit 0; sole production package is MSAL |
| Audit | `npm audit --audit-level=high` | exit 0 |
| Size | `npm run size` | exit 0 against `dist/` |
| Browser smoke | `npm run test:browser` | fake authenticated path passes with Authorization CORS |

## Suggested executor toolkit

- MSAL Browser configuration:
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/configuration>
- Silent renewal and interaction fallback:
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes>
- SPA token acquisition:
  <https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token>
- Treat Plan 031's ADR as binding. Do not reopen Vite, callback, cache, or
  redirect interaction decisions.
- Use existing test style in `tests/api-client-errors.vitest.js`,
  `tests/model-adapters.vitest.js`, and `tests/audio-handler-integration.vitest.js`.

## Scope

**In scope (only these files):**

- `js/main.js`
- `js/authentication-service.js` (create)
- `js/authentication-config.js` (create)
- `js/token-provider.js` (create, or an equivalently narrow interface module)
- `js/legacy-credential-cleanup.js` (create)
- `js/api-client.js`
- `js/audio-handler.js` (authentication readiness gate only)
- `js/settings.js`
- `js/ui.js` (minimal safe state wiring only; final presentation is Plan 033)
- `js/constants.js`
- `js/event-bus.js`
- `js/model-adapters/index.js`
- `js/model-adapters/whisper.js`
- `js/model-adapters/mai-transcribe.js`
- `js/model-adapters/whisper-translate.js` (delete)
- `index.html` (remove key inputs/legacy model paths; no accepted-menu redesign)
- `.env.example`
- `vite.config.js`
- `playwright.config.js`
- `.github/workflows/pages.yml` (public build-variable names only)
- `package.json`, `package-lock.json`, `eslint.config.js`, `knip.json` only if
  required for deterministic auth test aliases/scripts
- `tests/authentication-service.vitest.js` (create)
- `tests/legacy-credential-cleanup.vitest.js` (create)
- `tests/token-boundary.vitest.js` (create if separation improves proof)
- `tests/api-client-validation.vitest.js`
- `tests/api-client-errors.vitest.js`
- `tests/model-adapters.vitest.js`
- `tests/audio-handler-integration.vitest.js`
- `tests/recording-integration.vitest.js` (test-fixture migration only)
- `tests/discard-flow.vitest.js` (test-fixture migration only)
- `tests/audio-handler-stop.vitest.js` (test-fixture migration only)
- `tests/settings-persistence.vitest.js`
- `tests/settings-unit.vitest.js`
- `tests/settings-workflow.vitest.js`
- `tests/ui-event-bus-proper.vitest.js`
- `tests/helpers/mock-settings-dom.js`
- `tests/helpers/mock-api-keys.js` (delete when no references remain)
- `tests/browser/transcription-smoke.spec.js`
- `tests/browser/static-server.mjs`
- `tests/browser/fakes/authentication-factory.js` (create only as a build-time
  browser-test alias; name may vary within this directory)

**Out of scope:**

- Final sign-in/recovery visual design and unified User menu (Plan 033).
- Local file selection/drag-and-drop (Plan 034).
- GitHub workload identity or live OIDC calls (Plan 035).
- The existing manually triggered live Azure contract test and workflow. They
  remain a known, non-product API-key caller until Plan 035 migrates them to
  GitHub OIDC, and are excluded from this plan's product/browser-smoke scans.
  This exception does not permit any API-key path or fallback in application
  code, ordinary tests, or the deterministic browser smoke test.
- README/spec/runbook reconciliation (Plan 036), except removing active key
  examples from `.env.example` now so no implementation path retains them.
- Entra registration, delegated permission, consent, RBAC, resource, GitHub
  variable/secret, Pages source, or local-auth changes.
- Multi-tenant sign-in, resource discovery, app-managed RBAC, backend/proxy,
  API-key fallback, popup authentication, or shared Azure resources.

## Git workflow

- Branch: `advisor/032-entra-bearer-auth`
- Rebase onto completed Plan 031 before starting.
- Suggested logical commits:
  1. `security: add centralized Entra authentication boundary`
  2. `security: remove legacy API-key paths`
  3. `test: prove keyless token and cleanup boundaries`
- Do not push, merge, configure public identifiers, or make a live auth/Azure
  call unless the operator separately authorizes it.

## Steps

### Step 1: Add a write-only legacy credential cleanup gate

Create `js/legacy-credential-cleanup.js` with an idempotent function that calls
`localStorage.removeItem` for exactly the two agreed legacy names. Invoke it as
the first application operation after DOM readiness and before constructing
Settings or AuthenticationService.

Do not import the legacy names from a general `STORAGE_KEYS` object that would
keep them available to normal application code. Keep them private constants in
the migration module and annotate why they intentionally remain forever: a
browser profile opened months later must still be cleaned.

Tests must spy on storage and prove:

- exactly two `removeItem` calls on every startup;
- zero `getItem`, `setItem`, logging, or event emission involving those names;
- repeated cleanup is safe;
- Target URIs, model, theme, microphone, recording environment, sidebar state
  (until Plan 033 removes it), and transcript are untouched;
- cleanup executes before the first Settings/MSAL/storage read in bootstrap.

**Verify**:

```bash
npx vitest run tests/legacy-credential-cleanup.vitest.js
```

Expected: all cleanup/order/non-reading assertions pass.

### Step 2: Validate public authentication configuration without leaking it

Create `js/authentication-config.js` to read only the two Vite public variables,
validate non-empty identifier-shaped values, build a tenant-specific authority,
and derive the exact callback from the current origin plus Vite base.

The module must:

- expose no default/sample real value;
- never print a value in an error;
- reject `common`, `organizations`, or `consumers` authorities;
- use the exact `/auth/redirect.html` path for local and Pages builds;
- export the Cognitive Services scope as immutable metadata, or share one
  immutable constant with both retained adapters;
- treat missing configuration as a fail-closed application configuration state.

Update `.env.example` to contain placeholders for only non-secret public SPA
configuration and fake deterministic-test values. Remove all API-key examples.

Update the Pages workflow to refer to protected repository/environment variable
names, not literal values. Do not create or read those GitHub variables here.

**Verify**:

```bash
! rg -n "AZURE_.*API_KEY|OPENAI_API_KEY|TEST_MOCK_API_KEY" .env.example .github/workflows/pages.yml
rg -n "VITE_ENTRA_CLIENT_ID|VITE_ENTRA_TENANT_ID" .env.example .github/workflows/pages.yml
```

Expected: only public identifier placeholder names remain; no key variable.

### Step 3: Implement the sole MSAL owner

Create `AuthenticationService` around one `PublicClientApplication`. It alone
may import MSAL runtime APIs. Give it a small explicit surface such as:

```js
initialize()
getState()                  // safe enum/status only
getAccountPresentation()    // name + username for Plan 033; never tokens/claims dump
ensureTokenReady(scope)     // boolean/typed safe result; never returns token
getAccessToken(scope)       // token-provider path only
signInRedirect()
signOutRedirect()
```

Required behavior:

1. await MSAL initialization;
2. process redirect completion without logging the result;
3. choose the returned/active/cached account deterministically without
   hard-coding an identity;
4. in a new tab with no account, make at most one best-effort `ssoSilent` call;
5. use `acquireTokenSilent` for readiness and request-time acquisition;
6. categorize `InteractionRequiredAuthError` separately from configuration,
   network, and generic authentication failure;
7. use `loginRedirect`, `acquireTokenRedirect` if needed, and redirect logout
   only—never popup APIs;
8. emit safe state events containing no token, authentication result, claims
   object, tenant/client identifiers, or full error object.

Do not read MSAL's cache directly. Do not create a refresh-token timer. Do not
store an account object in Settings/localStorage.

**Verify**:

```bash
npx vitest run tests/authentication-service.vitest.js
```

Expected tests cover initialization, redirect return, restored account,
single-attempt new-tab SSO, silent success, interaction-required categorization,
redirect-only interaction, sign-out, missing config, and safe event payloads.

The first real application import of MSAL adds the already-approved security
runtime to the shipped artifact. Keep Plan 031's existing 20 kB application
ceiling unchanged. Use a deterministic Vite chunk boundary to isolate the
AuthenticationService and MSAL runtime, then add a separate size-limit entry
covering every generated authentication/MSAL JavaScript chunk. Set that entry
to the smallest 5 kB ceiling above the observed Brotli total, with no additional
headroom. Extend the generated-artifact test so every shipped JavaScript chunk
is covered by exactly one application, authentication, or redirect budget; an
unmeasured lazy/dynamic chunk is a failure, not an optimization.

**Verify**:

```bash
npm run build
npm run size
npx vitest run tests/vite-build.vitest.js
```

Expected: the original application and redirect ceilings remain unchanged,
the authentication runtime passes its explicit bounded budget, and no generated
JavaScript asset is omitted from measurement.

### Step 4: Introduce a narrow token provider and central bearer ownership

Create a token-provider interface/object that exposes only “get a current token
for this declared scope.” Inject it into `AzureAPIClient`; keep MSAL imports out
of the client.

Change retained adapters to return model-specific body/status information and
immutable scope metadata. Remove credential metadata and authentication
headers. `AzureAPIClient.transcribe` must:

1. validate model + HTTPS Target URI;
2. obtain the adapter's scope;
3. build the model body;
4. request a token immediately before `fetch`;
5. construct `{ Authorization: `Bearer ${token}` }` in a local request object;
6. never assign the token to `this`, Settings, an adapter, event data, logger
   context, retry context, or error object;
7. reuse that token only for the bounded attempts of this one logical request;
   if a 401 occurs, stop rather than retrying/reacquiring in a loop.

Do not manually set multipart `Content-Type`; the browser must add its boundary.

Add unit assertions that adapters receive no token and produce no auth header,
while the final fetch gets exactly one fake bearer header. Inspect event history
and logger spies for absence of the fake token.

**Verify**:

```bash
npx vitest run tests/token-boundary.vitest.js tests/model-adapters.vitest.js tests/api-client-validation.vitest.js
```

Expected: central bearer ownership and credential-blind adapters are proven.

### Step 5: Remove every normal key and Whisper Translate path

In the same atomic change:

- delete both legacy key entries from `STORAGE_KEYS`;
- delete key header constants, key validation pattern/messages, key DOM IDs,
  key sanitization, key form focus logic, key storage metadata, `hasApiKey`
  event data, key inputs, key test helpers, and key adapter branches;
- make Settings load/save/return only `{ model, uri }` plus existing unrelated
  preferences;
- remove `whisper-translate` constant, adapter file, registry entry, parsing
  precedence, tests, and configuration paths;
- retain exactly Azure Whisper and MAI-Transcribe 1.5;
- retain manual Target URI storage and HTTPS validation;
- never call `localStorage.clear()`.

The two literal legacy storage names may remain only in
`legacy-credential-cleanup.js` and its fake-value tests. No application setting
may return or emit them.

**Verify**:

```bash
if rg -n "whisper_api_key|mai_transcribe_api_key" js index.html tests \
  --glob '!tests/browser-live/**' \
  | rg -v "legacy-credential-cleanup|legacy credential cleanup"; then
  echo "Unexpected legacy credential reference found" >&2
  exit 1
fi
! rg -n "Ocp-Apim-Subscription-Key|['\"]api-key['\"]|WHISPER_TRANSLATE|whisper-translate|hasApiKey|API_KEY_VALUE_PATTERN" js index.html tests \
  --glob '!tests/browser-live/**'
```

Expected: the first scan has no matches outside the cleanup module/tests; the
second has no matches at all.

### Step 6: Categorize 401/403 without retaining authentication responses

Give API errors stable safe codes, for example `authentication-required` and
`azure-authorization-denied`, while retaining numeric `status`. For 401/403:

- do not retry;
- do not include the response body, headers, request Authorization, raw MSAL
  error, or authentication result in logs/events;
- emit only the safe category/status/model needed by presentation code;
- preserve the Unsent Recording in `AudioHandler` for Plan 033 recovery;
- direct 403 toward external RBAC guidance, never role assignment.

Keep existing 429/5xx timeout/backoff behavior and tests unchanged except for
the new fake token provider.

**Verify**:

```bash
npx vitest run tests/api-client-errors.vitest.js tests/audio-handler-integration.vitest.js
```

Expected: 401/403 each make one fetch, zero sleeps/retries, retain pending audio,
and expose no response/token detail; 429/5xx tests keep their existing bounds.

### Step 7: Gate microphone activation on authentication readiness

Inject an authentication-readiness boundary into `AudioHandler`. Before
requesting microphone permission or calling `getUserMedia`, determine the
selected adapter scope and ask AuthenticationService to establish silent token
readiness. AudioHandler receives only a safe outcome, never a token.

Outcomes:

- ready: continue current browser/config/microphone flow;
- signed out: stop before microphone access and emit safe signed-out state;
- interaction required: stop before microphone access and emit the explicit
  interaction-required state; Plan 033 supplies the redirect action;
- configuration/auth failure: stop and expose a safe diagnostic.

The actual API call still asks the token provider again immediately before
fetch. Do not redirect automatically from AudioHandler.

**Verify**:

```bash
npx vitest run tests/audio-handler-integration.vitest.js tests/ui-event-bus-proper.vitest.js
```

Expected: signed-out/interaction-required paths make zero microphone and Azure
calls; ready path retains current recording behavior.

### Step 8: Replace browser-test key injection with a build-time auth double

Create a Vite `browser-test` mode/alias that substitutes a deterministic fake
AuthenticationService/token provider only in the test bundle. It must not be a
runtime global, query flag, localStorage token, production branch, or publicly
reachable test endpoint. A production build scan must prove fake class names
and fake token values are absent.

Update the browser smoke test and HTTPS stub:

- preload only model, Target URI, and unrelated non-secret preferences;
- fake authentication starts ready;
- preflight allows `authorization`, not key headers;
- POST contains exactly `Authorization: Bearer <fake-test-value>`;
- no API-key header exists;
- neither fake token nor any `msal.*` cache entry is placed in localStorage;
- startup removes fake legacy key values without reading them;
- the real worker/transcription/transcript/reload assertions remain.

**Verify**:

```bash
npm run test:browser
npm run build
! rg -n "deterministic-test-token|FakeAuthenticationService|browser-test-auth" dist
```

Expected: smoke passes with real Authorization CORS; production output contains
no test double/token marker.

### Step 9: Run the complete atomic security gate

Run every canonical gate and inspect the diff for key/token leakage:

```bash
npm run build
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
git diff --check
git diff --name-only
```

Expected: all pass; only in-scope files changed. Then run targeted scans:

```bash
! rg -n "loginPopup|acquireTokenPopup|localStorage.*token|setItem\(.*token|console\..*(token|auth)|logger\..*(token|auth)" js index.html
! rg -n "Ocp-Apim-Subscription-Key|['\"]api-key['\"]|whisper-translate" js index.html tests \
  --glob '!tests/browser-live/**'
```

Expected: no forbidden pattern. Review false positives manually; do not weaken
the scan merely to pass.

## Test plan

- New AuthenticationService unit tests with a fully fake MSAL instance; never
  put a real token or identifier in fixtures.
- New cleanup tests using fake key values, including call-order proof before any
  settings/auth read.
- Token-boundary tests asserting only AzureAPIClient constructs Authorization
  and all adapters/events/logs remain token-free.
- Update Settings persistence/workflow tests to prove Target URIs and other
  settings survive while no key control/storage path remains.
- Update adapter matrices to exactly two models and retain request-body/limit
  assertions.
- Add explicit one-attempt 401 and 403 tests; retain bounded 429/5xx cases.
- Add microphone gate tests proving zero permission/capture calls when auth is
  not ready.
- Convert the Playwright smoke to a compile-time fake auth provider and real
  Authorization preflight/POST.
- Keep coverage thresholds unchanged. New modules are production code and must
  be included in coverage; do not exclude them.

## Done criteria

- [ ] Cleanup removes exactly the two legacy key entries before all other initialization and never reads their values.
- [ ] Settings/localStorage preserve Target URIs, model, theme, microphone, recording profile, and transcript.
- [ ] AuthenticationService is the only module importing MSAL runtime APIs.
- [ ] MSAL uses tenant-specific single-tenant configuration, sessionStorage, the exact bridge, and redirect-only interaction.
- [ ] New-tab silent SSO is one best-effort attempt with explicit fallback.
- [ ] Only AzureAPIClient constructs a bearer header; adapters declare scope and never see a token.
- [ ] Exactly two adapters remain: Whisper and MAI-Transcribe 1.5.
- [ ] No key input, key header, key validator, key event field, or API-key fallback remains in the product, ordinary tests, or deterministic browser smoke; the separately inventoried live contract remains isolated for Plan 035.
- [ ] 401 and 403 are categorized, non-retryable, and response/token-safe; 429/5xx bounded retry behavior remains.
- [ ] Recording cannot activate the microphone until silent token readiness succeeds.
- [ ] Tokens/authentication results never enter Settings, ordinary localStorage, adapters, events, logs, or application caches.
- [ ] Production bundle contains no deterministic auth double or fake token.
- [ ] The original 20 kB application and 5 kB redirect ceilings remain unchanged; every shipped authentication/MSAL JavaScript chunk is isolated and measured under its own smallest-next-5-kB ceiling.
- [ ] All build, lint, coverage, dependency, audit, size, and browser gates pass.
- [ ] No live Entra/Azure/GitHub configuration or call was made.
- [ ] Only in-scope files changed and `plans/README.md` was updated as instructed.

## STOP conditions

Stop and report instead of improvising if:

- `gpt-5.6-sol` with extra-high (`xhigh`) effort is unavailable.
- Plan 031 is not complete or its callback/build contract differs materially.
- The retained app registration does not expose the delegated Cognitive
  Services permission needed for `https://cognitiveservices.azure.com/.default`.
- MSAL requires a secret/certificate, localStorage, popup, Graph permission,
  multi-tenant authority, or normal application logic on the bridge page.
- A token must cross the stated provider → AzureAPIClient local-variable boundary.
- A test can pass only by adding a production test hook, storing a token/key, or
  weakening existing retry/coverage/size/security gates.
- The approved authentication runtime cannot be isolated into an honestly
  measured bounded chunk without raising the existing application/redirect
  ceilings or leaving any generated JavaScript unmeasured.
- Removing keys and enabling bearer requests cannot be made atomic.
- Any real tenant/client/subscription/resource/principal identifier, Target URI,
  token, key, authentication response, or audio would enter a file/log/issue/artifact.
- Direct browser authentication/CORS fails after configuration, callback,
  audience, consent, RBAC, endpoint, and CORS causes are eliminated. Do not add
  a backend; return to Wayfinder with reproducible sanitized evidence.
- A step requires changing Entra, RBAC, Azure, Pages, GitHub variables/secrets,
  or making a live/billable call without explicit approval.

## Maintenance notes

- The versioned Whisper and current MAI endpoints share the Cognitive Services
  scope today. If either API family changes, revalidate adapter scope metadata;
  do not centralize a guessed universal audience.
- Never “simplify” by letting Settings or adapters own tokens. The narrow
  provider and request-local bearer value are deliberate security boundaries.
- Leave the legacy cleanup remove-only calls indefinitely; they protect browser
  profiles that first reopen after cutover.
- Plan 033 owns exact interaction presentation and safe redirect/logout recovery.
  Plan 035 owns workload OIDC; do not reuse the browser SPA identity for CI.
