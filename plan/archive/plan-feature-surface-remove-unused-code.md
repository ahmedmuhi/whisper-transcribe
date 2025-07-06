---
goal: "Surface and Remove Unused Code Paths"
version: 1.0
date_created: 2025-07-06
last_updated: 2025-07-06
owner: "Core Team"
tags: [feature, code-elimination, linting]
---

# Introduction

Objective **2.1** of the code elimination initiative aims to systematically identify and remove dead or unused code paths within the `whisper-transcribe` application. By integrating automated static analysis and enforcing linting rules, we will maintain a leaner codebase, reduce maintenance overhead, and prevent latent bugs.

## 1. Requirements & Constraints

- **REQ-001**: Integrate ESLint with the following plugins:
  - `eslint-plugin-unused-imports`
  - `eslint-plugin-import`
- **REQ-002**: Configure lint rules to:
  - Automatically remove unused *imports* (`unused-imports/no-unused-imports`).
  - Flag unused *exports* (`import/no-unused-modules` with `unusedExports: true`).
- **CON-001**: No user-facing functionality regressions or broken module imports after code removal.
- **CON-002**: All modifications must adhere to the existing modular event-driven architecture and coding conventions (see `JSDOC_STYLE_GUIDE.md`).
- **GUD-001**: Follow code formatting and style guidelines defined in `.eslintrc.cjs` and `prettier` settings.
- **PAT-001**: All refactor operations must use a red-green-refactor approach, preserving test coverage.

## 2. Implementation Steps

1. **Bootstrap ESLint Configuration**
   - Install dev dependencies:
     ```bash
     npm install --save-dev eslint eslint-plugin-unused-imports eslint-plugin-import
     ```
   - Create or update `.eslintrc.cjs` with the required plugin and rule settings.
   - Verify the ESLint configuration by running:
     ```bash
     npx eslint --print-config .eslintrc.cjs
     ```

2. **Initial Lint Scan**
   - Run a full lint check to surface unused imports and exports:
     ```bash
     npx eslint "js/**/*.js"
     ```
   - Record findings in a lint-report (`metrics/lint-unused-report.json`).

3. **Automated Import Cleanup**
   - Execute automatic fixes for unused imports:
     ```bash
     npx eslint --fix "js/**/*.js"
     ```
   - Commit import-only changes in a dedicated branch.

4. **Flag and Review Unused Exports**
   - Identify flagged exports from the lint-report.
   - For each flagged export:
     - Confirm it is truly unused via workspace search.
     - If safe, delete the export and any related code.
     - If uncertain, defer removal and add to an ignore list in `.eslintignore`.

5. **Red-Green Testing**
   - Before deletion, write or update unit tests to cover code paths marked for removal.
   - Run the test suite and ensure coverage does not drop below baseline.
   - Delete code and re-run tests to confirm they still pass.

6. **Iterate Module by Module**
   - Begin with smallest modules (e.g., `status-helper.js`) and progress to larger ones (e.g., `audio-handler.js`).
   - After each module:
     - Run `npm run lint` and `npm test`.
     - Run `npx bundlesize --analyze` to verify no bundle size regressions due to unexpected tree-shaking issues.

7. **Pre-Push Hook Integration**
   - Add a Husky pre-push hook to enforce lint and tests:
     ```bash
     npx husky add .husky/pre-push "npm run lint && npm test"
     ```

8. **Documentation and Reporting**
   - Update `plan/plan-feature-code-elimination.md` to reflect progress and metrics.
   - Share a summary of removed code paths and improvements in `README.md` under a "Code Health" section.

## 3. Alternatives

- **ALT-001**: Use a standalone dead-code removal tool (e.g., `babel-plugin-transform-remove-unused`) instead of ESLint plugins.
  - *Rejected*: Less granularity and manual control; harder to integrate with existing lint pipeline.
- **ALT-002**: Adopt TypeScript for built-in unused-checking.
  - *Rejected*: Out-of-scope; we defer TS migration until API surface grows.

## 4. Dependencies

- **DEP-001**: eslint
- **DEP-002**: eslint-plugin-unused-imports
- **DEP-003**: eslint-plugin-import
- **DEP-004**: husky (for Git hooks)
- **DEP-005**: bundlesize (for bundle health checks)

## 5. Files

- **FILE-001**: `.eslintrc.cjs` – ESLint configuration for unused import/export rules.
- **FILE-002**: `package.json` – add/remove devDependencies and Husky hook script.
- **FILE-003**: `js/` directory – multiple ES modules to be scanned and cleaned.
- **FILE-004**: `.eslintignore` – ignore patterns for deferred removals.
- **FILE-005**: `metrics/lint-unused-report.json` – initial findings report.
- **FILE-006**: `.husky/pre-push` – script enforcing lint and tests.

## 6. Testing

- **TEST-001**: Verify no unused-import errors after `eslint --fix`.
- **TEST-002**: Confirm all flagged exports removed cause no test failures.
- **TEST-003**: Maintain or improve overall code coverage ≥ baseline.
- **TEST-004**: Manual smoke test of core workflows (record, pause, stop, transcribe).
- **TEST-005**: Verify pre-push hook blocks pushes on lint/test failures.

## 7. Risks & Assumptions

- **RISK-001**: Dynamic imports or string-based `require()` not detected as used.
  - *Mitigation*: Add manual ignore entries and plan static refactor to ESM imports.
- **RISK-002**: Overzealous removal breaks rarely used features.
  - *Mitigation*: Require tests before deletion and peer reviews for each module.
- **ASSUMPTION-001**: Existing test suite adequately covers most code paths.
- **ASSUMPTION-002**: Developers will maintain the lint rules as part of CI.

## 8. Related Specifications / Further Reading

- [Plan: Feature Code Elimination](plan/plan-feature-code-elimination.md)
- [ESLint Plugin Import `no-unused-modules` Documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-unused-modules.md)
- [ESLint Plugin Unused Imports](https://www.npmjs.com/package/eslint-plugin-unused-imports)
