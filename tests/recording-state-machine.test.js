import { RecordingStateMachine } from '../js/recording-state-machine.js';
import { RECORDING_STATES } from '../js/constants.js';

describe('canInvokeStop()', () => {
  const sm = new RecordingStateMachine({});

  const allowed = [
    RECORDING_STATES.RECORDING,
    RECORDING_STATES.PAUSED,
    RECORDING_STATES.STOPPING,
    RECORDING_STATES.CANCELLING
  ];

  for (const state of Object.values(RECORDING_STATES)) {
    it(`${state} → ${allowed.includes(state)}`, () => {
      sm.currentState = state;
      expect(sm.canInvokeStop()).toBe(allowed.includes(state));
    });
  }
});
