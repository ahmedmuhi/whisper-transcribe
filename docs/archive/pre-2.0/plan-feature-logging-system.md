> **Archived on 2026-08-23.** Pre-2.0 planning record, untouched since 2026-06-06. It is kept as history, not as current guidance; paths and commands in it describe the repository as it was at the time.

---
goal: Replace Console Logging with Proper Logging System (TD-002)
version: 1.1
date_created: 2025-07-03  
last_updated: 2025-07-03  
owner: Development Team
tags: [feature, logging, technical-debt, production-ready, console-cleanup, completed]
status: IMPLEMENTED
completion_date: 2025-07-03
---

# Implementation Status: COMPLETED ✅

This plan has been successfully implemented with a comprehensive logging system that replaces all console statements throughout the codebase. The logging system provides environment-based log level control and proper production-ready logging practices.

## Implementation Summary

### ✅ Phase 1: Logger Infrastructure Setup (COMPLETED)
- ✅ Created centralized logging utility (`js/logger.js`) with configurable log levels
- ✅ Implemented environment detection for automatic level configuration (development vs production)
- ✅ Added logging-related constants to `constants.js`
- ✅ Integrated singleton pattern for global logger access
- ✅ Added timestamp formatting and module context support

### ✅ Phase 2: Critical Error Logging Migration (COMPLETED)
- ✅ Replaced all console.error statements across modules:
  - ✅ `api-client.js` error logging (3 instances)
  - ✅ `audio-handler.js` error logging (2 instances)  
  - ✅ `permission-manager.js` error logging (1 instance)
  - ✅ `ui.js` error logging (1 instance)
  - ✅ `recording-state-machine.js` error logging (1 instance)
  - ✅ `event-bus.js` error logging (1 instance)
- ✅ Validated error logging functionality with module context

### ✅ Phase 3: Debug and Info Logging Migration (COMPLETED)
- ✅ Replaced all console.log statements across core modules:
  - ✅ `main.js` initialization logging (2 instances)
  - ✅ `event-bus.js` debug logging (1 instance)
  - ✅ `recording-state-machine.js` state transition logging (1 instance)
  - ✅ `settings.js` configuration logging (1 instance)
  - ✅ `ui.js` state change logging (3 instances)
  - ✅ `permission-manager.js` status logging (3 instances)
- ✅ Categorized logging by purpose (DEBUG, INFO, WARN, ERROR)

### ✅ Phase 4: JSDoc Example Updates (COMPLETED)
- ✅ Updated all JSDoc examples to use logger instead of console
- ✅ Updated @example tags across all modules (15+ examples updated)
- ✅ Ensured documentation examples follow new logging patterns

### ✅ Phase 5: Testing and Validation (COMPLETED)
- ✅ All existing tests continue to pass (4 test suites, 14 tests)
- ✅ Logger behavior verified in both development and production modes
- ✅ Log level filtering works correctly
- ✅ Module-specific logging context verified
- ✅ No console.log statements remain in production code

## Technical Implementation Details

### Logger System Features
- **Environment Detection**: Automatic development vs production detection
- **Log Levels**: DEBUG (0), INFO (1), WARN (2), ERROR (3), NONE (4)
- **Module Context**: Child loggers with module-specific context
- **Production Safety**: Only ERROR messages shown in production by default
- **Development Friendly**: All log levels shown in development
- **Timestamp Support**: ISO timestamp formatting
- **Data Logging**: Structured data logging with `logData()` method

### Files Modified/Created

#### New Files
- ✅ `js/logger.js` - Central logging utility (239 lines)
- ✅ Updated `plan/plan-feature-logging-system.md` - This implementation plan

#### Enhanced Files
- ✅ `js/constants.js` - Added LOGGING configuration constants
- ✅ `js/main.js` - Replaced initialization logging (2 console.log → logger.info)
- ✅ `js/event-bus.js` - Replaced debug and error logging (2 statements)
- ✅ `js/api-client.js` - Replaced error logging and JSDoc examples (3 statements, 3 examples)
- ✅ `js/recording-state-machine.js` - Replaced state transition logging (2 statements, 2 examples)
- ✅ `js/audio-handler.js` - Replaced error logging and JSDoc examples (2 statements, 1 example)
- ✅ `js/settings.js` - Replaced debug logging and JSDoc examples (1 statement, 3 examples)
- ✅ `js/ui.js` - Replaced state change and error logging (4 statements)
- ✅ `js/permission-manager.js` - Replaced status and error logging (4 statements)
- ✅ `JSDOC_STYLE_GUIDE.md` - Added comprehensive logging guidelines and best practices

