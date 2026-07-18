/**
 * @fileoverview One-active-Audio-Source and navigation-safety coordination.
 */

import { describe, expect, it, vi } from 'vitest';
import { AudioSourceCoordinator } from '../js/audio-source-coordinator.js';
import { AUDIO_SAFETY_STATES } from '../js/constants.js';

function createHarness({
    recordingState = AUDIO_SAFETY_STATES.SAFE,
    selectedState = AUDIO_SAFETY_STATES.SAFE
} = {}) {
    const recordingSafety = {
        getAudioSafetyState: vi.fn(() => recordingState),
        downloadUnsentRecording: vi.fn(() => true),
        wasUnsentRecordingDownloadInitiated: vi.fn(() => true),
        discardUnsentRecording: vi.fn(() => true)
    };
    const selectedAudio = {
        getAudioSafetyState: vi.fn(() => selectedState),
        remove: vi.fn(() => true)
    };
    return {
        coordinator: new AudioSourceCoordinator({ recordingSafety, selectedAudio }),
        recordingSafety,
        selectedAudio
    };
}

describe('AudioSourceCoordinator', () => {
    it.each([
        AUDIO_SAFETY_STATES.ACTIVE,
        AUDIO_SAFETY_STATES.UNSENT
    ])('preserves recording safety priority for %s', (recordingState) => {
        const { coordinator } = createHarness({
            recordingState,
            selectedState: AUDIO_SAFETY_STATES.SELECTED
        });

        expect(coordinator.getAudioSafetyState()).toBe(recordingState);
        expect(coordinator.canSelectAudio()).toBe(false);
    });

    it('reports Selected Audio through the same navigation-safety boundary', () => {
        const { coordinator } = createHarness({
            selectedState: AUDIO_SAFETY_STATES.SELECTED
        });

        expect(coordinator.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SELECTED);
        expect(coordinator.canSelectAudio()).toBe(false);
        expect(coordinator.canStartRecording()).toBe(false);
    });

    it('allows either source only when both owners are safe', () => {
        const { coordinator } = createHarness();

        expect(coordinator.getAudioSafetyState()).toBe(AUDIO_SAFETY_STATES.SAFE);
        expect(coordinator.canSelectAudio()).toBe(true);
        expect(coordinator.canStartRecording()).toBe(true);
    });

    it('delegates only the existing Unsent Recording recovery operations', () => {
        const { coordinator, recordingSafety, selectedAudio } = createHarness({
            recordingState: AUDIO_SAFETY_STATES.UNSENT
        });

        expect(coordinator.downloadUnsentRecording()).toBe(true);
        expect(coordinator.wasUnsentRecordingDownloadInitiated()).toBe(true);
        expect(coordinator.discardUnsentRecording()).toBe(true);

        expect(recordingSafety.downloadUnsentRecording).toHaveBeenCalledOnce();
        expect(recordingSafety.wasUnsentRecordingDownloadInitiated).toHaveBeenCalledOnce();
        expect(recordingSafety.discardUnsentRecording).toHaveBeenCalledOnce();
        expect(selectedAudio.remove).not.toHaveBeenCalled();
    });
});
