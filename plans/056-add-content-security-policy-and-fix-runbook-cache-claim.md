# Plan 056: Ship a Content-Security-Policy on both HTML entries and correct the runbook's stale MSAL cache sentence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, and do not improvise. When you are done, update the status row for
> this plan in `plans/README.md`, unless a reviewer dispatched you and told you
> that they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 683c4b5..HEAD -- index.html auth/redirect.html vite.config.js docs/keyless-operator-runbook.md README.md tests/palette-themes.vitest.js tests/vite-build.vitest.js tests/browser/transcription-smoke.spec.js`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts below against the live files before you proceed. A
> mismatch is a STOP condition. Pay special attention to the inline theme
> script in `index.html` lines 8 to 31, because Step 1 moves it into a file.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (a wrong policy silently breaks sign-in, the encode Worker, fonts, or transcription requests)
- **Depends on**: none
- **Category**: security (finding 1) and docs (finding 2)
- **Planned at**: commit `683c4b5`, 2026-09-20

## Why this matters

Whisper Transcribe is a browser-only application that signs in with
`@azure/msal-browser`. Since ADR-0002
(`docs/adr/0002-share-msal-cache-across-tabs.md`) the MSAL cache lives in
`localStorage` so that a new tab can reuse the account. The ADR itself says
that MSAL's at-rest encryption "does not protect credentials from malicious
JavaScript or an XSS compromise". That makes script injection the realistic
way an attacker could steal a token, and the application currently ships no
Content-Security-Policy at all. An earlier audit deferred a policy because, at
that time, no injection sink was found; the move of tokens into `localStorage`
changes the cost of being wrong, so the finding is now promoted to a plan.

The site is deployed to GitHub Pages
(`https://ahmedmuhi.github.io/whisper-transcribe/`). GitHub Pages cannot send
custom response headers, so the policy has to be a
`<meta http-equiv="Content-Security-Policy">` tag inside `index.html` and
inside `auth/redirect.html`. A meta policy has three known limits which you
must not try to work around: the browser ignores `frame-ancestors`,
`report-uri`/`report-to`, and `sandbox` when they arrive in a meta tag. Do not
add those directives.

The second finding is a one-sentence documentation bug. The operator runbook
still says that the application "configures MSAL's cache in `sessionStorage`".
That has been false since ADR-0002, and an operator who trusts the runbook
would reason incorrectly about how long tokens persist and which tabs share
them.

## Current state

All of the facts below were read directly from the repository at commit
`683c4b5`.

### The files involved

- `index.html` is the application entry. It has no CSP meta tag. Lines 8 to 31
  hold one inline classic `<script>` (the anti-flash theme bootstrap). Lines
  32 to 34 load Google Fonts. Line 35 loads `css/styles.css`. Line 436 loads
  `./js/main.js` as a module.
- `auth/redirect.html` is the MSAL callback entry. It has no CSP meta tag. It
  contains one inline module script that imports
  `broadcastResponseToMainFrame` from `@azure/msal-browser/redirect-bridge`.
- `vite.config.js` is the multi-page Vite build. It has no `plugins` array
  today. It already switches behaviour by `mode` (`pages`, `browser-test`,
  `live-contract`).
- `docs/keyless-operator-runbook.md` line 159 holds the stale sentence.
- `README.md` lines 65 to 69 already say `localStorage` correctly.
- `js/authentication-config.js` lines 56 to 62 are the source of truth:
  the authority is `https://login.microsoftonline.com/<tenant>` and
  `cacheLocation` is `'localStorage'`.

### The head of `index.html` today (lines 3 to 36)

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Speech to Text</title>
    <link rel="icon" href="data:,">
    <script>
        (function () {
            try {
                // Key must match STORAGE_KEYS.THEME_MODE in js/constants.js
                const themeMode = localStorage.getItem('themeMode') || 'auto';
                ...
            }
        })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/styles.css">
</head>
```

### The whole of `auth/redirect.html` today

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Completing sign-in</title>
</head>
<body>
    <p id="redirect-status">Completing sign-in…</p>
    <script type="module">
        import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

        try {
            await broadcastResponseToMainFrame();
        } catch {
            document.getElementById('redirect-status').textContent = 'Unable to complete sign-in.';
        }
    </script>
</body>
</html>
```

### The stale runbook sentence (`docs/keyless-operator-runbook.md` lines 158 to 160)

```markdown
`AuthenticationService` derives `/auth/redirect.html`, uses full-page redirects,
and configures MSAL's cache in `sessionStorage`. The callback must remain a
separate Vite entry and run only `broadcastResponseToMainFrame`.
```

A search of the runbook and of `README.md` for `sessionStorage` found exactly
two hits. The runbook hit at line 159 is the stale one. The `README.md` hit at
line 63 says that audio blobs "are not put in localStorage, sessionStorage,
event history, or logs", which is a true statement about audio and must stay
as it is.

