/**
 * @fileoverview Deterministic built-browser coverage for memory-only Selected Audio.
 */

import { expect, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4173';
const endpoint = 'https://127.0.0.1:4174/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
const observationsUrl = `${appOrigin}/__browser-test__/api-observations`;
const fakeToken = 'deterministic-test-token';

test.use({ trace: 'off', screenshot: 'off' });

async function openApp(page, { model = 'mai-transcribe-1.5' } = {}) {
    const resetResponse = await fetch(`${appOrigin}/__browser-test__/reset`, { method: 'POST' });
    expect(resetResponse.ok).toBe(true);

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
    }));
    await page.addInitScript(({ selectedModel, transcriptionEndpoint }) => {
        localStorage.setItem('transcription_model', selectedModel);
        localStorage.setItem('mai_transcribe_uri', transcriptionEndpoint);
        localStorage.setItem('whisper_uri', transcriptionEndpoint);
    }, { selectedModel: model, transcriptionEndpoint: endpoint });
    await page.goto('/');
    await expect(page.locator('#upload-action')).toBeEnabled();
    return { pageErrors, consoleErrors };
}

async function chooseGeneratedWav(page, name = 'generated-selected.wav') {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#upload-action').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name,
        mimeType: 'audio/wav',
        buffer: createGeneratedWav()
    });
}

