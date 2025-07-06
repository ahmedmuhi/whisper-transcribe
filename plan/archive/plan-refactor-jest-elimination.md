---
goal: Eliminate Jest Testing Framework and Standardize on Vitest
version: 1.0
date_created: 2025-07-06
last_updated: 2025-07-06
owner: Development Team
tags: [refactor, testing, cleanup, standardization, vitest, jest, elimination]
---

# Introduction

This plan eliminates Jest as a testing framework and standardizes the project to use Vitest exclusively. The goal is to simplify the testing infrastructure, reduce dependencies, improve consistency, and leverage Vitest's superior performance and modern features. This refactoring supports the broader code elimination initiative by removing duplicate testing infrastructure.

## 1. Requirements & Constraints

- **REQ-001**: Remove all Jest test files (*.test.js) from the project
- **REQ-002**: Remove Jest-related dependencies from package.json
- **REQ-003**: Remove Jest configuration files (jest.config.js)
- **REQ-004**: Update all npm scripts to use Vitest exclusively
- **REQ-005**: Maintain existing test coverage levels (85% statements, 80% branches, 70% functions, 85% lines)
- **REQ-006**: Update documentation to reflect Vitest as the sole testing framework
- **SEC-001**: Ensure all safety net coverage thresholds remain enforced
- **CON-001**: All 230 existing Vitest tests must continue to pass
- **CON-002**: Coverage baseline must be maintained or improved
- **CON-003**: Git pre-push hooks must continue to work with Vitest-only commands
- **GUD-001**: Follow established event-driven architecture patterns in remaining tests
- **GUD-002**: Maintain JSDoc documentation standards for test descriptions
- **PAT-001**: Use Vitest's native mocking and assertion patterns consistently

## 2. Implementation Steps

### Phase 1: Test Infrastructure Cleanup
1. **Remove Jest Test Files**
   - Delete all `*.test.js` files from `tests/` directory (19 files identified)
   - Verify corresponding `*.vitest.js` files exist and provide equivalent coverage
   - Run coverage analysis to ensure no functionality gaps

2. **Remove Jest Configuration**
   - Delete `jest.config.js` configuration file
   - Remove Jest-related VS Code settings if any exist

3. **Update Package Dependencies**
   - Remove Jest dependencies: `jest`, `@jest/globals`, `jest-environment-jsdom`
   - Update package.json to remove Jest devDependencies
   - Run `npm install` to clean up node_modules

### Phase 2: Script Modernization  
4. **Simplify NPM Scripts**
   - Replace main `test` script to use `vitest run` instead of Jest
   - Remove all Jest-specific scripts (test:jest:*, test:compare, test:phase*:parallel, test:phase*:performance)
   - Consolidate to clean Vitest-only script structure
   - Update `test:watch` to use `vitest --watch`
   - Update `test:ci` to use `vitest run --coverage`

5. **Standardize Script Naming**
   - Rename `test:vitest:*` scripts to clean `test:*` equivalents
   - Remove "vitest" prefix from script names since it's now the only framework
   - Maintain coverage-related scripts with consistent naming

### Phase 3: Safety Net Validation
6. **Coverage Verification**
   - Run full test suite with coverage to verify 230 tests still pass
   - Confirm coverage thresholds are met: 85%/80%/70%/85%
   - Update coverage baseline if improvements are achieved
   - Verify Git pre-push hooks work with updated scripts

7. **Integration Testing**
   - Test all npm script commands to ensure they work correctly
   - Verify Husky pre-push hooks execute successfully
   - Confirm coverage enforcement prevents quality regressions

### Phase 4: Documentation Updates
8. **Update README.md**
   - Remove references to Jest in development section
   - Update testing commands to reflect Vitest-only approach
   - Emphasize Vitest as the testing framework
   - Update script examples to use new consolidated commands

9. **Update Technical Documentation**
   - Update any JSDoc comments that reference Jest
   - Ensure all testing examples use Vitest patterns
   - Update .github/copilot-instructions.md if needed

