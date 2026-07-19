---
title: Azure API Client Design Specification
version: 2.0
date_created: 2025-07-07
last_updated: 2026-07-18
owner: Speech-to-Text Transcription App Team
tags: [design, api-client, azure, transcription, authentication, architecture, app]
---

# Introduction

This specification defines the implemented bearer-only contract for
`AzureAPIClient` and the two registered Transcription Model adapters. The client
is the application's single Azure request boundary: it validates manual Target
URI configuration, acquires a request-local token through an injected provider,
constructs bearer authorization, executes bounded requests, classifies errors,
and parses the selected model's response.

## 1. Purpose and scope

`AzureAPIClient` lets `AudioHandler` and `SelectedAudioController` submit an
Audio Source without knowing MSAL, Azure authentication headers, endpoint request
shapes, or response shapes. It does not own sign-in, browser token caching,
Settings persistence, legacy cleanup, audio-source state, transcript persistence,
or Azure RBAC.

The implementation uses the browser `fetch`, `FormData`, `Blob`, `URL`, and
`AbortController` APIs. It has no backend proxy.

## 2. Domain definitions

- **User**: a person using Whisper Transcribe.
- **Bring-your-own Azure**: each User authorizes an Azure transcription resource
  available to them; its owner retains access, quota, and billing responsibility.
- **Transcription Model**: the selected Azure speech model. Selection determines
  which Target URI is used.
- **Target URI**: the manual HTTPS endpoint address. It identifies the
  destination but does not authorize access.
- **Model Adapter**: an immutable registry entry that owns one model's scope,
  Target URI metadata, request body construction, and response parsing.
- **Token provider**: the injected `{ getToken(scope) }` interface that hides the
  `AuthenticationService` and MSAL implementation.

## 3. Ownership boundaries

| Concern | Owner | Constraint |
|---|---|---|
| MSAL initialization, account, redirects, silent acquisition, shared cache | `AuthenticationService` | MSAL alone owns its opaque localStorage artifacts; no request formation or Target URI access |
| Narrow token handoff | `createTokenProvider()` | Exposes only `getToken(scope)` and retains nothing |
| Model and manual Target URI persistence | `Settings` | Returns only `{ model, uri }` to the API client |
| Bearer header, HTTPS validation, timeout, retry, error category | `AzureAPIClient` | Sole application owner of `Authorization: Bearer ...` |
| Model scope, URI storage metadata, `FormData`, response parsing | Registered adapter | Credential-blind; never receives a token |
| Historical credential removal | `cleanupLegacyCredentials()` at bootstrap | Separate remove-only migration; never an API-client responsibility |
| User/resource authorization | Azure RBAC outside the app | The app diagnoses 403 but never assigns a role |

Application bootstrap MUST perform the targeted remove-only migration before
Settings/authentication initialization. That migration removes exactly the two
historical credential entries without reading, copying, rewriting, logging, or
emitting their values. It MUST NOT become configuration fallback.

## 4. Supported adapters

The registry contains exactly two adapters. Its insertion order remains MAI
first, then Whisper, because the public cross-shape `parseResponse()` helper
tries parsers in registry order.

| Model identifier | Label | Scope | Target URI metadata | Request body |
|---|---|---|---|---|
| `mai-transcribe-1.5` | Azure MAI-Transcribe 1.5 | `https://cognitiveservices.azure.com/.default` | `STORAGE_KEYS.MAI_TRANSCRIBE_URI` | WAV `audio` plus JSON `definition` with enhanced `transcribe` mode |
| `whisper` | Azure Whisper | `https://cognitiveservices.azure.com/.default` | `STORAGE_KEYS.WHISPER_URI` | Original audio in `file` plus the default `language` field |

The Whisper adapter rejects files larger than 25 MiB before submission and
preserves a supported source filename/container. The MAI adapter accepts the
supported source formats, converts to WAV through the existing worker/fallback,
and rejects a converted payload at or above 300 MiB. Model adapters MUST NOT
contain a credential field, authentication storage key, or header constructor.

## 5. Configuration and request lifecycle

### 5.1 Configuration validation

`validateConfig()` MUST:

1. read `{ model, uri }` from `Settings.getModelConfig()`;
2. remove whitespace from the URI string;
3. require a non-empty Target URI;
4. parse it with `URL`;
5. require the `https:` protocol; and
6. return only `{ model, uri }`.

A missing, malformed, or insecure Target URI emits `API_CONFIG_MISSING` with a
safe reason and model identifier, then fails before token acquisition or fetch.
Endpoint-family and deployment discovery remain outside the application; the
User supplies the Target URI manually.

### 5.2 Transcription sequence

For one `transcribe(audioBlob, onProgress)` call, the order is fixed:

```text
validate Settings configuration
  -> resolve selected adapter
  -> adapter builds browser FormData
  -> emit safe API_REQUEST_START metadata
  -> tokenProvider.getToken(adapter.scope)
  -> AzureAPIClient creates Authorization: Bearer <request-local-token>
  -> fetch Target URI with bounded timeout/retry
  -> selected adapter parses response
  -> emit safe API_REQUEST_SUCCESS metadata
```

The adapter builds `FormData`; browser code MUST NOT set `Content-Type` manually,
because the browser owns the multipart boundary. Token acquisition occurs after
body construction and immediately before the request options are created.

The client acquires one token per transcription call. The same local request
options may be reused only within that call's bounded retry loop. The token MUST
NOT be copied to a client property, adapter, Settings, application-managed
storage, event payload, log, error object, URL, response detail, screenshot,
trace, or artifact. Once the call settles, the application retains no reference.
MSAL's opaque token cache is separately owned by `AuthenticationService` in
shared `localStorage`; application code does not inspect, copy, migrate, or log
it. `temporaryCacheLocation` remains unconfigured so temporary OAuth artifacts
retain MSAL's default tab-scoped behavior. A new same-origin tab may start ready
from the shared account, while genuine interaction-required conditions still
fall back to the full-page redirect flow.

