---
title: Azure API Client Design Specification
version: 1.1
date_created: 2025-07-07
last_updated: 2026-04-06
owner: Speech-to-Text Transcription App Team
tags: [design, api-client, azure, transcription, architecture, app]
---

# Introduction

This specification outlines the design and implementation requirements for the `AzureAPIClient` component. This client is responsible for all interactions with the Azure Speech Services API, including request formation, configuration validation, error handling, and response parsing for audio transcription.

## 1. Purpose & Scope

The purpose of the `AzureAPIClient` is to abstract all details of communicating with the Azure Speech Services API into a single, dedicated module. It provides a clean interface for other components, like the `AudioHandler`, to request transcriptions without needing to know the underlying details of the API protocol, authentication, or error handling.

**Intended Audience**: Software developers, system architects, and QA engineers.

**Assumptions**:
- The application uses the `fetch` API for HTTP requests.
- API configuration is managed and provided by a separate `Settings` module.
- All inter-module communication for status updates and errors occurs through a central `EventBus`.

## 2. Definitions

- **API Client**: A module that encapsulates the logic for making requests to a remote API.
- **Azure Speech Services**: Microsoft's cloud-based service for speech-to-text and other speech-related functionalities.
- **Whisper**: A speech recognition model provided by OpenAI and accessible through Azure.
- **Whisper-Translate**: A variant of the Whisper model that includes translation capabilities.
- **MAI-Transcribe**: A Microsoft Azure AI transcription model (mai-transcribe-1) that requires WAV audio input and uses a definition-based configuration payload.
- **Audio Converter**: A utility module that converts WebM/Opus audio blobs to 16kHz mono WAV format, required by MAI-Transcribe.
- **API Key**: A secret token used to authenticate requests to the Azure API.
- **Endpoint URI**: The specific URL where the Azure Speech Service is hosted.
- **CORS**: Cross-Origin Resource Sharing, a mechanism that allows resources to be requested from another domain.

## 3. Requirements, Constraints & Guidelines

### Core Requirements

- **REQ-001**: The client SHALL send audio data to the configured Azure Speech Services endpoint for transcription.
- **REQ-002**: The client SHALL support "Whisper", "whisper-translate", and "MAI-Transcribe" transcription models.
- **REQ-003**: The client SHALL retrieve API configuration (API Key, URI, model) from the `Settings` module.
- **REQ-004**: The client SHALL validate the presence and format of the API Key and URI before making a request.
- **REQ-005**: The client SHALL construct a `FormData` object to send the audio blob and relevant parameters. For Whisper models, the form includes a `file` field and `language` (except for whisper-translate). For MAI-Transcribe, the form includes an `audio` field (WAV-converted blob) and a JSON `definition` field.
- **REQ-006**: The client SHALL set the appropriate authentication header: `api-key` for Whisper models, or `Ocp-Apim-Subscription-Key` for MAI-Transcribe.
- **REQ-007**: The client SHALL parse the API response using structural detection, handling plain text, JSON with `text` field, and JSON with `combinedPhrases` array.
- **REQ-008**: The client SHALL emit events for the start, success, and failure of an API request.
- **REQ-008a**: The client SHALL convert audio to WAV format before sending to the MAI-Transcribe model, using the `audio-converter` module.

### Error Handling Requirements

- **REQ-009**: The client SHALL handle network errors (e.g., timeouts, connection failures) gracefully.
- **REQ-010**: The client SHALL handle API error responses, including standard HTTP status codes (400, 401, 403, 429, 500).
- **REQ-011**: The client SHALL throw an error if the configuration is invalid during a transcription attempt.
- **REQ-012**: The client SHALL emit an `API_CONFIG_MISSING` event when `validateConfig` is called with invalid settings.
- **REQ-013**: The client SHALL emit an `API_REQUEST_ERROR` event with detailed error information upon failure.
- **REQ-014**: The client SHALL use the centralized `ErrorHandler` module for standardized error logging.

### Constraints

- **CON-001**: The client MUST NOT interact directly with the DOM.
- **CON-002**: The client MUST be instantiated with a reference to the `Settings` module.
- **CON-003**: The client MUST NOT store API credentials locally; it must retrieve them from the `Settings` module for each request.

### Guidelines

- **GUD-001**: Use the `fetch` API for all HTTP requests.
- **GUD-002**: Provide clear, user-friendly status messages via the optional `onProgress` callback.
- **GUD-003**: Log detailed error information for debugging purposes without exposing sensitive data.

### Patterns

- **PAT-001**: **Facade Pattern**: The `AzureAPIClient` acts as a facade, simplifying the complex process of interacting with the Azure API.
- **PAT-002**: **Dependency Injection**: The `Settings` module is injected into the client's constructor, decoupling the client from the direct management of settings.

