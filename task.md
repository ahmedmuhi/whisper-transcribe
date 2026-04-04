# V2 UI Facelift - "Obsidian Radio" Design

## Design Direction
**Aesthetic**: Dark-first, premium audio studio interface inspired by high-end recording equipment and late-night radio booths. The current generic Material blue gets replaced with a moody, atmospheric design that feels purpose-built for audio work.

**What makes it unforgettable**: The mic button becomes a dramatic radial "on-air" beacon — glowing amber in idle, pulsing hot vermillion when recording. The entire interface breathes with the audio.

## Design Decisions

### Typography
- **Display/Headings**: `Instrument Serif` — elegant, editorial italic serif with character
- **Body/UI**: `Geist Mono` (from Vercel) — crisp monospace that feels technical and premium, perfect for transcription text
- **Fallback**: system monospace stack

### Color Palette
- **Dark mode (default)**:
  - Background: `#0A0A0B` (near-black with warmth)
  - Surface/Cards: `#141416` with `#1C1C1F` borders
  - Amber accent: `#F59E0B` (warm gold — VU meter inspired)
  - Recording: `#EF4444` → `#DC2626` (hot red with glow)
  - Text: `#E4E4E7` primary, `#71717A` secondary
  - Success: `#10B981`
- **Light mode**:
  - Background: `#FAFAF9` (warm off-white)
  - Surface/Cards: `#FFFFFF` with `#E7E5E4` borders
  - Amber accent: `#D97706` (deeper for contrast)
  - Text: `#1C1917` primary, `#78716C` secondary

### Layout Changes
- Remove the blue header bar entirely — replace with a minimal top bar that blends into the background
- Title becomes a small, understated wordmark in the top-left
- Controls card becomes the visual hero — centered, dominant
- Transcription area gets a code-editor feel with the monospace font and subtle line styling
- Visualizer gets taller (100px) with amber/gold waveform bars instead of rainbow HSL

### Motion & Effects
- Mic button: radial amber glow at rest, morphs to pulsing red "on-air" ring when recording
- Cards: subtle noise texture overlay for depth
- Transitions: 200ms ease-out for all state changes
- Visualizer bars: amber gradient (`#F59E0B` → `#D97706`) instead of rainbow
- Page load: staggered fade-in of cards (100ms delay between)
- Settings modal: slides up from bottom with backdrop blur

### Component Changes
1. **Header** → Minimal top bar (no background color, just content)
2. **Mic button** → Larger (88px), amber ring glow, dramatic recording state
3. **Pause/Cancel buttons** → Ghost-style with border, smaller (48px)
4. **Visualizer** → Taller, amber-toned bars, rounded bar caps
5. **Transcript textarea** → Monospace, darker inset, no visible border until focus
6. **Model selector** → Pill/segmented control instead of dropdown
7. **Timer** → Larger, monospace, tabular-nums for stable width
8. **Settings modal** → Backdrop blur, slide-up animation, refined form inputs
9. **Status text** → Subtle, uses amber accent color
10. **Cut button** → Ghost button with icon, not just text

## Files to Modify
- `index.html` — Update font imports, restructure header, update some markup
- `css/styles.css` — Complete restyle with new variables, layout, animations
- `js/visualization.js` — Update color scheme to amber palette
- `js/constants.js` — Update canvas background colors to match new theme

## Files NOT to modify (preserve all logic)
- `js/main.js`
- `js/ui.js` (DOM references by ID must stay the same)
- `js/settings.js`
- `js/audio-handler.js`
- `js/api-client.js`
- `js/event-bus.js`
- `js/recording-state-machine.js`
- `js/permission-manager.js`
- `js/error-handler.js`
- `js/logger.js`
- `js/status-helper.js`
- `js/audio-converter.js`

## Constraints
- All existing element IDs must be preserved (UI.js and Settings.js reference them)
- No build step — stays as vanilla HTML/CSS/JS with ES modules
- Must remain responsive (mobile-first)
- Accessibility: maintain all aria attributes, touch targets >= 44px
- Theme toggle must still work (light/dark/auto)
