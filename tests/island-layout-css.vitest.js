import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const css = readFileSync('css/styles.css', 'utf-8');

describe('Dynamic Island mobile layout CSS', () => {
    it('lets active recording controls wrap instead of clipping on phone widths', () => {
        expect(css).toMatch(/@media\s*\(max-width:\s*600px\)[\s\S]*\.control-cluster\.island-recording\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/);
    });

    it('moves the recording timer onto its own mobile row', () => {
        expect(css).toMatch(/@media\s*\(max-width:\s*600px\)[\s\S]*\.control-cluster\.island-recording \.island-timer\s*\{[^}]*flex:\s*0 0 100%;/);
    });
});

describe('User menu responsive layout CSS', () => {
    it('places desktop detail beside the root panel', () => {
        expect(css).toMatch(/\.user-menu-surface\s*\{[^}]*display:\s*flex;[^}]*gap:/s);
        expect(css).toMatch(/\.user-menu-panel\s*\{[^}]*width:\s*min\(340px,/s);
    });

    it('fits the surface to a narrow viewport and replaces root with detail', () => {
        expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*\.user-menu-surface\s*\{[^}]*width:\s*calc\(100vw - 1\.5rem\);/);
        expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*\.user-menu-panel\s*\{[^}]*width:\s*100%;/);
    });

    it('includes menu state in the reduced-motion end-state rule', () => {
        expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.user-menu-surface[\s\S]*transition:\s*none\s*!important;/);
    });

    it('contains no removed sidebar selectors', () => {
        expect(css).not.toMatch(/side-panel|sidebar-pinned|panel-backdrop|panel-toggle/);
    });
});
