/**
 * @fileoverview Ensures JS color constants stay in sync with CSS custom properties.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { COLORS } from '../js/constants.js';

function extractCssVar(css, selector, varName) {
    const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockMatch = css.match(new RegExp(selectorEscaped + '\\s*\\{([^}]+)\\}'));
    if (!blockMatch) return null;
    const varMatch = blockMatch[1].match(new RegExp(varName + ':\\s*(#[0-9A-Fa-f]{6})'));
    return varMatch ? varMatch[1] : null;
}

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
