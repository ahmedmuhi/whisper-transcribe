# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A no-build, zero-runtime-dependency browser app (vanilla ES modules) that records speech and transcribes it via the user's own Azure Speech Services account, wrapped in a "Dynamic Island" morphing UI. There is no bundler and no dev server script — serve the folder with any static file server (ES modules won't load from `file://`).

## Commands

```bash
npm test                                    # full suite (Vitest)
npx vitest run tests/<name>.vitest.js       # single test file
npm run test:watch                          # watch mode
npm run test:coverage                       # enforces thresholds: stmts 85 / branches 80 / funcs 70 / lines 85
npm run lint                                # ESLint (js/**/*.js)
npm run lint:fix
npm run deps:check                          # knip — unused files/deps/exports
npm run deps:check:prod                     # knip production check (guards the zero-runtime-deps rule)
npm run size                                # size-limit budget (js/*.js ≤ 100 kB)
```

Husky runs **lint** on pre-commit and **coverage + deps:check:prod** on pre-push, so a failing threshold or a new runtime dependency blocks the push.

## Architecture

**Event bus + state machine are the backbone.** Modules never call each other directly — they communicate through the singleton `eventBus` using names from `APP_EVENTS` (both in `js/event-bus.js`). `js/main.js` only constructs the five core objects (`Settings`, `TranscriptStore`, `UI`, `AzureAPIClient`, `AudioHandler`) and wires nothing else; all coupling is via events.

**Recording state has one owner.** `RecordingStateMachine` (`js/recording-state-machine.js`) holds the current state; legal transitions are declared in `STATE_TRANSITIONS` in `js/constants.js` (idle → initializing → recording → paused/stopping/confirmingDiscard → processing → …). The control cluster (the "island") renders *entirely* from `RECORDING_STATE_CHANGED` events — what's shown, labelled, enabled, and spinning has a single source of truth. Don't set button/spinner state imperatively from elsewhere.

**The transcription flow** (the path that touches most files): UI button click → bus event (`MIC_BUTTON_CLICKED` etc.) → `AudioHandler` (MediaRecorder + `PermissionManager`) drives FSM transitions → on stop, audio is WAV-encoded off the main thread in `js/audio-converter.worker.js` (synchronous fallback in `audio-converter.js`) → `AzureAPIClient.transcribe()` with an `AbortController` timeout (`TRANSCRIPTION_TIMEOUT_MS`) and exponential-backoff retries on 429/5xx → the model adapter builds the request and parses the response → `UI_TRANSCRIPTION_READY` → UI appends to the transcript (with segment divider) → `TranscriptStore` autosaves.

**Model adapters** (`js/model-adapters/`): each Azure model (whisper, whisper-translate, MAI-Transcribe 1.5) is an adapter object registered in `index.js`. Registry insertion order matters — `parseResponse` tries adapters in that precedence. Add new models as adapters; don't branch on model type elsewhere.

**TranscriptStore** (`js/transcript-store.js`) is a deliberately tiny single-slot gateway (save/load/clear/has) over localStorage. Its small interface is the intended seam for a future sync backend — don't grow it casually and don't let UI code touch storage directly.

**Constants discipline:** event names, DOM ids (`ID`), storage keys, user-facing messages (`MESSAGES`), states, and tunables all live in `js/constants.js` / `js/event-bus.js`. No magic strings in modules.

## Conventions the tests enforce

- **Status colours come from CSS, not JS.** Error/success status text uses `.status--error` / `.status--success` classes backed by WCAG-AA `--status-*` CSS tokens — never inline hex. `js/status-helper.js` also implements toast-vs-base-message ownership (a base status set during a toast is deferred, not lost). `color-constants-sync.vitest.js` keeps `constants.js` colours and CSS tokens in sync.
- **CSS/layout rules are tested.** Several tests read the CSS files directly via `tests/helpers/css-tokens.js` (e.g. `island-layout-css.vitest.js`), so visual conventions like fixed button hit targets are test-enforced — expect CSS changes to break tests legitimately.
- **Reduced motion is a hard requirement:** every animation must collapse to an instant, correct end state under `prefers-reduced-motion`.
- **Proportional confirm:** discards under `DISCARD_CONFIRM_MIN_MS` (10 s) happen silently; longer recordings get one named-stakes dialog. Don't add rote confirmation prompts.

## Tests

Vitest with `happy-dom`; test files are `tests/*.vitest.js` (the `.vitest.js` suffix is what the config globs). `tests/vitest-setup.js` silences the logger and exposes `resetEventBus()`/DOM-spy helpers from `tests/helpers/`. Coverage covers all of `js/` except `main.js`.

## Repo notes

- `plan/` and `spec/` hold design docs (`plan/2.0-design.md` is the 2.0 interaction-led design; `spec/` has specs for the API client and state machine). The project has no generated-JSDoc workflow; update these tracked documents directly when their corresponding design changes.
