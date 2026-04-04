# Side Panel & Input Device Selector

## Layout

### Header
- Left: wordmark (stays)
- Right: hamburger menu icon (opens side panel)
- Theme toggle and settings gear REMOVED from header

### Side Panel (slides from left)
- **Content area** (top):
  - Input Device selector (dropdown)
  - Noise Cancellation toggle ("Filter background hum and static")
  - Model picker (moved from controls area)
- **Footer bar** (bottom of panel):
  - Left: theme toggle icon (sun/moon)
  - Right: settings gear icon (opens API settings modal)
- Closes via: X button, tap outside, Escape key

### Main View
- Model selector removed (now in panel)
- Everything else stays

## Files to Modify

1. `index.html` — side panel markup, move model picker, add device selector, add toggle, panel footer
2. `css/styles.css` — panel styles, toggle switch, panel footer, hamburger icon
3. `js/constants.js` — new IDs and storage keys
4. `js/event-bus.js` — new events for device change
5. `js/permission-manager.js` — add deviceId constraint, add getAvailableDevices()
6. `js/settings.js` — panel logic, device enumeration, noise toggle, remove env dropdown from modal
7. `js/ui.js` — panel DOM refs, toggle listeners, Escape handler
