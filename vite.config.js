import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const browserTestAuthenticationPath = resolve(
    projectRoot,
    'tests/browser/fakes/authentication-factory.js'
);
const liveContractAuthenticationPath = resolve(
    projectRoot,
    'tests/browser-live/oidc-authentication-factory.js'
);

const browserTestConnectSources = 'https://127.0.0.1:4174 https://target.invalid';

export default defineConfig(({ mode }) => ({
    base: mode === 'pages' ? '/whisper-transcribe/' : '/',
    plugins: [browserTestContentSecurityPolicy(mode)],
    resolve: {
        alias: authenticationAliasForMode(mode)
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(projectRoot, 'index.html'),
                redirect: resolve(projectRoot, 'auth/redirect.html')
            },
            output: {
                manualChunks(moduleId) {
                    const normalizedId = moduleId.replaceAll('\\', '/');
                    if (
                        normalizedId.endsWith('/js/authentication-service.js') ||
                        normalizedId.includes('/node_modules/@azure/msal-')
                    ) {
                        return 'authentication';
                    }
                    return undefined;
                }
            }
        }
    }
}));

function authenticationAliasForMode(mode) {
    const replacement = mode === 'browser-test'
        ? browserTestAuthenticationPath
        : mode === 'live-contract'
            ? liveContractAuthenticationPath
            : null;
    return replacement
        ? [{ find: /^\.\/authentication-service\.js$/, replacement }]
        : [];
}

/**
 * The deterministic Chromium suite sends transcription requests to a local
 * HTTPS stub and to a reserved .invalid host. Those destinations are added to
 * connect-src only in browser-test mode and never reach a production bundle.
 */
function browserTestContentSecurityPolicy(mode) {
    return {
        name: 'browser-test-content-security-policy',
        transformIndexHtml(html) {
            return mode === 'browser-test'
                ? html.replace("connect-src 'self'", `connect-src 'self' ${browserTestConnectSources}`)
                : html;
        }
    };
}
