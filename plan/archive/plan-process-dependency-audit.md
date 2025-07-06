---
goal: Implement automated dependency auditing to eliminate orphaned or duplicate dependencies
version: 1.0
date_created: 2025-07-06
last_updated: 2025-07-06
owner: ahmedmuhi
tags: [process, dependency-management, tooling, automation, code-elimination]
---

# Introduction

This plan implements objective 2.2 from the code elimination initiative: "Eliminate orphaned or duplicate dependencies" by establishing an automated dependency audit process using **knip** (the modern successor to the now-archived `depcheck`). The goal is to detect packages that no files actually require and set up a sustainable process to prevent dependency bloat in the whisper-transcribe project.

**Note**: The original plan referenced `depcheck`, but this tool was archived in June 2025. We're using **knip** instead, which is actively maintained, has excellent ES module support, and is trusted by major companies like Microsoft, GitHub, Shopify, and Vercel.

## 1. Requirements & Constraints

- **REQ-001**: Must detect unused npm dependencies accurately in ES module environment
- **REQ-002**: Must generate actionable reports identifying specific unused packages, exports, and files
- **REQ-003**: Must handle modern JavaScript/TypeScript patterns without false positives
- **REQ-004**: Must integrate with existing npm scripts workflow
- **REQ-005**: Must be runnable both manually and as part of automated checks
- **REQ-006**: Must support 100+ popular tools and frameworks out of the box
- **SEC-001**: Must not remove dependencies that are actually needed but not directly imported
- **CON-001**: Must work with current vanilla JavaScript ES module setup (no bundler)
- **CON-002**: Must preserve development dependencies needed for tooling
- **CON-003**: Must not interfere with existing Jest test configuration
- **GUD-001**: Follow existing project patterns for tool configuration
- **GUD-002**: Generate reports in `/metrics/` directory for consistency
- **PAT-001**: Use ignore lists for known false positives rather than disabling tool

## 2. Implementation Steps

### Step 1: Install and Configure knip
- Install `knip` as development dependency
- Create `knip.json` configuration file with appropriate ignore lists
- Test initial run to identify baseline unused dependencies, exports, and files

### Step 2: Create npm Scripts
- Add `npm run deps:check` script for manual dependency auditing
- Add `npm run deps:report` script to generate JSON report in `/metrics/` directory
- Add `npm run deps:fix` script to interactively remove unused dependencies

### Step 3: Generate Initial Baseline Report
- Run comprehensive dependency, export, and file audit
- Document current state in metrics report
- Identify immediate candidates for removal vs. investigation needed

### Step 4: Create Ignore List Management
- Document rationale for ignored packages/files in configuration
- Create process for reviewing and updating ignore list
- Establish criteria for when items should/shouldn't be ignored

### Step 5: Integration with Existing Workflow
- Add dependency check to pre-push Git hook (if desired)
- Document when and how to run dependency audits
- Create guidelines for reviewing knip results

## 3. Alternatives

- **ALT-001**: Use deprecated `depcheck` - rejected because it was archived in June 2025 and no longer maintained
- **ALT-002**: Manual dependency review without tooling - rejected because it's error-prone and time-consuming
- **ALT-003**: Integrate with bundler analysis tools - rejected because project currently uses no bundler
- **ALT-004**: Use GitHub Dependabot only - rejected because it focuses on security/updates, not unused dependencies
- **ALT-005**: Use `npm-check-unused` - rejected because knip has better accuracy and more features

## 4. Dependencies

- **DEP-001**: `knip` npm package for dependency, export, and file analysis
- **DEP-002**: Existing `package.json` and `package-lock.json` files
- **DEP-003**: Current `/metrics/` directory structure for report storage
- **DEP-004**: Existing npm scripts infrastructure

## 5. Files

- **FILE-001**: `package.json` - Add knip dependency and new npm scripts
- **FILE-002**: `knip.json` - Configuration file for knip with ignore lists
- **FILE-003**: `/metrics/knip-report.json` - Generated report file
- **FILE-004**: `/metrics/dependency-audit-baseline.md` - Initial audit findings documentation
- **FILE-005**: `README.md` - Update with dependency audit process documentation

## 6. Testing

- **TEST-001**: Verify knip correctly identifies known unused dependencies, exports, and files
- **TEST-002**: Verify knip doesn't flag dependencies/exports that are actually needed
- **TEST-003**: Test ignore list functionality with known false positives
- **TEST-004**: Verify npm scripts execute successfully and generate expected output
- **TEST-005**: Test dependency removal process doesn't break existing functionality

## 7. Risks & Assumptions

- **RISK-001**: Modern tooling patterns may require custom configuration to avoid false positives
- **RISK-002**: Dynamic imports or string-based requires may not be detected, leading to false positives
- **RISK-003**: Development tools may be flagged as unused if not properly configured
- **RISK-004**: Removing dependencies could break functionality not covered by tests
- **ASSUMPTION-001**: Current test suite provides adequate coverage to catch broken functionality after dependency removal
- **ASSUMPTION-002**: All actually-needed dependencies are imported in a way detectable by static analysis
- **ASSUMPTION-003**: Team will consistently run dependency audits as part of development workflow

## 8. Related Specifications / Further Reading

- [knip.dev](https://knip.dev/) - Official website and documentation
- [knip GitHub repository](https://github.com/webpro-nl/knip) - Source code and issue tracking
- [knip npm package](https://www.npmjs.com/package/knip) - Package information and installation
- [Knip getting started guide](https://knip.dev/overview/getting-started) - Step-by-step setup instructions
- Code elimination plan: `/plan/plan-feature-code-elimination.md` - Parent initiative this plan supports
