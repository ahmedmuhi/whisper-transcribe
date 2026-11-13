/**
 * @fileoverview Real-browser path for a model that takes Recording Pieces: the
 * fake microphone is captured uncompressed and sent as one WAV piece, with no
 * conversion step, and the transcript is rebuilt from the returned words.
 */

import { expect, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4173';
const endpoint = 'https://127.0.0.1:4174/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
const fakeToken = 'deterministic-test-token';

test('records MAI-Transcribe 2 as one Recording Piece with no conversion step', async ({ page }) => {
    await page.addInitScript(({ transcriptionEndpoint }) => {
        localStorage.setItem('transcription_model', 'mai-transcribe-2');
        localStorage.setItem('mai_transcribe_uri', transcriptionEndpoint);
        // Noise cancellation on: the capture must read the same processed stream as the recorder.
        localStorage.setItem('recording_environment', 'noisy');
        const statusTexts = [];
        globalThis.__statusTexts = statusTexts;
        globalThis.document.addEventListener('DOMContentLoaded', () => {
            const status = globalThis.document.getElementById('status');
            new globalThis.MutationObserver(() => statusTexts.push(status.textContent))
                .observe(status, { childList: true, subtree: true, characterData: true });
        });
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
    const workers = [];
    const posts = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('worker', worker => workers.push(worker.url()));
    page.on('request', request => {
        if (request.url() === endpoint && request.method() === 'POST') posts.push(request);
    });

    await page.goto('/');
    const primary = page.locator('#primary-action');
    const transcript = page.locator('#transcript');
    await expect(primary).toBeEnabled();
    await expect(transcript).toHaveValue('');

    await primary.click();
    await expect(primary).toContainText('Done');
    await page.waitForTimeout(1_500);
    await primary.click();

    await expect(transcript).toHaveValue('Browser piece transcript.');
    await expect(primary).toContainText('Start recording');

    expect(posts).toHaveLength(1);
    expect(posts[0].headers().authorization).toBe(`Bearer ${fakeToken}`);
    const form = await new Response(posts[0].postDataBuffer(), {
        headers: { 'content-type': posts[0].headers()['content-type'] }
    }).formData();
    expect(JSON.parse(form.get('definition')).enhancedMode.modelOptions).toEqual({
        transcribeStyle: 'clean',
        timestamps: 'word'
    });

    const audio = form.get('audio');
    expect(audio.type).toBe('audio/wav');
    const wav = new DataView(await audio.arrayBuffer());
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(16_000);
    expect(wav.getUint16(34, true)).toBe(16);
    const sampleCount = wav.getUint32(40, true) / 2;
    expect(sampleCount).toBeGreaterThan(16_000);
    expect(Array.from({ length: Math.min(sampleCount, 16_000) }, (_, index) =>
        wav.getInt16(44 + index * 2, true)
    ).some(sample => sample !== 0)).toBe(true);

    const statusTexts = await page.evaluate(() => globalThis.__statusTexts);
    expect(statusTexts.join('\n')).not.toContain('Converting audio format');
    expect(statusTexts).toContain('Transcription complete');
    expect(workers.filter(url => /audio-converter\.worker/.test(url))).toEqual([]);
    // The processor came from the app's own origin, as a file, not a blob: or data: URL.
    const observations = await (await fetch(`${appOrigin}/__browser-test__/api-observations`)).json();
    expect(observations.workletPaths).toEqual([
        expect.stringMatching(/^\/assets\/pcm-capture\.worklet-[^/]+\.js$/)
    ]);

    const storedTranscript = JSON.parse(await page.evaluate(() => localStorage.getItem('transcript_record')));
    expect(storedTranscript.text).toBe('Browser piece transcript.');
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});
