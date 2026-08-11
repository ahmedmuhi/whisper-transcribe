# Plan 055: Add four selectable colour palettes and the Appearance Palette row

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat c4a13bb..HEAD -- css/styles.css index.html js/settings.js js/ui.js js/constants.js js/visualization.js js/settings-surface.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (colour tokens touch every surface; the AA contract in
  `tests/status-tokens.vitest.js` must be extended, not weakened)
- **Depends on**: nothing (independent of 048–054)
- **Category**: feature / design handoff
- **Planned at**: commit `c4a13bb`, branch `feature/055-palette-themes`, 2026-08-12
- **Source of truth**: `/tmp/wt-theme-handoff/handoff-README.md` (hex values
  final). `/tmp/wt-theme-handoff/Whisper-Transcribe-Themes.dc.html` is a
  rendered design reference only — never copy its markup or CSS into the app.

## Why this matters

The app ships exactly one colour scheme in two forms. The handoff adds three
more palettes (Organic, Industry, Broadsheet), each with a light and a dark
form, and one new settings control. The existing scheme becomes "Coastal Teal"
and does not change a byte. Nothing about layout, spacing, typography, radii,
icons or behaviour changes: this is a colour-token change plus one settings row.

The risk that matters is silent contrast regression. Plan 046 established the
WCAG-AA discipline (`tests/status-tokens.vitest.js` is the enforced contract).
Three new palettes multiply every status/foreground pair by four, and the
handoff names only twelve roles — the other fourteen tokens in `:root` have to
be derived by rule, not by taste. This plan fixes those rules and pre-computes
every derived hex with its measured contrast ratio, so the executor types
values rather than inventing them.

## Current state

`css/styles.css` has exactly two token blocks, both on `documentElement`:

- `:root` (lines ~1–50) — Coastal Teal light, 26 colour/effect tokens plus the
  geometry, font, transition, and `--header-height` tokens.
- `.dark-theme` (immediately after) — Coastal Teal dark; overrides 24 colour and
  effect tokens and **does not** redefine `--text-on-accent` (it inherits
  `#FFFFFF` from `:root`) nor the geometry/font/`--focus-ring` tokens.

Tokens declared as `var()` references resolve against whatever value is in
force on the same element, so `--mic-bg: var(--accent)`,
`--visualizer-bg: var(--bg-inset)` and `--focus-ring: 0 0 0 2px var(--accent-glow)`
follow a palette automatically and must **not** be redefined per palette.

Theme mode today:

- `js/constants.js:46` — `STORAGE_KEYS.THEME_MODE: 'themeMode'`.
- `js/settings.js:20` — `const THEME_MODES = Object.freeze(['auto', 'light', 'dark'])`
  (note: the app's value is `auto`, not the handoff's `system`).
- `js/settings.js:61-63` — `themeModeInputs` = `input[name="theme-mode"], input[name="theme-mode-quick"]`.
- `js/settings.js:124-133` — `loadThemeMode()` / `_applyThemeMode()`.
- `js/settings.js:198-206` — the change listener: persist, mirror both radio
  groups, emit `APP_EVENTS.UI_THEME_CHANGED`.
- `js/ui.js:392-420` — `loadTheme()` / `applyTheme()`: toggles `.dark-theme` on
  `document.documentElement`, sets `style.colorScheme`, repaints the visualizer
  canvas, and listens to `prefers-color-scheme`.
- `index.html:8-22` — the inline anti-FOUC script that reads `themeMode`
  directly from `localStorage` and toggles `.dark-theme` before first paint.
- `index.html:366-380` — the existing Theme row
  (`data-settings-row="theme" data-category="appearance"`,
  `data-keywords="theme appearance dark light system colour color"`, subtitle
  "Follows your system by default", `.theme-segment` fieldset with three radios).
- `index.html:70-78` — the quick popover's `theme-mode-quick` mini segment.

Two JS modules still hard-code Coastal hexes and will paint the wrong colour
under a new palette:

- `js/constants.js:16-24` — `COLORS.CANVAS_DARK_BG '#0E1B21'` / `CANVAS_LIGHT_BG '#FFFFFF'`,
  used in `js/ui.js:415-419` and `js/ui.js:1497-1501` to fill the visualizer canvas.
- `js/visualization.js:8-9` — `VIZ_RGB_LIGHT = [36, 95, 115]` (Coastal light
  accent) and `VIZ_RGB_DARK = [143, 186, 203]`, used for the bars, plus
  `COLORS.CANVAS_*` for the canvas ground at lines 91 and 178.

