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
            }
        }
    }
}));
