import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingStateMachine } from '../js/recording-state-machine.js';
import {
  DEFAULT_RESET_STATUS,
  MESSAGES,
  RECORDING_STATES,
  STATE_TRANSITIONS
} from '../js/constants.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { errorHandler } from '../js/error-handler.js';
import { logger } from '../js/logger.js';

describe('RecordingStateMachine direct behavior', () => {
  let sm;
  let emitSpy;
  let errorSpy;

  beforeEach(() => {
    sm = new RecordingStateMachine({});
    emitSpy = vi.spyOn(eventBus, 'emit').mockImplementation(() => {});
    errorSpy = vi.spyOn(errorHandler, 'handleError').mockImplementation(() => {});
    vi.spyOn(logger, 'child').mockReturnValue({ debug: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in idle and exposes current state via getState', () => {
    expect(sm.getState()).toBe(RECORDING_STATES.IDLE);
  });

  it('validates transitions using STATE_TRANSITIONS map', () => {
    sm.currentState = RECORDING_STATES.IDLE;

    expect(sm.canTransitionTo(RECORDING_STATES.INITIALIZING)).toBe(true);
    expect(sm.canTransitionTo(RECORDING_STATES.RECORDING)).toBe(false);
  });

  it('transitions on valid target and emits state change payload', async () => {
    const result = await sm.transitionTo(RECORDING_STATES.INITIALIZING, { source: 'test' });

    expect(result).toBe(true);
    expect(sm.getState()).toBe(RECORDING_STATES.INITIALIZING);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_STATE_CHANGED, {
      newState: RECORDING_STATES.INITIALIZING,
      oldState: RECORDING_STATES.IDLE,
      source: 'test'
    });
  });

  it('rejects invalid transitions and delegates to error handler', async () => {
    const result = await sm.transitionTo(RECORDING_STATES.PAUSED);

    expect(result).toBe(false);
    expect(sm.getState()).toBe(RECORDING_STATES.IDLE);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('implements query and capability methods for representative states', () => {
    sm.currentState = RECORDING_STATES.IDLE;
    expect(sm.isIdle()).toBe(true);
    expect(sm.isRecording()).toBe(false);
    expect(sm.isPaused()).toBe(false);
    expect(sm.isProcessing()).toBe(false);
    expect(sm.canRecord()).toBe(true);
    expect(sm.canPause()).toBe(false);
    expect(sm.canResume()).toBe(false);
    expect(sm.canCancel()).toBe(false);

    sm.currentState = RECORDING_STATES.RECORDING;
    expect(sm.isRecording()).toBe(true);
    expect(sm.canPause()).toBe(true);
    expect(sm.canCancel()).toBe(true);

    sm.currentState = RECORDING_STATES.PAUSED;
    expect(sm.isPaused()).toBe(true);
    expect(sm.canResume()).toBe(true);
    expect(sm.canCancel()).toBe(true);

    sm.currentState = RECORDING_STATES.PROCESSING;
    expect(sm.isProcessing()).toBe(true);
    expect(sm.canRecord()).toBe(false);

    sm.currentState = RECORDING_STATES.ERROR;
    expect(sm.canRecord()).toBe(true);
  });

  it('implements canInvokeStop for all states', () => {
    const allowed = [
      RECORDING_STATES.RECORDING,
      RECORDING_STATES.PAUSED,
      RECORDING_STATES.STOPPING,
      RECORDING_STATES.CANCELLING
    ];

    for (const state of Object.values(RECORDING_STATES)) {
      sm.currentState = state;
      expect(sm.canInvokeStop()).toBe(allowed.includes(state));
    }
  });

  it('emits expected UI events for idle state handler', async () => {
    await sm.handleIdleState();

    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
      message: DEFAULT_RESET_STATUS,
      type: 'info'
    });
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_BUTTON_ENABLE_MIC);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SPINNER_HIDE);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_CONTROLS_RESET);
  });

  it('emits expected events for initializing, recording and paused handlers', async () => {
    await sm.handleInitializingState();
    await sm.handleRecordingState();
    await sm.handlePausedState();

    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
      message: MESSAGES.INITIALIZING_MICROPHONE,
      type: 'info'
    });
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_BUTTON_DISABLE_MIC);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_STARTED);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_BUTTON_SET_RECORDING_STATE, { isRecording: true });
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_PAUSED);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_BUTTON_SET_PAUSE_STATE, { isPaused: true });
  });

  it('emits expected events for stopping and processing handlers', async () => {
    await sm.handleStoppingState();
    await sm.handleProcessingState();

    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_STOPPED);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.VISUALIZATION_STOP);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.API_REQUEST_START);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_SPINNER_SHOW);
  });

  it('emits expected events for cancelling and error handlers', async () => {
    await sm.handleCancellingState();
    await sm.handleErrorState({ error: 'test failure' });

    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_CANCELLED);
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.RECORDING_ERROR, { error: 'test failure' });
    expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
      message: `${MESSAGES.ERROR_PREFIX}test failure. ${MESSAGES.TAP_MIC_TO_RETRY}`,
      type: 'error'
    });
  });

  it('accepts every transition declared in constants map', () => {
    for (const [fromState, toStates] of Object.entries(STATE_TRANSITIONS)) {
      sm.currentState = fromState;
      for (const toState of toStates) {
        expect(sm.canTransitionTo(toState)).toBe(true);
      }
    }
  });
});
