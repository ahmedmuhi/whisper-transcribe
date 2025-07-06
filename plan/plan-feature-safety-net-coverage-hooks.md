---
goal: Establish Safety Net with Coverage Baseline and Git Pre-Push Hooks
version: 1.0
date_created: 2025-01-07
last_updated: 2025-01-07
owner: Development Team
tags: [feature, testing, coverage, git-hooks, quality-assurance, automation]
---

# Safety Net Implementation Plan

Implement automated quality gates through baseline test coverage enforcement and Git pre-push hooks to prevent regressions during the code elimination initiative.

## 1. Requirements & Constraints

- **REQ-001**: Establish 80% minimum coverage threshold for lines, branches, functions, and statements
- **REQ-002**: Generate comprehensive coverage reports using Vitest's built-in coverage tooling
- **REQ-003**: Implement Git pre-push hook running `npm run lint && npm test`
- **REQ-004**: Coverage enforcement must block commits that reduce coverage below threshold
- **REQ-005**: Hook must be lightweight and execute quickly to avoid developer friction
- **SEC-001**: Ensure coverage reports don't expose sensitive information in CI artifacts
- **CON-001**: Must work with existing Vitest test infrastructure (174 tests across 3 phases)
- **CON-002**: Hook implementation must be cross-platform (Linux, macOS, Windows)
- **CON-003**: Coverage configuration must integrate with existing vitest.config.js
- **GUD-001**: Follow existing project patterns for configuration and tooling
- **GUD-002**: Maintain backwards compatibility with existing npm scripts
- **PAT-001**: Use Husky for Git hook management following industry standards
- **PAT-002**: Leverage Vitest's native coverage capabilities over external tools

## 2. Implementation Steps

### Step 1: Configure Vitest Coverage Baseline
1. **Install coverage dependencies**
   ```bash
   npm install --save-dev @vitest/coverage-v8
   ```

2. **Update vitest.config.js with coverage configuration**
   - Add coverage thresholds (80% for all metrics)
   - Configure coverage reporters (text, html, json)
   - Set up coverage directory and file patterns
   - Exclude test files and configuration from coverage

3. **Generate initial coverage baseline**
   ```bash
   npm run test:coverage
   ```

4. **Document coverage baseline in metrics directory**
   - Create `metrics/coverage-baseline.json`
   - Generate HTML coverage report for review
   - Commit baseline to establish starting point

### Step 2: Enhance Package.json Scripts
1. **Add coverage-specific npm scripts**
   ```json
   {
     "test:coverage": "vitest run --coverage",
     "test:coverage:watch": "vitest --coverage --watch",
     "test:coverage:threshold": "vitest run --coverage --reporter=verbose"
   }
   ```

2. **Update existing test scripts to include coverage options**
   - Modify phase-specific test scripts to support coverage
   - Ensure coverage works with all test categories (unit, integration)

### Step 3: Install and Configure Husky
1. **Install Husky for Git hook management**
   ```bash
   npm install --save-dev husky
   npx husky-init
   ```

2. **Configure pre-push hook**
   ```bash
   npx husky add .husky/pre-push "npm run lint && npm test"
   ```

3. **Test hook functionality**
   - Verify hook executes on git push
   - Confirm hook blocks push on lint/test failures
   - Test with both passing and failing scenarios

### Step 4: Coverage Integration Testing
1. **Validate coverage thresholds**
   - Test with artificially reduced coverage
   - Confirm build fails when thresholds not met
   - Verify threshold enforcement works across all test phases

2. **Performance optimization**
   - Measure hook execution time
   - Optimize for quick feedback (target <30 seconds)
   - Consider parallel execution of lint and test

### Step 5: Documentation and Team Onboarding
1. **Update README.md with coverage information**
   - Document new npm scripts
   - Explain coverage thresholds and rationale
   - Provide troubleshooting guide for hook issues

2. **Create developer workflow documentation**
   - Best practices for maintaining coverage
   - How to handle coverage drops during refactoring
   - Emergency bypass procedures for urgent fixes

## 3. Alternatives

