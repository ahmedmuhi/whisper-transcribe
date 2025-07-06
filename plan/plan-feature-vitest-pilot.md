---
goal: Pilot Vitest as Jest Replacement for Performance and Modern Tooling Benefits
version: 1.1
date_created: 2025-01-06
last_updated: 2025-01-06
owner: Development Team
tags: [feature, testing, performance, tooling, migration]
---

# Vitest Pilot Implementation Plan

[A comprehensive plan to pilot Vitest as a modern, faster Jest replacement in the whisper-transcribe project, focusing on one module for comparison and evaluation before potential full migration.]

## 1. Requirements & Constraints

- **REQ-001**: Maintain 100% Jest API compatibility during pilot phase
- **REQ-002**: Preserve all existing test functionality (230 tests, 70% coverage threshold)
- **REQ-003**: Implement Vitest on exactly one module for fair comparison
- **REQ-004**: Maintain current ES module setup and jsdom environment
- **REQ-005**: Keep existing Husky pre-push hooks functional during pilot
- **SEC-001**: Ensure no security vulnerabilities in new dependencies
- **PER-001**: Achieve measurably faster test execution in watch mode
- **PER-002**: Demonstrate improved developer experience with hot reload
- **CON-001**: Must not break existing CI/CD pipeline
- **CON-002**: Pilot implementation must be reversible without codebase impact
- **CON-003**: Cannot modify coverage thresholds during evaluation period
- **GUD-001**: Follow existing JSDoc patterns and code style
- **GUD-002**: Use npm workspaces or scripts to run both Jest and Vitest in parallel
- **PAT-001**: Implement feature flags for test runner selection

## 2. Implementation Steps

### Step 1: Environment Setup & Analysis
1. **Baseline Measurement**
   - Measure current Jest performance (startup time, test execution, watch mode)
   - Document current test count: 19 test suites, 230 tests
   - Record current coverage metrics (70% statements, 54% branches, 64% functions, 70% lines)
   
2. **Dependencies Installation**
   ```bash
   npm install --save-dev vitest@^3.2.4 @vitest/ui@^3.2.4 @vitest/coverage-v8@^3.2.4 happy-dom@^18.0.1
   ```

3. **Module Selection for Pilot**
   - Choose `recording-state-machine.js` as pilot module (medium complexity, good test coverage)
   - Alternative modules: `audio-handler.js`, `settings.js`

### Step 2: Vitest Configuration Setup
1. **Create `vitest.config.js`**
   - Mirror Jest configuration (jsdom environment, coverage settings)
   - Configure ES module handling
   - Set up module path mapping to match Jest
   
2. **Test Environment Configuration**
   - Configure jsdom environment for DOM manipulation tests
   - Set up global variables to match Jest environment
   - Implement setupFiles equivalent

3. **Coverage Configuration**
   - Match Jest coverage thresholds exactly
   - Configure v8 coverage provider
   - Set up HTML/JSON reporting

### Step 3: Pilot Module Migration
1. **Copy Pilot Tests**
   - Duplicate `recording-state-machine.test.js` to `recording-state-machine.vitest.js`
   - Keep original Jest version intact for comparison
   
2. **Minimal API Changes**
   - Replace Jest-specific APIs if needed (expect API should be compatible)
   - Update imports if necessary for Vitest-specific features
   
3. **Setup File Adaptation**
   - Create Vitest-specific setup file based on existing `setupTests.js`
   - Ensure DOM mocking works identically

### Step 4: Script Configuration
1. **Package.json Scripts**
   ```json
   {
     "test:vitest": "vitest",
     "test:vitest:ui": "vitest --ui",
     "test:vitest:coverage": "vitest --coverage",
     "test:vitest:pilot": "vitest recording-state-machine.vitest",
     "test:compare": "npm run test:jest:pilot && npm run test:vitest:pilot",
     "test:jest:pilot": "jest tests/recording-state-machine.test.js"
   }
   ```

