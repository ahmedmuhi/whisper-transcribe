/**
 * @fileoverview Built-browser coverage for authentication, the settings surface,
 * and recovery states.
 */

import { expect, test } from '@playwright/test';

const targetUri = 'https://target.invalid/transcribe';

async function openScenario(page, { scenario = 'ready', configured = true } = {}) {
    const pageErrors = [];
    const consoleErrors = [];
    const externalRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== 'http://127.0.0.1:4173' && !url.hostname.endsWith('googleapis.com')) {
            externalRequests.push(request.url());
        }
    });
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
    }));
    await page.addInitScript(({ authScenario, endpoint, hasConfiguration }) => {
        sessionStorage.setItem('browser_test_auth_scenario', authScenario);
        localStorage.setItem('transcription_model', 'whisper');
        if (hasConfiguration) localStorage.setItem('whisper_uri', endpoint);
        else localStorage.removeItem('whisper_uri');
        globalThis.__browserTestMicCalls = 0;
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (...args) => {
            globalThis.__browserTestMicCalls += 1;
            return originalGetUserMedia(...args);
        };
    }, { authScenario: scenario, endpoint: targetUri, hasConfiguration: configured });
    await page.goto('/');
    return { pageErrors, consoleErrors, externalRequests };
}

async function openQuickSettings(page) {
    const gear = page.locator('#quick-settings-button');
    await expect(gear).toBeVisible();
    await gear.click();
    await expect(page.locator('#quick-settings')).toBeVisible();
    return gear;
}

async function openSettingsModal(page) {
    await openQuickSettings(page);
    await page.locator('#open-all-settings').click();
    await expect(page.locator('#settings-modal')).toBeVisible();
}

