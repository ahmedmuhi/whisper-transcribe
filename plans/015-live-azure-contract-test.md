# Plan 015: Add an opt-in live-Azure contract test (manually triggered, never in normal CI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f525b87..HEAD -- js/api-client.js js/model-adapters/ playwright.config.js tests/browser/ package.json .github/workflows/`
> Plan 014 MUST be merged first (its scaffolding is reused). If plan 014's
> files are absent, STOP. If any excerpt below mismatches the live code,
> STOP.

## Status

- **Priority**: P3
- **Effort**: S/M
- **Risk**: MED (real credentials + real spend; risk is contained by
  workflow_dispatch-only triggering and no-artifact policy)
- **Depends on**: plans/014-browser-smoke-test-playwright.md (merged)
- **Category**: tests
- **Planned at**: commit `f525b87`, 2026-07-12

## Why this matters

Plan 014's deterministic smoke test intentionally stubs the Azure boundary.
That leaves exactly one untested seam: does the *real* Azure MAI-Transcribe
endpoint still accept the app's converted WAV, honor its auth header, permit
the browser's CORS preflight, and return a response shape the production
parser understands? Service-side contract drift (API version retirement,
schema changes, CORS policy changes) is invisible to every other test. One
small, manually triggered, real-browser + real-Azure test validates that
seam for the cost of a few seconds of audio transcription — separated from
normal CI so it can never block a PR, leak into forks, or spend money on
every push.

## Current state

Verified at commit `f525b87` (re-verify excerpts against HEAD after 014
merges).

- Plan 014 (prerequisite) provides: `@playwright/test` dev dependency,
  `tests/browser/static-server.mjs`, `tests/browser/global-setup.mjs`,
  `playwright.config.js` (deterministic project — testDir `tests/browser`),
  npm scripts `test:browser` / `test:browser:headed`, and a `browser-smoke`
  CI job. This plan must NOT modify any of those except `package.json`
  (one new script) — the live test gets its **own config and directory** so
  `npm run test:browser` can never execute it accidentally.
- `js/api-client.js:12-14` — retries on 429/500/502/503/504 with backoff
  `[2000, 4000, 8000, 16000, 32000]` ms; `js/constants.js:352` per-attempt
  timeout 120 s; `js/constants.js:364` retry deadline 180 s. The deadline
  prevents starting more sleeps/attempts after it, but deliberately does not
  abort an attempt already in flight (`js/api-client.js:154-157`). A sustained
  timeout can therefore run for about 242 s (120 s attempt + 2 s backoff + one
  final 120 s attempt). **Cost model: one live run = up to 6 service attempts**
  (initial + 5 retries) for fast retryable responses. Do NOT add
  Playwright-level retries on top.
- `js/model-adapters/mai-transcribe.js` — request: multipart `audio`
  (`recording.wav`, converted 16 kHz mono WAV) + `definition`
  (`{"enhancedMode":{"enabled":true,"model":"mai-transcribe-1.5","task":"transcribe"}}`),
  header `Ocp-Apim-Subscription-Key`.
- `js/model-adapters/response-parsers.js:24-30` — accepts
  `combinedPhrases[].text`, plain-text, or JSON `text` (string, may be empty
  since plan 011). A tone-only fixture would legally transcribe to empty —
  which is why this test needs a **spoken** fixture to assert anything
  meaningful.
- Storage keys the app reads (`js/constants.js:42-52`):
  `transcription_model`, `mai_transcribe_uri`, `mai_transcribe_api_key`,
  `recording_environment`.
- `js/api-client.js:444` — endpoint must be `https:`.
- Endpoint URI shape (placeholder in `index.html:270`):
  `https://<resource>.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`.
- Secrets hygiene: Playwright traces/reports/videos can embed request
  headers — the real API key would appear in them. The live config must
  disable all of that, and the workflow must upload **no artifacts**.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| List live tests | `npx playwright test --config playwright.live.config.js --list` | 1 test listed |
| Run live (local) | `AZURE_MAI_TRANSCRIBE_URI=… AZURE_MAI_TRANSCRIBE_API_KEY=… npm run test:browser:live` | `1 passed` |
| Run without secrets | `npm run test:browser:live` | `1 skipped` (guard works) |
| Deterministic suite unaffected | `npm run test:browser` | `1 passed`, live spec NOT listed |
| Unit suite | `npm run test:coverage` | unchanged pass |
| Knip | `npm run deps:check` | exit 0 (after Step 5 config, if needed) |

