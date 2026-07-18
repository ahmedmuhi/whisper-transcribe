/**
 * @fileoverview Composes Audio Source availability and navigation safety.
 */

import { AUDIO_SAFETY_STATES } from './constants.js';

export class AudioSourceCoordinator {
    constructor({ recordingSafety, selectedAudio }) {
        this.recordingSafety = recordingSafety;
        this.selectedAudio = selectedAudio;
    }

    getAudioSafetyState() {
        const recordingState = this.recordingSafety?.getAudioSafetyState?.();
        if (recordingState !== AUDIO_SAFETY_STATES.SAFE) return recordingState;
        return this.selectedAudio?.getAudioSafetyState?.() || AUDIO_SAFETY_STATES.SAFE;
    }

    canSelectAudio() {
        return this.getAudioSafetyState() === AUDIO_SAFETY_STATES.SAFE;
    }

    canStartRecording() {
        return this.selectedAudio?.getAudioSafetyState?.() !== AUDIO_SAFETY_STATES.SELECTED;
    }

    downloadUnsentRecording() {
        return this.recordingSafety?.downloadUnsentRecording?.() === true;
    }

    wasUnsentRecordingDownloadInitiated() {
        return this.recordingSafety?.wasUnsentRecordingDownloadInitiated?.() === true;
    }

    discardUnsentRecording() {
        return this.recordingSafety?.discardUnsentRecording?.() === true;
    }
}
