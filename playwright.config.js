import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(repoRoot, 'tests/browser/.artifacts/fake-microphone.wav');

export default defineConfig({
    testDir: 'tests/browser',
    globalSetup: './tests/browser/global-setup.mjs',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI
        ? [['line'], ['html', { open: 'never' }]]
        : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        permissions: ['microphone'],
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    webServer: {
        command: 'npm run build && node tests/browser/static-server.mjs',
        url: 'http://[::1]:4175/',
        reuseExistingServer: false,
        timeout: 15_000
    },
    projects: [{
        name: 'chromium',
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
