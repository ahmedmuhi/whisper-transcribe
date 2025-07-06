---
goal: Phase 2 - Core Business Logic Vitest Migration Implementation
version: 1.0
date_created: 2025-01-06  
last_updated: 2025-01-06  
owner: Development Team
tags: [feature, migration, testing, vitest, phase-2, core-business-logic, dom-apis, browser-apis]
---

# Phase 2: Core Business Logic Vitest Migration

[Implementation plan for migrating 6 critical functionality test suites with moderate complexity, focusing on DOM interactions, browser API compatibility, and core business rules validation with happy-dom.]

## 1. Requirements & Constraints

- **REQ-001**: Migrate exactly 6 test suites with moderate complexity (1253 total lines)
- **REQ-002**: Maintain 100% test functionality for all core business logic tests
- **REQ-003**: Validate DOM and browser API compatibility with happy-dom environment
- **REQ-004**: Establish patterns for localStorage, canvas, and browser API mocking
- **REQ-005**: Keep Jest and Vitest running in parallel for rollback capability
- **REQ-006**: Document performance improvements and DOM interaction patterns
- **SEC-001**: No security vulnerabilities introduced during core logic migration
- **PER-001**: Achieve measurable performance improvements vs Jest baseline
- **PER-002**: Validate happy-dom performance benefits over jsdom
- **CON-001**: Must not affect existing Jest test execution during migration
- **CON-002**: Migration must be independently reversible without affecting Phase 1
- **CON-003**: Must not disrupt core application development workflows
- **GUD-001**: Follow patterns established in Phase 1 foundation migration
- **GUD-002**: Use consistent .vitest.js naming convention
- **GUD-003**: Maintain identical test logic with zero functional modifications
- **PAT-001**: Establish DOM interaction patterns for Phase 3 complex tests
- **PAT-002**: Create browser API mocking strategies for Phase 4 integration tests

## 2. Implementation Steps

### Step 1: Enhanced DOM Environment Configuration
**Duration**: 45 minutes
**Objective**: Extend Vitest configuration for complex DOM and browser API testing

1. **Update vitest.config.js** for Phase 2 DOM patterns
   - Validate happy-dom environment configuration
   - Add Phase 2 specific test file patterns
   - Ensure canvas and localStorage API availability
   - Configure browser API polyfills if needed

2. **Enhance tests/vitest-setup.js** for DOM testing
   - Add DOM-specific global mocks and polyfills
   - Ensure localStorage mocking compatibility
   - Add canvas context mocking if required
   - Validate browser permission API mocking

3. **Create Phase 2 npm scripts** in package.json
   - `npm run test:vitest:phase2` - Run only Phase 2 Vitest tests
   - `npm run test:jest:phase2` - Run only Phase 2 Jest tests (comparison)
   - `npm run test:phase2:parallel` - Run both for validation
   - `npm run test:phase2:performance` - Performance benchmarking

### Step 2: Migrate settings-dom-caching.test.js (70 lines, DOM Interaction)
**Duration**: 30 minutes
**Risk Level**: Low-Medium (DOM interaction, caching patterns)

**Current Test Analysis:**
- Tests DOM element caching optimization
- Uses document.getElementById mocking
- Simple DOM manipulation testing
- Performance-focused caching validation

**Migration Tasks:**
1. Copy `tests/settings-dom-caching.test.js` to `tests/settings-dom-caching.vitest.js`
2. Verify happy-dom document API compatibility
3. Ensure DOM element caching works identically
4. Validate getElementById mocking patterns

**Success Criteria:**
- DOM element caching behavior identical
- getElementById mocking works seamlessly
- Performance improvement documented
- Zero functional changes required

### Step 3: Migrate visualization-stop.test.js (69 lines, Canvas/Visualization)
**Duration**: 40 minutes
**Risk Level**: Medium (canvas APIs, visualization controller)

**Current Test Analysis:**
- Tests visualization controller lifecycle
- Uses canvas mocking for audio visualization
- Tests event-driven visualization start/stop
- No complex canvas drawing operations

**Migration Tasks:**
1. Copy `tests/visualization-stop.test.js` to `tests/visualization-stop.vitest.js`
2. Verify happy-dom canvas API compatibility
3. Ensure visualization controller mocking works
4. Test event bus integration for visualization events

