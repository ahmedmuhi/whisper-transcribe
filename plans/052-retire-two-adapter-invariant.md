# Plan 052: Replace the "exactly two adapters" invariant with an adapter contract and an addition checklist

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4597f2..HEAD -- CLAUDE.md spec/spec-design-api-client.md js/model-adapters/index.js tests/live-contract-hygiene.vitest.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (blocks plans 053 and 054)
- **Category**: docs
- **Planned at**: commit `b4597f2`, 2026-08-07

## Why this matters

The repo states "exactly two adapters" normatively in three places: CLAUDE.md
(the executor guide), the API-client spec, and a hygiene test that hard-counts
the two model ids. A third model (`gpt-transcribe`, plan 054) is therefore
textually forbidden before any code is written, and an executor following
CLAUDE.md will refuse or thrash. This plan rewords the invariant from a count
into a contract (what an adapter must declare), adds an adapter-addition
checklist, and makes the hygiene test derive from the registry rather than a
hard-coded pair. It changes no runtime behavior.

## Current state

- `CLAUDE.md`, section "Models, Settings, and the settings surface" begins:

```
Exactly two adapters are registered, in response-parser precedence order:

1. `maiTranscribe15ModelAdapter` (`mai-transcribe-1.5`)
2. `whisperModelAdapter` (`whisper`)
```

- `spec/spec-design-api-client.md`, section "## 4. Supported adapters"
  (lines ~64–80):

```
The registry contains exactly two adapters. Its insertion order remains MAI
first, then Whisper, because the public cross-shape `parseResponse()` helper
tries parsers in registry order.
```

followed by a two-row adapter table.

- `js/model-adapters/index.js:8`:

```js
// Order matters for AzureAPIClient.parseResponse(): MAI's structured shape is checked first.
```

- `tests/live-contract-hygiene.vitest.js:68-78`:

```js
it('defines exactly one guarded transcription case per supported model', () => {
    const spec = readRepoFile(paths.transcriptionSpec);
    expect(spec.match(/model:\s*'whisper'/gu)).toHaveLength(1);
    expect(spec.match(/model:\s*'mai-transcribe-1\.5'/gu)).toHaveLength(1);
    ...
```

- Fact: production transcription uses the strict active-adapter path
  (`js/api-client.js:81` `adapter.parseResponse(data)`); the cross-shape
  `parseResponse()` helper (`js/api-client.js:426`) is called only by tests,
  so registry order affects no production behavior. (Removing that helper is
  a separate backlog item — do NOT remove it in this plan.)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Hygiene test | `npx vitest run tests/live-contract-hygiene.vitest.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `CLAUDE.md` (the identified section only)
- `spec/spec-design-api-client.md` (section 4 and the registry-order sentence)
- `js/model-adapters/index.js` (the line-8 comment only — no code)
- `tests/live-contract-hygiene.vitest.js` (the exactly-one-per-model test)

**Out of scope** (do NOT touch):
- `js/api-client.js` — do not delete `parseResponse()` here.
- Adapter source files, `js/settings.js`, `index.html`.
- Any other CLAUDE.md section (especially the credential rules).
- `tests/browser-live/` specs themselves.

## Git workflow

- Branch: `advisor/052-adapter-contract-docs`
- Commit style: e.g. `docs(models): replace two-adapter count invariant with adapter contract`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reword CLAUDE.md

Replace the "Exactly two adapters are registered, in response-parser
precedence order:" opening (and its numbered list) with a contract statement:

```
The adapter registry in `js/model-adapters/index.js` is the source of truth
for supported models. Every registered adapter declares: an immutable `id`,
`label`, `scope`, `storageKeys.uri`, a `buildRequest` returning
`{ body, statusMessage }`, and a `parseResponse`. Registry insertion order
carries no production semantics. Adding a model follows the adapter-addition
checklist in `spec/spec-design-api-client.md`.
```

Keep the rest of the section (persistence rules, no-credential rule) intact.

**Verify**: `grep -n "Exactly two adapters" CLAUDE.md` → no matches

### Step 2: Reword the spec and add the checklist

In `spec/spec-design-api-client.md` section 4: replace the "contains exactly
two adapters… tries parsers in registry order" paragraph with "The registry
is the source of truth for supported models; insertion order carries no
production semantics (the legacy cross-shape `parseResponse()` helper is
test-only)." Keep the adapter table (it now documents current entries, not a
closed set). Append an **Adapter-addition checklist** subsection listing the
sites a new model touches today:

1. `js/model-adapters/<model>.js` — frozen adapter object (pattern:
   `js/model-adapters/whisper.js`)
2. `js/model-adapters/index.js` — registry entry
3. `js/constants.js` — `MODEL_TYPES`, `STORAGE_KEYS.<MODEL>_URI`,
   `ELEMENT_IDS` for the URI input/badge, `MESSAGES.SENDING_TO_<MODEL>`,
   upload-limit constant
4. `index.html` — both model `<select>`s, Connection URI row,
   `ready-<id>` / `tooLarge-<id>` selected-audio panels
5. `js/selected-audio-controller.js` — selection-time size gate
6. Tests: adapter unit tests, settings persistence, hygiene expectations
7. `tests/browser-live/` guarded case + protected Target URI (operator-gated)

(Note in the checklist that plan 053 collapses items 3–5 into
adapter-declared metadata; the checklist should be updated when it lands.)

**Verify**: `grep -n "exactly two adapters" spec/spec-design-api-client.md` → no matches

### Step 3: Fix the registry comment

Replace `js/model-adapters/index.js:8` comment with:

```js
// Registry insertion order carries no production semantics; transcribe() uses the active adapter only.
```

**Verify**: `npm run lint` → exit 0

### Step 4: Derive the hygiene test from the registry

In `tests/live-contract-hygiene.vitest.js`, rework the
exactly-one-per-model test to import `modelAdapterRegistry` from
`js/model-adapters/index.js` and iterate its keys:

```js
for (const id of modelAdapterRegistry.keys()) {
    const pattern = new RegExp(`model:\\s*'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'gu');
    expect(spec.match(pattern)).toHaveLength(1);
}
```

Keep every other assertion in that test (protected names, hostname suffixes)
exactly as-is. The test must still FAIL if a registered model has no guarded
live case — that is its purpose; it just should not hard-code the model list.

**Verify**: `npx vitest run tests/live-contract-hygiene.vitest.js` → all pass

## Test plan

No new behavior; Step 4 is the only test change. Full-suite run confirms no
other test asserts the removed sentences
(`grep -rn "exactly two" tests/ js/ CLAUDE.md spec/`).

## Done criteria

- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -rin "exactly two adapters" .` (excluding `plans/`, `.git`,
      `node_modules`) → no matches
- [ ] Hygiene test iterates the registry (no literal model-id count pair)
- [ ] Spec contains the adapter-addition checklist
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code/docs (drift).
- Importing the registry into the hygiene test creates a circular or
  environment problem under Vitest (it should not — the registry is pure ESM
  with no DOM access — but report rather than adding mocks).
- You find a production call site of `AzureAPIClient.parseResponse()` — the
  premise "test-only" would be false; report it.

## Maintenance notes

- Plan 054 adds `gpt-transcribe`; when it lands, the hygiene test will demand
  a matching guarded live case — the plan for that adapter deliberately
  defers the live-contract registration to the operator (see 054's scope).
- Backlog (not this plan): delete the legacy `parseResponse()` helper and its
  tests entirely.