2. **Parallel Execution Setup**
   - Configure npm scripts to run both test runners
   - Implement performance comparison scripts

### Step 5: Performance Benchmarking
1. **Metrics Collection**
   - Cold start time comparison
   - Watch mode responsiveness
   - Test execution speed
   - Memory usage during test runs
   
2. **Developer Experience Evaluation**
   - Hot reload speed in watch mode
   - Error message clarity
   - IDE integration quality
   - Debugging experience

### Step 6: Feature Comparison Analysis
1. **API Compatibility Assessment**
   - Document any breaking changes
   - List Vitest-specific enhancements
   - Evaluate Jest compatibility mode effectiveness
   
2. **Tooling Integration**
   - VS Code extension compatibility
   - Coverage report format comparison
   - CI/CD integration requirements

## 3. Alternatives

- **ALT-001**: Use Jest with SWC/esbuild for faster transpilation instead of switching test runners
- **ALT-002**: Upgrade to Jest 30+ with experimental ESM features for better performance
- **ALT-003**: Implement custom Jest transformer for ES modules to improve speed
- **ALT-004**: Use Node.js native test runner for minimal dependency overhead
- **ALT-005**: Adopt Deno's built-in test runner for future-proofing

## 4. Dependencies

- **DEP-001**: vitest ^3.2.4 (latest stable version - published 18 days ago)
- **DEP-002**: @vitest/ui ^3.2.4 for enhanced developer experience  
- **DEP-003**: @vitest/coverage-v8 ^3.2.4 for fast native coverage
- **DEP-004**: happy-dom ^18.0.1 as lightweight jsdom alternative (much faster than jsdom)
- **DEP-005**: Current Jest setup (v30.0.4) must remain functional during pilot

## 5. Files

- **FILE-001**: `vitest.config.js` - Main Vitest configuration file
- **FILE-002**: `tests/recording-state-machine.vitest.js` - Pilot test file (copy of Jest version)
- **FILE-003**: `tests/vitest-setup.js` - Vitest-specific setup file
- **FILE-004**: `package.json` - Additional npm scripts for Vitest
- **FILE-005**: `benchmarks/test-performance.md` - Performance comparison results
- **FILE-006**: `.github/workflows/vitest-pilot.yml` - Optional CI workflow for parallel testing

## 6. Testing

- **TEST-001**: All 230 existing Jest tests must continue passing
- **TEST-002**: Pilot module tests must pass with both Jest and Vitest
- **TEST-003**: Coverage reports must match between test runners (±1%)
- **TEST-004**: Performance benchmarks must show measurable improvement
- **TEST-005**: Watch mode functionality must work equivalently
- **TEST-006**: Error reporting must be at least as clear as Jest
- **TEST-007**: IDE integration must work without degradation

## 7. Risks & Assumptions

- **RISK-001**: Vitest may have subtle API differences causing test failures
- **RISK-002**: Coverage calculation differences could affect CI/CD gates
- **RISK-003**: Existing mocking strategies may not translate perfectly
- **RISK-004**: Performance gains may not justify migration complexity
- **RISK-005**: Team learning curve could slow development temporarily
- **ASSUMPTION-001**: Vitest's Jest compatibility mode covers all used features
- **ASSUMPTION-002**: Performance improvements will be noticeable in watch mode
- **ASSUMPTION-003**: ES module support will be more stable than Jest
- **ASSUMPTION-004**: Migration path exists for all 19 test suites if pilot succeeds

## 8. Related Specifications / Further Reading

- [Vitest Official Documentation](https://vitest.dev/)
- [Jest to Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [Vitest Performance Benchmarks](https://vitest.dev/guide/comparisons.html)
- [ES Modules Testing Best Practices](https://nodejs.org/docs/latest-v18.x/api/esm.html#esm_testing)
- [V8 Coverage vs Istanbul Comparison](https://github.com/vitest-dev/vitest/discussions/1204)