### What the advisor measured, so that you do not have to rediscover it

The advisor ran a production build into a scratch directory and inspected the
output. These results drive the decisions in the next section.

1. The anti-flash theme script can live in its own file. The advisor tried
   this in a scratch copy on 2026-10-02: the script body went into
   `public/theme-bootstrap.js`, and `index.html` loaded it with
   `<script vite-ignore src="theme-bootstrap.js"></script>`. Vite copied the
   file unchanged to `dist/theme-bootstrap.js` in both the normal build and the
   `pages` build, and kept the tag in `dist/index.html` with the relative
   address untouched. Without the `vite-ignore` attribute the build prints the
   harmless warning `<script src="theme-bootstrap.js"> in "/index.html" can't
   be bundled without type="module" attribute`; with it the warning disappears
   and Vite removes the attribute from the output. The address must stay
   relative (no leading `/`), because on GitHub Pages the site lives under
   `/whisper-transcribe/` and a relative address resolves there correctly.
2. Vite does **not** leave the inline module script in `auth/redirect.html`
   inline. The built `dist/auth/redirect.html` contains
   `<script type="module" crossorigin src="/assets/redirect-<hash>.js"></script>`
   and no inline script at all. Under `npm start` the Vite dev server likewise
   rewrites the inline module into a same-origin proxied `src`. So the callback
   page never executes an inline script in a browser.
3. The MSAL redirect bridge talks to the main frame through a
   `BroadcastChannel`, which CSP does not govern.
4. `js/audio-converter.js` line 134 creates the encode Worker with
   `new Worker(new URL('./audio-converter.worker.js', import.meta.url), { type: 'module' })`.
   Vite emits that Worker as a same-origin file under `dist/assets/`. It is not
   a `blob:` Worker.
5. `js/selected-audio-controller.js` lines 39 and 75 create an object URL for
   the chosen file and assign it to an `<audio>` element's `src`, so `blob:`
   media must be allowed. `js/audio-handler.js` line 124 creates an object URL
   only for a download link, which CSP does not govern.
6. `css/styles.css` line 404 uses a `data:` SVG as a background image, and the
   favicon is `data:,`. Both are governed by `img-src`.
7. `index.html` contains inline `style="..."` attributes: two `--card-index`
   custom properties (lines 91 and 174) and twelve palette swatch backgrounds
   (lines 351 to 392). `tests/palette-themes.vitest.js` around line 333 reads
   those swatch colours out of the markup, so they are a tested contract.
8. No application module uses `eval`, `new Function`, string timers, or
   `innerHTML` with values. The only `innerHTML` write is
   `this.inputDeviceSelect.innerHTML = ''` in `js/settings.js` line 505.
9. Target URI validation accepts **any** HTTPS host. See
   `js/api-client.js` lines 470 to 483 and `js/settings.js` lines 602 to 609;
   both only check `new URL(uri).protocol === 'https:'`.
10. The deterministic Playwright suite builds with
    `npm run build -- --mode browser-test` (`playwright.config.js` line 29),
    serves the application from `http://127.0.0.1:4173`, and sends
    transcription requests to two hosts that are not Azure hosts:
    `https://127.0.0.1:4174` (the local HTTPS stub, used by
    `tests/browser/selected-audio.spec.js` and
    `tests/browser/transcription-smoke.spec.js`) and `https://target.invalid`
    (`tests/browser/auth-menu-recovery.spec.js` line 8, fulfilled by
    `page.route`). Chromium applies `connect-src` before Playwright can
    intercept the request, so an unmodified production policy would make those
    tests fail.
11. `AuthenticationService.initialize()` (`js/authentication-service.js` lines
    140 to 152) calls `ssoSilent({ scopes: [] })` when no cached account
    exists, and `acquireTokenSilent` (lines 67 and 91) can fall back to a
    hidden iframe. That iframe first loads `https://login.microsoftonline.com`
    and is then redirected to the application's own `/auth/redirect.html`, so
    `frame-src` must allow both `'self'` and `https://login.microsoftonline.com`.
    Full-page redirects for sign-in and sign-out are top-level navigations,
    which CSP does not restrict.

### Decisions already taken by the advisor (do not reopen them)

- **The inline theme script in `index.html` moves into its own file,
  `public/theme-bootstrap.js`, so the policy needs no hash.** Ahmed chose this
  on 2026-10-02 over allowing the inline script by its SHA-256 hash, because a
  hash would have to be updated after every edit to the script, even a
  whitespace edit, forever. Three facts make the move safe. First, the script
  stays a classic (non-module) script loaded by a plain `<script src>` tag in
  `<head>`, and a classic script tag without `async` or `defer` still runs
  before the page is drawn, so the theme flash stays prevented. It must **not**
  become `type="module"`, because module scripts run only after the whole page
  has been read, which is too late. Second, because it stays a classic script,
  it still cannot import `js/constants.js`, so it keeps its own typed copy of
  the palette list and the storage key names. Third, the guard in
  `tests/palette-themes.vitest.js` lines 300 to 322, which checks that copy
  against `THEME_PALETTES` and `STORAGE_KEYS`, keeps working once it reads the
  new file instead of extracting the script from `index.html`.
