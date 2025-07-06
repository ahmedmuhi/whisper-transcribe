---
title: Recording State Machine Design Specification
version: 1.0
date_created: 2025-07-07
last_updated: 2025-07-07
owner: Speech-to-Text Transcription App Team
tags: [design, state-machine, recording, audio, architecture, app]
---

# Introduction

This specification defines the design and implementation requirements for the Recording State Machine component within the Speech-to-Text Transcription App. The Recording State Machine manages the complete audio recording lifecycle using a finite state machine pattern, ensuring safe state transitions and coordinating UI updates through event-driven communication.

## 1. Purpose & Scope

This specification defines the requirements for a finite state machine that manages audio recording operations in a browser-based speech transcription application. The state machine ensures valid state transitions, handles state-specific business logic, and coordinates communication between audio recording operations and UI components through an event bus system.

**Intended Audience**: Software developers, system architects, and QA engineers working on the speech transcription application.

**Assumptions**: 
- The application uses vanilla JavaScript with ES6 modules
- Browser environment with MediaRecorder API support
- Event-driven architecture with a central event bus
- Azure Speech Services integration for transcription

## 2. Definitions

- **FSM**: Finite State Machine - a computational model with a finite number of states and defined transitions
- **State Transition**: The process of moving from one state to another based on defined rules
- **Event Bus**: Central communication system for decoupled module interaction
- **MediaRecorder**: Browser API for recording audio/video streams
- **State Handler**: Method that executes state-specific logic when entering a state
- **Azure Speech Services**: Microsoft cloud service for speech-to-text transcription
- **Graceful Stop**: Controlled recording termination with data flush and cleanup

## 3. Requirements, Constraints & Guidelines

### Core Requirements

- **REQ-001**: The state machine SHALL implement exactly 8 defined states: IDLE, INITIALIZING, RECORDING, PAUSED, STOPPING, PROCESSING, CANCELLING, ERROR
- **REQ-002**: The state machine SHALL validate all state transitions using a predefined transition matrix
- **REQ-003**: The state machine SHALL emit events for all state changes through the event bus
- **REQ-004**: Each state SHALL have a dedicated handler method for state-specific logic
- **REQ-005**: The state machine SHALL provide query methods for checking current state and transition capabilities
- **REQ-006**: The state machine SHALL support asynchronous state transitions
- **REQ-007**: The state machine SHALL handle errors gracefully and transition to ERROR state when invalid transitions are attempted

### State-Specific Requirements

- **REQ-008**: IDLE state SHALL reset UI elements and prepare for new recording sessions
- **REQ-009**: INITIALIZING state SHALL disable controls and show microphone access status
- **REQ-010**: RECORDING state SHALL enable recording controls and show recording indicators
- **REQ-011**: PAUSED state SHALL maintain recording session while showing paused status
- **REQ-012**: STOPPING state SHALL initiate recording termination and cleanup visualization
- **REQ-013**: PROCESSING state SHALL show transcription progress and disable user controls
- **REQ-014**: CANCELLING state SHALL abort recording and reset to IDLE state
- **REQ-015**: ERROR state SHALL display error information and enable recovery to IDLE

### Event Communication Requirements

- **REQ-016**: The state machine SHALL emit RECORDING_STATE_CHANGED events with old and new state information
- **REQ-017**: State handlers SHALL emit specific UI events for button states, status updates, and spinner controls
- **REQ-018**: The state machine SHALL emit domain-specific events (RECORDING_STARTED, RECORDING_STOPPED, etc.)

### Validation and Safety Requirements

- **REQ-019**: All state transitions SHALL be validated against the STATE_TRANSITIONS matrix before execution
- **REQ-020**: Invalid state transitions SHALL log errors and return false without changing state
- **REQ-021**: State transition failures SHALL be handled without corrupting the current state
- **REQ-022**: The state machine SHALL maintain previous state information for debugging and rollback

### Constraints

- **CON-001**: The state machine MUST NOT directly manipulate DOM elements
- **CON-002**: All UI communication MUST occur through event bus emissions
- **CON-003**: State transitions MUST be atomic operations
- **CON-004**: The state machine MUST maintain referential integrity with the AudioHandler
- **CON-005**: State handlers MUST be idempotent and safe to call multiple times

### Guidelines

