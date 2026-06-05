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
        // it toggles (the likely hook for the future breathing pulse) must not animate
        // its geometry: no `transition: all`, no `transform`, no `animation`. Property
        // matches use a boundary so `text-transform` does not false-positive.
        const rules = css.match(/\.(btn-primary|recording)[^{]*\{[^}]*\}/gs) || [];
        expect(rules.length).toBeGreaterThan(0);
        for (const rule of rules) {
            expect(rule).not.toMatch(/transition:\s*all\b/);
            expect(rule).not.toMatch(/(^|[;{\s])transform\s*:/);
            expect(rule).not.toMatch(/(^|[;{\s])animation\s*:/);
        }
    });

    it('uses an explicit (non-all) transition on the shared button base', () => {
        const btnBase = css.match(/\.btn\s*\{[^}]*\}/);
        expect(btnBase).not.toBeNull();
        expect(btnBase[0]).not.toMatch(/transition:\s*all\b/);
    });
});