- **The inline module script in `auth/redirect.html` stays where it is and
  needs no hash**, because measurement 2 above shows that it is never inline in
  a browser. The callback policy is simply `script-src 'self'`.
- **Google Fonts stay on Google's servers.** Self-hosting the fonts was
  considered and is recorded in `plans/README.md` as an investigate-first
  option because changing font delivery risks the visual design. The policy
  therefore allows `https://fonts.googleapis.com` for styles and
  `https://fonts.gstatic.com` for font files. If fonts are self-hosted later,
  both hosts can be deleted from the policy.
- **Inline `style` attributes stay, allowed by `style-src-attr 'unsafe-inline'`.**
  This keeps `style-src` itself free of `'unsafe-inline'`, so an injected
  `<style>` element is still blocked. A browser too old to understand
  `style-src-attr` falls back to `style-src` and loses only the swatch colours
  and the card animation stagger, which is cosmetic.
- **`connect-src` uses four Azure wildcard host patterns, and Target URI
  validation is not changed in this plan.** The patterns cover the public-cloud
  hosts that Azure OpenAI, Azure AI Foundry, and the Speech service hand out:
  `https://*.cognitiveservices.azure.com`, `https://*.openai.azure.com`,
  `https://*.services.ai.azure.com`, and
  `https://*.api.cognitive.microsoft.com`. Because validation accepts any HTTPS
  host (measurement 9), the policy is deliberately narrower than validation. A
  Target URI on a sovereign cloud (`*.azure.us`, `*.azure.cn`), a custom
  domain, or a private endpoint name will show "✓ Valid HTTPS" in Settings and
  then fail at request time as a generic network error. This plan documents
  that limit in `README.md`; teaching the Settings badge about the allowed
  hosts is a separate behaviour change and is listed under "Maintenance notes"
  as a deferred follow-up.

### The exact policies to ship

For `index.html`, written here one directive per line for reading. In the file
it is a single `content` attribute value; line breaks inside the attribute are
allowed by the CSP parser, so keep this layout for readability.

```
default-src 'none';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
style-src-attr 'unsafe-inline';
font-src https://fonts.gstatic.com;
img-src 'self' data:;
media-src blob:;
worker-src 'self';
connect-src 'self' https://login.microsoftonline.com https://*.cognitiveservices.azure.com https://*.openai.azure.com https://*.services.ai.azure.com https://*.api.cognitive.microsoft.com;
frame-src 'self' https://login.microsoftonline.com;
base-uri 'none';
form-action 'none'
```

For `auth/redirect.html`:

```
default-src 'none';
script-src 'self';
connect-src 'self';
base-uri 'none';
form-action 'none'
```

`connect-src 'self'` is present on both pages because Vite's module-preload
polyfill fetches same-origin chunks in browsers without native support, and
because the `npm start` dev server uses a same-origin WebSocket for hot reload.

### Repository conventions that apply

- The project's vocabulary is defined in `CONTEXT.md`. Use "Target URI" for the
  user-entered Azure endpoint and "User" (capitalised) for the person. Do not
  edit `CONTEXT.md`.
- Public files must never contain a real tenant or client identifier, a real
  Target URI, a token, or a screenshot that shows an identity. The policy above
  contains only public wildcard hosts, which is fine.
- Unit tests are `tests/<name>.vitest.js`, use Vitest with Happy DOM, and read
  source files with `readFileSync`. Model new tests on
  `tests/vite-build.vitest.js` (for build output) and on the "Anti-FOUC
  bootstrap script" block in `tests/palette-themes.vitest.js` (for parsing
  `index.html`).
- Indentation is four spaces in HTML and JavaScript. ESLint covers
  `js/**/*.js`, `tests/**/*.{js,mjs}`, and `*.config.js`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| One test file | `npx vitest run tests/content-security-policy.vitest.js` | all pass |
| Full unit suite | `npm test` | all pass |
| Coverage gate | `npm run test:coverage` | exit 0, thresholds 85/80/70/85 met |
| Lint | `npm run lint` | exit 0 |
| Dependency gates | `npm run deps:check` and `npm run deps:check:prod` | exit 0 |
| Production build | `npm run build` | exit 0, writes `dist/` |
| Size budgets | `npm run size` | exit 0 (run after `npm run build`) |
| Deterministic browser suite | `npm run test:browser` | all Chromium specs pass |