- **GUD-001**: Use async/await pattern for all state transition operations
- **GUD-002**: Include context data in state transition events when relevant
- **GUD-003**: Provide clear logging for state transitions in debug mode
- **GUD-004**: Use consistent naming patterns for state handler methods (handle[State]State)
- **GUD-005**: Implement defensive programming practices for error handling

### Patterns

- **PAT-001**: Implement the State pattern with dedicated handler methods for each state
- **PAT-002**: Use the Observer pattern through event bus for state change notifications
- **PAT-003**: Apply the Command pattern for state transition requests
- **PAT-004**: Follow the Single Responsibility Principle - each state handler manages only its state logic

## 4. Interfaces & Data Contracts

### RecordingStateMachine Class Interface

```javascript
class RecordingStateMachine {
    constructor(audioHandler: AudioHandler)
    
    // State Management
    getState(): string
    canTransitionTo(newState: string): boolean
    transitionTo(newState: string, data?: Object): Promise<boolean>
    
    // State Query Methods
    isIdle(): boolean
    isRecording(): boolean
    isPaused(): boolean
    isProcessing(): boolean
    
    // Capability Query Methods
    canRecord(): boolean
    canPause(): boolean
    canResume(): boolean
    canInvokeStop(): boolean
    canCancel(): boolean
}
```

### State Transition Data Contract

```javascript
// State transition event payload
{
    newState: string,           // Target state from RECORDING_STATES
    oldState: string,           // Previous state
    timestamp?: number,         // Optional transition timestamp
    error?: string,            // Error message for ERROR state
    ...additionalData          // Context-specific data
}
```

### Event Emissions Contract

| State | Events Emitted | Data Payload |
|-------|---------------|--------------|
| IDLE | UI_STATUS_UPDATE, UI_BUTTON_ENABLE_MIC, UI_SPINNER_HIDE, UI_CONTROLS_RESET | `{ message: string, type: 'info' }` |
| INITIALIZING | UI_STATUS_UPDATE, UI_BUTTON_DISABLE_MIC | `{ message: string, type: 'info' }` |
| RECORDING | RECORDING_STARTED, UI_STATUS_UPDATE, UI_BUTTON_ENABLE_MIC, UI_BUTTON_SET_RECORDING_STATE | `{ isRecording: true }` |
| PAUSED | RECORDING_PAUSED, UI_STATUS_UPDATE, UI_BUTTON_SET_PAUSE_STATE | `{ isPaused: true }` |
| STOPPING | RECORDING_STOPPED, UI_STATUS_UPDATE, UI_BUTTON_SET_RECORDING_STATE, VISUALIZATION_STOP | `{ isRecording: false }` |
| PROCESSING | API_REQUEST_START, UI_STATUS_UPDATE, UI_BUTTON_DISABLE_MIC, UI_SPINNER_SHOW | `{ message: string, type: 'info' }` |
| CANCELLING | RECORDING_CANCELLED, UI_STATUS_UPDATE, UI_BUTTON_DISABLE_MIC, UI_SPINNER_HIDE | `{ message: string, type: 'info' }` |
| ERROR | RECORDING_ERROR, UI_STATUS_UPDATE, UI_BUTTON_ENABLE_MIC, UI_SPINNER_HIDE | `{ error: string }` |

### State Transitions Matrix

```javascript
const STATE_TRANSITIONS = {
    idle: ['initializing', 'error'],
    initializing: ['recording', 'error', 'idle'],
    recording: ['paused', 'stopping', 'cancelling'],
    paused: ['recording', 'stopping', 'cancelling'],
    stopping: ['processing', 'error'],
    processing: ['idle', 'error'],
    cancelling: ['idle'],
    error: ['idle']
};
```

## 5. Acceptance Criteria

### State Management

- **AC-001**: Given the state machine is in IDLE state, When transitionTo('initializing') is called, Then the state changes to INITIALIZING and RECORDING_STATE_CHANGED event is emitted
- **AC-002**: Given the state machine is in RECORDING state, When transitionTo('idle') is called, Then the transition is rejected and state remains RECORDING
- **AC-003**: Given any state, When an invalid state transition is attempted, Then canTransitionTo() returns false and no state change occurs
- **AC-004**: Given the state machine transitions to any state, Then the previous state is stored and available in transition events

