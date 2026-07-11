# Plan 014: Add a real-browser Playwright smoke test — fake microphone → real worker → local HTTPS Azure stub → transcript + reload persistence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f525b87..HEAD -- js/ index.html package.json vitest.config.js knip.json .github/workflows/ci.yml .gitignore`
> If any in-scope or excerpted file changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (new toolchain + CI job; no production `js/` code changes)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `f525b87`, 2026-07-12

## Why this matters

The Vitest/Happy DOM suite (393 tests) verifies component logic thoroughly,
but no automated test executes the real application: `js/main.js` is excluded
from coverage and never assembled; the real encode worker
`js/audio-converter.worker.js` has 0% executed coverage (tests use a
hand-written FakeWorker that re-implements the protocol); MediaRecorder,
getUserMedia, `OfflineAudioContext.decodeAudioData`, native `FormData`
multipart serialization, and browser CORS are all mocked. Any of these can be
broken — a wrong `<script src>`, a worker URL/MIME failure, a codec the
browser can't decode, a missing DOM id — while every existing test passes.

This plan adds **one continuous Playwright Chromium smoke test** that removes
the human from the loop: Chromium's fake media device plays a deterministic
WAV fixture as the microphone, the real page + `js/main.js` + native
`MediaRecorder` + the real module worker + the real MAI adapter and response
parser all execute, and only the Azure HTTP boundary is replaced by a real
local HTTPS stub server. It then
asserts the transcript in the real DOM and that it survives a page reload.
It complements — does not replace — the Vitest suite, and deliberately does
not touch live Azure (that is the separate opt-in plan 015).

## Current state

Verified at commit `f525b87`. **All excerpts below were re-read from the live
code — several claims from the external assessment this plan is based on were
corrected during verification; the corrections are already baked in.**

### Application flow (the chain the smoke test must traverse)

- `index.html:283` — the only entry point:
  `<script type="module" src="js/main.js"></script>`
- `index.html:22-25` — the page loads Google Fonts from
  `https://fonts.googleapis.com` / `fonts.gstatic.com`. **The test must stub
  these routes** or CI runs depend on external network.
- `js/main.js:11-24` — on `DOMContentLoaded` constructs `Settings`,
  `TranscriptStore`, `UI`, `AzureAPIClient`, `AudioHandler`, then
  `ui.init(settings, transcriptStore)`.
- `js/ui.js:79-90` — `init()` calls `restoreTranscriptIfEmpty()` (line 88);
  prerequisite check runs after listeners are wired (comment at line 90,
  re-run on `SETTINGS_LOADED` at line 222).
- `js/ui.js:531` — idle state: primary button label `MESSAGES.CONTROL_START`
  (`'Start recording'`, `js/constants.js:302`), `disabled: !this.ready`.
  `this.ready` becomes true only when browser support + saved model config
  pass (`js/ui.js:676-700`). So **"primary button enabled" is the startup
  proof**: it means `main.js` ran, settings loaded, and prerequisites passed.
- `js/ui.js:546` — recording state: primary label `MESSAGES.CONTROL_DONE`
  (`'Done'`, `js/constants.js:303`), enabled. The INITIALIZING state
  (`js/ui.js:559`) shows `Done` **disabled** — wait for enabled.
- `js/audio-handler.js:182` — `new MediaRecorder(stream)` (no explicit
  mimeType → Chromium default `audio/webm;codecs=opus`);
  `js/audio-handler.js:210` — `this.mediaRecorder.start(250)` (250 ms
  timeslice); `js/audio-handler.js:373` — chunks assembled as
  `new Blob(this.audioChunks, { type: 'audio/webm' })`.
- `js/permission-manager.js:123-125` — the `'quiet'` environment profile
  requests `autoGainControl: false, noiseSuppression: false,
  echoCancellation: false` (`isNoisy` is false). This is ideal for a fake
  fixture: Chromium's own guidance is to disable audio processing so fixture
  audio is not distorted.

### DOM ids and storage keys (from `js/constants.js`)

- ids (`js/constants.js:158-198`): `primary-action`, `secondary-action` /
  `discard-action` (cluster), `transcript` (the textarea,
  `index.html:156`), `status`, `timer`, `model-select`.
- Storage keys (`js/constants.js:42-52`): `transcription_model`,
  `mai_transcribe_uri`, `mai_transcribe_api_key`, `recording_environment`,
  `transcript_record`.
- `js/constants.js:99-114` — `MODEL_TYPES.MAI_TRANSCRIBE_1_5 =
  'mai-transcribe-1.5'` and it is already `DEFAULT_MODEL_TYPE`.

### Audio conversion + worker (the 0%-covered path)

- `js/audio-converter.js:30-38` — `convertToWav()`: blob →
  `OfflineAudioContext.decodeAudioData` → resample to 16 kHz →
  `encodeWavOffThread`.
