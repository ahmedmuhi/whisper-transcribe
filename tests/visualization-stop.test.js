import { jest } from '@jest/globals';
import { RecordingStateMachine } from '../js/recording-state-machine.js';
import { RECORDING_STATES } from '../js/constants.js';

describe('visualization stops on stopping state', () => {
  it('stops visualization on stopping', async () => {
    const ui = { setRecordingState: jest.fn(), clearVisualization: jest.fn() };
    const visualizationController = { stop: jest.fn() };
    const audioHandler = { ui, visualizationController };
    const sm = new RecordingStateMachine(audioHandler);

    sm.currentState = RECORDING_STATES.RECORDING;
    await sm.transitionTo(RECORDING_STATES.STOPPING);

    expect(ui.setRecordingState).toHaveBeenCalledWith(false);
    expect(visualizationController.stop).toHaveBeenCalled();
    expect(audioHandler.visualizationController).toBeNull();
  });
});
