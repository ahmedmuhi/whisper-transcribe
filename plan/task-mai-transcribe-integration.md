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

- [ ] **constants.js** — Add `MAI_TRANSCRIBE` model type, `MAI_TRANSCRIBE_*` storage keys, DOM IDs, status message
- [ ] **index.html** — Add MAI-Transcribe option to both dropdowns, add `mai-transcribe-settings` section (URI + API key fields)
- [ ] **api-client.js** — Handle MAI-Transcribe request format:
  - Auth header: `Ocp-Apim-Subscription-Key` (not `api-key`)
  - Form fields: `audio` + `definition` JSON (not `file` + `language`)
  - Response parsing: extract from `combinedPhrases[].text`
- [ ] **settings.js** — Wire up MAI-Transcribe model config (storage, DOM refs, visibility toggle, save/load)

> **Commit & push.** Test MAI-Transcribe end-to-end with a real recording.

### Milestone 2.2 — Add tests for MAI-Transcribe

- [ ] Add MAI-Transcribe test cases for API client (request format, response parsing)
- [ ] Add MAI-Transcribe test cases for settings (save, load, validation, visibility)
- [ ] Run full test suite — all tests pass

> **Commit & push.** Feature complete.

---

## Notes

- MAI-Transcribe-1 is in **public preview** (no SLA) — fine for this project
- Audio limit: 70 MB (~2 hours of WebM/Opus) — well above typical 10-12 min recordings
- Diarization not supported — not needed (single speaker)
- Supports 25 languages with auto-detection
- Custom prompting available via `prompt` field in `definition`
