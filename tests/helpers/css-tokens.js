/**
 * @fileoverview Shared CSS-parsing helpers for token/var assertions in tests.
 * Keeps the (deliberately simple) selector-block regex in one place so the
 * colour-sync and status-token guards can't drift apart.
 */

/**
 * Returns the body of the first `selector { ... }` block in `css`, or null.
 * @param {string} css
 * @param {string} selector
 * @returns {string|null}
 */
export function extractCssBlock(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
    return m ? m[1] : null;
}

/**
 * Returns the 6-digit hex value of a custom property within a selector, or null.
 * @param {string} css
 * @param {string} selector
 * @param {string} varName - e.g. '--status-success'
 * @returns {string|null}
 */
export function extractCssVar(css, selector, varName) {
    const block = extractCssBlock(css, selector);
    if (!block) return null;
    const m = block.match(new RegExp(varName + ':\\s*(#[0-9A-Fa-f]{6})'));
    return m ? m[1] : null;
}

/**
 * WCAG relative luminance of a 6-digit hex colour.
 * @param {string} hex - e.g. '#245F73'
 * @returns {number}
 */
export function relativeLuminance(hex) {
    const channels = hex.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16) / 255);
    const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * WCAG contrast ratio between two 6-digit hex colours.
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 to 21.
 */
export function contrastRatio(a, b) {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