### 5.3 Successful response

The client reads JSON when the response `content-type` contains
`application/json`; otherwise it reads text. `transcribe()` uses only the active
adapter's parser. A successful result emits:

```javascript
{
    model: '<safe-model-id>',
    transcriptionLength: 0
}
```

The event contains length metadata, not transcript content. The caller then
emits `UI_TRANSCRIPTION_READY`; transcript persistence remains outside this
client.

## 6. Error and retry contract

| Condition | Client behavior | Retry behavior | Recovery owner |
|---|---|---|---|
| HTTP 401 | Create `AUTHENTICATION_REQUIRED`; do not read the body | Never | Authentication UI while retaining Unsent Recording/Selected Audio |
| HTTP 403 | Create `AZURE_AUTHORIZATION_DENIED`; do not read the body | Never | External resource-scoped RBAC guidance |
| HTTP 429 | Respect a valid `Retry-After` up to 60 seconds, otherwise exponential backoff | Bounded | Caller remains in processing/failure flow |
| HTTP 500/502/503/504 | Consume the body to release the connection, then back off | Bounded | Caller remains in processing/failure flow |
| Per-attempt `AbortError` | Retry under the same overall deadline; surface a friendly timeout at the limit | Bounded | Caller retains recoverable audio |
| Other fetch/runtime error | Propagate safe error handling | Never in client | Caller |
| Other non-success HTTP | Parse a service detail when possible and emit the standard error event | Never | Caller |

The implementation permits at most five retries after the initial attempt, uses
the 2/4/8/16/32-second schedule when no `Retry-After` applies, caps provider
delay at 60 seconds, guards each attempt with `TRANSCRIPTION_TIMEOUT_MS`
(120 seconds), and stops scheduling work at `TRANSCRIPTION_MAX_TOTAL_MS`
(180 seconds). A single already-started attempt retains its per-attempt timeout.

`_handleApiError()` emits one `API_REQUEST_ERROR`. Authentication and
authorization events contain only safe message, HTTP status, stable code, and
model. They never contain a response body or token.

## 7. Public interface

```javascript
class AzureAPIClient {
    constructor(settings, tokenProvider, adapterRegistry = modelAdapterRegistry)
    transcribe(audioBlob, onProgress?): Promise<string>
    validateConfig(): { model: string, uri: string }
    getScopeForModel(model): string
    parseResponse(data): string
}
```

`getScopeForModel()` returns the registered immutable adapter scope and is used
by authentication readiness before an Audio Source is activated.

`parseResponse()` is a compatibility helper that tries registered parsers in
order. Production `transcribe()` remains strict to the selected adapter.

## 8. Event contract

| Event | Safe payload |
|---|---|
| `API_CONFIG_MISSING` | missing reason and model identifier |
| `API_REQUEST_START` | model and display status message |
| `API_REQUEST_SUCCESS` | model and transcription length |
| `API_REQUEST_ERROR` | safe message plus optional status/code/model or non-auth service detail |

No event may contain an Audio Source, Target URI, bearer token, authentication
response, request headers, or transcript body. Event history MUST remain safe
when explicitly enabled for deterministic tests.

## 9. Acceptance criteria

- **AC-001**: Given either registered model and a valid HTTPS Target URI, the
  client asks the adapter to build the request before acquiring exactly one
  token for the adapter's Cognitive Services scope.
- **AC-002**: The one outbound authentication field is
  `Authorization: Bearer <token>`, added by `AzureAPIClient` immediately before
  fetch; adapters remain credential-blind.
- **AC-003**: No manual multipart `Content-Type` is set.
- **AC-004**: Missing, malformed, and HTTP Target URIs fail before token or
  network access and emit safe configuration metadata.
- **AC-005**: The registry contains exactly Whisper and MAI-Transcribe 1.5 and
  preserves parser precedence.
- **AC-006**: HTTP 401 and 403 neither read a response body nor retry and map to
  distinct stable codes.
- **AC-007**: HTTP 429 and 500/502/503/504 retries remain bounded by attempt,
  delay, per-attempt timeout, and total deadline.
- **AC-008**: A token is never visible through serialized client/provider state,
  adapter arguments, events, logs, storage, errors, or production artifacts.
- **AC-009**: The remove-only startup migration runs before the first bootstrap
  storage read and preserves all unrelated settings/transcript data.
- **AC-010**: Both microphone and Selected Audio submissions use this one client
  and converge on the same safe transcription-ready event path.

## 10. Verification

The primary deterministic coverage is:

- `tests/token-boundary.vitest.js` — narrow provider, call order, one bearer
  owner, no leakage, and retry-local reuse;
- `tests/api-client-validation.vitest.js` — model/URI validation and adapter
  selection;
- `tests/api-client-errors.vitest.js` — HTTPS, 401/403 body blindness, retry,
  timeout, and safe event behavior;
- `tests/model-adapters.vitest.js` and `tests/response-parsers.vitest.js` — exact
  two-model request/response contracts;
- `tests/legacy-credential-cleanup.vitest.js` — remove-only ordering and storage
  preservation;
- `tests/browser/transcription-smoke.spec.js` and
  `tests/browser/selected-audio.spec.js` — built-browser bearer/FormData paths
  with no private storage/event leakage;
- `tests/live-contract-hygiene.vitest.js` — guarded OIDC test seam and production
  bundle exclusion without making a live request.

Run the canonical coverage, lint, dependency, audit, size, and deterministic
browser gates after any authentication, adapter, request, or error change.
