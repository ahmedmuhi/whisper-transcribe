# Plan 039: Share the MSAL sign-in session across same-browser tabs

> **Executor instructions**: Follow this plan step by step. Add or adjust the
> deterministic tests before changing production behavior. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report instead of inventing an application-
> managed token or account cache. The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f9c90f7..HEAD -- js/authentication-config.js js/authentication-service.js tests/authentication-service.vitest.js tests/legacy-credential-cleanup.vitest.js README.md CLAUDE.md spec/spec-design-api-client.md docs/adr/`
> If an in-scope authentication or documentation contract changed, compare the
> current code with the excerpts below. STOP on a semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: S/M
- **Risk**: MED
- **Depends on**: none (Plans 031–038 are complete)
- **Category**: migration
- **Status**: TODO
- **Planned at**: commit `f9c90f7`, 2026-07-19

## Why this matters

Whisper Transcribe currently stores MSAL's durable authentication cache in
`sessionStorage`. Browser tabs do not share that storage, so every new tab
briefly becomes signed out and asks the User to select **Continue with
Microsoft**, even when another tab is already signed in. The desired experience
is for a new same-origin tab to discover the existing MSAL account and become
ready automatically whenever the browser still has the shared MSAL session.

This is a security/UX trade-off, not a request to make tokens non-sensitive.
Microsoft documents `localStorage` as the MSAL option for SSO between tabs of
the same application. In MSAL Browser v4 and later its authentication artifacts
are encrypted at rest, but Microsoft explicitly warns that this does not
protect them from malicious JavaScript or XSS. MSAL must remain the only owner
of its cache; application code must never read, copy, migrate, log, or expose
tokens or account objects.

Primary references:

- <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching>
- <https://learn.microsoft.com/en-us/entra/identity-platform/msal-js-sso>
- <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/configuration>
- <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/logout>

## Current state and target contract

`js/authentication-config.js:54-63` currently creates this immutable MSAL
configuration:

```js
return Object.freeze({
    auth: Object.freeze({
        clientId: validatedClientId,
        authority: `https://login.microsoftonline.com/${validatedTenantId}`,
        redirectUri: deriveRedirectUri(origin, basePath)
    }),
    cache: Object.freeze({
        cacheLocation: 'sessionStorage'
    })
});
```

`js/authentication-service.js:140-159` already has the correct startup order:

```js
await this.#client.initialize();
const redirectResult = await this.#client.handleRedirectPromise();
let account = redirectResult?.account || this.#client.getActiveAccount();

