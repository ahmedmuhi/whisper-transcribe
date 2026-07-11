# Plan 012: Avoid the redundant post-downmix WAV transfer copy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 210a329..HEAD -- js/audio-converter.js tests/audio-converter.vitest.js`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of Plan 011)
- **Category**: perf
- **Planned at**: commit `210a329`, 2026-07-12

## Why this matters

For multi-channel MAI-Transcribe recordings, `downmixToMono` already allocates
an independent mono `Float32Array`, but `encodeWavOffThread` immediately copies
that full array again before transferring the copy to the encode worker. At
16 kHz, a 30-minute mono float buffer is 115,200,000 bytes (about 110 MiB), so
the redundant copy materially raises peak memory during an already memory-heavy
decode → resample → downmix → encode pipeline.

The copy cannot simply be deleted everywhere. For mono input,
`AudioBuffer.getChannelData(0)` returns a view owned by the `AudioBuffer`, which
must not be detached. For multi-channel input, directly transferring the owned
downmix is safe on success, but worker failure occurs after transfer has
detached it; the synchronous fallback must re-create the downmix from the still
available resampled `AudioBuffer`. This plan implements that distinction and
tests both safety paths.

## Current state

- `js/audio-converter.js` owns decode, resample, downmix, worker transfer, and
  synchronous fallback for MAI-Transcribe WAV conversion.
- `js/model-adapters/mai-transcribe.js:17-24` is the only production caller;
  Whisper adapters send their original WebM blobs and are unaffected.
- `plan/2.0-design.md:41` records worker encoding with synchronous fallback as
  a shipped 2.0 design decision. The fallback is not optional.
- `tests/audio-converter.vitest.js:177-381` covers worker delegation,
  overlapping response correlation, runtime failure, and construction failure,
  but its fake worker does not simulate transfer detachment and no test guards
  the number of full-length float allocations.
- Microphone constraints do not force `channelCount: 1`
  (`js/permission-manager.js:122-127`), so browser/device combinations can
  produce multi-channel input.

Current conversion and transfer path (`js/audio-converter.js:30-67`):

```javascript
export async function convertToWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new OfflineAudioContext(NUM_CHANNELS, 1, TARGET_SAMPLE_RATE);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const resampledBuffer = await resampleAudio(audioBuffer, TARGET_SAMPLE_RATE);
    const monoSamples = downmixToMono(resampledBuffer);
    const wavBuffer = await encodeWavOffThread(monoSamples, TARGET_SAMPLE_RATE, BIT_DEPTH);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

async function encodeWavOffThread(samples, sampleRate, bitDepth) {
    const worker = getEncodeWorker();
    if (!worker) {
        return encodeWav(samples, sampleRate, bitDepth);
    }

    // Copy into a fresh buffer so transferring it never detaches an AudioBuffer
    // view that the caller (or a retry) might still reference.
    const transferable = new Float32Array(samples);

    try {
        return await postToWorker(worker, transferable, sampleRate, bitDepth);
    } catch {
        disableEncodeWorker(worker);
        return encodeWav(samples, sampleRate, bitDepth);
    }
}
```

Ownership distinction in `downmixToMono` (`js/audio-converter.js:195-211`):

```javascript
if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0); // borrowed AudioBuffer view
}

const mono = new Float32Array(audioBuffer.length); // independently owned
// ...average channels into mono...
return mono;
```

Repository conventions to preserve:

- Use native browser APIs and zero runtime dependencies.
- Keep worker construction lazy and cached; runtime worker failure permanently
  disables the worker and falls back synchronously.
- Worker messages are correlated by `requestId`; do not alter that protocol.
- Worker and synchronous paths share `encodeWav` and must remain byte-equivalent.
- Tests use Vitest, fake browser APIs, and fresh module imports via
  `vi.resetModules()` to isolate module-level worker state.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted tests | `npx vitest run tests/audio-converter.vitest.js` | all audio-converter tests pass |
| Full tests | `npm test` | all repository tests pass |
| Coverage | `npm run test:coverage` | exit 0 and configured thresholds pass |
| Lint | `npm run lint` | exit 0, no errors |
| Dependency check | `npm run deps:check:prod` | exit 0 |
| Size budget | `npm run size` | exit 0; JavaScript remains below 100 kB |

## Suggested executor toolkit

- Use test-driven development: first add the allocation regression test and
  observe it report two full-length allocations, then implement the ownership
  distinction and observe one.
- Use the existing worker tests in `tests/audio-converter.vitest.js:177-381`
  as the structural pattern; do not introduce a browser-test dependency for
  this focused change.

