---
goal: "Add Comprehensive JSDoc Comments to All Public Methods"
version: 1.0
date_created: 2025-07-06
owner: Developer Team
tags: ["feature", "documentation", "jsdoc"]
---

# Introduction

This plan outlines the steps to add comprehensive JSDoc comments to every public method in the Whisper-Transcribe codebase. Proper documentation improves code readability, eases onboarding, and supports automated doc generation.

## 1. Requirements & Constraints

- **REQ-001**: Every public method in modules under `js/` must have a preceding JSDoc block.
- **REQ-002**: Each JSDoc block must include:
  - A concise description of behavior
  - `@param` tags with parameter name and type
  - `@returns` tag with return type (or `void` if none)
  - `@throws` tag for methods that may throw errors
- **REQ-003**: Documentation style must follow `jsdoc.json` and `JSDOC_STYLE_GUIDE.md`.
- **CON-001**: No changes to existing functionality or method signatures.
- **PAT-001**: Use verb-noun phrasing in descriptions (e.g., `startRecording(): Begins audio capture`).

## 2. Implementation Steps

This section describes a step-by-step workflow to add and validate JSDoc comments across all public methods.

2.1. Module Inventory
  - Execute: `ls js/*.js` or use a script to list all JavaScript modules in `js/`
  - Verify each file exports a class or function intended for public use

2.2. Public Method Detection
  - Scan each module for `export class` or `export function` declarations
  - Record all public method signatures (methods on exported classes, standalone exports)
  - Maintain a checklist file (`docs/jsdoc-modules.json`) listing methods per module

2.3. JSDoc Stub Insertion
  - For every public method, insert a JSDoc block template:
    ```js
    /**
     * [Short description of behavior]
     *
     * @param {Type} paramName - Description
     * @returns {Type} Description
     * @throws {Error} When [condition]
     */
    ```
  - Use editor macros or multi-cursor to apply stubs consistently

2.4. Documentation Completion
  - Replace placeholders with meaningful text:
    - Method purpose (verb-noun phrasing)
    - Parameter types, names, and descriptions
    - Return types and error conditions
  - Reference `JSDOC_STYLE_GUIDE.md` for formatting rules and examples

2.5. Linting and Formatting
  - Run `npm run lint:docs` or configure ESLint to check JSDoc tags
  - Address all lint warnings/errors related to missing tags or style violations

2.6. Build and Verify
  - Generate HTML docs: `npx jsdoc --configure jsdoc.json`
  - Open the output directory (e.g., `out/` or `docs/`) in a browser
  - Spot-check a representative sample of modules to ensure links and formatting are correct

2.7. Peer Review and Merge
  - Open a pull request labeled `documentation`
  - Request reviewers to validate completeness, accuracy, and adherence to style guide
  - Merge only after all review comments are addressed and CI passes

## 3. Alternatives

- **ALT-001**: Adopt TypeScript for inline type annotations. Rejected due to scope and existing ES module setup.
- **ALT-002**: Auto-generate JSDoc using templates. Rejected to ensure accuracy and meaningful descriptions.

## 4. Dependencies

- **DEP-001**: JSDoc CLI (dev dependency): `npm install --save-dev jsdoc`
- **DEP-002**: `jsdoc.json` and `JSDOC_STYLE_GUIDE.md` for style rules.

## 5. Files Affected

| File Path                           | Description                                              |
|-------------------------------------|----------------------------------------------------------|
| `js/api-client.js`                  | Azure API integration methods — Done                     |
| `js/audio-handler.js`               | Public methods: `startRecording`, `stopRecording` — Done |
| `js/constants.js`                   | App-wide constants (MESSAGES, STORAGE_KEYS, etc.) — Done |
| `js/error-handler.js`               | Central error handling methods — Done                   |
| `js/event-bus.js`                   | Event emitters and listeners — Done                     |
| `js/logger.js`                      | Logging utility methods — Done                          |
| `js/main.js`                        | Application entry-point initialization — Done           |
| `js/permission-manager.js`          | Permission request and status methods — Pending          |
| `js/recording-state-machine.js`     | State transition handlers — Done                         |
| `js/settings.js`                    | Settings persistence and retrieval methods — Done        |
| `js/status-helper.js`               | Temporary and persistent status display methods — Pending |
| `js/ui.js`                          | Public UI manipulation methods — Done                    |
| `js/visualization.js`               | Audio visualization control methods — Pending            |

## 6. Testing

- **TEST-001**: Validate generated docs contain no missing tags or warnings.
- **TEST-002**: Verify doc site builds successfully and links resolve.
- **TEST-003**: Peer sign-off confirming clarity and completeness.

## 7. Risks & Assumptions

- **RISK-001**: Incomplete or inaccurate documentation may mislead developers.
- **ASSUMPTION-001**: Code signatures remain stable during documentation.
- **ASSUMPTION-002**: Team is familiar with JSDoc conventions.

## 8. Related Specifications / Further Reading

- [JSDoc Style Guide](JSDOC_STYLE_GUIDE.md)
- [jsdoc.json Configuration](jsdoc.json)
