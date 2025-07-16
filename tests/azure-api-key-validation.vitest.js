/**
 * @fileoverview Tests for Azure OpenAI API key validation fix.
 * Verifies that both OpenAI and Azure OpenAI API key formats are accepted.
 * This addresses the issue where valid Azure OpenAI API keys were incorrectly rejected.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { 
    generateMockApiKeyForValidation, 
    generateMockAzureApiKeyForValidation,
    generateInvalidMockAzureApiKey,
    generateInvalidMockApiKey
} from './helpers/mock-api-keys.js';
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

describe('Azure OpenAI API Key Validation Fix', () => {
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
        settings.apiKeyInput = createMockElement();
        settings.apiUriInput = createMockElement();
        settings.languageSelect = createMockElement();
        settings.themeSelect = createMockElement();
        settings.closeModalBtn = createMockElement();
    });

    afterEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
    });

    describe('OpenAI API Key Format Support (Original Format)', () => {
        it('should accept valid OpenAI API keys with sk- prefix', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateMockApiKeyForValidation();
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should reject OpenAI API keys that are too short', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateInvalidMockApiKey('short');
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should accept OpenAI API keys with mixed case alphanumeric characters', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-ABCDEFGHijklmnop1234567890ABCDEF';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });
    });

    describe('Azure OpenAI API Key Format Support (New Fix)', () => {
        it('should accept valid Azure OpenAI API keys (32 hex characters)', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateMockAzureApiKeyForValidation();
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should accept Azure OpenAI API keys with lowercase hex characters', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'abcdef1234567890abcdef1234567890';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should accept Azure OpenAI API keys with uppercase hex characters', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'ABCDEF1234567890ABCDEF1234567890';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should accept Azure OpenAI API keys with mixed case hex characters', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'AbCdEf1234567890aBcDeF1234567890';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should reject Azure OpenAI API keys that are too short', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateInvalidMockAzureApiKey('short');
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject Azure OpenAI API keys that are too long', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateInvalidMockAzureApiKey('long');
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });

        it('should reject Azure OpenAI API keys with invalid characters', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateInvalidMockAzureApiKey('invalid-chars');
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
        });
    });

    describe('Dual Format Support', () => {
        it('should work with both OpenAI and Azure formats in the same session', () => {
            // Test OpenAI format first
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateMockApiKeyForValidation();
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            let isValid = settings.validateConfiguration();
            expect(isValid).toBe(true);

            // Test Azure format second
            settings.apiKeyInput.value = generateMockAzureApiKeyForValidation();
            isValid = settings.validateConfiguration();
            expect(isValid).toBe(true);
        });

        it('should provide appropriate error messages for both formats', () => {
            // Test invalid OpenAI format
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-invalid';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            let errors = settings.getValidationErrors();
            expect(errors).toContain('Invalid API key format');

            // Test invalid Azure format
            settings.apiKeyInput.value = 'invalid-azure-key';
            errors = settings.getValidationErrors();
            expect(errors).toContain('Invalid API key format');
        });
    });

    describe('Error Message Consistency', () => {
        it('should not expose the actual API key in error messages for OpenAI format', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sk-sensitive-key-123';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const errors = settings.getValidationErrors();

            errors.forEach(error => {
                expect(error).not.toContain('sk-sensitive-key-123');
            });
        });

        it('should not expose the actual API key in error messages for Azure format', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = 'sensitive1234azure5678key9012abcd3456';
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const errors = settings.getValidationErrors();

            errors.forEach(error => {
                expect(error).not.toContain('sensitive1234azure5678key9012abcd3456');
            });
        });
    });

    describe('Whitespace Handling for Both Formats', () => {
        it('should trim whitespace from OpenAI API keys', () => {
            settings.modelSelect.value = 'whisper';
            const mockKey = generateMockApiKeyForValidation();
            settings.apiKeyInput.value = `  ${mockKey}  `;
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should trim whitespace from Azure OpenAI API keys', () => {
            settings.modelSelect.value = 'whisper';
            const mockKey = generateMockAzureApiKeyForValidation();
            settings.apiKeyInput.value = `  ${mockKey}  `;
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
        });

        it('should remove newlines and tabs from Azure OpenAI API keys', () => {
            settings.modelSelect.value = 'whisper';
            const mockKey = generateMockAzureApiKeyForValidation();
            settings.apiKeyInput.value = `\n\t${mockKey}\n\t`;
            settings.apiUriInput.value = 'https://myresource.openai.azure.com/';

            settings.sanitizeInputs();

            // After sanitization, key should be clean
            expect(settings.apiKeyInput.value).toBe(mockKey);
        });
    });

    describe('Validation Events for Both Formats', () => {
        let eventSpy;

        beforeEach(() => {
            eventSpy = vi.spyOn(eventBus, 'emit');
        });

        it('should not emit validation error for valid OpenAI API key', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateMockApiKeyForValidation();
            settings.apiUriInput.value = 'https://valid.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.anything()
            );
        });

        it('should not emit validation error for valid Azure OpenAI API key', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateMockAzureApiKeyForValidation();
            settings.apiUriInput.value = 'https://valid.azure.com/';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            expect(eventSpy).not.toHaveBeenCalledWith(
                APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                expect.anything()
            );
        });

        it('should emit validation error for invalid Azure OpenAI API key', () => {
            settings.modelSelect.value = 'whisper';
            settings.apiKeyInput.value = generateInvalidMockAzureApiKey('invalid-chars');
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
    });
});