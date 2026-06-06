import { vi } from 'vitest';
import { showTemporaryStatus } from '../js/status-helper.js';
import { UI } from '../js/ui.js';


describe('status resets', () => {
  it('defers a base setStatus during a toast, then reverts to it when the toast ends', () => {
    vi.useFakeTimers();
    const el = { textContent: '', style: { color: '' } };

    showTemporaryStatus(el, 'temp', 'info', 1000, 'reset');

    // A base update during the active toast must NOT clobber it immediately —
    // the toast owns the line and the base message is deferred.
    UI.prototype.setStatus.call({ statusElement: el }, 'new');
    expect(el.textContent).toBe('temp');

    // When the toast expires it reverts to the deferred base message, not 'reset'.
    vi.runAllTimers();
    expect(el.textContent).toBe('new');

    vi.useRealTimers();
  });
});
