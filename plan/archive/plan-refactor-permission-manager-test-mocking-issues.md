---
goal: Fix permission-manager.test.js DOM and API Mocking Issues
version: 1.0
date_created: 2025-01-08
owner: Development Team
tags: [refactor, test, mocking, browser-api, bug-fix]
---

# Introduction

The `tests/permission-manager.test.js` file has **10 failing tests out of 11 total** due to browser API mocking issues and DOM environment problems. Following the patterns learned from the settings persistence test fixes, this plan addresses comprehensive Jest testing issues in ES6 module environments with browser API mocking, DOM element handling, and event bus communication.

## Root Cause Analysis Summary

**Primary Issue**: Browser APIs (navigator.mediaDevices, permissions API) not properly mocked in Jest test environment
**Secondary Issues**: DOM mocking issues, event bus communication patterns, user agent detection failures

**Key Finding**: All failing tests are **test infrastructure bugs, not app bugs** - the PermissionManager class logic appears correct.

## 1. Requirements & Constraints

- **REQ-001**: Browser APIs must be properly mocked (navigator.mediaDevices.getUserMedia, navigator.permissions)
- **REQ-002**: DOM elements must be available for permission status display
- **REQ-003**: User agent detection must work for browser-specific instructions
- **REQ-004**: Event bus communication must function properly in test environment
- **REQ-005**: MediaStream and MediaStreamTrack APIs must be mocked correctly
- **REQ-006**: Permission status changes must be testable through proper API mocking
- **REQ-007**: Tests must accurately reflect real PermissionManager behavior patterns
- **SEC-001**: Permission validation logic must remain secure and functional
- **CON-001**: Cannot modify PermissionManager class logic - tests must adapt to existing implementation
- **CON-002**: Must use proper Jest mocking patterns for browser APIs in ES6 module environment
- **CON-003**: DOM spy system from test-dom.js must be properly utilized
- **GUD-001**: Follow established patterns from settings-persistence test fixes
- **GUD-002**: Browser feature detection should be testable and reliable
- **PAT-001**: Apply localStorage mocking lessons to browser API mocking
- **PAT-002**: Use consistent mocking patterns across all test cases

## 2. Implementation Steps

### Step 1: Fix Browser API Mocking (Root Cause)
- **Problem**: `navigator.mediaDevices`, `navigator.permissions` not properly mocked
- **Solution**: Use `Object.defineProperty` and proper Jest mocking for browser APIs
- **Code Pattern**:
  ```javascript
  // Mock navigator.mediaDevices
  const mockGetUserMedia = jest.fn();
  const mockMediaDevices = {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: jest.fn()
  };
  
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true
  });
  
  // Mock permissions API
  const mockPermissionResult = {
    state: 'prompt',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };
  
  const mockPermissions = {
    query: jest.fn().mockResolvedValue(mockPermissionResult)
  };
  
  Object.defineProperty(global.navigator, 'permissions', {
    value: mockPermissions,
    writable: true
  });
  ```
- **Tests Fixed**: All browser support and permission request tests

### Step 2: Fix MediaStream and Track Mocking
- **Problem**: MediaStream and MediaStreamTrack objects not properly mocked
- **Solution**: Create comprehensive mock objects with proper methods
- **Code Pattern**:
  ```javascript
  const mockTrack = {
    stop: jest.fn(),
    enabled: true,
    kind: 'audio',
    readyState: 'live'
  };
  
  const mockStream = {
    getTracks: jest.fn(() => [mockTrack]),
    getAudioTracks: jest.fn(() => [mockTrack]),
    active: true,
    addTrack: jest.fn(),
    removeTrack: jest.fn()
  };
  ```
- **Tests Fixed**: Stream management and cleanup tests

### Step 3: Fix User Agent and Browser Detection
- **Problem**: User agent detection failing in test environment
- **Solution**: Mock navigator.userAgent and browser-specific properties
- **Code Pattern**:
  ```javascript
  beforeEach(() => {
    // Mock user agent for browser detection
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      writable: true
    });
  });
  ```
