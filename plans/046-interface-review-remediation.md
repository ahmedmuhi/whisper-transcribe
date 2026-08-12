# Plan 046: Remediate the ten interface-review findings (focus rings, contrast, type floors, copy)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b4597f2..HEAD -- css/styles.css index.html js/constants.js js/ui.js js/settings.js js/auth-interaction-controller.js js/permission-manager.js CLAUDE.md tests/auth-recovery.vitest.js tests/settings-persistence.vitest.js tests/settings-unit.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (accessibility) + dx (copy consistency)
- **Planned at**: commit `b4597f2`, 2026-08-12

## Why this matters

A cross-discipline interface review (better-interface skill, full mode,
2026-08-12) found two WCAG blockers and eight smaller defects. Blocker one:
the app's main controls (Start/Done, Pause, Discard, Retry, Upload, Grab,
Restore) have a keyboard focus indicator measured at ≈1.29:1 composited —
effectively invisible (WCAG 2.4.11). Blocker two: the `--text-muted` token is
used as a text colour on meaningful text and controls, measuring 2.69–2.88:1
in light mode and 3.32–3.86:1 in dark mode — all below the WCAG AA 4.5:1
floor. The remaining findings are sub-12px informational text, sub-16px
inputs that trigger iOS focus zoom, an inconsistent "log out"/"sign out"
vocabulary, emoji-prefixed error messages, a ~17px-tall hit target, a
`transition: all`, a dialog body that restates its title, and one title-case
label. All ten fixes follow patterns that already exist in the same files.

## Current state

Files and roles:

- `css/styles.css` — the whole design system (tokens at :8–:94, dark theme
  :60–:94). Findings 1, 2, 3, 4, 7, 8 live here.
- `index.html` — static shell, dialogs, settings modal. Findings 5, 9, 10.
- `js/constants.js` — `MESSAGES` object at :437. Findings 5, 6.
- `js/ui.js` — UI controller; `:1159` holds the discard-body fallback string
  (finding 9).
- `js/settings.js` — `:269` creates the "System Default" option (finding 10).
- `js/auth-interaction-controller.js` — `:18–:19` hold the logout-discard
  dialog strings (finding 5).
- `js/permission-manager.js` — `:391` composes a 🚫-prefixed message
  (finding 6).
- `CLAUDE.md` — `:149–:150` describe the logout dialog with "log out"
  wording (finding 5, doc consistency).
- `tests/auth-recovery.vitest.js` — `:284–:285`, `:346–:348`, `:546–:547`
  pin the exact logout-discard strings (finding 5 — must change with the
  source).
- `tests/settings-persistence.vitest.js` `:55` and
  `tests/settings-unit.vitest.js` `:36` — fixtures containing
  `<option value="">System Default</option>` (finding 10 — update for
  consistency; no assertion reads the text).

Key excerpts as of `b4597f2`:

```css
/* css/styles.css:519 — finding 1 (the halo-only focus ring) */
.btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
}
/* css/styles.css:698 — same defect on Grab/Restore */
.clear-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
}
/* css/styles.css:1639-1654 — the CORRECT pattern already in the file:
   "Solid 2px accent outline (mock behavior): the translucent --focus-ring halo
    alone is ~1.2:1 against the surface and fails WCAG 2.4.11" */
#quick-settings-button:focus-visible,
/* ...selector list... */ {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    box-shadow: var(--focus-ring);
}
```

```css
/* css/styles.css:591-595 — finding 2, one of six text uses of --text-muted */
.btn-discard {
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
}
/* The correct substitute token already exists and is already used this way:
   css/styles.css:289-293 (.status) — "Accessible AA token — replaces
   --text-muted, which fails contrast here." --status-text measures 6.5:1
   light / 9.0:1 dark and is guarded by tests/status-tokens.vitest.js. */
```

```js
// js/constants.js:440-446 — finding 6 (emoji-prefixed errors)
PERMISSION_DENIED: '🚫 Microphone permission denied. Please allow microphone access.',
NO_MICROPHONE: '🎤 No microphone found. Please connect a microphone.',
MICROPHONE_ERROR_PREFIX: '❌ Error accessing microphone: ',
// ...
TARGET_URI_NOT_CONFIGURED: '⚙️ Please configure an Azure Target URI first',
```

```js
// js/auth-interaction-controller.js:17-20 — finding 5
    message: 'Discard the Unsent Recording and log out?',
    confirmLabel: 'Discard recording and log out'
```

Repo conventions that apply:

- Design tokens only — never introduce a raw hex where a token exists.
  Status colours must come from the tested AA tokens (`--status-text`,
  `--status-error`, `--status-success`), per `CLAUDE.md`.
- User-facing strings live in `js/constants.js` `MESSAGES` where they are
  shared; the HTML holds static copy. Do not move strings between the two as
  part of this plan.
