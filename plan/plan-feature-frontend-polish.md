# Frontend Polish & Visual Improvements

Improvements identified during design review (2026-04-06). Ordered by visual impact.

## High Impact

### 1. Empty/Onboarding State
The transcript area shows a bare placeholder. Design an illustrated or animated empty state ("Tap the mic to begin...") that makes the first impression stronger and guides new users.

### 2. Transcript Arrival Animation
When transcription text returns from the API it just appears. Add a subtle highlight flash, typewriter reveal, or fade-in so the result feels alive.

### 3. Modal Exit Animation
The settings modal slides up on open but vanishes instantly on close. Add a matching slide-down/fade-out exit transition.

### 4. Header Depth
When the sidebar is collapsed the sticky header is flat — just a hamburger + wordmark with a bottom border. Add a subtle gradient, backdrop blur, or shadow to give it visual weight.

### 5. Status Messages / Toasts
Errors and successes both display as the same small text line below the visualizer. Replace with toast-style notifications that include icons and color coding.

### 6. Spinner / Loading State
The border-spinner is basic. Replace with a skeleton UI, animated waveform, or branded loading animation that feels intentional.

## Polish

### 7. Custom Select Dropdowns
Native `<select>` elements break the aesthetic in dark mode. Build custom-styled dropdowns that maintain visual consistency across themes.

### 8. Settings Form Inputs
Inputs lack icons, validation feedback styling (red borders on error, green on valid), and input group treatment.

### 9. Responsive Breakpoints
Only one breakpoint at 600px. Tablets (768px) get awkward margins around the 680px max-width container. Add a tablet breakpoint.

### 10. Favicon & Meta Tags
No favicon, no Open Graph tags, no `<meta name="description">`. Add these for a complete production feel.
