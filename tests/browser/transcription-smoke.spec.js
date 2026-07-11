/**
 * @fileoverview Real-browser transcription smoke test from capture to reload.
 */

import { expect, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4173';
const endpoint = 'https://127.0.0.1:4174/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
const observationsUrl = `${appOrigin}/__browser-test__/api-observations`;

test('records, converts, transcribes, and restores a transcript', async ({ page }) => {
    await page.addInitScript(({ transcriptionEndpoint }) => {
        localStorage.setItem('transcription_model', 'mai-transcribe-1.5');
        localStorage.setItem('mai_transcribe_uri', transcriptionEndpoint);
        localStorage.setItem('mai_transcribe_api_key', 'e2e-test-key');
        localStorage.setItem('recording_environment', 'quiet');
    }, { transcriptionEndpoint: endpoint });

    const resetResponse = await fetch(`${appOrigin}/__browser-test__/reset`, { method: 'POST' });
    expect(resetResponse.ok).toBe(true);

    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
    }));

    const pageErrors = [];
    const consoleErrors = [];
    const workerStates = new Map();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });
    page.on('worker', worker => {
        const state = { closed: false };
        workerStates.set(worker, state);
        worker.on('close', () => {
            state.closed = true;
        });
    });

    await page.goto('/');
    const primary = page.locator('#primary-action');
    const transcript = page.locator('#transcript');
    await expect(primary).toBeEnabled();
    await expect(primary).toContainText('Start recording');
    await expect(transcript).toHaveValue('');
    await page.unroute('https://fonts.googleapis.com/**');

    await primary.click();
    await expect(primary).toContainText('Done');
    await expect(primary).toBeEnabled();
    await page.waitForTimeout(1_200);

    const workerPromise = page.waitForEvent('worker', {
        predicate: worker => worker.url().endsWith('/js/audio-converter.worker.js')
    });
    const postPromise = page.waitForRequest(request =>
        request.url() === endpoint && request.method() === 'POST'
    );
    await primary.click();
    const [worker, request] = await Promise.all([workerPromise, postPromise]);

    expect(worker.url()).toMatch(/\/js\/audio-converter\.worker\.js$/);
    expect(workerStates.get(worker)?.closed).toBe(false);
    expect(await worker.evaluate(() => self.location.pathname))
        .toBe('/js/audio-converter.worker.js');

    await expect(transcript).toHaveValue('Browser smoke transcript');
    await expect(primary).toContainText('Start recording');
    await expect(primary).toBeEnabled();

    expect(request.method()).toBe('POST');
    expect(request.url()).toBe(endpoint);
    expect(request.headers()['ocp-apim-subscription-key']).toBe('e2e-test-key');
    expect(request.headers()['content-type']).toMatch(/^multipart\/form-data;\s*boundary=/);

    const observations = await fetchObservations();
    expect(observations.captureError).toBeNull();
    expect(observations.optionsCount).toBe(1);
    expect(observations.postCount).toBe(1);
    expect(observations.preflightHeaders['access-control-request-method']).toBe('POST');
    expect(observations.preflightHeaders['access-control-request-headers'])
        .toContain('ocp-apim-subscription-key');
    expect(observations.postHeaders['ocp-apim-subscription-key']).toBe('e2e-test-key');
    expect(observations.postHeaders['content-type']).toMatch(/^multipart\/form-data;\s*boundary=/);
    expect(observations.postBodyBase64).not.toBe('');

    const body = Buffer.from(observations.postBodyBase64, 'base64');
    const form = await new Response(body, {
        headers: { 'content-type': observations.postHeaders['content-type'] }
    }).formData();
    expect(JSON.parse(form.get('definition'))).toEqual({
        enhancedMode: {
            enabled: true,
            model: 'mai-transcribe-1.5',
            task: 'transcribe'
        }
    });

    const audio = form.get('audio');
    expect(audio.name).toBe('recording.wav');
    expect(audio.type).toBe('audio/wav');
    const wav = new Uint8Array(await audio.arrayBuffer());
    const wavView = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(wav.byteLength).toBeGreaterThan(44);
    expect(readAscii(wav, 0, 4)).toBe('RIFF');
    expect(readAscii(wav, 8, 4)).toBe('WAVE');
    expect(readAscii(wav, 36, 4)).toBe('data');
    expect(wavView.getUint16(22, true)).toBe(1);
    expect(wavView.getUint32(24, true)).toBe(16_000);
    expect(wavView.getUint16(34, true)).toBe(16);
    expect(wavView.getUint32(40, true)).toBeGreaterThan(0);
    const samplesToInspect = Math.min(16_000, (wav.byteLength - 44) / 2);
    expect(Array.from({ length: samplesToInspect }, (_, index) =>
        wavView.getInt16(44 + index * 2, true)
    ).some(sample => sample !== 0)).toBe(true);

    const storedTranscript = JSON.parse(await page.evaluate(() =>
        localStorage.getItem('transcript_record')
    ));
    expect(storedTranscript.text).toBe('Browser smoke transcript');
    expect(storedTranscript.savedAt).toEqual(expect.any(Number));

    await page.reload();
    await expect(primary).toBeEnabled();
    await expect(primary).toContainText('Start recording');
    await expect(transcript).toHaveValue('Browser smoke transcript');
    const observationsAfterReload = await fetchObservations();
    expect(observationsAfterReload.optionsCount).toBe(1);
    expect(observationsAfterReload.postCount).toBe(1);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

async function fetchObservations() {
    const response = await fetch(observationsUrl);
    expect(response.ok).toBe(true);
    return response.json();
}

function readAscii(bytes, offset, length) {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
}
