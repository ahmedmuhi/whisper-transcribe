# MAI-Transcribe-1 Integration

## Completed

- [x] **Phase 1** — Removed all GPT-4o support
- [x] **Phase 2** — Added MAI-Transcribe-1 model support
- [x] **Phase 3** — Audio format conversion (WebM → WAV) + error surfacing
- [x] **Bugfixes** — Model-selector desync, API key validation, innerError extraction

---

## Phase 4: Pre-existing Issue Cleanup

Issues identified by review agents during Phases 1-3. Not caused by our changes, but worth fixing.

### Issue 1 — api-client.js: Double error handling

- In `transcribe()`, when `response.ok` is false, `_handleApiError()` is called, then the error is thrown and caught by the same `catch` block, which calls `_handleApiError()` again.
- `API_REQUEST_ERROR` emits **twice** per failure.
- **Fix:** Remove the `_handleApiError` call inside the `!response.ok` block and let the catch handle it.

### Issue 2 — audio-handler.js: Duplicate API_REQUEST_ERROR emission

- `sendToAzureAPI()` catch block emits `API_REQUEST_ERROR`, but `transcribe()` in api-client.js already emitted it via `_handleApiError()`.
- Same event fires twice per failure from two different files.
- **Fix:** Remove the duplicate emit in `sendToAzureAPI()` and let api-client.js be the single source.

### Issue 3 — audio-handler.js: Double settings modal open on config error

- In `startRecordingFlow()`, the code calls `this.settings.openSettingsModal()` directly AND emits `APP_EVENTS.API_CONFIG_MISSING`, which triggers the event listener to call `openSettingsModal()` again.
- **Fix:** Remove the direct `openSettingsModal()` call and rely solely on the event.

### Issue 4 — audio-handler.js: Stringly-typed error detection

- `errorMessage.includes('configure') || errorMessage.includes('API key') || errorMessage.includes('URI')` — fragile string matching on error messages.
- **Fix:** Use error types/codes or a custom error class instead of matching on message content.

### Issue 5 — audio-handler.js: Event listener leak

- `setupEventBusListeners()` registers an `API_CONFIG_MISSING` handler but there's no corresponding `off()` if AudioHandler is destroyed.
- **Fix:** Add cleanup in a destroy/dispose method.

### Issue 6 — settings.js: Vestigial test injection seam

- The `typeof this.apiKeyInput !== 'undefined'` guard in `_getActiveInputs()` exists solely for test injection. Never set in production code.
- **Fix:** Consider constructor-based dependency injection or a dedicated test helper instead of runtime guards.

### Issue 7 — settings.js: Discarded `new URL()` in sanitizeInputs()

- Constructs a URL object only to validate format, then discards it. `getValidationErrors()` repeats the same parse immediately after.
- **Fix:** Remove the `new URL()` from `sanitizeInputs()` since `getValidationErrors()` already validates.

### Issue 8 — constants.js: Duplicate color values

- `COLORS.CANVAS_DARK_BG` (`#0f172a`) is identical to `COLORS.DARK_BG`, and `CANVAS_LIGHT_BG` (`#f8fafc`) is identical to `LIGHT_BG`.
- **Fix:** Reference the base color instead of duplicating the hex value.

### Issue 9 — ui.js: Unused `setStatusHTML()` with innerHTML sink

- `setStatusHTML(html)` sets `innerHTML` directly — an XSS sink.
- Dead code (never called anywhere). Should be removed to eliminate the dormant attack surface.
- **Fix:** Delete `setStatusHTML()` entirely. All callers use the safe `setStatus()` with `textContent`.
