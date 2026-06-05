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
        // no `transition: all` and no `transform`. A box-shadow/opacity `animation`
        // (the breath) IS allowed — it can't move the hit target. Property matches
        // use a boundary so `text-transform` does not false-positive.
        const rules = css.match(/\.(btn-primary|recording)[^{]*\{[^}]*\}/gs) || [];
        expect(rules.length).toBeGreaterThan(0);
        for (const rule of rules) {
            expect(rule).not.toMatch(/transition:\s*all\b/);
            expect(rule).not.toMatch(/(^|[;{\s])transform\s*:/);
        }
    });

    it('only animates box-shadow/opacity on the primary — keyframes never transform', () => {
        // Collect every @keyframes name referenced by a primary/recording rule's
        // `animation:` shorthand, then assert none of those keyframes touch
        // transform/width/height/padding/margin/inset (anything that moves geometry).
        const rules = css.match(/\.(btn-primary|recording)[^{]*\{[^}]*\}/gs) || [];
        const referenced = new Set();
        for (const rule of rules) {
            const anim = rule.match(/(^|[;{\s])animation\s*:\s*([^;]+);?/);
            if (!anim) continue;
            // The first non-time/-easing token of the shorthand is the name.
            for (const token of anim[2].trim().split(/\s+/)) {
                if (/^[A-Za-z][\w-]*$/.test(token) &&
                    !/^(infinite|alternate|both|forwards|backwards|none|linear|ease|ease-in|ease-out|ease-in-out|normal|reverse|paused|running)$/.test(token) &&
                    !/^(cubic-bezier|steps)\(/.test(token)) {
                    referenced.add(token);
                    break;
                }
            }
        }

        const forbidden = /(transform|width|height|padding|margin|inset|top|right|bottom|left)\s*:/;
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
