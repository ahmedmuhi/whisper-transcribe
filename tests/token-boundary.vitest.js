/**
 * @fileoverview Security contract tests for request-local bearer ownership.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COGNITIVE_SERVICES_SCOPE } from '../js/authentication-config.js';
import { eventBus } from '../js/event-bus.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';

const FAKE_TOKEN = 'fake-deterministic-bearer-token';

const loggerSpies = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};

vi.mock('../js/logger.js', () => ({
    logger: {
        ...loggerSpies,
        child: vi.fn(() => loggerSpies)
    }
}));

let AzureAPIClient;
let createTokenProvider;

beforeAll(async () => {
    ({ AzureAPIClient } = await import('../js/api-client.js'));
    ({ createTokenProvider } = await import('../js/token-provider.js'));
});

describe('request-local bearer boundary', () => {
    let eventBusEmitSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        applyDomSpies();
        globalThis.fetch = vi.fn();
        eventBusEmitSpy = vi.spyOn(eventBus, 'emit');
    });

    it('exposes only a scoped token getter and forwards without retaining a token', async () => {
        const authenticationService = {
            getAccessToken: vi.fn().mockResolvedValue(FAKE_TOKEN)
        };

        const tokenProvider = createTokenProvider(authenticationService);

        expect(Object.keys(tokenProvider)).toEqual(['getToken']);
        await expect(tokenProvider.getToken(COGNITIVE_SERVICES_SCOPE)).resolves.toBe(FAKE_TOKEN);
        expect(authenticationService.getAccessToken).toHaveBeenCalledWith(COGNITIVE_SERVICES_SCOPE);
        expect(JSON.stringify(tokenProvider)).not.toContain(FAKE_TOKEN);
    });

    it('keeps adapters credential-blind and adds one bearer header immediately before fetch', async () => {
        const callOrder = [];
        const settings = {
            getModelConfig: vi.fn(() => ({
                model: 'fake-model',
                uri: 'https://target.invalid/transcribe',
                ignoredLegacyValue: 'fake-value-that-must-not-cross'
            }))
        };
        const adapter = Object.freeze({
            id: 'fake-model',
            label: 'Fake Model',
            scope: COGNITIVE_SERVICES_SCOPE,
            storageKeys: Object.freeze({ uri: 'fake_uri' }),
            buildRequest: vi.fn(async (...args) => {
                callOrder.push('build');
                expect(args[1]).toEqual({
                    model: 'fake-model',
                    uri: 'https://target.invalid/transcribe'
                });
                return {
                    body: 'fake-body',
                    statusMessage: 'Sending fake audio...'
                };
            }),
            parseResponse: vi.fn(() => 'fake transcript')
        });
        const tokenProvider = Object.freeze({
            getToken: vi.fn(async (scope) => {
                callOrder.push('token');
                expect(scope).toBe(COGNITIVE_SERVICES_SCOPE);
                return FAKE_TOKEN;
            })
        });
        const client = new AzureAPIClient(settings, tokenProvider, new Map([[adapter.id, adapter]]));
        globalThis.fetch.mockImplementation(async (_uri, options) => {
            callOrder.push('fetch');
            expect(options.headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
            expect(options.headers).not.toHaveProperty('Content-Type');
            return {
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('application/json') },
                json: vi.fn().mockResolvedValue({ text: 'fake transcript' })
            };
        });

        await expect(client.transcribe(new Blob(['fake audio']))).resolves.toBe('fake transcript');

        expect(callOrder).toEqual(['build', 'token', 'fetch']);
        expect(tokenProvider.getToken).toHaveBeenCalledTimes(1);
        expect(adapter.buildRequest.mock.calls.flat()).not.toContain(FAKE_TOKEN);
        expect(JSON.stringify(eventBusEmitSpy.mock.calls)).not.toContain(FAKE_TOKEN);
        expect(JSON.stringify(loggerSpies)).not.toContain(FAKE_TOKEN);
        expect(JSON.stringify(client)).not.toContain(FAKE_TOKEN);
    });

    it('reuses one request-local token across bounded transient retries', async () => {
        const settings = {
            getModelConfig: vi.fn(() => ({
                model: 'fake-model',
                uri: 'https://target.invalid/transcribe'
            }))
        };
        const adapter = Object.freeze({
            id: 'fake-model',
            label: 'Fake Model',
            scope: COGNITIVE_SERVICES_SCOPE,
            storageKeys: Object.freeze({ uri: 'fake_uri' }),
            buildRequest: vi.fn(async () => ({
                body: 'fake-body',
                statusMessage: 'Sending fake audio...'
            })),
            parseResponse: vi.fn(() => 'fake transcript')
        });
        const tokenProvider = Object.freeze({
            getToken: vi.fn().mockResolvedValue(FAKE_TOKEN)
        });
        const client = new AzureAPIClient(settings, tokenProvider, new Map([[adapter.id, adapter]]));
        client._sleep = vi.fn().mockResolvedValue();
        globalThis.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: { get: vi.fn().mockReturnValue(null) },
                text: vi.fn().mockResolvedValue('fake throttled response')
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('application/json') },
                json: vi.fn().mockResolvedValue({ text: 'fake transcript' })
            });

        await expect(client.transcribe(new Blob(['fake audio']))).resolves.toBe('fake transcript');

        expect(tokenProvider.getToken).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        for (const [, options] of globalThis.fetch.mock.calls) {
            expect(options.headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
        }
    });
});