- `js/audio-converter.js:136-139` — worker constructed lazily as
  `new Worker(new URL('./audio-converter.worker.js', import.meta.url),
  { type: 'module' })`. The worker is a **shared singleton created on first
  conversion** — i.e. it appears only after the user clicks Done.
- `js/audio-converter.js:63-71` — if the worker post fails,
  `disableEncodeWorker(worker)` **terminates the worker** and the synchronous
  fallback encodes on the main thread. Therefore: *"a worker with the right
  URL appeared, never emitted `close`, and is still evaluable after the
  request fired"* is sound evidence the real worker did the encode (worker
  and fallback output are byte-identical by design, so output alone cannot
  distinguish them).
- `js/audio-converter.worker.js:17` — the worker registers via
  `self.addEventListener('message', …)`. **Correction to the external
  assessment**: `typeof self.onmessage` is NOT `'function'` here — do not use
  that probe. Use worker URL + liveness (`worker.evaluate()`) instead.

### MAI request contract (`js/model-adapters/mai-transcribe.js`)

- Headers: `{ 'Ocp-Apim-Subscription-Key': config.apiKey }`
  (`API_PARAMS.MAI_API_KEY_HEADER`, `js/constants.js:76`).
- Multipart fields: `audio` (the WAV blob, filename `recording.wav` from
  `DEFAULT_WAV_FILENAME`, `js/constants.js:237`) and `definition` —
  `JSON.stringify({ enhancedMode: { enabled: true, model:
  'mai-transcribe-1.5', task: 'transcribe' } })`.
- `js/api-client.js:444` — the fetch gate rejects any endpoint whose
  `protocol !== 'https:'` → **the preseeded fake endpoint must be `https://`**.
- `js/api-client.js:143-144` — response body read as `response.json()` only
  when the response `Content-Type` indicates JSON → **the stub response must
  send `Content-Type: application/json`**.
- `js/model-adapters/response-parsers.js:24-26` — parser joins
  `data.combinedPhrases[].text` — the stub body drives the real parser.
- Retry machinery (`js/api-client.js:12-14`, `js/constants.js:352,364`):
  retries on 429/500/502/503/504, per-attempt timeout 120 s, total deadline
  180 s. The stub returns 200 so exactly **one** POST is expected.
- CORS reality: the POST is cross-origin (page on `http://127.0.0.1:4173`,
  endpoint `https://127.0.0.1:4174`) and carries the custom
  `Ocp-Apim-Subscription-Key` header → Chromium sends a **preflight
  `OPTIONS`** first. The local HTTPS stub must observe and answer both OPTIONS
  and POST with `Access-Control-Allow-*` headers.

  **Execution finding (2026-07-12):** `page.route().fulfill()` bypasses this
  preflight in the tested Chromium/Playwright versions. Two executor runs and
  an independent reviewer run all reached the real worker and POST but observed
  zero OPTIONS requests. Therefore the Azure boundary MUST be a listening
  HTTPS server; do not restore route fulfillment or weaken the preflight
  assertion.

  A second execution finding followed after native CORS was restored:
  Playwright's `Request.postDataBuffer()` returned `null` for the native
  browser-generated multipart POST, including after the response completed.
  Therefore the listening HTTPS stub must capture the POST headers/body
  server-side and expose them through the observation endpoint. This is the
  only valid source for multipart byte assertions; do not re-enable routing to
  recover Playwright post data.

### Transcript display + persistence

- `js/ui.js:210` — `UI_TRANSCRIPTION_READY` → `displayTranscription(data.text)`;
  `js/ui.js:743-760` — writes the `#transcript` textarea then
  `persistTranscript()`.
- `js/transcript-store.js:49` — saves
  `JSON.stringify({ text, savedAt: Date.now() })` under `transcript_record`.
- `js/ui.js:806-811` — `restoreTranscriptIfEmpty()` re-fills the textarea
  from the store during `init()` → this is what the reload assertion proves.

### Tooling / gates the new files must not break

- `package.json` — no Playwright today; scripts: `test`, `test:coverage`,
  `lint` (globs `js/**/*.js` only — browser test files are outside the lint
  glob), `deps:check`, `deps:check:prod`, `size` (budgets `js/*.js` only).
  `"type": "module"`, engines node >= 20.
- `vitest.config.js` — `include: ['tests/**/*.vitest.js']` → new files named
  `*.spec.js` / `*.mjs` under `tests/browser/` are invisible to Vitest.
  Coverage covers `js/**` minus `main.js` — Playwright runs do NOT feed this
  metric (do not attempt to merge them).
- `knip.json` — `project` is `js/**/*.js`; root `ignore` includes
  `*.config.js`. Knip has a Playwright plugin that auto-activates when
  `@playwright/test` is installed; Step 11 verifies and adds explicit plugin
  config only if needed.
