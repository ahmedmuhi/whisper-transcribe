# CLAUDE.md

This file is the executor architecture guide for Whisper Transcribe. Use
`CONTEXT.md` for canonical domain vocabulary and keep every public artifact free
of real identifiers, Target URIs, credentials, authentication responses, audio,
transcripts, screenshots, and private command output.

## Runtime and commands

Whisper Transcribe is a Vite-built, browser-only vanilla JavaScript SPA. It has
no UI framework, backend, runtime server, or key fallback. Exactly pinned
`@azure/msal-browser` `5.17.1` is the sole production dependency; Vite `8.1.5`
and all test tools are development dependencies. Node.js `>=22.12.0` is required;
CI uses Node.js 24.

Canonical commands from `package.json`:

```bash
npm ci                                    # install the lockfile graph; does not write dist/
npm start                                 # Vite dev server on 127.0.0.1:4173; does not write dist/
npm run build                             # production Vite build; writes dist/
npm run preview                           # serves the existing dist/ on 127.0.0.1:4176
npm test                                  # deterministic Vitest suite; does not write repository dist/
npx vitest run tests/<name>.vitest.js     # one deterministic test file
npm run test:watch                        # Vitest watch mode
npm run test:coverage                     # Vitest plus 85/80/70/85 thresholds
npm run lint                              # production, tests, tooling, and config ESLint gate
npm run lint:fix                          # scoped ESLint rewrite
npm run deps:check                        # full Knip gate
npm run deps:check:prod                   # production Knip/dependency gate
npm audit --audit-level=high              # high/critical dependency gate
npm run size                              # reads the built dist/assets budgets
npm run test:browser                      # writes a fresh browser-test dist/ and runs Chromium
npm run test:browser:headed               # same deterministic suite with a visible browser
npm run test:browser:live                 # writes live-contract dist/ and may call Azure; opt-in only
```

Do not run `test:browser:live` without a fresh approval for the protected,
potentially billable live stage. The deterministic `test:browser` server builds
and serves `dist/`, owns its local HTTPS stub, and must not reuse `npm start`.

Husky runs lint on pre-commit and coverage plus `deps:check:prod` on pre-push.
Tests are `tests/**/*.vitest.js`; Vitest uses Happy DOM and
`tests/vitest-setup.js`. Playwright deterministic tests are under
`tests/browser/`; the guarded live contract is under `tests/browser-live/`.

## Build and callback boundary

`vite.config.js` is a multi-page build with `index.html` and
`auth/redirect.html`. Normal/local builds use `/`; Pages mode uses
`/whisper-transcribe/`. The callback output must remain
`/auth/redirect.html`.

The callback page imports only
`broadcastResponseToMainFrame` from
`@azure/msal-browser/redirect-bridge`. It must not bootstrap `js/main.js`, call
Azure, read storage, expose authentication failures, or receive
`Cross-Origin-Opener-Policy` or frame-blocking headers. Any MSAL upgrade requires
bridge, built-output, browser, size, and artifact-boundary regression testing.

Production authentication is the real `AuthenticationService`. Vite aliases it
only in `browser-test` and `live-contract` modes. The deterministic fake and OIDC
factory are build-time test seams and must never appear in a production bundle.

## Bootstrap and authentication ownership

`js/main.js` performs the targeted remove-only legacy cleanup synchronously
before constructing `AuthenticationService` or `Settings` and before any storage
read. `cleanupLegacyCredentials()` removes exactly the two historical names; it
must never read, copy, migrate, log, emit, or broadly clear values. Keep it on
every startup indefinitely.

Ownership is strict:

- `AuthenticationService` is the sole MSAL owner. It initializes the
  `PublicClientApplication`, handles full-page redirect results, selects the
  active account, runs silent readiness/token acquisition, and owns sign-in,
  interaction recovery, and logout redirects.
- `createAuthenticationConfig()` validates public single-tenant client and
  directory identifiers, derives the base-aware callback URI, requests the
  Cognitive Services scope, and configures MSAL-owned `localStorage` so a new
  same-origin tab can discover the shared account. Do not configure
  `temporaryCacheLocation`; temporary OAuth artifacts remain tab-scoped under
  MSAL's default behavior.
- `createTokenProvider()` exposes only `getToken(scope)` and never retains the
  returned token.
- `AzureAPIClient` acquires one request-local token as late as possible and is
  the only application module that constructs `Authorization: Bearer ...`.
  That local request header may be reused only by its bounded retry loop.
- Model adapters declare immutable scope and Target URI storage metadata, build
  browser `FormData`, and parse responses. They never receive credentials or
  construct authentication headers.

Access tokens and authentication responses must not enter Settings,
application-managed localStorage or sessionStorage, IndexedDB, adapters, event
payloads/history, logs, error details, URLs, screenshots, traces, or artifacts.
MSAL alone owns its opaque shared localStorage cache; application code must not
read, copy, migrate, log, or expose its artifacts. Authentication events contain
safe state only; account presentation is normalized name/username data used by
the User menu and is never retained there. Shared cache availability normally
lets a new tab start ready, but genuine Entra interaction requirements still use
the full-page redirect flow.