### State-Specific Behavior

- **AC-005**: Given the state machine enters RECORDING state, Then UI_BUTTON_SET_RECORDING_STATE event is emitted with isRecording: true
- **AC-006**: Given the state machine enters PROCESSING state, Then UI_SPINNER_SHOW and UI_BUTTON_DISABLE_MIC events are emitted
- **AC-007**: Given the state machine enters ERROR state with error data, Then RECORDING_ERROR event is emitted with the error message
- **AC-008**: Given the state machine enters IDLE state, Then UI controls are reset and microphone button is enabled

### Query Methods

- **AC-009**: Given the state machine is in RECORDING state, When isRecording() is called, Then it returns true
- **AC-010**: Given the state machine is in PAUSED state, When canResume() is called, Then it returns true
- **AC-011**: Given the state machine is in IDLE state, When canRecord() is called, Then it returns true
- **AC-012**: Given the state machine is in PROCESSING state, When canCancel() is called, Then it returns false

### Error Handling

- **AC-013**: Given a state handler throws an exception, When transitionTo() is called, Then the error is caught and logged without corrupting state
- **AC-014**: Given an invalid state name is provided, When transitionTo() is called, Then the operation returns false and logs an error
- **AC-015**: Given the AudioHandler reference is null, When the state machine is constructed, Then it handles the error gracefully

## 6. Test Automation Strategy

### Test Levels

- **Unit Tests**: State transition logic, query methods, validation rules
- **Integration Tests**: Event emission verification, AudioHandler integration
- **End-to-End Tests**: Complete recording workflow state transitions

### Frameworks

- **Vitest**: Primary testing framework with ES modules support
- **Happy-DOM**: Browser environment simulation for event testing
- **vi.fn()**: Mock functions for event bus and AudioHandler dependencies

### Test Data Management

- Create mock AudioHandler instances with minimal interface
- Use spy functions to capture event emissions
- Generate test matrices for all valid and invalid state transitions

### CI/CD Integration

- Run state machine tests on every pull request
- Include coverage thresholds: 85% statements, 80% branches, 70% functions
- Fail builds on state transition logic regressions

### Coverage Requirements

- **Minimum 90% coverage** for state transition logic
- **100% coverage** for state validation methods
- **85% overall coverage** for the RecordingStateMachine class

### Performance Testing

- Validate state transition performance under rapid sequential calls
- Test memory usage during long-running state machines
- Verify event emission performance with multiple listeners

## 7. Rationale & Context

### Design Decisions

**Finite State Machine Pattern**: Chosen to ensure safe state transitions and prevent invalid recording states that could corrupt audio data or leave the UI in inconsistent states. The pattern provides clear boundaries between different recording phases and makes the system predictable and testable.

**Event-Driven Communication**: Decouples the state machine from UI components, allowing the recording logic to be independent of presentation concerns. This enables easier testing, better maintainability, and supports future UI modifications without changing core business logic.

**Async State Transitions**: Recording operations often involve browser APIs (MediaRecorder, getUserMedia) that are asynchronous. Async state transitions allow proper coordination with these APIs while maintaining responsive UI updates.

**Validation Before Transition**: Prevents invalid state changes that could corrupt the recording workflow or leave the system in an undefined state. Early validation provides clear error messages and maintains system integrity.

### Context

The speech transcription application operates in a browser environment where recording operations must coordinate with:
- MediaRecorder API for audio capture
- User permission requests for microphone access
- Azure Speech Services for transcription
- Real-time UI updates and user feedback
- Error recovery and user guidance

The state machine provides a reliable foundation for managing these complex interactions while maintaining a consistent user experience.

## 8. Dependencies & External Integrations

### Module Dependencies

- **DEP-001**: AudioHandler class - Provides recording operations and coordinates with MediaRecorder API
- **DEP-002**: EventBus module - Central communication system for emitting state change events
- **DEP-003**: Constants module - RECORDING_STATES, STATE_TRANSITIONS, and MESSAGES definitions
- **DEP-004**: Logger module - Structured logging for state transitions and error reporting
- **DEP-005**: ErrorHandler module - Centralized error processing and reporting

### Browser API Dependencies

- **API-001**: MediaRecorder API - For audio recording operations coordinated by state transitions
- **API-002**: getUserMedia API - For microphone access during INITIALIZING state
- **API-003**: Event system - For event bus implementation and cross-component communication

