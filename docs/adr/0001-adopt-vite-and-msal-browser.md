# ADR-0001: Adopt Vite and MSAL Browser packaging

## Status

Accepted

## Date

2026-07-18

## Context

MSAL Browser v5 provides its redirect bridge as an npm package import. Its
deprecated CDN delivery cannot satisfy that contract, so a browser build step
is needed while preserving the existing vanilla JavaScript application and
static hosting model.

## Decision

Use Vite to produce an ignored `dist/` directory from the vanilla JavaScript
entries. Pin `@azure/msal-browser` exactly at `5.17.1` as the sole runtime
dependency and emit a dedicated redirect-bridge entry. GitHub Actions builds
that static artifact and uploads only `dist/` to GitHub Pages; generated
bundles are never committed.

The redirect bridge is a separate, frameable page. It invokes only MSAL's
`broadcastResponseToMainFrame`, performs no application bootstrap or API work,
and must not receive `Cross-Origin-Opener-Policy` or frame-blocking headers.

Built-output checks cover both entries. The initial Brotli measurements are
19.52 kB for the application entry and 2.73 kB for the redirect bridge. Their
respective 20 kB and 5 kB limits are the next 5 kB ceilings, with no extra
headroom.

## Consequences

Node and npm are now required to build the application, but production remains
static and browser-only. The MSAL runtime dependency is the sole exception to
the previous zero-runtime-dependency rule. CI tests and sizes generated output
rather than source modules.

MSAL updates are security-relevant. Any update requires redirect-bridge,
browser, and generated-artifact regression testing.

## Rejected alternatives

- Handwritten OAuth or PKCE: duplicates a security-sensitive protocol boundary.
- The retired CDN package or a third-party ESM CDN: cannot provide the supported
  v5 redirect bridge packaging contract.
- Committed generated bundles: obscures review and makes build artifacts drift.
- A UI framework or backend: neither is required for static packaging.
