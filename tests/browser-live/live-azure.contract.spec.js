/**
 * @fileoverview Opt-in real-browser contract test against Azure MAI Transcribe.
 */

import { expect, test } from '@playwright/test';

test('transcribes a spoken fixture through live Azure', async ({ page }) => {
    const uri = process.env.AZURE_MAI_TRANSCRIBE_URI;
    const key = process.env.AZURE_MAI_TRANSCRIBE_API_KEY;
    test.skip(!uri || !key, 'live Azure secrets not provided');

    await page.addInitScript(config => {
        localStorage.setItem('transcription_model', 'mai-transcribe-1.5');
        localStorage.setItem('mai_transcribe_uri', config.uri);
        localStorage.setItem('mai_transcribe_api_key', config.key);
        localStorage.setItem('recording_environment', 'quiet');
    }, { uri, key });

    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
    }));

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/');
    const primary = page.locator('#primary-action');
    const transcript = page.locator('#transcript');
    await expect(primary).toBeEnabled();
    await expect(primary).toContainText('Start recording');
    await page.unroute('https://fonts.googleapis.com/**');

    await primary.click();
    await expect(primary).toContainText('Done');
    await expect(primary).toBeEnabled();
    await page.waitForTimeout(4_000);

    const postPromise = page.waitForRequest(request =>
        request.url() === uri && request.method() === 'POST',
    { timeout: 260_000 });
    await primary.click();
    const request = await postPromise;

    expect(request.method()).toBe('POST');
    expect(request.url()).toBe(uri);
    await expect(transcript).not.toHaveValue('', { timeout: 260_000 });
    expect((await transcript.inputValue()).toLowerCase()).toContain('testing');
    await expect(primary).toContainText('Start recording');
    await expect(primary).toBeEnabled();
    expect(pageErrors).toEqual([]);
});
