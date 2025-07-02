# JSDoc Style Guide

## Overview

This document defines the JSDoc documentation standards for the whisper-transcribe project. All public methods, classes, and modules must follow these conventions to maintain consistency and clarity.

## Basic Standards

### Module-Level Documentation
All modules should start with a @fileoverview tag and import the logger:

```javascript
/**
 * @fileoverview Brief description of the module's purpose.
 * More detailed explanation of what this module does and how it fits into the app.
 * 
 * @module ModuleName
 * @requires Logger
 * @requires EventBus
 * @since 1.0.0
 */

import { logger } from './logger.js';
```

### Class Documentation
```javascript
/**
 * Manages audio recording and playback functionality for the transcription app.
 * Handles MediaRecorder API integration, state management, and event coordination.
 * 
 * @class AudioHandler
 * @fires APP_EVENTS.RECORDING_STARTED
 * @fires APP_EVENTS.RECORDING_STOPPED
 * @example
 * const audioHandler = new AudioHandler(apiClient, ui, settings);
 * await audioHandler.startRecording();
 */
export class AudioHandler {
```

### Constructor Documentation
```javascript
/**
 * Creates an instance of AudioHandler.
 * 
 * @param {AzureAPIClient} apiClient - Azure API client for transcription
 * @param {UI} ui - UI controller instance for user interface updates
 * @param {Settings} settings - Settings manager for configuration
 */
constructor(apiClient, ui, settings) {
```

### Method Documentation
```javascript
/**
 * Starts the audio recording process with permission checks and state management.
 * Initializes MediaRecorder, sets up audio stream, and begins recording flow.
 * 
 * @async
 * @method startRecording
 * @returns {Promise<boolean>} Promise that resolves to true if recording started successfully
 * @throws {Error} When microphone permission is denied or MediaRecorder fails
 * @fires APP_EVENTS.RECORDING_STARTED
 * @fires APP_EVENTS.RECORDING_ERROR
 * 
 * @example
 * try {
 *   const success = await audioHandler.startRecording();
 *   if (success) {
 *     console.log('Recording started successfully');
 *   }
 * } catch (error) {
 *   console.error('Failed to start recording:', error);
 * }
 */
async startRecording() {
```

### Event Documentation
```javascript
/**
 * Emits recording state change events through the event bus.
 * 
 * @method emitStateChange
 * @param {string} newState - The new recording state
 * @param {Object} [data={}] - Additional state data
 * @fires APP_EVENTS.RECORDING_STATE_CHANGED
 * 
 * @example
 * this.emitStateChange(RECORDING_STATES.RECORDING, { timestamp: Date.now() });
 */
```

### Parameter Types

- **Primitives**: `{string}`, `{number}`, `{boolean}`
- **Objects**: `{Object}`, `{Object.<string, *>}` for generic objects
- **Arrays**: `{Array}`, `{Array.<string>}` for typed arrays
- **Functions**: `{Function}`, `{function(string): boolean}` for detailed signatures
- **Classes**: `{AudioHandler}`, `{UI}`, `{Settings}`
- **Events**: `{Event}`, `{CustomEvent}`
- **DOM**: `{HTMLElement}`, `{HTMLButtonElement}`
- **Optional**: `{string} [param]` or `{string=} param`
- **Union**: `{string|number}` for multiple types

### Return Value Documentation
```javascript
@returns {Promise<string>} Promise resolving to transcribed text
@returns {boolean} True if operation succeeded, false otherwise
@returns {Object} Configuration object with apiKey and uri properties
@returns {void} Method doesn't return a value
```

### Error Documentation
```javascript
@throws {Error} When required configuration is missing
@throws {TypeError} When invalid parameter type is provided
@throws {DOMException} When microphone access is denied
```

## Event-Driven Architecture Documentation

### Event Emission
```javascript
/**
 * @fires APP_EVENTS.PERMISSION_GRANTED
 * @fires APP_EVENTS.PERMISSION_DENIED
 */
```