HTTP behavior is deliberately distinct: 401 is a token/authentication recovery
category; 403 is an external Azure RBAC category; neither reads the response
body nor retries. Retry handling is limited to 429, 500, 502, 503, 504 and
per-attempt abort timeouts under the existing backoff, Retry-After cap, and
overall deadline. Never make a broader role or key path an error workaround.

## Models, Settings, and User menu

Exactly two adapters are registered, in response-parser precedence order:

1. `maiTranscribe15ModelAdapter` (`mai-transcribe-1.5`)
2. `whisperModelAdapter` (`whisper`)

Both declare `https://cognitiveservices.azure.com/.default`. Browser-local
persistence is limited to non-secret model, manual HTTPS Target URI,
microphone, theme, and transcript data. `Settings` owns the preferences;
`TranscriptStore` owns transcript content. `STORAGE_KEYS` owns literal storage
names, and each adapter's `storageKeys.uri` maps a model to its Target URI.
Never add a credential field or key fallback.

`UserMenu` owns the initials-only launcher, account presentation, and nested
Model, Microphone, Settings, Azure help, and logout surfaces. `Settings` owns
draft/commit behavior inside those surfaces. Closing or switching away from a
Settings detail discards the draft. Keep narrow-width Back/focus behavior and
the external-invoker focus return intact.

## Audio Source and navigation safety

`RecordingStateMachine` owns only microphone lifecycle state. Legal transitions
are the exact `STATE_TRANSITIONS` table in `js/constants.js`; the UI renders the
control cluster from `RECORDING_STATE_CHANGED`. State handlers emit their
documented status/domain events and do not imperatively render controls.

`SelectedAudioController` separately owns one local `File` and the exact
`SELECTED_AUDIO_STATES` lifecycle. The File never appears in snapshots, storage,
events, or logs. Selection validates locally; only explicit Transcribe calls the
shared `AzureAPIClient`. On success it emits `UI_TRANSCRIPTION_READY` and removes
the File, converging on the microphone transcript path.

`AudioHandler.setAudioSourceCoordinator()` composes the two owners so only one
Audio Source is active. `AudioHandler` owns an Unsent Recording Blob after a
failed microphone submission. `AuthInteractionController` is the sole
redirect/logout navigation-safety coordinator: active audio blocks navigation;
Selected Audio must be removed; an Unsent Recording must be downloaded then
explicitly continued, or explicitly discarded through the proportional dialog.
There is no automatic redirect, logout, upload, or discard.

## Event, transcript, and UI conventions

- The singleton `eventBus` and `APP_EVENTS` carry presentation-safe lifecycle
  data. Dependencies are also injected directly at bootstrap; do not claim all
  coupling is event-only.
- `TranscriptStore` is the single-slot localStorage gateway. UI code does not
  touch transcript storage directly. Both Audio Sources converge through
  `UI_TRANSCRIPTION_READY` before autosave.
- Status colours come from `.status--error` and `.status--success` CSS classes
  backed by the tested WCAG-AA tokens. Preserve toast/base status ownership.
- Reduced motion is a hard requirement: every animation reaches the correct end
  state immediately under `prefers-reduced-motion`.
- Decorative motion must never change a button hit target.
- Discard confirmation stays proportional: short recordings discard directly;
  substantial or Unsent Recordings name the stakes once.
- Keep constants, event names, DOM ids, storage names, messages, states, and
  tunables in `js/constants.js` or `js/event-bus.js` rather than adding magic
  strings.

## Workflows, evidence, and external authority

Normal CI runs install, production build, lint, coverage, both Knip gates,
high-severity audit, generated size budgets, and deterministic Chromium.
`.github/workflows/pages.yml` builds in Pages mode and deploys only `dist/`.

`.github/workflows/live-azure-contract.yml` is a manual, protected,
two-stage OIDC evidence workflow. It uses a separate workload identity and is
not the User-facing SPA or the 12-path real-browser matrix. Its external Entra
identity, federation, RBAC, live-service, secret deletion, Pages, browser, and
Azure resource-enforcement steps are human-gated and remain pending until an
operator explicitly authorizes each stage. CI and OIDC must never gain RBAC
write, key list/regenerate, local-auth, or resource-management authority.

Public documentation and evidence may contain only placeholders and sanitized
outcomes such as candidate SHA, workflow URL, browser/version, origin label,
model, pass/fail, HTTP class, retry count, and date. Never paste a real
identifier, Target URI, credential, authentication response, audio, transcript,
HAR, trace, identity screenshot, or private output. See
`docs/keyless-operator-runbook.md` before any external operation.

## Repository documentation

`plan/2.0-design.md` is the active interaction decision log. `spec/` contains
component contracts. `docs/adr/0001-adopt-vite-and-msal-browser.md` records the
accepted build decision. Generated JSDoc HTML under `docs/` remains ignored and
has no reproducible workflow; update the tracked specs directly. Preserve
`CONTEXT.md` verbatim unless the User explicitly changes the glossary.
