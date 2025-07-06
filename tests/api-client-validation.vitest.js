/**
 * @fileoverview Tests for AzureAPIClient configuration validation.
 * Verifies proper validation of API keys, URIs, and configuration handling.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { MESSAGES } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

// Mock Settings
const mockSettings = {
    getModelConfig: vi.fn()
};

// Mock URL constructor for URI validation
global.URL = vi.fn((url) => {
    if (!url || !url.startsWith('http')) {
        throw new Error('Invalid URL');
    }
    return { href: url };
});

// Mock dependencies
vi.mock('../js/logger.js', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        }))
    }
}));

// Import the API client after mocking
let AzureAPIClient;
beforeAll(async () => {
    ({ AzureAPIClient } = await import('../js/api-client.js'));
});

describe('AzureAPIClient Configuration Validation', () => {
    let apiClient;
    let eventBusEmitSpy;
    
    beforeEach(() => {
        vi.clearAllMocks();
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
        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
    });
    
    afterEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
    });

    describe('validateConfig Method', () => {
        it('should accept valid configuration', () => {
            // Using default valid config from beforeEach
            
            // Validate configuration
            const config = apiClient.validateConfig();
            
            // Should return valid config
            expect(config).toEqual({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'https://test-api.azure.com'
            });
            
            // Should not emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.anything()
            );
        });
        
        it('should throw error for missing API key', () => {
            // Setup missing API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.API_KEY_REQUIRED);
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'apiKey',
                    model: 'whisper'
                })
            );
        });
        
        it('should throw error for missing URI', () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: ''
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.URI_REQUIRED);
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'uri',
                    model: 'whisper'
                })
            );
        });
        
        it('should throw error for invalid URI format', () => {
            // Setup invalid URI format
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'invalid-uri'
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.INVALID_URI_FORMAT);
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'validUri',
                    model: 'whisper'
                })
            );
        });
        
        it('should include model name in error messages', () => {
            // Setup invalid config
            mockSettings.getModelConfig.mockReturnValue({
                model: 'gpt-4o',
                apiKey: '',
                uri: ''
            });
            
            // Validate configuration should throw with model name
            try {
                apiClient.validateConfig();
                fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toContain('gpt-4o');
            }
            
            // Should emit API_CONFIG_MISSING event with correct model
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    model: 'gpt-4o'
                })
            );
        });
    });
    
    describe('Whisper Model Validation', () => {
        it('should properly validate Whisper model configuration', () => {
            // Setup Whisper config
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'whisper-api-key',
                uri: 'https://whisper.azure.com'
            });
            
            // Validate configuration
            const config = apiClient.validateConfig();
            
            // Should return valid config with correct model
            expect(config.model).toBe('whisper');
        });
    });
    
    describe('GPT-4o Model Validation', () => {
        it('should properly validate GPT-4o model configuration', () => {
            // Setup GPT-4o config
            mockSettings.getModelConfig.mockReturnValue({
                model: 'gpt-4o',
                apiKey: 'gpt4o-api-key',
                uri: 'https://gpt4o.azure.com'
            });
            
            // Validate configuration
            const config = apiClient.validateConfig();
            
            // Should return valid config with correct model
            expect(config.model).toBe('gpt-4o');
        });
    });
    
    describe('URI Validation', () => {
        it('should accept HTTPS URIs', () => {
            // Setup config with HTTPS URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'https://secure.azure.com'
            });
            
            // Validate configuration
            const config = apiClient.validateConfig();
            
            // Should accept HTTPS URI
            expect(config.uri).toBe('https://secure.azure.com');
        });
        
        it('should reject URIs without protocol', () => {
            // Setup config with missing protocol
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'azure.com'
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.INVALID_URI_FORMAT);
        });
        
        it('should reject malformed URIs', () => {
            // Setup config with malformed URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'https:/malformed'
            });
            
            // Mock URL constructor to throw for malformed URL
            global.URL.mockImplementationOnce(() => {
                throw new Error('Invalid URL');
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.INVALID_URI_FORMAT);
        });
    });
    
    describe('API Key Validation', () => {
        it('should accept valid API keys', () => {
            // Setup config with valid API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'valid-api-key',
                uri: 'https://test-api.azure.com'
            });
            
            // Validate configuration
            const config = apiClient.validateConfig();
            
            // Should accept valid API key
            expect(config.apiKey).toBe('valid-api-key');
        });
        
        it('should reject empty API keys', () => {
            // Setup config with empty API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.API_KEY_REQUIRED);
        });
        
        it('should reject null API keys', () => {
            // Setup config with null API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: null,
                uri: 'https://test-api.azure.com'
            });
            
            // Validate configuration should throw
            expect(() => apiClient.validateConfig()).toThrow(MESSAGES.API_KEY_REQUIRED);
        });
    });
    
    describe('Event Emission on Configuration Issues', () => {
        it('should emit API_CONFIG_MISSING for missing API key', () => {
            // Setup missing API key
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: '',
                uri: 'https://test-api.azure.com'
            });
            
            // Validate configuration (should throw)
            try {
                apiClient.validateConfig();
            } catch (error) {
                // Expected error
            }
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'apiKey',
                    model: 'whisper'
                })
            );
        });
        
        it('should emit API_CONFIG_MISSING for missing URI', () => {
            // Setup missing URI
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: ''
            });
            
            // Validate configuration (should throw)
            try {
                apiClient.validateConfig();
            } catch (error) {
                // Expected error
            }
            
            // Should emit API_CONFIG_MISSING event
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                APP_EVENTS.API_CONFIG_MISSING,
                expect.objectContaining({
                    missing: 'uri',
                    model: 'whisper'
                })
            );
        });
        
        it('should emit API_CONFIG_MISSING for invalid URI format', () => {
            // Setup invalid URI format
            mockSettings.getModelConfig.mockReturnValue({
                model: 'whisper',
                apiKey: 'test-api-key',
                uri: 'invalid-uri'
            });
            
            // Validate configuration (should throw)
            try {
                apiClient.validateConfig();
            } catch (error) {
                // Expected error
            }
            
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
});