Do **not** run `npm run test:browser:live`. It can call Azure, it can cost
money, and it requires a fresh human approval that this plan does not carry.

## Scope

**In scope** (the only files you should modify or create):

- `public/theme-bootstrap.js` (create; the moved theme script)
- `index.html` (replace the inline theme script with one `<script src>` tag, and add one meta tag; change nothing else)
- `auth/redirect.html` (add one meta tag; change nothing else)
- `vite.config.js` (add one small plugin that applies only in `browser-test` mode)
- `tests/palette-themes.vitest.js` (point the "Anti-FOUC bootstrap script" block at the new file; change nothing else)
- `tests/content-security-policy.vitest.js` (create)
- `tests/vite-build.vitest.js` (add one test)
- `tests/browser/transcription-smoke.spec.js` (add a violation listener and one assertion)
- `docs/keyless-operator-runbook.md` (correct one sentence; add a short CSP note)
- `README.md` (add a short security note about the policy and its host limit)
- `CLAUDE.md` (add two sentences to "Build and callback boundary")
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- The logic of the theme script. Move it exactly as it is, apart from removing
  one level of indentation. Do not rename keys, reorder the palette list, or
  "tidy" the code.
- `js/api-client.js` and `js/settings.js`. Target URI validation stays
  HTTPS-only in this plan.
- `js/authentication-config.js`, `js/authentication-service.js`, and anything
  else under `js/`. No production JavaScript changes are needed.
- The inline `style` attributes and `css/styles.css`.
- Font delivery. Do not self-host fonts here.
- `CONTEXT.md`, `docs/adr/`, and `.github/workflows/`.
- The sibling project Vocalis. See "Maintenance notes".

## Git workflow

