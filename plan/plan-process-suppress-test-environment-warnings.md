---
goal: Suppress Test Environment Warnings and Update Deprecated Dependencies
version: 1.0
date_created: 2025-07-05
last_updated: 2025-07-05
owner: Development Team
tags: [process, test, maintenance]
---

# Introduction

During test execution, non-critical warnings appear in console output:

- **ExperimentalWarning: VM Modules is an experimental feature...**
- Deprecation warnings from dependencies (`inflight`, `glob`).

While tests pass, these warnings clutter output and may mask real issues. This plan outlines steps to suppress or handle these warnings and update deprecated packages for long-term maintenance.

## 1. Requirements & Constraints

- **REQ-001**: Suppress or hide ESM experimental warnings during `npm test` runs without altering test behavior.
- **REQ-002**: Replace or upgrade deprecated dependencies (`inflight`, `glob`) to current, supported versions.
- **CON-001**: Maintain existing test scripts and Jest ESM support until native ESM is stable in Node.
- **CON-002**: Avoid disabling all Node warnings globally; only suppress targeted warnings.
- **GUD-001**: Use package.json configuration or Jest setup to manage warnings.

## 2. Implementation Steps

1. **Suppress VM Modules Warning**
   - Option A: Prefix test command in `package.json` with environment variable:
     ```json
     {
       "scripts": {
         "test": "NODE_NO_WARNINGS=1 NODE_OPTIONS=--experimental-vm-modules jest"
       }
     }
     ```
   - Option B: In `tests/setupTests.js`, add at top:
     ```js
     process.removeAllListeners('warning');
     process.on('warning', warning => {
       if (warning.name === 'ExperimentalWarning') return;
       console.warn(warning);
     });
     ```
2. **Upgrade Deprecated Dependencies**
   - Run `npm outdated` to identify current versions of `inflight` and `glob`.
   - Update direct dependencies in `package.json`, e.g.:
     ```bash
     npm install glob@^8.0.0 inflight@^1.0.0 --save
     ```
   - If `glob` is a transitive dependency, add `overrides` in `package.json`:
     ```json
     "overrides": {
       "glob": "^8.0.0"
     }
     ```
   - Run `npm install` and confirm no deprecation warnings.
3. **Verify Test Suite**
   - Run `npm test` and ensure warnings are suppressed and tests pass.
   - Remove any unintended side effects or new warnings.

## 3. Alternatives

- **ALT-001**: Use `--no-warnings` Node flag. Rejected because it may hide critical warnings beyond VM Modules.
- **ALT-002**: Accept warnings until Node ESM leaves experimental. Deferred maintenance, not preferred.

## 4. Dependencies

- **DEP-001**: Jest and Node ESM support (`--experimental-vm-modules`).
- **DEP-002**: `glob` and `inflight` packages, direct or transitive.

## 5. Files Affected

- **FILE-001**: `package.json` — update `scripts`, add `overrides`.
- **FILE-002**: `tests/setupTests.js` — optional warning filter.

## 6. Testing

- **TEST-001**: Run `npm test` and confirm no ExperimentalWarning in output.
- **TEST-002**: Verify no deprecation messages from `inflight` or `glob`.
- **TEST-003**: Ensure all test suites still pass (227 tests).

## 7. Risks & Assumptions

- **RISK-001**: Suppressing warnings incorrectly may hide future critical warnings.
- **ASSUMPTION-001**: `NODE_NO_WARNINGS` is supported by CI environments.
- **ASSUMPTION-002**: Upgrading dependencies does not introduce breaking changes for project.

## 8. Related Specifications / Further Reading

- Node.js Warning Handling: https://nodejs.org/api/process.html#processwarning
- npm Overrides Field: https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides
