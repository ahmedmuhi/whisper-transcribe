/**
 * @fileoverview Tests for PermissionManager to handle browser permissions.
 * Tests permission request flow, denial scenarios, and status changes.
 */

import { jest } from '@jest/globals';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { MESSAGES } from '../js/constants.js';
import { applyDomSpies } from './setupTests.js';

// Mock dependencies
jest.unstable_mockModule('../js/status-helper.js', () => ({
    showTemporaryStatus: jest.fn()
}));

jest.unstable_mockModule('../js/logger.js', () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(() => ({
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }))
    }
}));

// Mock browser APIs using Object.defineProperty for ES6 modules
const mockGetUserMedia = jest.fn();
const mockMediaDevices = {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: jest.fn()
};

const mockPermissionResult = {
    state: 'prompt',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
};

const mockPermissions = {
    query: jest.fn().mockResolvedValue(mockPermissionResult)
};

const mockMediaRecorder = jest.fn();

// Create mock stream and tracks
const createMockStream = (active = true) => {
    const mockTrack = {
        readyState: active ? 'live' : 'ended',
        stop: jest.fn(),
        enabled: true,
        kind: 'audio'
    };
    
    return {
        active,
        getTracks: jest.fn(() => [mockTrack]),
        getAudioTracks: jest.fn(() => [mockTrack]),
        addTrack: jest.fn(),
        removeTrack: jest.fn()
    };
};

// Setup browser API mocks using Object.defineProperty for ES6 modules
Object.defineProperty(global.navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true
});

Object.defineProperty(global.navigator, 'permissions', {
    value: mockPermissions,
    writable: true
});

Object.defineProperty(global.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    writable: true
});

Object.defineProperty(global.window, 'MediaRecorder', {
    value: mockMediaRecorder,
    writable: true
});

// Import the module after setting up mocks
let PermissionManager;

beforeAll(async () => {
    ({ PermissionManager } = await import('../js/permission-manager.js'));
});

