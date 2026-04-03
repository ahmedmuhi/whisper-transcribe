# MAI-Transcribe-1 Integration

Replace GPT-4o support with MAI-Transcribe-1 (Azure Speech LLM Speech API).

---

## Phase 1: Remove GPT-4o Support

### Milestone 1.1 — Strip GPT-4o from source files

- [ ] **constants.js** — Remove `GPT4O_TRANSCRIBE` model type, `GPT4O_*` storage keys, `GPT4O_*` DOM IDs, `SENDING_TO_GPT4O` message, `RESPONSE_FORMAT`/`TEMPERATURE` API params
- [ ] **api-client.js** — Remove GPT-4o FormData logic (`response_format`, `temperature`) and `segments` branch in `parseResponse`
- [ ] **audio-handler.js** — Remove GPT-4o branch in `stopRecordingFlow()` and delete `gracefulStop()` method entirely
- [ ] **settings.js** — Remove all `gpt4o*` DOM refs, simplify model branching (currently `whisper` vs `gpt4o` ternaries everywhere)
- [ ] **index.html** — Remove GPT-4o option from both `<select>` dropdowns, remove `gpt4o-settings` section

> **Commit & push.** Verify Whisper still works end-to-end.

### Milestone 1.2 — Clean up tests

- [ ] Remove/update GPT-4o test cases in `settings-helper-methods.vitest.js`
- [ ] Remove/update GPT-4o test cases in `settings-persistence.vitest.js`
- [ ] Remove/update GPT-4o test cases in `settings-save-modal.vitest.js`
- [ ] Remove/update GPT-4o test cases in `settings-dom-caching.vitest.js`
- [ ] Remove/update GPT-4o test cases in `settings-workflow-issues.vitest.js`
- [ ] Remove/update GPT-4o test cases in `settings-workflow-fixes.vitest.js`
- [ ] Remove/update GPT-4o test cases in `settings-validation.vitest.js`
- [ ] Remove/update GPT-4o test cases in `api-client-validation.vitest.js`
- [ ] Remove/update GPT-4o test cases in `audio-handler-integration.vitest.js`
- [ ] Run full test suite — all tests pass

> **Commit & push.** Clean baseline: Whisper-only app with passing tests.

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
