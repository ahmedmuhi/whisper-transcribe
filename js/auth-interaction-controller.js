/**
 * @fileoverview Coordinates explicit authentication navigation with audio safety.
 */

import {
    AUDIO_SAFETY_STATES,
    AUTH_RECOVERY_STATES
} from './constants.js';

const UNSENT_DISCARD_CONFIRMATION = Object.freeze({
    title: 'Discard Unsent Recording?',
    message: 'Discard the Unsent Recording and continue with Microsoft?',
    confirmLabel: 'Discard recording and sign in'
});

export class AuthInteractionController {
    constructor({ authenticationService, audioSafety, getScope, confirmDiscard }) {
        this.authenticationService = authenticationService;
        this.audioSafety = audioSafety;
        this.getScope = getScope;
        this.confirmDiscard = confirmDiscard;
        this.downloadInitiated = false;
    }

    async continueWithMicrosoft({ interactionRequired = false } = {}) {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.SAFE) {
            return { state };
        }

        return this.#redirect(interactionRequired);
    }

    getRecoveryState() {
        if (this.downloadInitiated) {
            return { state: AUTH_RECOVERY_STATES.DOWNLOADED };
        }
        return { state: this.#getAudioSafetyState() };
    }

    async downloadUnsentRecording() {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.UNSENT) return { state };

        if (!this.audioSafety.downloadUnsentRecording()) {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        this.downloadInitiated = true;
        return { state: AUTH_RECOVERY_STATES.DOWNLOADED };
    }

    async continueAfterDownload({ interactionRequired = false } = {}) {
        const state = this.#getAudioSafetyState();
        if (!this.downloadInitiated || state !== AUDIO_SAFETY_STATES.UNSENT) {
            return { state };
        }
        return this.#redirect(interactionRequired);
    }

    async discardUnsentAndContinue({ interactionRequired = false } = {}) {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.UNSENT) return { state };

        const confirmed = await this.confirmDiscard?.(UNSENT_DISCARD_CONFIRMATION);
        if (!confirmed) return { state: AUTH_RECOVERY_STATES.CANCELLED };
        if (!this.audioSafety.discardUnsentRecording()) {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }

        this.downloadInitiated = false;
        const postDiscardState = this.#getAudioSafetyState();
        if (postDiscardState !== AUDIO_SAFETY_STATES.SAFE) {
            return { state: postDiscardState };
        }
        return this.#redirect(interactionRequired);
    }

    async logOut() {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.SAFE) {
            return { state };
        }

        await this.authenticationService.signOutRedirect();
        return { state: AUTH_RECOVERY_STATES.NAVIGATING };
    }

    async #redirect(interactionRequired) {
        const scope = this.getScope();
        if (interactionRequired) {
            await this.authenticationService.acquireTokenRedirect(scope);
        } else {
            await this.authenticationService.signInRedirect(scope);
        }
        return { state: AUTH_RECOVERY_STATES.NAVIGATING };
    }

    #getAudioSafetyState() {
        try {
            const state = this.audioSafety?.getAudioSafetyState?.();
            return Object.values(AUDIO_SAFETY_STATES).includes(state)
                ? state
                : AUTH_RECOVERY_STATES.BLOCKED;
        } catch {
            return AUTH_RECOVERY_STATES.BLOCKED;
        }
    }
}
