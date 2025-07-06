---
goal: Modernize Dependency Elimination Strategy Using Knip and Current Best Practices
version: 2.0
date_created: 2025-01-07
last_updated: 2025-01-07
owner: Development Team
tags: [feature, dependencies, maintenance, tooling, automation]
---

# Introduction

This plan updates the dependency elimination strategy (objective 2.2 from `plan-feature-code-elimination.md`) to reflect current best practices as of 2025. The original plan recommended `depcheck`, but the tool was archived in June 2025 with maintainers officially recommending `knip` as its successor. This project already has Knip installed and partially configured, but needs optimization for comprehensive dependency analysis and automated cleanup workflows.

## 1. Requirements & Constraints

### Functional Requirements
- **REQ-001**: Detect unused npm dependencies in `package.json` with 99%+ accuracy
- **REQ-002**: Identify missing dependencies referenced in code but not declared
- **REQ-003**: Support ES6 modules, Jest testing environment, and modern build tools
- **REQ-004**: Integrate with existing CI/testing workflows without breaking changes
- **REQ-005**: Generate actionable reports for manual review before automated cleanup

### Technical Requirements  
- **REQ-006**: Use Knip (5.61.3+) as primary dependency analysis tool
- **REQ-007**: Maintain existing `knip.json` configuration compatibility
- **REQ-008**: Support both one-time cleanup and ongoing maintenance workflows
- **REQ-009**: Provide JSON output for programmatic consumption and CI integration

### Security & Safety Requirements
- **SEC-001**: Never auto-remove dependencies without manual approval for production
- **SEC-002**: Maintain ignore lists for edge cases (ESM export maps, dynamic imports)
- **SEC-003**: Validate dependency removal doesn't break runtime functionality

### Constraints
- **CON-001**: Must work with existing ES6 module structure and Jest configuration
- **CON-002**: Cannot break existing npm scripts or development workflow
- **CON-003**: Must handle false positives gracefully through configuration
- **CON-004**: Should integrate with current Husky/lint setup

### Guidelines
- **GUD-001**: Follow Knip official documentation and community best practices
- **GUD-002**: Prefer automated detection with manual review over silent auto-removal
- **GUD-003**: Use incremental adoption - start with unused dependencies, expand to exports/files
- **GUD-004**: Maintain audit trail of what was removed and why

## 2. Implementation Steps

### Phase 1: Knip Configuration Optimization (1-2 hours)

1. **Upgrade and verify Knip installation**
   ```bash
   npm install --save-dev knip@latest
   npx knip --version  # Verify ≥5.61.3
   ```

2. **Enhance knip.json configuration**
   - Add comprehensive ignore patterns for build artifacts
   - Configure production vs development analysis modes
   - Set up proper workspace detection for monorepo readiness
   - Add reporter configuration for different output formats

3. **Add specialized npm scripts**
   ```json
   {
     "scripts": {
       "deps:analyze": "knip --reporter compact",
       "deps:analyze:json": "knip --reporter json > metrics/knip-analysis.json",
       "deps:check:prod": "knip --production --dependencies",
       "deps:check:exports": "knip --exports",
       "deps:check:files": "knip --files",
       "deps:fix:safe": "knip --fix --fix-type dependencies --no-exit-code",
       "deps:report": "knip --reporter markdown > metrics/dependency-report.md"
     }
   }
   ```

### Phase 2: Baseline Analysis and Cleanup (2-3 hours)

1. **Generate comprehensive baseline report**
   ```bash
   npm run deps:analyze:json
   npm run deps:report
   ```

2. **Manual review and categorization**
   - Review `metrics/knip-analysis.json` for unused dependencies
   - Categorize findings: definitely unused, possibly unused, false positives
   - Update `knip.json` ignore lists for confirmed false positives

3. **Safe automated cleanup**
   ```bash
   # Dry run first
   npm run deps:fix:safe -- --dry-run
   # Apply fixes
   npm run deps:fix:safe
   ```

4. **Validation testing**
   ```bash
   npm test
   npm run lint
   npm start  # Verify app still works
   ```

### Phase 3: CI Integration (1 hour)

1. **Add pre-push hook validation**
   ```bash
   npx husky add .husky/pre-push "npm run deps:check:prod"
   ```

2. **Update package.json scripts for CI**
   ```json
   {
     "scripts": {
       "ci:deps": "knip --reporter compact --max-issues 0",
       "ci:deps:report": "knip --reporter json | tee knip-results.json"
     }
   }
   ```

3. **Create metrics directory structure**
   ```bash
   mkdir -p metrics
   echo "knip-*.json" >> .gitignore
   echo "dependency-report.md" >> .gitignore
   ```

### Phase 4: Ongoing Maintenance Automation (1 hour)