- **Tests Fixed**: Browser-specific instruction tests

### Step 4: Fix DOM State and Event Bus Integration
- **Problem**: DOM elements and event bus not properly initialized in test environment
- **Solution**: Apply DOM spy patterns and event bus setup from settings tests
- **Code Pattern**:
  ```javascript
  beforeEach(() => {
    // Apply DOM spies
    applyDomSpies();
    
    // Reset event bus
    resetEventBus();
    
    // Setup required DOM elements
    const requiredIds = [ID.STATUS, ID.SETTINGS_MODAL];
    requiredIds.forEach(id => {
      const element = document.getElementById(id);
      element.style.display = '';
      element.textContent = '';
    });
  });
  ```
- **Tests Fixed**: Permission status display and event communication tests

### Step 5: Fix Permission State Management
- **Problem**: Permission status changes not properly testable
- **Solution**: Create mutable permission state that can be changed in tests
- **Code Pattern**:
  ```javascript
  let permissionState = 'prompt';
  const mockPermissionResult = {
    get state() { return permissionState; },
    set state(newState) { permissionState = newState; },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };
  ```
- **Tests Fixed**: Permission status change tests

### Step 6: Fix Error Handling and Edge Cases
- **Problem**: Error scenarios not properly mocked or tested
- **Solution**: Mock specific browser API errors with proper error types
- **Code Pattern**:
  ```javascript
  // Mock permission denied error
  mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
  
  // Mock device not found error
  mockGetUserMedia.mockRejectedValue(new DOMException('Device not found', 'NotFoundError'));
  
  // Mock device in use error
  mockGetUserMedia.mockRejectedValue(new DOMException('Device in use', 'NotReadableError'));
  ```
- **Tests Fixed**: Error handling and recovery tests

## 3. Alternatives

- **ALT-001**: Mock entire PermissionManager class instead of browser APIs - Rejected as it would not test real integration behavior
- **ALT-002**: Use real browser APIs in test environment - Rejected as it would make tests flaky and environment-dependent
- **ALT-003**: Skip permission manager tests entirely - Rejected as permission management is critical functionality
- **ALT-004**: Use Jest environment with jsdom only - **Tried but insufficient** - still need custom API mocking
- **ALT-005**: Use global assignments instead of Object.defineProperty - **Similar to settings localStorage issue** - likely to fail in ES6 modules
- **ALT-006**: Mock navigator entirely - Rejected as it would break other browser feature detection

## 4. Dependencies

- **DEP-001**: Existing PermissionManager class logic in `js/permission-manager.js`
- **DEP-002**: Constants module for event names and messages
- **DEP-003**: Jest testing framework and mocking utilities
- **DEP-004**: DOM spy system in `tests/test-dom.js` for element handling
- **DEP-005**: Event bus mocking utilities in `tests/setupTests.js`
- **DEP-006**: Jest ES6 module configuration (`--experimental-vm-modules`)

## 5. Files

- **FILE-001**: `tests/permission-manager.test.js` - Primary file to be modified with browser API mocking fixes
- **FILE-002**: `tests/setupTests.js` - May need updates for browser API mocking patterns
- **FILE-003**: `tests/helpers/test-dom.js` - DOM spy system (read-only reference)
- **FILE-004**: `js/permission-manager.js` - Reference for behavior (read-only)
- **FILE-005**: `js/constants.js` - Reference for constants (read-only)

## Specific Changes Needed

### tests/permission-manager.test.js
- **Add comprehensive browser API mocking**: Mock navigator.mediaDevices, navigator.permissions with Object.defineProperty
- **Fix MediaStream mocking**: Create proper mock objects with all required methods
- **Add user agent mocking**: Mock navigator.userAgent for browser detection tests
- **Apply DOM state management**: Reset DOM elements and event bus between tests
- **Fix permission state handling**: Create mutable permission status for testing state changes

## 6. Testing

