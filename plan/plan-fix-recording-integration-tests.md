---
goal: Fix Recording Integration Test Suite - Complete MediaRecorder Mocking and Async Flow Testing
version: 1.0
date_created: 2025-07-05  
last_updated: 2025-07-05  
owner: Development Team
tags: [fix, testing, integration, mocking, async-flows]
---

# Fix Recording Integration Test Suite - Complete MediaRecorder Mocking and Async Flow Testing

## Introduction

The recording integration test suite currently has 7/10 tests failing after implementing basic MediaRecorder mocking and fixing async timing issues. The core recording flow now works (transcribe() is being called), but several critical areas need systematic fixes: cleanup timing, cancellation flow, API error handling, timer integration, and state machine transitions.

## 1. Requirements & Constraints

### Functional Requirements
- **REQ-001**: All 10 recording integration tests must pass consistently
- **REQ-002**: MediaRecorder mock must accurately simulate real browser behavior
- **REQ-003**: Async operations must be properly synchronized in test environment
- **REQ-004**: Timer functionality must work correctly with Jest fake timers
- **REQ-005**: State machine transitions must complete fully in tests
- **REQ-006**: Event bus communication must be testable and verifiable
- **REQ-007**: Cleanup operations must complete and be verifiable

### Testing Constraints
- **CON-001**: Must use Jest fake timers to control async operations
- **CON-002**: Must maintain compatibility with existing test patterns
- **CON-003**: Test execution time must remain under 2 seconds for this suite
- **CON-004**: Must not break existing passing tests (3/10 currently passing)
- **CON-005**: Must properly mock browser APIs without real audio processing

### Mocking Guidelines
- **GUD-001**: MediaRecorder events must fire in correct sequence with proper timing
- **GUD-002**: Promise resolution cycles must be handled consistently
- **GUD-003**: Fake timers must advance properly for setTimeout/setInterval operations
- **GUD-004**: Event listeners must be properly managed and cleaned up
- **GUD-005**: Mock state must be isolated between test cases

### Debugging Patterns
- **PAT-001**: Use systematic Promise.resolve() chains for async synchronization
- **PAT-002**: Advance fake timers incrementally to handle timed operations
- **PAT-003**: Verify state changes immediately after expected transitions
- **PAT-004**: Test cleanup operations with additional async cycles
- **PAT-005**: Mock error scenarios with realistic error propagation

## 2. Implementation Steps

### Phase 1: MediaRecorder Mock Enhancement (30 minutes)
1. **Fix MediaRecorder stop() event timing**
   - Current issue: stop event may not fire consistently in cancellation scenarios
   - Solution: Ensure stop event fires synchronously but uses proper Promise.resolve() for async handling
   - Verification: Check that both normal stop and cancellation trigger stop event

2. **Improve event listener management**
   - Current issue: Event listeners may not be properly isolated between tests
   - Solution: Add proper cleanup and reset mechanisms in MockMediaRecorder
   - Verification: Ensure no event listener leakage between test cases

3. **Add state transition debugging**
   - Current issue: Hard to debug why cleanup doesn't complete
   - Solution: Add internal state tracking to mock for debugging
   - Verification: Can trace exact event firing sequence

### Phase 2: Cleanup Timing Resolution (20 minutes)
1. **Analyze cleanup flow timing**
   - Current issue: mediaRecorder remains non-null after cleanup should complete
   - Root cause: cleanup() method called after processAndSendAudio() completes
   - Solution: Add sufficient Promise.resolve() cycles to wait for cleanup completion

2. **Fix transcription completion synchronization**
   - Current issue: Test checks cleanup before transcription processing completes
   - Solution: Wait for transcription event emission before checking cleanup
   - Verification: mediaRecorder becomes null, timerInterval becomes null

3. **Standardize async wait patterns**
   - Current issue: Inconsistent async waiting across different test scenarios
   - Solution: Create helper function for standard async operation waiting
   - Verification: All tests use consistent timing patterns

### Phase 3: Cancellation Flow Fix (15 minutes)
1. **Fix state timing in cancellation test**
   - Current issue: State already transitions to idle before test checks for cancelling
   - Root cause: Cancellation transition happens too quickly in mock environment
   - Solution: Check cancelling state immediately after cancelRecording() call

