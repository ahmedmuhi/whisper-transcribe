/**
 * @fileoverview Guards the four selectable colour palettes.
 *
 * Three things can silently break here. A light `[data-palette]` block has the
 * same specificity as `.dark-theme` and comes later in the file, so any token a
 * light block declares and its dark block omits leaks the light value into dark
 * mode — hence the property-set equality check. The handoff's hexes are final,
 * so they are pinned literally. And Coastal Teal must not move at all, because
 * it is what every existing user already sees.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_THEME_PALETTE,
    ID,
    STORAGE_KEYS,
    THEME_PALETTES
} from '../js/constants.js';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { extractCssBlock } from './helpers/css-tokens.js';

const css = readFileSync('css/styles.css', 'utf-8');
const indexSource = readFileSync('index.html', 'utf8');

/** The 25 tokens every palette block declares, in the order :root uses. */
const PALETTE_TOKENS = [
    '--bg-primary', '--bg-surface', '--bg-inset', '--border-color', '--border-subtle',
    '--text-primary', '--text-secondary', '--text-muted', '--accent', '--accent-warm',
    '--text-on-accent', '--text-on-warm', '--accent-glow', '--accent-subtle',
    '--recording', '--recording-glow', '--status-text', '--status-error',
    '--status-success', '--shadow-sm', '--shadow-md', '--shadow-lg',
    '--mic-hover-bg', '--modal-backdrop', '--visualizer-bar'
];

/** Tokens that follow a palette through var() or are theme-neutral. */
const NEVER_REDECLARED = [
    '--mic-bg', '--visualizer-bg', '--focus-ring', '--noise-opacity', '--icon-shadow'
];

const NEW_PALETTES = ['organic', 'industry', 'broadsheet'];

const selectorFor = (palette, form) => (form === 'light'
    ? `[data-palette="${palette}"]`
    : `[data-palette="${palette}"].dark-theme`);

/**
 * Parses a selector's declarations into a name → value map.
 *
 * @param {string} selector CSS selector whose first block is read.
 * @returns {Map<string, string>} Declared custom properties.
 */
function declarationsOf(selector) {
    const block = extractCssBlock(css, selector);
    const declarations = new Map();
    if (!block) return declarations;
    for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)) {
        declarations.set(match[1], match[2].trim());
    }
    return declarations;
}

/** The twelve roles the handoff names, verbatim, per form. */
const HANDOFF = {
    'organic light': {
        '--bg-primary': '#f5ead8', '--bg-surface': '#fdf8f0', '--bg-inset': '#efe3ce',
        '--border-color': '#dcd3c4', '--text-primary': '#2e2b25',
        '--text-secondary': '#645c50', '--text-muted': '#a19786', '--accent': '#b2622d',
        '--text-on-accent': '#fff8f2', '--accent-warm': '#56633f',
        '--text-on-warm': '#f0fae1', '--recording': '#b93b2b'
    },
    'organic dark': {
        '--bg-primary': '#1c1917', '--bg-surface': '#282320', '--bg-inset': '#332c26',
        '--border-color': '#474238', '--text-primary': '#eee7db',
        '--text-secondary': '#dcd3c4', '--text-muted': '#a19786', '--accent': '#d67f48',
        '--text-on-accent': '#402310', '--accent-warm': '#aebf92',
        '--text-on-warm': '#272e1b', '--recording': '#e5766a'
    },
    'industry light': {
        '--bg-primary': '#e9e9ea', '--bg-surface': '#f5f5f8', '--bg-inset': '#e7e7ea',
        '--border-color': '#d4d4d7', '--text-primary': '#1d1f20',
        '--text-secondary': '#5d5d60', '--text-muted': '#98989b', '--accent': '#416180',
        '--text-on-accent': '#f5f5f8', '--accent-warm': '#627d98',
        '--text-on-warm': '#f5f5f8', '--recording': '#DB2C23'
    },
    'industry dark': {
        '--bg-primary': '#1d1f20', '--bg-surface': '#2b2b2d', '--bg-inset': '#424244',
        '--border-color': '#5d5d60', '--text-primary': '#f5f5f8',
        '--text-secondary': '#d4d4d7', '--text-muted': '#98989b', '--accent': '#94bce3',
        '--text-on-accent': '#1d2d3d', '--accent-warm': '#9ebbd8',
        '--text-on-warm': '#1f2d3a', '--recording': '#e5766a'
    },
    'broadsheet light': {
        '--bg-primary': '#eae9e9', '--bg-surface': '#f8f4f4', '--bg-inset': '#eae7e7',
        '--border-color': '#d7d3d3', '--text-primary': '#201e1d',
        '--text-secondary': '#605d5d', '--text-muted': '#9b9797', '--accent': '#aa0b56',
        '--text-on-accent': '#fff1f4', '--accent-warm': '#006786',
        '--text-on-warm': '#e9f8ff', '--recording': '#d6006c'
    },
    'broadsheet dark': {
        '--bg-primary': '#201e1d', '--bg-surface': '#2d2b2b', '--bg-inset': '#444141',
        '--border-color': '#605d5d', '--text-primary': '#f8f4f4',
        '--text-secondary': '#d7d3d3', '--text-muted': '#9b9797', '--accent': '#38a6cf',
        '--text-on-accent': '#0a303e', '--accent-warm': '#ff458e',
        '--text-on-warm': '#4b1528', '--recording': '#ff458e'
    }
};

