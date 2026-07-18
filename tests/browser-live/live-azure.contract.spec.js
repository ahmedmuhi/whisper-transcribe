/**
 * @fileoverview Opt-in two-model browser contract using a protected workload token.
 */

import { expect, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4173';
const expectedFixtureWord = 'testing';
const protectedTokenName = 'AZURE_OIDC_ACCESS_TOKEN';
const requiredProtectedNames = Object.freeze([
    protectedTokenName,
    'AZURE_WHISPER_TARGET_URI',
    'AZURE_MAI_TRANSCRIBE_TARGET_URI'
]);
const protectedInputsPresent = requiredProtectedNames.every(name => process.env[name]);
const modelCases = Object.freeze([
    Object.freeze({
        label: 'Azure Whisper',
        model: 'whisper',
        targetName: 'AZURE_WHISPER_TARGET_URI',
        hostnameSuffix: '.openai.azure.com',
        storageName: 'whisper_uri'
    }),
    Object.freeze({
        label: 'MAI-Transcribe 1.5',
        model: 'mai-transcribe-1.5',
        targetName: 'AZURE_MAI_TRANSCRIBE_TARGET_URI',
        hostnameSuffix: '.cognitiveservices.azure.com',
        storageName: 'mai_transcribe_uri'
    })
]);

test.skip(
    !protectedInputsPresent,
    'Protected workload token/Target URIs not provided; zero external requests.'
);

for (const modelCase of modelCases) {
    test(`${modelCase.label} -> one harmless transcription -> expected fixture word`, async ({ browser }) => {
        const protectedConfiguration = readProtectedConfiguration(
            modelCase.targetName,
            modelCase.hostnameSuffix
        );

        const { accessToken, targetUri } = protectedConfiguration;
        const context = await browser.newContext({
            baseURL: appOrigin,
            permissions: ['microphone'],
            serviceWorkers: 'block'
        });

        try {
            await context.exposeFunction('__liveContractGetAccessToken', () => accessToken);
            await context.addInitScript(({ model, storageName, targetUri: uri }) => {
                localStorage.setItem('transcription_model', model);
                localStorage.setItem(storageName, uri);
                localStorage.setItem('recording_environment', 'quiet');
            }, {
                model: modelCase.model,
                storageName: modelCase.storageName,
                targetUri
            });

            const page = await context.newPage();
            await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
                status: 200,
                contentType: 'text/css',
                body: ''
            }));

            let matchingPostCount = 0;
            let pageErrorCount = 0;
            page.on('request', request => {
                if (request.method() === 'POST' && request.url() === targetUri) {
                    matchingPostCount += 1;
                }
            });
            page.on('pageerror', () => {
                pageErrorCount += 1;
            });

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
            await primary.click();

            await expect.poll(
                async () => (await transcript.inputValue()).toLowerCase().includes(expectedFixtureWord),
                {
                    message: 'The harmless expected fixture word was not observed.',
                    timeout: 260_000
                }
            ).toBe(true);
            await expect(primary).toContainText('Start recording');
            await expect(primary).toBeEnabled();
            expect(matchingPostCount).toBe(1);
            expect(pageErrorCount).toBe(0);
        } finally {
            await context.close();
        }
    });
}

function readProtectedConfiguration(targetName, hostnameSuffix) {
    const accessToken = process.env[protectedTokenName];
    const targetUri = validateProtectedTargetUri(process.env[targetName], hostnameSuffix);
    return { accessToken, targetUri };
}

function validateProtectedTargetUri(targetUri, hostnameSuffix) {
    let parsedTarget;
    try {
        parsedTarget = new URL(targetUri);
    } catch {
        throw new Error('Protected Target URI is not a valid Azure HTTPS endpoint.');
    }

    const hostname = parsedTarget.hostname.toLowerCase();
    const isExpectedAzureHost = hostname.endsWith(hostnameSuffix) &&
        hostname.length > hostnameSuffix.length;
    if (
        parsedTarget.protocol !== 'https:' ||
        parsedTarget.username ||
        parsedTarget.password ||
        parsedTarget.port ||
        parsedTarget.hash ||
        !isExpectedAzureHost
    ) {
        throw new Error('Protected Target URI is not a valid Azure HTTPS endpoint.');
    }
    return parsedTarget.href;
}