- CSS structural tests exist and parse `css/styles.css` with regexes:
  `tests/island-layout-css.vitest.js`, `tests/mic-button-effects.vitest.js`,
  `tests/status-tokens.vitest.js`, `tests/color-constants-sync.vitest.js`.
  If one fails after a CSS edit, read the test — it usually names the
  intended contract.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Tests | `npm test` | all pass (36 files, ~400 tests) |
| One test file | `npx vitest run tests/<name>.vitest.js` | all pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0, writes `dist/` |

Do NOT run `npm run test:browser:live` (billable, human-gated).

## Scope

**In scope** (the only files you should modify):

- `css/styles.css`
- `index.html`
- `js/constants.js`
- `js/ui.js` (only line ~1159, the discard fallback string)
- `js/settings.js` (only line ~269, the option label)
- `js/auth-interaction-controller.js` (only lines ~17–20)
- `js/permission-manager.js` (only line ~391)
- `js/settings-surface.js` (only the three "logging out" strings, ~:362–:368)
- `CLAUDE.md` (only lines ~149–150)
- `tests/auth-recovery.vitest.js` (only the pinned logout strings)
- `tests/settings-surface.vitest.js` (only the pinned "logging out" strings)
- `tests/settings-persistence.vitest.js`, `tests/settings-unit.vitest.js`
  (only the "System Default" fixture text)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `css/styles.css:99` `.island-record-dot` paused state
  (`background: var(--text-muted)`) — that is a decorative *background*, not
  text, and `tests/island-layout-css.vitest.js:99` pins it. Leave it.
- `--text-muted` uses for placeholder colour
  (`.settings-search input::placeholder`, `.settings-search svg`) — deferred;
  not part of the review's finding.
- The `--text-muted` token definition itself — do not darken the token;
  change the six call sites listed in Step 2 instead (other uses are
  decorative).
- Auth flow logic, MSAL, adapters, the FSM — nothing behavioural changes in
  this plan beyond string values.
- `spec/`, `plan/2.0-design.md`, `docs/` — no doc sweep; only the two
  CLAUDE.md lines named above.

## Git workflow

