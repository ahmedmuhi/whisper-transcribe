# Plan 001: Read the dark-theme class from `document.documentElement` everywhere

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3a83f9c..HEAD -- js/ui.js tests/visualization-stop-expanded.vitest.js index.html`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3a83f9c`, 2026-06-11

## Why this matters

The app's dark-theme marker class is **set** on `document.documentElement` (the
`<html>` element) — both by the FOUC-prevention boot script in `index.html` and
by `UI.applyTheme()` — but three places in `js/ui.js` **read** it from
`document.body`, which never receives the class. The result: the live waveform
visualizer is always constructed with `isDarkTheme = false` (it draws the
light-theme blue and clears the canvas to the light background even in dark
mode), and when the theme mode is `auto`, the first click of the theme toggle
can be a visual no-op (it computes the next mode from a check that always
returns false). The fix is to standardize every read on
`document.documentElement` — that is the correct canonical target because the
boot script in `<head>` runs before `<body>` exists.

## Current state

Relevant files:

- `index.html` — inline boot script sets the class on `documentElement` (DO NOT MODIFY; reference only)
- `js/ui.js` — sets the class correctly in `applyTheme()` (line 290), but reads it from `document.body` at lines 111, 246, and 917
- `js/visualization.js` — consumes the flag; `VisualizationController(stream, canvas, isDarkTheme)` picks the waveform colour from it (lines 8–9, 26–29). DO NOT MODIFY; reference only.
- `tests/visualization-stop-expanded.vitest.js` — the "Theme Switching During Visualization" test adds the class to `document.body` (codifying the wrong element) and never asserts the theme argument, so it does not currently enforce anything about theming

Where the class is SET (correct, unchanged):

```js
// index.html:15 (inline boot script in <head>)
document.documentElement.classList.toggle('dark-theme', isDark);
```

```js
// js/ui.js:290 (inside applyTheme())
document.documentElement.classList.toggle('dark-theme', isDark);
```

The three incorrect READS in `js/ui.js`:

```js
// js/ui.js:111 — theme-toggle click handler, computing the next mode from 'auto'
newMode = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
```

```js
// js/ui.js:246 — VISUALIZATION_START handler
const isDarkTheme = document.body.classList.contains('dark-theme');
```

```js
// js/ui.js:917 — clearVisualization()
const isDarkTheme = document.body.classList.contains('dark-theme');
```

The test that must be strengthened (`tests/visualization-stop-expanded.vitest.js:201-224`):

```js
describe('Theme Switching During Visualization', () => {
    it('applies theme correctly to new visualization', async () => {
      // For this test, we need to ensure the VisualizationController uses our mock canvas
      const mockStream = { getAudioTracks: () => [{ kind: 'audio' }] };

      // Mock dark theme
      document.body.classList.add('dark-theme');

      // Test the UI's visualization start event handling with dark theme
      eventBus.emit(APP_EVENTS.VISUALIZATION_START, {
        stream: mockStream,
        isDarkTheme: true
      });

      // Wait for async import to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify that a controller was created and started (through our mock)
      expect(mockController.start).toHaveBeenCalled();

      // Clean up
      document.body.classList.remove('dark-theme');
    });
  });
```

Notes on that test file you will need:

- `VisualizationController` is ESM-mocked at the top of the file
  (`vi.mock('../js/visualization.js', ...)`) and the mocked constructor is
  imported at line 64: `const { VisualizationController } = await import('../js/visualization.js');`
  — you can assert on its `.mock.calls`.
- The UI constructs the controller as
  `new VisualizationController(stream, this.visualizer, isDarkTheme)`
  (`js/ui.js:248`), so `isDarkTheme` is **argument index 2**.
- The `isDarkTheme` property in the emitted `VISUALIZATION_START` payload is
  ignored by `js/ui.js` (it derives the theme itself); leaving it in the
  emit calls is harmless.

Repo conventions that apply:

- ESLint runs on `js/**/*.js` (`npm run lint`); pre-commit enforces it.
- Tests are Vitest with happy-dom; files match `tests/*.vitest.js`.
- Commit messages use conventional-commit-style prefixes, e.g.
  `fix: post-2.0 hardening pass (...)`, `feat(ui): guided-morph control cluster ...`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 (only if node_modules is missing) |
| Single test file | `npx vitest run tests/visualization-stop-expanded.vitest.js` | all tests pass |
| Full suite | `npm test` | 378+ tests pass, 0 failures |
| Lint | `npm run lint` | exit 0, no output |
| Coverage gate | `npm run test:coverage` | exit 0; thresholds stmts 85 / branches 80 / funcs 70 / lines 85 hold |

## Scope

**In scope** (the only files you should modify):

- `js/ui.js` — lines 111, 246, 917 only (change the read target)
- `tests/visualization-stop-expanded.vitest.js` — the "Theme Switching During Visualization" block only

**Out of scope** (do NOT touch, even though they look related):

