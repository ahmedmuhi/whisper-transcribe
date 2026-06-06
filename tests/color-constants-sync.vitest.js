/**
 * @fileoverview Ensures JS color constants stay in sync with CSS custom properties.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { COLORS } from '../js/constants.js';
import { extractCssVar } from './helpers/css-tokens.js';

describe('Color constants sync with CSS', () => {
    const css = readFileSync('css/styles.css', 'utf-8');

    it('COLORS.CANVAS_DARK_BG matches .dark-theme --bg-primary', () => {
        const cssBg = extractCssVar(css, '.dark-theme', '--bg-primary');
        expect(cssBg).not.toBeNull();
        expect(COLORS.CANVAS_DARK_BG).toBe(cssBg);
    });

    it('COLORS.CANVAS_LIGHT_BG matches :root --bg-primary', () => {
        const cssBg = extractCssVar(css, ':root', '--bg-primary');
        expect(cssBg).not.toBeNull();
        expect(COLORS.CANVAS_LIGHT_BG).toBe(cssBg);
    });
});