- **ALT-001**: Use Jest coverage instead of Vitest - Rejected because project has already migrated to Vitest with 28% performance improvement
- **ALT-002**: Use GitHub Actions for coverage enforcement instead of local hooks - Deferred until project grows larger, local hooks provide faster feedback
- **ALT-003**: Use 90% coverage threshold instead of 80% - Too aggressive for current codebase without comprehensive coverage audit
- **ALT-004**: Use lint-staged for pre-commit hooks instead of pre-push - Pre-push provides better balance between safety and developer productivity
- **ALT-005**: Use Istanbul/nyc for coverage instead of Vitest native - Adds unnecessary complexity when Vitest coverage is sufficient

## 4. Dependencies

- **DEP-001**: @vitest/coverage-v8 - Native Vitest coverage provider using V8 engine
- **DEP-002**: husky ^8.0.0 - Git hook management (modern version with improved performance)
- **DEP-003**: Existing Vitest 3.2.4 infrastructure - Already installed and configured
- **DEP-004**: ESLint configuration - Must be in place for lint command in hook
- **DEP-005**: Node.js 18+ - Required for Vitest coverage and modern Husky

## 5. Files

- **FILE-001**: `vitest.config.js` - Add coverage configuration with 80% thresholds
- **FILE-002**: `package.json` - New coverage scripts and Husky configuration
- **FILE-003**: `.husky/pre-push` - Git hook script executing lint and test
- **FILE-004**: `metrics/coverage-baseline.json` - Initial coverage baseline for tracking
- **FILE-005**: `coverage/` directory - Generated coverage reports (HTML, JSON, text)
- **FILE-006**: `.gitignore` - Exclude coverage directory except baseline files
- **FILE-007**: `README.md` - Updated documentation with coverage and hook information

## 6. Testing

- **TEST-001**: Coverage threshold enforcement - Artificially reduce coverage and verify build fails
- **TEST-002**: Git hook functionality - Test push with passing and failing lint/tests
- **TEST-003**: Cross-platform compatibility - Verify hooks work on Linux, macOS, Windows
- **TEST-004**: Performance benchmarks - Measure hook execution time under various scenarios
- **TEST-005**: Coverage report generation - Verify all reporter formats (text, HTML, JSON) work correctly
- **TEST-006**: Integration with existing test phases - Ensure coverage works with Phase 1, 2, and 3 tests
- **TEST-007**: Developer workflow - Test common scenarios like partial commits, merge conflicts
- **TEST-008**: Coverage baseline tracking - Verify baseline establishment and comparison over time

## 7. Risks & Assumptions

- **RISK-001**: Coverage threshold too aggressive causing developer friction - Mitigation: Start with 80% and adjust based on real usage patterns
- **RISK-002**: Git hooks causing push delays in CI/CD workflows - Mitigation: Optimize hook performance and provide bypass mechanisms
- **RISK-003**: Cross-platform compatibility issues with Husky - Mitigation: Test on all target platforms before deployment
- **RISK-004**: Coverage reports consuming excessive disk space - Mitigation: Configure cleanup scripts and exclude from git tracking
- **RISK-005**: False positives in coverage calculation for integration tests - Mitigation: Fine-tune coverage configuration and exclusion patterns

- **ASSUMPTION-001**: Development team has Git 2.9+ supporting modern hook mechanisms
- **ASSUMPTION-002**: Developers are comfortable with command-line Git operations
- **ASSUMPTION-003**: Current test suite provides meaningful coverage baseline (not just line coverage)
- **ASSUMPTION-004**: 80% coverage threshold is achievable without major test additions
- **ASSUMPTION-005**: Vitest coverage tool provides sufficient accuracy for project needs

## 8. Related Specifications / Further Reading

[Vitest Coverage Configuration](https://vitest.dev/config/#coverage)  
[Husky Git Hooks Documentation](https://typicode.github.io/husky/)  
[Code Coverage Best Practices](https://martinfowler.com/bliki/TestCoverage.html)  
[Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)  
[Plan: Feature Code Elimination](./plan-feature-code-elimination.md) - Parent initiative