1. **Weekly dependency audit script**
   ```bash
   #!/bin/bash
   # scripts/weekly-deps-audit.sh
   echo "🔍 Weekly Dependency Audit - $(date)"
   npm run deps:analyze:json
   if [ -s metrics/knip-analysis.json ]; then
     echo "⚠️  Issues found - see metrics/knip-analysis.json"
     npm run deps:report
   else
     echo "✅ No dependency issues detected"
   fi
   ```

2. **Add to package.json**
   ```json
   {
     "scripts": {
       "maintenance:deps": "bash scripts/weekly-deps-audit.sh"
     }
   }
   ```

## 3. Alternatives

- **ALT-001**: Continue using depcheck despite being archived - Rejected because maintainers officially recommend migration to Knip
- **ALT-002**: Switch to npm-check-unused or similar tools - Rejected because Knip has better ES6 module support and active maintenance  
- **ALT-003**: Build custom dependency scanner - Rejected due to maintenance overhead and Knip's comprehensive feature set
- **ALT-004**: Manual dependency auditing only - Rejected because it doesn't scale and is error-prone

## 4. Dependencies

- **DEP-001**: Knip package (latest version ≥5.61.3)
- **DEP-002**: Node.js ≥18 for Knip compatibility
- **DEP-003**: Existing Husky setup for git hooks
- **DEP-004**: Jest testing framework for validation
- **DEP-005**: Existing package.json and npm scripts structure

## 5. Files

- **FILE-001**: `knip.json` - Enhanced configuration with production/development modes
- **FILE-002**: `package.json` - New dependency analysis scripts
- **FILE-003**: `.husky/pre-push` - Add dependency validation
- **FILE-004**: `scripts/weekly-deps-audit.sh` - Automated maintenance script
- **FILE-005**: `metrics/knip-analysis.json` - Generated analysis output
- **FILE-006**: `metrics/dependency-report.md` - Human-readable reports
- **FILE-007**: `.gitignore` - Exclude generated reports from version control

## 6. Testing

- **TEST-001**: Run `npm test` after dependency removal to ensure no runtime breakage
- **TEST-002**: Verify `npm run lint` passes with updated dependencies
- **TEST-003**: Test application startup and core functionality manually
- **TEST-004**: Validate CI scripts work correctly in clean environment
- **TEST-005**: Test false positive handling by temporarily ignoring known-good dependency
- **TEST-006**: Verify pre-push hook blocks commits when dependency issues exist

## 7. Risks & Assumptions

### Risks
- **RISK-001**: Knip may have false positives with dynamic imports or conditional requires
- **RISK-002**: Over-aggressive cleanup could remove dependencies needed for production runtime
- **RISK-003**: Configuration complexity may introduce maintenance overhead

### Mitigations
- **MIT-001**: Maintain comprehensive ignore lists in `knip.json` for known edge cases
- **MIT-002**: Always run full test suite and manual validation before committing removals
- **MIT-003**: Use incremental adoption and manual review for initial cleanup phase

### Assumptions
- **ASSUMPTION-001**: Knip 5.61.3+ is stable and suitable for production use - **CONFIRMED** by widespread adoption
- **ASSUMPTION-002**: Current ES6 module structure is compatible with Knip analysis - **VERIFIED** in existing setup
- **ASSUMPTION-003**: Team is comfortable with automated tooling for dependency management - **TO BE CONFIRMED**

## 8. Related Specifications / Further Reading

### Primary References
- [Knip Official Documentation](https://knip.dev/)
- [Knip GitHub Repository](https://github.com/webpro-nl/knip) 
- [Depcheck Migration Guide](https://github.com/depcheck/depcheck#note) - Official recommendation to use Knip

### Community Resources
- [Smashing Magazine: Knip Tool Guide](https://www.smashingmagazine.com/2023/08/knip-automated-tool-find-unused-files-exports-dependencies/)
- [Effective TypeScript: Knip Recommendation](https://effectivetypescript.com/2023/07/29/knip/)

### Project Context
- [Original Code Elimination Plan](./plan-feature-code-elimination.md) - Context for this update
- [Project Architecture Guide](../.github/copilot-instructions.md) - ES6 module patterns
- [Current Knip Configuration](../knip.json) - Existing setup to build upon

## Success Metrics

### Immediate Goals (Phase 1-2)
- ✅ Zero unused dependencies detected by Knip
- ✅ No false positives in dependency analysis
- ✅ All tests passing after cleanup
- ✅ Application functionality preserved

### Ongoing Maintenance (Phase 3-4)
- ✅ Pre-push hooks preventing new dependency issues
- ✅ Weekly audit reports generated automatically
- ✅ Team adoption of dependency hygiene practices
- ✅ Reduced maintenance overhead from cleaner dependency tree

### Quality Metrics
- **Target**: <5% false positive rate in dependency detection
- **Target**: 100% test suite pass rate after any dependency removal
- **Target**: Zero production runtime errors from missing dependencies
- **Target**: <2 minute dependency analysis runtime for CI integration