2. **Verify cancellation cleanup**
   - Current issue: Cleanup may not happen properly during cancellation
   - Solution: Ensure cancellation path properly calls cleanup and clears state
   - Verification: All resources cleaned up after cancellation

### Phase 4: API Error Handling Fix (20 minutes)
1. **Fix API_CONFIG_MISSING event emission**
   - Current issue: Settings modal not being called for API validation errors
   - Root cause: Event listener may not be properly set up or error message doesn't match condition
   - Solution: Verify event listener setup and ensure error message triggers condition

2. **Fix transcription error event emission**
   - Current issue: API_REQUEST_ERROR event not being emitted when transcribe() fails
   - Root cause: Error handling in sendToAzureAPI may not be executing properly
   - Solution: Ensure proper error propagation and event emission timing

3. **Verify error recovery flow**
   - Current issue: Error states may not transition back to idle properly
   - Solution: Ensure all error scenarios eventually return to idle state
   - Verification: State machine ends in idle after all error scenarios

### Phase 5: Timer Integration Fix (25 minutes)
1. **Fix timer reset event emission**
   - Current issue: UI_TIMER_RESET event not being emitted after stopping
   - Root cause: cleanup() method may not be called or event not fired
   - Solution: Trace cleanup execution and verify event emission

2. **Fix pause/resume timer logic**
   - Current issue: recordingStartTime not being adjusted correctly during pause/resume
   - Root cause: Timer adjustment logic in togglePause() may be incorrect
   - Solution: Verify timer pause/resume implementation matches expected behavior

3. **Mock Date.now() properly with fake timers**
   - Current issue: Date.now() mocking conflicts with fake timers
   - Solution: Use consistent Date.now() mocking that works with Jest fake timers
   - Verification: Timer calculations work correctly in test environment

### Phase 6: State Machine Integration Fix (15 minutes)
1. **Fix final state transition completion**
   - Current issue: State transitions missing final idle state
   - Root cause: Final transition from processing to idle may not complete in test timing
   - Solution: Add proper waiting for final state transition
   - Verification: All expected state transitions captured in sequence

2. **Verify state transition ordering**
   - Current issue: Test expects specific state sequence but actual sequence varies
   - Solution: Ensure consistent state transition timing across test runs
   - Verification: State transition array matches expected sequence exactly

### Phase 7: Test Optimization and Validation (10 minutes)
1. **Standardize async waiting patterns**
   - Create helper functions for common async wait scenarios
   - Apply consistent patterns across all failing tests
   - Verify no race conditions remain

2. **Validate test isolation**
   - Ensure each test properly resets state
   - Verify no test interference
   - Confirm mock cleanup between tests

3. **Performance optimization**
   - Minimize unnecessary async waits
   - Optimize fake timer advancement
   - Ensure sub-1-second test execution

### Phase 8: Final Issue Fixes (20 minutes)
1. **Fix API validation error event emission**
   - Issue: `API_CONFIG_MISSING` event listener not firing, settings modal not opening
   - Task: Verify `APP_EVENTS.API_CONFIG_MISSING` listener registration in `AudioHandler` and adjust test error message to trigger emission
   - Verification: Test confirms `mockSettings.openSettingsModal()` is called

2. **Fix transcription error cleanup**
   - Issue: `mediaRecorder` and `audioChunks` not cleaned up after transcription failures
   - Task: Ensure `cleanup()` is called in `sendToAzureAPI` error path and tests wait for it
   - Verification: Tests assert `audioHandler.mediaRecorder === null` and `audioHandler.audioChunks.length === 0`

3. **Fix timer reset event emission**
   - Issue: `APP_EVENTS.UI_TIMER_RESET` not emitted after stopping
   - Task: Trace `cleanup()` in `AudioHandler.stopRecordingFlow`, ensure event is emitted synchronously or tests wait appropriately
   - Verification: Test observes `eventBus.emit(APP_EVENTS.UI_TIMER_RESET)` call

4. **Fix timer pause/resume adjustment logic**
   - Issue: `recordingStartTime` not adjusted correctly on resume, causing timer drift
   - Task: Adjust `AudioHandler` `APP_EVENTS.RECORDING_RESUMED` handler to calculate paused duration using `Date.now()` and `currentTimerDisplay`
   - Verification: Tests validate `recordingStartTime` updated to `mockStartTime + pausedDuration`

**Goal:** Resolve the last 4 failing tests to achieve 10/10 passing results.

