import { jest } from '@jest/globals';
import { showTemporaryStatus } from '../js/status-helper.js';
import { UI } from '../js/ui.js';


describe('status resets', () => {
  it('does not reset if status updated before timeout', () => {
    jest.useFakeTimers();
    const el = { textContent: '', style: { color: '' } };

    showTemporaryStatus(el, 'temp', 'info', 1000, 'reset');

    // Update status before the timeout fires
    UI.prototype.setStatus.call({ statusElement: el }, 'new');

    jest.runAllTimers();

    expect(el.textContent).toBe('new');
    jest.useRealTimers();
  });
});