## Scope

**In scope** (the only implementation/test files you should modify):

- `js/audio-converter.js`
- `tests/audio-converter.vitest.js`
- `plans/README.md` (status update only)

**Out of scope** (do NOT touch, even though they look related):

- `js/audio-converter.worker.js` and `js/wav-encoder.js` — message protocol and
  WAV bytes do not need to change.
- `js/model-adapters/mai-transcribe.js` — its `convertToWav` contract is stable.
- `js/permission-manager.js` — forcing mono capture would change recording
  behavior and does not protect imported/non-microphone blobs.
- Changing channel-mixing math or using Web Audio's automatic speaker-layout
  downmix; preserve the existing equal average across channels.
- Moving decode/resample into the worker; WebAudio is unavailable there and
  this plan targets one confirmed redundant allocation.
- Removing or weakening synchronous fallback after worker failure.
- General buffer pooling, chunked conversion, recording-duration limits, or
  memory benchmarks. These are separate design/performance projects.

## Git workflow

- Branch: `perf/012-wav-memory-peak`
- Make one atomic commit after all gates pass.
- Commit message: `perf(audio): avoid redundant WAV transfer copy`
- Do NOT push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Strengthen worker-transfer tests before changing production code

Modify only the `Audio Converter — Web Worker offload` section in
`tests/audio-converter.vitest.js`.

1. Change `freshConvertToWav()` to accept an optional mock `AudioBuffer`, while
   preserving the existing 16 kHz mono buffer as its default. This lets tests
   deliberately select mono or stereo ownership paths.
2. Add a test named like `transfers an owned stereo downmix without a second
   full-length Float32Array allocation`:
   - Create a small stereo mock buffer before installing instrumentation.
   - Temporarily replace `global.Float32Array` with a `Proxy` around the native
     constructor. In its `construct` trap, record arrays whose length equals
     the mock buffer length, then delegate with `Reflect.construct`. Restore the
     native constructor in `finally` so a failed assertion cannot leak state.
   - Use a successful fake worker that captures `data.samples` and asynchronously
     returns a correctly sized WAV `ArrayBuffer`.
   - Assert exactly one full-length `Float32Array` was allocated during
     conversion and that the worker received that allocation. Before the fix,
     this must fail with two allocations: the stereo downmix plus transfer copy.
3. In the existing successful worker test, supply a known mono mock buffer and
   assert the posted samples are not the same object as
   `monoBuffer.getChannelData(0)`. This guards the required copy for borrowed
   `AudioBuffer` views.
4. Strengthen `should disable the cached Worker after a runtime failure`:
   - Use a stereo mock buffer.
   - In the fake worker's first `postMessage`, call
     `structuredClone(data, { transfer })` (or equivalently transfer the listed
     buffer) before dispatching the error event, so the sender's samples are
     genuinely detached as in a browser.
   - Assert the first fallback WAV has the full expected byte length
     `44 + sampleCount * 2`, not merely the correct MIME type.
   - Retain the existing assertions that the worker is terminated/cached as
     disabled and the second conversion succeeds synchronously.

The allocation test should be the only new failing assertion on current code;
the mono-copy and detached-fallback assertions characterize behavior that the
implementation must preserve.

**Verify (RED)**: `npx vitest run tests/audio-converter.vitest.js` → exits
non-zero because the stereo worker-success path records two full-length float
allocations instead of one; all safety/fallback assertions pass.

### Step 2: Transfer owned downmix samples directly and rebuild on failure

Refactor `js/audio-converter.js` with the smallest ownership-aware change:

1. Pass the resampled `AudioBuffer` into `encodeWavOffThread` rather than
   downmixing in `convertToWav` and passing only the resulting samples.
2. At the start of `encodeWavOffThread`, call `downmixToMono(audioBuffer)` once.
3. Determine whether the result owns its storage using
   `audioBuffer.numberOfChannels > 1`:
   - Multi-channel: `downmixToMono` allocated an independent array. Transfer
     `samples` directly with no `new Float32Array(samples)` copy.
   - Mono: samples alias `getChannelData(0)`. Keep creating a fresh
     `Float32Array(samples)` before transfer.
4. In the worker failure catch path:
   - Multi-channel samples were detached by transfer, so call
     `downmixToMono(audioBuffer)` again and synchronously encode that recreated
     array.
   - Mono samples were never transferred (only their copy was), so synchronously
     encode the original borrowed view as today.