### Event Listening
```javascript
/**
 * Sets up event bus listeners for cross-module communication.
 * Listens for API configuration changes and recording state updates.
 * 
 * @private
 * @method setupEventBusListeners
 * @listens APP_EVENTS.API_CONFIG_MISSING
 * @listens APP_EVENTS.SETTINGS_UPDATED
 */
```

## Module Documentation

### File Header
```javascript
/**
 * @fileoverview Audio recording and playback management for speech transcription.
 * Provides MediaRecorder integration, state management, and event coordination.
 * 
 * @module AudioHandler
 * @requires EventBus
 * @requires RecordingStateMachine
 * @requires PermissionManager
 */
```

## Examples and Usage

### Complex Method Examples
```javascript
/**
 * @example
 * // Basic usage
 * const result = await apiClient.transcribe(audioBlob);
 * console.log(result.text);
 * 
 * @example
 * // With progress callback
 * const result = await apiClient.transcribe(audioBlob, (status) => {
 *   console.log('Status:', status);
 * });
 */
```

## Constants Documentation
```javascript
/**
 * Application event names for event bus communication.
 * Prevents typos and provides centralized event management.
 * 
 * @constant {Object} APP_EVENTS
 * @property {string} RECORDING_STARTED - Emitted when recording begins
 * @property {string} RECORDING_STOPPED - Emitted when recording ends
 */
```

## Best Practices

1. **Be Descriptive**: Use clear, descriptive language
2. **Include Context**: Explain why methods exist, not just what they do
3. **Document Side Effects**: Mention DOM changes, event emissions, state changes
4. **Use Examples**: Include examples for complex usage patterns
5. **Keep Updated**: Update documentation when code changes
6. **Link Related Items**: Use `@see` to reference related methods/classes
7. **Document Async Behavior**: Always note async methods and their resolution values
8. **Use Proper Logging**: Follow logging guidelines for all examples

## Logging Guidelines

### Logger Import and Usage
All modules should import and use the centralized logger instead of console statements:

```javascript
import { logger } from './logger.js';

// Create module-specific logger
const moduleLogger = logger.child('ModuleName');
```

### Log Levels
Use appropriate log levels based on message importance:

```javascript
// DEBUG: Detailed debugging information (development only)
moduleLogger.debug('Processing audio chunk', { size: chunk.length, timestamp: Date.now() });

// INFO: General information about application flow
moduleLogger.info('User initiated recording session');
moduleLogger.info('Model changed to:', newModel);

// WARN: Warning messages for non-critical issues
moduleLogger.warn('API rate limit approaching');
moduleLogger.warn('Configuration incomplete, using defaults');

// ERROR: Error messages for critical issues (always shown)
moduleLogger.error('Failed to start recording:', error);
moduleLogger.error('API request failed:', { status: 500, url: '/api/transcribe' });
```

### JSDoc Examples with Logging
Update all JSDoc examples to use logger instead of console:

```javascript
/**
 * Validates API configuration and credentials.
 * 
 * @returns {Object} Configuration object with model, apiKey, and uri
 * @throws {Error} When configuration is invalid
 * 
 * @example
 * try {
 *   const config = apiClient.validateConfig();
 *   logger.info('Configuration is valid:', config);
 * } catch (error) {
 *   logger.error('Configuration invalid:', error.message);
 * }
 */
```

### Logging Best Practices
1. **Use Module Context**: Always create module-specific loggers with `logger.child()`
2. **Include Relevant Data**: Log important context data with messages
3. **Don't Log Sensitive Data**: Avoid logging API keys, passwords, or personal information
4. **Use Appropriate Levels**: DEBUG for development, INFO for important events, WARN for issues, ERROR for failures
5. **Be Consistent**: Use the same logging patterns across similar operations
6. **Log State Changes**: Important state transitions should be logged at INFO level
7. **Log Errors with Context**: Include error objects and relevant context data

### Environment Behavior
- **Development**: All log levels shown (DEBUG, INFO, WARN, ERROR)
- **Production**: Only ERROR level messages shown by default
- **Debug Override**: Add `?debug` to URL to enable debug logging in any environment

## Validation

Run JSDoc generation to verify documentation:
```bash
npm run docs
```

Check generated documentation in `docs/index.html` for completeness and accuracy.
