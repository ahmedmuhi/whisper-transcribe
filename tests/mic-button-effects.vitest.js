import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Guards the hit-target safety of the primary recording control. A later phase
 * adds a decorative "breathing" pulse while recording; these tests ensure the
 * pulse can never animate the button's geometry (a regression that has bitten
 * this project before — see commits 4c63924 / c3a2202).
 */
describe('Primary control visual effects (hit-target safety)', () => {
    const html = readFileSync('index.html', 'utf-8');
    const css = readFileSync('css/styles.css', 'utf-8');

    it('does not render radiating decorative layers around the controls', () => {
        expect(html).not.toContain('mic-glow');
        expect(html).not.toContain('mic-ring');
    });

    it('does not define expanding glow or ring animations', () => {
        expect(css).not.toContain('glowPulse');
        expect(css).not.toContain('ringExpand');
        expect(css).not.toContain('@keyframes recordPulse');
    });

    it('keeps the primary control from animating its hit target', () => {
        // Any rule targeting the primary control OR the standalone `.recording` class
        // it toggles (the breathing-pulse hook) must never animate its GEOMETRY:
        // no `transition: all`, and no transform OR the modern independent transform
        // properties (scale/rotate/translate) — each can move/resize the hit target.
        // A box-shadow/opacity `animation` (the breath) IS allowed. The leading
        // boundary stops `text-transform`/`-webkit-transform`-style false positives.
        const rules = css.match(/\.(btn-primary|recording)[^{]*\{[^}]*\}/gs) || [];
        expect(rules.length).toBeGreaterThan(0);
        for (const rule of rules) {
            expect(rule).not.toMatch(/transition:\s*all\b/);
            expect(rule).not.toMatch(/(^|[;{\s])(transform|scale|rotate|translate)\s*:/);
        }
    });

    it('only animates box-shadow/opacity on the primary — keyframes never move geometry', () => {
        // Collect every @keyframes name referenced by a primary/recording rule's
        // `animation:` shorthand OR `animation-name:` longhand (incl. comma-listed
        // multi-animations), then assert none of those keyframes touch any geometry
        // property — classic transform, independent scale/rotate/translate, sizing,
        // or spacing. This is the guard for a regression that has bitten before.
        const rules = css.match(/\.(btn-primary|recording)[^{]*\{[^}]*\}/gs) || [];
        const TIMING = /^(infinite|alternate|alternate-reverse|both|forwards|backwards|none|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|normal|reverse|paused|running)$/;
        const referenced = new Set();
        for (const rule of rules) {
            for (const decl of rule.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;]+)/g)) {
                // A shorthand can list several comma-separated animations; take the
                // name token (first non-time/-easing token) of each.
                for (const segment of decl[1].split(',')) {
                    for (const token of segment.trim().split(/\s+/)) {
                        if (/^[A-Za-z][\w-]*$/.test(token) &&
                            !TIMING.test(token) &&
                            !/^(cubic-bezier|steps)\(/.test(token)) {
                            referenced.add(token);
                            break;
                        }
                    }
                }
            }
        }

        const forbidden = /(^|[;{\s])(transform|scale|rotate|translate|width|height|padding|margin|gap|inset|top|right|bottom|left|min-width|min-height|max-width|max-height)\s*:/;
        for (const name of referenced) {
            const block = css.match(new RegExp(`@keyframes\\s+${name}\\s*\\{[\\s\\S]*?\\n\\}`));
            expect(block, `Expected @keyframes ${name} to be defined`).not.toBeNull();
            expect(block[0], `@keyframes ${name} must not animate geometry`).not.toMatch(forbidden);
        }
    });

    it('uses an explicit (non-all) transition on the shared button base', () => {
        const btnBase = css.match(/\.btn\s*\{[^}]*\}/);
        expect(btnBase).not.toBeNull();
        expect(btnBase[0]).not.toMatch(/transition:\s*all\b/);
    });
});
