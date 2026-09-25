/**
 * @fileoverview Built-browser coverage for the one-time New notice: it shows on
 * a fresh load, is acknowledged by opening quick settings, is gone after a
 * reload, and never changes the gear's box.
 */

import { expect, test } from '@playwright/test';

const targetUri = 'https://target.invalid/transcribe';

async function openApp(page) {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
    }));
    // Playwright gives each test a fresh context, so storage starts empty. This
    // script re-runs on reload, so it must never touch the acknowledgement.
    await page.addInitScript(({ endpoint }) => {
        sessionStorage.setItem('browser_test_auth_scenario', 'ready');
        localStorage.setItem('mai_transcribe_uri', endpoint);
    }, { endpoint: targetUri });
    await page.goto('/');
    return { pageErrors };
}

test('the New notice shows once and is gone after quick settings opens', async ({ page }) => {
    const observations = await openApp(page);
    const gear = page.locator('#quick-settings-button');
    const gearPill = page.locator('#quick-settings-new-pill');
    const maiOption = page.locator('#model-select option[value="mai-transcribe-2"]');

    await expect(gear).toBeVisible();
    await expect(gearPill).toBeVisible();
    await expect(gear).toHaveAccessibleName('Quick settings, new model available');
    await expect(maiOption).toHaveText('MAI-Transcribe 2 · New');
    const boxWithPill = await gear.boundingBox();

    await gear.click();
    await expect(page.locator('#quick-settings')).toBeVisible();
    await expect(gearPill).toBeHidden();
    await expect(gear).toHaveAccessibleName('Quick settings');
    // The User sees what was new in the surface they just opened.
    await expect(page.locator('#quick-model-new-pill')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('acknowledged_new_models')))
        .toBe('["mai-transcribe-2"]');

    await page.reload();
    await expect(gear).toBeVisible();
    await expect(gearPill).toBeHidden();
    await expect(gear).toHaveAccessibleName('Quick settings');
    await expect(maiOption).toHaveText('MAI-Transcribe 2');
    await expect(page.locator('#quick-model-new-pill')).toBeHidden();
    await expect(page.locator('#settings-model-new-pill')).toBeHidden();

    // Hit-target rule: the pill must not change the gear's box.
    expect(await gear.boundingBox()).toEqual(boxWithPill);
    expect(observations.pageErrors).toEqual([]);
});