### External Service Dependencies

- **SVC-001**: Azure Speech Services - Transcription processing during PROCESSING state
- **SVC-002**: Browser permissions system - Microphone access management during state transitions

### Infrastructure Dependencies

- **INF-001**: ES6 Module system - For importing dependencies and exporting the state machine class
- **INF-002**: Browser console - For error logging and debugging state transitions

## 9. Examples & Edge Cases

### Basic State Transition Flow

```javascript
// Initialize state machine
const stateMachine = new RecordingStateMachine(audioHandler);

// Start recording workflow
if (stateMachine.canRecord()) {
    await stateMachine.transitionTo(RECORDING_STATES.INITIALIZING);
    // After microphone access granted
    await stateMachine.transitionTo(RECORDING_STATES.RECORDING);
}

// Pause recording
if (stateMachine.canPause()) {
    await stateMachine.transitionTo(RECORDING_STATES.PAUSED);
}

// Resume recording
if (stateMachine.canResume()) {
    await stateMachine.transitionTo(RECORDING_STATES.RECORDING);
}

// Stop and process
await stateMachine.transitionTo(RECORDING_STATES.STOPPING);
await stateMachine.transitionTo(RECORDING_STATES.PROCESSING);
// After transcription complete
await stateMachine.transitionTo(RECORDING_STATES.IDLE);
```

### Error Handling Pattern

```javascript
// Handle microphone access denial
try {
    await stateMachine.transitionTo(RECORDING_STATES.RECORDING);
} catch (error) {
    await stateMachine.transitionTo(RECORDING_STATES.ERROR, { 
        error: 'Microphone access denied' 
    });
}

// Recovery from error state
if (stateMachine.getState() === RECORDING_STATES.ERROR) {
    await stateMachine.transitionTo(RECORDING_STATES.IDLE);
}
```

### Edge Cases

**Rapid State Transitions**: Multiple quick button presses should be handled gracefully
```javascript
// Only first transition should succeed
await Promise.all([
    stateMachine.transitionTo(RECORDING_STATES.STOPPING),
    stateMachine.transitionTo(RECORDING_STATES.CANCELLING),  // Should fail
    stateMachine.transitionTo(RECORDING_STATES.PAUSED)       // Should fail
]);
```

**State Handler Exceptions**: State handlers should not corrupt the state machine
```javascript
// If handleRecordingState throws, state should remain consistent
await stateMachine.transitionTo(RECORDING_STATES.RECORDING); // May fail but won't corrupt state
expect(stateMachine.getState()).toBe(RECORDING_STATES.INITIALIZING); // Previous valid state
```

**Missing Dependencies**: Graceful degradation when dependencies are unavailable
```javascript
// AudioHandler reference becomes null
const stateMachine = new RecordingStateMachine(null);
// Should handle gracefully without throwing
```

## 10. Validation Criteria

### Functional Validation

- All 8 states are implemented with corresponding handler methods
- State transition matrix matches implementation behavior exactly
- Event emissions match the documented interface contracts
- Query methods return correct boolean values for all states
- Error conditions are handled without state corruption

### Performance Validation

- State transitions complete within 100ms under normal conditions
- Event emissions do not block state transition execution
- Memory usage remains stable during extended operation
- No memory leaks from event listener accumulation

### Integration Validation

- AudioHandler integration maintains proper state synchronization
- Event bus communication functions correctly with UI components
- Error handling integrates properly with centralized error management
- Logging integration provides adequate debugging information

### Reliability Validation

- Invalid state transitions are consistently rejected
- State machine recovers properly from error conditions
- Concurrent state transition attempts are handled safely
- System remains stable under stress testing conditions

## 11. Related Specifications / Further Reading

- **Audio Handler Integration Specification** - Details the coordination between state machine and audio recording operations
- **Event Bus Communication Specification** - Defines the event-driven communication patterns used throughout the application
- **Error Handling Strategy Specification** - Describes centralized error management and recovery procedures
- **UI Component Integration Specification** - Documents how UI components respond to state machine events
- **Browser API Integration Guidelines** - Best practices for working with MediaRecorder and getUserMedia APIs
- **Testing Strategy Documentation** - Comprehensive testing approaches for event-driven applications
