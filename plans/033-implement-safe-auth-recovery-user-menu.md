# Plan 033: Implement authentication-safe recording recovery and the unified User menu

> **Required executor profile**: use `gpt-5.6-sol` with **extra-high (`xhigh`)** reasoning
> effort. If that exact model/effort combination is unavailable, STOP and ask
> the User whether to substitute; do not silently use another executor.
>
> **Executor instructions**: Follow this plan step by step and run every
> verification gate. Preserve valuable audio over authentication convenience:
> no redirect or logout may occur while a recording is active or an Unsent
> Recording would be lost. Stop on any listed STOP condition rather than
> weakening that rule. Update `plans/README.md` when done unless the reviewer
> maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat e1f7083..HEAD -- index.html css/styles.css js/main.js js/ui.js js/settings.js js/audio-handler.js js/authentication-service.js js/constants.js js/event-bus.js tests/ playwright.config.js vite.config.js`
> Plans 031 and 032 must be complete. Reconcile their final symbols with this
> plan before changing anything; a material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/032-replace-api-keys-with-entra-bearer-auth.md`
- **Category**: ui
- **Planned at**: commit `e1f7083`, 2026-07-18
- **Issue**: https://github.com/ahmedmuhi/whisper-transcribe/issues/116

## Why this matters

Keyless authentication is not usable if the User learns they must sign in only
after recording valuable audio, or if an interactive redirect destroys a
failed recording. The accepted experience establishes authentication before
capture, presents explicit recovery when Microsoft later requires interaction,
and replaces the duplicated sidebar/settings surfaces with one compact account
surface. This plan ports the accepted prototype into production without its
fixtures or comparison controls.

Binding sources:

- Interaction resolution and prototype verdict:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/108#issuecomment-5009240133>
- Primary-source prototype commit: `2ec3be9`
- Redirect/no-navigation decision:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/109#issuecomment-5008352236>
- Canonical specification:
  <https://github.com/ahmedmuhi/whisper-transcribe/issues/112#issuecomment-5009850109>

## Current state

- `index.html:31-131` contains a full left `#side-panel`, backdrop, model
  selector, theme button, and settings button. `index.html:234+` contains a
  second settings dialog. The accepted destination has neither duplicate.
- `js/settings.js` currently owns sidebar pin/hover/backdrop behavior, the
  settings dialog, model and microphone controls, theme, Target URI forms, and
  persistence. Preserve its draft/save semantics from completed Plans 022/025
  while moving presentation into one User menu.
- `js/ui.js:537-585` renders the Dynamic Island solely from recording state and
  `this.ready`. `checkRecordingPrerequisites()` currently controls readiness.
  After Plan 032, authentication readiness must be one explicit input, not an
  imperative button toggle.
- `js/audio-handler.js` owns `pendingRetryBlob`, which is the existing Unsent
  Recording. It retains failed audio for retry but has no download/auth-recovery
  interface.
- The current proportional discard contract remains binding: recordings below
  `DISCARD_CONFIRM_MIN_MS` may discard directly; longer active recordings use
  the existing named-stakes dialog. Authentication recovery does not remove
  this protection.
- The throwaway prototype can be inspected without merging its branch:

  ```bash
  git show 2ec3be9:AUTH-EXPERIENCE-PROTOTYPE.md
  git show 2ec3be9:js/prototypes/unified-menu.prototype.js
  git show 2ec3be9:css/unified-menu.prototype.css
  ```

  Treat it as a visual/interaction reference only. Do not copy its hard-coded
  identity fixture, prototype query parameters, selector bar, inert actions, or
  `prototype` CSS/JS filenames into production.

### Accepted signed-out surface

Use the contextual-island Variant A contract:

```text
Microsoft sign in required
Sign in before recording.
Use your Microsoft account to access Azure resources already assigned to you.
Whisper Transcribe cannot grant Azure access.
[Continue with Microsoft]
```

Copy may be tightened for narrow screens without changing meaning. While the
app establishes state, show a short `Checking sign-in…` status and keep every
Audio Source action unavailable. Do not flash an enabled microphone first.

### Accepted User menu

