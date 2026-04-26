import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Mic button visual effects', () => {
    const html = readFileSync('index.html', 'utf-8');
    const css = readFileSync('css/styles.css', 'utf-8');

    it('does not render radiating decorative layers around the mic button', () => {
        expect(html).not.toContain('mic-glow');
        expect(html).not.toContain('mic-ring');
    });

    it('does not define expanding glow or ring animations for the mic button', () => {
        expect(css).not.toContain('glowPulse');
        expect(css).not.toContain('ringExpand');
    });
});