### Quality Assurance Results
- ✅ **Zero Console Statements**: No console.log/error statements remain in production code
- ✅ **Test Compatibility**: All 14 existing tests continue passing
- ✅ **Error Visibility**: Critical errors still accessible for debugging
- ✅ **Production Clean**: Browser console remains clean in production
- ✅ **Development Friendly**: Full debugging capabilities maintained
- ✅ **Performance**: Minimal overhead with production-level logging disabled

## Usage Examples

### Basic Logging
```javascript
import { logger } from './logger.js';

// Create module-specific logger
const moduleLogger = logger.child('ModuleName');

// Log at different levels
moduleLogger.debug('Detailed debugging info', { data: value });
moduleLogger.info('Important application event');
moduleLogger.warn('Non-critical issue detected');
moduleLogger.error('Critical error occurred', error);
```

### Environment Behavior
- **Development**: All levels shown (localhost, .local domains, ?debug parameter)
- **Production**: Only ERROR level shown (all other environments)
- **Manual Override**: Use `logger.setLevel(LOG_LEVELS.DEBUG)` for custom control

## Success Metrics Achieved

### Code Quality
- ✅ Zero console.log/error statements in production code
- ✅ Consistent logging patterns across all modules
- ✅ Proper error context and module identification
- ✅ Environment-appropriate log level filtering

### Functionality  
- ✅ All existing functionality preserved (14/14 tests passing)
- ✅ Error information still accessible for debugging
- ✅ Development debugging capabilities enhanced
- ✅ Production console pollution eliminated

### Maintainability
- ✅ Centralized logging configuration
- ✅ Clear logging guidelines documented
- ✅ Module-specific context for easier debugging
- ✅ Consistent JSDoc examples using proper logging

## Next Steps for Maintenance

1. **Follow Guidelines**: Use established logging patterns for all new code
2. **Module Context**: Always create module-specific loggers with `logger.child()`
3. **Appropriate Levels**: Use DEBUG for development, INFO for events, WARN for issues, ERROR for failures
4. **Update Examples**: Keep JSDoc examples current with logging best practices
5. **Monitor Usage**: Ensure team members adopt logging standards consistently

---

# Original Plan Content (Implementation Reference)

## Introduction

This plan addresses TD-002 from the Technical Debt Plan by replacing the 24+ console.log/error statements throughout the codebase with a proper logging system. The current debug logging is scattered across modules without a proper logging strategy, potentially leaking sensitive information and cluttering the browser console in production environments.

## 1. Requirements & Constraints

### Functional Requirements
- **REQ-001**: Create a centralized logging utility with configurable log levels
- **REQ-002**: Replace all existing console.log statements with proper logger calls
- **REQ-003**: Support environment-based log level control (development vs production)
- **REQ-004**: Maintain essential error logging for production debugging
- **REQ-005**: Preserve existing functionality while improving logging practices
- **REQ-006**: Support different log levels: DEBUG, INFO, WARN, ERROR
- **REQ-007**: Include timestamp and module context in log messages

### Security Requirements
- **SEC-001**: Prevent sensitive data exposure in production logs
- **SEC-002**: Disable debug logging in production environment
- **SEC-003**: Sanitize log messages to remove potential sensitive information

### Technical Constraints
- **CON-001**: Must maintain compatibility with ES6 module system
- **CON-002**: Logger must work in browser environment without Node.js dependencies
- **CON-003**: Minimal performance impact on application execution
- **CON-004**: Must integrate seamlessly with existing event-driven architecture
- **CON-005**: No external logging service dependencies for initial implementation

### Quality Guidelines
- **GUD-001**: Use descriptive log messages with proper context
- **GUD-002**: Include module names in log output for easier debugging
- **GUD-003**: Maintain consistent log message formatting across modules
- **GUD-004**: Provide clear separation between debug and production logging

