/**
 * @fileoverview Unit tests for Settings class.
 * Combines DOM caching verification and helper method isolation tests.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { ID } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';
import { generateMockApiKey, generateMockApiKeyForValidation, generateInvalidMockApiKey } from './helpers/mock-api-keys.js';
import { createMockElement } from './helpers/mock-settings-dom.js';

// ─── DOM Caching Tests (uses real happy-dom) ─────────────────────────────────

describe('Settings DOM Caching', () => {
  let Settings;
  let spyGetById;

  beforeAll(async () => {
    vi.useFakeTimers();
    ({ Settings } = await import('../js/settings.js'));
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    const elementIds = [
      ID.MODEL_SELECT,
      ID.SETTINGS_MODAL,
      ID.CLOSE_MODAL,
      ID.SAVE_SETTINGS,
      ID.SETTINGS_BUTTON,
      ID.STATUS,
      ID.WHISPER_SETTINGS,
      ID.MAI_TRANSCRIBE_SETTINGS,
      ID.WHISPER_URI,
      ID.WHISPER_KEY,
      ID.MAI_TRANSCRIBE_URI,
      ID.MAI_TRANSCRIBE_KEY
    ];
    elementIds.forEach((id) => {
      let el;
      if ([ID.WHISPER_URI, ID.WHISPER_KEY, ID.MAI_TRANSCRIBE_URI, ID.MAI_TRANSCRIBE_KEY].includes(id)) {
        el = document.createElement('input');
      } else {
        el = document.createElement('div');
      }
      el.id = id;
      document.body.appendChild(el);
    });

    spyGetById = vi.spyOn(document, 'getElementById');
  });

  afterEach(() => {
    vi.clearAllTimers();
    spyGetById.mockRestore();
  });

  test('should call document.getElementById only during construction', () => {
    const settings = new Settings();

    expect(spyGetById).toHaveBeenCalled();

    spyGetById.mockClear();

    settings.updateSettingsVisibility();
    settings.loadSettingsToForm();
    settings.sanitizeInputs();
    settings.validateConfiguration();
    settings.getValidationErrors();
    settings.saveSettings();

    expect(spyGetById).not.toHaveBeenCalled();

    settings.destroy();
  });
});

// ─── Helper Method Isolation Tests (uses mocked document) ────────────────────

const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
};

const mockElements = {};

describe('Settings Helper Methods - Isolated Unit Tests', () => {
    let SettingsClass;
    let settings;
    let mockModelSelect;
    let mockApiKeyInput;
    let mockUriInput;

    beforeAll(async () => {
        // Override globals before dynamic import so Settings binds to mocks
        global.localStorage = localStorageMock;
        global.URL = vi.fn();
        global.document = {
            getElementById: vi.fn((id) => mockElements[id] || createMockElement()),
            querySelector: vi.fn(() => createMockElement()),
            querySelectorAll: vi.fn(() => [createMockElement()]),
            body: { innerHTML: '', style: {} }
        };
        ({ Settings: SettingsClass } = await import('../js/settings.js'));
    });

    beforeEach(() => {
        vi.clearAllMocks();
        applyDomSpies();

        localStorageMock.getItem.mockReturnValue(null);

        // Create fresh mock elements for each test
        mockModelSelect = createMockElement('whisper');
        mockApiKeyInput = createMockElement('');
        mockUriInput = createMockElement('');

        // Set up mock elements mapping
        mockElements[ID.MODEL_SELECT] = mockModelSelect;
        mockElements[ID.SETTINGS_MODEL_SELECT] = mockModelSelect;
        mockElements[ID.WHISPER_KEY] = mockApiKeyInput;
        mockElements[ID.WHISPER_URI] = mockUriInput;
        mockElements[ID.MAI_TRANSCRIBE_KEY] = createMockElement('');
        mockElements[ID.MAI_TRANSCRIBE_URI] = createMockElement('');
        mockElements[ID.SETTINGS_MODAL] = createMockElement();
        mockElements[ID.CLOSE_MODAL] = createMockElement();
        mockElements[ID.SAVE_SETTINGS] = createMockElement();
        mockElements[ID.SETTINGS_BUTTON] = createMockElement();
        mockElements[ID.STATUS] = createMockElement();
        mockElements[ID.WHISPER_SETTINGS] = createMockElement();
        mockElements[ID.MAI_TRANSCRIBE_SETTINGS] = createMockElement();

        // Mock URL constructor with realistic behavior
        global.URL.mockImplementation((url) => {
            if (!url || typeof url !== 'string') {
                throw new Error('Invalid URL');
            }

            const httpsMatch = url.match(/^(https?):\/\/([^\/]+)(\/.*)?$/);
            if (!httpsMatch) {
                throw new Error('Invalid URL');
            }

            const [, protocol, host, path = '/'] = httpsMatch;
            return {
                protocol: protocol + ':',
                host,
                origin: `${protocol}://${host}`,
                pathname: path,
                href: url
            };
        });

        // Create settings instance
        settings = new SettingsClass();

        // Mock checkInitialSettings to prevent setTimeout issues in tests
        vi.spyOn(settings, 'checkInitialSettings').mockImplementation(() => {});

        // Override DOM references for isolated testing
        settings.modelSelect = mockModelSelect;
        settings.settingsModelSelect = mockModelSelect;
        settings.whisperKeyInput = mockApiKeyInput;
        settings.whisperUriInput = mockUriInput;
    });

    afterEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
        vi.clearAllTimers();
    });

    describe('sanitizeInputs Method', () => {
        describe('API Key Sanitization', () => {
            it('should trim whitespace from API key', () => {
                const mockKey = generateMockApiKey('TRIM');
                mockApiKeyInput.value = `  ${mockKey}  `;

                settings.sanitizeInputs();

                expect(mockApiKeyInput.value).toBe(mockKey);
            });

            it('should remove newlines from API key', () => {
                const baseMockKey = generateMockApiKey('NEWLINE');
                const keyWithNewline = baseMockKey.substring(0, 15) + '\n' + baseMockKey.substring(15);
                mockApiKeyInput.value = keyWithNewline;

                settings.sanitizeInputs();

                expect(mockApiKeyInput.value).toBe(baseMockKey);
            });

            it('should remove tabs from API key', () => {
                const baseMockKey = generateMockApiKey('TAB');
                const keyWithTab = baseMockKey.substring(0, 15) + '\t' + baseMockKey.substring(15);
                mockApiKeyInput.value = keyWithTab;

                settings.sanitizeInputs();

                expect(mockApiKeyInput.value).toBe(baseMockKey);
            });

            it('should remove carriage returns from API key', () => {
                const baseMockKey = generateMockApiKey('CR');
                const keyWithCR = baseMockKey.substring(0, 15) + '\r' + baseMockKey.substring(15);
                mockApiKeyInput.value = keyWithCR;

                settings.sanitizeInputs();

                expect(mockApiKeyInput.value).toBe(baseMockKey);
            });

            it('should handle multiple whitespace characters', () => {
                const mockKey = generateMockApiKey('MULTI');
                mockApiKeyInput.value = `  \n\t\r${mockKey}\n\t\r  `;

                settings.sanitizeInputs();

                expect(mockApiKeyInput.value).toBe(mockKey);
            });

            it('should handle empty API key input', () => {
                mockApiKeyInput.value = '';

                settings.sanitizeInputs();

                expect(mockApiKeyInput.value).toBe('');
            });

            it('should handle null API key input gracefully', () => {
                mockApiKeyInput.value = null;

                expect(() => settings.sanitizeInputs()).not.toThrow();
            });
        });

        describe('URI Sanitization', () => {
            it('should trim whitespace from URI', () => {
                mockUriInput.value = '  https://test.azure.com/  ';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('https://test.azure.com/');
            });

            it('should preserve complete URI path and query parameters', () => {
                mockUriInput.value = 'https://test.azure.com/extra/path';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('https://test.azure.com/extra/path');
            });

            it('should handle URI with multiple slashes by preserving them', () => {
                mockUriInput.value = 'https://test.azure.com//extra//slashes//';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('https://test.azure.com//extra//slashes//');
            });

            it('should remove newlines and tabs from URI', () => {
                mockUriInput.value = 'https://test\n.azure\t.com/';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('https://test.azure.com/');
            });

            it('should handle malformed URI gracefully', () => {
                mockUriInput.value = '  invalid-uri-format  ';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('invalid-uri-format');
            });

            it('should handle empty URI input', () => {
                mockUriInput.value = '';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('');
            });

            it('should preserve valid HTTPS URI with port and path', () => {
                mockUriInput.value = 'https://test.azure.com:8080/path';

                settings.sanitizeInputs();

                expect(mockUriInput.value).toBe('https://test.azure.com:8080/path');
            });
        });

        describe('Model-Specific Element Selection', () => {
            it('should use correct elements for Whisper model', () => {
                settings.settingsModelSelect.value = 'whisper';
                const whisperKey = createMockElement('test-whisper-key');
                const whisperUri = createMockElement('https://whisper.test.com/');
                mockElements[ID.WHISPER_KEY] = whisperKey;
                mockElements[ID.WHISPER_URI] = whisperUri;

                settings.whisperKeyInput = whisperKey;
                settings.whisperUriInput = whisperUri;

                settings.sanitizeInputs();

                expect(whisperKey.value.trim).toBeDefined();
                expect(whisperUri.value.trim).toBeDefined();
            });

            it('should use MAI inputs when MAI model is selected', () => {
                settings.settingsModelSelect.value = 'mai-transcribe';
                const whisperKey = createMockElement('  whisper-key  ');
                const whisperUri = createMockElement('  https://whisper.test.com/  ');
                const maiKey = createMockElement('  mai-key  ');
                const maiUri = createMockElement('  https://mai.test.com/endpoint  ');

                settings.whisperKeyInput = whisperKey;
                settings.whisperUriInput = whisperUri;
                settings.maiTranscribeKeyInput = maiKey;
                settings.maiTranscribeUriInput = maiUri;

                settings.sanitizeInputs();

                expect(maiKey.value).toBe('mai-key');
                expect(maiUri.value).toBe('https://mai.test.com/endpoint');
                expect(whisperKey.value).toBe('  whisper-key  ');
                expect(whisperUri.value).toBe('  https://whisper.test.com/  ');
            });
        });

        describe('_getActiveInputs Method', () => {
            it('should select whisper inputs for whisper model', () => {
                settings.settingsModelSelect.value = 'whisper';

                const result = settings._getActiveInputs();

                expect(result.apiKeyInput).toBe(settings.whisperKeyInput);
                expect(result.uriInput).toBe(settings.whisperUriInput);
            });

            it('should select MAI inputs for MAI model', () => {
                settings.settingsModelSelect.value = 'mai-transcribe';
                const maiKey = createMockElement('mai-key');
                const maiUri = createMockElement('https://mai.test.com');
                settings.maiTranscribeKeyInput = maiKey;
                settings.maiTranscribeUriInput = maiUri;

                const result = settings._getActiveInputs();

                expect(result.apiKeyInput).toBe(maiKey);
                expect(result.uriInput).toBe(maiUri);
            });

            it('should fall back to whisper inputs for unknown model', () => {
                settings.settingsModelSelect.value = 'unknown-model';

                const result = settings._getActiveInputs();

                expect(result.apiKeyInput).toBe(settings.whisperKeyInput);
                expect(result.uriInput).toBe(settings.whisperUriInput);
            });
        });
    });

    describe('getValidationErrors Method', () => {
        describe('API Key Validation', () => {
            it('should return error for empty API key', () => {
                mockApiKeyInput.value = '';

                const errors = settings.getValidationErrors();

                expect(errors).toContain('API key is required');
            });

            it('should return error for API key with invalid format', () => {
                mockApiKeyInput.value = 'invalid-key-format';

                const errors = settings.getValidationErrors();

                expect(errors).toContain('Invalid API key format');
            });

            it('should return error for API key that is too short', () => {
                mockApiKeyInput.value = generateInvalidMockApiKey('short');

                const errors = settings.getValidationErrors();

                expect(errors).toContain('Invalid API key format');
            });

            it('should accept valid API key format', () => {
                const mockKey = generateMockApiKeyForValidation();
                mockApiKeyInput.value = mockKey;
                mockUriInput.value = 'https://valid.azure.com/';

                const errors = settings.getValidationErrors();

                expect(errors).not.toContain('API key is required');
                expect(errors).not.toContain('Invalid API key format');
            });

            it('should accept API key with numbers and letters', () => {
                const mockKey = generateMockApiKeyForValidation();
                mockApiKeyInput.value = mockKey;
                mockUriInput.value = 'https://valid.azure.com/';

                const errors = settings.getValidationErrors();

                expect(errors).not.toContain('Invalid API key format');
            });

            it('should reject API key without sk- prefix', () => {
                mockApiKeyInput.value = generateInvalidMockApiKey('no-prefix');

                const errors = settings.getValidationErrors();

                expect(errors).toContain('Invalid API key format');
            });
        });

        describe('URI Validation', () => {
            it('should return error for empty URI', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = '';

                const errors = settings.getValidationErrors();

                expect(errors).toContain('URI is required');
            });

            it('should return error for HTTP URI (not HTTPS)', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'http://insecure.azure.com/';

                const errors = settings.getValidationErrors();

                expect(errors).toContain('URI must use HTTPS');
            });

            it('should return error for malformed URI', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'not-a-valid-uri';

                global.URL.mockImplementationOnce(() => {
                    throw new Error('Invalid URL');
                });

                const errors = settings.getValidationErrors();

                expect(errors).toContain('Invalid URI format');
            });

            it('should accept valid HTTPS URI', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'https://valid.azure.com/';

                const errors = settings.getValidationErrors();

                expect(errors).not.toContain('URI is required');
                expect(errors).not.toContain('URI must use HTTPS');
                expect(errors).not.toContain('Invalid URI format');
            });

            it('should accept HTTPS URI with port', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'https://valid.azure.com:8080/';

                const errors = settings.getValidationErrors();

                expect(errors).not.toContain('URI must use HTTPS');
            });
        });

        describe('Combined Validation', () => {
            it('should return multiple errors when both API key and URI are invalid', () => {
                mockApiKeyInput.value = '';
                mockUriInput.value = '';

                const errors = settings.getValidationErrors();

                expect(errors).toContain('API key is required');
                expect(errors).toContain('URI is required');
                expect(errors).toHaveLength(2);
            });

            it('should return no errors for valid configuration', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'https://valid.azure.com/';

                const errors = settings.getValidationErrors();

                expect(errors).toHaveLength(0);
            });

            it('should sanitize inputs before validation', () => {
                const mockKey = generateMockApiKey('SANITIZE');
                mockApiKeyInput.value = `  ${mockKey}  `;
                mockUriInput.value = '  https://valid.azure.com/extra/path  ';

                const errors = settings.getValidationErrors();

                expect(errors).toHaveLength(0);
                expect(mockApiKeyInput.value).toBe(mockKey);
                expect(mockUriInput.value).toBe('https://valid.azure.com/extra/path');
            });
        });

        describe('Error Message Content', () => {
            it('should not expose sensitive information in error messages', () => {
                mockApiKeyInput.value = 'sk-sensitive-key-123';
                mockUriInput.value = 'https://private.company.com/';

                const errors = settings.getValidationErrors();

                errors.forEach(error => {
                    expect(error).not.toContain('sk-sensitive-key-123');
                    expect(error).not.toContain('private.company.com');
                });
            });

            it('should provide clear, actionable error messages', () => {
                mockApiKeyInput.value = 'invalid';
                mockUriInput.value = 'http://insecure.com';

                const errors = settings.getValidationErrors();

                expect(errors).toEqual([
                    'Invalid API key format',
                    'URI must use HTTPS'
                ]);
            });
        });
    });

    describe('validateConfiguration Method', () => {
        let eventBusEmitSpy;

        beforeEach(() => {
            eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
        });

        describe('Valid Configuration', () => {
            it('should return true for valid configuration', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'https://valid.azure.com/';

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(true);
            });

            it('should not emit validation error event for valid configuration', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'https://valid.azure.com/';

                settings.validateConfiguration();

                expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                    APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                    expect.anything()
                );
            });

            it('should sanitize inputs before validation', () => {
                const mockKey = generateMockApiKey('VALIDATE');
                mockApiKeyInput.value = `  ${mockKey}  `;
                mockUriInput.value = '  https://valid.azure.com/extra/path  ';

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(true);
                expect(mockApiKeyInput.value).toBe(mockKey);
                expect(mockUriInput.value).toBe('https://valid.azure.com/extra/path');
            });
        });

        describe('Invalid Configuration', () => {
            it('should return false for missing API key', () => {
                mockApiKeyInput.value = '';
                mockUriInput.value = 'https://valid.azure.com/';

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(false);
            });

            it('should return false for invalid API key format', () => {
                mockApiKeyInput.value = 'invalid-key';
                mockUriInput.value = 'https://valid.azure.com/';

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(false);
            });

            it('should return false for missing URI', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = '';

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(false);
            });

            it('should return false for HTTP URI', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'http://insecure.azure.com/';

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(false);
            });

            it('should return false for malformed URI', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'not-a-valid-uri';

                global.URL.mockImplementationOnce(() => {
                    throw new Error('Invalid URL');
                });

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(false);
            });
        });

        describe('Event Emission', () => {
            it('should emit validation error event with error details', () => {
                mockApiKeyInput.value = '';
                mockUriInput.value = '';

                settings.validateConfiguration();

                expect(eventBusEmitSpy).toHaveBeenCalledWith(
                    APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                    {
                        errors: [
                            'API key is required',
                            'URI is required'
                        ]
                    }
                );
            });

            it('should emit validation error event for single error', () => {
                mockApiKeyInput.value = generateMockApiKeyForValidation();
                mockUriInput.value = 'http://insecure.com/';

                settings.validateConfiguration();

                expect(eventBusEmitSpy).toHaveBeenCalledWith(
                    APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                    {
                        errors: ['URI must use HTTPS']
                    }
                );
            });

            it('should emit validation error event for multiple errors', () => {
                mockApiKeyInput.value = 'invalid-key';
                mockUriInput.value = 'http://insecure.com/';

                settings.validateConfiguration();

                expect(eventBusEmitSpy).toHaveBeenCalledWith(
                    APP_EVENTS.SETTINGS_VALIDATION_ERROR,
                    {
                        errors: [
                            'Invalid API key format',
                            'URI must use HTTPS'
                        ]
                    }
                );
            });
        });

        describe('Model-Specific Validation', () => {
            it('should validate Whisper model configuration', () => {
                mockModelSelect.value = 'whisper';
                const whisperKey = createMockElement(generateMockApiKeyForValidation());
                const whisperUri = createMockElement('https://whisper.azure.com/');
                mockElements[ID.WHISPER_KEY] = whisperKey;
                mockElements[ID.WHISPER_URI] = whisperUri;

                settings.whisperKeyInput = whisperKey;
                settings.whisperUriInput = whisperUri;

                const isValid = settings.validateConfiguration();

                expect(isValid).toBe(true);
            });

        });
    });

    describe('Integration Between Methods', () => {
        it('should sanitize inputs before getting validation errors', () => {
            const mockKey = generateMockApiKey('INTEGRATION');
            mockApiKeyInput.value = `  ${mockKey}  `;
            mockUriInput.value = '  https://valid.azure.com/path  ';

            const errors = settings.getValidationErrors();

            expect(errors).toHaveLength(0);
            expect(mockApiKeyInput.value).toBe(mockKey);
            expect(mockUriInput.value).toBe('https://valid.azure.com/path');
        });

        it('should sanitize inputs before validating configuration', () => {
            const mockKey = generateMockApiKey('CONFIG');
            mockApiKeyInput.value = `  ${mockKey}  `;
            mockUriInput.value = '  https://valid.azure.com/path  ';

            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(true);
            expect(mockApiKeyInput.value).toBe(mockKey);
            expect(mockUriInput.value).toBe('https://valid.azure.com/path');
        });

        it('should use same validation logic in both methods', () => {
            mockApiKeyInput.value = 'invalid-key';
            mockUriInput.value = 'http://insecure.com/';

            const errors = settings.getValidationErrors();
            const isValid = settings.validateConfiguration();

            expect(isValid).toBe(false);
            expect(errors).toEqual([
                'Invalid API key format',
                'URI must use HTTPS'
            ]);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle null input values gracefully in sanitizeInputs', () => {
            const nullKeyElement = createMockElement();
            const nullUriElement = createMockElement();
            nullKeyElement.value = null;
            nullUriElement.value = null;

            settings.whisperKeyInput = nullKeyElement;
            settings.whisperUriInput = nullUriElement;

            expect(() => settings.sanitizeInputs()).not.toThrow();
            expect(nullKeyElement.value).toBe(null);
            expect(nullUriElement.value).toBe(null);
        });

        it('should handle undefined input values gracefully in sanitizeInputs', () => {
            const undefinedKeyElement = createMockElement();
            const undefinedUriElement = createMockElement();
            undefinedKeyElement.value = undefined;
            undefinedUriElement.value = undefined;

            settings.whisperKeyInput = undefinedKeyElement;
            settings.whisperUriInput = undefinedUriElement;

            expect(() => settings.sanitizeInputs()).not.toThrow();
            expect(undefinedKeyElement.value).toBe(undefined);
            expect(undefinedUriElement.value).toBe(undefined);
        });

        it('should handle validation methods with null values', () => {
            const nullKeyElement = createMockElement();
            const nullUriElement = createMockElement();
            nullKeyElement.value = null;
            nullUriElement.value = null;

            settings.whisperKeyInput = nullKeyElement;
            settings.whisperUriInput = nullUriElement;

            expect(() => settings.getValidationErrors()).toThrow('Cannot read properties of null');
            expect(() => settings.validateConfiguration()).toThrow('Cannot read properties of null');
        });

        it('should handle validation methods with undefined values', () => {
            const undefinedKeyElement = createMockElement();
            const undefinedUriElement = createMockElement();
            undefinedKeyElement.value = undefined;
            undefinedUriElement.value = undefined;

            settings.whisperKeyInput = undefinedKeyElement;
            settings.whisperUriInput = undefinedUriElement;

            expect(() => settings.getValidationErrors()).toThrow('Cannot read properties of undefined');
            expect(() => settings.validateConfiguration()).toThrow('Cannot read properties of undefined');
        });

        it('should handle URL constructor exceptions gracefully', () => {
            mockApiKeyInput.value = generateMockApiKeyForValidation();
            mockUriInput.value = 'malformed-uri';

            global.URL.mockImplementation(() => {
                throw new Error('Invalid URL');
            });

            const errors = settings.getValidationErrors();
            const isValid = settings.validateConfiguration();

            expect(errors).toContain('Invalid URI format');
            expect(isValid).toBe(false);
        });

        it('should handle missing DOM elements gracefully', () => {
            settings.whisperKeyInput = null;
            settings.whisperUriInput = null;

            document.getElementById.mockReturnValue(null);

            expect(() => settings.sanitizeInputs()).not.toThrow();
            expect(() => settings.getValidationErrors()).not.toThrow();
            expect(() => settings.validateConfiguration()).not.toThrow();

            expect(settings.validateConfiguration()).toBe(false);

            const errors = settings.getValidationErrors();
            expect(errors).toEqual(
                expect.arrayContaining([
                    'API key is required',
                    'URI is required'
                ])
            );
        });
    });
});
