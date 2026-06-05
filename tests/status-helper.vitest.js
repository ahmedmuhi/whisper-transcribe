import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showTemporaryStatus } from '../js/status-helper.js';

// Minimal element double with a classList that records add/remove — status type
// colour now comes from AA-safe CSS modifier classes, not inline hex.
function makeElement(initialColor = '') {
  const classes = new Set();
  return {
    textContent: '',
    style: { color: initialColor },
    _statusTimeout: null,
    classList: {
      add: (c) => classes.add(c),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c)
    }
  };
}

describe('showTemporaryStatus direct behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('maps error and success status types to AA-safe modifier classes', () => {
    const element = makeElement();

    showTemporaryStatus(element, 'error message', 'error', 0);
    expect(element.classList.contains('status--error')).toBe(true);
    expect(element.classList.contains('status--success')).toBe(false);
    expect(element.style.color).toBe('');

    showTemporaryStatus(element, 'success message', 'success', 0);
    expect(element.classList.contains('status--success')).toBe(true);
    expect(element.classList.contains('status--error')).toBe(false);
    expect(element.style.color).toBe('');
  });

  it('uses no type modifier (base colour) for info and unknown types', () => {
    const element = makeElement('red');

    showTemporaryStatus(element, 'info message', 'info', 0);
    expect(element.classList.contains('status--error')).toBe(false);
    expect(element.classList.contains('status--success')).toBe(false);
    expect(element.style.color).toBe('');

    showTemporaryStatus(element, 'custom message', 'custom', 0);
    expect(element.classList.contains('status--error')).toBe(false);
    expect(element.classList.contains('status--success')).toBe(false);
    expect(element.style.color).toBe('');
  });

  it('does not auto-reset when duration is zero or negative', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const element = makeElement();

    showTemporaryStatus(element, 'persistent', 'info', 0, 'reset');
    showTemporaryStatus(element, 'still persistent', 'info', -1, 'reset');

    vi.runAllTimers();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(element.textContent).toBe('still persistent');
  });

  it('resets text and clears the type modifier after duration', () => {
    const element = makeElement();

    showTemporaryStatus(element, 'temporary', 'error', 1000, 'ready');
    expect(element.classList.contains('status--error')).toBe(true);

    vi.advanceTimersByTime(1000);

    expect(element.textContent).toBe('ready');
    expect(element.classList.contains('status--error')).toBe(false);
    expect(element.style.color).toBe('');
    expect(element._statusTimeout).toBeNull();
  });

  it('does not reset if the text changed before timeout fires', () => {
    const element = makeElement();

    showTemporaryStatus(element, 'temporary', 'info', 1000, 'ready');
    element.textContent = 'new message';
    vi.advanceTimersByTime(1000);

    expect(element.textContent).toBe('new message');
  });

  it('clears previous timeout when called repeatedly', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const element = makeElement();

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
