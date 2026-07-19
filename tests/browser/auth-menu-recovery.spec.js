/**
 * @fileoverview Built-browser coverage for authentication, User-menu, and recovery states.
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

async function openMenu(page) {
    const launcher = page.locator('#user-menu-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator('#user-menu-surface')).toBeVisible();
    return launcher;
}

test('desktop User menu renders dynamic identity and adjacent nested details', async ({ page }) => {
    const observations = await openScenario(page);
    const launcher = page.locator('#user-menu-launcher');
    await expect(launcher).toHaveText('BF');
    await expect(launcher).not.toContainText('Browser Fixture');

    await openMenu(page);
    await expect(page.locator('#user-menu-name')).toHaveText('Browser Fixture');
    await expect(page.locator('#user-menu-username')).toHaveText('browser-fixture@example.invalid');
    await expect(page.locator('#user-menu-root')).not.toContainText(
        ['Signed', 'in', 'with', 'Microsoft'].join(' ')
    );
    await expect(page.locator('#user-menu-root')).not.toContainText(
        ['Azure', 'ready'].join(' ')
    );

    const rootRows = page.locator('#user-menu-root .user-menu-row');
    await expect(rootRows).toHaveCount(5);
    await expect(rootRows.nth(0)).toContainText('Model');
    await expect(rootRows.nth(1)).toContainText('Microphone');
    await expect(rootRows.nth(2)).toContainText('Settings');
    await expect(rootRows.nth(3)).toContainText('Help & Azure setup');
    await expect(rootRows.nth(4)).toHaveText('Log out');

    await page.locator('#user-menu-model').click();
    await expect(page.locator('#user-menu-root')).toBeVisible();
    await expect(page.locator('#user-menu-detail')).toBeVisible();
    await expect(page.locator('#model-select option')).toHaveCount(2);
    await expect(page.locator('#model-select option')).toHaveText([
        'Azure Whisper',
        'MAI-Transcribe 1.5'
    ]);
    await expect(page.locator('#model-help')).toHaveAttribute('target', '_blank');

    await page.locator('#user-menu-settings').click();
    await expect(page.locator('#whisper-uri')).toBeVisible();
    await expect(page.locator('#mai-transcribe-uri')).toBeVisible();
    await expect(page.locator('input[name="theme-mode"]')).toHaveCount(3);
    await expect(page.locator('#save-settings')).toHaveText('Save changes');

    await page.locator('#user-menu-microphone').click();
    await expect(page.locator('#input-device')).toBeVisible();
    const enumeratedMicrophone = page.locator('#input-device option:not([value=""])').first();
    await expect(enumeratedMicrophone).toBeAttached();
    await expect(enumeratedMicrophone).not.toHaveText('');
    await expect(page.locator('#noise-toggle')).toBeVisible();

    await page.locator('body > header').click();
    await expect(page.locator('#user-menu-surface')).toBeHidden();
    await expect(launcher).toBeFocused();
    expect(await page.evaluate(() => globalThis.__browserTestMicCalls)).toBe(0);
    expect(observations.externalRequests).toEqual([]);
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
    await expect(page.locator('#user-menu-launcher')).toBeVisible();
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
    await expect(page.locator('[data-menu-panel="settings"]')).toBeVisible();
    await expect(page.locator('#whisper-uri')).toBeFocused();
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

test('390 px detail replaces root, Back restores it, and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const observations = await openScenario(page);
    await openMenu(page);
    await page.locator('#user-menu-settings').click();

    await expect(page.locator('#user-menu-root')).toBeHidden();
    await expect(page.locator('#user-menu-detail')).toBeVisible();
    await expect(page.locator('#user-menu-back')).toBeVisible();
    expect(await page.evaluate(() => (
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ))).toBe(true);

    await page.locator('#user-menu-back').click();
    await expect(page.locator('#user-menu-root')).toBeVisible();
    await expect(page.locator('#user-menu-detail')).toBeHidden();
    await expect(page.locator('#user-menu-settings')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#user-menu-launcher')).toBeFocused();
    expect(observations.externalRequests).toEqual([]);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});
