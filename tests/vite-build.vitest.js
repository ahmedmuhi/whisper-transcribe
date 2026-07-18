import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(repoRoot, 'dist');
const redirectSourcePath = path.join(repoRoot, 'auth/redirect.html');
const packagePath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');

function matchesAsset(pattern, assetName) {
    const assetPattern = path.basename(pattern)
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replaceAll('*', '.*');
    return new RegExp(`^${assetPattern}$`).test(assetName);
}

function budgetPatterns(budget) {
    return Array.isArray(budget.path) ? budget.path : [budget.path];
}

function brotliBytes(assetNames) {
    return assetNames.reduce((total, assetName) => {
        const source = readFileSync(path.join(distDirectory, 'assets', assetName));
        return total + brotliCompressSync(source, {
            params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: 11
            }
        }).byteLength;
    }, 0);
}

describe('Vite build contract', () => {
    it('emits separate application and redirect-bridge entries without application code in the bridge', () => {
        execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'pipe' });

        const indexPath = path.join(distDirectory, 'index.html');
        const redirectPath = path.join(distDirectory, 'auth/redirect.html');
        const redirectSource = readFileSync(redirectSourcePath, 'utf8');
        const redirectBuild = readFileSync(redirectPath, 'utf8');
        const trackedDistFiles = execFileSync('git', ['ls-files', '--', 'dist'], {
            cwd: repoRoot,
            encoding: 'utf8'
        });

        expect(existsSync(indexPath)).toBe(true);
        expect(existsSync(redirectPath)).toBe(true);
        expect(existsSync(path.join(distDirectory, 'js/main.js'))).toBe(false);
        expect(trackedDistFiles).toBe('');
        expect(readFileSync(indexPath, 'utf8')).toMatch(/assets\/.+\.js/);
        expect(redirectBuild).toContain('Completing sign-in');
        expect(redirectBuild).toMatch(/assets\/redirect-[^"]+\.js/);
        expect(redirectBuild).not.toMatch(/assets\/(?:main|constants|visualization|audio-converter\.worker)-[^"]+\.js/);
        expect(redirectSource).not.toMatch(/js\/main|AudioHandler|AzureAPIClient|localStorage|microphone/);
    });

    it('builds before invoking the supported live-browser configuration', () => {
        const { scripts } = JSON.parse(readFileSync(packagePath, 'utf8'));

        expect(scripts['test:browser:live'])
            .toBe('npm run build && playwright test --config playwright.live.config.js');
    });

    it('covers every shipped JavaScript chunk with exactly one bounded size budget', () => {
        execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'pipe' });
        const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
        const budgets = packageData['size-limit'];
        const javaScriptAssets = readdirSync(path.join(distDirectory, 'assets'))
            .filter(assetName => assetName.endsWith('.js'));
        const applicationBudget = budgets.find(budget => budget.name === 'application');
        const authenticationBudget = budgets.find(budget => budget.name === 'authentication runtime');
        const redirectBudget = budgets.find(budget => budget.name === 'redirect bridge');

        expect(applicationBudget.limit).toBe('20 kB');
        expect(redirectBudget.limit).toBe('5 kB');
        expect(authenticationBudget).toBeDefined();

        const assignments = javaScriptAssets.map(assetName => ({
            assetName,
            budgets: budgets
                .filter(budget => budgetPatterns(budget)
                    .some(pattern => matchesAsset(pattern, assetName)))
                .map(budget => budget.name)
        }));
        expect(assignments).toEqual(assignments.map(({ assetName }) => ({
            assetName,
            budgets: [expect.any(String)]
        })));

        const authenticationAssets = assignments
            .filter(({ budgets: [budgetName] }) => budgetName === authenticationBudget.name)
            .map(({ assetName }) => assetName);
        expect(authenticationAssets.length).toBeGreaterThan(0);
        expect(authenticationAssets.every(assetName => assetName.startsWith('authentication-')))
            .toBe(true);

        const measuredKilobytes = brotliBytes(authenticationAssets) / 1000;
        const expectedCeiling = Math.ceil(measuredKilobytes / 5) * 5;
        expect(authenticationBudget.limit).toBe(`${expectedCeiling} kB`);
    });

    it('keeps the maintained Node 22 floor compatible with the pinned Vite engine', () => {
        const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
        const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
        const lockedProject = packageLock.packages[''];
        const lockedVite = packageLock.packages['node_modules/vite'];

        expect({
            projectVite: packageData.devDependencies.vite,
            lockedVite: lockedVite.version,
            viteNode: lockedVite.engines.node,
            projectNode: packageData.engines.node,
            lockedProjectNode: lockedProject.engines.node
        }).toEqual({
            projectVite: '8.1.5',
            lockedVite: '8.1.5',
            viteNode: '^20.19.0 || >=22.12.0',
            projectNode: '>=22.12.0',
            lockedProjectNode: '>=22.12.0'
        });
    });
});
