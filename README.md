# Whisper Transcribe

Turn speech into text with Azure Speech Services, wrapped in an interaction-led
**Dynamic Island** UI. No build step, no bundler, no runtime dependencies — it
runs straight from raw ES modules in the browser.

Version 2.0 is a ground-up rethink of the *feel* of the app: the controls morph
between states like Apple's Dynamic Island, your transcript autosaves and can be
restored, and every prompt is proportional — you're only asked to confirm when
there's something real to lose.

## Highlights (2.0)

- **Dynamic Island controls** — the control cluster reshapes (size, radius) and
  its contents cross-fade as you move through idle → recording → transcribing.
  Built with FLIP + the native Web Animations API, zero dependencies. The
  buttons keep a **fixed hit target** — the island animates *around* them, never
  scaling the buttons themselves.
- **Autosave + restore** — your transcript is saved to the browser as you go and
  offered back after a reload, so a refresh never costs you work.
- **Grab · Restore** — Grab lifts the transcript to your clipboard and empties
  the box; Restore brings it back if you clobbered the clipboard by accident, so
  the take-it-away action is always recoverable. New transcriptions always
  append, separated by a divider.
- **Proportional confirm** — discarding a throwaway clip (under ~10s) just
  happens; discarding a substantial recording asks once, by name. No rote
  "are you sure?" dialogs.
- **Soft Precision design** — a lavender light theme and deep-navy dark theme,
  Instrument Serif display type over Geist Mono, a subtle noise texture and
  generous radii.
- **Accessible by construction** — WCAG-AA status colours in both themes, full
  `prefers-reduced-motion` support (every animation collapses to an instant,
  correct state), visible focus rings, and decorative motion that can never move
  a click target.

## Also in the box

- **Live waveform visualization** while you speak
- **Multiple models** — Azure Whisper (and Whisper-translate) plus MAI Transcribe
  (1 and the newer 1.5 preview)
- **Pause / Resume / Cancel** mid-recording
- **Noise cancellation** toggle for noisy rooms
- **Input device selection** — pick which microphone to use
- **Notion-style settings sidebar** with pin / hover / close states

Under the experience, reliability rides along where it serves it: transcription
requests have a request **timeout** (via `AbortController`), and WAV encoding
runs **off the main thread** in a Web Worker (with a synchronous fallback), so
encoding a long clip never freezes the UI.

## How it works

1. Tap the island to start recording — it expands to show a timer, Pause and
   Discard.
2. Speak; the waveform reacts in real time.
3. Tap **Done** to stop and transcribe. The island collapses to a working
   indicator, then your text appends to the transcript.

## Setup

### Prerequisites

- A modern browser (Chrome, Firefox, Edge, Safari)
- Node.js 22 or newer (CI runs Node 24)
- An Azure account with **Speech Services** enabled
- Your Azure target URI and API key

### Configuration

1. Open settings (gear icon).
2. Choose a transcription model (Azure Whisper or MAI Transcribe).
3. Enter your credentials:
   - **Target URI** — your full Azure endpoint URL
   - **API Key** — your Azure Speech key
4. Save. Credentials are stored only in your browser's local storage.

## Architecture

- **No build** — raw ES modules, loaded directly; nothing to compile or bundle.
- **No runtime dependencies** — the Dynamic Island morph, visualizer, and worker
  all use native browser APIs.
- **Event bus + finite state machine** — UI, audio handling, and the API client
  are decoupled through a singleton event bus, and recording state is owned by a
  single FSM (`RecordingStateMachine`). The control cluster renders from that one
  state — there's a single source of truth for what's shown, labelled, enabled,
  and spinning.

## Development

### Install

```bash
npm install
```

### Run locally

```bash
npm start
```

Open the printed loopback URL (by default, http://127.0.0.1:4173/) in a
browser. Stop the server with Ctrl+C. Debug and info logging is enabled on
localhost; add `?debug` to the URL when you need to enable it explicitly (for
example, http://127.0.0.1:4173/?debug).

### Test

```bash
npm test               # run the test suite (Vitest)
npm run test:watch     # watch mode
npm run test:coverage  # run with coverage (enforces thresholds)
npm run lint           # ESLint
npm run lint:fix       # ESLint with --fix
npm run deps:check     # knip — unused files / deps / exports
npm run size           # size-limit budget check
```

### Browser tests

```bash
npm run test:browser         # Playwright, headless by default
npm run test:browser:headed  # requires a GUI
```

Stop `npm start` before running browser tests: Playwright launches its own
test-only static server and local API stub on the same test ports.

Coverage thresholds (statements 85 / branches 80 / functions 70 / lines 85) are
enforced from `vitest.config.js`. Husky runs **lint** on pre-commit and
**coverage + production-dependency** checks on pre-push.

## Deployment

It's a static site — host the folder anywhere (e.g. GitHub Pages):

1. Fork or clone this repository.
2. Enable GitHub Pages in repository settings.
3. Serve the branch containing the code.

## Privacy

Audio is processed through *your own* Azure account; no recordings are sent to
or stored by this application. Your transcript and settings live only in your
browser's local storage — clearing site data removes them.

## Roadmap

A future 3.0 arc (not in this release) explores Microsoft account sign-in
(Entra), a Cosmos DB sync backend, and topic mining across past transcripts.

## License

[MIT](LICENSE) © 2026 Ahmed Muhi