## Commands you will need

```bash
npm test                                          # full deterministic suite
npx vitest run tests/status-tokens.vitest.js      # the AA contract
npx vitest run tests/palette-themes.vitest.js     # new, after Step 7
npm run lint
npm run test:coverage
npm run build && npm run size
npm run test:browser
```

## Scope

In scope:

- `css/styles.css` — six new token blocks appended after `.dark-theme`, plus the
  Palette-card component rules.
- `index.html` — the anti-FOUC script, the new Palette row, the Theme row's
  subtitle text.
- `js/constants.js` — `STORAGE_KEYS.THEME_PALETTE`, `THEME_PALETTES`,
  `DEFAULT_THEME_PALETTE`, new element ids.
- `js/settings.js` — palette load/apply/persist and the radiogroup behaviour.
- `js/ui.js`, `js/visualization.js` — read the canvas ground and bar colour from
  live custom properties instead of the frozen Coastal hexes.
- `tests/` — one new file plus targeted extensions (Step 8).

Out of scope (do not touch):

- The `:root` and `.dark-theme` blocks — Coastal Teal is unchanged, byte for byte.
- The quick popover. **It does not gain a palette control.** It keeps Model,
  Noise cancellation, Theme, and the All settings link exactly as they are. Only
  the modal's Appearance tab gains the row. (Explicit decision — see §"Rejected".)
- Geometry, spacing, typography, radii, icons, motion, and every non-colour token.
- Any authentication, adapter, transcript, or recording path.

## Role → variable mapping

The handoff's twelve role names map onto the existing custom properties as
follows. "Per palette" means the value comes from the handoff table verbatim.

| Handoff role | CSS custom property | Source |
|---|---|---|
| `bg-primary` | `--bg-primary` | handoff, verbatim |
| `bg-surface` | `--bg-surface` | handoff, verbatim |
| `bg-inset` | `--bg-inset` | handoff, verbatim |
| `border` | `--border-color` | handoff, verbatim |
| `text` | `--text-primary` | handoff, verbatim |
| `text-secondary` | `--text-secondary` | handoff, verbatim |
| `text-muted` | `--text-muted` | handoff, verbatim |
| `accent` | `--accent` | handoff, verbatim |
| `accent-on` | `--text-on-accent` | handoff, verbatim (must be declared in **both** forms; `.dark-theme` never declares it today) |
| `accent-2` | `--accent-warm` | handoff, verbatim |
| `accent-2-on` | `--text-on-warm` | handoff, verbatim |
| `recording` | `--recording` | handoff, verbatim |

The handoff names no value for the following fourteen tokens. Each is derived by
the rule below, which reproduces the existing Coastal values when applied to
Coastal (that is the test of a good rule).

| Property | Derivation rule (light) | Derivation rule (dark) | Coastal check |
|---|---|---|---|
| `--border-subtle` | `= --text-muted` | 50 % mix of `--border-color` and `--text-muted` | light `#98989A` = text-muted ✓; dark `#4A6772` ≈ mix(`#2E4750`,`#6C8189`) ✓ |
| `--accent-glow` | `rgba(<accent rgb>, 0.16)` | `rgba(<accent rgb>, 0.25)` | matches `:root` / `.dark-theme` exactly ✓ |
| `--accent-subtle` | `rgba(<accent rgb>, 0.06)` | `rgba(<accent rgb>, 0.08)` | exact ✓ |
| `--recording-glow` | `rgba(<recording rgb>, 0.3)` | `rgba(<recording rgb>, 0.35)` | exact ✓ |
| `--status-text` | `= --text-secondary`, required ≥ 4.5:1 on `--bg-surface` | same | light `#5C5E5D` ✓, dark `#B9C6CB` ✓ |
| `--status-error` | the palette's `--recording` if it clears 4.5:1 on `--bg-surface`; otherwise the same hue darkened until it does | same, lightened instead of darkened | light `#DB2C23` 4.78:1 ✓ |
| `--status-success` | a green in the palette's own family, ≥ 4.5:1 on `--bg-surface` | same | light `#1E7A57` 5.3:1 ✓ |
| `--shadow-sm/md/lg` | `0 1px 2px` / `0 4px 12px` / `0 8px 24px` of `rgba(<palette ink rgb>, .05/.08/.12)`; ink = the palette's deepest brand ink | `rgba(0,0,0,.2/.3/.4)` — identical for every palette | light uses `rgba(36,95,115,…)` = accent ✓; dark identical ✓ |
| `--mic-bg` | **not redefined** — `var(--accent)` on `:root` already follows the palette | same | ✓ |
| `--mic-hover-bg` | accent mixed 85/15 with black | accent mixed 85/15 with white | light `#1C4A5A` ≈ mix ✓; dark `#4F8CA6` ≈ mix ✓ |
| `--modal-backdrop` | `rgba(<accent rgb>, 0.16)` | `rgba(0,0,0,0.5)` — identical for every palette | ✓ |
| `--focus-ring` | **not redefined** — `0 0 0 2px var(--accent-glow)` already follows | same | ✓ |
| `--noise-opacity` | **not redefined** — `0.015` light / `0.025` dark for every palette | same | ✓ |
| `--icon-shadow` | **not redefined** — `:root` light / `.dark-theme` dark values apply | same | ✓ |
| `--visualizer-bg` | **not redefined** — `var(--bg-inset)` already follows | same | ✓ |
| `--visualizer-bar` (**new**) | `= --accent` | 60 % mix of accent with white | new token; Coastal keeps its existing literals (`#245F73` light, `#8FBACB` dark) so the canvas is byte-identical |

