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

// Mock browser APIs
const mockMediaDevices = {
    getUserMedia: jest.fn()
};

const mockPermissions = {
    query: jest.fn()
};

const mockMediaRecorder = jest.fn();

// Create mock stream and tracks
const createMockStream = (active = true) => ({
    active,
    getTracks: jest.fn(() => [
        { 
            readyState: active ? 'live' : 'ended',
            stop: jest.fn() 
        }
    ])
});

// Setup global mocks
global.navigator = {
    mediaDevices: mockMediaDevices,
    permissions: mockPermissions,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

global.window = {
    MediaRecorder: mockMediaRecorder
};

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
        
        // Reset mock state
        mockMediaDevices.getUserMedia.mockReset();
        mockPermissions.query.mockReset();
        
        // Create mock UI
        mockUI = {
            statusElement: { textContent: '' }
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
            // Temporarily remove MediaRecorder
            const originalMediaRecorder = global.window.MediaRecorder;
            delete global.window.MediaRecorder;
            
            expect(PermissionManager.checkBrowserSupport()).toBe(false);
            
            // Restore MediaRecorder
            global.window.MediaRecorder = originalMediaRecorder;
        });
    });
    
    describe('Permission Request Flow', () => {
        it('should request microphone permission successfully', async () => {
            // Mock successful permission grant
            const mockStream = createMockStream();
            mockMediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
            
            // Mock permission status
            const mockPermissionStatus = {
                state: 'granted',
                addEventListener: jest.fn((event, callback) => {
                    callback({ target: { state: 'granted' } });
                })
            };
            mockPermissions.query.mockResolvedValueOnce(mockPermissionStatus);
            
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
            // Mock permission denial error
            const deniedError = new Error('Permission denied');
            deniedError.name = 'NotAllowedError';
            mockMediaDevices.getUserMedia.mockRejectedValueOnce(deniedError);
            
            // Mock permission status
            const mockPermissionStatus = {
                state: 'denied',
                addEventListener: jest.fn()
            };
            mockPermissions.query.mockResolvedValueOnce(mockPermissionStatus);
            
            const stream = await permissionManager.requestMicrophoneAccess();
            
            expect(stream).toBeNull();
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.PERMISSION_DENIED,
                expect.objectContaining({ error: 'NotAllowedError' })
            );
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: MESSAGES.PERMISSION_DENIED,
                    type: 'error'
                })
            );
        });
        
        it('should handle missing microphone gracefully', async () => {
            // Mock no microphone error
            const noMicError = new Error('No microphone found');
            noMicError.name = 'NotFoundError';
            mockMediaDevices.getUserMedia.mockRejectedValueOnce(noMicError);
            
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
            // Mock microphone in use error
            const inUseError = new Error('Microphone in use');
            inUseError.name = 'NotReadableError';
            mockMediaDevices.getUserMedia.mockRejectedValueOnce(inUseError);
            
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
            // Create mock permission result with change event capability
            let stateChangeCallback;
            const mockPermissionResult = {
                state: 'prompt',
                addEventListener: jest.fn((event, callback) => {
                    if (event === 'change') {
                        stateChangeCallback = callback;
                    }
                })
            };
            
            mockPermissions.query.mockResolvedValueOnce(mockPermissionResult);
            
            // Get initial permission status
            const initialStatus = await permissionManager.getPermissionStatus();
            expect(initialStatus).toBe('prompt');
            
            // Simulate permission status change to granted
            mockPermissionResult.state = 'granted';
            stateChangeCallback({ target: mockPermissionResult });
            
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.PERMISSION_STATUS_CHANGED,
                { state: 'granted' }
            );
            expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.PERMISSION_GRANTED);
            
            // Simulate permission status change to denied
            mockPermissionResult.state = 'denied';
            stateChangeCallback({ target: mockPermissionResult });
            
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
            // Set Chrome user agent
            const originalUserAgent = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                configurable: true
            });
            
            // Mock denied permission status
            const mockPermissionStatus = {
                state: 'denied',
                addEventListener: jest.fn()
            };
            mockPermissions.query.mockResolvedValueOnce(mockPermissionStatus);
            
            await permissionManager.retryPermissionRequest();
            
            // Should provide Chrome-specific instructions
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: expect.stringContaining(MESSAGES.PERMISSION_CHROME),
                    type: 'error'
                })
            );
            
            // Restore original user agent
            Object.defineProperty(navigator, 'userAgent', {
                value: originalUserAgent,
                configurable: true
            });
        });
        
        it('should provide browser-specific instructions for Firefox', async () => {
            // Set Firefox user agent
            const originalUserAgent = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
                configurable: true
            });
            
            // Mock denied permission status
            const mockPermissionStatus = {
                state: 'denied',
                addEventListener: jest.fn()
            };
            mockPermissions.query.mockResolvedValueOnce(mockPermissionStatus);
            
            await permissionManager.retryPermissionRequest();
            
            // Should provide Firefox-specific instructions
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.UI_STATUS_UPDATE,
                expect.objectContaining({
                    message: expect.stringContaining(MESSAGES.PERMISSION_FIREFOX),
                    type: 'error'
                })
            );
            
            // Restore original user agent
            Object.defineProperty(navigator, 'userAgent', {
                value: originalUserAgent,
                configurable: true
            });
        });
        
        it('should retry permission request if status is not denied', async () => {
            // Mock prompt permission status
            const mockPermissionStatus = {
                state: 'prompt',
                addEventListener: jest.fn()
            };
            mockPermissions.query.mockResolvedValueOnce(mockPermissionStatus);
            
            // Mock successful permission grant on retry
            const mockStream = createMockStream();
            mockMediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);
            
            const result = await permissionManager.retryPermissionRequest();
            
            // Should attempt to request permissions again
            expect(mockMediaDevices.getUserMedia).toHaveBeenCalled();
            expect(result).toBe(mockStream);
        });
    });
});
