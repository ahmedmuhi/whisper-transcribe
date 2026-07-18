import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const browserTestAuthenticationPath = resolve(
    projectRoot,
    'tests/browser/fakes/authentication-factory.js'
);

export default defineConfig(({ mode }) => ({
    base: mode === 'pages' ? '/whisper-transcribe/' : '/',
    resolve: {
        alias: mode === 'browser-test'
            ? [{ find: /^\.\/authentication-service\.js$/, replacement: browserTestAuthenticationPath }]
            : []
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