(Real credential values above are supplied by the operator at run time —
never write them into any file, output, or commit.)

## Suggested executor toolkit

- The operator (Ahmed) must supply two inputs before this plan can complete:
  (a) the two secret values into a GitHub Environment, and (b) a short
  **spoken** WAV fixture. Steps 1 and 6 tell you exactly when to pause for
  each.

## Scope

**In scope** (the only files you should create/modify):

- `playwright.live.config.js` (create)
- `tests/browser-live/live-azure.contract.spec.js` (create)
- `tests/browser-live/fixtures/spoken-phrase.wav` (committed — operator
  supplies the audio; see Step 1)
- `.github/workflows/live-azure-contract.yml` (create)
- `package.json` (add `test:browser:live` script only)
- `knip.json` (ONLY if Step 5 shows fallout; add the live config to the
  existing playwright plugin entry)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- Anything under `js/`, `index.html`, `css/` — zero production changes.
- `playwright.config.js`, `tests/browser/**` — the deterministic smoke stays
  exactly as plan 014 left it.
- `.github/workflows/ci.yml` — the live test must never run on push/PR.
- Vitest config and all `tests/*.vitest.js`.
- Any schedule trigger (`on: schedule`) — start workflow_dispatch-only; a
  cron can be a later, separate decision.

## Git workflow

