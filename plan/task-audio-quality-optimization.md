# Audio Quality Optimization

Improve transcription accuracy by tuning browser audio capture settings
and adding environment-aware recording profiles.

---

## Phase 1: Disable browser audio processing defaults

Chrome/Edge default to conferencing-optimized audio processing (AGC, noise
suppression, echo cancellation) which degrades transcription quality by
pumping volume, clipping consonants, and introducing artifacts.

### Milestone 1.1 — Update getUserMedia constraints

- [ ] In `permission-manager.js`, update `getUserMedia` constraints:
  - `autoGainControl: false` (currently not set — defaults to true)
  - `noiseSuppression: false` (currently true)
  - `echoCancellation: false` (currently true — not needed for solo recording)
- [ ] Keep `sampleRate: 44100` as-is (higher source quality for WAV conversion)
- [ ] All existing tests pass

> **Commit & push.** Immediate quality improvement with zero UI changes.

### Milestone 1.2 — Log applied constraints for debugging

- [ ] After `getUserMedia` succeeds, read back actual applied settings via `track.getSettings()`
- [ ] Log them through the existing logger (e.g. `permLogger.info('Applied audio settings:', settings)`)
- [ ] This verifies the browser honoured our requests — constraints are hints, not guarantees

> **Commit & push.** Debugging foundation in place.

---

## Phase 2: Environment-aware recording profiles

Add a settings UI for the user to select their recording environment,
which adjusts audio processing accordingly.

### Milestone 2.1 — Add recording environment to settings

- [ ] Add `RECORDING_ENVIRONMENT` storage key to `constants.js`
- [ ] Add dropdown to settings modal: "Recording Environment" with two options:
  - **Quiet room (best quality)** — all processing off (default)
  - **Noisy environment** — noise suppression + AGC on, echo cancellation off
- [ ] Store selection in localStorage
- [ ] Wire the selected profile into `getUserMedia` constraints in `permission-manager.js`

> **Commit & push.** User can switch profiles.

### Milestone 2.2 — Add tests

- [ ] Test that quiet room profile passes correct constraints
- [ ] Test that noisy environment profile enables suppression + AGC
- [ ] Test that profile persists across page reloads
- [ ] Full test suite passes

> **Commit & push.** Feature complete.

---

## Phase 3 (Future): Prompt parameter for domain vocabulary

Both Whisper and MAI-Transcribe accept an optional `prompt` parameter
that biases the model towards specific vocabulary. This is especially
useful for technical jargon (e.g. "Kubernetes, Azure CLI, Dapr").

Not implementing now — parking here for future consideration.

- [ ] Add optional "Vocabulary hints" text field to settings
- [ ] Pass as `prompt` parameter for Whisper, add to `definition.enhancedMode.prompt` for MAI-Transcribe
- [ ] Consider pre-built vocabulary profiles (e.g. "Cloud/DevOps", "Medical", "Legal")

---

## Audio constraint reference

| Setting | Quiet room | Noisy environment | Why |
|---|---|---|---|
| autoGainControl | **false** | true | Prevents volume pumping between sentences |
| noiseSuppression | **false** | true | Preserves consonants (s, t, f, th) |
| echoCancellation | **false** | false | Not needed for solo recording (no speakers) |
