/**
 * @fileoverview Fail-closed classification for the pre-role live authorization probe.
 */

import { Buffer } from 'node:buffer';

const cognitiveServicesAudience = 'https://cognitiveservices.azure.com';
const expectedDenialStatuses = new Set([401, 403]);
const tokenContractError =
    'Protected workload token does not match the authorization-probe contract.';

export function createAuthorizationDenialClassifier({
    accessToken,
    expectedClientId,
    expectedTenantId,
    nowEpochSeconds = Math.floor(Date.now() / 1000)
}) {
    // Azure Login and Azure CLI own token issuance, and the target service verifies
    // the signature. This local check binds denial evidence to the protected claims;
    // it is intentionally not a substitute for cryptographic JWT verification.
    const claims = readClaims(accessToken);
    const clientClaims = [claims.appid, claims.azp]
        .filter(value => typeof value === 'string' && value.length > 0);
    const notBeforeIsValid = claims.nbf === undefined || (
        Number.isFinite(claims.nbf) && claims.nbf <= nowEpochSeconds + 60
    );
    const tokenMatches = claims.aud === cognitiveServicesAudience &&
        claims.tid === expectedTenantId &&
        clientClaims.length > 0 &&
        clientClaims.every(value => value === expectedClientId) &&
        Number.isFinite(claims.exp) &&
        claims.exp > nowEpochSeconds &&
        notBeforeIsValid;

    if (!tokenMatches) throw new Error(tokenContractError);

    return status => {
        if (!expectedDenialStatuses.has(status)) {
            throw new Error('Authorization probe did not receive an expected denial status.');
        }
        return status;
    };
}

function readClaims(accessToken) {
    if (typeof accessToken !== 'string') throw new Error(tokenContractError);
    const segments = accessToken.split('.');
    if (segments.length !== 3 || segments.some(segment => !segment)) {
        throw new Error(tokenContractError);
    }

    try {
        const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
        if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
            throw new Error(tokenContractError);
        }
        return claims;
    } catch {
        throw new Error(tokenContractError);
    }
}