### Cascade rule the executor must obey

`[data-palette="x"]` has the same specificity as `.dark-theme` (0,1,0) and comes
later in the file, so **a light palette block outranks `.dark-theme`**.
Therefore: every token a light palette block declares must also be declared in
that palette's dark block, or the light value leaks into dark mode. Conversely,
a dark palette block need not repeat tokens neither block declares
(`--noise-opacity`, `--icon-shadow`) — those still come from `.dark-theme`.

## Derived values, computed

All ratios below were computed with the same sRGB relative-luminance formula
used by `tests/status-tokens.vitest.js`, against that form's `--bg-surface`
(the enforced gate) with the `--bg-inset` ratio shown for information.

### Organic — light (`--bg-surface #fdf8f0`, `--bg-inset #efe3ce`)

| Token | Value | Ratio |
|---|---|---|
| `--border-subtle` | `#a19786` | — |
| `--accent-glow` | `rgba(178, 98, 45, 0.16)` | — |
| `--accent-subtle` | `rgba(178, 98, 45, 0.06)` | — |
| `--recording-glow` | `rgba(185, 59, 43, 0.3)` | — |
| `--status-text` | `#645c50` | 6.23 : 1 (inset 5.19) |
| `--status-error` | `#b93b2b` (= `--recording`, clears the gate) | 5.33 : 1 (inset 4.44) |
| `--status-success` | `#2F6B3F` | 6.03 : 1 (inset 5.02) |
| `--shadow-sm/md/lg` | `rgba(64, 35, 16, .06/.10/.14)` — handoff supplies `.06`/`.10`; `lg` extrapolated on Coastal's ratio | — |
| `--mic-hover-bg` | `#975326` | — |
| `--modal-backdrop` | `rgba(178, 98, 45, 0.16)` | — |
| `--visualizer-bar` | `#b2622d` | — |

### Organic — dark (`--bg-surface #282320`, `--bg-inset #332c26`)

| Token | Value | Ratio |
|---|---|---|
| `--border-subtle` | `#746C5F` | — |
| `--accent-glow` | `rgba(214, 127, 72, 0.25)` | — |
| `--accent-subtle` | `rgba(214, 127, 72, 0.08)` | — |
| `--recording-glow` | `rgba(229, 118, 106, 0.35)` | — |
| `--status-text` | `#dcd3c4` | 10.48 : 1 (inset 9.26) |
| `--status-error` | `#e5766a` (= `--recording`) | 5.28 : 1 (inset 4.66) |
| `--status-success` | `#9CCF9A` | 8.74 : 1 (inset 7.72) |
| `--shadow-sm/md/lg` | `rgba(0,0,0,.2/.3/.4)` | — |
| `--mic-hover-bg` | `#DC9263` | — |
| `--modal-backdrop` | `rgba(0, 0, 0, 0.5)` | — |
| `--visualizer-bar` | `#E6B291` | — |

### Industry — light (`--bg-surface #f5f5f8`, `--bg-inset #e7e7ea`)

