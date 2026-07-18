/**
 * @fileoverview Authentication navigation recovery and audio-safety tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    API_ERROR_CODES,
    AUDIO_SAFETY_STATES,
    AUTH_PRESENTATION_STATES,
    AUTH_RECOVERY_STATES
} from '../js/constants.js';
import { AuthInteractionController } from '../js/auth-interaction-controller.js';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { UI } from '../js/ui.js';

const TEST_SCOPE = 'https://service.invalid/.default';

function createHarness(
    audioState = AUDIO_SAFETY_STATES.SAFE,
    { downloadResult = true, confirmation = true } = {}
) {
    const callOrder = [];
    let currentAudioState = audioState;
    const authenticationService = {
        signInRedirect: vi.fn(async () => callOrder.push('sign-in')),
        acquireTokenRedirect: vi.fn(async () => callOrder.push('acquire-token')),
        signOutRedirect: vi.fn(async () => callOrder.push('logout'))
    };
    const audioSafety = {
        getAudioSafetyState: vi.fn(() => {
            callOrder.push('audio-safety');
            return currentAudioState;
        }),
        downloadUnsentRecording: vi.fn(() => {
            callOrder.push('download');
            return downloadResult;
        }),
        discardUnsentRecording: vi.fn(() => {
            callOrder.push('discard');
            currentAudioState = AUDIO_SAFETY_STATES.SAFE;
            return true;
        })
    };
    const confirmDiscard = vi.fn(async () => {
        callOrder.push('confirm');
        return confirmation;
    });
    const controller = new AuthInteractionController({
        authenticationService,
        audioSafety,
        getScope: () => TEST_SCOPE,
        confirmDiscard
    });

    return {
        controller,
        authenticationService,
        audioSafety,
        confirmDiscard,
        callOrder
    };
}

describe('authentication navigation safety', () => {
    beforeEach(() => vi.clearAllMocks());

    it('checks audio safety before an explicit signed-out navigation', async () => {
        const harness = createHarness();

        await expect(harness.controller.continueWithMicrosoft())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.NAVIGATING });

        expect(harness.callOrder).toEqual(['audio-safety', 'sign-in']);
        expect(harness.authenticationService.signInRedirect)
            .toHaveBeenCalledWith(TEST_SCOPE);
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('uses token redirect only for an explicit interaction-required navigation', async () => {
        const harness = createHarness();

        await harness.controller.continueWithMicrosoft({ interactionRequired: true });

        expect(harness.callOrder).toEqual(['audio-safety', 'acquire-token']);
        expect(harness.authenticationService.acquireTokenRedirect)
            .toHaveBeenCalledWith(TEST_SCOPE);
        expect(harness.authenticationService.signInRedirect).not.toHaveBeenCalled();
    });

    it.each([
        AUDIO_SAFETY_STATES.ACTIVE,
        AUDIO_SAFETY_STATES.UNSENT
    ])('blocks navigation with zero redirect calls for %s audio', async (audioState) => {
        const harness = createHarness(audioState);

        await expect(harness.controller.continueWithMicrosoft())
            .resolves.toEqual({ state: audioState });

        expect(harness.callOrder).toEqual(['audio-safety']);
        expect(harness.authenticationService.signInRedirect).not.toHaveBeenCalled();
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('logs out exactly once only after the no-valuable-audio check', async () => {
        const harness = createHarness();

        await expect(harness.controller.logOut())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.NAVIGATING });

        expect(harness.callOrder).toEqual(['audio-safety', 'logout']);
        expect(harness.authenticationService.signOutRedirect).toHaveBeenCalledTimes(1);
    });

    it.each([
        AUDIO_SAFETY_STATES.ACTIVE,
        AUDIO_SAFETY_STATES.UNSENT
    ])('blocks logout with zero logout calls for %s audio', async (audioState) => {
        const harness = createHarness(audioState);

        await expect(harness.controller.logOut())
            .resolves.toEqual({ state: audioState });

        expect(harness.callOrder).toEqual(['audio-safety']);
        expect(harness.authenticationService.signOutRedirect).not.toHaveBeenCalled();
    });

    it('fails closed when the audio-safety state is unavailable', async () => {
        const harness = createHarness(null);

        await expect(harness.controller.continueWithMicrosoft())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.BLOCKED });

        expect(harness.authenticationService.signInRedirect).not.toHaveBeenCalled();
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
    });
});

describe('Unsent Recording authentication recovery', () => {
    beforeEach(() => vi.clearAllMocks());

    it('downloads without redirecting or clearing the Unsent Recording', async () => {
        const harness = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        await expect(harness.controller.downloadUnsentRecording())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.DOWNLOADED });

        expect(harness.callOrder).toEqual(['audio-safety', 'download']);
        expect(harness.audioSafety.discardUnsentRecording).not.toHaveBeenCalled();
        expect(harness.authenticationService.signInRedirect).not.toHaveBeenCalled();
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
        expect(harness.controller.getRecoveryState())
            .toEqual({ state: AUTH_RECOVERY_STATES.DOWNLOADED });
    });

    it('requires a separate explicit Continue after download initiation', async () => {
        const harness = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        await harness.controller.downloadUnsentRecording();
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();

        await expect(harness.controller.continueAfterDownload({ interactionRequired: true }))
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.NAVIGATING });

        expect(harness.authenticationService.acquireTokenRedirect)
            .toHaveBeenCalledWith(TEST_SCOPE);
        expect(harness.audioSafety.discardUnsentRecording).not.toHaveBeenCalled();
    });

    it('cannot bypass Unsent Recording safety before a download was initiated', async () => {
        const harness = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        await expect(harness.controller.continueAfterDownload({ interactionRequired: true }))
            .resolves.toEqual({ state: AUDIO_SAFETY_STATES.UNSENT });

        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('retains the Unsent Recording and does not redirect when discard is cancelled', async () => {
        const harness = createHarness(
            AUDIO_SAFETY_STATES.UNSENT,
            { confirmation: false }
        );

        await expect(harness.controller.discardUnsentAndContinue({ interactionRequired: true }))
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.CANCELLED });

        expect(harness.callOrder).toEqual(['audio-safety', 'confirm']);
        expect(harness.audioSafety.discardUnsentRecording).not.toHaveBeenCalled();
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('discards only after confirmation and redirects only after the audio is safe', async () => {
        const harness = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        await expect(harness.controller.discardUnsentAndContinue({ interactionRequired: true }))
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.NAVIGATING });

        expect(harness.callOrder).toEqual([
            'audio-safety',
            'confirm',
            'discard',
            'audio-safety',
            'acquire-token'
        ]);
        expect(harness.confirmDiscard).toHaveBeenCalledWith({
            title: 'Discard Unsent Recording?',
            message: 'Discard the Unsent Recording and continue with Microsoft?',
            confirmLabel: 'Discard recording and sign in'
        });
        expect(harness.audioSafety.discardUnsentRecording).toHaveBeenCalledTimes(1);
        expect(harness.authenticationService.acquireTokenRedirect).toHaveBeenCalledTimes(1);
    });
});

describe('Unsent Recording logout recovery', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires download initiation before an explicit logout continuation', async () => {
        const harness = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        await expect(harness.controller.continueLogoutAfterDownload())
            .resolves.toEqual({ state: AUDIO_SAFETY_STATES.UNSENT });
        expect(harness.authenticationService.signOutRedirect).not.toHaveBeenCalled();

        await harness.controller.downloadUnsentRecording();
        await expect(harness.controller.continueLogoutAfterDownload())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.NAVIGATING });

        expect(harness.authenticationService.signOutRedirect).toHaveBeenCalledTimes(1);
        expect(harness.authenticationService.signInRedirect).not.toHaveBeenCalled();
        expect(harness.authenticationService.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('discards only after logout-specific confirmation and rechecks safety before logout', async () => {
        const harness = createHarness(AUDIO_SAFETY_STATES.UNSENT);

        await expect(harness.controller.discardUnsentAndLogOut())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.NAVIGATING });

        expect(harness.confirmDiscard).toHaveBeenCalledWith({
            title: 'Discard Unsent Recording?',
            message: 'Discard the Unsent Recording and log out?',
            confirmLabel: 'Discard recording and log out'
        });
        expect(harness.callOrder).toEqual([
            'audio-safety',
            'confirm',
            'discard',
            'audio-safety',
            'logout'
        ]);
        expect(harness.authenticationService.signOutRedirect).toHaveBeenCalledTimes(1);
    });

    it('retains the Unsent Recording and remains signed in when logout discard is cancelled', async () => {
        const harness = createHarness(
            AUDIO_SAFETY_STATES.UNSENT,
            { confirmation: false }
        );

        await expect(harness.controller.discardUnsentAndLogOut())
            .resolves.toEqual({ state: AUTH_RECOVERY_STATES.CANCELLED });

        expect(harness.audioSafety.discardUnsentRecording).not.toHaveBeenCalled();
        expect(harness.authenticationService.signOutRedirect).not.toHaveBeenCalled();
    });
});

function createIslandHarness({ recoveryState = AUDIO_SAFETY_STATES.SAFE } = {}) {
    document.body.innerHTML = `
        <div id="control-cluster" class="control-cluster island-idle">
            <div id="auth-context" hidden>
                <strong id="auth-context-title"></strong>
                <p id="auth-context-body"></p>
                <p id="auth-context-note"></p>
                <button id="auth-primary-action"><span class="btn-label"></span></button>
                <button id="auth-secondary-action"><span class="btn-label"></span></button>
            </div>
            <div id="timer"></div>
            <button id="primary-action"><span class="btn-label"></span></button>
            <button id="secondary-action"><span class="btn-label"></span></button>
            <button id="discard-action"><span class="btn-label"></span></button>
            <button id="retry-action"><span class="btn-label"></span></button>
            <div id="spinner-container"></div>
        </div>
        <div id="status"></div>
        <textarea id="transcript"></textarea>
        <button id="grab-text-button"></button>
        <button id="restore-button"></button>
        <canvas id="visualizer"></canvas>
        <dialog id="discard-dialog">
            <h3 id="discard-dialog-title"></h3>
            <p id="discard-dialog-body"></p>
            <button id="discard-keep"></button>
            <button id="discard-confirm"></button>
        </dialog>
    `;
    document.getElementById = (id) => document.querySelector(`#${id}`);
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn() }));
    const authInteractionController = {
        getRecoveryState: vi.fn(() => ({ state: recoveryState })),
        continueWithMicrosoft: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.NAVIGATING }),
        downloadUnsentRecording: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.DOWNLOADED }),
        continueAfterDownload: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.NAVIGATING }),
        discardUnsentAndContinue: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.CANCELLED })
    };
    const settings = { openSettingsModal: vi.fn() };
    const openHelp = vi.fn();
    const ui = new UI({
        authenticationState: AUTH_PRESENTATION_STATES.CHECKING,
        authInteractionController,
        openHelp
    });
    ui.settings = settings;
    ui._setReady(true);

    return { ui, authInteractionController, settings, openHelp };
}

describe('authentication island presentation', () => {
    beforeEach(() => {
        eventBus.clear();
        vi.clearAllMocks();
    });

    it('keeps capture disabled while checking and never flashes the ready control', () => {
        const { ui } = createIslandHarness();

        ui.renderControls('idle');

        expect(ui.authContext.hidden).toBe(false);
        expect(ui.authContextTitle.textContent).toBe('Checking sign-in…');
        expect(ui.authPrimaryAction.hidden).toBe(true);
        expect(ui.primaryAction.hidden).toBe(true);
        expect(ui.ready).toBe(false);
    });

    it('renders the accepted signed-out copy as one exclusive presentation', () => {
        const { ui } = createIslandHarness();

        ui.setAuthenticationPresentation(AUTH_PRESENTATION_STATES.SIGNED_OUT);

        expect(ui.authContextTitle.textContent).toBe('Microsoft sign in required');
        expect(ui.authContextBody.textContent).toBe('Sign in before recording.');
        expect(ui.authContextNote.textContent).toBe(
            'Use your Microsoft account to access Azure resources already assigned to you. Whisper Transcribe cannot grant Azure access.'
        );
        expect(ui.authPrimaryAction.textContent).toBe('Continue with Microsoft');
        expect(ui.primaryAction.hidden).toBe(true);
        expect(ui.authContext.hidden).toBe(false);
    });

    it('shows Start recording only when authentication and prerequisites are ready', () => {
        const { ui } = createIslandHarness();

        ui.setAuthenticationPresentation(AUTH_PRESENTATION_STATES.READY);

        expect(ui.authContext.hidden).toBe(true);
        expect(ui.primaryAction.hidden).toBe(false);
        expect(ui.primaryAction.disabled).toBe(false);
        expect(ui.primaryAction.textContent).toBe('Start recording');
    });

    it('renders 401 interaction recovery without Retry silently or microphone intent', async () => {
        const { ui, authInteractionController } = createIslandHarness();
        const emitSpy = vi.spyOn(eventBus, 'emit');
        ui.setupEventListeners();
        ui.setupEventBusListeners();

        eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
            code: API_ERROR_CODES.AUTHENTICATION_REQUIRED
        });
        expect(ui.authPrimaryAction.dataset.authAction).toBe('continue');
        ui.authPrimaryAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(ui.authPrimaryAction.textContent).toBe('Continue with Microsoft');
        expect(ui.authContext.textContent).not.toContain('Retry silently');
        expect(authInteractionController.continueWithMicrosoft)
            .toHaveBeenCalledWith({ interactionRequired: true });
        expect(emitSpy).not.toHaveBeenCalledWith(APP_EVENTS.MIC_BUTTON_CLICKED);
    });

    it('renders the two initial Unsent Recording choices for interaction recovery', () => {
        const { ui } = createIslandHarness({ recoveryState: AUDIO_SAFETY_STATES.UNSENT });

        ui.setAuthenticationPresentation(AUTH_PRESENTATION_STATES.INTERACTION_REQUIRED);

        expect(ui.authPrimaryAction.textContent).toBe('Download recording');
        expect(ui.authSecondaryAction.textContent).toBe('Discard recording and sign in');
        expect(ui.authContext.textContent).not.toContain('Retry silently');
    });

    it('renders 403 Azure guidance without changing authentication or audio', () => {
        const { ui, authInteractionController } = createIslandHarness();
        ui.setupEventBusListeners();

        eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
            code: API_ERROR_CODES.AZURE_AUTHORIZATION_DENIED
        });

        expect(ui.authContextTitle.textContent).toBe('Azure access is missing');
        expect(ui.authPrimaryAction.textContent).toBe('View Azure setup');
        expect(authInteractionController.continueWithMicrosoft).not.toHaveBeenCalled();
        expect(authInteractionController.discardUnsentAndContinue).not.toHaveBeenCalled();
    });

    it('renders invalid Target URI recovery as Open settings', () => {
        const { ui } = createIslandHarness();
        ui.setupEventBusListeners();
        ui.setAuthenticationPresentation(AUTH_PRESENTATION_STATES.READY);

        eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri' });

        expect(ui.authContextTitle.textContent).toBe('Target URI required');
        expect(ui.authPrimaryAction.textContent).toBe('Open settings');
    });

    it('names Unsent Recording loss and resolves only from the confirmation dialog', async () => {
        const { ui } = createIslandHarness();
        ui.discardDialog.showModal = vi.fn();
        ui.discardDialog.close = vi.fn();
        ui.setupEventListeners();

        const confirmation = ui.confirmUnsentDiscard({
            title: 'Discard Unsent Recording?',
            message: 'Discard the Unsent Recording and continue with Microsoft?',
            confirmLabel: 'Discard recording and sign in'
        });

        expect(ui.discardDialogTitle.textContent).toBe('Discard Unsent Recording?');
        expect(ui.discardDialogBody.textContent)
            .toBe('Discard the Unsent Recording and continue with Microsoft?');
        expect(ui.discardConfirmButton.textContent).toBe('Discard recording and sign in');
        expect(ui.discardDialog.showModal).toHaveBeenCalledTimes(1);

        ui.discardConfirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await expect(confirmation).resolves.toBe(true);
    });
});