/** Coastal Teal as it shipped. A diff here means the default scheme moved. */
const COASTAL = {
    ':root': {
        '--bg-primary': '#FFFFFF', '--bg-surface': '#FFFFFF', '--bg-inset': '#FAF7F2',
        '--border-color': '#BBBDBC', '--text-primary': '#245F73',
        '--text-secondary': '#5C5E5D', '--text-muted': '#98989A', '--accent': '#245F73',
        '--text-on-accent': '#FFFFFF', '--accent-warm': '#733E24',
        '--text-on-warm': '#FFFFFF', '--recording': '#DB2C23'
    },
    '.dark-theme': {
        '--bg-primary': '#0E1B21', '--bg-surface': '#14252C', '--bg-inset': '#1B313A',
        '--border-color': '#2E4750', '--text-primary': '#CFE0E7',
        '--text-secondary': '#B9C6CB', '--text-muted': '#6C8189', '--accent': '#3E7A93',
        '--accent-warm': '#C97F58', '--text-on-warm': '#10222A', '--recording': '#DB2C23'
    }
};

describe('Palette CSS token blocks', () => {
    it.each(NEW_PALETTES)('%s declares the full token list in both forms', (palette) => {
        for (const form of ['light', 'dark']) {
            const declared = declarationsOf(selectorFor(palette, form));
            expect([...declared.keys()].sort()).toEqual([...PALETTE_TOKENS].sort());
        }
    });

    it.each(NEW_PALETTES)('%s re-declares in dark every token its light form sets', (palette) => {
        const light = declarationsOf(selectorFor(palette, 'light'));
        const dark = declarationsOf(selectorFor(palette, 'dark'));

        expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
    });

    it.each(NEW_PALETTES)('%s redeclares no var()-based or theme-neutral token', (palette) => {
        for (const form of ['light', 'dark']) {
            const declared = declarationsOf(selectorFor(palette, form));
            for (const token of NEVER_REDECLARED) {
                expect(declared.has(token), `${token} in ${palette} ${form}`).toBe(false);
            }
        }
    });

    it('gives Coastal Teal no attribute block, so it falls through to :root', () => {
        expect(css).not.toContain('[data-palette="coastal"]');
    });

    it.each(Object.entries(HANDOFF))('%s carries the handoff hexes verbatim', (form, roles) => {
        const [palette, variant] = form.split(' ');
        const declared = declarationsOf(selectorFor(palette, variant));

        for (const [token, value] of Object.entries(roles)) {
            expect(declared.get(token), `${token} in ${form}`).toBe(value);
        }
    });

    it.each(Object.entries(COASTAL))('%s still carries the shipped Coastal values', (selector, roles) => {
        const declared = declarationsOf(selector);

        for (const [token, value] of Object.entries(roles)) {
            expect(declared.get(token), `${token} in ${selector}`).toBe(value);
        }
    });

    it('keeps the Coastal visualizer bar on its historical hexes', () => {
        expect(css).toMatch(/:root\s*\{\s*--visualizer-bar:\s*#245F73;\s*\}/);
        expect(css).toMatch(/\.dark-theme\s*\{\s*--visualizer-bar:\s*#8FBACB;\s*\}/);
    });
});

describe('Palette settings row', () => {
    let Settings;
    let settings;

    function installProductionBody() {
        const body = indexSource.match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
        document.body.innerHTML = body.replace(/<script[^>]*src=[^>]*><\/script>/gu, '');
        document.getElementById = (id) => document.querySelector(`#${id}`);
    }

    function cards() {
        return Array.from(document.querySelectorAll('[data-palette-value]'));
    }

    function card(palette) {
        return document.querySelector(`[data-palette-value="${palette}"]`);
    }

    function checkedPalettes() {
        return cards()
            .filter((button) => button.getAttribute('aria-checked') === 'true')
            .map((button) => button.dataset.paletteValue);
    }

    function press(key) {
        document.activeElement.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        );
    }

    function activePalette() {
        return document.documentElement.getAttribute('data-palette');
    }

    beforeEach(async () => {
        vi.restoreAllMocks();
        eventBus.clear();
        eventBus.setHistoryEnabled(false);
        localStorage.clear();
        document.documentElement.removeAttribute('data-palette');
        document.documentElement.classList.remove('dark-theme');
        installProductionBody();
        ({ Settings } = await import('../js/settings.js'));
    });

    afterEach(() => {
        settings?.destroy();
        settings = null;
        eventBus.clear();
    });

    it('renders one radiogroup with a radio per palette', () => {
        settings = new Settings();

        const grid = document.getElementById(ID.PALETTE_GRID);
        expect(grid.getAttribute('role')).toBe('radiogroup');
        expect(grid.getAttribute('aria-labelledby')).toBe(ID.PALETTE_LABEL);
        expect(cards().map((button) => button.dataset.paletteValue)).toEqual([...THEME_PALETTES]);
        expect(cards().every((button) => button.getAttribute('role') === 'radio')).toBe(true);
        expect(checkedPalettes()).toEqual([DEFAULT_THEME_PALETTE]);
    });

    it('defaults to Coastal Teal and writes nothing when no palette is stored', () => {
        settings = new Settings();

        expect(activePalette()).toBe(DEFAULT_THEME_PALETTE);
        expect(localStorage.getItem(STORAGE_KEYS.THEME_PALETTE)).toBeNull();
    });

    it.each([
        ['nonsense', DEFAULT_THEME_PALETTE],
        ['', DEFAULT_THEME_PALETTE],
        ['organic', 'organic']
    ])('resolves a stored value of %j to %s', (stored, expected) => {
        localStorage.setItem(STORAGE_KEYS.THEME_PALETTE, stored);
        settings = new Settings();

        expect(activePalette()).toBe(expected);
        expect(checkedPalettes()).toEqual([expected]);
    });

    it('keeps a stored theme mode and resolves the missing palette to the default', () => {
        localStorage.setItem(STORAGE_KEYS.THEME_MODE, 'dark');
        settings = new Settings();

        expect(activePalette()).toBe(DEFAULT_THEME_PALETTE);
        expect(localStorage.getItem(STORAGE_KEYS.THEME_MODE)).toBe('dark');
    });

    it('applies and persists a click without a save step, touching no other key', () => {
        settings = new Settings();
        const themeChanged = vi.fn();
        eventBus.on(APP_EVENTS.UI_THEME_CHANGED, themeChanged);

        card('industry').click();

        expect(activePalette()).toBe('industry');
        expect(localStorage.getItem(STORAGE_KEYS.THEME_PALETTE)).toBe('industry');
        expect(checkedPalettes()).toEqual(['industry']);
        expect(themeChanged).toHaveBeenCalledWith({ mode: 'auto', palette: 'industry' });
        expect(Object.keys(localStorage)).toEqual([STORAGE_KEYS.THEME_PALETTE]);
    });

    it('leaves the theme mode alone, and a mode change leaves the palette alone', () => {
        settings = new Settings();

        card('organic').click();
        expect(localStorage.getItem(STORAGE_KEYS.THEME_MODE)).toBeNull();

        const dark = document.querySelector('input[name="theme-mode"][value="dark"]');
        dark.checked = true;
        dark.dispatchEvent(new Event('change', { bubbles: true }));

        expect(localStorage.getItem(STORAGE_KEYS.THEME_MODE)).toBe('dark');
        expect(activePalette()).toBe('organic');
        expect(localStorage.getItem(STORAGE_KEYS.THEME_PALETTE)).toBe('organic');
    });

    it('moves the roving tabindex with the selection', () => {
        settings = new Settings();

        card('broadsheet').click();

        expect(card('broadsheet').tabIndex).toBe(0);
        expect(cards().filter((button) => button.tabIndex === 0)).toHaveLength(1);
        expect(card('coastal').tabIndex).toBe(-1);
    });

    it.each([
        ['ArrowRight', 'coastal', 'organic'],
        ['ArrowDown', 'coastal', 'organic'],
        ['ArrowLeft', 'coastal', 'broadsheet'],
        ['ArrowUp', 'coastal', 'broadsheet'],
        ['ArrowRight', 'broadsheet', 'coastal'],
        ['Home', 'industry', 'coastal'],
        ['End', 'coastal', 'broadsheet']
    ])('%s from %s selects %s and takes focus with it', (key, from, expected) => {
        settings = new Settings();
        card(from).click();
        card(from).focus();

        press(key);

        expect(checkedPalettes()).toEqual([expected]);
        expect(activePalette()).toBe(expected);
        expect(document.activeElement).toBe(card(expected));
    });

    it.each([' ', 'Enter'])('%j selects the focused card', (key) => {
        settings = new Settings();
        card('organic').focus();

        press(key);

        expect(checkedPalettes()).toEqual(['organic']);
        expect(localStorage.getItem(STORAGE_KEYS.THEME_PALETTE)).toBe('organic');
    });

    it('re-applies a palette chosen in another tab', () => {
        settings = new Settings();

        localStorage.setItem(STORAGE_KEYS.THEME_PALETTE, 'broadsheet');
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.THEME_PALETTE }));

        expect(activePalette()).toBe('broadsheet');
        expect(checkedPalettes()).toEqual(['broadsheet']);
    });

    it('keeps the palette out of the quick-settings popover', () => {
        settings = new Settings();

        const popover = document.getElementById(ID.QUICK_SETTINGS);
        expect(popover.querySelector('[data-palette-value]')).toBeNull();
        expect(popover.querySelector(`#${ID.PALETTE_GRID}`)).toBeNull();
        expect(popover.textContent).not.toMatch(/palette/iu);
    });
});