- Closed: one bottom-left circular launcher containing initials only.
- Open root: active MSAL display name and username/email exactly once at top.
- No `Signed in with Microsoft`, `Azure ready`, readiness dot, repeated name,
  provider badge, or status row.
- Root rows: Model, Microphone, Settings, Help & Azure setup, then `Log out` as
  the final action.
- Model detail: exactly Azure Whisper and MAI-Transcribe 1.5 plus
  `Help me choose a model`.
- Microphone detail: input-device chooser and Noise Cancellation.
- Settings detail: System/Light/Dark theme, both Target URIs, `Save changes`, no
  credentials.
- Desktop: detail panel opens beside the root. Narrow screen: detail replaces
  root and provides Back.
- Outside click and Escape dismiss the whole surface. An inside click must not
  close it before the chosen view opens.
- Identity comes from AuthenticationService's active-account presentation. The
  prototype's name/email/initials are fixtures and must never become constants,
  fallback defaults, test-independent snapshots, or persisted settings.

### Recovery contract

- Normal interaction uses an explicit User-triggered full-page redirect only.
- Never redirect or log out while recording/paused/stopping, while
  `pendingRetryBlob` exists, or while another unsaved Audio Source exists (Plan
  034 extends the same safety interface to Selected Audio).
- If interaction is required and there is no valuable audio, show
  `Continue with Microsoft`; do not redirect automatically.
- If an Unsent Recording exists, show exactly two initial choices:
  1. `Download recording`; after the browser download is initiated, replace it
     with an explicit `Continue with Microsoft` action. Never redirect
     automatically because the page cannot prove the download completed.
  2. `Discard recording and sign in`; name the loss, require confirmation,
     clear only after confirmation, then redirect.
- Do not show `Retry silently` after MSAL has returned interaction-required.
- 401 uses this authentication recovery. 403 says Azure access is missing and
  links to external setup; it never signs out or changes RBAC.
- Invalid Target URI links directly to Settings. An unavailable/non-keyless
  model is not exposed and never falls back to a key.

### Domain language

