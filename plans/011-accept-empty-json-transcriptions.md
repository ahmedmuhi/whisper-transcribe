# Plan 011: Accept structurally valid empty JSON transcriptions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 210a329..HEAD -- js/model-adapters/response-parsers.js tests/response-parsers.vitest.js spec/spec-design-api-client.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `210a329`, 2026-07-11

## Why this matters

The response parsers currently use truthiness to recognize JSON `text`, so a
successful transcription response containing `{ "text": "" }` is treated as
an unknown API response. An empty string is a valid string-shaped transcript
for silent or speechless audio and is already accepted when Azure returns a
plain-text response. Accepting it consistently prevents a false hard error and
retry offer; the existing UI already renders empty successful transcriptions as
`No transcription returned`.

Microsoft's Azure OpenAI REST schema describes transcription `text` as a
required string, and the Azure Speech fast/LLM transcription schemas use string
text inside their response phrases. The public documentation does not provide
a canonical silence payload, so this plan deliberately changes only structural
string recognition; it does not infer new response shapes.

## Current state

- `js/model-adapters/response-parsers.js` owns the shared Whisper and
  MAI-Transcribe response parsers.
- `tests/model-adapters.vitest.js` and `tests/mai-transcribe.vitest.js` cover
  non-empty adapter responses, unknown shapes, and parser precedence, but no
  test covers an empty JSON `text` string.
- `tests/api-client-errors.vitest.js:530-553` already establishes that an empty
  `text/plain` response is successful and emits `API_REQUEST_SUCCESS` with
  `transcriptionLength: 0`.
- `js/ui.js:743-749` already converts a falsy transcript into the user-facing
  `No transcription returned` placeholder, so no UI change is needed.
- `spec/spec-design-api-client.md` defines structural response parsing but does
  not state the empty-string contract.

Current parser checks (`js/model-adapters/response-parsers.js:7-32`):

```javascript
export function parseWhisperResponse(data) {
    if (typeof data === 'string') {
        return data.trim();
    }

    if (data.text) {
        return data.text;
    }

    throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
}

export function parseMaiTranscribeResponse(data) {
    if (typeof data === 'string') {
        return data.trim();
    }

    if (data.combinedPhrases && data.combinedPhrases.length > 0) {
        return data.combinedPhrases.map(phrase => phrase.text).join(' ');
    }

    if (data.text) {
        return data.text;
    }

    throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
}
```

Relevant downstream behavior (`js/ui.js:743-749`), which must remain unchanged:

```javascript
displayTranscription(text) {
    const incoming = text || 'No transcription returned';
    if (this.transcriptElement.value) {
        this.transcriptElement.value += TRANSCRIPT_SEGMENT_DIVIDER + incoming;
    } else {
        this.transcriptElement.value = incoming;
    }
```

Repository conventions to preserve:

- Tests use Vitest and the `tests/*.vitest.js` suffix.
- User-facing error strings come from `MESSAGES`; unknown structures must keep
  throwing `MESSAGES.UNKNOWN_API_RESPONSE`.
- MAI parser precedence is `combinedPhrases` before fallback `text`; do not
  reorder it.
- JSON transcription strings are currently returned without trimming. Preserve
  that behavior; only plain-text bodies are trimmed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted tests | `npx vitest run tests/response-parsers.vitest.js` | new parser tests pass |
| Full tests | `npm test` | all test files pass; baseline is 384 tests before this plan |
| Coverage | `npm run test:coverage` | exit 0 and all configured thresholds pass |
| Lint | `npm run lint` | exit 0, no errors |
| Dependency check | `npm run deps:check:prod` | exit 0 |
| Size budget | `npm run size` | exit 0; JavaScript remains below 100 kB |

## Suggested executor toolkit

- Use a test-driven-development workflow: add the failing parser tests first,
  observe the empty-string cases fail, then make the smallest parser change.
- Official schema references:
  - <https://learn.microsoft.com/en-us/azure/foundry/openai/reference>
  - <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/llm-speech>

## Scope

**In scope** (the only implementation/design files you should modify):

- `js/model-adapters/response-parsers.js`
- `tests/response-parsers.vitest.js` (create)
- `spec/spec-design-api-client.md`
- `plans/README.md` (status update only)

**Out of scope** (do NOT touch, even though they look related):

- `js/api-client.js` — adapter delegation and retry behavior are already correct.
- `js/audio-handler.js` — its success/error routing needs no change.
- `js/ui.js` and `js/constants.js` — keep the existing empty-result placeholder
  and messages; do not redesign the empty-transcription UX.
- `tests/api-client-errors.vitest.js` — its empty plain-text integration test is
  already the downstream regression guard.
- Accepting an empty `combinedPhrases: []` array when no string `text` fallback
  exists. Microsoft documents `combinedPhrases` as the transcript container but
  does not document an empty array as a successful silence shape.
- Trimming JSON `text`, filtering empty MAI phrases, or normalizing whitespace.

## Git workflow

- Branch: `fix/011-empty-json-transcriptions`
- Make one atomic commit after all gates pass.
- Commit message: `fix(api): accept empty JSON transcription text`
- Do NOT push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Add focused parser characterization and regression tests

Create `tests/response-parsers.vitest.js`. Import `describe`, `expect`, and `it`
from Vitest; import both parser functions from
`../js/model-adapters/response-parsers.js`; import `MESSAGES` from
`../js/constants.js`.