- `index.html` — the boot script is already correct.
- `js/ui.js` `applyTheme()` (line ~290) — already correct; do not "unify" it into a helper.
- `js/visualization.js` — consumes the flag correctly.
- `css/styles.css` — the `.dark-theme` selector works on `<html>` as-is.
- The `isDarkTheme` property in `VISUALIZATION_START` emit payloads (in `js/audio-handler.js` or tests) — ignored by the listener; removing it is cosmetic churn.

## Git workflow

- Branch: `fix/dark-theme-class-target`
- One commit, message style: `fix(ui): read dark-theme class from documentElement, matching where it is set`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the three reads in `js/ui.js`

Replace `document.body.classList.contains('dark-theme')` with
`document.documentElement.classList.contains('dark-theme')` at exactly three
sites: line 111 (theme-toggle click handler), line 246 (VISUALIZATION_START
handler), line 917 (`clearVisualization()`).

**Verify**: `grep -n "body.classList.contains('dark-theme')" js/ui.js` → no matches.
**Verify**: `grep -cn "documentElement.classList.contains('dark-theme')" js/ui.js` → `3`.

### Step 2: Strengthen the theme test to enforce the fix

In `tests/visualization-stop-expanded.vitest.js`, in the
`'applies theme correctly to new visualization'` test:

1. Change both `document.body.classList.add('dark-theme')` and
   `document.body.classList.remove('dark-theme')` to use
   `document.documentElement` instead of `document.body`.
2. After the existing `expect(mockController.start).toHaveBeenCalled();`
   assertion, add an assertion that the controller was constructed with the
   dark flag (argument index 2):

```js
expect(VisualizationController).toHaveBeenCalledWith(
    mockStream,
    expect.anything(),
    true
);
```

Use the `VisualizationController` already imported at line 64. Prefer
wrapping the cleanup in `try/finally` or keeping the remove call last, so the
class never leaks into other tests if an assertion fails — match the file's
existing simple style (cleanup line at the end is acceptable if assertions
precede it; a `finally` block is better).

**Verify**: `npx vitest run tests/visualization-stop-expanded.vitest.js` → all tests in the file pass, including the strengthened one.

### Step 3: Prove the new assertion catches the regression

Temporarily revert ONE read in `js/ui.js` line 246 back to `document.body`,
run the single test file, and confirm the strengthened test FAILS (the
constructor receives `false` instead of `true`). Then restore the fix.

**Verify (regression check)**: with the temporary revert in place,
`npx vitest run tests/visualization-stop-expanded.vitest.js` → exactly 1 failure, in `'applies theme correctly to new visualization'`.
**Verify (restored)**: after restoring, same command → all pass.

### Step 4: Full gates

**Verify**: `npm test` → all tests pass.
**Verify**: `npm run lint` → exit 0.
**Verify**: `npm run test:coverage` → exit 0, thresholds hold.

## Test plan

- No new test file. The existing
  `tests/visualization-stop-expanded.vitest.js` theme test is upgraded from
  "doesn't crash" to asserting `VisualizationController` is constructed with
  `isDarkTheme === true` when `<html>` carries the `dark-theme` class
  (Step 2), with a deliberate-regression run proving it bites (Step 3).
- Pattern to follow: the file's own existing tests (same describe/it +
  eventBus.emit + await-timeout style).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "body.classList.contains('dark-theme')" js/` → no matches
- [ ] `grep -rn "documentElement.classList.contains('dark-theme')" js/ui.js | wc -l` → 3
- [ ] `grep -n "document.body.classList" tests/visualization-stop-expanded.vitest.js` → no matches
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run test:coverage` exits 0
- [ ] `git status --porcelain` shows only `js/ui.js`, `tests/visualization-stop-expanded.vitest.js` (and `plans/README.md` if you maintain the index) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code at those line
  numbers (codebase drift since `3a83f9c`).
- `grep -rn "dark-theme" js/ tests/` reveals additional `document.body` read
  sites beyond the three listed (the audit found exactly three; more means
  the codebase changed).
- The Step 3 regression check does NOT fail when the bug is reintroduced —
  the assertion isn't wired correctly; do not ship a test that can't catch
  the regression.
- Any test outside `tests/visualization-stop-expanded.vitest.js` fails after
  Step 1 — another test may also codify the body-class convention; report
  which one rather than editing it unprompted.

## Maintenance notes

- Anyone adding a new theme-dependent code path must read the class from
  `document.documentElement` (or better, call a shared helper if one is ever
  introduced). Reviewer should scan the diff for any new
  `document.body.classList` reads.
- Deferred (out of scope here): extracting a single `isDarkTheme()` helper in
  `js/ui.js` so the convention can't diverge again. Worth doing if a fourth
  read site ever appears.
- The `isDarkTheme` property still present in some `VISUALIZATION_START`
  payloads is dead weight (the listener ignores it); a future cleanup could
  remove it from emit sites and tests.
