import { vi } from 'vitest';
import { AudioHandler } from '../js/audio-handler.js';
import { resetEventBus } from './helpers/test-dom-vitest.js';

describe('safeStopRecorder', () => {
  it('calls stop only when active', () => {
    const handler = new AudioHandler({}, { getCurrentModel: () => 'x' });
    handler.mediaRecorder = { state: 'inactive', stop: vi.fn() };
    handler.safeStopRecorder();
    expect(handler.mediaRecorder.stop).not.toHaveBeenCalled();

    handler.mediaRecorder.state = 'recording';
    handler.safeStopRecorder();
    expect(handler.mediaRecorder.stop).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    resetEventBus();
  });
});
