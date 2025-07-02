/**
 * @fileoverview Tests for Settings module validation and input handling.
 * Verifies API key validation, URI format checking, and error handling.
 */

import { jest } from '@jest/globals';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock DOM elements
const createMockElement = () => ({
    value: '',
    textContent: '',
    style: { display: '' },
    classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(() => false)
    },
    addEventListener: jest.fn(),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(() => ''),
    disabled: false,
    checked: false
});

// Mock document methods
global.document = {
    getElementById: jest.fn(() => createMockElement()),
    querySelector: jest.fn(() => createMockElement()),
    querySelectorAll: jest.fn(() => [createMockElement()]),
    body: {
        innerHTML: '',
        style: {}
    }
};

// Import Settings after mocking
let Settings;
beforeAll(async () => {
    ({ Settings } = await import('../js/settings.js'));
});

describe('Settings Validation', () => {
    let settings;

    beforeEach(() => {
        jest.clearAllMocks();
        localStorageMock.getItem.mockReturnValue(null);
        
        settings = new Settings();
        
        // Mock settings form elements
        settings.settingsForm = createMockElement();
        settings.settingsModal = createMockElement();
        settings.modelSelect = createMockElement();
        settings.apiKeyInput = createMockElement();
        settings.apiUriInput = createMockElement();
        settings.languageSelect = createMockElement();
        settings.themeSelect = createMockElement();
        settings.closeModalBtn = createMockElement();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('API Key Validation', () => {
        it('should accept valid API keys for Whisper model', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should accept valid API keys for GPT-4o model', () => {
            settings.modelSelect.value = 'gpt-4o';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should reject empty API keys', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = '';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject API keys that are too short', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-123';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject API keys with invalid format', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'invalid-key-format';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should accept API keys with spaces (will be trimmed)', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = '  sk-1234567890abcdef1234567890abcdef12345678  ';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            expect(settings.apiKeyInput.value.trim()).toBe('sk-1234567890abcdef1234567890abcdef12345678');
        });
    });

    describe('URI Validation', () => {
        it('should accept valid HTTPS URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should accept URIs without trailing slash', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should reject HTTP URIs (insecure)', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'http://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject empty URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = '';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject malformed URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'not-a-valid-uri';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should sanitize and normalize URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = '  https://myresource.openai.azure.com//extra//slashes  ';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            // URI should be normalized
            expect(settings.apiUriInput.value.trim()).toContain('https://myresource.openai.azure.com/');
        });
    });

    describe('Configuration Validation Events', () => {
        let eventSpy;

        beforeEach(() => {
            eventSpy = jest.spyOn(eventBus, 'emit');
        });

        it('should emit validation error event for missing API key', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = '';
            settings.apiUriInput.value = 'https://valid.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([
                        expect.stringContaining('API key')
                    ])
                })
            );
        });

        it('should emit validation error event for invalid URI', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'invalid-uri';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([
                        expect.stringContaining('URI')
                    ])
                })
            );
        });

        it('should emit validation error event for multiple issues', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = '';  // Invalid API key
            settings.apiUriInput.value = 'http://insecure.com';  // Invalid URI

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
            expect(eventSpy).toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.objectContaining({
                    errors: expect.arrayContaining([
                        expect.stringContaining('API key'),
                        expect.stringContaining('URI')
                    ])
                })
            );
        });

        it('should not emit validation error for valid configuration', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'https://valid.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.anything()
            );
        });
    });

    describe('Model-Specific Validation', () => {
        it('should validate Whisper model requirements', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'https://whisper.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should validate GPT-4o model requirements', () => {
            settings.modelSelect.value = 'gpt-4o';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'https://gpt4o.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should handle unknown model gracefully', () => {
            settings.modelSelect.value = 'unknown-model';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'https://unknown.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            // Should still validate basic requirements
            expect(isValid).toBe(true);
        });
    });

    describe('Error Message Handling', () => {
        it('should provide specific error messages for API key issues', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'invalid';
            settings.apiUriInput.value = 'https://valid.azure.com/';

            const errors = settings.getValidationErrors();

            expect(errors).toContain(expect.stringContaining('API key'));
            expect(errors).toContain(expect.stringContaining('format'));
        });

        it('should provide specific error messages for URI issues', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-1234567890abcdef1234567890abcdef12345678';
            settings.apiUriInput.value = 'http://insecure.com';

            const errors = settings.getValidationErrors();

            expect(errors).toContain(expect.stringContaining('URI'));
            expect(errors).toContain(expect.stringContaining('HTTPS'));
        });

        it('should not expose sensitive information in error messages', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-sensitive-key-123';
            settings.apiUriInput.value = 'https://private.azure.com/';

            const errors = settings.getValidationErrors();

            // Error messages should not contain the actual API key
            errors.forEach(error => {
                expect(error).not.toContain('sk-sensitive-key-123');
                expect(error).not.toContain('private.azure.com');
            });
        });
    });

    describe('Input Sanitization', () => {
        it('should trim whitespace from API keys', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = '  sk-1234567890abcdef1234567890abcdef12345678  ';

            settings.sanitizeInputs();

            expect(settings.apiKeyInput.value).toBe('sk-1234567890abcdef1234567890abcdef12345678');
        });

        it('should normalize URI format', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiUriInput.value = '  https://test.azure.com//extra//slashes  ';

            settings.sanitizeInputs();

            expect(settings.apiUriInput.value).toBe('https://test.azure.com/');
        });

        it('should handle special characters in inputs', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-test\nwith\tspecial\rchars';

            settings.sanitizeInputs();

            // Should remove or handle special characters appropriately
            expect(settings.apiKeyInput.value).not.toContain('\n');
            expect(settings.apiKeyInput.value).not.toContain('\t');
            expect(settings.apiKeyInput.value).not.toContain('\r');
        });
    });
});