| Token | Value | Ratio |
|---|---|---|
| `--border-subtle` | `#98989b` | — |
| `--accent-glow` | `rgba(65, 97, 128, 0.16)` | — |
| `--accent-subtle` | `rgba(65, 97, 128, 0.06)` | — |
| `--recording-glow` | `rgba(219, 44, 35, 0.3)` | — |
| `--status-text` | `#5d5d60` | 6.03 : 1 (inset 5.32) |
| `--status-error` | `#C0271F` — **not** `--recording`: `#DB2C23` is only 4.39 : 1 on this near-white grey and fails the gate; darkened in-hue until it clears | 5.43 : 1 (inset 4.79) |
| `--status-success` | `#0F7355` | 5.36 : 1 (inset 4.72) |
| `--shadow-sm/md/lg` | `rgba(29, 31, 32, .05/.08/.12)` (ink = `--text-primary`, this palette having no deep brand colour) | — |
| `--mic-hover-bg` | `#37526D` | — |
| `--modal-backdrop` | `rgba(65, 97, 128, 0.16)` | — |
| `--visualizer-bar` | `#416180` | — |

### Industry — dark (`--bg-surface #2b2b2d`, `--bg-inset #424244`)

| Token | Value | Ratio |
|---|---|---|
| `--border-subtle` | `#7A7A7E` | — |
| `--accent-glow` | `rgba(148, 188, 227, 0.25)` | — |
| `--accent-subtle` | `rgba(148, 188, 227, 0.08)` | — |
| `--recording-glow` | `rgba(229, 118, 106, 0.35)` | — |
| `--status-text` | `#d4d4d7` | 9.55 : 1 (inset 6.78) |
| `--status-error` | `#F09489` — `--recording` `#e5766a` clears the gate at 4.80 but drops to 3.40 on the control-island inset; lightened in-hue | 6.26 : 1 (inset 4.44) |
| `--status-success` | `#6FD0A8` | 7.58 : 1 (inset 5.38) |
| `--shadow-sm/md/lg` | `rgba(0,0,0,.2/.3/.4)` | — |
| `--mic-hover-bg` | `#A4C6E7` | — |
| `--modal-backdrop` | `rgba(0, 0, 0, 0.5)` | — |
| `--visualizer-bar` | `#BFD7EE` | — |

### Broadsheet — light (`--bg-surface #f8f4f4`, `--bg-inset #eae7e7`)

| Token | Value | Ratio |
|---|---|---|
| `--border-subtle` | `#9b9797` | — |
| `--accent-glow` | `rgba(170, 11, 86, 0.16)` | — |
| `--accent-subtle` | `rgba(170, 11, 86, 0.06)` | — |
| `--recording-glow` | `rgba(214, 0, 108, 0.3)` | — |
| `--status-text` | `#605d5d` | 5.97 : 1 (inset 5.30) |
| `--status-error` | `#C2004F` — `--recording` `#d6006c` clears at 4.72 but only 4.19 on the inset; darkened in-hue | 5.65 : 1 (inset 5.01) |
| `--status-success` | `#0F7355` | 5.34 : 1 (inset 4.74) |
| `--shadow-sm/md/lg` | `rgba(32, 30, 29, .05/.08/.12)` | — |
| `--mic-hover-bg` | `#900949` | — |
| `--modal-backdrop` | `rgba(170, 11, 86, 0.16)` | — |
| `--visualizer-bar` | `#aa0b56` | — |

### Broadsheet — dark (`--bg-surface #2d2b2b`, `--bg-inset #444141`)

| Token | Value | Ratio |
|---|---|---|
| `--border-subtle` | `#7E7A7A` | — |
| `--accent-glow` | `rgba(56, 166, 207, 0.25)` | — |
| `--accent-subtle` | `rgba(56, 166, 207, 0.08)` | — |
| `--recording-glow` | `rgba(255, 69, 142, 0.35)` | — |
| `--status-text` | `#d7d3d3` | 9.48 : 1 (inset 6.81) |
| `--status-error` | `#FF85B4` — `--recording` `#ff458e` is 4.35 : 1 and **fails** the gate; lightened in-hue | 6.21 : 1 (inset 4.46) |
| `--status-success` | `#4FD0A8` | 7.32 : 1 (inset 5.25) |
| `--shadow-sm/md/lg` | `rgba(0,0,0,.2/.3/.4)` | — |
| `--mic-hover-bg` | `#56B3D6` | — |
| `--modal-backdrop` | `rgba(0, 0, 0, 0.5)` | — |
| `--visualizer-bar` | `#88CAE2` | — |

## Open decisions for the maintainer (raise before Step 1)

The handoff says its hexes are final. Two handoff pairs land below the 4.5 : 1
the repo has enforced since plan 046. They are foreground/background pairs the
handoff itself defines, so this plan does not silently change them — flag them
and get a ruling:

