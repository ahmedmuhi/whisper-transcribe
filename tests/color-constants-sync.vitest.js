/**
 * @fileoverview Ensures JS accent RGB constants stay in sync with CSS --accent values.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { ACCENT_RGB_LIGHT, ACCENT_RGB_DARK, COLORS } from '../js/constants.js';

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16)
    ];
}

function extractCssVar(css, selector, varName) {
    const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockMatch = css.match(new RegExp(selectorEscaped + '\\s*\\{([^}]+)\\}'));
    if (!blockMatch) return null;
    const varMatch = blockMatch[1].match(new RegExp(varName + ':\\s*(#[0-9A-Fa-f]{6})'));
    return varMatch ? varMatch[1] : null;
}

describe('Color constants sync with CSS', () => {
    const css = readFileSync('css/styles.css', 'utf-8');

    it('ACCENT_RGB_LIGHT matches :root --accent', () => {
        const cssAccent = extractCssVar(css, ':root', '--accent');
        expect(cssAccent).not.toBeNull();
        expect(ACCENT_RGB_LIGHT).toEqual(hexToRgb(cssAccent));
    });

    it('ACCENT_RGB_DARK matches .dark-theme --accent', () => {
        const cssAccent = extractCssVar(css, '.dark-theme', '--accent');
        expect(cssAccent).not.toBeNull();
        expect(ACCENT_RGB_DARK).toEqual(hexToRgb(cssAccent));
    });

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
