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
