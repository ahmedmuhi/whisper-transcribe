/**
 * @fileoverview Status-line ownership — a temporary success/error toast must keep
 * its colour for its full duration even when a base `setStatus` races in, then
 * revert to the LATEST base message. Exercises the REAL `showTemporaryStatus` +
 * REAL `setStatus` on one real element (no mocks) — the production interaction
 * that the helper-in-isolation tests and the helper-mocking tests can't see.
 */

import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { showTemporaryStatus } from '../js/status-helper.js';
import { ID } from '../js/constants.js';
import { UI } from '../js/ui.js';

// Invoke the REAL setStatus against a bare context (mirrors status-reset.vitest.js).
const baseSetStatus = (el, msg) => UI.prototype.setStatus.call({ statusElement: el }, msg);

describe('Status line ownership (toast vs base setStatus)', () => {
    let el;

    beforeEach(() => {
        vi.useFakeTimers();
        el = document.createElement('div'); // happy-dom: real classList + style
        el.className = 'status';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps the success colour when a base setStatus races during the toast', () => {
        showTemporaryStatus(el, 'Grabbed to clipboard', 'success', 3000, 'ready');
        expect(el.classList.contains('status--success')).toBe(true);
        expect(el.textContent).toBe('Grabbed to clipboard');

        // A prerequisite / FSM base write lands mid-toast — must NOT clobber it.
        baseSetStatus(el, '🎙️ Click the microphone to start recording');

        expect(el.textContent).toBe('Grabbed to clipboard');
        expect(el.classList.contains('status--success')).toBe(true);
        expect(el._statusTimeout).toBeTruthy();
    });

    it('reverts to the deferred base message (not the original reset) after the toast', () => {
        showTemporaryStatus(el, 'Grabbed to clipboard', 'success', 3000, 'original-reset');
        baseSetStatus(el, 'latest base message');

        vi.advanceTimersByTime(3000);

        expect(el.textContent).toBe('latest base message');
        expect(el.classList.contains('status--success')).toBe(false);
        expect(el.style.color).toBe('');
        expect(el._statusTimeout).toBeNull();
    });

    it('falls back to the reset message when no base write was deferred', () => {
        showTemporaryStatus(el, 'Transcript restored', 'success', 3000, 'idle prompt');
        vi.advanceTimersByTime(3000);
        expect(el.textContent).toBe('idle prompt');
        expect(el.classList.contains('status--success')).toBe(false);
    });

    it('lets a newer error toast override an active success toast', () => {
        showTemporaryStatus(el, 'Grabbed to clipboard', 'success', 3000, 'ready');
        showTemporaryStatus(el, 'Failed to grab text', 'error', 3000, 'ready');

        expect(el.textContent).toBe('Failed to grab text');
        expect(el.classList.contains('status--error')).toBe(true);
        expect(el.classList.contains('status--success')).toBe(false);
    });

    it('a base setStatus with no active toast still writes and strips type classes', () => {
        el.classList.add('status--success'); // stale modifier, no toast armed
        baseSetStatus(el, 'hello');
        expect(el.textContent).toBe('hello');
        expect(el.classList.contains('status--success')).toBe(false);
        expect(el._statusTimeout == null).toBe(true);
    });
});

/**
 * The redesign moves the status line under the recording visualizer strip as its
 * centred mono caption. The colour/ownership rules above only hold if the caption
 * is still the element `UI` binds (`ID.STATUS`) and still carries the `.status`
 * class the AA-safe modifiers hang off — so pin the real node from `index.html`
 * and run the real toast/base interaction against it.
 */
describe('Status caption in the redesigned DOM', () => {
    let caption;
    let root;

    beforeEach(() => {
        const body = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
        root = document.createElement('div');
        root.innerHTML = body.replace(/<script[^>]*><\/script>/gu, '');
        caption = root.querySelector(`#${ID.STATUS}`);
    });

    it('keeps the caption element UI binds, with the base status class', () => {
        expect(ID.STATUS).toBe('status');
        expect(caption).not.toBeNull();
        expect(caption.classList.contains('status')).toBe(true);
        expect(caption.getAttribute('aria-live')).toBe('polite');
    });

    it('sits directly beneath the visualizer strip inside the controls area', () => {
        const strip = root.querySelector('#visualizer-container');
        expect(strip).not.toBeNull();
        expect(caption.previousElementSibling).toBe(strip);
        expect(caption.parentElement.classList.contains('controls-area')).toBe(true);
    });

    it('carries toast modifiers and reverts on the real caption node', () => {
        vi.useFakeTimers();
        try {
            showTemporaryStatus(caption, 'Grabbed to clipboard', 'success', 3000, 'ready');
            expect(caption.textContent).toBe('Grabbed to clipboard');
            expect(caption.classList.contains('status--success')).toBe(true);

            UI.prototype.setStatus.call({ statusElement: caption }, 'latest base message');
            expect(caption.textContent).toBe('Grabbed to clipboard');

            vi.advanceTimersByTime(3000);
            expect(caption.textContent).toBe('latest base message');
            expect(caption.classList.contains('status--success')).toBe(false);
            expect(caption.classList.contains('status')).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});
