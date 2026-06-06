/**
 * @fileoverview Status-line ownership — a temporary success/error toast must keep
 * its colour for its full duration even when a base `setStatus` races in, then
 * revert to the LATEST base message. Exercises the REAL `showTemporaryStatus` +
 * REAL `setStatus` on one real element (no mocks) — the production interaction
 * that the helper-in-isolation tests and the helper-mocking tests can't see.
 */

import { vi } from 'vitest';
import { showTemporaryStatus } from '../js/status-helper.js';
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
