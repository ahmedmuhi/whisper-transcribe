# ADR-0002: Share the MSAL cache across browser tabs

## Status

Accepted

## Date

2026-07-19

## Context

Whisper Transcribe originally configured MSAL Browser to keep its durable
authentication artifacts in `sessionStorage`. That storage is isolated to one
browser tab. A new tab therefore could not discover the account already known
to another tab and displayed **Continue with Microsoft**, even when the User
still had a valid Microsoft session.

Microsoft documents `localStorage` as the MSAL cache location for single sign-on
between tabs of the same application. MSAL Browser v4 and later encrypts these
authentication artifacts at rest, but that encryption is defense in depth: it
does not protect credentials from malicious JavaScript or an XSS compromise.

## Decision

Configure only MSAL's durable `cacheLocation` as `localStorage`.
`AuthenticationService` remains the sole owner of MSAL initialization, account
selection, redirects, silent token acquisition, and logout. On startup it
continues to process a redirect result, check the active account, select a
cached account deterministically, then attempt `ssoSilent` only when no account
is available. A new same-origin tab can therefore become ready from MSAL's
shared account without another interactive action when the existing Microsoft
session permits it.

Do not configure `temporaryCacheLocation`. Temporary OAuth artifacts retain
MSAL's default tab-scoped behavior. Application code must never read, write,
copy, migrate, log, or expose MSAL cache artifacts, tokens, or account objects.
The application does not copy the previous `sessionStorage` cache into
`localStorage`; the first visit after deployment may require one normal silent
or interactive authentication. Full-page redirect remains the safe fallback
whenever Microsoft Entra requires interaction.

## Consequences

- New same-origin tabs can normally start ready instead of showing **Continue
  with Microsoft**.
- MSAL-owned authentication artifacts are available across tabs. An XSS
  compromise could therefore expose them beyond the lifetime of one tab;
  MSAL's at-rest encryption must not be described as XSS protection.
- Application-managed Settings, adapters, events, logs, and storage continue to
  contain no token or MSAL account artifacts.
- Logout remains MSAL-owned. `logoutRedirect` clears MSAL's cache and completes
  provider logout; the application does not implement local-only cache removal.
- Genuine interaction-required conditions remain visible and recover through
  the existing full-page redirect without a custom cross-tab channel.
- An already-open tab running the previous build is not migrated. One normal
  authentication may be needed before the new shared cache is populated.

## Rejected alternatives

- Keep `sessionStorage`: preserves tab isolation but forces the repeated new-tab
  Continue action that this decision resolves.
- Use memory-only storage: loses the account on refresh and creates still more
  interaction without satisfying cross-tab startup.
- Copy tokens or account objects into application storage: duplicates a
  security-sensitive cache and bypasses MSAL ownership.
- Configure temporary OAuth artifacts in `localStorage`: introduces unsupported
  multi-tab interaction hazards for redirect transactions.

## Primary references

- [MSAL Browser caching](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching)
- [Single sign-on with MSAL.js](https://learn.microsoft.com/en-us/entra/identity-platform/msal-js-sso)
- [MSAL Browser configuration](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/configuration)
- [MSAL Browser logout](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/logout)
