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

const UNSENT_LOGOUT_CONFIRMATION = Object.freeze({
    title: 'Discard Unsent Recording?',
    message: 'Discard the Unsent Recording and log out?',
    confirmLabel: 'Discard recording and log out'
});

export class AuthInteractionController {
    constructor({ authenticationService, audioSafety, getScope, confirmDiscard }) {
        this.authenticationService = authenticationService;
        this.audioSafety = audioSafety;
        this.getScope = getScope;
        this.confirmDiscard = confirmDiscard;
    }

    async continueWithMicrosoft({ interactionRequired = false } = {}) {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.SAFE) {
            return { state };
        }

        return this.#redirect(interactionRequired);
    }

    getRecoveryState() {
        const state = this.#getAudioSafetyState();
        if (
            state === AUDIO_SAFETY_STATES.UNSENT &&
            this.#wasUnsentRecordingDownloadInitiated()
        ) {
            return { state: AUTH_RECOVERY_STATES.DOWNLOADED };
        }
        return { state };
    }

    async downloadUnsentRecording() {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.UNSENT) return { state };

        try {
            if (!this.audioSafety.downloadUnsentRecording()) {
                return { state: AUTH_RECOVERY_STATES.BLOCKED };
            }
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        return { state: AUTH_RECOVERY_STATES.DOWNLOADED };
    }

    async continueAfterDownload({ interactionRequired = false } = {}) {
        const state = this.#getAudioSafetyState();
        if (
            state !== AUDIO_SAFETY_STATES.UNSENT ||
            !this.#wasUnsentRecordingDownloadInitiated()
        ) {
            return { state };
        }
        return this.#redirect(interactionRequired);
    }

    async discardUnsentAndContinue({ interactionRequired = false } = {}) {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.UNSENT) return { state };

        let confirmed = false;
        try {
            confirmed = await this.confirmDiscard?.(UNSENT_DISCARD_CONFIRMATION);
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        if (!confirmed) return { state: AUTH_RECOVERY_STATES.CANCELLED };
        try {
            if (!this.audioSafety.discardUnsentRecording()) {
                return { state: AUTH_RECOVERY_STATES.BLOCKED };
            }
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }

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

        return this.#logOutRedirect();
    }

    async continueLogoutAfterDownload() {
        const state = this.#getAudioSafetyState();
        if (
            state !== AUDIO_SAFETY_STATES.UNSENT ||
            !this.#wasUnsentRecordingDownloadInitiated()
        ) {
            return { state };
        }
        return this.#logOutRedirect();
    }

    async discardUnsentAndLogOut() {
        const state = this.#getAudioSafetyState();
        if (state !== AUDIO_SAFETY_STATES.UNSENT) return { state };

        let confirmed = false;
        try {
            confirmed = await this.confirmDiscard?.(UNSENT_LOGOUT_CONFIRMATION);
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        if (!confirmed) return { state: AUTH_RECOVERY_STATES.CANCELLED };
        try {
            if (!this.audioSafety.discardUnsentRecording()) {
                return { state: AUTH_RECOVERY_STATES.BLOCKED };
            }
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }

        const postDiscardState = this.#getAudioSafetyState();
        if (postDiscardState !== AUDIO_SAFETY_STATES.SAFE) {
            return { state: postDiscardState };
        }
        return this.#logOutRedirect();
    }

    async #redirect(interactionRequired) {
        try {
            const scope = this.getScope();
            if (interactionRequired) {
                await this.authenticationService.acquireTokenRedirect(scope);
            } else {
                await this.authenticationService.signInRedirect(scope);
            }
            return { state: AUTH_RECOVERY_STATES.NAVIGATING };
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
    }

    async #logOutRedirect() {
        try {
            await this.authenticationService.signOutRedirect();
            return { state: AUTH_RECOVERY_STATES.NAVIGATING };
        } catch {
            return { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
    }

    #wasUnsentRecordingDownloadInitiated() {
        try {
            return this.audioSafety?.wasUnsentRecordingDownloadInitiated?.() === true;
        } catch {
            return false;
        }
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