- Branch: `test/015-live-azure-contract` from `main` (after 014 merges).
- Conventional commits (`test(browser-live): …`, `ci: add live contract workflow`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Obtain the spoken fixture (operator input — pause here)

Ask the operator for a WAV file at
`tests/browser-live/fixtures/spoken-phrase.wav`:

- 2–4 seconds, mono preferred, 16-bit PCM (any common sample rate —
  Chromium's fake capture converts).
- A clearly spoken generic phrase containing at least one stable keyword,
  e.g. "testing one two three" — recorded for this purpose, containing no
  personal, client, or confidential content (it will live in a public-ish
  repo and be sent to Azure on every run).
- Record the exact expected keyword (lowercase) — it is hardcoded into the
  spec in Step 3 (e.g. `testing`).

STOP condition #1 applies if the operator cannot supply one — do not
synthesize speech with any external TTS service (operator has a standing
"no ElevenLabs / no third-party voice services" rule; ask, don't pick an
alternative yourself).

**Verify**: `ls -la tests/browser-live/fixtures/spoken-phrase.wav` → exists;
`node -e "const b=require('fs').readFileSync('tests/browser-live/fixtures/spoken-phrase.wav'); console.log(b.slice(0,4).toString(), b.slice(8,12).toString())"`
→ `RIFF WAVE`.

### Step 2: Create `playwright.live.config.js`

Same shape as plan 014's `playwright.config.js` with these deliberate
differences (each is a security/cost decision — keep them):

```js
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(repoRoot, 'tests/browser-live/fixtures/spoken-phrase.wav');

export default defineConfig({
    testDir: 'tests/browser-live',
    workers: 1,
    fullyParallel: false,
    retries: 0,               // the app itself retries up to 6 attempts; never stack retries
    timeout: 300_000,         // exceeds the ~242 s sustained-timeout path
    expect: { timeout: 15_000 },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        permissions: ['microphone'],
        serviceWorkers: 'block',
        trace: 'off',         // traces would embed the real API key header
        screenshot: 'off',
        video: 'off'
    },
    webServer: {
        command: 'node tests/browser/static-server.mjs',
        url: 'http://127.0.0.1:4173/',
        reuseExistingServer: !process.env.CI,
        timeout: 15_000
    },
    projects: [{
        name: 'chromium-live',
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

No `globalSetup` (the fixture is committed, not generated). It reuses plan
014's static server file — read-only reuse is fine; modifying it is not.

**Verify**: `npx playwright test --config playwright.live.config.js --list`
→ lists 0 tests (spec comes next), exit 0.

### Step 3: Write `tests/browser-live/live-azure.contract.spec.js`

One test, mirroring plan 014's flow but with the real boundary:

1. **Guard first** (makes local/no-secret runs a clean skip, not a failure):
   ```js
   const uri = process.env.AZURE_MAI_TRANSCRIBE_URI;
   const key = process.env.AZURE_MAI_TRANSCRIBE_API_KEY;
   test.skip(!uri || !key, 'live Azure secrets not provided');
   ```
2. Preseed config via `addInitScript` with values **passed as an argument**
   (never string-interpolated into the script source, which would put the
   key into any error message):
   ```js
   await page.addInitScript(cfg => {
       localStorage.setItem('transcription_model', 'mai-transcribe-1.5');
       localStorage.setItem('mai_transcribe_uri', cfg.uri);
       localStorage.setItem('mai_transcribe_api_key', cfg.key);
       localStorage.setItem('recording_environment', 'quiet');
   }, { uri, key });
   ```
3. Stub ONLY the fonts (`https://fonts.googleapis.com/**` → empty CSS, as in
   plan 014). **No route on the Azure host** — the request must go to the
   real service. Register a required `page.waitForRequest` before clicking
   Done and assert that a `POST` leaves for the exact configured URI. Observe
   it only; do not route, fulfill, log, or inspect its headers.
4. Flow: goto `/` → expect `#primary-action` enabled → click → wait for
   `Done` enabled → `waitForTimeout(4000)` (cover the spoken phrase; the
   fixture loops) → click Done.
5. Assertions (tolerant by design — live output is nondeterministic):
   - `await expect(page.locator('#transcript')).not.toHaveValue('', { timeout: 260_000 })`
     (window exceeds the app's ~242 s sustained-timeout path);
   - transcript value, lowercased, contains the keyword agreed in Step 1
     (e.g. `expect(value.toLowerCase()).toContain('testing')`). Do NOT
     assert punctuation, casing, or the full phrase;
   - primary control returns to `Start recording` enabled;
   - zero `pageerror` events.
   Do NOT log the transcript, request headers, or localStorage anywhere.

**Verify**:
`npm run test:browser:live` (script added in Step 4; run WITHOUT env vars)
→ `1 skipped`. Then, with the operator present to supply real values as
shell env vars for one run → `1 passed`. If the operator is unavailable,
mark this sub-verification "pending operator run" in your report rather
than inventing credentials (STOP #2 covers a failing live run).

### Step 4: Add the npm script

In `package.json`:

```json
"test:browser:live": "playwright test --config playwright.live.config.js"
```

**Verify**: `npm run test:browser` → still `1 passed` and the live spec does
NOT appear in its output (config isolation holds).

### Step 5: Knip check

`npm run deps:check` — if `playwright.live.config.js` or the live spec is
flagged, extend the existing playwright plugin entry in `knip.json`:

```json
"playwright": {
    "config": ["playwright.config.js", "playwright.live.config.js"],
    "entry": ["tests/browser/**/*.spec.js", "tests/browser/*.mjs",
              "tests/browser-live/**/*.spec.js"]
}
```

**Verify**: `npm run deps:check` and `npm run deps:check:prod` → exit 0.

### Step 6: Create `.github/workflows/live-azure-contract.yml`

```yaml
name: Live Azure contract test

on:
  workflow_dispatch:

concurrency:
  group: live-azure-contract
  cancel-in-progress: false

jobs:
  live-contract:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: live-azure
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
      - name: Verify required secrets
        env:
          AZURE_MAI_TRANSCRIBE_URI: ${{ secrets.AZURE_MAI_TRANSCRIBE_URI }}
          AZURE_MAI_TRANSCRIBE_API_KEY: ${{ secrets.AZURE_MAI_TRANSCRIBE_API_KEY }}
        run: |
          test -n "$AZURE_MAI_TRANSCRIBE_URI" || { echo "::error::Missing Azure endpoint secret"; exit 1; }
          test -n "$AZURE_MAI_TRANSCRIBE_API_KEY" || { echo "::error::Missing Azure API-key secret"; exit 1; }
      - name: Live contract test
        env:
          AZURE_MAI_TRANSCRIBE_URI: ${{ secrets.AZURE_MAI_TRANSCRIBE_URI }}
          AZURE_MAI_TRANSCRIBE_API_KEY: ${{ secrets.AZURE_MAI_TRANSCRIBE_API_KEY }}
        run: npm run test:browser:live
```

Deliberate properties (keep all):

- `workflow_dispatch` ONLY — never push/PR/schedule. Fork PRs therefore can
  never reach the secrets.
- `environment: live-azure` — a GitHub Environment the **operator** creates,
  holding both secrets, ideally with required-reviewer protection. Pause
  here and ask the operator to create it (`AZURE_MAI_TRANSCRIBE_URI`,
  `AZURE_MAI_TRANSCRIBE_API_KEY`); you cannot and must not do this yourself
  or place values anywhere in the repo.
- **No artifact upload step** — no report, no trace, no screenshots (the
  config already disables them; the workflow must not re-add them).
- The explicit secret guard makes a misconfigured manual workflow fail. The
  spec still skips without secrets for safe local/generic gate runs, but a
  GitHub run must never appear green without exercising Azure.
- No extra retry layer anywhere.

Cost/cleanup notes for the operator (also record in the workflow file as a
comment): one run ≤ 6 synchronous transcription attempts of a 2–4 s clip;
the API is synchronous multipart — no server-side job or resource is created
that needs deletion; cleanup is just context disposal, which Playwright does.

**Verify**:
`node -e "const s=require('fs').readFileSync('.github/workflows/live-azure-contract.yml','utf8'); console.log(s.includes('workflow_dispatch') && !s.includes('upload-artifact') && s.includes('environment: live-azure') && s.includes('Verify required secrets'))"`
→ `true`.

### Step 7: Full gate

```bash
npm run lint && npm run test:coverage && npm run deps:check && npm run deps:check:prod && npm run size && npm run test:browser && npm run test:browser:live
```

(the last command without env vars → skip). **Verify**: all exit 0;
deterministic smoke `1 passed`; live `1 skipped`.

## Test plan

- The deliverable is one live-contract test; its assertions: real POST
  leaves the browser for the configured endpoint; the live response drives
  the production parser to a non-empty transcript containing the agreed
  keyword (tolerant match); controls return to idle; no page errors.
- Negative path: running without env secrets yields `skipped`, not a
  failure — verified in Step 3.
- Isolation: `npm run test:browser` never lists the live spec — verified in
  Step 4.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run test:browser:live` without env vars → `1 skipped`, exit 0
- [ ] One operator-witnessed live run → `1 passed` (or explicitly recorded
      as "pending operator run" in the report and the index row set to
      BLOCKED on that)
- [ ] `npm run test:browser` output does not mention
      `live-azure.contract.spec.js`
- [ ] `.github/workflows/live-azure-contract.yml` contains
      `workflow_dispatch`, `environment: live-azure`, an explicit non-empty
      secret guard, and NO `upload-artifact`
- [ ] `grep -rn "AZURE_MAI_TRANSCRIBE" --include="*.js" --include="*.yml" .`
      matches only `process.env.*` reads in the live spec and
      `secrets.*` references in the workflow — no literal values anywhere
- [ ] `playwright.live.config.js` has `trace: 'off'`, `retries: 0`
- [ ] `playwright.live.config.js` has a test timeout of at least 300 000 ms,
      and the transcript assertion allows at least 260 000 ms
- [ ] The live spec requires (does not merely optionally observe) one POST to
      the exact configured URI
- [ ] `npm run lint`, `test:coverage`, `deps:check`, `deps:check:prod`,
      `size` all exit 0
- [ ] `git diff --stat main` touches only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

1. The operator cannot supply a spoken fixture. Do not substitute
   synthesized speech from any external TTS service, and do not repurpose
   any existing recording found on disk without explicit approval.
2. A live run fails on a real Azure error (401/403, CORS rejection, 4xx on
   the audio, schema surprise): that is a **finding**, possibly the exact
   contract drift this test exists to detect — report the status code and
   sanitized error body (never the key, never the full URI if it embeds a
   resource name the operator considers sensitive).
3. Plan 014's files are missing or diverged (this plan depends on its
   scaffolding verbatim).
4. Anything would require the secret values to be written to a file,
   committed, echoed, or logged — including "just for debugging".
5. The live spec somehow appears in `npm run test:browser`'s test list
   (config isolation broken).
6. A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This test validates: credentials, endpoint URI + api-version, DNS/TLS,
  browser CORS against real Azure, Azure accepting the app's converted WAV,
  the current live response schema through the production parser. It still
  does NOT validate: physical microphones, transcription quality, other
  browsers, or production hosting headers.
- Run it manually after: changing the MAI adapter/definition shape, bumping
  the `api-version`, rotating keys, or any Azure-side resource change — and
  occasionally (e.g. monthly) to catch silent service drift. If drift proves
  common, adding `on: schedule` is a deliberate follow-up decision, not a
  default.
- Key rotation: values live only in the `live-azure` GitHub Environment and
  the operator's shell for local runs. Nothing in the repo changes on
  rotation.
- If plan 011's empty-transcription acceptance ever changes, the non-empty
  assertion here may need revisiting (an empty-but-valid live response is a
  legal parser outcome; this test's fixture is spoken precisely so empty
  means failure).
- Reviewer checklist: no secrets in diff; `trace: 'off'` intact; workflow
  has no artifact upload and no non-dispatch trigger; app-level retry (≤6
  attempts) not duplicated by test-level retries.
