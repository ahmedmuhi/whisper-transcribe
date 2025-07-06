import { vi } from 'vitest';
import { AudioHandler } from '../js/audio-handler.js';
import { resetEventBus } from './helpers/test-dom-vitest.js';

describe('safeStopRecorder', () => {
  it('calls stop only when active', () => {
    const dummyEl = { addEventListener: () => {} };
    // Provide minimal UI mock to avoid constructor errors
    const ui = {
      micButton: dummyEl,
      pauseButton: dummyEl,
      cancelButton: dummyEl,
      checkRecordingPrerequisites: () => true,
      updateTimer: () => {},
      setRecordingState: () => {},
      setPauseState: () => {},
      timerElement: { textContent: '00:00' }
    };
    const handler = new AudioHandler({}, ui, { getCurrentModel: () => 'x' });
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
