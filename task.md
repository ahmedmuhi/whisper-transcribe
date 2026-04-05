# Color Theme Refresh — Lavender Blue / Deep Navy

## Inspiration
Budget app design with soft periwinkle/cornflower blue primary, lavender-tinted backgrounds, white cards, and warm amber secondary accents. Calming, airy, high-contrast layered feel.

## Phase 1: CSS Design Tokens
Update `:root` (light mode) and `.dark-theme` (dark mode) CSS custom properties only.
No layout, component, or JS changes.

**Light mode tokens**:
- bg-primary: `#EEF0FB`, bg-surface: `#FFFFFF`, bg-inset: `#F5F6FC`
- accent: `#5B6EF5`, accent hover: `#4A5BD4`
- text-primary: `#1E2A3A`, text-secondary: `#6B7280`, text-muted: `#9CA3AF`
- borders: `#E0E3F0` / `#D1D5E8`
- shadows: cool-toned blue

**Dark mode tokens**:
- bg-primary: `#0C0F1A`, bg-surface: `#151929`, bg-inset: `#1C2137`
- accent: `#7B8FF7`, accent hover: `#95A5F9`
- text-primary: `#E4E7F1`, text-secondary: `#9CA3C4`, text-muted: `#6B7294`
- borders: `#252A40` / `#353B58`

**Files**: `css/styles.css` only

---

## Phase 2: Visualizer Colors
Update visualization.js bar colors from amber gradient to blue gradient.
Update constants.js canvas background colors to match new theme.

**Files**: `js/visualization.js`, `js/constants.js`

---

## Phase 3: Inline Theme Script
Update the `<head>` inline script background color to match new dark mode bg.
Update the comment banner at top of styles.css.

**Files**: `index.html`, `css/styles.css` (comment only)

---

## What Stays the Same (all phases)
- Typography (Instrument Serif + Geist Mono)
- Layout and spacing
- Sidebar behavior (pin/hover/close)
- Noise texture overlay
- All JS logic (settings.js, ui.js, audio-handler.js, etc.)
- Recording state stays red
- HTML structure
- Test files