test('desktop settings surface carries identity, categories, and instant apply', async ({ page }) => {
    const observations = await openScenario(page);
    const badge = page.locator('#user-badge');
    await expect(badge).toHaveText('BF');
    await expect(badge).not.toContainText('Browser Fixture');

    const gear = await openQuickSettings(page);
    await expect(page.locator('#model-select option')).toHaveText([
        'Azure Whisper',
        'MAI-Transcribe 1.5'
    ]);
    await expect(page.locator('input[name="theme-mode-quick"]')).toHaveCount(3);

    // Quick settings applies at once: no Save control exists anywhere.
    await page.locator('#model-select').selectOption('mai-transcribe-1.5');
    expect(await page.evaluate(() => localStorage.getItem('transcription_model')))
        .toBe('mai-transcribe-1.5');
    await page.locator('#model-select').selectOption('whisper');

    await page.locator('#open-all-settings').click();
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('#settings-search')).toBeFocused();
    await expect(page.locator('#settings-heading')).toHaveText('Model');
    await expect(page.locator('#settings-model-select')).toBeVisible();
    await expect(page.locator('#settings-account-name')).toHaveText('Browser Fixture');
    await expect(page.locator('#settings-sign-out')).toBeVisible();
    await expect(page.locator('#save-settings')).toHaveCount(0);
    // Verbatim belongs to MAI-Transcribe 1.5 only.
    await expect(page.locator('#verbatim-setting')).toBeHidden();

    await page.locator('[data-settings-category="microphone"]').click();
    await expect(page.locator('#settings-heading')).toHaveText('Microphone');
    await expect(page.locator('#input-device')).toBeVisible();
    const enumeratedMicrophone = page.locator('#input-device option:not([value=""])').first();
    await expect(enumeratedMicrophone).toBeAttached();
    await expect(enumeratedMicrophone).not.toHaveText('');
    await expect(page.locator('#noise-toggle')).toBeVisible();

    await page.locator('[data-settings-category="appearance"]').click();
    await expect(page.locator('input[name="theme-mode"]')).toHaveCount(3);

    await page.locator('[data-settings-category="connection"]').click();
    await expect(page.locator('#whisper-uri')).toBeVisible();
    await expect(page.locator('#mai-transcribe-uri')).toBeVisible();
    await expect(page.locator('#whisper-uri-badge')).toHaveText('✓ Valid HTTPS');

    await page.locator('#settings-search').fill('noise');
    await expect(page.locator('#settings-heading')).toHaveText('Results for "noise"');
    await expect(page.locator('[data-settings-row="noise"]')).toBeVisible();
    await expect(page.locator('[data-settings-row="model"]')).toBeHidden();
    await page.locator('#settings-search').fill('nothing matches this');
    await expect(page.locator('#settings-no-results'))
        .toHaveText('No settings match "nothing matches this"');

    await page.locator('#settings-close').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    await expect(gear).toBeFocused();
    expect(await page.evaluate(() => globalThis.__browserTestMicCalls)).toBe(0);
    expect(observations.externalRequests).toEqual([]);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('quick settings closes on Escape and on an outside click', async ({ page }) => {
    const observations = await openScenario(page);
    const gear = await openQuickSettings(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#quick-settings')).toBeHidden();
    await expect(gear).toBeFocused();

    await gear.click();
    await expect(page.locator('#quick-settings')).toBeVisible();
    await page.locator('body > header').click();
    await expect(page.locator('#quick-settings')).toBeHidden();
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('checking becomes signed out and Continue is the only route to ready', async ({ page }) => {
    const observations = await openScenario(page, { scenario: 'signed-out' });
    await expect(page.locator('#auth-context-title')).toHaveText('Checking sign-in…');
    await expect(page.locator('#auth-context-title')).toHaveText('Microsoft sign in required');
    await expect(page.locator('#auth-context-body')).toHaveText('Sign in before recording.');
    await expect(page.locator('#auth-context-note')).toContainText('cannot grant Azure access');
    await expect(page.locator('#primary-action')).toBeHidden();
    await expect(page.locator('#auth-primary-action')).toHaveText('Continue with Microsoft');
    await expect(page.locator('#auth-primary-action .microsoft-mark')).toBeVisible();
    await expect(page.locator('#auth-primary-action .microsoft-mark'))
        .toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => globalThis.__browserTestMicCalls)).toBe(0);

    await page.locator('#auth-primary-action').click();

    await expect(page.locator('#primary-action')).toHaveText('Start recording');
    await expect(page.locator('#primary-action')).toBeEnabled();
    await expect(page.locator('#user-badge')).toBeVisible();
    expect(await page.evaluate(() => globalThis.__browserTestMicCalls)).toBe(0);
    expect(observations.externalRequests).toEqual([]);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('interaction-required remains explicit and inert', async ({ page }) => {
    const observations = await openScenario(page, { scenario: 'interaction-required' });
    await expect(page.locator('#auth-primary-action')).toHaveText('Continue with Microsoft');
    await expect(page.locator('#auth-context')).not.toContainText('Retry silently');
    expect(await page.evaluate(() => globalThis.__browserTestMicCalls)).toBe(0);
    expect(observations.externalRequests).toEqual([]);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('invalid Target URI opens Settings directly without recording', async ({ page }) => {
    const observations = await openScenario(page, { configured: false });
    await expect(page.locator('#auth-primary-action')).toHaveText('Open settings');
    await expect(page.locator('#auth-primary-action .microsoft-mark')).toBeHidden();
    await page.locator('#auth-primary-action').click();
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('#settings-heading')).toHaveText('Connection');
    await expect(page.locator('#whisper-uri')).toBeVisible();
    await expect(page.locator('#whisper-uri-badge')).toHaveText('Required for the active model');
    expect(await page.evaluate(() => globalThis.__browserTestMicCalls)).toBe(0);
    expect(observations.externalRequests).toEqual([]);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('401 recovery downloads without navigation, then requires explicit Continue', async ({ page }) => {
    await page.route(targetUri, (route) => route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'Unauthorized' } })
    }));
    const observations = await openScenario(page);
    const primary = page.locator('#primary-action');
    await primary.click();
    await page.waitForTimeout(1_200);
    await primary.click();

    await expect(page.locator('#auth-primary-action')).toHaveText('Download recording');
    await expect(page.locator('#auth-secondary-action')).toHaveText('Discard recording and sign in');
    const download = page.waitForEvent('download');
    await page.locator('#auth-primary-action').click();
    await download;

    await expect(page.locator('#auth-primary-action')).toHaveText('Continue with Microsoft');
    await expect(page.locator('#auth-context')).toBeVisible();
    await page.waitForTimeout(50);
    await expect(page.locator('#auth-context')).toBeVisible();

    await page.locator('#auth-primary-action').click();
    await expect(page.locator('#primary-action')).toHaveText('Start recording');

    await page.reload();
    await expect(primary).toBeEnabled();
    await primary.click();
    await page.waitForTimeout(1_200);
    await primary.click();
    await expect(page.locator('#auth-secondary-action')).toHaveText('Discard recording and sign in');
    await page.locator('#auth-secondary-action').click();
    await expect(page.locator('#discard-dialog')).toBeVisible();
    await expect(page.locator('#discard-dialog-title')).toHaveText('Discard Unsent Recording?');
    await page.locator('#discard-confirm').click();
    await expect(primary).toHaveText('Start recording');

    expect(observations.externalRequests).toEqual([targetUri, targetUri]);
    expect(observations.pageErrors).toEqual([]);
});

test('403 guidance retains audio and never changes Azure access', async ({ page }) => {
    await page.route(targetUri, (route) => route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'Forbidden' } })
    }));
    const observations = await openScenario(page);
    const primary = page.locator('#primary-action');
    await primary.click();
    await page.waitForTimeout(1_200);
    await primary.click();

    await expect(page.locator('#auth-context-title')).toContainText('Azure access');
    await expect(page.locator('#auth-primary-action')).toHaveText('View Azure setup');
    await expect(page.locator('#auth-context')).not.toContainText('Continue with Microsoft');
    expect(observations.externalRequests).toEqual([targetUri]);
    expect(observations.pageErrors).toEqual([]);
});

test('390 px settings fit the viewport and Escape returns focus to the gear', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const observations = await openScenario(page);
    await openSettingsModal(page);

    await expect(page.locator('.settings-nav')).toBeVisible();
    await page.locator('[data-settings-category="connection"]').click();
    await expect(page.locator('#whisper-uri')).toBeVisible();
    expect(await page.evaluate(() => (
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal')).toBeHidden();
    await expect(page.locator('#quick-settings-button')).toBeFocused();
    expect(observations.externalRequests).toEqual([]);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});