**Success Criteria:**
- Canvas API mocking behavior identical
- Visualization controller lifecycle preserved
- Event-driven patterns work seamlessly
- Performance metrics captured

### Step 4: Migrate api-client-validation.test.js (380 lines, Validation Logic)
**Duration**: 50 minutes
**Risk Level**: Medium (complex validation, business rules)

**Current Test Analysis:**
- Tests Azure API client configuration validation
- Complex business rule validation scenarios
- Multi-model configuration testing (Whisper, GPT-4o)
- URI validation and sanitization logic

**Migration Tasks:**
1. Copy `tests/api-client-validation.test.js` to `tests/api-client-validation.vitest.js`
2. Verify validation logic patterns work identically
3. Ensure configuration validation events work
4. Test error message handling and sanitization

**Success Criteria:**
- All validation scenarios pass identically
- Business rule enforcement preserved
- Event emission for validation errors works
- Configuration handling maintained

### Step 5: Migrate settings-persistence.test.js (331 lines, localStorage Interaction)
**Duration**: 45 minutes
**Risk Level**: Medium (localStorage, modal management, persistence)

**Current Test Analysis:**
- Tests settings persistence to localStorage
- Modal management and form interaction
- Event bus communication for settings changes
- localStorage key management and retrieval

**Migration Tasks:**
1. Copy `tests/settings-persistence.test.js` to `tests/settings-persistence.vitest.js`
2. Verify happy-dom localStorage API compatibility
3. Ensure modal management works identically
4. Test form data persistence and retrieval patterns

**Success Criteria:**
- localStorage interaction identical
- Modal management behavior preserved
- Form data persistence works seamlessly
- Event bus integration maintained

### Step 6: Migrate permission-manager.test.js (383 lines, Browser API Integration)
**Duration**: 60 minutes
**Risk Level**: Medium-High (browser APIs, permission management, device access)

**Current Test Analysis:**
- Tests browser permission management
- MediaDevices API mocking for microphone access
- Navigator permissions API integration
- Cross-browser compatibility patterns

**Migration Tasks:**
1. Copy `tests/permission-manager.test.js` to `tests/permission-manager.vitest.js`
2. Verify happy-dom navigator API compatibility
3. Ensure MediaDevices API mocking works
4. Test permission state management and events

**Success Criteria:**
- Navigator and MediaDevices APIs work identically
- Permission state management preserved
- Browser-specific patterns maintained
- Error handling for device access preserved

### Step 7: Validate recording-state-machine.vitest.js (Already Completed ✅)
**Duration**: 15 minutes
**Objective**: Ensure pilot implementation integrates with Phase 2

**Validation Tasks:**
1. Run recording-state-machine.vitest.js with Phase 2 configuration
2. Verify integration with enhanced DOM environment
3. Ensure no conflicts with other Phase 2 tests
4. Document any improvements or optimizations

**Success Criteria:**
- Pilot test continues to pass with Phase 2 config
- No performance degradation
- Clean integration with Phase 2 test suite

### Step 8: Performance Benchmarking & DOM Pattern Documentation
**Duration**: 45 minutes
**Objective**: Document DOM/browser API performance and patterns

1. **Run comparative benchmarks**
   - Execute each test 10 times in Jest (jsdom)
   - Execute each test 10 times in Vitest (happy-dom)
   - Compare DOM operation performance
   - Document browser API compatibility

2. **Create DOM pattern documentation**
   - localStorage interaction patterns
   - Canvas API mocking strategies
   - Browser permission API patterns
   - Event bus integration with DOM events

3. **Validate happy-dom performance benefits**
   - Compare memory usage vs jsdom
   - Document DOM API coverage
   - Test complex DOM manipulation scenarios

### Step 9: Browser API Compatibility Validation
**Duration**: 30 minutes
**Objective**: Ensure all browser APIs work correctly with happy-dom

1. **Test browser API coverage**
   - localStorage read/write operations
   - Canvas context creation and basic operations
   - Navigator permissions API mocking
   - MediaDevices API simulation

2. **Document compatibility findings**
   - API coverage comparison vs jsdom
   - Performance characteristics
   - Limitations and workarounds
   - Recommendations for Phase 3/4