- **D1 — Organic light, `accent-on` on `accent`**: `#fff8f2` on `#b2622d` =
  **4.27 : 1**. This paints the primary button label and the mic glyph label.
  Pure white lifts it to 4.49 (still short); darkening the accent to `#9E5220`
  gives 5.42 with the handoff's `accent-on`. Also note Organic light `accent`
  as *text* on `bg-surface` is 4.25 : 1, which affects the active nav item and
  link text.
- **D2 — Industry light, `accent-2-on` on `accent-2`**: `#f5f5f8` on `#627d98`
  = **3.93 : 1** (the "Done" button label). Darkening `accent-2` to `#55708C`
  gives 4.73.
- **D3 — `--accent-warm` as mono Target-URI text on `--bg-inset`** (an existing
  app usage the handoff does not consider): Industry light 3.47 : 1 and
  Broadsheet dark 3.12 : 1. This is a *pre-existing* pattern — Coastal dark is
  already 4.31 : 1 today — so the default recommendation is to accept it and not
  change Coastal; the alternative is to repoint the URI input's `color` to
  `--text-primary` for all palettes.

Recommended disposition: apply the handoff verbatim, record D1–D3 in the PR
description as accepted design deviations, and only change hexes if the
maintainer says so. Do **not** invent adjusted hexes without that ruling.

## CSS structure

Append after the existing `.dark-theme` block, in this order, with a section
banner comment matching the file's existing style. Nothing above moves.

```css
/* ==========================================================================
   Palettes — Coastal Teal is :root/.dark-theme above and is not repeated here.
   [data-palette] and .dark-theme have equal specificity, so every token a light
   block sets must be re-set by its dark block.
   ========================================================================== */
[data-palette="organic"] { /* light tokens */ }
[data-palette="organic"].dark-theme { /* dark tokens */ }
[data-palette="industry"] { }
[data-palette="industry"].dark-theme { }
[data-palette="broadsheet"] { }
[data-palette="broadsheet"].dark-theme { }
```

`data-palette="coastal"` is set on the element but has **no** CSS block — it
falls through to `:root` / `.dark-theme`, which guarantees the default is
untouched.

Each block declares exactly this token list, in the order `:root` uses:
`--bg-primary`, `--bg-surface`, `--bg-inset`, `--border-color`,
`--border-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`,
`--accent`, `--accent-warm`, `--text-on-accent`, `--text-on-warm`,
`--accent-glow`, `--accent-subtle`, `--recording`, `--recording-glow`,
`--status-text`, `--status-error`, `--status-success`, `--shadow-sm`,
`--shadow-md`, `--shadow-lg`, `--mic-hover-bg`, `--modal-backdrop`,
`--visualizer-bar`. Twenty-five per block, six blocks. Carry a short comment
above each `--status-*` trio recording the measured ratio, matching the existing
Coastal comments.

## JS and state

- `js/constants.js`:
  - `STORAGE_KEYS.THEME_PALETTE: 'themePalette'`.
  - `export const THEME_PALETTES = Object.freeze(['coastal', 'organic', 'industry', 'broadsheet']);`
  - `export const DEFAULT_THEME_PALETTE = 'coastal';`
  - new ids for the row/grid (`PALETTE_ROW`, `PALETTE_GRID`) under the existing
    `ID` object; no magic strings in `settings.js`.
- `js/settings.js` owns palette state, exactly as it owns theme mode:
  - `loadThemePalette()` — read the key; `THEME_PALETTES.includes(stored)` or
    fall back to `DEFAULT_THEME_PALETTE`. **Migration is this one line**: a
    missing key and an invalid/corrupt value both resolve to `coastal`, so
    existing users see no change. Do not write the key on read; only a user
    choice persists (keeps the "no stored preference = coastal" invariant
    honest and avoids a write on every boot).
  - `_applyThemePalette(palette)` — `document.documentElement.setAttribute('data-palette', palette)`
    (the same element `.dark-theme` is toggled on, per `js/ui.js:416`), then
    sync the cards' `aria-checked`/`tabindex`/selected class.
  - Selection handler — persist, apply, emit `APP_EVENTS.UI_THEME_CHANGED` with
    `{ mode, palette }` (extend the existing payload; keep `mode` present so no
    existing subscriber breaks), and repaint the visualizer ground the same way
    a mode change does. Applies instantly: no confirm, no reload; the existing
    colour transitions carry it.
  - Cross-tab: the existing `window.addEventListener('storage', …)` handler in
    `Settings` already exists for the MAI style key — extend its predicate to
    `STORAGE_KEYS.THEME_PALETTE` and re-run `loadThemePalette()`, matching how
    plan 040 handled cross-tab preference sync.
