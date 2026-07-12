/**
 * @fileoverview Tests for AzureAPIClient configuration validation.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { MESSAGES } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

const mockSettings = {
    getModelConfig: vi.fn()
};

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
        apiClient = new AzureAPIClient(mockSettings);
        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
    });

    it.each([
        {
            label: 'Whisper',
            config: {
                model: 'whisper',
                apiKey: 'whisper-api-key',
                uri: 'https://whisper.azure.com'
            }
        },
        {
            label: 'MAI-Transcribe',
            config: {
                model: 'mai-transcribe-1.5',
                apiKey: 'mai-transcribe-api-key',
                uri: 'https://mai-transcribe.azure.com'
            }
        }
    ])('accepts and returns the complete normalized $label configuration', ({ config }) => {
        mockSettings.getModelConfig.mockReturnValue(config);

        expect(apiClient.validateConfig()).toEqual(config);
        expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
            APP_EVENTS.API_CONFIG_MISSING,
            expect.anything()
        );
    });

    it.each([
        {
            label: 'empty API key',
            config: { model: 'whisper', apiKey: '', uri: 'https://test-api.azure.com' },
            message: MESSAGES.API_KEY_REQUIRED,
            missing: 'apiKey'
        },
        {
            label: 'null API key',
            config: { model: 'whisper', apiKey: null, uri: 'https://test-api.azure.com' },
            message: MESSAGES.API_KEY_REQUIRED,
            missing: 'apiKey'
        },
        {
            label: 'unsafe API-key character',
            config: { model: 'mai-transcribe-1.5', apiKey: 'speech\u2014key', uri: 'https://test-api.azure.com' },
            message: MESSAGES.INVALID_API_KEY_CHARACTERS,
            missing: 'validApiKey'
        },
        {
            label: 'empty URI',
            config: { model: 'whisper', apiKey: 'test-api-key', uri: '' },
            message: MESSAGES.URI_REQUIRED,
            missing: 'uri'
        },
        {
            label: 'URI without protocol',
            config: { model: 'whisper', apiKey: 'test-api-key', uri: 'azure.com' },
            message: MESSAGES.INVALID_URI_FORMAT,
            missing: 'validUri'
        },
        {
            label: 'HTTP URI',
            config: { model: 'whisper', apiKey: 'test-api-key', uri: 'http://insecure.azure.com' },
            message: MESSAGES.URI_MUST_BE_HTTPS,
            missing: 'httpsUri'
        }
    ])('rejects $label with its exact error and event payload', ({ config, message, missing }) => {
        mockSettings.getModelConfig.mockReturnValue(config);

        expect(() => apiClient.validateConfig()).toThrow(message);
        expect(eventBusEmitSpy).toHaveBeenCalledWith(APP_EVENTS.API_CONFIG_MISSING, {
            missing,
            model: config.model
        });
    });

    it('sanitizes whitespace and invisible artifacts in the API key and URI', () => {
        mockSettings.getModelConfig.mockReturnValue({
            model: 'whisper',
            apiKey: ' test\u200B-api\uFEFF-key \n',
            uri: ' https://test-api.azure.com /transcribe\n'
        });

        expect(apiClient.validateConfig()).toEqual({
            model: 'whisper',
            apiKey: 'test-api-key',
            uri: 'https://test-api.azure.com/transcribe'
        });
        expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
            APP_EVENTS.API_CONFIG_MISSING,
            expect.anything()
        );
    });
});