## 4. Interfaces & Data Contracts

### AzureAPIClient Class Interface

```javascript
class AzureAPIClient {
    /**
     * @param {Settings} settings - The settings manager instance.
     */
    constructor(settings)

    /**
     * Transcribes an audio blob.
     * @param {Blob} audioBlob - The audio data to transcribe.
     * @param {Function} [onProgress] - Optional callback for progress updates.
     * @returns {Promise<string>} The transcription text.
     */
    async transcribe(audioBlob, onProgress)

    /**
     * Validates the current API configuration.
     * @returns {{ apiKey: string, uri: string, model: string }} The validated configuration.
     * @throws {Error} If configuration is invalid.
     */
    validateConfig()

    /**
     * Parses the raw API response using structural detection.
     * @param {string|Object} data - The raw response data.
     * @returns {string} The parsed transcription text.
     * @throws {Error} When response format is unrecognized.
     */
    parseResponse(data)

    /**
     * Handles API errors by logging and emitting standardized events.
     * @private
     * @param {Error} error - The error object to handle.
     * @param {Object} [context={}] - Additional error context (status, details).
     */
    _handleApiError(error, context)

    /**
     * Extracts a human-readable error message from an API error response body.
     * @private
     * @param {string} errorText - Raw error response body.
     * @returns {string|null} Extracted message or null if unparseable.
     */
    _extractErrorDetail(errorText)
}
```

### Model-Specific Parameters

| Model | FormData Fields | Auth Header | Filename |
|---|---|---|---|
| `whisper` | `file` (audio blob), `language` | `api-key` | `recording.webm` |
| `whisper-translate` | `file` (audio blob) | `api-key` | `recording.webm` |
| `mai-transcribe` | `audio` (WAV blob), `definition` (JSON) | `Ocp-Apim-Subscription-Key` | `recording.wav` |

**Note**: For MAI-Transcribe, the `definition` field contains a JSON payload with `enhancedMode` configuration specifying model `mai-transcribe-1` and task `transcribe`. Audio must be converted from WebM to 16kHz mono WAV before submission.

### Event Emission Contracts

| Event Name | Data Payload | Description |
|---|---|---|
| `API_REQUEST_START` | `{ model: string, message: string }` | Fired when the transcription request is initiated. |
| `API_REQUEST_SUCCESS` | `{ model: string, transcriptionLength: number }` | Fired when transcription is successfully completed. |
| `API_REQUEST_ERROR` | `{ error: string, status?: number, details?: string }` | Fired when any error occurs during the API call. |
| `API_CONFIG_MISSING`| `{ missing: string, model: string }` | Fired by `validateConfig` if settings are invalid. |

## 5. Acceptance Criteria

- **AC-001**: **Given** a valid audio blob and complete configuration, **When** `transcribe` is called, **Then** it returns the transcribed text as a string and emits `API_REQUEST_START` and `API_REQUEST_SUCCESS`.
- **AC-002**: **Given** a missing API key, **When** `validateConfig` is called, **Then** it throws an error and emits `API_CONFIG_MISSING`.
- **AC-003**: **Given** an invalid URI format, **When** `validateConfig` is called, **Then** it throws an error and emits `API_CONFIG_MISSING`.
- **AC-004**: **Given** the `fetch` call is rejected due to a network error, **When** `transcribe` is called, **Then** it throws an error and emits `API_REQUEST_ERROR` with the network error message.
- **AC-005**: **Given** the API responds with a 401 status code, **When** `transcribe` is called, **Then** it throws an error and emits `API_REQUEST_ERROR` with status 401 and details.
- **AC-006**: **Given** the API responds with a JSON object containing `combinedPhrases` for a MAI-Transcribe request, **When** `parseResponse` is called, **Then** it correctly extracts and joins the text from each phrase in `combinedPhrases`.
- **AC-007**: **Given** the API responds with plain text, **When** `parseResponse(data)` is called, **Then** it returns the trimmed text.
- **AC-008**: **Given** a whisper-translate model request, **When** `transcribe` is called, **Then** the language parameter is NOT included in the FormData.
- **AC-009**: **Given** a MAI-Transcribe model request, **When** `transcribe` is called, **Then** the audio blob is converted to WAV format, submitted under the `audio` field with filename `recording.wav`, and a JSON `definition` field is included with `enhancedMode` configuration.

## 6. Test Automation Strategy