- `index.html` anti-FOUC script — add, next to the existing `themeMode` read
  and inside the same `try`:

```js
// Keys must match STORAGE_KEYS in js/constants.js
const palettes = ['coastal', 'organic', 'industry', 'broadsheet'];
const stored = localStorage.getItem('themePalette');
document.documentElement.setAttribute(
    'data-palette', palettes.indexOf(stored) >= 0 ? stored : 'coastal');
```

  Keep the existing comment convention naming the constant the literal mirrors.
- `js/ui.js` — `applyTheme()` and `clearVisualization()` must stop using
  `COLORS.CANVAS_*`. Add one private helper that reads the live ground:
  `getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || (isDark ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG)`.
  The fallback keeps Happy DOM and any non-computing environment working.
- `js/visualization.js` — `VIZ_RGB_LIGHT`/`VIZ_RGB_DARK` become a single read of
  `--visualizer-bar` (parsed to `r,g,b` once in `start()`, as today's constants
  are read once), and the canvas ground reads `--bg-primary` through the same
  helper. Keep the pre-quantized `fillStyles` array and the per-frame allocation
  budget exactly as they are — this is a colour-source change, not a loop change.
  `COLORS` stays exported and `tests/color-constants-sync.vitest.js` keeps
  passing (it asserts Coastal, which is unchanged).

## The Appearance tab

Two rows, in this order, both in the existing `.settings-row` grammar.

### Row 1 — Palette (new, above Theme)

Markup, in `index.html` immediately before the existing theme row:

```html
<div class="settings-row settings-row--stacked" data-settings-row="palette"
     data-category="appearance"
     data-keywords="palette appearance colour color theme scheme organic industry broadsheet coastal teal">
    <div class="settings-row-copy">
        <span class="settings-row-title" id="palette-label">Palette<span class="settings-row-chip" aria-hidden="true">Appearance</span></span>
        <p class="settings-row-subtitle">Colour set for the whole app · each palette carries its own light and dark form</p>
    </div>
    <div class="palette-grid" id="palette-grid" role="radiogroup" aria-labelledby="palette-label">
        <button type="button" class="palette-card" role="radio" aria-checked="true"
                tabindex="0" data-palette-value="coastal">
            <span class="palette-swatches" aria-hidden="true">
                <span style="background:#FFFFFF"></span>
                <span style="background:#245F73"></span>
                <span style="background:#733E24"></span>
            </span>
            <span class="palette-card-footer">
                <span class="palette-card-name">Coastal Teal</span>
                <svg class="palette-card-check" viewBox="0 0 24 24" …><polyline points="20 6 9 17 4 12"/></svg>
            </span>
        </button>
        <!-- organic, industry, broadsheet -->
    </div>
</div>
```

Behaviour and presentation:

- Full-width row: `.settings-row--stacked` sets `grid-template-columns: 1fr`
  so the copy is on its own line and the grid spans the row. It keeps the 16 px
  vertical padding and the hairline bottom border. Do not change `.settings-row`
  itself — the two-column rule stays the default for every other row.
- Grid: `display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:12px`.
- Card: `padding:10px; border-radius:12px; border:1.5px solid var(--border-color); background:var(--bg-surface)`.
  Swatch strip: three equal bars, `height:26px; border-radius:6px; gap:4px`; the
  first bar carries `box-shadow: inset 0 0 0 1px rgba(0,0,0,.18)` (light forms)
  so pale grounds stay visible — in dark forms use `rgba(255,255,255,.18)`.
- Bars, in order: the palette's **light** `bg-primary`, its `accent`, its
  `accent-2`. Broadsheet's card leads with its magenta accent `#aa0b56` per the
  handoff. These three swatch hexes are literal and identical in both forms —
  the card previews a palette, it is not themed by it.
- Name: `.8rem/700`, `var(--text-secondary)`; selected → `var(--text-primary)`.
- Selected card: `border-color: var(--accent)`, background
  `color-mix(in srgb, var(--accent) 8%, transparent)`, 14 px check icon in the
  accent. The check is `visibility:hidden` when unselected so the footer does
  not reflow.
- Radiogroup semantics: `role="radiogroup"` with `aria-labelledby` pointing at
  the row title; each card `role="radio"` with `aria-checked`. Roving tabindex —
  the checked card is `tabindex="0"`, the rest `tabindex="-1"`.
