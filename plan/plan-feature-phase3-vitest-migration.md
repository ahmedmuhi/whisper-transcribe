---
goal: Complete Phase 3 Complex Integration Tests Jest to Vitest Migration 
version: 1.0
date_created: 2024-12-28
last_updated: 2024-12-28
owner: Development Team
tags: [feature, migration, testing, vitest, jest, phase3, integration, performance]
---

# Introduction

Complete the final phase of the Jest to Vitest migration by resolving complex integration test compatibility issues. Phase 3 includes 9 integration test files covering WebRTC, AudioContext, state machine transitions, multi-module event flows, and end-to-end recording workflows. Current status: 6/9 files fully working (158/164 tests passing) with event emission timing issues and vi.mock() factory patterns blocking completion.

## 1. Requirements & Constraints

- **REQ-001**: Maintain 100% test functionality equivalence with Jest baseline (174 tests passing)
- **REQ-002**: Achieve >10% performance improvement over Jest execution times (Jest: 4.63s baseline)
- **REQ-003**: Support complex integration testing patterns: WebRTC, AudioContext, MediaRecorder, multi-module dependencies
- **REQ-004**: Maintain event-driven architecture test patterns and state machine validation
- **REQ-005**: Preserve test isolation and cleanup patterns for integration scenarios
- **SEC-001**: Ensure test security by not exposing sensitive API information in error messages
- **CON-001**: Use Vitest 3.2.4 compatible patterns only (no jest.unstable_mockModule)
- **CON-002**: Maintain existing test structure and naming conventions
- **CON-003**: Support both parallel and sequential test execution modes
- **GUD-001**: Use vi.mock() factory patterns correctly without top-level variables
- **GUD-002**: Implement proper event assertion patterns for integration tests
- **PAT-001**: Follow established Phase 1 and Phase 2 migration patterns for consistency

## 2. Implementation Steps

### Step 1: Resolve vi.mock() Factory Issues (1 file)
- **File**: `tests/visualization-stop-expanded.vitest.js`
- **Issue**: ReferenceError: trackingConstructor is not defined in vi.mock() factory
- **Solution**: Move variable definitions outside mock factory or use proper factory patterns
- **Priority**: High - blocking test execution

### Step 2: Fix Event Emission Timing Issues (5 files)
- **Files**: `tests/recording-integration.vitest.js`, `tests/error-recovery.vitest.js`
- **Issue**: Expected event emissions not matching actual event sequences
- **Root Cause**: Timing differences between Jest and Vitest in async operations
- **Solution**: Add proper async wait patterns, update event assertion expectations

### Step 3: Debug State Machine Event Sequences
- **Component**: RecordingStateMachine integration with event bus
- **Issue**: State change events not being emitted as expected in Vitest environment
- **Solution**: Verify event bus spy setup and state machine transition timing

### Step 4: Validate Permission System Integration
- **Component**: PermissionManager and AudioHandler integration
- **Issue**: Permission denied events not following expected patterns
- **Solution**: Update permission denial flow expectations for Vitest environment

### Step 5: Performance Benchmarking and Optimization
- **Target**: Execute all 164 tests in <4.1s (current Jest: 4.63s, target: >10% improvement)
- **Method**: Use `npm run test:phase3:performance` for validation
- **Metrics**: Track test execution time, memory usage, and parallel execution efficiency

## 3. Alternatives

- **ALT-001**: Convert complex integration tests to separate vitest config files - rejected due to complexity
- **ALT-002**: Maintain Jest for integration tests and Vitest for unit tests - rejected, violates single test runner requirement
- **ALT-003**: Rewrite integration tests from scratch - rejected, would lose established test patterns

## 4. Dependencies

- **DEP-001**: Vitest 3.2.4 with enhanced DOM environment and WebRTC mocking capabilities
- **DEP-002**: Enhanced vitest-setup.js with navigator.mediaDevices, AudioContext, MediaRecorder support
- **DEP-003**: Phase 3 NPM scripts infrastructure (test:vitest:phase3, test:phase3:performance, etc.)
- **DEP-004**: integrationTestUtils helper functions for async flow management
- **DEP-005**: Successful completion of Phase 1 and Phase 2 migrations

## 5. Files

- **FILE-001**: `tests/visualization-stop-expanded.vitest.js` - Fix vi.mock() factory variable scoping issue
- **FILE-002**: `tests/recording-integration.vitest.js` - Fix 5 state machine event timing assertions  
- **FILE-003**: `tests/error-recovery.vitest.js` - Fix 1 permission denial event assertion
- **FILE-004**: `tests/api-client-errors.vitest.js` - ✅ Complete (20 tests passing)
- **FILE-005**: `tests/audio-handler-integration.vitest.js` - ✅ Complete (10 tests passing)
- **FILE-006**: `tests/ui-event-bus.vitest.js` - ✅ Complete (17 tests passing)
- **FILE-007**: `tests/ui-event-bus-proper.vitest.js` - ✅ Complete (20 tests passing)
- **FILE-008**: `tests/settings-validation.vitest.js` - ✅ Complete (25 tests passing)
- **FILE-009**: `tests/settings-helper-methods.vitest.js` - ✅ Complete (54 tests passing)

## 6. Testing

- **TEST-001**: Individual file validation using `npx vitest run tests/[filename].vitest.js`
- **TEST-002**: Full Phase 3 suite execution with `npm run test:vitest:phase3`
- **TEST-003**: Performance comparison using `npm run test:phase3:performance`
- **TEST-004**: Parallel execution testing with `npm run test:phase3:parallel`
- **TEST-005**: Integration completeness check with `npm run test:integration:complete`
- **TEST-006**: Jest baseline validation to ensure no regressions in original tests

## 7. Risks & Assumptions

- **RISK-001**: Complex event timing differences between Jest and Vitest may require significant assertion pattern changes
- **RISK-002**: State machine integration patterns may not translate directly to Vitest environment
- **RISK-003**: WebRTC and MediaRecorder mocking may have subtle behavior differences affecting test outcomes
- **ASSUMPTION-001**: vi.mock() factory patterns can be adapted to avoid top-level variable issues
- **ASSUMPTION-002**: Event bus spy patterns will work equivalently in Vitest with proper async handling
- **ASSUMPTION-003**: Performance improvements will be achieved through Vitest's faster test execution

## 8. Related Specifications / Further Reading

[Phase 1 Unit Tests Migration Plan](plan-feature-phase1-vitest-migration.md)  
[Phase 2 DOM Integration Migration Plan](plan-feature-phase2-vitest-migration.md)  
[Vitest vi.mock() Documentation](https://vitest.dev/api/vi.html#vi-mock)  
[Integration Testing Best Practices with Vitest](https://vitest.dev/guide/testing.html)