## 3. Alternatives

- **ALT-001**: Migrate DOM tests individually with custom DOM setup - rejected, standardized approach better
- **ALT-002**: Use jsdom instead of happy-dom for compatibility - rejected, performance benefits lost
- **ALT-003**: Skip browser API tests in Phase 2 - rejected, core functionality validation essential
- **ALT-004**: Create custom DOM mocking layer - rejected, happy-dom provides comprehensive solution
- **ALT-005**: Separate DOM and non-DOM tests into different phases - rejected, business logic integration needed

## 4. Dependencies

- **DEP-001**: Phase 1 Foundation migration completed successfully (✅ completed)
- **DEP-002**: Vitest pilot implementation with recording-state-machine (✅ completed)
- **DEP-003**: happy-dom@^18.0.1 environment validated for DOM operations
- **DEP-004**: Current Jest Phase 2 tests all passing (prerequisite validation)
- **DEP-005**: DOM API compatibility testing completed before migration
- **DEP-006**: Browser API mocking patterns established and documented

## 5. Files

### New Vitest Test Files (5 new + 1 existing)
- **FILE-001**: `tests/settings-dom-caching.vitest.js` - DOM element caching patterns
- **FILE-002**: `tests/visualization-stop.vitest.js` - Canvas/visualization testing
- **FILE-003**: `tests/api-client-validation.vitest.js` - Business logic validation
- **FILE-004**: `tests/settings-persistence.vitest.js` - localStorage interaction patterns
- **FILE-005**: `tests/permission-manager.vitest.js` - Browser API integration testing
- **FILE-006**: `tests/recording-state-machine.vitest.js` - Integration validation (existing)

### Configuration Updates
- **FILE-007**: `vitest.config.js` - Enhanced for DOM/browser API testing
- **FILE-008**: `tests/vitest-setup.js` - DOM environment setup and polyfills
- **FILE-009**: `package.json` - Phase 2 specific npm scripts

### Helper and Utility Files
- **FILE-010**: `tests/helpers/test-dom-vitest.js` - Enhanced DOM mocking utilities
- **FILE-011**: `tests/helpers/browser-api-mocks.js` - Browser API mocking patterns (new)
- **FILE-012**: `tests/helpers/canvas-mocks.js` - Canvas API testing utilities (new)

### Documentation Files
- **FILE-013**: `benchmarks/phase-2-performance.md` - DOM/browser API performance analysis
- **FILE-014**: `docs/dom-testing-patterns.md` - DOM interaction testing guide
- **FILE-015**: `docs/browser-api-compatibility.md` - Browser API support with happy-dom
- **FILE-016**: `plan/phase-2-completion-report.md` - Phase 2 results and lessons learned

### Preservation (Existing Files Unchanged)
- **FILE-017**: `tests/settings-dom-caching.test.js` - Original Jest version (preserved)
- **FILE-018**: `tests/visualization-stop.test.js` - Original Jest version (preserved)
- **FILE-019**: `tests/api-client-validation.test.js` - Original Jest version (preserved)
- **FILE-020**: `tests/settings-persistence.test.js` - Original Jest version (preserved)
- **FILE-021**: `tests/permission-manager.test.js` - Original Jest version (preserved)

## 6. Testing

### Migration Validation Tests
- **TEST-001**: All 6 Phase 2 Vitest tests pass independently
- **TEST-002**: All 6 Phase 2 Jest tests continue to pass (no regression)
- **TEST-003**: Parallel execution of Jest and Vitest Phase 2 tests successful
- **TEST-004**: Individual test performance improvements documented per test

### DOM Interaction Validation Tests
- **TEST-005**: settings-dom-caching.vitest.js DOM element behavior identical
- **TEST-006**: visualization-stop.vitest.js canvas operations work correctly
- **TEST-007**: localStorage interactions work identically in settings-persistence
- **TEST-008**: Browser permission APIs work correctly in permission-manager

### Business Logic Validation Tests
- **TEST-009**: api-client-validation.vitest.js business rules identical
- **TEST-010**: Configuration validation events emit correctly
- **TEST-011**: Error handling and sanitization logic preserved
- **TEST-012**: Multi-model validation scenarios work identically

