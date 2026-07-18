/**
 * @fileoverview Deterministic source and bundle hygiene for the opt-in live contract.
 */

import { createHash } from 'node:crypto';
import {
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = relativePath => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const paths = Object.freeze({
    authorizationProbe: 'tests/browser-live/authorization-probe.contract.spec.js',
    fixture: 'tests/browser-live/fixtures/spoken-phrase.wav',
    liveConfig: 'playwright.live.config.js',
    package: 'package.json',
    provider: 'tests/browser-live/oidc-authentication-factory.js',
    transcriptionSpec: 'tests/browser-live/live-azure.contract.spec.js',
    viteConfig: 'vite.config.js',
    workflow: '.github/workflows/live-azure-contract.yml'
});

describe('live OIDC browser harness hygiene', () => {
    it('uses a live-build-only authentication alias and never compiles a token', () => {
        const packageJson = JSON.parse(readRepoFile(paths.package));
        const liveConfig = readRepoFile(paths.liveConfig);
        const viteConfig = readRepoFile(paths.viteConfig);
        const provider = readRepoFile(paths.provider);

        expect(packageJson.scripts['test:browser:live'])
            .toBe('npm run build && playwright test --config playwright.live.config.js');
        expect(liveConfig).toContain('npm run build -- --mode live-contract');
        expect(liveConfig).toContain('protectedInputsPresent');
        expect(liveConfig).toMatch(/webServer:\s*protectedInputsPresent\s*\?/u);
        expect(viteConfig).toContain("mode === 'live-contract'");
        expect(viteConfig).toContain('tests/browser-live/oidc-authentication-factory.js');
        expect(provider).toContain('__liveContractGetAccessToken');
        expect(provider).not.toMatch(/import\.meta\.env|process\.env/u);
        expect(provider).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
        expect(provider).not.toMatch(/console\.|logger|eventBus\.setHistoryEnabled/u);
    });

    it('keeps the live Playwright project serial, retry-free, and artifact-free', () => {
        const config = readRepoFile(paths.liveConfig);

        expect(config).toMatch(/workers:\s*1/u);
        expect(config).toMatch(/fullyParallel:\s*false/u);
        expect(config).toMatch(/retries:\s*0/u);
        expect(config).toMatch(/trace:\s*'off'/u);
        expect(config).toMatch(/screenshot:\s*'off'/u);
        expect(config).toMatch(/video:\s*'off'/u);
        expect(config).toMatch(/preserveOutput:\s*'never'/u);
        expect(config).toMatch(/reporter:\s*'line'/u);
        expect(config).not.toMatch(/html|upload-artifact/u);
    });

    it('defines exactly one guarded transcription case per supported model', () => {
        const spec = readRepoFile(paths.transcriptionSpec);

        expect(spec.match(/model:\s*'whisper'/gu)).toHaveLength(1);
        expect(spec.match(/model:\s*'mai-transcribe-1\.5'/gu)).toHaveLength(1);
        expect(spec).toContain('AZURE_WHISPER_TARGET_URI');
        expect(spec).toContain('AZURE_MAI_TRANSCRIBE_TARGET_URI');
        expect(spec).toContain('AZURE_OIDC_ACCESS_TOKEN');
        expect(spec).toContain('requiredProtectedNames.every');
        expect(spec).toContain("hostnameSuffix: '.openai.azure.com'");
        expect(spec).toContain("hostnameSuffix: '.cognitiveservices.azure.com'");
        expect(spec).toContain('validateProtectedTargetUri');
        expect(spec).toContain("const expectedFixtureWord = 'testing'");
        expect(spec).toContain('includes(expectedFixtureWord)');
        expect(spec).toContain(').toBe(true);');
        expect(spec).not.toMatch(/API_KEY|api.?key|Authorization|response\.body|console\./iu);
        expect(spec).not.toMatch(/(?:localStorage|sessionStorage|indexedDB)[^\n]*(?:token|accessToken)/iu);

        const guardIndex = spec.indexOf('test.skip(');
        const firstExternalActionIndex = Math.min(
            ...['browser.newContext(', 'exposeFunction(', 'page.goto(', 'fetch(']
                .map(marker => spec.indexOf(marker))
                .filter(index => index >= 0)
        );
        expect(guardIndex).toBeGreaterThan(-1);
        expect(firstExternalActionIndex).toBeGreaterThan(guardIndex);
    });

    it('preserves the reviewed spoken fixture byte-for-byte', () => {
        const fixture = readFileSync(path.join(repoRoot, paths.fixture));

        expect(createHash('sha256').update(fixture).digest('hex'))
            .toBe('e9a34719cb60aa1dc31c321940be60860fe93d8a97a437d8aa593ffbde25a111');
    });
});

describe('authorization-only probe hygiene', () => {
    it('defines one fail-closed, body-blind POST per supported model', () => {
        const spec = readRepoFile(paths.authorizationProbe);

        expect(spec.match(/label:\s*'Azure Whisper'/gu)).toHaveLength(1);
        expect(spec.match(/label:\s*'MAI-Transcribe 1\.5'/gu)).toHaveLength(1);
        expect(spec).toContain('AZURE_WHISPER_TARGET_URI');
        expect(spec).toContain('AZURE_MAI_TRANSCRIBE_TARGET_URI');
        expect(spec).toContain('AZURE_OIDC_ACCESS_TOKEN');
        expect(spec).toContain('requiredProtectedNames.every');
        expect(spec).toContain("hostnameSuffix: '.openai.azure.com'");
        expect(spec).toContain("hostnameSuffix: '.cognitiveservices.azure.com'");
        expect(spec).toContain('validateProtectedTargetUri');
        expect(spec).toContain("method: 'POST'");
        expect(spec).toContain('response.status');
        expect(spec).toContain('response.body?.cancel()');
        expect(spec).toContain('toBe(403)');
        expect(spec).not.toMatch(/spoken-phrase|FormData|\.json\(\)|\.text\(\)|arrayBuffer|audio/iu);

        const guardIndex = spec.indexOf('test.skip(');
        const fetchIndex = spec.indexOf('fetch(');
        expect(guardIndex).toBeGreaterThan(-1);
        expect(fetchIndex).toBeGreaterThan(guardIndex);
    });
});

describe('protected OIDC workflow hygiene', () => {
    let workflow;

    beforeAll(() => {
        workflow = readRepoFile(paths.workflow);
    });

    it('is protected, manually triggered, and grants only checkout plus OIDC permissions', () => {
        expect(workflow).toMatch(/^on:\n\s{2}workflow_dispatch:\n/mu);
        expect(workflow).toMatch(/stage:\n[\s\S]*?required:\s*true\n[\s\S]*?type:\s*choice/u);
        expect(workflow).toContain('- authorization-probe');
        expect(workflow).toContain('- transcription-contract');
        expect(workflow).not.toMatch(/^\s*(?:push|pull_request|schedule):/mu);
        expect(workflow).toMatch(/permissions:\n\s{2}contents:\s*read\n\s{2}id-token:\s*write/u);
        expect(workflow).toMatch(/environment:\s*live-azure/u);

        const triggerBlock = workflow.slice(
            workflow.indexOf('on:\n'),
            workflow.indexOf('\npermissions:')
        );
        expect(triggerBlock.match(/^\s{2}[a-z_]+:/gmu)).toEqual(['  workflow_dispatch:']);
        const permissionsBlock = workflow.match(/^permissions:\n((?:\s{2}.+\n)+)/mu)?.[1]
            .trim()
            .split('\n')
            .map(line => line.trim())
            .sort();
        expect(permissionsBlock).toEqual(['contents: read', 'id-token: write']);
        expect(workflow.match(/^permissions:/gmu)).toHaveLength(1);
        expect(workflow).toContain(
            'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5'
        );
        expect(workflow).toContain(
            'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'
        );
    });

    it('logs in without subscription or management authority and always cleans up', () => {
        expect(workflow).toContain(
            'azure/login@532459ea530d8321f2fb9bb10d1e0bcf23869a43'
        );
        expect(workflow).toContain('# azure/login@v3.0.0');
        expect(workflow).toMatch(/allow-no-subscriptions:\s*true/u);
        expect(workflow).toContain('AZURE_CORE_OUTPUT: none');
        expect(workflow).toContain('AZURE_LOGIN_POST_CLEANUP: true');
        expect(workflow).not.toMatch(/^\s+post-cleanup:/mu);
        expect(workflow).not.toMatch(/subscription-id|AZURE_SUBSCRIPTION_ID/iu);
        expect(workflow).not.toMatch(/\baz\s+(?:ad|role|group|resource|deployment|rest|keyvault)\b/iu);
        expect(workflow.match(/\baz\s+[a-z-]+(?:\s+[a-z-]+)?/gu)?.sort()).toEqual([
            'az account get-access-token',
            'az logout'
        ]);
        expect(workflow).toMatch(/if:\s*always\(\)/u);
    });

    it('masks the Cognitive Services token before job-local propagation', () => {
        expect(workflow).toContain('--resource https://cognitiveservices.azure.com');
        expect(workflow).toContain('--query accessToken -o tsv');

        const tokenCommandIndex = workflow.indexOf('az account get-access-token');
        const maskIndex = workflow.indexOf('::add-mask::');
        const propagationIndex = workflow.indexOf('GITHUB_ENV');
        expect(tokenCommandIndex).toBeGreaterThan(-1);
        expect(maskIndex).toBeGreaterThan(tokenCommandIndex);
        expect(propagationIndex).toBeGreaterThan(maskIndex);
    });

    it('uses protected names by presence only and runs only the selected stage', () => {
        expect(workflow).toContain('secrets.AZURE_OIDC_CLIENT_ID');
        expect(workflow).toContain('secrets.AZURE_TENANT_ID');
        expect(workflow).toContain('secrets.AZURE_WHISPER_TARGET_URI');
        expect(workflow).toContain('secrets.AZURE_MAI_TRANSCRIBE_TARGET_URI');
        expect(workflow).toContain('authorization-probe.contract.spec.js');
        expect(workflow).toContain('live-azure.contract.spec.js');
        expect(workflow).not.toMatch(/API_KEY|api.?key|upload-artifact|set\s+-[^\n]*x/iu);
        expect(workflow).not.toMatch(/az account show|list-keys|regenerate-key/iu);
    });
});

describe('production bundle boundary', () => {
    let productionOutput;

    beforeAll(async () => {
        productionOutput = mkdtempSync(path.join(tmpdir(), 'whisper-production-'));
        await build({
            configFile: path.join(repoRoot, paths.viteConfig),
            logLevel: 'silent',
            mode: 'production',
            build: {
                emptyOutDir: true,
                outDir: productionOutput
            }
        });
    });

    afterAll(() => {
        if (productionOutput) rmSync(productionOutput, { recursive: true, force: true });
    });

    it('excludes every live provider and workload-token marker', () => {
        const output = readDirectoryText(productionOutput);

        expect(output).not.toContain('oidc-authentication-factory');
        expect(output).not.toContain('AZURE_OIDC');
        expect(output).not.toContain('live-contract-token');
        expect(output).not.toContain('__liveContractGetAccessToken');
    });
});

function readDirectoryText(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) return readDirectoryText(entryPath);
            if (!statSync(entryPath).isFile()) return [];
            return readFileSync(entryPath, 'utf8');
        })
        .join('\n');
}
