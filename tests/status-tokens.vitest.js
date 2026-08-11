/**
 * @fileoverview Enforces the WCAG-AA status-text tokens.
 *
 * Phase 6 moved status colours out of JS hex (the old COLORS.ERROR/SUCCESS, now
 * deleted) into dedicated CSS tokens whose contrast is documented in comments.
 * This guard turns those comments into a checked contract: each --status-* token
 * must exist as a hex in both themes, the .status--error/.status--success rules
 * must reference them, and each must clear AA (>= 4.5:1) against both grounds a
 * status line can sit on — so a future edit reverting to an off-AA colour fails
 * here. #status lives in .controls-area, which is transparent inside a
 * .container with no background, so its real ground is body's --bg-primary;
 * toasts sit on --bg-surface. Coastal makes the two identical (#FFFFFF), but
 * every new palette's --bg-primary is darker than its --bg-surface, so the
 * gate has to measure the darker one too or it over-reports headroom.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { contrastRatio, extractCssBlock, extractCssVar } from './helpers/css-tokens.js';

const css = readFileSync('css/styles.css', 'utf-8');

const blockOf = selector => extractCssBlock(css, selector);
const cssVar = (selector, name) => extractCssVar(css, selector, name);

const TOKENS = ['--status-text', '--status-error', '--status-success'];
/**
 * Every palette form carries its own status tokens, so the AA gate covers all
 * eight: Coastal Teal owns :root/.dark-theme, the other three own attribute
 * blocks. A palette that ships an off-AA status colour fails here.
 */
const THEMES = [
    { name: 'Coastal Teal light (:root)', selector: ':root' },
    { name: 'Coastal Teal dark (.dark-theme)', selector: '.dark-theme' },
    { name: 'Organic light', selector: '[data-palette="organic"]' },
    { name: 'Organic dark', selector: '[data-palette="organic"].dark-theme' },
    { name: 'Industry light', selector: '[data-palette="industry"]' },
    { name: 'Industry dark', selector: '[data-palette="industry"].dark-theme' },
    { name: 'Broadsheet light', selector: '[data-palette="broadsheet"]' },
    { name: 'Broadsheet dark', selector: '[data-palette="broadsheet"].dark-theme' }
];

describe('Status text tokens (WCAG-AA)', () => {
    it('defines all three status tokens as hex in every palette form', () => {
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

    it.each(THEMES)('every status token clears AA on both $name grounds', (theme) => {
        for (const ground of ['--bg-surface', '--bg-primary']) {
            const groundColor = cssVar(theme.selector, ground);
            expect(groundColor, `${ground} in ${theme.name}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
            for (const token of TOKENS) {
                const color = cssVar(theme.selector, token);
                const ratio = contrastRatio(color, groundColor);
                expect(ratio, `${token} ${color} on ${ground} ${groundColor}`).toBeGreaterThanOrEqual(4.5);
            }
        }
    });
});