async function setSyntheticFile(page, { name, type, size }) {
    await page.locator('#audio-file-input').evaluate((input, file) => {
        const transfer = new globalThis.DataTransfer();
        transfer.items.add(new File([new Uint8Array(file.size)], file.name, { type: file.type }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { name, type, size });
}

async function fetchObservations() {
    const response = await fetch(observationsUrl);
    expect(response.ok).toBe(true);
    return response.json();
}

async function expectNoViewportOverflow(page) {
    await expect.poll(() => page.evaluate(() => (
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
        && globalThis.document.body.scrollWidth <= globalThis.innerWidth
    ))).toBe(true);
}

function createGeneratedWav() {
    const sampleRate = 16_000;
    const sampleCount = sampleRate / 4;
    const bytesPerSample = 2;
    const dataSize = sampleCount * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
    buffer.writeUInt16LE(bytesPerSample, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);
    for (let index = 0; index < sampleCount; index++) {
        const sample = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.2;
        buffer.writeInt16LE(Math.round(sample * 0x7FFF), 44 + index * bytesPerSample);
    }
    return buffer;
}

test('picker review stays local until explicit Transcribe and converges on the transcript path', async ({ page }) => {
    const observations = await openApp(page);
    const requestPromise = page.waitForRequest(request => (
        request.url() === endpoint && request.method() === 'POST'
    ));

    await chooseGeneratedWav(page);

    await expect(page.locator('#selected-audio-verdict'))
        .toHaveText('Ready for Azure MAI-Transcribe 1.5');
    await expect(page.locator('#selected-audio-name')).toHaveText('generated-selected.wav');
    await expect(page.locator('#selected-audio-metadata')).toContainText('WAV');
    await expect(page.locator('#selected-audio-primary')).toHaveText('Transcribe');
    await expect(page.locator('#selected-audio-primary')).toBeFocused();
    await expect(page.locator('#control-cluster')).toBeHidden();
    expect((await fetchObservations()).postCount).toBe(0);

    await page.locator('#selected-audio-primary').click();
    const request = await requestPromise;

    await expect(page.locator('#transcript')).toHaveValue('Browser smoke transcript');
    await expect(page.locator('#status')).toHaveText('Transcription complete');
    await expect(page.locator('#selected-audio-workspace')).toBeHidden();
    await expect(page.locator('#primary-action')).toHaveText('Start recording');
    await expect(page.locator('#upload-action')).toHaveText('Upload audio');
    await expect(page.locator('.transcript-empty-title')).toHaveText('Record or upload audio');
    expect(request.headers().authorization).toBe(`Bearer ${fakeToken}`);

    const api = await fetchObservations();
    expect([0, 1]).toContain(api.optionsCount);
    expect(api.postCount).toBe(1);
    const privacy = await page.evaluate(({ filename, tokenMarker }) => {
        const storageEntries = [
            ...Object.entries(localStorage),
            ...Object.entries(sessionStorage)
        ];
        return {
            storageIsPrivate: storageEntries.every(([key, value]) => (
                !key.includes(filename)
                && !value.includes(filename)
                && !value.includes('blob:')
                && !value.includes(tokenMarker)
                && !value.includes('RIFF')
            )),
            eventHistoryIsPrivate: globalThis.__browserTestEventHistoryIsPrivate?.() === true
        };
    }, { filename: 'generated-selected.wav', tokenMarker: fakeToken });
    expect(privacy).toEqual({
        storageIsPrivate: true,
        eventHistoryIsPrivate: true
    });
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('drop, local rejection, source concurrency, and 390 px layout make zero requests', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const observations = await openApp(page, { model: 'whisper' });
    const transcriptBody = page.locator('.transcript-body');

    const dataTransfer = await page.evaluateHandle(() => {
        const transfer = new globalThis.DataTransfer();
        transfer.items.add(new File([new Uint8Array(128)], 'dropped-test.wav', {
            type: 'audio/wav'
        }));
        return transfer;
    });
    await transcriptBody.dispatchEvent('dragover', { dataTransfer });
    await expect(transcriptBody).toHaveClass(/selected-audio-dragging/);
    await expect(page.locator('.transcript-empty-title')).toHaveText('Drop an audio file here');
    await transcriptBody.dispatchEvent('drop', { dataTransfer });

    await expect(page.locator('#selected-audio-verdict')).toHaveText('Ready for Azure Whisper');
    await expect(page.locator('#primary-action')).toBeHidden();
    await expect(page.locator('#upload-action')).toBeHidden();
    await expectNoViewportOverflow(page);
    expect((await fetchObservations()).postCount).toBe(0);

    await page.locator('#selected-audio-remove').click();
    await expect(page.locator('#upload-action')).toBeVisible();
    await setSyntheticFile(page, { name: 'unsupported.ogg', type: 'audio/ogg', size: 64 });
    await expect(page.locator('#selected-audio-verdict')).toContainText('Unsupported audio file');
    await expect(page.locator('#selected-audio-primary')).toHaveText('Choose another');
    expect((await fetchObservations()).postCount).toBe(0);

    await page.locator('#selected-audio-remove').click();
    await setSyntheticFile(page, {
        name: 'oversized-test.wav',
        type: 'audio/wav',
        size: (25 * 1024 * 1024) + 1
    });
    await expect(page.locator('#selected-audio-verdict')).toContainText('25 MB maximum');
    expect((await fetchObservations()).postCount).toBe(0);

    await page.locator('#selected-audio-remove').click();
    await page.locator('#primary-action').click();
    await expect(page.locator('#primary-action')).toHaveText('Done');
    await expect(page.locator('#upload-action')).toBeHidden();
    await page.locator('#discard-action').click();
    await expect(page.locator('#upload-action')).toBeVisible();
    await expectNoViewportOverflow(page);
    expect((await fetchObservations()).postCount).toBe(0);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors).toEqual([]);
});

test('failed Azure request retains the same file for one explicit Retry', async ({ page }) => {
    let postAttempts = 0;
    await page.route(endpoint, async route => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        postAttempts += 1;
        if (postAttempts === 1) {
            await route.fulfill({
                status: 400,
                headers: {
                    'Access-Control-Allow-Origin': appOrigin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: { message: 'Deterministic browser failure' } })
            });
            return;
        }
        await route.continue();
    });
    const observations = await openApp(page);
    await chooseGeneratedWav(page, 'retained-test.wav');
    await expect(page.locator('#selected-audio-verdict'))
        .toHaveText('Ready for Azure MAI-Transcribe 1.5');

    await page.locator('#selected-audio-primary').click();

    await expect(page.locator('#selected-audio-primary')).toHaveText('Retry');
    await expect(page.locator('#selected-audio-name')).toHaveText('retained-test.wav');
    await expect(page.locator('#selected-audio-remove')).toBeVisible();
    expect(postAttempts).toBe(1);

    await page.locator('#selected-audio-primary').click();

    await expect(page.locator('#transcript')).toHaveValue('Browser smoke transcript');
    expect(postAttempts).toBe(2);
    expect((await fetchObservations()).postCount).toBe(1);
    expect(observations.pageErrors).toEqual([]);
    expect(observations.consoleErrors.length).toBeGreaterThan(0);
    expect(observations.consoleErrors.every(message => (
        !message.includes('retained-test.wav')
        && !message.includes(fakeToken)
        && !message.includes(endpoint)
    ))).toBe(true);
});
