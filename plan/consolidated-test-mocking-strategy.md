---
goal: Comprehensive Test Mocking Strategy - Navigator APIs, DOM, and Browser Environment
version: 2.0
date_created: 2025-01-06
last_updated: 2025-01-06
owner: Development Team
tags: [testing, mocking, browser-apis, jsdom, consolidated]
status: CONSOLIDATED
---

# Comprehensive Test Mocking Strategy

This consolidated plan addresses proper mocking patterns for browser APIs, Navigator interfaces, and DOM environment testing across all test suites.

## Current Mocking Issues

### Navigator API Problems
- Direct assignment to `navigator.mediaDevices` causes test contamination
- Inconsistent mocking patterns across test suites
- Property descriptor issues in jsdom environment
- Test isolation problems with global object modifications

### Permission API Challenges
- Browser permission variations difficult to test
- Async permission state changes need proper mocking
- Permission recovery scenarios undertested

### HTTPS Validation Testing
- Settings persistence requires HTTPS context mocking
- URL validation tests need proper environment setup
- Security policy testing requires realistic browser behavior

## Unified Mocking Patterns

### Navigator.mediaDevices Mocking
```javascript
// Proper property definition pattern
const originalMediaDevices = global.navigator.mediaDevices;

beforeEach(() => {
  const mockMediaDevices = {
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn(),
    getDisplayMedia: jest.fn()
  };
  
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true,
    configurable: true
  });
});

afterEach(() => {
  if (originalMediaDevices) {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true,
      configurable: true
    });
  } else {
    delete global.navigator.mediaDevices;
  }
});
```

### Permission API Mocking
```javascript
// Comprehensive permission mocking
const mockPermissions = {
  query: jest.fn(),
  revoke: jest.fn()
};

Object.defineProperty(global.navigator, 'permissions', {
  value: mockPermissions,
  writable: true,
  configurable: true
});

// Test various permission states
mockPermissions.query.mockImplementation(({ name }) => {
  if (name === 'microphone') {
    return Promise.resolve({ state: 'granted' });
  }
  return Promise.resolve({ state: 'denied' });
});
```

### HTTPS Context Mocking
```javascript
// Mock secure context for HTTPS validation
Object.defineProperty(global.window, 'isSecureContext', {
  value: true,
  writable: true,
  configurable: true
});

Object.defineProperty(global.window, 'location', {
  value: {
    protocol: 'https:',
    hostname: 'localhost',
    href: 'https://localhost:3000'
  },
  writable: true,
  configurable: true
});
```

## Test Suite Refactoring Plan

### Phase 1: Audio Handler Integration Tests
**File**: `tests/audio-handler-integration.test.js`

**Changes**:
1. Implement proper `navigator.mediaDevices` property definition
2. Add cleanup in `afterEach` to restore original state
3. Use configurable and writable property descriptors
4. Test MediaRecorder lifecycle with realistic mocking

### Phase 2: Permission Manager Tests
**File**: `tests/permission-manager.test.js`

**Changes**:
1. Mock `navigator.permissions` API properly
2. Test permission state transitions
3. Mock browser-specific permission behaviors
4. Test permission recovery scenarios

### Phase 3: Settings Persistence Tests
**File**: `tests/settings-persistence.test.js`

**Changes**:
1. Mock HTTPS context for secure validation
2. Test URL validation with various protocols
3. Mock localStorage with realistic behavior
4. Test configuration migration scenarios

### Phase 4: Error Recovery Tests
**File**: `tests/error-recovery.test.js`

**Changes**:
1. Standardize global object mocking patterns
2. Test navigator API error scenarios
3. Mock network failure conditions
4. Test graceful degradation paths

## Implementation Standards

### Property Definition Pattern
```javascript
// Standard pattern for all global mocking
const originalProperty = global.target.property;

Object.defineProperty(global.target, 'property', {
  value: mockImplementation,
  writable: true,
  configurable: true,
  enumerable: true
});

// Always restore in cleanup
afterEach(() => {
  if (originalProperty !== undefined) {
    Object.defineProperty(global.target, 'property', {
      value: originalProperty,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } else {
    delete global.target.property;
  }
});
```

### Mock Implementation Guidelines
1. **Realistic Behavior**: Mocks should behave like real browser APIs
2. **Async Patterns**: Use proper Promise resolution/rejection
3. **Error Scenarios**: Test both success and failure paths
4. **State Management**: Maintain consistent mock state across tests

### Test Isolation Requirements
1. **Clean Slate**: Each test starts with fresh mock state
2. **No Leakage**: Global modifications don't affect other tests
3. **Restoration**: Original browser behavior restored after tests
4. **Validation**: Verify mock behavior in test assertions

## Browser Compatibility Testing

### MediaRecorder API Variations
```javascript
// Test different browser implementations
const mockMediaRecorder = class {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
  }
  
  start(timeslice) {
    this.state = 'recording';
    // Simulate realistic timing
    setTimeout(() => {
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob() });
      }
    }, timeslice || 100);
  }
  
  stop() {
    this.state = 'inactive';
    if (this.onstop) {
      setTimeout(this.onstop, 0);
    }
  }
};

global.MediaRecorder = mockMediaRecorder;
```

## Success Metrics

### Test Reliability
- [ ] Zero test contamination between suites
- [ ] Consistent mocking patterns across all tests
- [ ] Proper cleanup and restoration
- [ ] No global state leakage

### Coverage Improvements
- [ ] All navigator API error paths tested
- [ ] Permission state variations covered
- [ ] HTTPS validation scenarios tested
- [ ] Browser compatibility edge cases covered

### Development Experience
- [ ] Clear, reusable mocking patterns
- [ ] Easy test debugging with realistic mocks
- [ ] Consistent test behavior across environments
- [ ] Reduced flaky test incidents

This comprehensive approach ensures robust, reliable testing with proper browser API mocking while maintaining test isolation and realistic behavior simulation.
