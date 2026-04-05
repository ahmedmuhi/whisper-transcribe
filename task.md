# Color Theme Refresh — Lavender Blue / Deep Navy

## Inspiration
Budget app design with soft periwinkle/cornflower blue primary, lavender-tinted backgrounds, white cards, and warm amber secondary accents. Calming, airy, high-contrast layered feel.

## Design Decisions

### Light Mode — Lavender Blue
- **Background**: Lavender-tinted off-white `#EEF0FB` (not harsh white)
- **Surface/Cards**: Clean white `#FFFFFF`
- **Inset/Input bg**: `#F5F6FC`
- **Primary accent**: Periwinkle/cornflower blue `#5B6EF5`
- **Accent hover**: Deeper blue `#4A5BD4`
- **Accent glow**: `rgba(91, 110, 245, 0.15)`
- **Accent subtle**: `rgba(91, 110, 245, 0.06)`
- **Recording**: `#EF4444` (stays red)
- **Text primary**: Dark slate `#1E2A3A`
- **Text secondary**: `#6B7280`
- **Text muted**: `#9CA3AF`
- **Borders**: `#E0E3F0` (cool-toned, not warm gray)
- **Border subtle**: `#D1D5E8`
- **Success**: `#10B981`
- **Error**: `#EF4444`
- **Shadows**: Cool-toned `rgba(91, 110, 245, 0.06)`

### Dark Mode — Deep Navy
- **Background**: Deep navy `#0C0F1A`
- **Surface/Cards**: `#151929`
- **Inset/Input bg**: `#1C2137`
- **Primary accent**: Brighter periwinkle `#7B8FF7`
- **Accent hover**: `#95A5F9`
- **Accent glow**: `rgba(123, 143, 247, 0.2)`
- **Accent subtle**: `rgba(123, 143, 247, 0.06)`
- **Recording**: `#EF4444`
- **Text primary**: `#E4E7F1`
- **Text secondary**: `#9CA3C4`
- **Text muted**: `#6B7294`
- **Borders**: `#252A40`
- **Border subtle**: `#353B58`
- **Success**: `#34D399`
- **Error**: `#F87171`
- **Shadows**: `rgba(0, 0, 0, 0.3)`

### What Changes
- Mic button: periwinkle blue instead of amber
- Mic icon stroke: white (stays)
- Sidebar wordmark dot: accent color
- Visualizer bars: blue gradient instead of amber
- Toggle switch: accent color when on
- All hover states: accent color
- Focus rings: accent glow
- Save button: accent color
- Spinner: accent color
- Selection highlight: accent glow

### What Stays the Same
- Typography (Instrument Serif + Geist Mono)
- Layout and spacing
- Sidebar behavior (pin/hover/close)
- Noise texture overlay
- All JS logic
- Recording state stays red

## Files to Modify
- `css/styles.css` — update CSS custom properties in `:root` and `.dark-theme`
- `js/visualization.js` — update bar colors from amber to blue gradient
- `js/constants.js` — update COLORS.ERROR/SUCCESS and canvas backgrounds
- `index.html` — update inline theme script background detection

## Files NOT to Modify
- All JS logic files (settings.js, ui.js, audio-handler.js, etc.)
- HTML structure
- Test files