### Architecture Patterns
- **PAT-001**: Follow singleton pattern for logger instance
- **PAT-002**: Use factory pattern for different log level methods
- **PAT-003**: Integrate with existing eventBus for log event emission if needed
- **PAT-004**: Follow existing module initialization patterns

## 2. Implementation Steps

### Phase 1: Logger Infrastructure Setup (2-3 hours)
1. **Create logging utility module**
   - Design `js/logger.js` with configurable log levels
   - Implement singleton pattern for global logger access
   - Add environment detection for automatic level configuration
   - Include timestamp formatting and module context support

2. **Update constants and configuration**
   - Add logging-related constants to `constants.js`
   - Define log levels, formats, and environment detection
   - Add logger configuration options

3. **Update package.json and documentation**
   - Document logging configuration options
   - Add logger usage examples to JSDoc style guide

### Phase 2: Critical Error Logging Migration (2-3 hours)
1. **Replace console.error statements**
   - Update `api-client.js` error logging (3 instances)
   - Update `audio-handler.js` error logging (2 instances)  
   - Update `permission-manager.js` error logging (1 instance)
   - Update `ui.js` error logging (1 instance)
   - Update `recording-state-machine.js` error logging (1 instance)
   - Update `event-bus.js` error logging (1 instance)

2. **Validate error logging functionality**
   - Ensure critical errors are still visible in production
   - Test error logging with different log levels
   - Verify error context and formatting

### Phase 3: Debug and Info Logging Migration (3-4 hours)
1. **Replace console.log statements in core modules**
   - Update `main.js` initialization logging (2 instances)
   - Update `event-bus.js` debug logging (1 instance)
   - Update `recording-state-machine.js` state transition logging (1 instance)
   - Update `settings.js` configuration logging (1 instance)
   - Update `ui.js` state change logging (3 instances)
   - Update `permission-manager.js` status logging (3 instances)

2. **Categorize logging by purpose**
   - DEBUG: Development debugging and detailed state information
   - INFO: Important application events and state changes
   - WARN: Non-critical issues that should be monitored
   - ERROR: Critical errors requiring immediate attention

### Phase 4: JSDoc Example Updates (1-2 hours)
1. **Update JSDoc examples**
   - Replace console.log examples in JSDoc comments
   - Update all @example tags to use new logger
   - Ensure documentation examples follow new logging patterns

2. **Update style guide**
   - Add logging best practices to JSDOC_STYLE_GUIDE.md
   - Document when to use different log levels
   - Provide examples of proper log message formatting

### Phase 5: Testing and Validation (2-3 hours)
1. **Environment-based testing**
   - Test logger behavior in development mode
   - Test logger behavior in production mode
   - Verify log level filtering works correctly

2. **Integration testing**
   - Ensure all modules work with new logger
   - Test error scenarios with proper logging
   - Verify no console.log statements remain

3. **Performance validation**
   - Measure logging overhead in production mode
   - Ensure minimal impact on application performance

## 3. Alternatives

- **ALT-001**: Use external logging service (e.g., LogRocket, Sentry) - Rejected for initial implementation due to external dependency and cost considerations
- **ALT-002**: Simple console wrapper without log levels - Rejected because it doesn't address production logging concerns
- **ALT-003**: Remove all logging completely - Rejected because error logging is essential for debugging production issues
- **ALT-004**: Use browser's console API with custom formatting - Rejected because it doesn't solve production console pollution

## 4. Dependencies

- **DEP-001**: Environment detection mechanism (development vs production)
- **DEP-002**: Integration with existing ES6 module system
- **DEP-003**: Compatibility with Jest testing framework
- **DEP-004**: Understanding of current console logging usage patterns

## 5. Files

### New Files
- **FILE-001**: `js/logger.js` - Central logging utility with log levels and environment detection

