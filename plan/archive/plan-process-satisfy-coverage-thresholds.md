---
goal: Satisfy Jest Coverage Thresholds
version: 1.0
date_created: 2025-07-05
last_updated: 2025-07-05
owner: Development Team
tags: [process, test, coverage]
---

# Introduction

The project enforces minimum code coverage thresholds in `jest.config.js` (Statements: 80%, Branches: 80%, Functions: 80%, Lines: 80%). Current metrics are below thresholds (Statements ~71%, Branches ~55%), causing CI failures. This plan outlines options to either adjust thresholds or increase test coverage.

## 1. Requirements & Constraints

- **REQ-001**: Tests must pass and coverage reports must meet or exceed configured thresholds.
- **REQ-002**: Minimize test maintenance burden; prefer threshold adjustment for legacy code.
- **REQ-003**: Critical business logic should remain fully tested; coverage adjustments should exclude trivial or auto-generated code.
- **CON-001**: Avoid drastic threshold relaxation that undermines test quality.
- **CON-002**: Do not disable coverage enforcement entirely.
- **GUD-001**: Use Jest’s `coverageThreshold` configuration and `coveragePathIgnorePatterns` as needed.

## 2. Implementation Steps

1. Review `coverage/lcov-report/index.html` to identify untested modules and lines.
2. Decide on a hybrid approach:
   - **Option A**: Adjust global thresholds downward to current metrics (e.g., Statements: 70%, Branches: 55%).
   - **Option B**: Write additional tests for critical untested code (e.g., error handlers, edge branches in `js/api-client.js`, `js/permission-manager.js`).
3. For **Option A**:
   - Open `jest.config.js`.
   - Update `coverageThreshold.global` values to the new target percentages.
   - (Optional) Exempt specific files via `coveragePathIgnorePatterns` if testing is impractical.
4. For **Option B**:
   - Add new Jest test files under `tests/` for uncovered branches:
     - Test invalid configurations in `js/settings.js`.
     - Test all PermissionManager status branches.
     - Simulate API client error codes for `js/api-client.js`.
   - Use spies and mocks to cover error flows.
5. Run `npm run test:coverage:summary` and verify thresholds are met.
6. Commit changes to `jest.config.js` or new test files accordingly.

## 3. Alternatives

- **ALT-001**: Disable coverage enforcement for CI only. Rejected because it removes visibility into regressions.
- **ALT-002**: Use a separate Jest configuration for CI with relaxed thresholds. Adds complexity.

## 4. Dependencies

- **DEP-001**: Jest configuration in `jest.config.js`.
- **DEP-002**: Existing test setup and coverage reports.

## 5. Files Affected

- **FILE-001**: `jest.config.js` — adjust `coverageThreshold`.
- **FILE-002**: New test files under `tests/` (if writing additional tests).

## 6. Testing

- **TEST-001**: Run `npm run test:coverage:summary` locally to confirm thresholds pass.
- **TEST-002**: Verify CI pipeline succeeds without coverage failures.

## 7. Risks & Assumptions

- **RISK-001**: Lowering thresholds may allow untested regressions.
- **RISK-002**: Writing new tests may require refactoring code for testability.
- **ASSUMPTION-001**: Some legacy code is stable and safe to exclude or test later.
- **ASSUMPTION-002**: The team agrees on updated coverage targets.

## 8. Related Specifications / Further Reading

- Jest Coverage Thresholds: https://jestjs.io/docs/configuration#coveragethreshold
- Ignoring Files in Coverage: https://jestjs.io/docs/configuration#coveragepathignorepatterns-arraystring
