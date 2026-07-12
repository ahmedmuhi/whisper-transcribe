import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(repoRoot, 'tests/browser-live/fixtures/spoken-phrase.wav');

export default defineConfig({
    testDir: 'tests/browser-live',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 300_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        permissions: ['microphone'],
        serviceWorkers: 'block',
        trace: 'off',
        screenshot: 'off',
        video: 'off'
    },
    webServer: {
        command: 'node tests/browser/static-server.mjs',
        url: 'http://[::1]:4175/',
        reuseExistingServer: false,
        timeout: 15_000
    },
    projects: [{
        name: 'chromium-live',
        use: {
            channel: 'chromium',
            launchOptions: {
                args: [
                    '--use-fake-device-for-media-stream',
                    `--use-file-for-fake-audio-capture=${fixture}`
                ]
            }
        }
    }]
});
