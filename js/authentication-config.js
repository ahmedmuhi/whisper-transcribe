/**
 * @fileoverview Fail-closed public configuration for Microsoft Entra authentication.
 */

const IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NON_TENANT_AUTHORITIES = new Set(['common', 'organizations', 'consumers']);
import { MESSAGES } from './constants.js';

export const AUTHENTICATION_ERROR_CODES = Object.freeze({
    CONFIGURATION_INVALID: 'authentication-configuration-invalid'
});

export const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

class AuthenticationConfigurationError extends Error {
    constructor() {
        super(MESSAGES.AUTHENTICATION_NOT_CONFIGURED);
        this.name = 'AuthenticationConfigurationError';
        this.code = AUTHENTICATION_ERROR_CODES.CONFIGURATION_INVALID;
    }
}

function requireIdentifier(value, { tenant = false } = {}) {
    const identifier = typeof value === 'string' ? value.trim() : '';
    if (
        !IDENTIFIER_PATTERN.test(identifier) ||
        (tenant && NON_TENANT_AUTHORITIES.has(identifier.toLowerCase()))
    ) {
        throw new AuthenticationConfigurationError();
    }
    return identifier;
}

function deriveRedirectUri(origin, basePath) {
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    return new URL(`${normalizedBase}auth/redirect.html`, `${origin}/`).href;
}

/**
 * Build the MSAL configuration from public Vite values.
 *
 * Optional arguments exist only to keep validation deterministic in unit tests;
 * normal application code uses Vite's public environment and current location.
 */
export function createAuthenticationConfig({
    clientId = import.meta.env.VITE_ENTRA_CLIENT_ID,
    tenantId = import.meta.env.VITE_ENTRA_TENANT_ID,
    origin = window.location.origin,
    basePath = import.meta.env.BASE_URL
} = {}) {
    const validatedClientId = requireIdentifier(clientId);
    const validatedTenantId = requireIdentifier(tenantId, { tenant: true });

    return Object.freeze({
        auth: Object.freeze({
            clientId: validatedClientId,
            authority: `https://login.microsoftonline.com/${validatedTenantId}`,
            redirectUri: deriveRedirectUri(origin, basePath)
        }),
        cache: Object.freeze({
            cacheLocation: 'localStorage'
        })
    });
}
