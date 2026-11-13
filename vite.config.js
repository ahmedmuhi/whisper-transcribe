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

export default defineConfig(({ mode }) => ({
    base: mode === 'pages' ? '/whisper-transcribe/' : '/',
    resolve: {
        alias: authenticationAliasForMode(mode)
    },
    build: {
        // AudioWorklet modules must stay same-origin files: a data: URL is refused
        // by a `script-src 'self'` Content Security Policy.
        assetsInlineLimit: (filePath) => (filePath.endsWith('.worklet.js') ? false : undefined),
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
