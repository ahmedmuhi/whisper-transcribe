/**
 * @fileoverview Tests for AzureAPIClient error handling scenarios.
 * Validates proper handling of network failures, authentication errors,
 * API errors, and various error response types.
 */

import { jest } from '@jest/globals';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { MESSAGES } from '../js/constants.js';
import { applyDomSpies } from './setupTests.js';

// Mock Settings
const mockSettings = {
    getModelConfig: jest.fn()
};

// Mock fetch
global.fetch = jest.fn();

// Mock FormData
global.FormData = jest.fn(() => ({
    append: jest.fn()
}));

// Mock URL constructor
global.URL = jest.fn((url) => {
    if (!url.startsWith('http')) {
        throw new Error('Invalid URL');
    }
    return { href: url };
});

// Mock dependencies
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

// Import the API client after mocking
let AzureAPIClient;
beforeAll(async () => {
    ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('AzureAPIClient Error Handling', () => {
    let apiClient;
    let eventBusEmitSpy;
    
    beforeEach(() => {
        jest.clearAllMocks();
        applyDomSpies();
        
        // Setup default mock settings
        mockSettings.getModelConfig.mockReturnValue({
            model: 'whisper',
            apiKey: 'test-api-key',
            uri: 'https://test-api.azure.com'
        });
        
        // Create API client instance
        apiClient = new AzureAPIClient(mockSettings);
        
        // Spy on eventBus emissions
        eventBusEmitSpy = jest.spyOn(eventBus, 'emit');
        
        // Mock successful fetch response by default
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: {
                get: jest.fn().mockReturnValue('application/json')
            },
            json: jest.fn().mockResolvedValue({ text: 'Test transcription' })
        });
    });
    
    afterEach(() => {
        jest.clearAllMocks();
        applyDomSpies();
    });

    describe('Configuration Validation Errors', () => {
        it('should throw error when API key is missing during transcription', async () => {
            // Setup missing API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Attempt to transcribe without API key
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.CONFIGURE_SETTINGS_FIRST);
            
            // transcribe() does not emit API_CONFIG_MISSING events, only throws error
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.anything()
            );
        });
        
        it('should throw error when URI is missing during transcription', async () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: ''
            });
            
            // Attempt to transcribe without URI
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.CONFIGURE_SETTINGS_FIRST);
            
            // transcribe() does not emit API_CONFIG_MISSING events, only throws error
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.anything()
            );
        });
        
        it('should emit event when validateConfig is called with missing API key', () => {
            // Setup missing API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Call validateConfig directly
            expect(() => apiClient.validateConfig()).toThrow();
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'apiKey',
                    model: 'whisper'
                })
            );
        });
        
        it('should emit event when validateConfig is called with missing URI', () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: ''
            });
            
            // Call validateConfig directly
            expect(() => apiClient.validateConfig()).toThrow();
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'uri',
                    model: 'whisper'
                })
            );
        });
        
        it('should emit event when validateConfig is called with invalid URI format', () => {
            // Setup invalid URI format
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'invalid-uri'
            });
            
            // Call validateConfig directly
            expect(() => apiClient.validateConfig()).toThrow();
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'validUri',
                    model: 'whisper'
                })
            );
        });
    });
    
    describe('Network Failure Handling', () => {
        it('should handle network failures gracefully', async () => {
            // Simulate network failure
            global.fetch.mockRejectedValue(new Error('Network error'));
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('Network error');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'Network error'
                })
            );
        });
        
        it('should handle timeout errors', async () => {
            // Simulate timeout
            const timeoutError = new Error('Request timed out');
            global.fetch.mockRejectedValue(timeoutError);
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('Request timed out');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'Request timed out'
                })
            );
        });
        
        it('should handle connection aborted errors', async () => {
            // Simulate aborted request
            const abortError = new Error('The user aborted a request');
            global.fetch.mockRejectedValue(abortError);
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('The user aborted a request');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'The user aborted a request'
                })
            );
        });
    });
    
    describe('API Authentication Errors', () => {
        it('should handle invalid API key errors (401)', async () => {
            // Mock unauthorized response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                text: jest.fn().mockResolvedValue('Invalid API key')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 401');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 401,
                    details: 'Invalid API key'
                })
            );
        });
        
        it('should handle subscription key errors (403)', async () => {
            // Mock forbidden response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: jest.fn().mockResolvedValue('Subscription key is invalid')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 403');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 403,
                    details: 'Subscription key is invalid'
                })
            );
        });
    });
    
    describe('API Rate Limiting Handling', () => {
        it('should handle rate limiting errors (429)', async () => {
            // Mock too many requests response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 429,
                text: jest.fn().mockResolvedValue('Too many requests')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 429');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 429,
                    details: 'Too many requests'
                })
            );
        });
    });
    
    describe('Invalid Audio Format Errors', () => {
        it('should handle invalid audio format errors (400)', async () => {
            // Mock bad request response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: jest.fn().mockResolvedValue('Invalid audio format')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 400');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 400,
                    details: 'Invalid audio format'
                })
            );
        });
        
        it('should handle empty audio file errors', async () => {
            // Mock bad request response for empty file
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: jest.fn().mockResolvedValue('Empty audio file')
            });
            
            // Attempt to transcribe with empty blob
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 400');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 400,
                    details: 'Empty audio file'
                })
            );
        });
    });
    
    describe('Server Error Handling', () => {
        it('should handle server errors (500)', async () => {
            // Mock server error response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: jest.fn().mockResolvedValue('Internal server error')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 500');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 500,
                    details: 'Internal server error'
                })
            );
        });
        
        it('should handle service unavailable errors (503)', async () => {
            // Mock service unavailable response
            global.fetch.mockResolvedValue({
                ok: false,
                status: 503,
                text: jest.fn().mockResolvedValue('Service unavailable')
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('API responded with status: 503');
            
            // Should emit API_REQUEST_ERROR event with specific status
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    status: 503,
                    details: 'Service unavailable'
                })
            );
        });
    });
    
    describe('Malformed Response Handling', () => {
        it('should handle invalid JSON responses', async () => {
            // Mock JSON parsing error
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: jest.fn().mockReturnValue('application/json')
                },
                json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow('Unexpected token');
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: 'Unexpected token'
                })
            );
        });
        
        it('should handle unrecognized response format', async () => {
            // Mock unrecognized response format
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: jest.fn().mockReturnValue('application/json')
                },
                json: jest.fn().mockResolvedValue({ unexpected: 'format' })
            });
            
            // Attempt to transcribe
            await expect(apiClient.transcribe(new Blob())).rejects.toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
            
            // Should emit API_REQUEST_ERROR event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_ERROR,
                expect.objectContaining({
                    error: MESSAGES.UNKNOWN_API_RESPONSE
                })
            );
        });
        
        it('should handle empty responses', async () => {
            // Mock empty response
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    get: jest.fn().mockReturnValue('text/plain')
                },
                text: jest.fn().mockResolvedValue('')
            });
            
            // Attempt to transcribe
            const result = await apiClient.transcribe(new Blob());
            
            // Should return empty string (trimmed)
            expect(result).toBe('');
            
            // Should still emit API_REQUEST_SUCCESS
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_SUCCESS,
                expect.objectContaining({
                    model: 'whisper',
                    transcriptionLength: 0
                })
            );
        });
    });
    
    describe('Progress Callback', () => {
        it('should call onProgress callback with status messages', async () => {
            // Setup mock progress callback
            const onProgress = jest.fn();
            
            // Perform transcription
            await apiClient.transcribe(new Blob(), onProgress);
            
            // Should call onProgress with appropriate message
            expect(onProgress).toHaveBeenCalledWith(MESSAGES.SENDING_TO_WHISPER);
        });
        
        it('should not fail if onProgress is not provided', async () => {
            // Perform transcription without progress callback
            await apiClient.transcribe(new Blob());
            
            // Should complete without errors
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_REQUEST_SUCCESS,
                expect.any(Object)
            );
        });
    });
});
