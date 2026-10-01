import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAuthenticationConfig } from '../js/authentication-config.js';

const indexSource = readFileSync('index.html', 'utf8');
const redirectSource = readFileSync('auth/redirect.html', 'utf8');

const CSP_META = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/u;
const MICROSOFT_LOGIN = 'https://login.microsoftonline.com';

/**
 * Parses the CSP meta tag of an HTML source into a map from directive name to
 * its list of source tokens.
 */
function parsePolicy(source) {
    const content = source.match(CSP_META)?.[1] ?? '';
    const directives = {};
    for (const entry of content.split(';')) {
        const [name, ...tokens] = entry.trim().split(/\s+/u).filter(Boolean);
        if (name) {
            directives[name] = tokens;
        }
    }
    return directives;
}

const indexPolicy = parsePolicy(indexSource);
const redirectPolicy = parsePolicy(redirectSource);

describe('Content-Security-Policy meta tags', () => {
    it('places the policy in index.html before any script or link', () => {
        const metaIndex = indexSource.search(CSP_META);

        expect(metaIndex).toBeGreaterThan(-1);
        expect(metaIndex).toBeLessThan(indexSource.indexOf('<script'));
        expect(metaIndex).toBeLessThan(indexSource.indexOf('<link'));
    });

    it('ships exactly the documented index.html directives', () => {
        expect(indexPolicy).toEqual({
            'default-src': ["'none'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", 'https://fonts.googleapis.com'],
            'style-src-attr': ["'unsafe-inline'"],
            'font-src': ['https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:'],
            'media-src': ['blob:'],
            'worker-src': ["'self'"],
            'connect-src': [
                "'self'",
                MICROSOFT_LOGIN,
                'https://*.cognitiveservices.azure.com',
                'https://*.openai.azure.com',
                'https://*.services.ai.azure.com',
                'https://*.api.cognitive.microsoft.com'
            ],
            'frame-src': ["'self'", MICROSOFT_LOGIN],
            'base-uri': ["'none'"],
            'form-action': ["'none'"]
        });
    });

    it('keeps index.html free of inline scripts so script-src can stay self-only', () => {
        const scriptTags = indexSource.match(/<script\b[^>]*>/gu) ?? [];

        expect(scriptTags.length).toBeGreaterThan(0);
        for (const tag of scriptTags) {
            expect(tag).toMatch(/\ssrc="/u);
        }
    });

    it('never widens script or style sources unsafely', () => {
        for (const policy of [indexPolicy, redirectPolicy]) {
            const text = JSON.stringify(policy);

            expect(text).not.toContain("'unsafe-eval'");
            expect(text).not.toContain('sha256-');
            expect(policy['script-src']).not.toContain("'unsafe-inline'");
            expect(policy['script-src']).not.toContain('data:');
            expect(policy['style-src'] ?? []).not.toContain("'unsafe-inline'");
            for (const tokens of Object.values(policy)) {
                expect(tokens).not.toContain('*');
                expect(tokens).not.toContain('http:');
            }
        }
    });

    it('omits directives that browsers ignore in a meta tag', () => {
        for (const policy of [indexPolicy, redirectPolicy]) {
            for (const ignored of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']) {
                expect(policy).not.toHaveProperty(ignored);
            }
        }
    });

    it('ships exactly the documented callback directives', () => {
        expect(redirectPolicy).toEqual({
            'default-src': ["'none'"],
            'script-src': ["'self'"],
            'connect-src': ["'self'"],
            'base-uri': ["'none'"],
            'form-action': ["'none'"]
        });
    });

    it('allows the Microsoft sign-in origin that the MSAL authority uses', () => {
        const config = createAuthenticationConfig({
            clientId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            origin: 'https://app.invalid',
            basePath: '/'
        });

        expect(config.auth.authority.startsWith(`${MICROSOFT_LOGIN}/`)).toBe(true);
        expect(indexPolicy['connect-src']).toContain(MICROSOFT_LOGIN);
        expect(indexPolicy['frame-src']).toContain(MICROSOFT_LOGIN);
    });
});