- `.husky/pre-commit` = `npm run lint`; `.husky/pre-push` =
  `npm run test:coverage && npm run deps:check:prod`. Neither runs the
  browser test — CI does (Step 12).
- `.github/workflows/ci.yml` — single `checks` job (lint, coverage,
  `deps:check:prod`, size) on node 24.
- `.gitignore` — already ignores `*.png`, `.claude/`, `coverage/`; does not
  yet ignore Playwright output dirs.
- Serving: this is a no-build static app; there is **no dev-server script**
  (`CLAUDE.md`: serve the folder with any static server; ES modules won't
  load from `file://`). `http://127.0.0.1` is a potentially-trustworthy
  origin, so `getUserMedia`/secure-context APIs work over plain HTTP.
- `js/logger.js:45-50` — hostname `127.0.0.1` puts the logger in
  `development` mode → expect verbose `console.log/info/debug` noise. The
  test must fail only on `pageerror` and `console.error`, not on info logs.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install deps | `npm install --save-dev @playwright/test` | exit 0, lockfile updated |
| Install browser | `npx playwright install chromium` | exit 0 (browser binaries only — see STOP #6 before adding `--with-deps` locally) |
| Run smoke | `npm run test:browser` (added in Step 10) | `1 passed` |
| List tests | `npx playwright test --list` | shows the 1 smoke spec |
| Unit suite | `npm run test:coverage` | all pass, thresholds met (unchanged) |
| Lint | `npm run lint` | exit 0 (unchanged — browser files outside glob) |
| Knip full | `npm run deps:check` | exit 0 (Step 11 handles fallout) |
| Knip prod | `npm run deps:check:prod` | exit 0 (`@playwright/test` is dev-only) |
| Size budget | `npm run size` | exit 0 (budgets `js/*.js` only) |

## Scope

**In scope** (the only files you should create/modify):

- `playwright.config.js` (create)
- `tests/browser/static-server.mjs` (create)
- `tests/browser/global-setup.mjs` (create — fixture generator)
- `tests/browser/transcription-smoke.spec.js` (create)
- `package.json` + `package-lock.json` (add dev dep + scripts)
- `.gitignore` (add Playwright output dirs)
- `.github/workflows/ci.yml` (add a separate `browser-smoke` job)
- `knip.json` (ONLY if Step 11 shows knip fallout; smallest possible change)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- Anything under `js/` — this plan adds zero production code. No test hooks,
  no exported flags, no instrumentation. If the smoke test seems to need a
  production change, that is a STOP condition.
- `index.html`, `css/` — same reason.
- `vitest.config.js`, `tests/*.vitest.js`, `tests/helpers/`,
  `tests/vitest-setup.js` — the unit suite is untouched. Do NOT try to merge
  Playwright coverage into the Vitest coverage metric.
- `.husky/` — hooks stay fast; the browser test runs in CI only.
- The FakeWorker in `tests/audio-converter.vitest.js` — it stays; it tests
  the main-thread protocol deterministically. This plan complements it.
- Live Azure anything — that is plan 015.

## Git workflow

- Branch: `test/014-browser-smoke` from `main`.
- Conventional commits, one per logical unit (repo examples:
  `docs(plans): record dead UI cleanup`, `perf/012-wav-memory-peak`).
  Suggested: `test(browser): add playwright scaffolding`,
  `test(browser): add transcription smoke spec`, `ci: add browser-smoke job`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Do **not** run `npx playwright install-deps` / `--with-deps` locally (see
STOP #6 — corporate-managed machine; system package changes need operator
approval). CI installs system deps in Step 12.

**Verify**: `npx playwright --version` → prints a version;
`git diff package.json` → shows only `@playwright/test` under
`devDependencies`.

### Step 2: Create the fixture generator (`tests/browser/global-setup.mjs`)

A Playwright `globalSetup` that deterministically writes a WAV file for the
fake microphone — no binary is committed, no randomness, no timestamps in
the audio data:

- Output path: `tests/browser/.artifacts/fake-microphone.wav`
  (`mkdirSync(..., { recursive: true })` first).
- Format: mono, 16-bit PCM, 48 000 Hz, 3.0 seconds, 440 Hz sine at amplitude
  0.3 (non-silent by construction; Chromium loops the file, so 3 s covers any
  recording window).
- Write the canonical 44-byte WAV header exactly as `js/wav-encoder.js:26-43`
  does (`RIFF` @0, riff size @4, `WAVE` @8, `fmt ` @12, chunk size 16 @16,
  PCM format 1 @20, channels @22, sample rate @24, byte rate @28, block align
  @32, bits @34, `data` @36, data size @40, samples from 44) — you may crib
  that code, but implement it inside `global-setup.mjs` with `node:fs` /
  `DataView`; do not import from `js/` (keeps knip/coverage clean).
- Export default an async function (Playwright calls it once before the run).

**Verify**:
`node -e "import('./tests/browser/global-setup.mjs').then(m => m.default())" && ls -la tests/browser/.artifacts/fake-microphone.wav`
→ file exists, size = 44 + 48000×3×2 = 288 044 bytes.

### Step 3: Create the HTTP app server + HTTPS Azure stub (`tests/browser/static-server.mjs`)

Use `node:http`, `node:https`, and the system `openssl`, with zero npm runtime
dependencies (matches the repo's zero-runtime-deps rule; this is test tooling
but stay consistent):

- Serves the repository root; `/` → `/index.html`.
- Binds `127.0.0.1:4173`.
- MIME map (module workers hard-require correct JS MIME):
  `.html text/html`, `.js text/javascript`, `.mjs text/javascript`,
  `.css text/css`, `.json application/json`, `.svg image/svg+xml`,
  `.png image/png`, `.ico image/x-icon`. Unknown extension →
  `application/octet-stream`.
- `Cache-Control: no-store` on everything.
- Path-traversal guard: resolve the requested path against the repo root and
  reject (404) anything that escapes it. 404 for missing files.
- When run directly (`node tests/browser/static-server.mjs`) it starts and
  logs one line; Playwright's `webServer` will own its lifecycle.
- On startup, create `tests/browser/.artifacts/` and generate a one-day
  self-signed localhost certificate there if absent by invoking `/usr/bin/openssl`
  via `execFileSync`: RSA 2048, no passphrase, CN `127.0.0.1`, SAN
  `IP:127.0.0.1`. Both key and certificate are generated artifacts and remain
  gitignored; neither is committed.
- Start a second `node:https` server on `127.0.0.1:4174`. It accepts only the
  transcription path used by the test:
  - `OPTIONS`: record the count + request headers, then return 204 with
    `Access-Control-Allow-Origin: http://127.0.0.1:4173`, allowed method POST,
    and allowed header `Ocp-Apim-Subscription-Key`.
  - `POST`: record the count, return 200 JSON
    `{ combinedPhrases: [{ text: 'Browser smoke transcript' }], phrases: [] }`
    with the same allow-origin header. Before responding, buffer the request
    body on `data`/`end` with a strict 5 MiB maximum (the 1.2 s fixture is far
    smaller); return 413 and record an error if exceeded. Store the POST
    headers and completed body as base64 in `apiObservations`.
  - anything else: 404.
- The HTTP server exposes test-only observation endpoints:
  `POST /__browser-test__/reset` resets the HTTPS counters/headers;
  `GET /__browser-test__/api-observations` returns JSON containing
  `optionsCount`, `postCount`, recorded preflight headers, POST headers,
  `postBodyBase64`, and any capture error. These are server-side evidence that
  the genuine preflight and multipart POST crossed the socket boundary.
- Start a third minimal HTTP readiness listener on IPv6 loopback `[::1]:4175`
  that returns 204. It exists only for Playwright's `webServer.url` probe; the
  application and API remain on IPv4 `127.0.0.1`. Execution review proved that
  an unbound IPv4 loopback connection hangs under this host's WSL mirrored
  networking, causing immediately repeated browser commands to stall before
  Playwright starts the server. Unbound `::1` fails immediately, so Playwright
  can deterministically decide to launch the command, then wait for this health
  listener. Include the health server in SIGINT/SIGTERM shutdown.

**Verify**: start the server, retain the existing three HTTP MIME checks, then
run `curl -k -i -X OPTIONS https://127.0.0.1:4174/speechtotext/transcriptions:transcribe?api-version=2025-10-15 -H 'Origin: http://127.0.0.1:4173' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: Ocp-Apim-Subscription-Key'` and query
`http://127.0.0.1:4173/__browser-test__/api-observations`.
Expected: the HTTP files return 200 with correct MIME types; OPTIONS returns
204 with the required CORS headers; observations report `optionsCount: 1` and
the requested method/header. Stop the server afterward.

### Step 4: Create `playwright.config.js`

ES module (repo is `"type": "module"`), `defineConfig` from
`@playwright/test`:

```js
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(repoRoot, 'tests/browser/.artifacts/fake-microphone.wav');

export default defineConfig({
    testDir: 'tests/browser',
    globalSetup: './tests/browser/global-setup.mjs',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI
        ? [['line'], ['html', { open: 'never' }]]
        : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        permissions: ['microphone'],
        ignoreHTTPSErrors: true, // test-local one-day self-signed certificate only
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    webServer: {
        command: 'node tests/browser/static-server.mjs',
        url: 'http://[::1]:4175/',
        reuseExistingServer: false,
        timeout: 15_000
    },
    projects: [{
        name: 'chromium',
        use: {
            channel: 'chromium',
            launchOptions: {
                args: [
                    '--use-fake-device-for-media-stream',
                    `--use-file-for-fake-audio-capture=${FIXTURE}`
                ]
            }
        }
    }]
});
```

Notes locked in during planning — keep them:

- `channel: 'chromium'` selects regular/new-headless Chromium, not the
  stripped headless shell (closer to real browser; needed for reliable media
  codecs).
- Absolute fixture path (the browser process does not inherit the test CWD).
- The readiness URL deliberately uses `[::1]:4175`, not the app's IPv4 URL;
  see the mirrored-network execution finding in Step 3. Do not change it back
  without proving two immediately consecutive npm runs finish unattended.
- No `%noloop` suffix — the fixture loops, so any recording window works.
- `retries: 0` initially — flakiness must be visible, not retried away.
- Do NOT add `--use-fake-ui-for-media-stream`; the `permissions` grant
  handles it. Only if the permission grant proves insufficient on the pinned
  Chromium, add `--auto-accept-camera-and-microphone-capture` (the currently
  recommended flag) — and note it in the PR.

**Verify**: `npx playwright test --list` → exits 0 (0 tests yet is fine at
this step; after Step 5 it must list 1).

### Step 5: Write the spec scaffolding (`tests/browser/transcription-smoke.spec.js`)

One `test()` — a single continuous flow (splitting it would break the
"one user action traverses the whole chain" guarantee). Set up before
navigation, in this order:

1. **Config preseed** via `page.addInitScript` (runs before `main.js` on
   every navigation including the later reload — it only writes config keys,
   never `transcript_record`, so the persistence assertion stays honest):
   ```js
   localStorage.setItem('transcription_model', 'mai-transcribe-1.5');
   localStorage.setItem('mai_transcribe_uri',
       'https://127.0.0.1:4174/speechtotext/transcriptions:transcribe?api-version=2025-10-15');
   localStorage.setItem('mai_transcribe_api_key', 'e2e-test-key');
   localStorage.setItem('recording_environment', 'quiet');
   ```
   (`https://` is mandatory — `js/api-client.js:444` rejects anything else.
   `quiet` keeps AGC/NS/EC off so the fixture is not distorted.)
2. **Reset the real stub** — before navigation, call
   `fetch('http://127.0.0.1:4173/__browser-test__/reset', { method: 'POST' })`
   from the Node test process and require an OK response. Do NOT register any
   Playwright route for `127.0.0.1:4174`; routing/fulfillment would invalidate
   the CORS proof discovered during the first execution attempt.
3. **Font stub** — `page.route('https://fonts.googleapis.com/**', r =>
   r.fulfill({ status: 200, contentType: 'text/css', body: '' }))` (with the
   CSS stubbed empty, `fonts.gstatic.com` is never requested). No other
   external requests exist in `index.html`. This route is page-load-only:
   Step 6 MUST remove it before recording so Playwright disables Chromium's
   Fetch interception before the cross-origin transcription request.
4. **Failure collectors** — arrays fed by `page.on('pageerror', …)` and
   `page.on('console', msg => msg.type() === 'error' && …)`. Asserted empty
   at the end. (Do NOT fail on `log/info/debug` — `js/logger.js` is verbose
   on `127.0.0.1`.)
5. **Worker observers** — `const workers = []` fed by `page.on('worker', …)`;
   for each worker also track a `closed` flag via `worker.on('close', …)`.

**Verify**: `npx playwright test --list` → `1 test in 1 file`.

### Step 6: Startup assertions

- `await page.goto('/')`.
- `const primary = page.locator('#primary-action')`.
- `await expect(primary).toBeEnabled()` and
  `await expect(primary).toContainText('Start recording')`.
- Immediately after the page/startup assertions, call
  `await page.unroute('https://fonts.googleapis.com/**')`. Do this before the
  recording click. Execution showed that leaving any Playwright route active
  suppresses the browser preflight even for unmatched URLs; removing the last
  route disables Fetch interception and restores native CORS behavior.

Enabled-primary is the strong assertion: `js/ui.js:531` disables it unless
`this.ready` — which requires `main.js` to have constructed everything,
`Settings` to have loaded the preseeded config, and the browser-support check
to pass. Also assert `#transcript` is empty (`toHaveValue('')`) — a dirty
start would invalidate the persistence proof.

**Verify**: `npx playwright test` → the run reaches the recording step (add
the remaining steps incrementally; a partial spec that passes its written
assertions is fine while building).

### Step 7: Record

- `await primary.click()`.
- Wait through INITIALIZING (label `Done` but **disabled**,
  `js/ui.js:559`) into RECORDING:
  `await expect(primary).toContainText('Done')` **and**
  `await expect(primary).toBeEnabled()`.
- `await page.waitForTimeout(1200)` — ≥4 MediaRecorder timeslices at 250 ms
  (`js/audio-handler.js:210`). This is the only intentional sleep in the
  test; do not assert exact chunk counts or durations anywhere.

### Step 8: Stop, and capture the real worker + the real request

Register BOTH waits before clicking (the worker is created lazily during
conversion, after Done):

```js
const workerPromise = page.waitForEvent('worker',
    { predicate: w => w.url().endsWith('/js/audio-converter.worker.js') });
const postPromise = page.waitForRequest(r =>
    r.url().startsWith('https://127.0.0.1:4174/') && r.method() === 'POST');
await primary.click(); // Done
const worker = await workerPromise;
const request = await postPromise;
```

Worker assertions (remember: the worker registers with `addEventListener`,
so do NOT probe `self.onmessage`):

- `worker.url()` ends with `/js/audio-converter.worker.js`.
- Its `closed` flag (from Step 5's observer) is `false` — if the worker path
  had failed, `js/audio-converter.js:155-163` would have **terminated** it
  before the fallback ran, so "never closed + POST happened" proves the real
  worker performed the encode.
- `await worker.evaluate(() => self.location.pathname)` →
  `'/js/audio-converter.worker.js'` — still alive and evaluable after the
  POST.

### Step 9: Assert the request payload (production serialization, real bytes)

From `request` and the server observations:

- `request.method()` → `POST`; URL is the preseeded endpoint.
- Query the HTTP observation endpoint from Node after the POST. It must report
  exactly one OPTIONS and one POST. Its recorded
  `access-control-request-method` is `POST`, and
  `access-control-request-headers` contains `ocp-apim-subscription-key`.
  This server-side observation is the required evidence for the plan's CORS
  claim.
- `request.headers()['ocp-apim-subscription-key']` → `'e2e-test-key'`
  (Playwright lower-cases header names).
- `request.headers()['content-type']` starts with `multipart/form-data;
  boundary=`.
- `request.postDataBuffer()` is intentionally NOT used (execution proved it is
  `null` when native CORS is active). Decode
  `Buffer.from(observations.postBodyBase64, 'base64')` and parse that captured
  multipart body in Node using the server-recorded POST content type:
  ```js
  const body = Buffer.from(observations.postBodyBase64, 'base64');
  const form = await new Response(body,
      { headers: { 'content-type': observations.postHeaders['content-type'] } }
  ).formData();
  ```
  (Node ≥ 20 undici parses multipart `formData()`. If it throws
  `Could not parse content as FormData` see STOP #4.)
- `definition` field: `JSON.parse(form.get('definition'))` deep-equals
  `{ enhancedMode: { enabled: true, model: 'mai-transcribe-1.5', task: 'transcribe' } }`.
- `audio` field is a `File` with `name === 'recording.wav'` and
  `type === 'audio/wav'`.
- WAV byte assertions on `await form.get('audio').arrayBuffer()` via
  `DataView` (offsets are canonical — `js/wav-encoder.js:26-43`):
  - byteLength > 44;
  - bytes 0–3 `RIFF`, 8–11 `WAVE`, 36–39 `data`;
  - `getUint16(22, true) === 1` (mono);
  - `getUint32(24, true) === 16000` (resampled rate);
  - `getUint16(34, true) === 16` (bit depth);
  - `getUint32(40, true) > 0` (non-empty data chunk);
  - at least one non-zero `getInt16` among the first 16 000 samples
    (proves the fake mic delivered real signal — a silent/empty capture
    would zero every sample and must fail here).

### Step 10: Transcript, idle return, persistence, reload

- `await expect(page.locator('#transcript')).toHaveValue('Browser smoke transcript')`
  — the stub JSON went through `response.json()`
  (`js/api-client.js:143-144`), the real `parseMaiTranscribeResponse`
  (`combinedPhrases` join), `UI_TRANSCRIPTION_READY`, and
  `displayTranscription`.
- `await expect(primary).toContainText('Start recording')` and
  `toBeEnabled()` — PROCESSING returned to IDLE.
- Storage: `JSON.parse(await page.evaluate(() =>
  localStorage.getItem('transcript_record'))).text === 'Browser smoke
  transcript'` (shape per `js/transcript-store.js:49` —
  `{ text, savedAt }`). This key was written by production code only; the
  init script never touches it.
- The server observation endpoint reports one OPTIONS and one POST.
- `await page.reload()`; then:
  - `await expect(primary).toBeEnabled()` (startup works twice);
  - `await expect(page.locator('#transcript')).toHaveValue('Browser smoke transcript')`
    — `restoreTranscriptIfEmpty()` (`js/ui.js:806-811`) ran during `init()`;
  - query observations again; both counters remain 1 — reload must not fire a
    request.
- Final: assert the pageerror and console-error collectors are empty.

Add the npm scripts now (`package.json`):

```json
"test:browser": "playwright test",
"test:browser:headed": "playwright test --headed"
```

And `.gitignore` additions:

```
playwright-report/
test-results/
tests/browser/.artifacts/
```

**Verify**: `npm run test:browser` → `1 passed`. Run it **twice in a row**;
both green (flakiness gate). Then `npm run test:coverage` → unchanged pass
(browser files are invisible to Vitest's `tests/**/*.vitest.js` glob).

### Step 11: Knip check

Run `npm run deps:check` and `npm run deps:check:prod`.

- Expected: both exit 0 — knip's Playwright plugin auto-detects
  `@playwright/test` + `playwright.config.js`; `tests/browser/**` is outside
  knip's `project` glob (`js/**/*.js`).
- If `@playwright/test` is reported as an **unused devDependency** or the
  config/spec files as unused (the root `ignore: ["*.config.js"]` can mask
  plugin detection), add exactly this to `knip.json` and re-run:
  ```json
  "playwright": {
      "config": ["playwright.config.js"],
      "entry": ["tests/browser/**/*.spec.js", "tests/browser/*.mjs"]
  }
  ```
  Nothing else in `knip.json` changes.

**Verify**: `npm run deps:check` → exit 0; `npm run deps:check:prod` →
exit 0.

### Step 12: CI job

Add a **separate job** to `.github/workflows/ci.yml` (separate so a browser
failure is instantly distinguishable from lint/unit failures, and the
browser download never delays fast feedback):

```yaml
  browser-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Install Chromium
        run: npx playwright install --with-deps --no-shell chromium
      - name: Browser smoke test
        run: npm run test:browser
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: browser-smoke-artifacts
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore
          retention-days: 7
```

Keep the existing `checks` job byte-identical. (The uploaded trace can only
contain the dummy `e2e-test-key` value — no real secret ever enters this
test.)

**Verify**: `npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "const y=require('js-yaml')"` —
if no YAML linter is available, verify with
`node -e "console.log(require('fs').readFileSync('.github/workflows/ci.yml','utf8').includes('browser-smoke'))"`
→ `true`, and rely on the PR's CI run for real validation.

### Step 13: Full local gate

```bash
npm run lint && npm run test:coverage && npm run deps:check && npm run deps:check:prod && npm run size && npm run test:browser
```

**Verify**: every command exits 0; Playwright reports `1 passed`.

## Test plan

The deliverable IS a test. Its assertion inventory (all must be present in
the spec — reviewers check against this list):

1. Startup: no `pageerror`; `#primary-action` enabled with label
   `Start recording`; `#transcript` empty.
2. Interaction: real click drives IDLE → INITIALIZING → RECORDING (label
   `Done`, enabled).
3. Capture: native MediaRecorder on the fake-device stream; ≥1.2 s recorded.
4. Worker: `audio-converter.worker.js` created with the right URL, never
   closed, evaluable after the POST (real worker, not the sync fallback).
5. Request: the listening HTTPS stub observes exactly 1 CORS preflight with
   the expected requested method/header and exactly 1 POST to the preseeded
   endpoint;
   `Ocp-Apim-Subscription-Key` header; multipart fields `audio`
   (`recording.wav`, `audio/wav`, valid mono/16 kHz/16-bit non-silent WAV)
   and `definition` (exact `enhancedMode` JSON).
6. Response path: stub JSON → real parser → `#transcript` textarea value
   `Browser smoke transcript`; controls return to idle.
7. Persistence: `transcript_record` localStorage shape `{ text, savedAt }`;
   value survives `page.reload()` and re-renders via
   `restoreTranscriptIfEmpty()`; still exactly 1 POST; zero console errors.

Existing suites are the pattern for nothing here (this is the repo's first
Playwright spec); match the repo's 4-space indentation and JSDoc-style file
header comment (see `js/audio-converter.js:1-9` for tone).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run test:browser` → `1 passed`, twice consecutively
- [ ] The two consecutive runs are invoked immediately in one shell command
      (`npm run test:browser && npm run test:browser`) and complete without a
      readiness-probe hang
- [ ] `npm run test:coverage` → passes with unchanged thresholds
- [ ] `npm run lint` → exit 0
- [ ] `npm run deps:check` and `npm run deps:check:prod` → exit 0
- [ ] `npm run size` → exit 0
- [ ] `git diff --stat main` touches only in-scope files (no `js/`,
      `index.html`, `css/`, `vitest.config.js`, `tests/*.vitest.js` changes)
- [ ] `grep -n "browser-smoke" .github/workflows/ci.yml` → match
- [ ] Browser spec uses no route for the Azure stub and asserts its server-side
      observation of one `OPTIONS` preflight and one `POST`; the
      preflight assertions cover `access-control-request-method` and
      `access-control-request-headers`
- [ ] CI failure upload includes both `playwright-report/` and `test-results/`
- [ ] `grep -n "onmessage" tests/browser/transcription-smoke.spec.js` → no
      match (the invalid probe from the external assessment must not appear)
- [ ] No committed binary: `git ls-files tests/browser | grep -c "\.wav$"` → 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

1. **Worker `close` fires before the POST** — means the real worker path
   failed and the sync fallback ran. That is exactly the class of defect this
   test exists to catch; do not weaken the assertion to get green. Capture
   the worker error and report.
2. **The WAV samples are all zero** — the fake capture file is not reaching
   the recorder (flag order, path, or headless-shell issue). Confirm the
   config uses `channel: 'chromium'` and the absolute fixture path; if still
   silent, report with `chrome://version` args from
   `browser.contexts()[0]` diagnostics rather than switching approaches.
3. **`decodeAudioData` rejects the recorded blob** (surfaces as a conversion
   error event / no POST): Chromium-build codec gap. Report; do not swap in
   a JS `getUserMedia` override without the operator's decision.
4. **`Response#formData()` throws** on the multipart body in Node: report
   Node/undici versions. Only with operator approval fall back to a minimal
   boundary-split parser in the spec file.
5. **Permission not granted** (getUserMedia rejects with NotAllowedError in
   the page): try adding `--auto-accept-camera-and-microphone-capture` to
   `launchOptions.args` (one retry). If still failing, STOP.
6. **`npx playwright install chromium` fails locally for missing system
   libraries**: do NOT `sudo apt install` or `install-deps` — this is a
   corporate-managed machine. Report the missing libraries; the operator
   decides. (CI is unaffected — it uses `--with-deps`.)
7. Any excerpt in "Current state" no longer matches the live code (drift).
8. The test needs any change to files under `js/` or `index.html` to pass.
9. A verification fails twice after a reasonable fix attempt.
10. The local HTTPS server receives the POST but no OPTIONS. Report the
    browser/server evidence after confirming the font route was removed before
    recording; do not restore Azure `page.route().fulfill()` or weaken the CORS
    assertion.
11. The HTTPS server cannot capture the complete POST below the 5 MiB cap, or
    the observation endpoint exposes an empty/truncated body. Report the server
    error and byte counts; do not re-enable Playwright routing to obtain the
    payload.
12. The `[::1]:4175` readiness listener cannot bind or Playwright still hangs
    before launching the server on two immediate runs. Report the WSL/network
    evidence; do not restore the hanging IPv4 readiness URL.

## Maintenance notes

- **What this test proves**: real page assembly, real controls,
  permission-granted `getUserMedia`, native MediaRecorder + WebM/Opus encode,
  real `OfflineAudioContext` decode/resample, the real module worker over the
  wire format the FakeWorker only simulates, native `FormData` multipart
  serialization, a genuine browser CORS preflight across a local HTTPS socket,
  the transcription endpoint's header contract, the production response
  parser, DOM rendering, and
  localStorage persistence across reload.
- **What it deliberately does NOT prove** (do not "fix" these here):
  physical microphone/OS device behavior; the visible permission prompt UX;
  Firefox/WebKit/branded-Chrome codec differences; Azure auth, TLS,
  availability, quota; Azure accepting the generated WAV; the live response
  schema; transcription accuracy (the stub text is independent of the audio).
  The live boundary is plan 015; physical-mic remains a manual release
  check.
- Keep it **one** continuous test. Resist splitting into record/worker/
  request/persistence tests — repeated setup weakens the whole-chain
  guarantee. Extract helper functions for readability instead.
- Keep `retries: 0` until there is longitudinal CI evidence; if a retry is
  ever added, add a comment naming the observed flake.
- Chromium version is pinned via `package-lock.json` (`@playwright/test`
  pins its browser build). Playwright upgrades can change fake-device and
  permission behavior — re-run the smoke twice locally after any bump.
- If the app ever adds a Content-Security-Policy meta tag (a previously
  deferred audit finding), the worker + inline-script assertions here are
  the canary — expect this test to catch a bad `worker-src`/`script-src`.
- If MediaRecorder options (mimeType) or the 250 ms timeslice change in
  `js/audio-handler.js`, revisit Step 7's 1200 ms window.
- The fixture is generated, not committed; `tests/browser/.artifacts/` is
  gitignored. If CI caching ever skips `globalSetup`, the WAV write is
  idempotent.
- Reviewer checklist for the PR: assertion inventory matches the Test plan
  section; font route removed before recording; preflight observed by the
  listening HTTPS stub (no Azure route fulfillment); no
  production-code diff; CI job separate from `checks`; failure artifacts
  include the HTML report and `test-results/`; no `self.onmessage` probe; no
  `%noloop`/`--use-fake-ui-for-media-stream` flags without a recorded reason.