### Browser API Compatibility Tests
- **TEST-013**: localStorage read/write operations identical to Jest/jsdom
- **TEST-014**: Canvas context creation and mocking work correctly
- **TEST-015**: Navigator permissions API mocking behavior preserved
- **TEST-016**: MediaDevices API simulation matches Jest patterns

### Integration Tests
- **TEST-017**: Phase 2 tests integrate properly with Phase 1 configuration
- **TEST-018**: Event bus integration works across all migrated tests
- **TEST-019**: DOM cleanup and reset between tests working correctly
- **TEST-020**: Performance benefits scale across DOM-heavy test suites

### Performance Validation Tests
- **TEST-021**: Each migrated test shows measurable performance improvement
- **TEST-022**: happy-dom performance benefits vs jsdom documented
- **TEST-023**: Memory usage patterns improved vs Jest baseline
- **TEST-024**: DOM operation speed improvements quantified

## 7. Risks & Assumptions

### Phase 2 Specific Risks
- **RISK-001**: happy-dom localStorage API incomplete or incompatible
- **RISK-002**: Canvas API mocking limitations in happy-dom environment
- **RISK-003**: Browser permission API mocking not supported in happy-dom
- **RISK-004**: Complex DOM manipulation patterns not working identically
- **RISK-005**: Performance benefits not realized with complex DOM operations

### Technical Risks
- **RISK-006**: MediaDevices API mocking differences causing test failures
- **RISK-007**: Event bus integration issues with DOM event handling
- **RISK-008**: localStorage persistence patterns behaving differently
- **RISK-009**: Modal management and form interaction compatibility issues

### Integration Risks
- **RISK-010**: Phase 2 tests conflicting with Phase 1 established patterns
- **RISK-011**: DOM environment setup affecting non-DOM tests
- **RISK-012**: Browser API polyfills causing unexpected side effects
- **RISK-013**: Memory usage increase with complex DOM test scenarios

### Business Logic Risks
- **RISK-014**: Validation logic edge cases not working identically
- **RISK-015**: Configuration management patterns breaking in Vitest
- **RISK-016**: Error handling and sanitization behaving differently
- **RISK-017**: Multi-model validation scenarios failing in new environment

### Mitigation Strategies
- **MIT-001**: Test localStorage operations thoroughly with various data types
- **MIT-002**: Validate canvas API support before complex visualization tests
- **MIT-003**: Create fallback mocking for unsupported browser APIs
- **MIT-004**: Establish DOM cleanup patterns to prevent test interference
- **MIT-005**: Monitor memory usage and performance during complex DOM operations

### Technical Assumptions
- **ASSUMPTION-001**: happy-dom supports all required DOM APIs for Phase 2 tests
- **ASSUMPTION-002**: localStorage API in happy-dom matches browser behavior
- **ASSUMPTION-003**: Canvas context mocking sufficient for visualization tests
- **ASSUMPTION-004**: Browser permission APIs can be adequately mocked
- **ASSUMPTION-005**: Performance benefits of happy-dom apply to complex scenarios

### Workflow Assumptions
- **ASSUMPTION-006**: DOM interaction patterns from Phase 2 apply to Phase 3
- **ASSUMPTION-007**: Browser API mocking strategies scale to Phase 4
- **ASSUMPTION-008**: Team can efficiently handle DOM-specific debugging
- **ASSUMPTION-009**: Complex business logic validation transfers seamlessly
- **ASSUMPTION-010**: Phase 2 completion enables confident Phase 3 execution

## 8. Related Specifications / Further Reading

[Phase 1 Foundation Migration Results](./plan-feature-vitest-phase-1-foundation.md)  
[Comprehensive Vitest Migration Plan](./plan-feature-vitest-complete-migration.md)  
[Happy-DOM API Documentation](https://github.com/capricorn86/happy-dom#api)  
[Happy-DOM vs jsdom Performance](https://github.com/capricorn86/happy-dom#performance)  
[Vitest DOM Testing Guide](https://vitest.dev/guide/environment.html#test-environment)  
[Browser API Mocking with Vitest](https://vitest.dev/guide/mocking.html#globals)  
[Canvas API Testing Patterns](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial)  
[localStorage Testing Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
