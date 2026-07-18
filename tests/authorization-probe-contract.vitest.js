/**
 * @fileoverview Regression coverage for service-specific pre-role denial semantics.
 */

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { createAuthorizationDenialClassifier } from './browser-live/authorization-probe-contract.js';

const expectedTenantId = '00000000-0000-0000-0000-000000000001';
const expectedClientId = '00000000-0000-0000-0000-000000000002';
const nowEpochSeconds = 1_800_000_000;

describe('authorization probe denial classification', () => {
    it.each([401, 403])(
        'accepts HTTP %s only with a current token for the protected workload and audience',
        status => {
            const accessToken = createUnsignedTestToken();
            const classifyAuthorizationDenial = createAuthorizationDenialClassifier({
                accessToken,
                expectedClientId,
                expectedTenantId,
                nowEpochSeconds
            });

            expect(classifyAuthorizationDenial(status)).toBe(status);
        }
    );

    it('accepts the v2 azp client claim when appid is absent', () => {
        const accessToken = createUnsignedTestToken({
            appid: undefined,
            azp: expectedClientId
        });
        const classifyAuthorizationDenial = createAuthorizationDenialClassifier({
            accessToken,
            expectedClientId,
            expectedTenantId,
            nowEpochSeconds
        });

        expect(classifyAuthorizationDenial(401)).toBe(401);
    });

    it.each([
        ['audience', { aud: 'https://management.azure.com' }],
        ['tenant', { tid: '00000000-0000-0000-0000-000000000099' }],
        ['client', { appid: '00000000-0000-0000-0000-000000000099' }],
        ['expiry', { exp: nowEpochSeconds }],
        ['not-before time', { nbf: nowEpochSeconds + 61 }]
    ])('rejects an HTTP 401 when the token %s does not match', (_label, overrides) => {
        const accessToken = createUnsignedTestToken(overrides);

        expect(() => createAuthorizationDenialClassifier({
            accessToken,
            expectedClientId,
            expectedTenantId,
            nowEpochSeconds
        })).toThrow('Protected workload token does not match the authorization-probe contract.');
    });

    it('rejects a non-object token payload with the same non-sensitive contract error', () => {
        const accessToken = createUnsignedTestTokenFromPayload(null);

        expect(() => createAuthorizationDenialClassifier({
            accessToken,
            expectedClientId,
            expectedTenantId,
            nowEpochSeconds
        })).toThrow('Protected workload token does not match the authorization-probe contract.');
    });

    it.each([200, 400, 404, 429, 500])(
        'rejects HTTP %s even when the protected workload token is valid',
        status => {
            const accessToken = createUnsignedTestToken();
            const classifyAuthorizationDenial = createAuthorizationDenialClassifier({
                accessToken,
                expectedClientId,
                expectedTenantId,
                nowEpochSeconds
            });

            expect(() => classifyAuthorizationDenial(status))
                .toThrow('Authorization probe did not receive an expected denial status.');
        }
    );
});

function createUnsignedTestToken(overrides = {}) {
    return createUnsignedTestTokenFromPayload({
        appid: expectedClientId,
        aud: 'https://cognitiveservices.azure.com',
        exp: nowEpochSeconds + 300,
        nbf: nowEpochSeconds - 30,
        tid: expectedTenantId,
        ...overrides
    });
}

function createUnsignedTestTokenFromPayload(claims) {
    const header = encodeSegment({ alg: 'RS256', typ: 'JWT' });
    const payload = encodeSegment(claims);
    return `${header}.${payload}.test-signature`;
}

function encodeSegment(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