describe('PermissionManager', () => {
    let permissionManager;
    let mockUI;
    let eventBusEmitSpy;
    
    beforeEach(() => {
        jest.clearAllMocks();
        applyDomSpies();
        
        // Reset mock state and clear previous calls
        mockGetUserMedia.mockReset();
        mockPermissions.query.mockReset();
        mockPermissionResult.addEventListener.mockReset();
        mockPermissionResult.removeEventListener.mockReset();
        
        // Reset permission state to default
        mockPermissionResult.state = 'prompt';
        mockPermissions.query.mockResolvedValue(mockPermissionResult);
        
        // Create mock UI with DOM elements
        mockUI = {
            statusElement: { 
                textContent: '',
                style: { color: '' },
                _statusTimeout: null
            }
        };
        
        // Spy on eventBus emissions
        eventBusEmitSpy = jest.spyOn(eventBus, 'emit');
        
        // Create PermissionManager instance
        permissionManager = new PermissionManager(mockUI);
    });
    
    afterEach(() => {
        jest.clearAllMocks();
        applyDomSpies();
    });
    
    describe('Browser Support Detection', () => {
        it('should detect supported browsers', () => {
            // All required APIs are available in the mocks
            expect(PermissionManager.checkBrowserSupport()).toBe(true);
        });
        
        it('should detect unsupported browsers', () => {
            // Temporarily remove MediaRecorder using Object.defineProperty
            Object.defineProperty(global.window, 'MediaRecorder', {
                value: undefined,
                writable: true
            });
            
            expect(PermissionManager.checkBrowserSupport()).toBe(false);
            
            // Restore MediaRecorder
            Object.defineProperty(global.window, 'MediaRecorder', {
                value: mockMediaRecorder,
                writable: true
            });
        });
    });
    
    describe('Permission Request Flow', () => {
        it('should request microphone permission successfully', async () => {
            // Mock successful permission grant
            const mockStream = createMockStream();
            mockGetUserMedia.mockResolvedValueOnce(mockStream);
            
            // Mock permission status
            mockPermissionResult.state = 'granted';
            mockPermissions.query.mockResolvedValueOnce(mockPermissionResult);
            
            const stream = await permissionManager.requestMicrophoneAccess();
            
            expect(stream).toBe(mockStream);
            expect(permissionManager.microphoneStream).toBe(mockStream);
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.PERMISSION_GRANTED);
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.MICROPHONE_ACCESS_GRANTED,
                    type: 'success'
                })
            );
        });
        
        it('should handle permission denial gracefully', async () => {
            // Mock permission denial error with proper DOMException
            const deniedError = new DOMException('Permission denied', 'NotAllowedError');
            mockGetUserMedia.mockRejectedValueOnce(deniedError);
            
            // Mock permission status
            mockPermissionResult.state = 'denied';
            mockPermissions.query.mockResolvedValueOnce(mockPermissionResult);
            
            const stream = await permissionManager.requestMicrophoneAccess();
            
            expect(stream).toBeNull();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.PERMISSION_DENIED,
                expect.objectContaining({ error: 'NotAllowedError' })
            );
        });
        
        it('should handle missing microphone gracefully', async () => {
            // Mock no microphone error with proper DOMException
            const noMicError = new DOMException('No microphone found', 'NotFoundError');
            mockGetUserMedia.mockRejectedValueOnce(noMicError);
            
            const stream = await permissionManager.requestMicrophoneAccess();
            
            expect(stream).toBeNull();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.NO_MICROPHONE,
                    type: 'error'
                })
            );
        });
        
        it('should handle microphone in use error', async () => {
            // Mock microphone in use error with proper DOMException
            const inUseError = new DOMException('Microphone in use', 'NotReadableError');
            mockGetUserMedia.mockRejectedValueOnce(inUseError);
            
            const stream = await permissionManager.requestMicrophoneAccess();
            
            expect(stream).toBeNull();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.MICROPHONE_IN_USE,
                    type: 'error'
                })
            );
        });
    });
    
    describe('Permission Status Changes', () => {
        it('should handle permission status changes', async () => {
            // Create mock permission result with proper state management
            let stateChangeCallback;
            const testPermissionResult = {
                state: 'prompt',
                addEventListener: jest.fn((event, callback) => {
                    if (event === 'change') {
                        stateChangeCallback = callback;
                    }
                }),
                removeEventListener: jest.fn()
            };
            
            mockPermissions.query.mockResolvedValueOnce(testPermissionResult);
            
            // Get initial permission status
            const initialStatus = await permissionManager.getPermissionStatus();
            expect(initialStatus).toBe('prompt');
            
            // Simulate permission status change to granted
            testPermissionResult.state = 'granted';
            if (stateChangeCallback) {
                stateChangeCallback({ target: testPermissionResult });
            }
            
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.PERMISSION_STATUS_CHANGED,
                { state: 'granted' }
            );
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.PERMISSION_GRANTED);
            
            // Reset spy for next test
            eventBusEmitSpy.mockClear();
            
            // Simulate permission status change to denied
            testPermissionResult.state = 'denied';
            if (stateChangeCallback) {
                stateChangeCallback({ target: testPermissionResult });
            }
            
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.PERMISSION_STATUS_CHANGED,
                { state: 'denied' }
            );
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.PERMISSION_DENIED);
        });
    });
    
    describe('Stream Management', () => {
        it('should stop microphone stream correctly', () => {
            // Setup active stream
            const mockStream = createMockStream();
            permissionManager.microphoneStream = mockStream;
            
            // Stop the stream
            permissionManager.stopMicrophoneStream();
            
            // Verify tracks were stopped
            expect(mockStream.getTracks).toHaveBeenCalled();
            expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
            expect(permissionManager.microphoneStream).toBeNull();
        });
        
        it('should detect active stream correctly', () => {
            // No stream initially
            expect(permissionManager.hasActiveStream()).toBe(false);
            
            // Set active stream
            const mockStream = createMockStream(true);
            permissionManager.microphoneStream = mockStream;
            
            // Should detect active stream
            expect(permissionManager.hasActiveStream()).toBe(true);
            
            // Set inactive stream
            const inactiveStream = createMockStream(false);
            permissionManager.microphoneStream = inactiveStream;
            
            // Should detect inactive stream
            expect(permissionManager.hasActiveStream()).toBe(false);
        });
    });
    
    describe('Permission Recovery', () => {
        it('should provide browser-specific instructions for Chrome', async () => {
            // Set Chrome user agent using Object.defineProperty
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                writable: true
            });
            
            // Mock denied permission status
            mockPermissionResult.state = 'denied';
            mockPermissions.query.mockResolvedValueOnce(mockPermissionResult);
            
            await permissionManager.retryPermissionRequest();
            
            // Should provide Chrome-specific instructions
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: expect.stringContaining(MESSAGES.PERMISSION_CHROME),
                    type: 'error'
                })
            );
        });
        
        it('should provide browser-specific instructions for Firefox', async () => {
            // Set Firefox user agent using Object.defineProperty
            Object.defineProperty(global.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
                writable: true
            });
            
            // Mock denied permission status
            mockPermissionResult.state = 'denied';
            mockPermissions.query.mockResolvedValueOnce(mockPermissionResult);
            
            await permissionManager.retryPermissionRequest();
            
            // Should provide Firefox-specific instructions
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: expect.stringContaining(MESSAGES.PERMISSION_FIREFOX),
                    type: 'error'
                })
            );
        });
        
        it('should retry permission request if status is not denied', async () => {
            // Mock prompt permission status
            mockPermissionResult.state = 'prompt';
            mockPermissions.query.mockResolvedValueOnce(mockPermissionResult);
            
            // Mock successful permission grant on retry
            const mockStream = createMockStream();
            mockGetUserMedia.mockResolvedValueOnce(mockStream);
            
            const result = await permissionManager.retryPermissionRequest();
            
            // Should attempt to request permissions again
            expect(mockGetUserMedia).toHaveBeenCalled();
            expect(result).toBe(mockStream);
        });
    });
});