## 3. Alternatives

- **ALT-001**: Keep Jest for legacy compatibility - Rejected: Adds complexity and maintenance overhead
- **ALT-002**: Gradual migration over time - Rejected: Prolongs dual-framework maintenance burden  
- **ALT-003**: Convert Jest tests to Vitest instead of deletion - Rejected: Equivalent Vitest tests already exist

## 4. Dependencies

- **DEP-001**: Existing Vitest test suite must provide complete coverage equivalent to Jest tests
- **DEP-002**: Coverage baseline metrics in `metrics/coverage-baseline.json`
- **DEP-003**: Git pre-push hooks in `.husky/pre-push` 
- **DEP-004**: Vitest configuration in `vitest.config.js`
- **DEP-005**: Safety net implementation from plan-feature-safety-net-coverage-hooks.md

## 5. Files

### Files to Delete
- **FILE-001**: `jest.config.js` - Jest configuration file
- **FILE-002**: `tests/*.test.js` - All 19 Jest test files (complete list below)
- **FILE-003**: Jest dependencies in `package.json` devDependencies section

### Files to Modify  
- **FILE-004**: `package.json` - Remove Jest dependencies and scripts, update main scripts
- **FILE-005**: `README.md` - Update development/testing documentation
- **FILE-006**: `.github/copilot-instructions.md` - Update testing strategy references if needed

### Jest Test Files to Delete (19 files)
1. `tests/recording-integration.test.js`
2. `tests/permission-manager.test.js`  
3. `tests/jsdoc-generation.test.js`
4. `tests/ui-event-bus.test.js`
5. `tests/audio-handler-integration.test.js`
6. `tests/status-reset.test.js`
7. `tests/visualization-stop-expanded.test.js`
8. `tests/api-client-validation.test.js`
9. `tests/error-handler.test.js`
10. `tests/api-client-errors.test.js`
11. `tests/settings-validation.test.js`
12. `tests/visualization-stop.test.js`
13. `tests/settings-helper-methods.test.js`
14. `tests/settings-persistence.test.js`
15. `tests/settings-dom-caching.test.js`
16. `tests/recording-state-machine.test.js`
17. `tests/ui-event-bus-proper.test.js`
18. `tests/error-recovery.test.js`
19. `tests/audio-handler-stop.test.js`

## 6. Testing

- **TEST-001**: Run `npm test` to verify all Vitest tests pass (230 tests expected)
- **TEST-002**: Run `npm run test:coverage` to verify coverage thresholds are met
- **TEST-003**: Run `npm run test:watch` to verify watch mode works correctly
- **TEST-004**: Test Git pre-push hook triggers and runs successfully
- **TEST-005**: Verify `npm run lint && npm run test:coverage && npm run deps:check:prod` executes without errors
- **TEST-006**: Confirm coverage baseline is maintained or improved
- **TEST-007**: Test all updated npm scripts individually for correct execution

## 7. Risks & Assumptions

- **RISK-001**: Coverage gaps if Jest tests contained unique test cases not covered by Vitest equivalents
- **RISK-002**: Workflow disruption if npm scripts are not properly updated 
- **RISK-003**: CI/CD pipeline failures if external systems depend on Jest-specific commands
- **ASSUMPTION-001**: All Vitest test files provide equivalent or better coverage than their Jest counterparts
- **ASSUMPTION-002**: No external tools or scripts depend on Jest configuration
- **ASSUMPTION-003**: Current 230 Vitest tests represent complete functionality coverage
- **ASSUMPTION-004**: Team is familiar with Vitest syntax and patterns

## 8. Related Specifications / Further Reading

- **plan-feature-safety-net-coverage-hooks.md** - Coverage enforcement and Git hooks implementation
- **Vitest Documentation** - https://vitest.dev/guide/ 
- **Migration from Jest to Vitest** - https://vitest.dev/guide/migration.html
- **.github/copilot-instructions.md** - Project testing strategy and architecture patterns
