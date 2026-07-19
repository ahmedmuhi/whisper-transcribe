/**
 * @fileoverview Opt-in expected-denial probes for the pre-role evidence stage.
 */

import { expect, test } from '@playwright/test';
import { createAuthorizationDenialClassifier } from './authorization-probe-contract.js';

const protectedTokenName = 'AZURE_OIDC_ACCESS_TOKEN';
const requiredProtectedNames = Object.freeze([
    protectedTokenName,
    'AZURE_OIDC_CLIENT_ID',
    'AZURE_TENANT_ID',
    'AZURE_WHISPER_TARGET_URI',
    'AZURE_MAI_TRANSCRIBE_TARGET_URI'
]);
const protectedInputsPresent = requiredProtectedNames.every(name => process.env[name]);
const probeCases = Object.freeze([
    Object.freeze({
        label: 'Azure Whisper',
        targetName: 'AZURE_WHISPER_TARGET_URI',
        hostnameSuffix: '.openai.azure.com'
    }),
    Object.freeze({
        label: 'MAI-Transcribe 1.5',
        targetName: 'AZURE_MAI_TRANSCRIBE_TARGET_URI',
        hostnameSuffix: '.cognitiveservices.azure.com'
    })
]);

test.skip(
    !protectedInputsPresent,
    'Protected workload token/Target URIs not provided; zero external requests.'
);

for (const probeCase of probeCases) {
    test(`${probeCase.label} rejects the validated unassigned workload identity`, async () => {
        const protectedConfiguration = readProtectedConfiguration(
            probeCase.targetName,
            probeCase.hostnameSuffix
        );
        const classifyAuthorizationDenial = createAuthorizationDenialClassifier({
            accessToken: protectedConfiguration.accessToken,
            expectedClientId: process.env.AZURE_OIDC_CLIENT_ID,
            expectedTenantId: process.env.AZURE_TENANT_ID
        });

        const status = await sendAuthorizationProbe(protectedConfiguration);
        expect(classifyAuthorizationDenial(status)).toBe(status);
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

async function sendAuthorizationProbe({ accessToken, targetUri }) {
    let response;
    try {
        response = await fetch(targetUri, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            redirect: 'error',
            signal: AbortSignal.timeout(30_000)
        });
    } catch {
        throw new Error('Authorization probe failed before an HTTP status was received.');
    }

    const status = response.status;
    await response.body?.cancel();
    return status;
}