- **Unit Tests**: Focus on `validateConfig`, `parseResponse`, `_handleApiError`, and `_extractErrorDetail` methods with various inputs. Test `parseResponse` with plain text, JSON with `text` field, JSON with `combinedPhrases`, and unrecognized formats. Mock the `Settings` module and `fetch` API.
- **Integration Tests**: Test the `transcribe` method by mocking `fetch` responses to simulate successful calls, network errors, and different HTTP error codes (401, 403, 500). Mock `convertToWav` from `audio-converter.js` for MAI-Transcribe test paths. Verify that correct events are emitted on the `EventBus`.
- **Frameworks**: Use **Vitest** for testing and **`vi.fn()`** for mocking dependencies like `Settings` and the global `fetch` function.

## 7. Rationale & Context

A dedicated `AzureAPIClient` is crucial for maintaining a clean, modular architecture. It isolates the external API communication logic, which is prone to change (e.g., new API versions, different error codes). This separation of concerns makes the application easier to maintain, test, and extend. For example, adding a new transcription service would involve creating a new client that adheres to the same interface, with minimal changes to the rest of the application.

## 8. Dependencies & External Integrations

### Module Dependencies
- **DEP-001**: `Settings` module: To get API configuration.
- **DEP-002**: `EventBus` module: To emit lifecycle events.
- **DEP-003**: `Constants` module: For API parameters and messages.
- **DEP-004**: `ErrorHandler` module: For centralized error logging.
- **DEP-005**: `audio-converter` module (`convertToWav`): To convert WebM audio to WAV format for MAI-Transcribe.
- **DEP-006**: `Logger` module: For structured, context-aware debug logging.

### Browser API Dependencies
- **API-001**: `fetch`: For making HTTP POST requests.
- **API-002**: `FormData`: For building the request body.
- **API-003**: `Blob`: For handling audio data.

### External Service Dependencies
- **SVC-001**: **Azure Speech Services API**: The remote service that performs the transcription.

## 9. Examples & Edge Cases

### Successful Transcription Call

```javascript
// Assumes apiClient is an instance of AzureAPIClient
try {
    const audioBlob = new Blob([...]);
    const transcription = await apiClient.transcribe(audioBlob, (progress) => {
        console.log(progress); // e.g., "Sending to Azure Whisper API..."
    });
    console.log('Success:', transcription); // transcription is a string
} catch (error) {
    console.error('Transcription failed:', error.message);
}
```

### Handling Configuration Error

```javascript
// In AudioHandler, before starting a recording flow
try {
    apiClient.validateConfig();
} catch (error) {
    // The API_CONFIG_MISSING event will trigger the settings modal
    console.error('Configuration is invalid:', error.message);
}
```

### Edge Case: API returns an unexpected JSON structure

The `parseResponse` method should be robust enough to handle unexpected response formats without crashing.

```javascript
// Malformed JSON response
const malformedData = { some_unexpected_key: "some_value" };

// parseResponse should throw an error with a clear message for unrecognized formats
try {
    const text = apiClient.parseResponse(malformedData);
} catch (error) {
    expect(error.message).toBe('Unknown API response format. Please check your API configuration.');
}
```

### Model-Specific Request Examples

```javascript
// Whisper model - includes language parameter
const whisperFormData = new FormData();
whisperFormData.append('file', audioBlob, 'recording.webm');
whisperFormData.append('language', 'en');

// Whisper-translate model - no language parameter
const translateFormData = new FormData();
translateFormData.append('file', audioBlob, 'recording.webm');
// Note: language parameter is intentionally omitted

// MAI-Transcribe model - WAV audio with JSON definition
const wavBlob = await convertToWav(audioBlob);
const maiFormData = new FormData();
maiFormData.append('audio', wavBlob, 'recording.wav');
maiFormData.append('definition', JSON.stringify({
    enhancedMode: {
        enabled: true,
        model: 'mai-transcribe-1',
        task: 'transcribe'
    }
}));
```

### Edge Case: MAI-Transcribe combinedPhrases response

```javascript
// MAI-Transcribe JSON response with combinedPhrases
const maiResponse = {
    combinedPhrases: [
        { text: "Hello world." },
        { text: "How are you?" }
    ]
};
const text = apiClient.parseResponse(maiResponse);
// Returns: "Hello world. How are you?"
```

## 10. Validation Criteria

- The implementation must pass all unit and integration tests defined in the test strategy.
- The client must successfully transcribe audio using Whisper, Whisper-Translate, and MAI-Transcribe models with valid credentials.
- All error conditions (network, API, configuration) must be handled gracefully and result in the correct event emissions.
- Code coverage for `api-client.js` must meet or exceed the project's threshold of 85%.

## 11. Related Specifications / Further Reading

- **Recording State Machine Design Specification**: For context on how the API client is used during the `PROCESSING` state.
- **Settings Management Specification**: For details on how API configurations are stored and retrieved.
- **Azure Speech Services REST API Documentation**: For official details on endpoints, parameters, and error codes.