- Branch: `advisor/046-interface-review-remediation`
- Commit per step or per logical unit; imperative-mood messages matching
  `git log` style (e.g. "Give the island and transcript buttons a visible
  focus ring").
- Do NOT push, merge, or open a PR.

## Steps

### Step 1: Make the focus ring visible on `.btn` and `.clear-btn` (finding 1, HIGH)

In `css/styles.css`, change the two halo-only rules to the same solid-ring
pattern the file already uses at :1642:

```css
.btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    box-shadow: var(--focus-ring);
}
```

and identically for `.clear-btn:focus-visible` (:698). Keep `box-shadow`;
only replace `outline: none` with the solid outline + offset.

**Verify**: `grep -A3 '^\.btn:focus-visible' css/styles.css` shows
`outline: 2px solid var(--accent)`; same for `.clear-btn:focus-visible`.
Then `npx vitest run tests/island-layout-css.vitest.js tests/mic-button-effects.vitest.js` → all pass.

### Step 2: Replace `--text-muted` with `--status-text` at the six failing text sites (finding 2, HIGH)

In `css/styles.css`, change `color: var(--text-muted)` to
`color: var(--status-text)` in exactly these rules:

1. `.btn-discard` (~:594)
2. `.transcript-empty-hint` (~:801)
3. `.quick-settings-footer kbd` (~:1128)
4. `#settings-close` (~:1474) — icon-only control, same root cause
5. `.settings-no-results` (~:1495)
6. `.settings-row-subtitle` (~:1527)
7. `.uri-badge--muted` (~:1598)

8. `.settings-row-chip` (~:1538) — real 0.75rem category-chip text on
   `--bg-inset`, measured 2.69:1 light / 3.32:1 dark (added by the
   2026-08-12 adversarial review of the first execution pass; the original
   plan misclassified it as decorative)

(Eight rules; the review consolidated #settings-close and the chip into the
same finding.) Do not touch any other `--text-muted` use — the remaining
ones (record dot background ~:435, search svg ~:1350, search placeholder
~:1366) are genuinely decorative or deferred.

**Verify**: this inline check passes for both themes:

```bash
node -e "
function lum(h){const c=h.match(/[0-9a-f]{2}/gi).map(v=>{let n=parseInt(v,16)/255;return n<=0.03928?n/12.92:((n+0.055)/1.055)**2.4});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
function cr(a,b){const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)}
const pairs=[['5C5E5D','FFFFFF'],['5C5E5D','FAF7F2'],['B9C6CB','14252C'],['B9C6CB','1B313A']];
const bad=pairs.filter(p=>cr(p[0],p[1])<4.5);
console.log(bad.length===0?'PASS':'FAIL '+JSON.stringify(bad));"
```
→ prints `PASS`. Then `npx vitest run tests/status-tokens.vitest.js` → all pass.

### Step 3: Raise sub-12px text to a 0.75rem floor (finding 3, MEDIUM)

In `css/styles.css`, set `font-size: 0.75rem` in:

1. `.auth-context-note` (~:402, currently `0.68rem`)
2. `.selected-audio-eyebrow` (~:843, currently `0.65rem`)
3. `.selected-audio-file-copy small, .selected-audio-note` (~:896, currently `0.64rem`)
4. `.selected-audio-verdict, .selected-audio-progress` (~:905, currently
   `0.72rem`) — the error/progress text, same root cause
5. `.quick-settings-footer kbd` (~:1127, currently `0.6875rem`)

**Verify**: `grep -n '0\.6[0-9]*rem\|0\.72rem' css/styles.css` → no matches.

### Step 4: Keep input text at 16px on narrow viewports (finding 4, MEDIUM)

In `css/styles.css`:

- In the `@media (max-width: 600px)` block (~:1713), change
  `.transcript-content { font-size: 0.9rem; ... }` to `font-size: 1rem;`.
- In the `@media (max-width: 760px)` block (~:1791), add:

```css
    .settings-row select,
    .settings-row input[type="url"],
    .settings-search input,
    .quick-settings-field select {
        font-size: 1rem;
    }
```

Desktop sizes stay as they are.

**Verify**: `npm run build` → exit 0. Visually plausible check:
`grep -c 'font-size: 1rem' css/styles.css` → at least 2.

### Step 5: Unify on "sign out" everywhere (finding 5, MEDIUM)

Replace the "log out" vocabulary with "sign out" in exactly these places:

- `index.html:414` → `Continue to sign out`
- `index.html:415` → `Discard recording and sign out`
- `js/constants.js:475` → `LOGOUT_FAILED: 'Sign out could not be completed. Try again.',`
- `js/constants.js:242` (JSDoc) → `Discard the Unsent Recording and sign out`
- `js/auth-interaction-controller.js:18` → `message: 'Discard the Unsent Recording and sign out?',`
- `js/auth-interaction-controller.js:19` → `confirmLabel: 'Discard recording and sign out'`
- `tests/auth-recovery.vitest.js:284-285`, `:347-348`, `:546-547` → update
  the same three strings to match
- `CLAUDE.md:149-150` → "Continue to sign out" / "Discard recording and sign
  out"

Also sweep the "logging out" inflection (found by the 2026-08-12 adversarial
review — the `log out` grep cannot match it):

- `js/settings-surface.js:362` → `Protect the Unsent Recording before signing out.`
- `js/settings-surface.js:366` → `Finish or discard the recording before signing out.`
- `js/settings-surface.js:368` → `Remove Selected Audio before signing out.`
- `tests/settings-surface.vitest.js:478`, `:549`, `:550` → update the pinned
  expectations to the new strings (do not loosen them)

Keep constant *names* (`LOGOUT_FAILED`, `LOGOUT_DISCARD`, `#logout-dialog`,
CSS class names) unchanged — this is a copy change, not a rename. The
section-divider comment `/* ---- log out */` at `js/settings-surface.js:351`
may stay or be renamed; it is not user-facing.

**Verify**:
`grep -rn 'log out\|logging out\|logged out' js/ index.html tests/ | grep -v node_modules | grep -v 'dialog outcomes' | grep -v '/\* '`
→ no matches. `npx vitest run tests/auth-recovery.vitest.js tests/settings-surface.vitest.js` → all pass.

### Step 6: Strip emoji from error messages (finding 6, MEDIUM)

- `js/constants.js:440` → `'Microphone permission denied. Please allow microphone access.'`
- `js/constants.js:441` → `'No microphone found. Please connect a microphone.'`
- `js/constants.js:442` → `'Error accessing microphone: '`
- `js/constants.js:446` → `'Please configure an Azure Target URI first'`
- `js/permission-manager.js:391` → `` message: instructions, `` (drop the
  `🚫 ` template prefix; if the surrounding code needs the template literal
  removed, use the plain variable)

**Verify**: `grep -rn '🚫\|🎤\|❌\|⚙️' js/` → no matches. `npm test` → all pass.

### Step 7: Restore a real hit area on `.link-button` (finding 7, MEDIUM)

In `css/styles.css` (~:1136), keep the visual size but give the control a
minimum target:

```css
.link-button {
    display: inline-flex;
    align-items: center;
    padding: 0;
    min-width: 0;
    min-height: 24px;
    border: 0;
    /* ...rest unchanged... */
}
```

(`min-height: 0` becomes `min-height: 24px`; add the flex centering so the
text stays visually where it was.)

**Verify**: `grep -A6 '^\.link-button {' css/styles.css` shows
`min-height: 24px`. `npm test` → all pass.

### Step 8: Enumerate the `.clear-btn` transition (finding 8, LOW)

In `css/styles.css` (~:683), replace
`transition: all var(--transition);` with:

```css
    transition: border-color var(--transition),
                color var(--transition),
                background-color var(--transition);
```

**Verify**: `grep -n 'transition:\s*all' css/styles.css` → no matches.
`npx vitest run tests/mic-button-effects.vitest.js` → all pass.

### Step 9: Make the discard-dialog body add information (finding 9, LOW)

- `index.html:277` → `<p id="discard-dialog-body" class="discard-dialog-body">The audio has not been transcribed and cannot be recovered.</p>`
- `js/ui.js:1159` → change the fallback `'Discard this recording?'` to
  `'The audio has not been transcribed and cannot be recovered.'` (the
  duration branch `"Discard ${durationLabel} of recording?"` stays as is).

**Verify**: `grep -rn 'Discard this recording' index.html js/` → no matches.
`npx vitest run tests/ui-event-bus-proper.vitest.js` → all pass.

### Step 10: Sentence-case "System default" (finding 10, LOW)

- `index.html:349` → `<option value="">System default</option>`
- `js/settings.js:269` → `option.textContent = 'System default';`
- `tests/settings-persistence.vitest.js:55` and
  `tests/settings-unit.vitest.js:36` → update the fixture option text to
  match (the test at `settings-persistence.vitest.js:512` only names it in
  the description; leave descriptions alone).

**Verify**: `grep -rn 'System Default' js/ index.html tests/` → no matches.
`npx vitest run tests/settings-persistence.vitest.js tests/settings-unit.vitest.js` → all pass.

## Test plan

No new test files. The changed behaviour is pinned by existing tests that
must keep passing (`status-tokens`, `island-layout-css`, `mic-button-effects`,
`auth-recovery`, `settings-persistence`, `settings-unit`,
`ui-event-bus-proper`), with the string expectations in `auth-recovery` and
the two settings fixtures updated in Steps 5 and 10. Full gates:

- `npm test` → all pass
- `npm run lint` → exit 0
- `npm run build` → exit 0

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -n 'outline: none' css/styles.css` → no match inside
      `.btn:focus-visible` or `.clear-btn:focus-visible` (other rules may
      legitimately not exist; there were only these two)
- [ ] `grep -rn '🚫\|🎤\|❌\|⚙️' js/` → no matches
- [ ] `grep -rn 'log out\|logging out' js/ index.html tests/` → the only
      matches are the `js/settings-surface.js:351` comment banner and the
      `dialog outcomes` substring false positive in
      `tests/ui-event-bus-proper.vitest.js` — no user-facing copy
- [ ] `grep -n 'transition:\s*all' css/styles.css` → no matches
- [ ] `grep -rn 'System Default' js/ index.html tests/` → the only match is
      the test *description* at `tests/settings-persistence.vitest.js:512`
- [ ] `grep -n 'font-size: 0\.6[0-9]*rem\|font-size: 0\.72rem' css/styles.css`
      → no matches (spacing values like `gap: 0.625rem` are expected to remain)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (waived when a reviewer
      dispatched the executor and maintains the index, per the header note —
      the 2026-08-12 workflow runs operate this way)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows in-scope files changed since `b4597f2` and the
  excerpts above no longer match.
- Any of the four CSS structural test files fails after a Step and the
  failing assertion contradicts this plan's target state (that means the
  plan misread a contract — report, don't weaken the test).
- Step 5 or 10 reveals additional hardcoded "log out"/"System Default"
  strings in files not listed in scope.
- `npm test` fails twice on the same step after a reasonable fix attempt.
- Fixing the `.link-button` hit area visibly breaks the quick-settings
  footer or settings-account layout (flex change misbehaving) — report with
  a description rather than restyling the popover.

## Maintenance notes

- Any future control style must join the solid-ring pattern
  (`css/styles.css:1642` block or the same declarations locally); the halo
  alone is never sufficient.
- `--text-muted` remains in the palette for decorative ink (borders, paused
  dot, placeholder). If it ends up on meaningful text again, that is a
  regression; consider a lint-style CSS test similar to
  `tests/status-tokens.vitest.js` guarding the seven rules from Step 2.
- The review that produced this plan deferred: placeholder contrast in the
  settings search, physical → logical CSS properties (single-locale app),
  and exposing the onboarding empty-state to assistive tech (controls carry
  full names). Revisit only with new evidence.
- Reviewer scrutiny: Step 5's string sweep (three surfaces + tests + doc)
  and Step 4's mobile font sizes (check the settings modal on a narrow
  viewport doesn't reflow badly).
