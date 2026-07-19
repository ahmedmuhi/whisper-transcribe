/**
 * @fileoverview Phase 3 — proportional discard flow.
 * Trivial recordings discard instantly; substantial ones enter CONFIRMING_DISCARD
 * with the stakes named; confirm tears down, keep resumes where you were.
 */

import { vi } from 'vitest';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

vi.mock('../js/logger.js', () => ({
    logger: {
        info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
        child: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
    }
}));
vi.mock('../js/status-helper.js', () => ({ showTemporaryStatus: vi.fn() }));

const { eventBus, APP_EVENTS } = await import('../js/event-bus.js');
const { AUTHENTICATION_STATES, RECORDING_STATES } = await import('../js/constants.js');
const { COGNITIVE_SERVICES_SCOPE } = await import('../js/authentication-config.js');
const { AudioHandler } = await import('../js/audio-handler.js');
const { RecordingStateMachine } = await import('../js/recording-state-machine.js');

describe('Proportional discard flow', () => {
    let audioHandler;

    beforeEach(() => {
        applyDomSpies();
        const config = {
            model: 'whisper',
            uri: 'https://speech.example.invalid/transcribe'
        };
        const mockApiClient = {
            transcribe: vi.fn(),
            validateConfig: vi.fn(() => config),
            getScopeForModel: vi.fn(() => COGNITIVE_SERVICES_SCOPE)
        };
        const mockSettings = {
            getModelConfig: vi.fn(() => config),
            openSettingsModal: vi.fn()
        };
        const authenticationReadiness = {
            ensureTokenReady: vi.fn().mockResolvedValue(AUTHENTICATION_STATES.READY)
        };
        audioHandler = new AudioHandler(mockApiClient, mockSettings, authenticationReadiness);
    });

    afterEach(() => {
        audioHandler.destroy?.();
        resetEventBus();
        vi.restoreAllMocks();
    });

    describe('requestDiscard', () => {
        it('discards a short recording instantly, no confirm', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.RECORDING;
            audioHandler.currentTimerDisplay = '00:09'; // 9s < 10s threshold
            const cancelSpy = vi.spyOn(audioHandler, 'cancelRecording').mockResolvedValue();
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.requestDiscard();

            expect(cancelSpy).toHaveBeenCalled();
            expect(transitionSpy).not.toHaveBeenCalledWith(RECORDING_STATES.CONFIRMING_DISCARD, expect.anything());
        });

        it('confirms a recording at exactly the 10-second threshold', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.RECORDING;
            audioHandler.currentTimerDisplay = '00:10';
            const cancelSpy = vi.spyOn(audioHandler, 'cancelRecording').mockResolvedValue();
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.requestDiscard();

            expect(cancelSpy).not.toHaveBeenCalled();
            expect(transitionSpy).toHaveBeenCalledWith(RECORDING_STATES.CONFIRMING_DISCARD, {
                durationLabel: '00:10'
            });
        });

        it('challenges a substantial recording with the stakes named', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.RECORDING;
            audioHandler.currentTimerDisplay = '24:31';
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.requestDiscard();

            expect(transitionSpy).toHaveBeenCalledWith(RECORDING_STATES.CONFIRMING_DISCARD, {
                durationLabel: '24:31'
            });
        });

        it('remembers a paused recording as where to return', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.PAUSED;
            audioHandler.currentTimerDisplay = '12:00';
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.requestDiscard();

            expect(transitionSpy).toHaveBeenCalledWith(RECORDING_STATES.CONFIRMING_DISCARD, {
                durationLabel: '12:00'
            });
            expect(audioHandler._discardReturnTo).toBe(RECORDING_STATES.PAUSED);
        });

        it('ignores discard when neither recording nor paused', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.IDLE;
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.requestDiscard();

            expect(transitionSpy).not.toHaveBeenCalled();
        });
    });

    describe('confirmDiscard / keepRecording', () => {
        it('confirm tears the recording down (→ CANCELLING + stop)', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.CONFIRMING_DISCARD;
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);
            const stopSpy = vi.spyOn(audioHandler, 'safeStopRecorder').mockImplementation(() => {});

            await audioHandler.confirmDiscard();

            expect(transitionSpy).toHaveBeenCalledWith(RECORDING_STATES.CANCELLING);
            expect(stopSpy).toHaveBeenCalled();
        });

        it('keep resumes RECORDING when that is where it came from', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.CONFIRMING_DISCARD;
            audioHandler._discardReturnTo = RECORDING_STATES.RECORDING;
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.keepRecording();

            expect(transitionSpy).toHaveBeenCalledWith(RECORDING_STATES.RECORDING);
        });

        it('keep resumes PAUSED when discard was requested while paused', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.CONFIRMING_DISCARD;
            audioHandler._discardReturnTo = RECORDING_STATES.PAUSED;
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.keepRecording();

            expect(transitionSpy).toHaveBeenCalledWith(RECORDING_STATES.PAUSED);
        });

        it('confirm/keep are no-ops unless awaiting confirmation', async () => {
            audioHandler.stateMachine.currentState = RECORDING_STATES.RECORDING;
            const transitionSpy = vi.spyOn(audioHandler.stateMachine, 'transitionTo').mockResolvedValue(true);

            await audioHandler.confirmDiscard();
            await audioHandler.keepRecording();

            expect(transitionSpy).not.toHaveBeenCalled();
        });
    });

    describe('FSM wiring', () => {
        it('permits RECORDING/PAUSED → CONFIRMING_DISCARD and CONFIRMING_DISCARD → resume/cancel only', () => {
            const sm = new RecordingStateMachine({});
            sm.currentState = RECORDING_STATES.RECORDING;
            expect(sm.canTransitionTo(RECORDING_STATES.CONFIRMING_DISCARD)).toBe(true);
            sm.currentState = RECORDING_STATES.PAUSED;
            expect(sm.canTransitionTo(RECORDING_STATES.CONFIRMING_DISCARD)).toBe(true);

            sm.currentState = RECORDING_STATES.CONFIRMING_DISCARD;
            expect(sm.canTransitionTo(RECORDING_STATES.RECORDING)).toBe(true);
            expect(sm.canTransitionTo(RECORDING_STATES.PAUSED)).toBe(true);
            expect(sm.canTransitionTo(RECORDING_STATES.CANCELLING)).toBe(true);
            expect(sm.canTransitionTo(RECORDING_STATES.PROCESSING)).toBe(false);
        });

        it('CONFIRMING_DISCARD handler announces the confirm request with the stakes', async () => {
            const sm = new RecordingStateMachine({});
            const emitSpy = vi.spyOn(eventBus, 'emit').mockImplementation(() => {});

            await sm.handleConfirmingDiscardState({ durationLabel: '12:00' });

            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.DISCARD_CONFIRM_REQUESTED, {
                durationLabel: '12:00'
            });
        });
    });
});
