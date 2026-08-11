import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const css = readFileSync('css/styles.css', 'utf-8');

/**
 * Extracts the declaration body of the first rule whose selector list matches
 * `selector` exactly (whitespace-normalised), optionally scoped to the first
 * at-rule block opened by `within` (e.g. a media query prelude).
 */
function ruleBody(selector, within = null) {
    const source = within === null ? css : scopeOf(within);
    const pattern = new RegExp(
        `(?:^|[};])\\s*${escapeSelector(selector)}\\s*\\{([^}]*)\\}`,
        'm'
    );
    const match = source.match(pattern);
    return match === null ? null : match[1];
}

/** Text from an at-rule prelude to the end of its block (brace-balanced). */
function scopeOf(prelude) {
    const start = css.indexOf(prelude);
    if (start === -1) {
        return '';
    }
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i += 1) {
        if (css[i] === '{') {
            depth += 1;
        } else if (css[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return css.slice(start, i);
            }
        }
    }
    return css.slice(start);
}

function escapeSelector(selector) {
    return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

const MOBILE = '@media (max-width: 600px)';
const NARROW = '@media (max-width: 760px)';
const REDUCED = '@media (prefers-reduced-motion: reduce)';

describe('Dynamic Island mobile layout CSS', () => {
    it('lets active recording controls wrap instead of clipping on phone widths', () => {
        const body = ruleBody('.control-cluster.island-recording', MOBILE);
        expect(body).toMatch(/flex-wrap:\s*wrap;/);
        expect(body).toMatch(/overflow:\s*visible;/);
    });

    it('moves the recording timer onto its own mobile row', () => {
        const body = ruleBody('.control-cluster.island-recording .island-timer', MOBILE);
        expect(body).toMatch(/flex:\s*0 0 100%;/);
    });
});

describe('Floating control pill CSS', () => {
    it('strips the card chrome from the controls area so the pill floats', () => {
        const body = ruleBody('.controls-area');
        expect(body).toMatch(/background:\s*transparent;/);
        expect(body).toMatch(/border:\s*0;/);
        expect(body).toMatch(/box-shadow:\s*none;/);
        expect(body).toMatch(/padding:\s*0;/);
    });

    it('draws the idle pill as an inset capsule with the default border', () => {
        const base = ruleBody('.control-cluster');
        expect(base).toMatch(/border-radius:\s*var\(--radius-full\);/);
        expect(base).toMatch(/background:\s*var\(--bg-inset\);/);
        expect(base).toMatch(/border:\s*[\d.]+px solid var\(--border-color\);/);

        const idle = ruleBody('.control-cluster.island-idle');
        expect(idle).toMatch(/background:\s*var\(--bg-inset\);/);
        expect(idle).toMatch(/border-color:\s*var\(--border-color\);/);
    });

    it('marks the recording pill with the rust border', () => {
        const body = ruleBody('.control-cluster.island-recording');
        expect(body).toMatch(/border-color:\s*var\(--accent-warm\);/);
    });

    it('renders the record dot as an 8px pulsing recording-token circle', () => {
        const body = ruleBody('.island-record-dot');
        expect(body).toMatch(/width:\s*8px;/);
        expect(body).toMatch(/height:\s*8px;/);
        expect(body).toMatch(/border-radius:\s*50%;/);
        expect(body).toMatch(/background:\s*var\(--recording\);/);
        expect(body).toMatch(/animation:\s*pulseDot 1\.2s[^;]*infinite;/);
        expect(css).toMatch(/@keyframes\s+pulseDot\s*\{/);
    });

    it('quiets and stops the dot while paused', () => {
        const body = ruleBody('.control-cluster.island-paused .island-record-dot');
        expect(body).toMatch(/background:\s*var\(--text-muted\);/);
        expect(body).toMatch(/animation:\s*none;/);
    });

    it('keeps every button at a 44px hit target', () => {
        const body = ruleBody('button,\n.btn');
        expect(body).toMatch(/min-width:\s*44px;/);
        expect(body).toMatch(/min-height:\s*44px;/);
    });

    it('gives the 34px gear button a 44px pointer target instead of scaling it', () => {
        const gear = ruleBody('#quick-settings-button');
        expect(gear).toMatch(/width:\s*34px;/);
        expect(gear).toMatch(/height:\s*34px;/);

        const target = ruleBody('#quick-settings-button::before');
        expect(target).toMatch(/width:\s*44px;/);
        expect(target).toMatch(/height:\s*44px;/);
    });
});

describe('Recording visualizer strip CSS', () => {
    it('hides the strip until renderControls marks it active', () => {
        expect(ruleBody('.visualizer-container')).toMatch(/display:\s*none;/);
        expect(ruleBody('.visualizer-container.viz-active')).toMatch(/display:\s*block;/);
    });

    it('styles the visible strip as a borderless inset panel', () => {
        const active = ruleBody('.visualizer-container.viz-active');
        expect(active).toMatch(/height:\s*1\d\dpx;/);

        const base = ruleBody('.visualizer-container');
        expect(base).toMatch(/background-color:\s*var\(--(visualizer-bg|bg-inset)\);/);
        expect(base).toMatch(/border-radius:\s*var\(--radius-md\);/);
        expect(base).toMatch(/border:\s*0;/);
        expect(base).toMatch(/padding:\s*8px;/);
        // The strip token must resolve to the inset cream on both surfaces.
        expect(css.match(/--visualizer-bg:\s*var\(--bg-inset\);/g)).toHaveLength(2);
    });

    it('shrinks the strip at phone widths without reintroducing chrome', () => {
        expect(ruleBody('.visualizer-container.viz-active', MOBILE)).toMatch(/height:\s*\d+px;/);
    });

    it('keeps the status line as the centred mono caption beneath the strip', () => {
        const body = ruleBody('.status');
        expect(body).toMatch(/font-family:\s*var\(--font-mono\);/);
        expect(body).toMatch(/text-align:\s*center;/);
    });
});

describe('Settings modal and popover responsive layout CSS', () => {
    it('sizes the desktop modal to the contract box with a sidebar', () => {
        const modal = ruleBody('.settings-modal');
        expect(modal).toMatch(/width:\s*min\(1000px,\s*calc\(100vw - 48px\)\);/);
        expect(modal).toMatch(/height:\s*min\(660px,\s*calc\(100vh - 48px\)\);/);

        expect(ruleBody('.settings-modal::backdrop')).toMatch(/background:\s*var\(--modal-backdrop\);/);

        const sidebar = ruleBody('.settings-sidebar');
        expect(sidebar).toMatch(/width:\s*232px;/);
        expect(sidebar).toMatch(/background:\s*var\(--bg-inset\);/);
    });

    it('goes full-screen and turns the sidebar into a top strip on narrow viewports', () => {
        const modal = ruleBody('.settings-modal', NARROW);
        expect(modal).toMatch(/width:\s*100vw;/);
        expect(modal).toMatch(/height:\s*100dvh;/);
        expect(modal).toMatch(/flex-direction:\s*column;/);

        const sidebar = ruleBody('.settings-sidebar', NARROW);
        expect(sidebar).toMatch(/width:\s*100%;/);
        expect(sidebar).toMatch(/border-right:\s*0;/);

        const nav = ruleBody('.settings-nav', NARROW);
        expect(nav).toMatch(/flex-direction:\s*row;/);
        expect(nav).toMatch(/overflow-x:\s*auto;/);
    });

    it('stacks each settings row so the control sits under its title', () => {
        const row = ruleBody('.settings-row', NARROW);
        expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
        expect(ruleBody('.settings-row', null)).toMatch(/grid-template-columns:/);
    });

    it('pins the popover to the right margin without overflowing the viewport', () => {
        const popover = ruleBody('.quick-settings');
        expect(popover).toMatch(/width:\s*300px;/);
        expect(popover).toMatch(/border-radius:\s*var\(--radius-md\);/);
        expect(popover).toMatch(/box-shadow:\s*var\(--shadow-lg\);/);

        const narrow = ruleBody('.quick-settings', NARROW);
        expect(narrow).toMatch(/right:\s*1rem;/);
        expect(narrow).toMatch(/max-width:\s*calc\(100vw - 32px\);/);
    });

    it('keeps a visible focus ring on the popover and modal controls', () => {
        expect(css).toMatch(/#quick-settings-button:focus-visible[\s\S]{0,600}?box-shadow:\s*var\(--focus-ring\)/);
        expect(css).toMatch(/#settings-close:focus-visible|\.settings-nav button:focus-visible/);
        // The palette cards share the one focus treatment rather than adding a ring.
        expect(css).toMatch(/\.palette-card:focus-visible[\s\S]{0,200}?box-shadow:\s*var\(--focus-ring\)/);
    });
});

describe('Reduced-motion end states', () => {
    const reduced = scopeOf(REDUCED);

    it('freezes the record dot at full opacity', () => {
        expect(reduced).toMatch(/\.island-record-dot[^{]*\{[^}]*opacity:\s*1\s*!important;[^}]*animation:\s*none\s*!important;/);
    });

    it('lands the popover and the visualizer strip in their final state immediately', () => {
        expect(reduced).toMatch(/\.quick-settings[^{]*\{[^}]*animation:\s*none\s*!important;/);
        expect(reduced).toMatch(/\.quick-settings[^{]*\{[^}]*opacity:\s*1\s*!important;/);
        expect(reduced).toMatch(/\.quick-settings[^{]*\{[^}]*transform:\s*none\s*!important;/);
        expect(reduced).toMatch(/\.visualizer-container\.viz-active/);
    });

    it('removes the transition from the switch, segmented control, gear, and nav', () => {
        expect(reduced).toMatch(/input\[type="checkbox"\]\[role="switch"\][\s\S]*?\{[^}]*transition:\s*none\s*!important;/);
        expect(reduced).toMatch(/\.theme-segment label[\s\S]{0,200}?transition:\s*none\s*!important;/);
        expect(reduced).toMatch(/#quick-settings-button[\s\S]{0,200}?transition:\s*none\s*!important;/);
    });

    it('covers every new keyframe animation with an end state', () => {
        const declared = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
        for (const name of ['pulseDot', 'popoverSlideIn', 'vizSlideIn']) {
            expect(declared).toContain(name);
        }
        // Each new animation's owning selector must appear in the reduced-motion block.
        for (const selector of ['.island-record-dot', '.quick-settings', '.viz-active']) {
            expect(reduced).toContain(selector);
        }
    });
});

describe('Removed legacy layout CSS', () => {
    it('contains no user-menu, save-button, or old sidebar selectors', () => {
        expect(css).not.toMatch(/user-menu/);
        expect(css).not.toMatch(/save-button/);
        expect(css).not.toMatch(/side-panel|sidebar-pinned|panel-backdrop|panel-toggle/);
    });
});

describe('Selected Audio responsive layout CSS', () => {
    it('bounds the review workspace and stacks actions at phone widths', () => {
        expect(css).toMatch(/\.selected-audio-workspace\s*\{[^}]*width:\s*min\([^;]*100%/s);
        expect(ruleBody('.selected-audio-actions', MOBILE)).toMatch(/width:\s*100%/);
    });

    it('collapses Selected Audio progress animation for reduced motion', () => {
        expect(scopeOf(REDUCED)).toMatch(/\.selected-audio-dot[\s\S]{0,200}?animation:\s*none\s*!important/);
    });
});