- Keyboard: Left/Up move to the previous card, Right/Down to the next, both
  wrapping; Home/End jump to first/last; movement selects (the standard
  auto-select radiogroup pattern, matching the segmented control's native radio
  behaviour); Space/Enter select the focused card. Move DOM focus with each
  change.
- `:focus-visible` uses the app's established treatment — add `.palette-card`
  to the existing focus-ring selector list at `css/styles.css:1648-1657`
  (`outline: 2px solid var(--accent); outline-offset: 2px; box-shadow: var(--focus-ring)`).
  Do not invent a new ring; plan 046 made this the one true treatment.
- Hit target: the whole card, comfortably over 44 px.
- Narrow width: inside the existing `@media` block at `css/styles.css:1853+`,
  drop the grid to `repeat(2,1fr)` so the modal's narrow layout stays intact.
- Search: `data-keywords` above makes the row findable; `SettingsSurface` needs
  no change — it enumerates `[data-settings-row]` generically.

### Row 2 — Theme (existing)

Only the subtitle text changes, from
`Follows your system by default` to
`Light or dark form of the selected palette`.
No markup, geometry, control, or value change. Keep the `auto` radio value —
the handoff's `system` is its own vocabulary, not the app's.

## Quick popover

**No palette control.** The popover keeps Model, Noise cancellation, Theme, and
the All settings link, unchanged. The swatch grid needs width the popover does
not have, palette is a set-once preference where theme is a per-session one, and
`CLAUDE.md` names the popover's contents as a contract. Anyone who wants a
palette uses All settings → Appearance.

## Steps

1. **Constants** — `STORAGE_KEYS.THEME_PALETTE`, `THEME_PALETTES`,
   `DEFAULT_THEME_PALETTE`, the two new ids. `npx vitest run tests/color-constants-sync.vitest.js`.
2. **CSS token blocks** — append the six blocks with the values tabulated above.
   Verify `git diff css/styles.css` shows **no** change above the new banner.
3. **CSS Palette-card component** — `.settings-row--stacked`, `.palette-grid`,
   `.palette-card`, swatches, footer, check, selected state, the focus-selector
   addition, the narrow-width override.
4. **Markup** — the Palette row, the Theme subtitle change, the anti-FOUC
   palette line.
5. **Settings state** — load/apply/persist/migrate, storage-event sync, the
   `UI_THEME_CHANGED` payload extension.
6. **Radiogroup behaviour** — click, keyboard, roving tabindex, `aria-checked`.
7. **Live colour for the canvas** — `js/ui.js` + `js/visualization.js` read
   `--bg-primary` and `--visualizer-bar`; confirm Coastal renders identically.
8. **Tests** (below), then the full gates.

## Test plan

Existing files that cover this ground, and what changes in each:

- `tests/status-tokens.vitest.js` — **extend**. Today it iterates two themes
  (`:root`, `.dark-theme`). Change `THEMES` to the eight forms
  (`:root`, `.dark-theme`, and `[data-palette="x"]` / `[data-palette="x"].dark-theme`
  for the three new palettes) so all three `--status-*` tokens are asserted as
  hex and ≥ 4.5 : 1 on that form's own `--bg-surface`. `extractCssBlock` in
  `tests/helpers/css-tokens.js` escapes `.` and `[` already, so the selectors
  work unchanged — verify, and only extend the helper if a selector misses.
- `tests/color-constants-sync.vitest.js` — must keep passing untouched
  (it pins Coastal, which does not move). Treat a failure here as a signal that
  `:root`/`.dark-theme` were edited.
- `tests/settings-persistence.vitest.js` — the theme fixture lives here
  (lines 40-42, 62-65). Add the palette row to the fixture and the persistence
  cases.
- `tests/settings-unit.vitest.js` — `describe('Settings theme mode')` at line
  410 is the model to copy for a new `describe('Settings theme palette')`.
- `tests/settings-sidebar.vitest.js:79` — `['appearance', 'Appearance', ['theme']]`
  becomes `['appearance', 'Appearance', ['palette', 'theme']]`.
- `tests/settings-surface.vitest.js` — search/filter cases enumerate visible
  rows; update the expectations that name the Appearance rows.
- `tests/visualization*.vitest.js`, `tests/island-layout-css.vitest.js` —
  re-run; they must pass without edits unless Step 7 changed a signature.

New deterministic file `tests/palette-themes.vitest.js`:

