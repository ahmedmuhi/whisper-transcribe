# ADR-0001: Adopt Vite and MSAL Browser packaging

## Status

Accepted

## Date

2026-07-18

## Context

MSAL Browser v5 provides its redirect bridge as an npm package import. Its
deprecated CDN delivery cannot satisfy that contract, so a browser build step
is needed while preserving the existing vanilla JavaScript application and
static hosting model. The bridge also has a specific frameability contract:
`Cross-Origin-Opener-Policy` on the callback severs communication with the main
application.

## Decision

Use exactly pinned Vite `8.1.5` to produce an ignored `dist/` directory from the
vanilla JavaScript entries. Pin `@azure/msal-browser` exactly at `5.17.1` as the
sole production dependency and emit a dedicated redirect-bridge entry. The
canonical local/production commands are `npm start`, `npm run build`, and
`npm run preview`; the Pages workflow runs `npm ci` followed by
`npm run build -- --mode pages`. GitHub Actions uploads only `dist/` to GitHub
Pages; generated bundles are never committed.

The redirect bridge is a separate, frameable page at
`/auth/redirect.html`. It invokes only MSAL's
`broadcastResponseToMainFrame`, performs no application bootstrap, storage read,
or API work, and must not receive `Cross-Origin-Opener-Policy` or frame-blocking
headers. Its registration redirect URI must match the complete protocol, host,
port, base path, and callback path exactly.

Built-output checks cover both entries and the separated authentication chunk.
The initial packaging measurements were 19.52 kB for the application entry and
2.73 kB for the redirect bridge. The current reviewed Brotli ceilings in
`package.json` are 22.5 kB for the application assets, 60 kB for the
authentication runtime, and 5 kB for the redirect bridge. The application
ceiling moved from 20.5 kB to 22 kB for the registry-driven model UI and then
to 22.5 kB when the four selectable colour palettes landed on top of it
(measured 22.31 kB); the authentication ceiling moved from 55 kB because the
palette constants in the shared `js/constants.js` bleed into the
authentication chunk (measured 55.09 kB, over the 55 kB bucket), and
`tests/vite-build.vitest.js` re-derives that one from the built output rather
than trusting the literal. That bleed is a known measurement flaw; a
vendor-only MSAL budget that excludes shared constants is planned separately.

## Consequences

Node and npm are required to build the application, but production remains
static and browser-only with no UI framework or backend. MSAL Browser is the
sole production dependency. CI tests and sizes generated output rather than
source modules.

MSAL updates are security-relevant. Any update requires redirect-bridge,
browser, and generated-artifact regression testing.

## Rejected alternatives

- Handwritten OAuth or PKCE: duplicates a security-sensitive protocol boundary.
- The retired CDN package or a third-party ESM CDN: cannot provide the supported
  v5 redirect bridge packaging contract.
- Committed generated bundles: obscures review and makes build artifacts drift.
- A UI framework or backend: neither is required for static packaging.

## Operational boundary

Switching the repository's Pages source, configuring public SPA identifiers,
registering callbacks, deploying a candidate, creating identities, assigning
RBAC, dispatching live workflows, or changing Azure resources remains an
explicit human operation. The accepted packaging decision grants no such
authority. Follow the [sanitized keyless operator
runbook](../keyless-operator-runbook.md).

## Primary references

- [MSAL Browser redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- [MSAL Browser configuration and session cache](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/configuration)
- [`@azure/msal-browser` 5.17.1 package](https://www.npmjs.com/package/%40azure/msal-browser/v/5.17.1)
- [Vite 8.1.5 release](https://github.com/vitejs/vite/releases/tag/v8.1.5)
- [Vite static deployment](https://vite.dev/guide/static-deploy)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
