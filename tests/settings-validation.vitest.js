/**
 * @fileoverview Tests for Settings module validation and input handling.
 * Verifies API key validation, URI format checking, and error handling.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { generateMockApiKeyForValidation } from './helpers/mock-api-keys.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
};
global.localStorage = localStorageMock;

// Mock DOM elements
const createMockElement = () => ({
    value: '',
    textContent: '',
    style: { display: '' },
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
    },
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => ''),
    disabled: false,
    checked: false
});

// Mock document methods
global.document = {
    getElementById: vi.fn(() => createMockElement()),
    querySelector: vi.fn(() => createMockElement()),
    querySelectorAll: vi.fn(() => [createMockElement()]),
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
        vi.clearAllMocks();
        applyDomSpies();
        localStorageMock.getItem.mockReturnValue(null);
        
        settings = new Settings();
        
        // Mock settings form elements
        settings.settingsForm = createMockElement();
        settings.settingsModal = createMockElement();
        settings.modelSelect = createMockElement();
        settings.whisperKeyInput = createMockElement();
        settings.whisperUriInput = createMockElement();
        settings.languageSelect = createMockElement();
        settings.themeSelect = createMockElement();
        settings.closeModalBtn = createMockElement();
    });

    afterEach(() => {
        settings.destroy();
        vi.clearAllMocks();
        applyDomSpies();
    });

    describe('API Key Validation', () => {
        it('should accept valid API keys for Whisper model', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should reject empty API keys', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = '';
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject API keys that are too short', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = 'sk-123';
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject API keys with invalid format', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = 'invalid-key-format';
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should accept API keys with spaces (will be trimmed)', () => {
            settings.modelSelect.value = 'whisper';
            const mockKey = generateMockApiKeyForValidation();
            settings.whisperKeyInput.value = `  ${mockKey}  `;
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            expect(settings.whisperKeyInput.value.trim()).toBe(mockKey);
        });
    });

    describe('URI Validation', () => {
        it('should accept valid HTTPS URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should accept URIs without trailing slash', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should reject HTTP URIs (insecure)', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'http://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject empty URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = '';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject malformed URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'not-a-valid-uri';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should sanitize and normalize URIs', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = '  https://myresource.openai.azure.com//extra//slashes  ';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            // URI should be normalized
            expect(settings.whisperUriInput.value.trim()).toContain('https://myresource.openai.azure.com/');
        });
    });

    describe('Configuration Validation Events', () => {
        let eventSpy;

        beforeEach(() => {
            eventSpy = vi.spyOn(eventBus, 'emit');
        });

        it('should emit validation error event for missing API key', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = '';
            settings.whisperUriInput.value = 'https://valid.azure.com/';

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
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'invalid-uri';

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
            settings.whisperKeyInput.value = '';  // Invalid API key
            settings.whisperUriInput.value = 'http://insecure.com';  // Invalid URI

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
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'https://valid.azure.com/';

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
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'https://whisper.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });


        it('should handle unknown model gracefully', () => {
            settings.modelSelect.value = 'unknown-model';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'https://unknown.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            // Should still validate basic requirements
            expect(isValid).toBe(true);
        });
    });

    describe('Error Message Handling', () => {
        it('should provide specific error messages for API key issues', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = 'invalid';
            settings.whisperUriInput.value = 'https://valid.azure.com/';

            const errors = settings.getValidationErrors();

            expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('API key')]));
            expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('format')]));
        });

        it('should provide specific error messages for URI issues', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = 'http://insecure.com';

            const errors = settings.getValidationErrors();

            expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('URI')]));
            expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('HTTPS')]));
        });

        it('should not expose sensitive information in error messages', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = 'sk-sensitive-key-123';
            settings.whisperUriInput.value = 'https://private.azure.com/';

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
            const mockKey = generateMockApiKeyForValidation();
            settings.whisperKeyInput.value = `  ${mockKey}  `;
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            settings.sanitizeInputs();

            expect(settings.whisperKeyInput.value).toBe(mockKey);
        });

        it('should preserve URI format while cleaning whitespace', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = generateMockApiKeyForValidation();
            settings.whisperUriInput.value = '  https://test.azure.com//extra//slashes  ';

            settings.sanitizeInputs();

            expect(settings.whisperUriInput.value).toBe('https://test.azure.com//extra//slashes');
        });

        it('should handle special characters in inputs', () => {
            settings.modelSelect.value = 'whisper';
            settings.whisperKeyInput.value = 'sk-test\nwith\tspecial\rchars';
            settings.whisperUriInput.value = 'https://myresource.openai.azure.com/';

            settings.sanitizeInputs();

            // Should remove or handle special characters appropriately
            expect(settings.whisperKeyInput.value).not.toContain('\n');
            expect(settings.whisperKeyInput.value).not.toContain('\t');
            expect(settings.whisperKeyInput.value).not.toContain('\r');
        });
    });
});
