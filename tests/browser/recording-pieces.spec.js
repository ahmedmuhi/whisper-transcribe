/**
 * @fileoverview Real-browser path for a model that takes Recording Pieces: the
 * fake microphone is captured uncompressed and sent as WAV pieces, with no
 * conversion step, and the transcript is rebuilt from the returned words.
 * The browser-test build shortens pieces to 3 seconds with 0.4 seconds of
 * overlap (tests/browser/fakes/authentication-factory.js).
 */

import { expect, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4173';
const endpoint = 'https://127.0.0.1:4174/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
const fakeToken = 'deterministic-test-token';

async function openApp(page) {
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
    return { primary, transcript, posts, workers, pageErrors, consoleErrors };
}

test('records MAI-Transcribe 2 as one Recording Piece with no conversion step', async ({ page }) => {
    const { primary, transcript, posts, workers, pageErrors, consoleErrors } = await openApp(page);

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

test('records MAI-Transcribe 2 past a cut and shows the joined transcript, the text arriving while the User speaks', async ({ page }) => {
    const { primary, transcript, posts, pageErrors, consoleErrors } = await openApp(page);

    await primary.click();
    await expect(primary).toContainText('Done');
    // The first piece is sent once the audio runs half the overlap past the 3-second cut.
    await expect.poll(() => posts.length, { timeout: 8_000 }).toBe(1);
    await expect(transcript).toHaveValue('Browser piece transcript.');
    await expect(primary).toContainText('Done');
    expect(await page.evaluate(() => localStorage.getItem('transcript_record'))).toBeNull();

    await page.waitForTimeout(1_500);
    await primary.click();

    await expect(transcript).toHaveValue('Browser piece transcript. Browser piece transcript.');
    await expect(primary).toContainText('Start recording');
    expect(posts).toHaveLength(2);
    for (const post of posts) {
        expect(post.headers().authorization).toBe(`Bearer ${fakeToken}`);
        const form = await new Response(post.postDataBuffer(), {
            headers: { 'content-type': post.headers()['content-type'] }
        }).formData();
        expect(JSON.parse(form.get('definition')).enhancedMode.modelOptions.timestamps).toBe('word');
        expect(form.get('audio').type).toBe('audio/wav');
    }

    const statusTexts = await page.evaluate(() => globalThis.__statusTexts);
    expect(statusTexts.join('\n')).not.toContain('Converting audio format');
    expect(statusTexts).toContain('Finishing transcript...');
    expect(statusTexts).toContain('Transcription complete');
    const storedTranscript = JSON.parse(await page.evaluate(() => localStorage.getItem('transcript_record')));
    expect(storedTranscript.text).toBe('Browser piece transcript. Browser piece transcript.');
    expect(await page.evaluate(() => globalThis.__browserTestEventHistoryIsPrivate())).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test('records MAI-Transcribe 2 through a failed piece and the whole recording delivers the transcript', async ({ page }) => {
    const { primary, transcript, posts, pageErrors, consoleErrors } = await openApp(page);
    expect((await fetch(`${appOrigin}/__browser-test__/fail-pieces`, { method: 'POST' })).ok).toBe(true);

    await primary.click();
    await expect(primary).toContainText('Done');
    await expect.poll(() => posts.length, { timeout: 8_000 }).toBe(1);
    // Recording goes on past the next cut, with no piece sent and nothing shown.
    await page.waitForTimeout(4_000);
    expect(posts).toHaveLength(1);
    await expect(primary).toContainText('Done');
    await expect(transcript).toHaveValue('');
    await primary.click();

    await expect(transcript).toHaveValue('Browser smoke transcript');
    await expect(primary).toContainText('Start recording');
    expect(posts).toHaveLength(2);
    const forms = await Promise.all(posts.map(post => new Response(post.postDataBuffer(), {
        headers: { 'content-type': post.headers()['content-type'] }
    }).formData()));
    expect(JSON.parse(forms[0].get('definition')).enhancedMode.modelOptions.timestamps).toBe('word');
    expect(JSON.parse(forms[1].get('definition')).enhancedMode.modelOptions).toEqual({ transcribeStyle: 'clean' });
    for (const post of posts) expect(post.headers().authorization).toBe(`Bearer ${fakeToken}`);

    const statusTexts = await page.evaluate(() => globalThis.__statusTexts);
    expect(statusTexts.join('\n')).toContain('Converting audio format');
    expect(statusTexts).toContain('Transcription complete');
    expect(statusTexts.join('\n')).not.toMatch(/piece|rejected/i);
    const storedTranscript = JSON.parse(await page.evaluate(() => localStorage.getItem('transcript_record')));
    expect(storedTranscript.text).toBe('Browser smoke transcript');
    expect(pageErrors).toEqual([]);
    // Only the rejected piece is logged: by the browser, and by the client as its status alone.
    expect(consoleErrors).toEqual([
        expect.stringMatching(/^Failed to load resource: the server responded with a status of 400/),
        expect.stringMatching(/ERROR\[AzureAPIClient\]: API error 400$/)
    ]);
});