5. Update JSDoc and comments to state the ownership/fallback reason. Do not use
   a generic ownership abstraction or change public exports.

The intended core shape is:

```javascript
async function encodeWavOffThread(audioBuffer, sampleRate, bitDepth) {
    const samples = downmixToMono(audioBuffer);
    const ownsSamples = audioBuffer.numberOfChannels > 1;
    const worker = getEncodeWorker();

    if (!worker) {
        return encodeWav(samples, sampleRate, bitDepth);
    }

    const transferable = ownsSamples ? samples : new Float32Array(samples);

    try {
        return await postToWorker(worker, transferable, sampleRate, bitDepth);
    } catch {
        disableEncodeWorker(worker);
        const fallbackSamples = ownsSamples ? downmixToMono(audioBuffer) : samples;
        return encodeWav(fallbackSamples, sampleRate, bitDepth);
    }
}
```

Keep the existing equal-average `downmixToMono` implementation unchanged.

**Verify (GREEN)**: `npx vitest run tests/audio-converter.vitest.js` → all
audio-converter tests pass; the allocation test observes one full-length
allocation on the successful stereo worker path.

### Step 3: Run the full quality gates and review scope

Run every repository gate, then inspect the final diff. Update Plan 012's index
status only after all gates pass.

**Verify**:

```bash
npm test
npm run test:coverage
npm run lint
npm run deps:check:prod
npm run size
git diff --check
git status --short
```

Expected: every command exits 0; status lists only `js/audio-converter.js`,
`tests/audio-converter.vitest.js`, and the plan status update. The JavaScript
size remains below 100 kB and no dependency files change.

## Test plan

- Extend `tests/audio-converter.vitest.js`; do not create another test file.
- Performance regression: successful stereo conversion allocates one
  full-length mono array (the downmix), not a second transfer copy.
- Ownership safety: successful mono conversion still posts a copy rather than
  its borrowed `AudioBuffer` channel view.
- Failure safety: a stereo buffer that is genuinely detached during worker
  transfer still produces a full-size synchronous fallback WAV after the
  worker errors.
- Preserve existing tests for WAV header/size, resampling, channel averaging,
  overlapping worker requests, worker caching/termination, and construction
  failure.
- Verification: targeted audio-converter suite passes, then the full suite and
  coverage thresholds pass. Do not hard-code a repository-wide test count;
  Plan 011 may or may not have merged before execution.

## Done criteria

- [ ] Successful multi-channel worker conversion transfers the owned downmix
      directly and performs no second full-length `Float32Array` allocation.
- [ ] Mono conversion still copies its `AudioBuffer` channel view before transfer.
- [ ] Runtime worker failure after real buffer detachment produces a complete,
      correctly sized WAV through synchronous fallback.
- [ ] Worker protocol, request correlation, caching, and termination are unchanged.
- [ ] `npx vitest run tests/audio-converter.vitest.js` exits 0.
- [ ] `npm test` and `npm run test:coverage` exit 0.
- [ ] `npm run lint`, `npm run deps:check:prod`, and `npm run size` exit 0.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] No source or test files outside the in-scope list are modified.
- [ ] `plans/README.md` marks Plan 012 DONE only after review passes.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows that `js/audio-converter.js` or its test changed after
  commit `210a329` and no longer matches the excerpts or ownership assumptions.
- A real `AudioBuffer` implementation returns copied storage rather than a
  borrowed view from `getChannelData`, invalidating the mono safety premise.
- Directly transferring the multi-channel downmix cannot coexist with the
  synchronous runtime-failure fallback without changing worker protocol or an
  out-of-scope file.
- The allocation test requires production-only hooks or exporting private
  helpers; stop and revise the test strategy instead.
- `structuredClone(..., { transfer })` is unavailable in the supported Node
  test runtime; report the runtime version and request a plan adjustment rather
  than weakening the detachment assertion.
- A verification command fails twice after one reasonable correction attempt.

## Maintenance notes

- Reviewers should scrutinize the worker-error path: direct transfer detaches
  the first downmix before the error arrives, so encoding that same array would
  silently produce a header-only WAV. Re-downmixing is intentional.
- The optimization only applies to multi-channel inputs. Mono capture retains
  the safety copy, so do not claim a universal MAI memory reduction.
- At 16 kHz, the avoided allocation is `durationSeconds × 16,000 × 4` bytes.
  Future sample-rate changes alter the saving proportionally.
- A future design that downmixes during WebAudio resampling could remove a
  larger buffer, but it may change channel-mixing semantics and is explicitly
  deferred.
