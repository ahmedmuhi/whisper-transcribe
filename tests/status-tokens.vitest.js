/**
 * @fileoverview Enforces the WCAG-AA status-text tokens.
 *
 * Phase 6 moved status colours out of JS hex (the old COLORS.ERROR/SUCCESS, now
 * deleted) into dedicated CSS tokens whose contrast is documented in comments.
 * This guard turns those comments into a checked contract: each --status-* token
 * must exist as a hex in both themes, the .status--error/.status--success rules
 * must reference them, and each must clear AA (>= 4.5:1) against its theme
 * surface — so a future edit reverting to an off-AA colour fails here.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { extractCssBlock, extractCssVar } from './helpers/css-tokens.js';

const css = readFileSync('css/styles.css', 'utf-8');

const blockOf = selector => extractCssBlock(css, selector);
const cssVar = (selector, name) => extractCssVar(css, selector, name);

function relativeLuminance(hex) {
    const channels = hex.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16) / 255);
    const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a, b) {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TOKENS = ['--status-text', '--status-error', '--status-success'];
const THEMES = [
    { name: 'light (:root)', selector: ':root' },
    { name: 'dark (.dark-theme)', selector: '.dark-theme' }
];

describe('Status text tokens (WCAG-AA)', () => {
    it('defines all three status tokens as hex in both themes', () => {
        for (const theme of THEMES) {
            for (const token of TOKENS) {
                expect(cssVar(theme.selector, token), `${token} in ${theme.name}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
            }
        }
    });

    it('maps the status modifier classes to the tokens (no inline hex)', () => {
        expect(blockOf('.status--error')).toMatch(/color:\s*var\(--status-error\)/);
        expect(blockOf('.status--success')).toMatch(/color:\s*var\(--status-success\)/);
    });

    it.each(THEMES)('every status token clears AA on the $name surface', (theme) => {
        const surface = cssVar(theme.selector, '--bg-surface');
        expect(surface, `--bg-surface in ${theme.name}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        for (const token of TOKENS) {
            const color = cssVar(theme.selector, token);
            const ratio = contrastRatio(color, surface);
            expect(ratio, `${token} ${color} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
    });
});
