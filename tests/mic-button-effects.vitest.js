import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync('index.html', 'utf-8');
const css = readFileSync('css/styles.css', 'utf-8');

/**
 * Hit-target safety for the floating control pill.
 *
 * The redesign moves the "live" tell off the primary button and onto a small
 * decorative dot that leads the recording pill (`#record-dot`, pulseDot 1.2s).
 * Both are inside the same flex row as Done / Pause / Discard, so motion on
 * EITHER can shove the buttons around — the regression that has bitten this
 * project before (commits 4c63924 / c3a2202). These tests keep every animated
 * element in the island to opacity/colour work only.
 */

/** Rules whose selector mentions any of the given class names. */
function rulesFor(pattern) {
    return css.match(new RegExp(`\\.(?:${pattern})[^{]*\\{[^}]*\\}`, 'gs')) || [];
}

const TIMING = /^(infinite|alternate|alternate-reverse|both|forwards|backwards|none|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|normal|reverse|paused|running)$/;

/** @keyframes names referenced by an `animation`/`animation-name` in these rules. */
function keyframeNamesIn(rules) {
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
    referenced.delete('none');
    return referenced;
}

// Classic transform plus the modern independent transform properties, sizing
// and spacing — each can move or resize a neighbouring hit target.
const GEOMETRY = /(^|[;{\s])(transform|scale|rotate|translate|width|height|padding|margin|gap|inset|top|right|bottom|left|min-width|min-height|max-width|max-height)\s*:/;
// The leading boundary stops `text-transform`/`-webkit-transform` false positives.
const MOVES_IN_RULE = /(^|[;{\s])(transform|scale|rotate|translate)\s*:/;

function expectKeyframesStayStill(rules, label) {
    for (const name of keyframeNamesIn(rules)) {
        const block = css.match(new RegExp(`@keyframes\\s+${name}\\s*\\{[\\s\\S]*?\\n\\}`));
        expect(block, `Expected @keyframes ${name} to be defined`).not.toBeNull();
        expect(block[0], `@keyframes ${name} (${label}) must not animate geometry`).not.toMatch(GEOMETRY);
    }
}

describe('Primary control visual effects (hit-target safety)', () => {
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
        // Any rule targeting the primary control OR the standalone `.recording`
        // class it toggles must never animate its GEOMETRY: no `transition: all`,
        // and no transform / independent transform property. A box-shadow or
        // opacity `animation` would still be allowed.
        const rules = rulesFor('btn-primary|recording');
        expect(rules.length).toBeGreaterThan(0);
        for (const rule of rules) {
            expect(rule).not.toMatch(/transition:\s*all\b/);
            expect(rule).not.toMatch(MOVES_IN_RULE);
        }
    });

    it('never lets a primary/recording keyframe move geometry', () => {
        const rules = rulesFor('btn-primary|recording');
        expect(rules.length).toBeGreaterThan(0);
        expectKeyframesStayStill(rules, 'primary control');
    });

    it('uses an explicit (non-all) transition on the shared button base', () => {
        const btnBase = css.match(/\.btn\s*\{[^}]*\}/);
        expect(btnBase).not.toBeNull();
        expect(btnBase[0]).not.toMatch(/transition:\s*all\b/);
    });

    it('keeps every button rule at or above the 44px touch target', () => {
        const rules = css.match(/[^{}]+\{[^{}]*\}/gs) || [];
        let checked = 0;
        for (const rule of rules) {
            const [selector] = rule.split('{');
            if (!/\.btn\b|\.btn-/.test(selector)) continue;
            const declared = rule.match(/(?:^|[;{\s])min-height:\s*([^;}]+)/);
            if (!declared) continue;
            const px = declared[1].trim().match(/^(\d+(?:\.\d+)?)px$/);
            expect(px, `min-height on "${selector.trim()}" should be an explicit px target`).not.toBeNull();
            expect(Number(px[1]), `min-height on "${selector.trim()}"`).toBeGreaterThanOrEqual(44);
            checked += 1;
        }
        expect(checked).toBeGreaterThan(0);
    });
});

describe('Recording dot (decorative live tell)', () => {
    it('renders the dot as a decorative, initially hidden island element', () => {
        expect(html).toMatch(/<span id="record-dot"[^>]*class="[^"]*island-record-dot/);
        expect(html).toMatch(/<span id="record-dot"[^>]*aria-hidden="true"/);
        expect(html).toMatch(/<span id="record-dot"[^>]*\shidden\s*>/);
    });

    it('pulses the dot without moving it or its neighbours in the pill', () => {
        const rules = rulesFor('island-record-dot');
        expect(rules.length).toBeGreaterThan(0);
        for (const rule of rules) {
            expect(rule).not.toMatch(/transition:\s*all\b/);
            expect(rule).not.toMatch(MOVES_IN_RULE);
        }
        expectKeyframesStayStill(rules, 'record dot');
    });

    it('stops the dot at a legible end state under reduced motion', () => {
        const reduced = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\n\}/);
        expect(reduced).not.toBeNull();
        const dotRule = reduced[0].match(/\.island-record-dot[^{]*\{[^}]*\}/s);
        expect(dotRule, 'reduced motion must give .island-record-dot an end state').not.toBeNull();
        expect(dotRule[0]).toMatch(/animation:\s*none\s*!important/);
        expect(dotRule[0]).toMatch(/opacity:\s*1\s*!important/);
    });
});
