# MAI-Transcribe-1 Integration

Replace GPT-4o support with MAI-Transcribe-1 (Azure Speech LLM Speech API).

---

## Phase 1: Remove GPT-4o Support

### Milestone 1.1 + 1.2 — Strip GPT-4o from source files and tests

- [x] **constants.js** — Removed `GPT4O_TRANSCRIBE` model type, `GPT4O_*` storage keys, DOM IDs, message, unused API params
- [x] **api-client.js** — Removed GPT-4o FormData logic and `segments` branch in `parseResponse`
- [x] **audio-handler.js** — Removed GPT-4o branch in `stopRecordingFlow()` and deleted `gracefulStop()`
- [x] **settings.js** — Removed all `gpt4o*` DOM refs, simplified to Whisper-only
- [x] **index.html** — Removed GPT-4o option from both dropdowns, removed `gpt4o-settings` section
- [x] Removed GPT-4o test cases from `settings-persistence`, `settings-save-modal`, `audio-handler-integration`
- [x] All 251 tests passing, lint clean

> **Done.** Committed & pushed as `cff9ce0`.

---

## Phase 2: Add MAI-Transcribe-1 Support

### Milestone 2.1 — Wire up MAI-Transcribe in source files

- [x] **constants.js** — Added `MAI_TRANSCRIBE` model type, storage keys, DOM IDs, API params, status message
- [x] **index.html** — Added MAI-Transcribe option to both dropdowns, added settings section
- [x] **api-client.js** — Handles MAI-Transcribe request format (different auth header, form fields, response parsing)
- [x] **settings.js** — Wired up MAI-Transcribe model config, extracted `_getActiveInputs()` helper
- [x] All 251 tests passing, lint clean

> **Done.** Committed & pushed as `767068e`.

### Milestone 2.2 — Add tests for MAI-Transcribe

- [ ] Add MAI-Transcribe test cases for API client (request format, response parsing)
- [ ] Add MAI-Transcribe test cases for settings (save, load, validation, visibility)
- [ ] Run full test suite — all tests pass

> **Commit & push.** Feature complete.

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

### settings.js — `updateSettingsVisibility()` called excessively

- Called from `init()`, both model change listeners, and `openSettingsModal()`. With only two models the overhead is trivial, but it's called more than necessary.
- **Fix:** Only call on model change events and modal open.

### settings.js — Vestigial `apiKeyInput`/`apiUriInput` test injection seam

- The `typeof this.apiKeyInput !== 'undefined'` guard in `_getActiveInputs()` exists solely for test injection. These properties are never set in production code.
- **Fix:** Consider constructor-based dependency injection or a dedicated test helper instead of runtime guards.

### settings.js — `new URL()` discarded in `sanitizeInputs()`

- Constructs a URL object only to validate format, then discards it. `getValidationErrors()` repeats the same parse immediately after.
- **Fix:** Remove the `new URL()` from `sanitizeInputs()` since `getValidationErrors()` already validates.

### constants.js — Duplicate color values

- `COLORS.CANVAS_DARK_BG` (`#0f172a`) is identical to `COLORS.DARK_BG`, and `CANVAS_LIGHT_BG` (`#f8fafc`) is identical to `LIGHT_BG`.
- **Fix:** Reference the base color instead of duplicating the hex value.

---

## Notes

- MAI-Transcribe-1 is in **public preview** (no SLA) — fine for this project
- Audio limit: 70 MB (~2 hours of WebM/Opus) — well above typical 10-12 min recordings
- Diarization not supported — not needed (single speaker)
- Supports 25 languages with auto-detection
- Custom prompting available via `prompt` field in `definition`
