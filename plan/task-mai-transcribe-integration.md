# MAI-Transcribe-1 Integration

## Completed

- [x] **Phase 1** — Removed all GPT-4o support (`cff9ce0`, `76fad47`)
- [x] **Phase 2** — Added MAI-Transcribe-1 model support (`767068e`, `da4ec1d`)
- [x] **Bugfix** — Model-selector desync in settings save flow (`90e02ed`)
- [x] **Bugfix** — API key validation for 84-char Speech keys (`7d685ee`)

---

## Phase 3: Audio Format Conversion for MAI-Transcribe

MAI-Transcribe rejects WebM/Opus (422 InvalidAudioFormat). Browser records as WebM natively.
Strategy: convert WebM → WAV (16kHz mono 16-bit) before sending to MAI-Transcribe only.
Whisper continues to receive WebM as-is.

WAV at 16kHz mono: ~1.9 MB/min → 10 min = ~19 MB, 20 min = ~38 MB (well under 70 MB limit).
No external libraries needed — uses browser-native AudioContext to decode + manual WAV encoding.

### Milestone 3.1 — Add WebM-to-WAV conversion utility

- [ ] Create `js/audio-converter.js` with a function that takes a WebM Blob, decodes via AudioContext, resamples to 16kHz mono, and returns a WAV Blob
- [ ] Keep it as a standalone module with no side effects (pure input → output)
- [ ] Unit test the converter with mock AudioContext

> **Commit & push.** Converter works in isolation.

### Milestone 3.2 — Wire conversion into MAI-Transcribe flow

- [ ] In `api-client.js`, convert audioBlob to WAV before building FormData when model is MAI-Transcribe
- [ ] Update `DEFAULT_FILENAME` or use a model-specific filename (`recording.wav` for MAI)
- [ ] Whisper path remains unchanged (sends WebM as before)
- [ ] Update status message to indicate conversion step (e.g. "Converting audio...")

> **Commit & push.** Test MAI-Transcribe end-to-end with a real recording.

### Milestone 3.3 — Add tests and update existing tests

- [ ] Add unit tests for audio-converter (WAV header structure, sample rate, channel count)
- [ ] Add/update MAI-Transcribe integration tests to verify WAV blob is sent
- [ ] Verify Whisper tests still pass with WebM
- [ ] Run full test suite — all tests pass

> **Commit & push.** Audio conversion feature complete.

### Milestone 3.4 — Improve error surfacing

- [ ] Make API error messages persist in the status bar (not temporary) so users see what went wrong
- [ ] Include the API error detail (e.g. "InvalidAudioFormat") in the status message, not just "Error: API responded with status: 422"

> **Commit & push.** Error UX improved.

---

## Pre-existing Issues (found during code review)

Issues identified by review agents during this work. Not caused by our changes, but worth addressing in future cleanup.

### api-client.js — Double error handling

- In `transcribe()`, when `response.ok` is false, `_handleApiError()` is called at line ~89, then the error is thrown and caught by the same `catch` block at line ~107, which calls `_handleApiError()` again.
- This emits `API_REQUEST_ERROR` **twice** per failure.
- **Fix:** Remove the `_handleApiError` call inside the `!response.ok` block and let the catch handle it, or skip the catch re-emit when context is already set.

### audio-handler.js — Duplicate API_REQUEST_ERROR emission

- `sendToAzureAPI()` catch block emits `API_REQUEST_ERROR`, but `transcribe()` in api-client.js already emitted it via `_handleApiError()`.
- Same event fires twice per failure from two different files.
- **Fix:** Remove the duplicate emit in `sendToAzureAPI()` and let api-client.js be the single source.

### audio-handler.js — Double settings modal open on config error

- In `startRecordingFlow()`, when a config error is caught, the code calls `this.settings.openSettingsModal()` directly AND emits `APP_EVENTS.API_CONFIG_MISSING`, which triggers the event listener to call `openSettingsModal()` again.
- **Fix:** Remove the direct `openSettingsModal()` call and rely solely on the event.

### audio-handler.js — Stringly-typed error detection

- Line ~144: `errorMessage.includes('configure') || errorMessage.includes('API key') || errorMessage.includes('URI')` — fragile string matching on error messages.
- **Fix:** Use error types/codes or a custom error class instead of matching on message content.

### audio-handler.js — Event listener leak

- `setupEventBusListeners()` registers an `API_CONFIG_MISSING` handler but there's no corresponding `off()` if AudioHandler is destroyed.
- **Fix:** Add cleanup in a destroy/dispose method.

### settings.js — Vestigial `apiKeyInput`/`apiUriInput` test injection seam

- The `typeof this.apiKeyInput !== 'undefined'` guard in `_getActiveInputs()` exists solely for test injection. These properties are never set in production code.
- **Fix:** Consider constructor-based dependency injection or a dedicated test helper instead of runtime guards.

### settings.js — `new URL()` discarded in `sanitizeInputs()`

- Constructs a URL object only to validate format, then discards it. `getValidationErrors()` repeats the same parse immediately after.
- **Fix:** Remove the `new URL()` from `sanitizeInputs()` since `getValidationErrors()` already validates.

### constants.js — Duplicate color values

- `COLORS.CANVAS_DARK_BG` (`#0f172a`) is identical to `COLORS.DARK_BG`, and `CANVAS_LIGHT_BG` (`#f8fafc`) is identical to `LIGHT_BG`.
- **Fix:** Reference the base color instead of duplicating the hex value.

### ui.js — Unused `setStatusHTML()` with innerHTML sink

- `setStatusHTML(html)` at line ~489 sets `innerHTML` directly — an XSS sink.
- The method is **dead code** (never called anywhere), but should be removed to eliminate the dormant attack surface.
- **Fix:** Delete `setStatusHTML()` entirely. All callers use the safe `setStatus()` with `textContent`.