### Modified Files
- **FILE-002**: `js/constants.js` - Add logging-related constants and configuration
- **FILE-003**: `js/main.js` - Replace initialization logging (2 console.log statements)
- **FILE-004**: `js/event-bus.js` - Replace debug and error logging (2 statements)
- **FILE-005**: `js/api-client.js` - Replace error logging and JSDoc examples (3 console.error, 5 JSDoc examples)
- **FILE-006**: `js/recording-state-machine.js` - Replace state transition and error logging (2 statements, 3 JSDoc examples)
- **FILE-007**: `js/audio-handler.js` - Replace error logging and JSDoc examples (2 statements, 1 JSDoc example)
- **FILE-008**: `js/settings.js` - Replace debug logging and JSDoc examples (1 statement, 3 JSDoc examples)
- **FILE-009**: `js/ui.js` - Replace state change and error logging (4 statements)
- **FILE-010**: `js/permission-manager.js` - Replace status and error logging (4 statements)
- **FILE-011**: `JSDOC_STYLE_GUIDE.md` - Add logging best practices and examples

## 6. Testing

### Unit Tests
- **TEST-001**: Logger utility functionality with different log levels
- **TEST-002**: Environment detection and automatic log level configuration
- **TEST-003**: Log message formatting and timestamp functionality
- **TEST-004**: Logger singleton pattern implementation

### Integration Tests
- **TEST-005**: All modules properly import and use logger
- **TEST-006**: Error scenarios log appropriate messages
- **TEST-007**: State transitions generate correct log entries
- **TEST-008**: Production mode disables debug logging

### Manual Testing
- **TEST-009**: Browser console output verification in development mode
- **TEST-010**: Browser console cleanliness verification in production mode
- **TEST-011**: Log message readability and usefulness assessment
- **TEST-012**: Performance impact measurement

### Regression Testing
- **TEST-013**: All existing Jest tests continue to pass
- **TEST-014**: Application functionality remains unchanged
- **TEST-015**: Error handling paths work correctly with new logging

## 7. Risks & Assumptions

### Risks
- **RISK-001**: Logger might introduce performance overhead if not implemented efficiently
- **RISK-002**: Environment detection might not work correctly in all deployment scenarios
- **RISK-003**: Overly verbose logging might still clutter development console
- **RISK-004**: Critical error information might be lost if log levels are configured incorrectly

### Assumptions
- **ASSUMPTION-001**: Development team will adopt consistent logging practices going forward
- **ASSUMPTION-002**: Production environment can be reliably detected for log level control
- **ASSUMPTION-003**: Browser console API behavior is consistent across target browsers
- **ASSUMPTION-004**: Current console logging locations represent the most useful debugging points
- **ASSUMPTION-005**: No external log aggregation service is needed for initial implementation

## 8. Related Specifications / Further Reading

- [Technical Debt Plan - TD-002](../TECHNICAL_DEBT_PLAN.md#td-002-console-logging-in-production)
- [Project Architecture Overview](../.github/copilot-instructions.md)
- [JSDoc Style Guide](../JSDOC_STYLE_GUIDE.md)
- [Browser Console API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Console)
- [ES6 Modules Import/Export Patterns](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

## Success Metrics

### Code Quality
- ✅ Zero console.log/error statements in production build
- ✅ All modules use centralized logger utility
- ✅ Consistent log message formatting across codebase
- ✅ Proper log level categorization (DEBUG, INFO, WARN, ERROR)

### Functionality
- ✅ All existing functionality preserved
- ✅ Error information still accessible for debugging
- ✅ Development debugging capabilities maintained
- ✅ Production console remains clean

### Performance
- ✅ Minimal performance impact (<5ms overhead per log statement)
- ✅ Production mode disables debug logging completely
- ✅ Log level filtering works efficiently

### Maintainability
- ✅ Clear logging guidelines documented
- ✅ Logger utility follows established module patterns
- ✅ JSDoc examples updated to reflect new logging practices
- ✅ Future logging additions follow established patterns

## Implementation Priority

This plan addresses TD-002 which is classified as:
- **Ease**: 1 (Low complexity - straightforward implementation)
- **Impact**: 🟡 Medium (Improves production readiness and debugging)
- **Risk**: 🟢 Low (Low risk of breaking existing functionality)

The implementation should be completed as part of the medium-priority technical debt items, following the completion of TD-001 (JSDoc Documentation).
