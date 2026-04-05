/**
 * @fileoverview Focused regression tests for sidebar hover/pin interactions.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let Settings;

beforeAll(async () => {
    ({ Settings } = await import('../js/settings.js'));
});

function createMockSidePanel(initialClasses = []) {
    const classes = new Set(initialClasses);
    const listeners = new Map();

    return {
        style: { transform: '' },
        classList: {
            add: (className) => classes.add(className),
            remove: (...classNames) => classNames.forEach((className) => classes.delete(className)),
            contains: (className) => classes.has(className)
        },
        addEventListener: (eventName, handler) => {
            listeners.set(eventName, handler);
        },
        removeEventListener: (eventName, handler) => {
            if (listeners.get(eventName) === handler) {
                listeners.delete(eventName);
            }
        },
        dispatchTransitionEnd: (propertyName) => {
            const handler = listeners.get('transitionend');
            if (handler) {
                handler({ propertyName });
            }
        },
        hasTransitionEndListener: () => listeners.has('transitionend')
    };
}

describe('Settings sidebar behavior regressions', () => {
    let settings;

    beforeEach(() => {
        vi.clearAllMocks();
        settings = new Settings();
        vi.spyOn(settings, '_populateDeviceListIfStale').mockImplementation(() => {});
    });

    it('keeps transition listener active after non-transform transitionend', () => {
        const sidePanel = createMockSidePanel(['hover-preview']);
        settings.sidePanel = sidePanel;

        settings._hideHoverPreview();

        expect(settings._hoverSlidingOut).toBe(true);
        expect(sidePanel.style.transform).toBe('translateX(-100%)');
        expect(sidePanel.hasTransitionEndListener()).toBe(true);

        sidePanel.dispatchTransitionEnd('box-shadow');

        expect(settings._hoverSlidingOut).toBe(true);
        expect(sidePanel.classList.contains('hover-preview')).toBe(true);
        expect(sidePanel.hasTransitionEndListener()).toBe(true);

        sidePanel.dispatchTransitionEnd('transform');

        expect(settings._hoverSlidingOut).toBe(false);
        expect(sidePanel.classList.contains('hover-preview')).toBe(false);
        expect(sidePanel.style.transform).toBe('');
        expect(sidePanel.hasTransitionEndListener()).toBe(false);
    });

    it('cancels in-progress slide-out when hover preview re-enters', () => {
        const sidePanel = createMockSidePanel();
        sidePanel.style.transform = 'translateX(-100%)';
        settings.sidePanel = sidePanel;
        settings._hoverSlidingOut = true;

        settings._showHoverPreview();

        expect(settings._hoverSlidingOut).toBe(false);
        expect(sidePanel.style.transform).toBe('');
        expect(sidePanel.classList.contains('hover-preview')).toBe(true);
    });

    it('removes hover transition listener when pinning during slide-out', () => {
        const sidePanel = createMockSidePanel(['hover-preview']);
        settings.sidePanel = sidePanel;

        settings._hideHoverPreview();

        expect(settings._hoverSlidingOut).toBe(true);
        expect(sidePanel.hasTransitionEndListener()).toBe(true);
        expect(typeof settings._onHoverTransitionEnd).toBe('function');

        settings.pinSidebar(false);

        expect(settings._hoverSlidingOut).toBe(false);
        expect(settings._onHoverTransitionEnd).toBe(null);
        expect(sidePanel.hasTransitionEndListener()).toBe(false);
        expect(sidePanel.style.transform).toBe('');
        expect(sidePanel.classList.contains('pinned')).toBe(true);
        expect(sidePanel.classList.contains('hover-preview')).toBe(false);

        // No-op: listener was removed by pinSidebar cleanup.
        sidePanel.dispatchTransitionEnd('transform');
        expect(sidePanel.classList.contains('pinned')).toBe(true);
    });
});