Cover these behaviors as separate tests:

1. `parseWhisperResponse({ text: '' })` returns `''`.
2. `parseMaiTranscribeResponse({ text: '' })` returns `''`.
3. `parseMaiTranscribeResponse({ combinedPhrases: [], text: '' })` returns the
   empty fallback string, demonstrating that an explicitly present fallback is
   accepted without treating an undocumented bare empty array as valid.
4. Both parsers still throw `MESSAGES.UNKNOWN_API_RESPONSE` for `{}` and for
   `{ text: null }`; a present field is accepted only when its value is a string.
5. `parseMaiTranscribeResponse({ combinedPhrases: [] })` still throws
   `MESSAGES.UNKNOWN_API_RESPONSE`.

Run the tests before editing production code and confirm cases 1–3 fail for the
expected reason. Cases 4–5 should already pass.

**Verify (RED)**: `npx vitest run tests/response-parsers.vitest.js` → exits
non-zero; only the empty-string acceptance cases fail.

### Step 2: Recognize JSON text by type instead of truthiness

In both parser functions in `js/model-adapters/response-parsers.js`, replace the
truthy `data.text` fallback with a null-safe string type check:

```javascript
if (typeof data?.text === 'string') {
    return data.text;
}
```

Do not change the string-body branch or MAI `combinedPhrases` precedence. Do not
add a shared helper for two identical checks; the local checks are clearer and
avoid unnecessary abstraction.

**Verify (GREEN)**: `npx vitest run tests/response-parsers.vitest.js` → all new
tests pass.

### Step 3: Record the clarified response contract in the API-client spec

Update `spec/spec-design-api-client.md`:

- Bump the document version and `last_updated` date.
- Amend `REQ-007` to state that a present string `text` field is valid even when
  empty, while absent or non-string text remains an unknown response shape.
- Add an acceptance criterion for JSON `{ "text": "" }` returning `''` without
  an API error.
- Add empty JSON text to the unit-test strategy.

Do not change model identifiers, request construction, or unrelated examples.

**Verify**: `rg -n "empty|REQ-007|AC-" spec/spec-design-api-client.md` → shows
the requirement, acceptance criterion, and test-strategy coverage for empty
JSON text.

### Step 4: Run all repository gates and review scope

Run the full tests, coverage, lint, production dependency check, and size
budget using the commands above. Then inspect the diff and confirm only the
in-scope files changed. Update plan 011's status in `plans/README.md` only after
all gates pass.

**Verify**:

```bash
npm test && npm run test:coverage && npm run lint && npm run deps:check:prod && npm run size
git diff --check
git status --short
```

Expected: every command exits 0; status lists only
`js/model-adapters/response-parsers.js`, `tests/response-parsers.vitest.js`,
`spec/spec-design-api-client.md`, and the plan status update.

## Test plan

- Create `tests/response-parsers.vitest.js` as a small, dependency-free unit
  suite for the two pure parser functions.
- Regression cases: empty Whisper JSON text, empty MAI fallback JSON text, and
  empty MAI fallback alongside an empty `combinedPhrases` array.
- Safety cases: missing text, non-string text, and bare empty
  `combinedPhrases` remain rejected with `MESSAGES.UNKNOWN_API_RESPONSE`.
- Existing end-to-end parser delegation remains covered by
  `tests/model-adapters.vitest.js`; existing empty plain-text success remains
  covered by `tests/api-client-errors.vitest.js:530-553`.
- Verification: `npx vitest run tests/response-parsers.vitest.js` passes, then
  `npm test` passes with at least 389 tests (384 baseline plus 5 new tests; the
  exact count may be higher if concurrent work has added tests).

## Done criteria

- [ ] `parseWhisperResponse({ text: '' })` returns `''`.
- [ ] `parseMaiTranscribeResponse({ text: '' })` returns `''`.
- [ ] Empty/missing/non-string response shapes remain rejected as specified.
- [ ] MAI `combinedPhrases` retains precedence over fallback `text`.
- [ ] `npx vitest run tests/response-parsers.vitest.js` exits 0.
- [ ] `npm test` and `npm run test:coverage` exit 0.
- [ ] `npm run lint`, `npm run deps:check:prod`, and `npm run size` exit 0.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] No implementation files outside the in-scope list are modified.
- [ ] `plans/README.md` marks plan 011 DONE only after verification passes.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows that either parser or the API-client spec changed after
  commit `210a329` and no longer matches the excerpts above.
- A live or fixture response demonstrates that silence is represented by a
  shape other than a string `text` field; capture the shape without credentials
  or audio content and request a plan revision.
- Correct behavior requires accepting a bare empty `combinedPhrases` array,
  changing retry semantics, or changing the UI placeholder.
- The change requires touching any out-of-scope implementation file.
- A verification command fails twice after one reasonable correction attempt.

## Maintenance notes

- Reviewers should verify that the condition checks the value's type, not mere
  property existence; `{ text: null }` must not silently become success.
- If future adapters introduce another structured transcript field, add its
  valid empty-value behavior to that adapter rather than broadening the public
  parser heuristically.
- The UI currently treats empty text as a successful no-transcription result.
  Any future UX change to distinguish silence from empty service output should
  be planned separately across API, event payload, and UI layers.
