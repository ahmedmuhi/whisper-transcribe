/**
 * @fileoverview Authentication configuration and service boundary tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUTHENTICATION_ERROR_CODES,
    COGNITIVE_SERVICES_SCOPE,
    createAuthenticationConfig
} from '../js/authentication-config.js';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { AUTHENTICATION_STATES } from '../js/constants.js';
import { AuthenticationService } from '../js/authentication-service.js';

const FAKE_CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const FAKE_TENANT_ID = '22222222-2222-4222-8222-222222222222';

function validInput(overrides = {}) {
    return {
        clientId: FAKE_CLIENT_ID,
        tenantId: FAKE_TENANT_ID,
        origin: 'https://app.invalid',
        basePath: '/',
        ...overrides
    };
}

function fakeAccount(overrides = {}) {
    return {
        homeAccountId: 'fake-account-a',
        name: 'Fake User',
        username: 'fake.user@example.invalid',
        idTokenClaims: { fakePrivateClaim: 'never-expose-this-claim' },
        ...overrides
    };
}

function fakeAuthenticationResult(account = fakeAccount()) {
    return {
        account,
        accessToken: 'fake-redirect-result-token',
        idToken: 'fake-id-token',
        idTokenClaims: account.idTokenClaims
    };
}

function createFakeClient(overrides = {}) {
    return {
        initialize: vi.fn().mockResolvedValue(undefined),
        handleRedirectPromise: vi.fn().mockResolvedValue(null),
        getActiveAccount: vi.fn().mockReturnValue(null),
        getAllAccounts: vi.fn().mockReturnValue([]),
        setActiveAccount: vi.fn(),
        ssoSilent: vi.fn().mockResolvedValue(null),
        acquireTokenSilent: vi.fn(),
        loginRedirect: vi.fn().mockResolvedValue(undefined),
        acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
        logoutRedirect: vi.fn().mockResolvedValue(undefined),
        loginPopup: vi.fn(),
        acquireTokenPopup: vi.fn(),
        ...overrides
    };
}

function createService(client) {
    return new AuthenticationService(
        createAuthenticationConfig(validInput()),
        client
    );
}

describe('authentication configuration', () => {
    it('creates an immutable single-tenant session-cache configuration', () => {
        const config = createAuthenticationConfig(validInput());

        expect(config).toEqual({
            auth: {
                clientId: FAKE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${FAKE_TENANT_ID}`,
                redirectUri: 'https://app.invalid/auth/redirect.html'
            },
            cache: {
                cacheLocation: 'sessionStorage'
            }
        });
        expect(Object.isFrozen(config)).toBe(true);
        expect(Object.isFrozen(config.auth)).toBe(true);
        expect(Object.isFrozen(config.cache)).toBe(true);
        expect(COGNITIVE_SERVICES_SCOPE)
            .toBe('https://cognitiveservices.azure.com/.default');
    });

    it('derives the exact redirect bridge beneath the Pages base', () => {
        const config = createAuthenticationConfig(validInput({
            basePath: '/whisper-transcribe/'
        }));

        expect(config.auth.redirectUri)
            .toBe('https://app.invalid/whisper-transcribe/auth/redirect.html');
    });

    it.each([
        ['clientId', undefined],
        ['clientId', ''],
        ['clientId', 'not-an-identifier'],
        ['tenantId', undefined],
        ['tenantId', ''],
        ['tenantId', 'not-an-identifier'],
        ['tenantId', 'common'],
        ['tenantId', 'organizations'],
        ['tenantId', 'consumers']
    ])('fails closed for invalid %s configuration without echoing its value', (field, value) => {
        const input = validInput({ [field]: value });

        expect(() => createAuthenticationConfig(input)).toThrow(
            expect.objectContaining({
                code: AUTHENTICATION_ERROR_CODES.CONFIGURATION_INVALID,
                message: 'Microsoft Entra authentication is not configured.'
            })
        );

        try {
            createAuthenticationConfig(input);
        } catch (error) {
            if (value) expect(error.message).not.toContain(value);
            expect(error).not.toHaveProperty('configuration');
        }
    });
});

describe('AuthenticationService initialization', () => {
    let emitSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        eventBus.clear();
        emitSpy = vi.spyOn(eventBus, 'emit');
    });

    afterEach(() => {
        eventBus.clear();
    });

    it('initializes MSAL, handles redirect completion, and emits only safe state', async () => {
        const callOrder = [];
        const account = fakeAccount();
        const redirectResult = fakeAuthenticationResult(account);
        const client = createFakeClient({
            initialize: vi.fn(async () => callOrder.push('initialize')),
            handleRedirectPromise: vi.fn(async () => {
                callOrder.push('handle-redirect');
                return redirectResult;
            }),
            setActiveAccount: vi.fn(() => callOrder.push('set-active'))
        });
        const service = createService(client);

        await expect(service.initialize()).resolves.toBe(AUTHENTICATION_STATES.READY);

        expect(callOrder).toEqual(['initialize', 'handle-redirect', 'set-active']);
        expect(client.setActiveAccount).toHaveBeenCalledWith(account);
        expect(client.ssoSilent).not.toHaveBeenCalled();
        expect(service.getState()).toBe(AUTHENTICATION_STATES.READY);
        const emittedPayload = JSON.stringify(emitSpy.mock.calls);
        expect(emittedPayload).not.toContain(redirectResult.accessToken);
        expect(emittedPayload).not.toContain(redirectResult.idToken);
        expect(emittedPayload).not.toContain('fakePrivateClaim');
        expect(emitSpy).toHaveBeenLastCalledWith(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            { state: AUTHENTICATION_STATES.READY }
        );
    });

    it('restores the active account without attempting new-tab SSO', async () => {
        const account = fakeAccount();
        const client = createFakeClient({
            getActiveAccount: vi.fn().mockReturnValue(account)
        });
        const service = createService(client);

        await service.initialize();

        expect(client.setActiveAccount).toHaveBeenCalledWith(account);
        expect(client.ssoSilent).not.toHaveBeenCalled();
    });

    it('selects the cached account deterministically when no account is active', async () => {
        const accountB = fakeAccount({ homeAccountId: 'fake-account-b', username: 'b@example.invalid' });
        const accountA = fakeAccount({ homeAccountId: 'fake-account-a', username: 'a@example.invalid' });
        const client = createFakeClient({
            getAllAccounts: vi.fn().mockReturnValue([accountB, accountA])
        });
        const service = createService(client);

        await service.initialize();

        expect(client.setActiveAccount).toHaveBeenCalledWith(accountA);
        expect(client.ssoSilent).not.toHaveBeenCalled();
    });

    it('makes only one best-effort new-tab SSO attempt across repeated initialization', async () => {
        const account = fakeAccount();
        const client = createFakeClient({
            ssoSilent: vi.fn().mockResolvedValue(fakeAuthenticationResult(account))
        });
        const service = createService(client);

        await service.initialize();
        await service.initialize();

        expect(client.ssoSilent).toHaveBeenCalledTimes(1);
        expect(client.ssoSilent).toHaveBeenCalledWith({ scopes: [] });
        expect(client.setActiveAccount).toHaveBeenCalledWith(account);
        expect(service.getState()).toBe(AUTHENTICATION_STATES.READY);
    });

    it('categorizes an interaction-required SSO failure without exposing the error', async () => {
        const interactionError = Object.assign(new Error('fake raw interaction detail'), {
            name: 'InteractionRequiredAuthError',
            errorCode: 'login_required'
        });
        const client = createFakeClient({
            ssoSilent: vi.fn().mockRejectedValue(interactionError)
        });
        const service = createService(client);

        await expect(service.initialize())
            .resolves.toBe(AUTHENTICATION_STATES.INTERACTION_REQUIRED);

        expect(JSON.stringify(emitSpy.mock.calls)).not.toContain(interactionError.message);
        expect(emitSpy).toHaveBeenLastCalledWith(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            { state: AUTHENTICATION_STATES.INTERACTION_REQUIRED }
        );
    });

    it('categorizes a network failure without exposing the error', async () => {
        const networkError = Object.assign(new Error('fake network detail'), {
            errorCode: 'no_network_connectivity'
        });
        const client = createFakeClient({
            initialize: vi.fn().mockRejectedValue(networkError)
        });
        const service = createService(client);

        await expect(service.initialize()).resolves.toBe(AUTHENTICATION_STATES.NETWORK_ERROR);

        expect(JSON.stringify(emitSpy.mock.calls)).not.toContain(networkError.message);
    });

    it('fails closed into configuration error state when public identifiers are missing', async () => {
        const service = new AuthenticationService();

        await expect(service.initialize())
            .resolves.toBe(AUTHENTICATION_STATES.CONFIGURATION_ERROR);

        expect(service.getState()).toBe(AUTHENTICATION_STATES.CONFIGURATION_ERROR);
        expect(emitSpy).toHaveBeenLastCalledWith(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            { state: AUTHENTICATION_STATES.CONFIGURATION_ERROR }
        );
    });

    it('returns presentation-safe account fields without claims or identifiers', async () => {
        const account = fakeAccount();
        const client = createFakeClient({
            getActiveAccount: vi.fn().mockReturnValue(account)
        });
        const service = createService(client);
        await service.initialize();

        expect(service.getAccountPresentation()).toEqual({
            name: account.name,
            username: account.username
        });
        expect(service.getAccountPresentation()).not.toHaveProperty('homeAccountId');
        expect(service.getAccountPresentation()).not.toHaveProperty('idTokenClaims');
    });
});

describe('AuthenticationService token and redirect boundary', () => {
    let account;
    let client;
    let service;
    let emitSpy;

    beforeEach(async () => {
        vi.clearAllMocks();
        eventBus.clear();
        account = fakeAccount();
        client = createFakeClient({
            getActiveAccount: vi.fn().mockReturnValue(account),
            acquireTokenSilent: vi.fn().mockResolvedValue({
                accessToken: 'fake-current-access-token',
                account
            })
        });
        service = createService(client);
        emitSpy = vi.spyOn(eventBus, 'emit');
        await service.initialize();
        emitSpy.mockClear();
    });

    afterEach(() => {
        eventBus.clear();
    });

    it('checks silent readiness without returning or emitting a token', async () => {
        const outcome = await service.ensureTokenReady(COGNITIVE_SERVICES_SCOPE);

        expect(outcome).toBe(AUTHENTICATION_STATES.READY);
        expect(client.acquireTokenSilent).toHaveBeenCalledWith({
            scopes: [COGNITIVE_SERVICES_SCOPE],
            account
        });
        expect(JSON.stringify(outcome)).not.toContain('fake-current-access-token');
        expect(JSON.stringify(emitSpy.mock.calls)).not.toContain('fake-current-access-token');
    });

    it('returns request-local access tokens without retaining or emitting the result', async () => {
        const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem');

        await expect(service.getAccessToken(COGNITIVE_SERVICES_SCOPE))
            .resolves.toBe('fake-current-access-token');

        expect(JSON.stringify(service)).not.toContain('fake-current-access-token');
        expect(JSON.stringify(emitSpy.mock.calls)).not.toContain('fake-current-access-token');
        expect(storageSetSpy).not.toHaveBeenCalled();
        storageSetSpy.mockRestore();
    });

    it('returns an interaction-required readiness outcome without leaking raw errors', async () => {
        const rawError = Object.assign(new Error('fake token acquisition detail'), {
            name: 'InteractionRequiredAuthError',
            errorCode: 'consent_required'
        });
        client.acquireTokenSilent.mockRejectedValueOnce(rawError);

        await expect(service.ensureTokenReady(COGNITIVE_SERVICES_SCOPE))
            .resolves.toBe(AUTHENTICATION_STATES.INTERACTION_REQUIRED);

        expect(JSON.stringify(emitSpy.mock.calls)).not.toContain(rawError.message);
    });

    it('throws only a safe categorized error when request-time acquisition fails', async () => {
        const rawError = new Error('fake internal MSAL failure detail');
        client.acquireTokenSilent.mockRejectedValueOnce(rawError);

        await expect(service.getAccessToken(COGNITIVE_SERVICES_SCOPE)).rejects.toEqual(
            expect.objectContaining({
                code: AUTHENTICATION_STATES.AUTHENTICATION_ERROR,
                message: 'Microsoft Entra authentication could not provide a token.'
            })
        );
        expect(JSON.stringify(emitSpy.mock.calls)).not.toContain(rawError.message);
    });

    it('uses full-page redirect APIs for sign-in and interaction recovery', async () => {
        await service.signInRedirect(COGNITIVE_SERVICES_SCOPE);
        await service.acquireTokenRedirect(COGNITIVE_SERVICES_SCOPE);

        expect(client.loginRedirect).toHaveBeenCalledWith({
            scopes: [COGNITIVE_SERVICES_SCOPE]
        });
        expect(client.acquireTokenRedirect).toHaveBeenCalledWith({
            scopes: [COGNITIVE_SERVICES_SCOPE],
            account
        });
        expect(client.loginPopup).not.toHaveBeenCalled();
        expect(client.acquireTokenPopup).not.toHaveBeenCalled();
    });

    it('uses redirect logout with only the active account and transitions safely', async () => {
        await service.signOutRedirect();

        expect(client.logoutRedirect).toHaveBeenCalledWith({ account });
        expect(service.getState()).toBe(AUTHENTICATION_STATES.SIGNED_OUT);
        expect(emitSpy).toHaveBeenLastCalledWith(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            { state: AUTHENTICATION_STATES.SIGNED_OUT }
        );
    });
});
