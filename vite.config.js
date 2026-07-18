import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => ({
    base: mode === 'pages' ? '/whisper-transcribe/' : '/',
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
