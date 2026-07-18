/**
 * @fileoverview One-active-Audio-Source and navigation-safety coordination.
 */

import { describe, expect, it, vi } from 'vitest';
import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    MODEL_TYPES
} from '../js/constants.js';
import { SelectedAudioController } from '../js/selected-audio-controller.js';

function createHarness(recordingState = AUDIO_SAFETY_STATES.SAFE) {
    let currentRecordingState = recordingState;
    const recordingSafety = {
        getAudioSafetyState: vi.fn(() => currentRecordingState),
        downloadUnsentRecording: vi.fn(() => true),
        wasUnsentRecordingDownloadInitiated: vi.fn(() => true),
        discardUnsentRecording: vi.fn(() => true)
    };
    const controller = new SelectedAudioController({
        settings: { getCurrentModel: () => MODEL_TYPES.WHISPER },
        authenticationReadiness: {
            getState: () => AUTHENTICATION_STATES.READY
        },
        apiClient: {},
        recordingSafety,
        durationReader: vi.fn().mockResolvedValue(null)
    });
    return {
        controller,
        recordingSafety,
        setRecordingState(state) {
            currentRecordingState = state;
        },
        async select() {
            currentRecordingState = AUDIO_SAFETY_STATES.SAFE;
            await controller.select(new File(['deterministic'], 'source.wav', {
                type: 'audio/wav'
            }));
        }
    };
}

describe('SelectedAudioController source coordination', () => {
    it.each([
        AUDIO_SAFETY_STATES.ACTIVE,
        AUDIO_SAFETY_STATES.UNSENT
    ])('preserves recording safety priority for %s', async (recordingState) => {
        const harness = createHarness();
        await harness.select();
        harness.setRecordingState(recordingState);

        expect(harness.controller.getAudioSafetyState()).toBe(recordingState);
        expect(harness.controller.canSelectAudio()).toBe(false);
    });

    it('reports Selected Audio through the same navigation-safety boundary', async () => {
        const { controller, select } = createHarness();
        await select();

        expect(controller.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SELECTED);
        expect(controller.canSelectAudio()).toBe(false);
    });

    it('allows either source only when both owners are safe', () => {
        const { controller } = createHarness();

        expect(controller.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
        expect(controller.canSelectAudio()).toBe(true);
    });

    it('delegates only the existing Unsent Recording recovery operations', () => {
        const { controller, recordingSafety } = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        expect(controller.downloadUnsentRecording()).toBe(true);
        expect(controller.wasUnsentRecordingDownloadInitiated()).toBe(true);
        expect(controller.discardUnsentRecording()).toBe(true);

        expect(recordingSafety.downloadUnsentRecording).toHaveBeenCalledOnce();
        expect(recordingSafety.wasUnsentRecordingDownloadInitiated).toHaveBeenCalledOnce();
        expect(recordingSafety.discardUnsentRecording).toHaveBeenCalledOnce();
    });
});
