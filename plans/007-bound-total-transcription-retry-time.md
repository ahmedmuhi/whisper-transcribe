# Plan 007: Bound the total time a transcription can spend retrying (deadline across attempts)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 50164c9..HEAD -- js/api-client.js js/constants.js tests/api-client-errors.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — this deliberately amends a tested behavior contract
  (attempt counts under sustained failure); the existing timeout-suite
  assertions are expected to need adjustment, and that adjustment is part of
  the plan, not an accident.
- **Depends on**: none (sequence after 003; keep separate from 004's diff)
- **Category**: bug / ux-correctness
- **Planned at**: commit `50164c9`, 2026-06-11

## Why this matters

The per-attempt timeout exists, per its own JSDoc (`js/constants.js:334-338`),
to "prevent a hung request from stranding the app in the PROCESSING state
(reload-only recovery)". But the *aggregate* across retries defeats that
intent. Worst cases with current constants
(`MAX_TRANSCRIPTION_RETRIES = 5`, per-attempt timeout 120 s, `Retry-After`
honored up to 60 s per retry):

- Hung server: 6 attempts × 120 s ≈ **12 minutes** in PROCESSING.
- Throttling storm sending `Retry-After: 60`: 6 × 120 s + 5 × 60 s ≈ **17 minutes**.

During all of it the user has **no escape**: the FSM allows
`PROCESSING → [IDLE, ERROR]` only (`js/constants.js:404`), both reached only
when the request settles, and the backoff sleeps (`_sleep`, plain `setTimeout`)
are not abortable. A dictation user will reload the page long before minute 17
— losing the recording.

The fix: an overall deadline (`TRANSCRIPTION_MAX_TOTAL_MS`, recommended
**180 000 ms = 3 minutes**) checked between attempts. One slow-but-progressing
attempt still gets its full 120 s window; what stops is *piling more attempts
and sleeps past the deadline*. A user-initiated cancel from PROCESSING is a
UI/FSM design change and is explicitly deferred (see Maintenance notes).

## Current state

`js/api-client.js:11-14` (module constants):

```js
const MAX_TRANSCRIPTION_RETRIES = 5;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRY_BACKOFF_SCHEDULE_MS = [2000, 4000, 8000, 16000, 32000];
const MAX_RETRY_AFTER_MS = 60_000;
```

`js/api-client.js:147-193` (`_fetchWithRetry` — the loop to modify; note the
two `_retryAfter` call sites and that the loop has **no terminal throw**, so
its non-`undefined` return depends entirely on the `attempt === MAX…` clause
at line 155):

```js
    async _fetchWithRetry(uri, options, onProgress, handleResponse) {
        for (let attempt = 0; attempt <= MAX_TRANSCRIPTION_RETRIES; attempt++) {
            let response;

            try {
                const attemptResult = await this._fetchWithTimeout(async (signal) => {
                    response = await fetch(uri, { ...options, signal });

                    if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_TRANSCRIPTION_RETRIES) {
                        return {
                            shouldRetry: false,
                            value: await handleResponse(response)
                        };
                    }

                    // Consume the error body to release the connection before retrying.
                    await this._consumeRetryBody(response);
                    return { shouldRetry: true };
                });

                if (!attemptResult.shouldRetry) {
                    return attemptResult.value;
                }
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    throw error;
                }
                if (attempt === MAX_TRANSCRIPTION_RETRIES) {
                    throw this._createTimeoutError();
                }
                const timeoutSec = Math.ceil(TRANSCRIPTION_TIMEOUT_MS / 1000);
                await this._retryAfter(this._getRetryDelayMs(null, attempt), attempt, {
                    log: `Transcription request timed out after ${timeoutSec}s.`,
                    progress: 'Request timed out.'
                }, onProgress);
                continue;
            }

            await this._retryAfter(this._getRetryDelayMs(response, attempt), attempt, {
                log: `Transient API response ${response.status}.`,
                progress: `Azure returned ${response.status}.`
            }, onProgress);
        }
    }
```

Supporting pieces (read them before editing): `_retryAfter`
(`js/api-client.js:247-257`, ends in `await this._sleep(delayMs)`); `_sleep`
(`:333-335`, plain promise/`setTimeout`); `_createTimeoutError` (`:267-272`,
throws `MESSAGES.REQUEST_TIMED_OUT` with `error.apiContext = { timeout: true }`);
`_getRetryDelayMs` (`:305-313`, Retry-After capped at `MAX_RETRY_AFTER_MS`,
else backoff schedule). `TRANSCRIPTION_TIMEOUT_MS = 120000` is exported from
`js/constants.js:342`.

Test-suite facts that shape the implementation (verified at planning time):

- `tests/api-client-errors.vitest.js:75` stubs the sleeps for the whole suite:
  `vi.spyOn(apiClient, '_sleep').mockResolvedValue();`
- The 429 contract test (`:321-349`) asserts **6 fetch calls** with no fake
  timers — it relies on the `_sleep` stub. A **wall-clock (Date.now) deadline
  would not trip there** (elapsed ≈ 0 ms), so that test stays valid.
- The `describe('Request Timeout Handling (AbortController)')` block
  (`:587-703`) DOES use `vi.useFakeTimers()` and drives 8 × 120 s of fake time
  (`flushAllTimeoutAttempts`). Whether `Date.now()` advances there depends on
  vitest's fake-timer config — **do not guess; make the clock injectable**
  (Step 2) so behavior is deterministic in both modes.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Target tests | `npx vitest run tests/api-client-errors.vitest.js` | all pass |
| Full suite | `npx vitest run 2>&1 \| tail -6` | all pass |
| Lint / coverage | `npm run lint` / `npm run test:coverage` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `js/constants.js` — add `TRANSCRIPTION_MAX_TOTAL_MS`
- `js/api-client.js` — deadline logic in `_fetchWithRetry` (+ a `_now()` helper, terminal throw)
- `tests/api-client-errors.vitest.js` — new tests; adjust ONLY assertions in
  the `Request Timeout Handling (AbortController)` describe if attempt counts
  change under the deadline (their *intent* — friendly timeout error, no raw
  AbortError — must be preserved)

**Out of scope** (do NOT touch):

- A user-facing cancel from PROCESSING — requires new FSM transitions
  (`STATE_TRANSITIONS` in `js/constants.js`) and island UI work; deferred to
  the maintainer (interaction-led design decisions live with them).
- `TRANSCRIPTION_TIMEOUT_MS`, `MAX_TRANSCRIPTION_RETRIES`, the backoff
  schedule, `MAX_RETRY_AFTER_MS` — values unchanged.
- `js/audio-handler.js`, the FSM, `js/ui.js` — the error already routes to
  the ERROR state with a retry affordance; nothing to change downstream.

## Git workflow

- Branch: `fix/007-retry-deadline`
- Single commit, e.g. `fix(api): bound total transcription retry time with an overall deadline`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the constant

In `js/constants.js`, directly after the `TRANSCRIPTION_TIMEOUT_MS` export
(~line 342), add with matching JSDoc style:

```js
/**
 * Overall deadline for one transcription call across ALL retry attempts and
 * backoff sleeps. A single in-flight attempt still gets its full
 * TRANSCRIPTION_TIMEOUT_MS window; this stops further attempts/sleeps from
 * being scheduled past the deadline, so PROCESSING can never strand the user
 * for the multi-minute worst case (~17 min) the per-attempt timeout alone allows.
 *
 * @constant {number} TRANSCRIPTION_MAX_TOTAL_MS
 * @default 180000
 */
export const TRANSCRIPTION_MAX_TOTAL_MS = 180000;
```

**Verify**: `node -e "import('./js/constants.js').then(m => console.log(m.TRANSCRIPTION_MAX_TOTAL_MS))"` → `180000`

### Step 2: Add an injectable clock

In `js/api-client.js`, add a small private method near `_sleep`:

```js
    _now() {
        return Date.now();
    }
```

All deadline checks go through `this._now()` so tests control time by spying
on `_now` — independent of fake-timer Date behavior.

### Step 3: Enforce the deadline in `_fetchWithRetry`

Import `TRANSCRIPTION_MAX_TOTAL_MS` in the existing `./constants.js` import.
Modify `_fetchWithRetry` minimally:

1. First line of the method: `const deadline = this._now() + TRANSCRIPTION_MAX_TOTAL_MS;`
2. **Status-retry path** (line 155's condition): also treat the attempt as
   final when the deadline has passed, so the real API error (e.g. the 429
   message) surfaces instead of a vague timeout:

```js
                    if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)
                        || attempt === MAX_TRANSCRIPTION_RETRIES
                        || this._now() >= deadline) {
```

3. **Timeout-retry path** (the `catch` block): mirror the final-attempt guard:

```js
                if (attempt === MAX_TRANSCRIPTION_RETRIES || this._now() >= deadline) {
                    throw this._createTimeoutError();
                }
```

4. **Before each sleep**: don't start a backoff that ends past the deadline.
   Cleanest: pass `deadline` into `_retryAfter` and add as its first line:

```js
        if (this._now() + delayMs >= deadline) {
            throw this._createTimeoutError();
        }
```

   (Update both `_retryAfter` call sites and its signature/JSDoc.)
5. **After the loop closes** (line 193), add a terminal
   `throw this._createTimeoutError();` so the function can never resolve
   `undefined` — today that invariant hangs on the single boolean at line 155.

**Verify**: `npx vitest run tests/api-client-errors.vitest.js 2>&1 | tail -20`.
Expected: the non-fake-timer tests (429 six-attempt contract, etc.) pass
untouched (`_sleep` stubbed + real `_now` ⇒ elapsed ≈ 0). The
`Request Timeout Handling` describe MAY now fail on attempt-count assertions
if vitest's fake timers advance `Date.now` — see Step 5.

### Step 4: Add deadline tests

In `tests/api-client-errors.vitest.js`, new
`describe('Overall retry deadline')`, reusing the suite's existing setup
(mocked fetch, `_sleep` stub). Control time via
`vi.spyOn(apiClient, '_now')` returning scripted values. Three tests:

1. **Retry-After storm surfaces the real API error**: fetch always resolves
   `status: 429` with `headers.get` returning `'60'`; script `_now` so the
   deadline passes after ~2 attempts. Assert: rejects with the 429 message
   (same string as the existing 429 test), `fetch` called **fewer than 6**
   times, and `API_REQUEST_ERROR` emitted once.
2. **Sleep-gate throws the friendly timeout**: script `_now` so the deadline
   trips at the `_retryAfter` gate (now + delay ≥ deadline). Assert rejection
   with `MESSAGES.REQUEST_TIMED_OUT` and `error.apiContext.timeout === true`
   shape preserved (model the assertion on the existing friendly-timeout test
   at `:641`).
3. **Deadline does not clip a healthy request**: single `ok: true` response
   with `_now` unscripted → resolves normally, `fetch` called once.

**Verify**: `npx vitest run tests/api-client-errors.vitest.js` → new tests pass.

### Step 5: Reconcile the fake-timer timeout suite

Run the timeout describe. Two possible outcomes:

- It still passes (fake timers don't advance `Date.now`): done — the suite
  exercises per-attempt timeouts exactly as before.
- Attempt-count assertions fail because faked `Date.now` advanced past the
  deadline (with 120 s attempts, the deadline now permits **2 attempts**
  before 180 s elapses): update ONLY the numeric expectations (e.g.
  `toHaveBeenCalledTimes(6)` → `2`) and any comment text, keeping every
  assertion about *behavior* (friendly `REQUEST_TIMED_OUT` message, no raw
  `AbortError`, single error emission) untouched. Add a one-line comment
  citing the deadline contract.

**Verify**: `npx vitest run tests/api-client-errors.vitest.js` → all pass.

### Step 6: Full gate

**Verify**: `npx vitest run 2>&1 | tail -6` all pass; `npm run lint` exit 0;
`npm run test:coverage` exit 0 (api-client branch coverage will rise).

## Test plan

- New (3): deadline-as-final-attempt on status retries; deadline at the sleep
  gate → `MESSAGES.REQUEST_TIMED_OUT`; healthy-request non-interference.
- Adjusted (possibly): attempt-count numbers inside
  `Request Timeout Handling (AbortController)` (`tests/api-client-errors.vitest.js:587-703`),
  behavior assertions preserved.
- Pattern exemplars: `_sleep` stub at `:75`; friendly-timeout assertions at
  `:641`; 429 contract at `:321-349`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "TRANSCRIPTION_MAX_TOTAL_MS" js/constants.js js/api-client.js` → one definition + import/uses
- [ ] `grep -n "throw this._createTimeoutError();" js/api-client.js` → includes one occurrence AFTER the `for` loop's closing brace (terminal guard)
- [ ] `npx vitest run tests/api-client-errors.vitest.js` → all pass, ≥3 new tests
- [ ] `npx vitest run` → full suite passes
- [ ] `npm run lint` and `npm run test:coverage` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `_fetchWithRetry` no longer matches the "Current state" excerpt (drift).
- Any test OUTSIDE `tests/api-client-errors.vitest.js` fails after the change
  (e.g. `tests/recording-integration.vitest.js`) — the deadline should be
  invisible to integration flows; a failure there means a hidden coupling.
- Preserving the timeout suite's behavior assertions requires weakening them
  (not just count changes) — report which assertion and why.
- You find yourself wanting to make `_sleep` abortable or add FSM transitions
  to get tests green — both are out of scope; report instead.

## Maintenance notes

- **Deferred deliberately**: a user-initiated cancel from PROCESSING (new FSM
  transition + island control). The deadline shrinks the worst case from
  ~17 min to ≤ deadline + one in-flight attempt (~5 min); a cancel affordance
  is the real UX fix and belongs to the maintainer's interaction design.
  If/when added, route it through the same `AbortController`.
- `TRANSCRIPTION_MAX_TOTAL_MS` is the tuning knob; if the maintainer finds
  3 min too aggressive for slow uploads of long clips, raise the constant —
  the tests built here assert mechanism, not the specific value (script
  `_now`, don't hardcode 180000 arithmetic into many assertions).
- Reviewers: confirm the status-path deadline surfaces the **real API error**
  (e.g. 429 text), and only the sleep/timeout paths surface `REQUEST_TIMED_OUT`.