1. **CSS completeness** — for each of the three new palettes, the light and dark
   blocks exist and each declares the full 25-token list; assert set equality of
   the light block's property names with the dark block's (the cascade rule —
   this is the test that catches a leaked light value in dark mode).
2. **Handoff fidelity** — a literal table of the twelve handoff roles × six
   forms asserted against the parsed CSS, so a later "tidy-up" that nudges a hex
   fails loudly.
3. **Coastal untouched** — `:root` and `.dark-theme` still carry their exact
   pre-existing values for the twelve roles (guards "existing blocks untouched").
4. **Persistence** — selecting a card writes `themePalette` and sets
   `data-palette` on `document.documentElement`; no other storage key moves.
5. **Migration** — no stored key → `coastal` and nothing written on load;
   stored `'nonsense'` → `coastal`; stored `'organic'` → `organic`; a stored
   `themeMode` with no `themePalette` → `coastal` with the mode preserved.
6. **Instant apply** — the attribute changes synchronously in the change
   handler, with no reload and no confirm step.
7. **Independence** — changing palette does not change `themeMode`, and toggling
   mode does not change `data-palette`.
8. **Radiogroup behaviour** — one `role="radiogroup"`, four `role="radio"`
   cards; exactly one `aria-checked="true"`; roving tabindex is `0`/`-1`;
   ArrowRight/ArrowLeft wrap and move selection; Home/End; Space/Enter select;
   focus follows selection.
9. **Popover boundary** — the quick popover contains no palette control
   (asserts the decision above so no one adds one by accident).
10. **Cross-tab** — a `storage` event for `themePalette` re-applies the attribute.

Run: `npm test`, `npm run test:coverage` (thresholds 85/80/70/85 must hold),
`npm run test:browser`.

## Done criteria

- [ ] `npm test`, `npm run test:coverage`, `npm run test:browser` exit 0
- [ ] `npm run lint`, `npm run deps:check`, `npm run build`, `npm run size` exit 0
- [ ] `git diff c4a13bb..HEAD -- css/styles.css | head -60` shows the first
      change is *after* the `.dark-theme` block (Coastal untouched)
- [ ] `tests/status-tokens.vitest.js` asserts eight forms, all ≥ 4.5 : 1
- [ ] `tests/palette-themes.vitest.js` exists and passes
- [ ] Manual pass in the running app: all four palettes × System/Light/Dark
      (12 combinations) — recording island, transcript card, settings modal,
      toasts, visualizer, focus rings
- [ ] The quick popover is unchanged
- [ ] D1–D3 recorded in the PR description with the maintainer's ruling
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The maintainer has not ruled on D1–D3 and the executor is about to change a
  handoff hex.
- `npm run size` fails. The application budget is `20.5 kB` in **two** places
  (`package.json` size-limit and the literal in `tests/vite-build.vitest.js`)
  and plan 053 already flagged the headroom as thin. Do not raise a budget
  without an explicit maintainer ruling; CSS is not in any budget, so only the
  Step 5–7 JS should move the needle.
- `tests/color-constants-sync.vitest.js` fails — that means Coastal moved.
- `SettingsSurface` needs modification to keep row search, category filtering,
  or focus containment working with the new row.
- `color-mix()` proves unusable in the deterministic browser matrix; fall back
  to a literal `--accent-subtle`-style token rather than dropping the selected
  state.
- Any drift-check mismatch against the "Current state" excerpts.

## Rejected, so it is not re-proposed

- A dropdown for the Palette row, and a palette sub-page — both work; the swatch
  grid was chosen for four palettes (handoff).
- Sage and Classical palettes — Classical read too close to the default.
- Putting palette in the quick popover — see §"Quick popover".
- Restructuring `:root`/`.dark-theme` into a shared "coastal" attribute block
  for symmetry. It is prettier and it risks the one scheme that already ships.

## Maintenance notes

- Adding a fifth palette = one `THEME_PALETTES` entry, two CSS blocks (all 25
  tokens each), one card, and one row in the fidelity table. Past about eight
  cards, move the row to a sub-page rather than growing the dialog (handoff).
- The derivation rules in this plan reproduce Coastal exactly when applied to
  Coastal. If a future palette needs a hand-tuned exception, record the measured
  ratio in a CSS comment the way the Coastal `--status-*` comments do.
- `--visualizer-bar` is new because the visualizer was the last place a Coastal
  hex was frozen in JS. Do not re-freeze a colour in `js/`; the CSS tokens are
  the single source.
