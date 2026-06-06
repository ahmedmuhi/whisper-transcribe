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