- Create the branch `advisor/056-content-security-policy` from `main`.
- Use conventional commits, one per logical unit. Examples from this
  repository's history: `fix(size): retighten authentication budget to the
  measured 55 kB ceiling` and `docs(plans): record audit batch 048-054 as DONE
  (PRs #134, #135)`. Suggested messages here:
  `feat(security): add Content-Security-Policy meta to both HTML entries`,
  `refactor(theme): move the anti-flash theme script into public/theme-bootstrap.js`,
  `test(security): pin the CSP directives`,
  `docs(runbook): correct MSAL cache location to localStorage`.
- Husky runs lint before each commit and coverage plus `deps:check:prod`
  before a push. Do not bypass the hooks.
- Do NOT push or open a pull request unless the operator tells you to.

## Steps

### Step 1: Move the theme script into its own file

Create the directory `public/` at the repository root (it does not exist yet)
and create `public/theme-bootstrap.js`. Its content is the body of the inline
`<script>` in `index.html` (lines 9 to 30 at the planned commit), moved exactly
as it is, with one change only: remove the eight spaces of indentation that
every line carries because it sat inside `<head>`. The file therefore starts
with `(function () {` at column 0 and ends with `})();` followed by a newline.
Keep every comment, including the two comments that say the keys and values
must match `js/constants.js`.

Then, in `index.html`, replace the whole inline block, from the line
`    <script>` to the line `    </script>` inclusive, with this single line:

```html
    <script vite-ignore src="theme-bootstrap.js"></script>
```

Three details in that line matter. The address is relative, with no leading
`/`, so that it resolves under `/whisper-transcribe/` on GitHub Pages. There is
no `type="module"`, no `async`, and no `defer`, because any of them would make
the script run after the page starts drawing and bring back the theme flash.
The `vite-ignore` attribute tells Vite to leave the tag alone and suppresses a
harmless build warning; Vite removes the attribute from the built page.

**Verify**:

1. `npm run build` exits 0 and prints no line containing `can't be bundled`.
2. `ls dist/theme-bootstrap.js` succeeds.
3. `grep -c '<script src="theme-bootstrap.js"></script>' dist/index.html`
   prints `1`. (Vite leaves two spaces where the attribute was, so if this
   prints `0`, run `grep -c 'src="theme-bootstrap.js"' dist/index.html`
   instead and expect `1`.)
4. `npm run build -- --mode pages` exits 0 and
   `grep -c 'src="theme-bootstrap.js"' dist/index.html` prints `1`. Then run
   `npm run build` again so that `dist/` holds a normal build for later steps.
5. `grep -c "<script>" index.html` prints `0`, which proves that no inline
   classic script remains in the page.

### Step 2: Point the palette guard at the new file

`tests/palette-themes.vitest.js` contains a block named
`describe('Anti-FOUC bootstrap script', ...)` (lines 300 to 322 at the planned
commit). It currently extracts the script from `index.html` with this line:

```js
    const inlineScript = indexSource.match(/<script>([\s\S]*?)<\/script>/u)?.[1] || '';
```

Replace that line so that the block reads the new file instead, and rename the
variable to match:

```js
    const bootstrapScript = readFileSync('public/theme-bootstrap.js', 'utf8');
```

Update the two uses of `inlineScript` in the same block to `bootstrapScript`,
and change the block's doc comment from "The inline script in index.html" to
"public/theme-bootstrap.js". `readFileSync` is already imported at the top of
the file (line 12). Change nothing else in this test file.

Add one new case to the same block, which proves that `index.html` still loads
the script the right way:

```js
    it('is loaded from index.html as a blocking classic script', () => {
        expect(indexSource).toMatch(/<script vite-ignore src="theme-bootstrap\.js"><\/script>/u);
    });
```

**Verify**: `npx vitest run tests/palette-themes.vitest.js` → all pass,
including the new case. As a check that the guard still guards, temporarily
delete `'broadsheet'` from the list in `public/theme-bootstrap.js`, rerun the
command, confirm that the "repeats THEME_PALETTES exactly" case fails, and then
restore the file. `git diff public/theme-bootstrap.js` must show no change from
your Step 1 version afterwards.

### Step 3: Add the policy to `index.html`

Insert the meta tag immediately after `<meta charset="UTF-8">` on line 4, so
that it comes before the theme script tag and before every resource-loading
tag. A policy only governs elements that the browser reaches after it.

```html
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src 'self';
        style-src 'self' https://fonts.googleapis.com;
        style-src-attr 'unsafe-inline';
        font-src https://fonts.gstatic.com;
        img-src 'self' data:;
        media-src blob:;
        worker-src 'self';
        connect-src 'self' https://login.microsoftonline.com https://*.cognitiveservices.azure.com https://*.openai.azure.com https://*.services.ai.azure.com https://*.api.cognitive.microsoft.com;
        frame-src 'self' https://login.microsoftonline.com;
        base-uri 'none';
        form-action 'none'">
```

Do not alter any other line of `index.html`.

**Verify**: `grep -c 'http-equiv="Content-Security-Policy"' index.html` prints
`1`, and `grep -c "sha256-" index.html` prints `0`.

### Step 4: Add the policy to `auth/redirect.html`

Insert this immediately after `<meta charset="UTF-8">`:

```html
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'">
```

Do not move or edit the inline module script in this file. Vite turns it into
a separate file during the build, so the built page has no inline script.

**Verify**: `npm run build` exits 0, and then
`grep -c "<script type=\"module\">" dist/auth/redirect.html` prints `0` while
`grep -c "Content-Security-Policy" dist/auth/redirect.html dist/index.html`
prints `1` for each file. A count of `0` inline module scripts confirms that
the built callback page has no inline script for the policy to block.

### Step 5: Pin the policy with a unit test

Create `tests/content-security-policy.vitest.js`. Follow the style of the
"Anti-FOUC bootstrap script" block in `tests/palette-themes.vitest.js`: read
the two HTML source files with `readFileSync`, extract the `content` attribute
of the CSP meta tag with a regular expression, and split it on `;` into a map
from directive name to an array of source tokens (trim whitespace, drop empty
entries). Write these cases:

1. In `index.html`, the CSP meta tag appears before the first `<script` and
   before the first `<link`. Compare string indexes.
2. The directive map for `index.html` equals exactly the twelve directives
   listed in "The exact policies to ship". Use `toEqual` on the whole map so
   that a silently added directive or host fails the test.
3. `index.html` contains no inline script: every `<script` tag in the file has
   a `src` attribute. This is what lets `script-src` stay at `'self'` alone,
   and it stops someone from quietly adding a new inline script that the
   policy would then block in the browser.
4. No directive in either file contains `'unsafe-eval'`, a bare `*`, `http:`,
   or `data:` inside `script-src`; neither `script-src` nor `style-src`
   contains `'unsafe-inline'`; and neither contains a `sha256-` value.
5. Neither policy contains `frame-ancestors`, `report-uri`, `report-to`, or
   `sandbox`, because browsers ignore them in a meta tag and their presence
   would mislead a reader.
6. The directive map for `auth/redirect.html` equals exactly the five
   directives listed above.
7. `connect-src` and `frame-src` in `index.html` both contain
   `https://login.microsoftonline.com`, and the same origin is the prefix of
   the authority built by `createAuthenticationConfig` from
   `js/authentication-config.js`. Call it with placeholder arguments, for
   example `{ clientId: '00000000-0000-4000-8000-000000000001', tenantId:
   '00000000-0000-4000-8000-000000000002', origin: 'https://example.invalid',
   basePath: '/' }`. Look first at `tests/authentication-service.vitest.js`,
   which already calls `createAuthenticationConfig`, and copy the placeholder
   identifiers that it uses.

**Verify**: `npx vitest run tests/content-security-policy.vitest.js` → all
seven cases pass. Then run `npm run lint` → exit 0.

### Step 6: Let the deterministic browser build reach its local stubs

Measurement 10 explains why the unmodified policy would break
`npm run test:browser`. Add a small Vite plugin to `vite.config.js` that only
does something in `browser-test` mode. The target shape is:

```js
const browserTestConnectSources = 'https://127.0.0.1:4174 https://target.invalid';

export default defineConfig(({ mode }) => ({
    base: mode === 'pages' ? '/whisper-transcribe/' : '/',
    plugins: [browserTestContentSecurityPolicy(mode)],
    // ...the existing resolve and build keys, unchanged
}));

/**
 * The deterministic Chromium suite sends transcription requests to a local
 * HTTPS stub and to a reserved .invalid host. Those destinations are added to
 * connect-src only in browser-test mode and never reach a production bundle.
 */
function browserTestContentSecurityPolicy(mode) {
    return {
        name: 'browser-test-content-security-policy',
        transformIndexHtml(html) {
            return mode === 'browser-test'
                ? html.replace("connect-src 'self'", `connect-src 'self' ${browserTestConnectSources}`)
                : html;
        }
    };
}
```

Then add one test to the `describe('Vite build contract', ...)` block in
`tests/vite-build.vitest.js`, following the existing tests there, which run
`npm run build` with `execFileSync` and read `dist/`. The new test asserts
that the production `dist/index.html` and `dist/auth/redirect.html` each
contain `Content-Security-Policy`; that neither contains `127.0.0.1` or
`target.invalid`; that `dist/theme-bootstrap.js` exists; and that
`dist/index.html` references it with a relative `src="theme-bootstrap.js"`.

**Verify**: `npx vitest run tests/vite-build.vitest.js` → all pass, including
the new test. `npm run lint` → exit 0.

### Step 7: Make the Chromium smoke test the policy canary

In `tests/browser/transcription-smoke.spec.js`, directly before the existing
`await page.goto('/');` call (line 62 at the planned commit), register an init
script that records every CSP violation:

```js
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', event => {
            window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
    });
```

Next to the existing `expect(consoleErrors).toEqual([]);` assertion near the
end of the test (line 176 at the planned commit), add:

```js
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
```

This test already records a microphone capture, runs the encode Worker, loads
the fonts stylesheet route, and posts to the HTTPS stub, so it exercises
`worker-src`, `style-src`, `script-src`, and `connect-src` in one pass.

**Verify**: `npm run test:browser` → every Chromium spec passes. If a spec
fails with a message that names a blocked URI or a violated directive, read
the STOP conditions before you change the policy.

### Step 8: Correct the runbook, and check the other documents

In `docs/keyless-operator-runbook.md`, replace the sentence at lines 158 to 160
with:

```markdown
`AuthenticationService` derives `/auth/redirect.html`, uses full-page redirects,
and configures MSAL's cache in `localStorage` so that a new same-origin tab can
discover the shared account (see
`docs/adr/0002-share-msal-cache-across-tabs.md`). MSAL's temporary OAuth
artifacts remain tab-scoped under its default behaviour. The callback must
remain a separate Vite entry and run only `broadcastResponseToMainFrame`.
```

Directly below the bullet list that follows it (the list that ends with "no
application bootstrap, Azure call, storage read, source map, or test/live
authentication provider in the production artifact"), add one paragraph which
says, in full sentences: both HTML entries carry a Content-Security-Policy meta
tag because GitHub Pages cannot send response headers; the callback policy
allows only same-origin scripts; the redirect bridge communicates through a
`BroadcastChannel`, which the policy does not restrict; and an operator who
verifies the callback should confirm that the browser console shows no
Content-Security-Policy violation.

Then run the search below and read every hit. Correct any other sentence that
claims MSAL's durable cache is in `sessionStorage`. Leave alone the sentences
that say audio blobs, tokens, or transcripts are not placed in
`sessionStorage`, because those are true.

```bash
grep -rn -i "sessionStorage" docs/keyless-operator-runbook.md README.md CLAUDE.md spec/
```

At the planned commit, the only stale hit in the runbook and the README is
runbook line 159. `README.md` line 63 is a true statement about audio blobs.
Hits under `spec/` were not audited by the advisor; read each one, fix it only
if it makes the same false claim about MSAL's durable cache, and list in your
report every file you changed for this reason. `docs/adr/0002-...md` mentions
`sessionStorage` as history and must not be edited.

In `README.md`, inside the "Privacy and storage" section, add one bullet which
says: the pages ship a Content-Security-Policy that allows scripts only from
the application's own origin; network requests are allowed only to Microsoft
sign-in and to Azure hosts matching `*.cognitiveservices.azure.com`,
`*.openai.azure.com`, `*.services.ai.azure.com`, and
`*.api.cognitive.microsoft.com`; and a Target URI on any other host passes the
HTTPS check in Settings but is blocked by the browser when a transcription is
sent.

In `CLAUDE.md`, at the end of the "Build and callback boundary" section, add
two sentences: both HTML entries carry a CSP meta tag that is pinned by
`tests/content-security-policy.vitest.js`, and the policy allows scripts only
from the application's own origin; and the anti-flash theme script lives in
`public/theme-bootstrap.js` and must stay a blocking classic script, so no
inline script may be added to `index.html`.

**Verify**:
`grep -n "sessionStorage" docs/keyless-operator-runbook.md` → no output.
`grep -c "localStorage" docs/keyless-operator-runbook.md` → at least `1`.

### Step 9: Run every gate

Run, in this order: `npm run lint`, `npm run test:coverage`,
`npm run deps:check`, `npm run deps:check:prod`, `npm run build`,
`npm run size`, `npm run test:browser`.

**Verify**: every command exits 0. `npm run size` must report all three
budgets within their limits. The moved theme script is copied from `public/`
and is not one of the budgeted `dist/assets/` chunks, so a budget failure means
something outside the plan changed and is a STOP condition.

### Step 10: Hand the live verification to the operator

You cannot perform this step, because it needs a real Microsoft sign-in and
real Azure Target URIs, and it is human-gated by the repository's rules. Write
the checklist below into your final report so that the operator can run it
against `npm run build && npm run preview` (`http://127.0.0.1:4176`) first and
against the deployed Pages site after the merge. Set this plan's status to
`IN REVIEW (awaiting operator CSP verification)` and not to `DONE`.

The operator keeps the browser's developer console open for the whole session,
filters it for "Content Security Policy", and confirms that it stays empty
through each of these actions:

1. Load the page while signed out. The fonts render (Andika for text,
   JetBrains Mono for the timer), the palette swatches show their colours, and
   the noise texture is visible.
2. Choose **Continue with Microsoft** and complete the full-page redirect
   sign-in. The application returns to the ready state and the initials badge
   appears.
3. Exercise silent token acquisition in both of its forms. First, open the
   application in a new tab; it should start in the ready state from the shared
   cache. Second, leave a tab open for longer than the access token lifetime
   (roughly sixty to ninety minutes) and then transcribe again, which forces
   `acquireTokenSilent` to renew, through the hidden iframe if MSAL needs it.
   This is the action that proves `frame-src`.
4. Record a short clip and transcribe it with the Whisper adapter.
5. Do the same with the MAI-Transcribe 1.5 adapter.
6. Do the same with the GPT Transcribe adapter.
7. Upload an audio file as Selected Audio and transcribe it, which proves
   `media-src blob:`.
8. Sign out, and confirm that the full-page sign-out redirect completes.

The operator records only sanitized outcomes (date, browser and version, origin
label, model, pass or fail). They never record a Target URI, an identifier, a
token, or a screenshot that shows an identity. If any Target URI host is
blocked, the operator reports only the host's suffix pattern (for example
"a `*.azure.us` host"), so that the pattern list can be extended deliberately.

## Test plan

- The existing "Anti-FOUC bootstrap script" guard in
  `tests/palette-themes.vitest.js` now reads `public/theme-bootstrap.js`, and
  gains one case proving that `index.html` loads that file as a blocking
  classic script (Step 2).
- New file `tests/content-security-policy.vitest.js` with the seven cases from
  Step 5. Structural pattern: the "Anti-FOUC bootstrap script" block in
  `tests/palette-themes.vitest.js`.
- One new case in `tests/vite-build.vitest.js`: the production build carries
  the policy, ships `theme-bootstrap.js` with a relative reference, and
  contains neither browser-test host.
- One new assertion in `tests/browser/transcription-smoke.spec.js`: zero
  `securitypolicyviolation` events across a full record, encode, send, and
  transcript cycle.
- Verification: `npm test` → all pass, including 9 new Vitest cases;
  `npm run test:browser` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c 'http-equiv="Content-Security-Policy"' index.html auth/redirect.html` prints `1` for each file.
- [ ] `public/theme-bootstrap.js` exists, `grep -c "<script>" index.html` prints `0`, and `grep -c "sha256-" index.html` prints `0`.
- [ ] `git diff 683c4b5 -- index.html` shows only two kinds of change: the new meta tag added, and the inline theme script block replaced by the single `<script vite-ignore src="theme-bootstrap.js"></script>` line.
- [ ] `npx vitest run tests/palette-themes.vitest.js` passes, including the new loading case.
- [ ] `npx vitest run tests/content-security-policy.vitest.js` passes with 7 cases.
- [ ] `npm run lint`, `npm run test:coverage`, `npm run deps:check`, `npm run deps:check:prod`, `npm run build`, `npm run size`, and `npm run test:browser` all exit 0.
- [ ] After `npm run build`, `grep -c "127.0.0.1\|target.invalid" dist/index.html` prints `0`.
- [ ] `grep -n "sessionStorage" docs/keyless-operator-runbook.md` prints nothing.
- [ ] `git status` shows no modified file outside the in-scope list.
- [ ] The `plans/README.md` row for 056 reads `IN REVIEW (awaiting operator CSP verification)`, and the final report contains the Step 10 checklist.

## STOP conditions

Stop and report back (do not improvise) if any of these happen:

- The inline theme script in `index.html` no longer matches the excerpt in
  "Current state" (for example, a palette was added), or a second inline
  script has appeared in `index.html`. Report what you found before moving
  anything.
- The theme flash returns after the move: with dark mode and a non-Coastal
  palette saved, a reload of the built site shows the default colours first.
  Do not respond by adding `defer`, `async`, or `type="module"`, which make it
  worse; report it.
- `dist/auth/redirect.html` contains an inline `<script type="module">` after a
  build. The assumption that Vite externalises the callback script would be
  false, and the callback policy would break sign-in.
- A browser spec reports a CSP violation for a directive or URI that this plan
  does not mention. Report the violated directive and the blocked URI. Do not
  respond by adding `'unsafe-inline'`, `'unsafe-eval'`, `*`, `blob:` in
  `script-src` or `worker-src`, or a wider host pattern.
- Making a test pass appears to require a change to any file under `js/`, to
  the logic of the theme script, or to `css/styles.css`.
- `npm run size` fails.
- A verification fails twice after a reasonable attempt to fix it.
- Anyone asks you to run `npm run test:browser:live` or to sign in to a real
  tenant. Those actions are reserved for the operator.

## Maintenance notes

- **Share the final policy with Vocalis.** A sibling application named Vocalis
  (its repository is currently `github.com/ahmedmuhi/lector` and is due to be
  renamed) copies Whisper Transcribe's authentication files, including the
  `localStorage` MSAL cache and the `/auth/redirect.html` callback. It
  therefore has the same token-theft exposure and needs the same policy. Once
  the operator verification in Step 10 has passed, the two policies and
  `tests/content-security-policy.vitest.js` should be carried over to that
  project. The callback policy carries over unchanged. In the application
  policy the part most likely to differ is the list of Azure host patterns in
  `connect-src`, which depends on which services that project calls. If
  Vocalis also has an inline script in its page, the same choice applies
  there: move it into a file under `public/` so that `script-src` can stay
  `'self'`. This plan does not touch the Vocalis repository.
- **The theme script now lives in `public/theme-bootstrap.js`.** Adding a
  palette, as Plan 055 did, still means updating the typed palette list in
  that file, and the guard in `tests/palette-themes.vitest.js` still fails if
  that is forgotten. It is outside the `npm run lint` globs (`js/**`,
  `tests/**`, `*.config.js`); extending lint to `public/**/*.js` is a small
  optional follow-up. Nobody may add an inline `<script>` back into
  `index.html`, because the policy would block it; the CSP test fails if one
  appears.
- **Adding a model adapter** (see the adapter-addition checklist in
  `spec/spec-design-api-client.md`) now includes checking that the new
  service's host matches one of the four `connect-src` patterns. That
  checklist is a natural place for a future one-line reminder.
- **Deferred follow-up, a decision for Ahmed:** the Settings badge says
  "✓ Valid HTTPS" for a host that the policy will block. A later plan could
  give the `.uri-badge` a further state for a host that is outside the allowed
  patterns. That is a behaviour and copy change in `js/settings.js` and
  `js/constants.js` with broad test impact, which is why it is not folded into
  this plan.
- **Deferred follow-up:** self-hosting the two font families would remove
  `https://fonts.googleapis.com` and `https://fonts.gstatic.com` from the
  policy and remove a third-party request from every cold load.
- **What a meta policy cannot do.** `frame-ancestors` is ignored in a meta tag,
  so the policy gives no clickjacking protection, and there is no violation
  reporting endpoint. Both would need a host that can send response headers.
- **Upgrading MSAL** can change the hosts it contacts or how the hidden iframe
  behaves. Add the Step 10 checklist to the regression work that `CLAUDE.md`
  already requires for any MSAL upgrade.
- **Under `npm start`**, Vite's error overlay injects an inline `<style>` that
  the policy blocks, so the overlay may appear unstyled. That affects local
  development only, and it is not a reason to loosen `style-src`.
- **A reviewer should scrutinise** four things: that the meta tag is the
  second element in `<head>`; that `public/theme-bootstrap.js` is the old
  inline script moved verbatim apart from indentation, loaded by a plain,
  relative, blocking `<script src>`; that the `browser-test` hosts cannot reach
  a production or Pages build; and that no directive was widened to make a
  test pass.
