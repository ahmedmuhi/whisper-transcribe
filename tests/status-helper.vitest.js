import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showTemporaryStatus } from '../js/status-helper.js';
import { COLORS } from '../js/constants.js';

describe('showTemporaryStatus direct behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('maps error and success status types to configured colors', () => {
    const element = { textContent: '', style: { color: '' }, _statusTimeout: null };

    showTemporaryStatus(element, 'error message', 'error', 0);
    expect(element.style.color).toBe(COLORS.ERROR);

    showTemporaryStatus(element, 'success message', 'success', 0);
    expect(element.style.color).toBe(COLORS.SUCCESS);
  });

  it('uses default empty color for info and unknown types', () => {
    const element = { textContent: '', style: { color: 'red' }, _statusTimeout: null };

    showTemporaryStatus(element, 'info message', 'info', 0);
    expect(element.style.color).toBe('');

    showTemporaryStatus(element, 'custom message', 'custom', 0);
    expect(element.style.color).toBe('');
  });

  it('does not auto-reset when duration is zero or negative', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const element = { textContent: '', style: { color: '' }, _statusTimeout: null };

    showTemporaryStatus(element, 'persistent', 'info', 0, 'reset');
    showTemporaryStatus(element, 'still persistent', 'info', -1, 'reset');

    vi.runAllTimers();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(element.textContent).toBe('still persistent');
  });

  it('resets text after duration when message remains unchanged', () => {
    const element = { textContent: '', style: { color: COLORS.ERROR }, _statusTimeout: null };

    showTemporaryStatus(element, 'temporary', 'error', 1000, 'ready');
    vi.advanceTimersByTime(1000);

    expect(element.textContent).toBe('ready');
    expect(element.style.color).toBe('');
    expect(element._statusTimeout).toBeNull();
  });

  it('does not reset if the text changed before timeout fires', () => {
    const element = { textContent: '', style: { color: '' }, _statusTimeout: null };

    showTemporaryStatus(element, 'temporary', 'info', 1000, 'ready');
    element.textContent = 'new message';
    vi.advanceTimersByTime(1000);

    expect(element.textContent).toBe('new message');
  });

  it('clears previous timeout when called repeatedly', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const element = { textContent: '', style: { color: '' }, _statusTimeout: null };

    showTemporaryStatus(element, 'first', 'info', 1000, 'reset');
    const firstTimeout = element._statusTimeout;

    showTemporaryStatus(element, 'second', 'info', 2000, 'reset');

    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstTimeout);
    vi.advanceTimersByTime(1000);
    expect(element.textContent).toBe('second');
    vi.advanceTimersByTime(1000);
    expect(element.textContent).toBe('reset');
  });

  it('throws when element is missing', () => {
    expect(() => {
      showTemporaryStatus(null, 'oops');
    }).toThrow();
  });
});