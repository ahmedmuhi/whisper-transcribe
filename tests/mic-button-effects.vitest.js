import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Mic button visual effects', () => {
    const html = readFileSync('index.html', 'utf-8');
    const css = readFileSync('css/styles.css', 'utf-8');

    const getCssBlock = (selector) => {
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's'));

        expect(match, `Expected CSS block for ${selector}`).not.toBeNull();
        return match[0];
    };

    it('does not render radiating decorative layers around the mic button', () => {
        expect(html).not.toContain('mic-glow');
        expect(html).not.toContain('mic-ring');
    });

    it('does not define expanding glow or ring animations for the mic button', () => {
        expect(css).not.toContain('glowPulse');
        expect(css).not.toContain('ringExpand');
    });

    it('keeps mic button hover feedback from expanding the hit target', () => {
        const micButtonBlock = getCssBlock('.mic-button');
        const micButtonHoverBlock = getCssBlock('.mic-button:hover');

        expect(micButtonBlock).not.toMatch(/transition:\s*all\b/);
        expect(micButtonHoverBlock).not.toContain('transform');
    });

    it('keeps recording feedback from animating the mic button hit target', () => {
        const recordingBlock = getCssBlock('.mic-button.recording');

        expect(recordingBlock).not.toContain('animation');
        expect(css).not.toContain('@keyframes recordPulse');
    });
});