- **User**: the signed-in person; avoid customer/tenant administrator language.
- **Unsent Recording**: valuable captured audio not yet accepted by Azure.
- **Target URI**: non-secret endpoint configuration; never call it a credential.
- `Log out` is the visible action label (not `Sign out`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Focused UI/auth tests | `npx vitest run tests/auth-recovery.vitest.js tests/user-menu.vitest.js tests/settings-workflow.vitest.js tests/audio-handler-integration.vitest.js tests/island-controls.vitest.js` | all pass |
| Full coverage | `npm run test:coverage` | all pass; thresholds unchanged |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Dependencies/audit/size | `npm run deps:check && npm run deps:check:prod && npm audit --audit-level=high && npm run size` | all exit 0 |
| Browser interaction matrix | `npm run test:browser` | deterministic ready path plus menu/recovery smoke pass |

## Suggested executor toolkit

- Use `git show 2ec3be9:...` for the accepted visual source, but implement
  production semantics independently.
- Use existing native-dialog/focus patterns in `js/ui.js` and
  `tests/settings-workflow.vitest.js`; preserve the completed settings draft
  and focus work rather than replacing it with untested imperative state.
- Use the repository's event-driven recording/FSM convention. Authentication
  state may select a presentation, but it must not invent recording states.
- Use the browser-testing skill if available to check desktop and 390 px layouts,
  keyboard focus, outside click, and Escape in a real Chromium build.

## Scope

**In scope (only these files):**

- `index.html`
- `css/styles.css`
- `js/main.js`
- `js/ui.js`
- `js/settings.js`
- `js/audio-handler.js`
- `js/authentication-service.js` (presentation-safe account access and redirect
  methods only; token ownership from Plan 032 is immutable)
- `js/auth-interaction-controller.js` (create; coordinates auth navigation with
  audio safety without owning tokens)
- `js/user-menu.js` (create; menu/focus/presentation owner)
- `js/constants.js`
- `js/event-bus.js`
- `tests/auth-recovery.vitest.js` (create)
- `tests/user-menu.vitest.js` (create)
- `tests/audio-handler-integration.vitest.js`
- `tests/settings-sidebar.vitest.js` (replace/remove when its product surface is removed)
- `tests/settings-workflow.vitest.js`
- `tests/settings-unit.vitest.js`
- `tests/settings-persistence.vitest.js`
- `tests/island-controls.vitest.js`
- `tests/island-layout-css.vitest.js`
- `tests/ui-event-bus-proper.vitest.js`
- `tests/helpers/mock-settings-dom.js`
- `tests/browser/transcription-smoke.spec.js`
- `tests/browser/auth-menu-recovery.spec.js` (create if a separate real-browser
  spec keeps the primary smoke legible)
- `tests/browser/fakes/authentication-factory.js` (test-build scenarios only)

**Out of scope:**

- Adding local file selection, drop handling, Selected Audio state, or upload
  controls; Plan 034 owns those additions.
- Changing MSAL cache, authority, scope, token provider, bearer ownership,
  callback, Vite, Pages, retry, or legacy key cleanup from Plans 031–032.
- Live sign-in, Azure transcription, RBAC, app registration, GitHub variables,
  Pages deployment, or billable requests.
- Multi-tenant identity, avatar/profile editing, account switching, language
  selection, plan/upgrade/gift actions from the inspiration screenshot, or a
  permanent expanded sidebar.
- Persisting identity or menu-open state.

## Git workflow

- Branch: `advisor/033-safe-auth-user-menu`
- Rebase onto completed Plan 032.
- Suggested commits:
  1. `feat(auth): add navigation-safe recovery`
  2. `feat(ui): replace sidebar with unified user menu`
  3. `test(ui): cover account menu and recovery states`
- Do not push, merge, or make live Microsoft/Azure/GitHub calls without operator instruction.

## Steps

### Step 1: Define a token-free authentication presentation model

Add safe UI states/constants for at least:

```text
checking | signedOut | ready | interactionRequired |
authenticationFailed | authorizationDenied | configurationRequired
```

AuthenticationService may expose a minimal presentation object only when ready:

```js
{ displayName, username }
```

Normalize strings, do not expose claims, IDs, raw account objects, tokens, or
auth results. Compute initials in User-menu code from display name (or username
when name is absent): Unicode-aware, trim whitespace, at most two visible
initials, and a neutral accessible fallback such as `?` only when both are
absent. Do not persist or emit the identity through event history/logs.

Events announce state changes without identity payload; the UI queries the safe
presentation accessor when rendering.

**Verify**:

```bash
npx vitest run tests/user-menu.vitest.js -t "identity|initials|payload"
```

Expected: dynamic identity/fallback cases pass; event/log payloads contain no account data.

### Step 2: Add an authentication interaction controller with an audio-safety gate

Create `AuthInteractionController` (or the exact equivalent) that receives:

- AuthenticationService redirect/logout actions;
- a narrow AudioHandler safety interface (`getAudioSafetyState`, download,
  discard), never its token provider;
- event/UI actions.

It decides whether navigation is safe. It must not own MSAL, acquire tokens,
or mutate recording FSM state directly.

Safety states must distinguish:

- active recording lifecycle;
- Unsent Recording available for retry;
- no valuable audio.

When blocked, return/render a safe recovery state. Never invoke redirect/logout
first and inspect audio second.

**Verify**:

```bash
npx vitest run tests/auth-recovery.vitest.js -t "navigation|logout|active|unsent"
```

Expected: every active/unsent case makes zero redirect/logout calls.

### Step 3: Add explicit Unsent Recording download/discard recovery

Extend AudioHandler with narrow methods that operate on its existing
`pendingRetryBlob`:

- inspect whether an Unsent Recording exists without returning the Blob;
- initiate a local download using a Blob URL and a container-matching safe
  filename, then revoke the URL after the click lifecycle;
- discard only after the existing/proportional confirmation contract says yes;
- retain the recording after download until the User explicitly continues or
  discards; a download is not proof of persistence;
- preserve Retry behavior when the User closes/dismisses recovery.

The first recovery view has two actions. After download, change only the first
action to `Continue with Microsoft`; do not auto-navigate. The second action is
`Discard recording and sign in` and confirms the loss before redirect.

**Verify**:

```bash
npx vitest run tests/auth-recovery.vitest.js tests/audio-handler-integration.vitest.js
```

Expected: Blob URL lifecycle, no automatic redirect, confirmed discard, cancel,
and retained retry paths all pass.

### Step 4: Render startup, signed-out, ready, 401, 403, and configuration states

Make authentication presentation an explicit input to the idle control
renderer. Before state is known, render `Checking sign-in…` and disable capture.
Signed out renders the accepted contextual copy and Continue action. Ready
renders the existing Start recording experience. Interaction-required chooses
simple Continue or the Unsent Recording recovery from Step 3.

401 enters interaction recovery. 403 renders external Azure access guidance
and a `View Azure setup` action while retaining audio. Invalid/missing Target
URI renders `Open settings`. Do not conflate signed-out, denied RBAC, bad URI,
or transient service errors.

No state may show both “ready” and signed-out/auth-required affordances.

**Verify**:

```bash
npx vitest run tests/auth-recovery.vitest.js tests/island-controls.vitest.js tests/ui-event-bus-proper.vitest.js
```

Expected: one mutually exclusive presentation per state; signed-out and
interaction-required make zero microphone/upload calls.

### Step 5: Replace sidebar and modal with the nested Variant A User menu

Remove the side panel, pin/hover/backdrop behavior, floating full-name row,
standalone settings dialog, duplicated controls, and obsolete
`sidebar_pinned` persistence. Add one bottom-left initials launcher and the
accepted root/detail panels.

Preserve behavior—not old markup ownership:

- committed vs draft model selection from Plan 022;
- Target URI validation and Save changes;
- input-device enumeration/selection;
- Noise Cancellation setting;
- System/Light/Dark theme;
- existing event names where still semantically correct;
- `Help & Azure setup` action to sanitized documentation/help, not Azure admin APIs.

Menu behavior:

- click launcher toggles root;
- click a row opens its detail;
- desktop detail is adjacent; 390 px detail replaces root;
- Back returns to root on narrow view;
- outside pointer/click and Escape dismiss;
- inside interaction does not dismiss prematurely;
- focus moves into the opened surface, is trapped/restored proportionately, and
  returns to launcher on dismiss;
- arrow/Tab/Enter/Space semantics use native buttons/radios/selects where possible;
- `aria-expanded`, labels, selected states, and live status are truthful;
- reduced motion produces immediate correct end state.

Do not carry over the prototype scenario selector, badge, fixture identity,
inert-action messages, or all three variants.

**Verify**:

```bash
npx vitest run tests/user-menu.vitest.js tests/settings-workflow.vitest.js tests/settings-persistence.vitest.js tests/island-layout-css.vitest.js
```

Expected: menu, nested panels, Settings semantics, dismissal, focus, narrow
layout, and reduced-motion tests all pass.

### Step 6: Make logout obey the same safety policy

`Log out` is the final root action. If no valuable audio exists, invoke the
AuthenticationService redirect logout. If recording or Unsent Recording exists,
block logout and use the same named recovery boundary; never clear MSAL/session
state while leaving the audio UI in a misleading ready state.

After a completed safe logout return, the app starts in checking then signed-out
state. It must not clear Target URIs, preferences, or transcript.

**Verify**:

```bash
npx vitest run tests/auth-recovery.vitest.js tests/user-menu.vitest.js -t "log out|logout|storage"
```

Expected: safe logout calls once; blocked logout calls zero times; non-secret
settings/transcript remain.

### Step 7: Validate the accepted experience in a built browser

Extend only the compile-time browser-test authentication double from Plan 032
to expose deterministic scenarios to a test build. Do not add a production
query parameter or global hook.

Exercise at desktop and 390 px:

- checking → signed out → ready;
- initials-only closed launcher;
- dynamic name/email once at root top;
- Model, Microphone, Settings nested panels;
- outside click and Escape dismissal;
- keyboard activation/focus return;
- interaction required with no audio;
- interaction required with Unsent Recording (download then explicit Continue,
  and confirmed discard/sign in);
- 403 and invalid Target URI diagnostics;
- no horizontal overflow, console errors, unexpected fetch, microphone call,
  or auth redirect in inert scenario tests.

Keep the existing real recording smoke separately passing in ready state.

**Verify**:

```bash
npm run build
npm run test:browser
```

Expected: all browser tests pass; production bundle scan contains no scenario fixture identity.

### Step 8: Run the integrated quality and privacy gates

```bash
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
git diff --check
```

Then scan:

```bash
! rg -n "Ahmed Muhi|ae\.muhi|Signed in with Microsoft|Azure ready|readiness dot|sidebar_pinned" index.html css js tests/browser
! rg -n "loginPopup|acquireTokenPopup" js
```

Expected: all gates pass. Identity strings may exist only inside explicitly
named unit-test fixtures, never production/browser-test output.

## Test plan

- `tests/auth-recovery.vitest.js`: safe/no-audio redirect; active recording;
  Unsent Recording; download then explicit Continue; confirmed/cancelled discard;
  401; 403; invalid URI; safe/blocked logout.
- `tests/user-menu.vitest.js`: initials, account fallback, root/detail navigation,
  dynamic identity, model/mic/settings behavior, final Log out row, outside click,
  Escape, focus restoration, narrow layout contract, reduced motion.
- Update existing Settings tests rather than dropping their unique persistence,
  validation, draft/commit, native-control, and focus assertions.
- Update island tests so authentication and recording states compose without
  imperative DOM drift.
- Built Playwright scenarios for desktop + 390 px, with no production test hook.
- Keep the original end-to-end capture/transcription smoke passing.
- Do not lower coverage or delete a test merely because its DOM selector changed;
  preserve the behavior in the new owner first.

## Done criteria

- [ ] Startup never enables recording before authentication state/token readiness is established.
- [ ] Signed-out UI uses the accepted contextual Continue-with-Microsoft experience.
- [ ] No automatic redirect/logout occurs while active or Unsent Recording exists.
- [ ] Download does not auto-redirect; discard-and-sign-in names and confirms loss.
- [ ] `Retry silently` is absent after interaction-required.
- [ ] 401, 403, and invalid Target URI render distinct recovery actions.
- [ ] Closed User menu shows initials only; open root shows dynamic name/username once.
- [ ] No hard-coded identity/provider/readiness fixture exists in production.
- [ ] Model, Microphone, Settings, Help, and final `Log out` actions match the accepted menu.
- [ ] Sidebar, pin/hover/backdrop, duplicate modal, and obsolete sidebar persistence are removed.
- [ ] Outside click/Escape/focus/narrow/reduced-motion/accessibility behavior is tested.
- [ ] Target URIs, model, theme, microphone/noise preference, and transcript persist correctly.
- [ ] All canonical build, test, lint, dependency, audit, size, and browser gates pass.
- [ ] No live auth/Azure/GitHub call or configuration change occurred.
- [ ] Only in-scope files changed and `plans/README.md` was updated as instructed.

## STOP conditions

Stop and report instead of improvising if:

- `gpt-5.6-sol` with extra-high (`xhigh`) effort is unavailable.
- Plans 031/032 are incomplete or expose a materially different auth/readiness interface.
- Safe recovery requires AudioHandler to receive a token or User-menu code to import MSAL.
- Browser download completion would have to be guessed to trigger an automatic redirect.
- Logout/redirect cannot be blocked before an active/unsent audio check.
- Porting the accepted menu would lose Settings draft/validation, microphone,
  theme, transcript, FSM, proportional-confirm, focus, or reduced-motion behavior.
- A hard-coded identity or a production test/scenario hook is required.
- The work expands into Selected Audio; stop and leave it for Plan 034.
- Any real identifier, Target URI, token, key, authentication response, or audio
  would enter a file/log/issue/artifact.
- A live Microsoft/Azure/GitHub change or call is required without explicit approval.

## Maintenance notes

- Authentication state and recording state are separate axes. Do not merge them
  into one oversized FSM or let UI booleans contradict the recording owner.
- `AuthInteractionController` owns navigation safety, not token acquisition.
- Plan 034 must extend the same Audio Source safety interface for Selected Audio
  rather than introducing a second logout/redirect rule.
- Review the final UI against commit `2ec3be9`, but judge production semantics
  and accessibility—not pixel-copying prototype-only fixtures.