- **TEST-001**: **EXPECTED** - All 11 tests should pass after implementing proper API mocking
- **TEST-002**: **EXPECTED** - Browser support detection works with mocked APIs
- **TEST-003**: **EXPECTED** - Permission request flow works with mocked getUserMedia
- **TEST-004**: **EXPECTED** - Error handling works with properly mocked exceptions
- **TEST-005**: **EXPECTED** - Stream management works with mocked MediaStream objects
- **TEST-006**: **EXPECTED** - Browser-specific instructions work with mocked user agent
- **TEST-007**: **EXPECTED** - Permission status changes work with mutable mock state

## Current Test Failures Analysis
```
❌ Browser Support Detection: 1/2 failing
❌ Permission Request Flow: 3/3 failing  
❌ Permission Status Changes: 1/1 failing
❌ Stream Management: 1/2 failing
❌ Permission Recovery: 3/3 failing
✅ Overall: 1/11 passing (9% success rate)
```

## 7. Risks & Assumptions

- **RISK-001**: Browser API mocking might affect other test files - **MONITOR** - Need to ensure proper test isolation
- **RISK-002**: MediaStream mocking might not cover all edge cases - **MITIGATE** - Test thoroughly with different scenarios
- **RISK-003**: User agent detection might be fragile across different test environments - **PROBABLE** - May need environment-specific handling
- **ASSUMPTION-001**: PermissionManager class logic is correct and functional - **LIKELY** - Based on patterns from settings test analysis
- **ASSUMPTION-002**: Browser API mocking patterns will be similar to localStorage mocking - **VALIDATED** - Same underlying Jest/ES6 module issues
- **ASSUMPTION-003**: DOM spy system will work for permission status display - **CONFIRMED** - Already working in other tests
- **ASSUMPTION-004**: Event bus patterns will be similar to settings tests - **VALIDATED** - Same event bus infrastructure

## Lessons Learned from Settings Tests

### Critical Patterns to Apply
1. **API Mocking in ES6**: Use `Object.defineProperty(global.navigator, 'mediaDevices', ...)` not direct assignment
2. **DOM State Management**: Reset element values and properties in `beforeEach()`
3. **Mock State Management**: Create mutable mocks that can change state during tests
4. **Event Bus Integration**: Properly setup and reset event bus between tests
5. **Test Infrastructure Focus**: Expect all issues to be test bugs, not app bugs

### Red Flags Already Identified
- ✅ Tests failing with browser API-related errors (navigator.mediaDevices undefined)
- ✅ DOM elements not available or not responding to method calls
- ✅ Event bus communication tests with inconsistent results
- ✅ Jest ES6 module environment with global API mocking issues
- ✅ Permission-related functionality failing due to missing browser context

## 8. Related Specifications / Further Reading

### Documentation References
- MDN Web API documentation for MediaDevices and Permissions API
- Jest testing framework documentation for mocking browser APIs
- Jest ES6 module configuration documentation (`--experimental-vm-modules`)
- WebRTC and MediaStream API specifications

### Internal Project References
- `plan-refactor-settings-persistence-test-https-validation.md` - Template and patterns for similar fixes
- `tests/helpers/test-dom.js` - DOM spy system implementation
- `tests/setupTests.js` - Global test setup patterns
- `js/constants.js` - Event names and message constants
- `js/permission-manager.js` - PermissionManager class implementation

### Debugging Techniques to Use
- **Systematic isolation**: Test each failing test individually to identify specific mock requirements
- **Mock verification**: Use Jest mock assertions to verify browser API call patterns
- **State inspection**: Check navigator object properties and permission states between tests
- **Error analysis**: Examine DOMException types and browser-specific error handling

### Future Application
This plan serves as a **template for browser API mocking issues** across the project. The patterns identified here (navigator API mocking, MediaStream handling, permission management) will likely be needed in other test files that interact with:
- Audio recording and playback
- Browser permission systems
- Media device enumeration
- Stream management and cleanup
- Browser-specific feature detection
- WebRTC and media capture APIs

The successful completion of this plan will establish robust patterns for testing browser-dependent functionality in the Jest ES6 module environment.