if (!account) {
    account = [...this.#client.getAllAccounts()]
        .sort((left, right) => accountSortKey(left).localeCompare(accountSortKey(right)))[0] || null;
}

if (!account) {
    const ssoResult = await this.#client.ssoSilent({ scopes: [] });
    account = ssoResult?.account || null;
}

if (!account) {
    return this.#setState(AUTHENTICATION_STATES.SIGNED_OUT);
}

this.#client.setActiveAccount(account);
return this.#setState(AUTHENTICATION_STATES.READY);
```

Do not restructure this service. Once MSAL uses `localStorage`, a new tab's
`getAllAccounts()` call can see the account written by the first tab. The
existing deterministic selection then reaches `READY` without `ssoSilent`, a
redirect, or a Continue button. If no usable cached account exists, the current
single `ssoSilent` attempt and explicit interaction-required fallback remain.

The target cache contract is:

```js
cache: Object.freeze({
    cacheLocation: 'localStorage'
})
```

Do **not** configure `temporaryCacheLocation`. MSAL's temporary OAuth artifacts
must retain their documented default tab-scoped behavior; putting temporary
artifacts in `localStorage` creates unsupported multi-tab interaction hazards.
Do not access MSAL's storage keys directly, add a second account cache, or copy
the old `sessionStorage` contents into `localStorage`.

Expected rollout behavior: an already-authenticated tab using the old build may
need one normal sign-in or silent SSO after the new build first loads because
the old tab-scoped cache is deliberately not migrated. Once MSAL writes the new
shared cache, later tabs in that same browser session should become ready
automatically. Genuine Entra interaction-required conditions must still show
the safe Continue action.

Existing contracts that must remain true:

- `AuthenticationService` alone owns MSAL initialization, redirect, logout, and
  token acquisition.
- Model adapters, settings, events, logs, and application-managed storage never
  receive a token or MSAL account object.
- `signOutRedirect()` continues to call MSAL with only the active account;
  MSAL clears its own cache and completes provider logout.
- Targeted legacy API-key cleanup still removes only the two retired key names
  without reading their values or clearing non-secret settings.
- `CONTEXT.md` is domain vocabulary and remains byte-for-byte unchanged.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 with the pinned lockfile |
| Focused auth tests | `npx vitest run tests/authentication-service.vitest.js tests/legacy-credential-cleanup.vitest.js` | all tests pass |
| Production build | `npm run build` | exit 0; static artifact generated |
| Lint | `npm run lint` | exit 0, no errors |
| Coverage | `npm run test:coverage` | all tests pass; existing thresholds are not lowered |
| Dependency graph | `npm run deps:check && npm run deps:check:prod` | both exit 0 |
| Vulnerabilities | `npm audit --audit-level=high` | exit 0; no high/critical finding |
| Asset budgets | `npm run size` | all existing limits pass unchanged |
| Browser regression | `npm run test:browser` | all deterministic Playwright scenarios pass |

## Scope

**In scope:**

- `js/authentication-config.js`
- `tests/authentication-service.vitest.js`
- `README.md`
- `CLAUDE.md`
- `spec/spec-design-api-client.md`
- `docs/adr/0002-share-msal-cache-across-tabs.md` (new)

`tests/legacy-credential-cleanup.vitest.js` is a required verification target
but should change only if a missing assertion is necessary to prove the
existing cleanup boundary. `js/authentication-service.js` is a verification
target, not an expected production edit.

**Out of scope:**

- Application-managed token/account persistence or direct access to MSAL cache
  keys and values.
- `temporaryCacheLocation: 'localStorage'`, cookies, service workers,
  `BroadcastChannel`, storage-event synchronization, or custom cross-tab IPC.
- Changing redirect URIs, app registration, tenant configuration, RBAC, Azure
  resources, Target URI storage, transcription behavior, retry policy, model
  adapters, or GitHub OIDC.
- Changing logout into a local-only operation or guaranteeing instantaneous UI
  updates in an already-open sibling tab. This plan fixes startup in a **new**
  tab; MSAL owns shared-cache invalidation.
- CSP expansion or an unrelated XSS-hardening project. If an executable HTML
  injection sink is discovered, STOP and report it rather than broadening this
  focused change silently.
- Modifying `CONTEXT.md`, reducing quality thresholds, or updating dependencies.

## Git workflow

- Work in an isolated worktree on branch
  `advisor/039-share-msal-session-across-tabs` based on current `origin/main`.
- Use test-first commits or one coherent conventional commit such as
  `fix(auth): share MSAL session across tabs`.
- Do not commit generated `dist/`, coverage output, browser artifacts, tokens,
  account data, identifiers, Target URIs, or screenshots.
- Push/open a PR only when the reviewer directs it. Never merge from the
  executor session.

## Steps

### Step 1: Lock the cross-tab cache contract in deterministic tests

Update the configuration test in `tests/authentication-service.vitest.js`:

1. Rename the session-cache wording to describe the shared MSAL cache.
2. Expect `cacheLocation: 'localStorage'` exactly.
3. Assert the returned cache object does not own a
   `temporaryCacheLocation` property.
4. Keep the object-freezing assertions.

Strengthen the existing cached-account startup test so its name and assertions
make the new-tab contract explicit: when `getActiveAccount()` is empty but
`getAllAccounts()` exposes a cached account, initialization sets that account,
reaches `READY`, does not call `ssoSilent`, and never calls `loginRedirect`.
Preserve the existing tests for deterministic multi-account selection,
interaction-required fallback, redirect logout, safe events, and token
non-leakage.

Run the focused test now. It must fail only on the old `sessionStorage`
configuration before Step 2; any unrelated failure is a STOP condition.

**Verify before production edit**:
`npx vitest run tests/authentication-service.vitest.js` -> the expected cache
assertion fails with actual `sessionStorage`; no unrelated test fails.

### Step 2: Change only MSAL's durable cache location

In `createAuthenticationConfig()` change `cacheLocation` from
`sessionStorage` to `localStorage`. Do not add another cache option and do not
edit `AuthenticationService` unless the Current state excerpt is no longer
true and the reviewer revises this plan.

**Verify**:
`npx vitest run tests/authentication-service.vitest.js tests/legacy-credential-cleanup.vitest.js`
-> all focused tests pass, including shared-cache startup, safe fallback,
logout, token non-leakage, and write-only legacy key deletion.

### Step 3: Record the security/UX decision and reconcile active guidance

Create `docs/adr/0002-share-msal-cache-across-tabs.md` using the existing ADR
style. It must record:

- context: tab-scoped `sessionStorage` forces an explicit Continue action in
  every new tab;
- decision: MSAL alone uses `localStorage` for durable authentication artifacts;
- constraints: temporary cache remains default/tab-scoped; application code
  never reads or writes MSAL artifacts; full-page interaction remains the
  fallback; no manual session-to-local migration;
- consequences: same-origin new tabs can start ready, exposure to an XSS lasts
  across tabs, MSAL v4+ at-rest encryption is defense-in-depth rather than XSS
  protection, logout remains MSAL-owned, and the first post-upgrade visit may
  require one normal authentication;
- alternatives rejected: keep `sessionStorage`, memory-only cache, custom
  token/account copying, and local temporary cache;
- the four primary Microsoft links in this plan.

Reconcile `README.md`, `CLAUDE.md`, and
`spec/spec-design-api-client.md`. Replace claims that *no token can exist in
localStorage* with the precise boundary: no **application-managed** settings,
events, adapters, or logs contain tokens; MSAL alone owns its opaque shared
cache. State that localStorage sharing avoids repeated new-tab Continue prompts
when the existing Microsoft session permits it, without promising that Entra
will never require interaction.

Do not describe encrypted localStorage as safe from XSS. Do not alter domain
terminology in `CONTEXT.md`.

**Verify**:

```bash
rg -n "sessionStorage|localStorage|temporaryCacheLocation|cross-tab|new tab" \
  README.md CLAUDE.md spec/spec-design-api-client.md docs/adr/0002-share-msal-cache-across-tabs.md
git diff --exit-code -- CONTEXT.md
```

Expected: active documents consistently name MSAL-owned `localStorage`, the ADR
explicitly keeps temporary storage at its default, and `CONTEXT.md` has no diff.

### Step 4: Run the full repository gates and review the artifact boundary

Run every command in “Commands you will need.” Then inspect the production
bundle and diff:

```bash
git diff --check
git status --short
git diff --stat
rg -n "temporaryCacheLocation|whisper_api_key|mai_transcribe_api_key|Ocp-Apim-Subscription-Key|[\"']api-key[\"']" \
  js tests README.md CLAUDE.md spec docs/adr
```

Expected: all automated gates pass; no generated artifact is tracked; the only
MSAL cache behavior change is the intended durable location; retired key names
appear only in the targeted cleanup/test/documentation contexts; no API-key
header or fallback returns.

### Step 5: Reviewer production acceptance after merge and deployment

This is a human/reviewer gate, not an executor mutation. After CI passes and the
reviewed commit is deployed through the existing Pages workflow:

1. In a normal (not private/incognito) Edge session, sign in in tab A and wait
   for recording/upload readiness. Open the production URL in tab B. Tab B may
   briefly show **Checking sign-in**, but must become ready without showing or
   requiring **Continue with Microsoft**.
2. Repeat the same two-tab check in Chrome and macOS Safari. Record only browser
   version, candidate SHA, date, and pass/fail; do not capture identity, tokens,
   Target URIs, HAR files, or screenshots.
3. In one browser, log out through the account menu. A newly opened tab must not
   recover the logged-out cached account. It must remain safely signed out or
   require genuine Microsoft interaction.
4. If Entra genuinely demands interaction, verify the existing Continue action
   still performs the approved full-page redirect and returns without a loop.

No audio or Azure transcription request is required for this cache-only change.

## Test plan

- `tests/authentication-service.vitest.js`
  - exact immutable `localStorage` cache configuration;
  - `temporaryCacheLocation` deliberately absent;
  - shared cached account makes startup `READY` without silent or interactive
    login;
  - deterministic cached-account selection preserved;
  - missing cache preserves one best-effort `ssoSilent` attempt and safe
    interaction-required state;
  - redirect logout still receives only the active account;
  - events/errors/token acquisition do not leak authentication artifacts.
- `tests/legacy-credential-cleanup.vitest.js`
  - existing targeted deletion remains write-only and preserves every
    unrelated localStorage setting.
- Existing Playwright suite
  - signed-out gate, authentication recovery, logout, recording/upload safety,
    account menu, and legacy cleanup remain green.
- Production acceptance
  - Edge, Chrome, and Safari each pass the normal two-tab startup check;
  - post-logout new-tab behavior fails closed;
  - no live transcription call is made.

## Done criteria

- [ ] MSAL's durable cache location is exactly `localStorage`.
- [ ] `temporaryCacheLocation` is not configured.
- [ ] No application module reads, copies, migrates, logs, or stores MSAL token
      or account artifacts.
- [ ] Deterministic tests cover shared-cache startup, safe interaction fallback,
      logout, targeted legacy cleanup, and token/event non-leakage.
- [ ] README, CLAUDE guidance, API design spec, and ADR 0002 agree on the
      security/UX trade-off; `CONTEXT.md` is unchanged.
- [ ] Build, lint, coverage, dependency, high-severity audit, size, and browser
      gates all pass without relaxed thresholds.
- [ ] Independent review approves the exact diff.
- [ ] The reviewed commit is merged and deployed through the existing Pages
      workflow by the authorized operator.
- [ ] In normal Edge, Chrome, and Safari sessions, a second production tab
      becomes ready automatically whenever tab A's shared MSAL session is
      available; genuine interaction-required cases remain safe.
- [ ] A new tab opened after logout does not silently restore the logged-out
      account.
- [ ] `plans/README.md` records the final outcome.

## STOP conditions

Stop and report; do not improvise if:

- current authentication initialization no longer checks redirect result,
  active account, cached accounts, then `ssoSilent` in that order;
- meeting the requirement appears to need app-managed token/account storage,
  direct MSAL cache access, `temporaryCacheLocation: 'localStorage'`, cookies,
  a service worker, or cross-tab IPC;
- an executable XSS/HTML-injection sink is discovered in production code;
- logout would need to bypass MSAL or preserve stale shared account artifacts;
- a test requires real tenant identifiers, tokens, Target URIs, authentication
  responses, audio, or Azure calls;
- an in-scope verification fails twice after one reasonable correction;
- the exact change requires a dependency update, Entra/Azure mutation, or any
  out-of-scope file.

## Maintenance notes

- Reviewers should scrutinize the boundary between MSAL-owned localStorage and
  application-owned localStorage. The former is deliberate; application access
  to MSAL artifacts remains forbidden.
- Keep `@azure/msal-browser` pinned. Re-read Microsoft's cache and migration
  guidance before any major MSAL upgrade because encryption and cache migration
  behavior are library-version contracts.
- Do not claim that cache encryption solves XSS. Continue treating prevention
  of executable injection as the controlling browser security boundary.
- Instant UI synchronization in an already-open sibling tab is intentionally
  deferred; it is distinct from eliminating the prompt when a new tab starts.