## 3. Alternatives

- **ALT-001**: Rewrite tests to use real MediaRecorder with audio file mocking
  - **Rejected**: Too complex and slower than mock approach
  - **Rationale**: Mock approach is more reliable and faster for unit testing

- **ALT-002**: Split integration tests into smaller unit tests
  - **Rejected**: Integration tests are valuable for testing complete workflows
  - **Rationale**: These tests catch issues that unit tests would miss

- **ALT-003**: Use setTimeout with real timers instead of fake timers
  - **Rejected**: Would make tests slower and less reliable
  - **Rationale**: Fake timers provide better control and faster execution

- **ALT-004**: Skip problematic tests and focus on simpler scenarios
  - **Rejected**: These scenarios represent real user workflows
  - **Rationale**: All integration scenarios need to work for production confidence

## 4. Dependencies

- **DEP-001**: Jest fake timers functionality working correctly
- **DEP-002**: Existing AudioHandler, RecordingStateMachine implementations
- **DEP-003**: Event bus system for communication testing
- **DEP-004**: Mock DOM elements and browser APIs
- **DEP-005**: Promise resolution cycle handling for async operations

## 5. Files

### Primary File to Fix
- **FILE-001**: `tests/recording-integration.test.js` - Main integration test suite
  - Fix MediaRecorder mock implementation
  - Fix async timing and Promise resolution
  - Fix state transition waiting patterns
  - Fix event emission verification

### Supporting Files (Reference Only)
- **FILE-002**: `js/audio-handler.js` - Understanding cleanup and event flow
- **FILE-003**: `js/recording-state-machine.js` - Understanding state transitions
- **FILE-004**: `tests/setupTests.js` - Understanding test infrastructure

## 6. Testing

### Test Validation Approach
- **TEST-001**: Run individual failing tests to isolate specific issues
- **TEST-002**: Run full test suite to ensure no regressions
- **TEST-003**: Verify test timing remains under 2 seconds total
- **TEST-004**: Manual verification that mocks represent real behavior accurately

### Success Criteria
- **CRITERIA-001**: All 10 tests in recording-integration.test.js pass consistently
- **CRITERIA-002**: Test execution time under 2 seconds for the suite
- **CRITERIA-003**: No test interference or race conditions
- **CRITERIA-004**: Mock behavior matches real MediaRecorder API patterns
- **CRITERIA-005**: State machine transitions work reliably in all scenarios

### Current Status Analysis
- **STATUS-001**: 3/10 tests passing (pause/resume, microphone access errors, invalid state transitions)
- **STATUS-002**: Core recording flow works (transcribe() being called)
- **STATUS-003**: Main issues: cleanup timing, cancellation state, error events, timer logic
- **STATUS-004**: MediaRecorder mock basically functional but needs timing fixes

## 7. Risks & Assumptions

### Risks
- **RISK-001**: Fake timer interactions may be complex with MediaRecorder events
  - **Mitigation**: Use Promise.resolve() for async coordination instead of setTimeout when possible
- **RISK-002**: Mock timing may not reflect real browser behavior
  - **Mitigation**: Test with real browser APIs periodically to validate mock accuracy
- **RISK-003**: Test fixes may be brittle to implementation changes
  - **Mitigation**: Focus on testing public API behavior rather than internal timing

### Assumptions
- **ASSUMPTION-001**: Jest fake timers work correctly with Promise.resolve() patterns
- **ASSUMPTION-002**: MediaRecorder mock can accurately simulate all needed behaviors
- **ASSUMPTION-003**: Event bus event emission timing is predictable in test environment
- **ASSUMPTION-004**: AudioHandler cleanup operations are deterministic
- **ASSUMPTION-005**: State machine transitions complete in predictable timeframes

## 8. Related Specifications / Further Reading

- [Jest Fake Timers Documentation](https://jestjs.io/docs/timer-mocks)
- [MediaRecorder API Specification](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Jest Async Testing Patterns](https://jestjs.io/docs/asynchronous)
- [Promise Resolution Cycle Testing](https://javascript.info/microtask-queue)
- [Event-Driven Architecture Testing](https://martinfowler.com/articles/practical-test-pyramid.html)
- [plan-feature-test-coverage-expansion.md](plan-feature-test-coverage-expansion.md) - Original test expansion plan
