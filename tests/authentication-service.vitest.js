/**
 * @fileoverview Authentication configuration and service boundary tests.
 */

import { describe, expect, it } from 'vitest';
import {
    AUTHENTICATION_ERROR_CODES,
    COGNITIVE_SERVICES_SCOPE,
    createAuthenticationConfig
} from '../js/authentication-config.js';

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
