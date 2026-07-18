/**
 * @fileoverview Unified User-menu presentation and interaction tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationService } from '../js/authentication-service.js';
import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    AUTH_RECOVERY_STATES
} from '../js/constants.js';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { computeInitials, UserMenu } from '../js/user-menu.js';

function createClient(account) {
    return {
        initialize: vi.fn().mockResolvedValue(undefined),
        handleRedirectPromise: vi.fn().mockResolvedValue(null),
        getActiveAccount: vi.fn().mockReturnValue(account),
        getAllAccounts: vi.fn().mockReturnValue(account ? [account] : []),
        setActiveAccount: vi.fn(),
        ssoSilent: vi.fn().mockResolvedValue(null)
    };
}

describe('User menu identity presentation', () => {
    beforeEach(() => {
        eventBus.clear();
        eventBus.setHistoryEnabled(false);
        vi.clearAllMocks();
    });

    it.each([
        ['  Ada   Lovelace  ', '', 'AL'],
        ['張 偉', '', '張偉'],
        ['👩🏽\u200d💻 Engineer', '', '👩🏽\u200d💻E'],
        ['', 'person@example.invalid', 'PE'],
        ['   ', '   ', '?']
    ])('computes Unicode-aware initials from normalized identity', (displayName, username, expected) => {
        expect(computeInitials({ displayName, username })).toBe(expected);
    });

    it('normalizes the active account into displayName and username only', async () => {
        const account = {
            name: '  Example   Person  ',
            username: '  person@example.invalid  ',
            homeAccountId: 'fixture-account-id',
            idTokenClaims: { privateFixtureClaim: true }
        };
        const service = new AuthenticationService({}, createClient(account));

        await expect(service.initialize()).resolves.toBe(AUTHENTICATION_STATES.READY);

        expect(service.getAccountPresentation()).toEqual({
            name: 'Example Person',
            username: 'person@example.invalid'
        });
        expect(Object.keys(service.getAccountPresentation()))
            .toEqual(['name', 'username']);
    });

    it('keeps authentication state event and history payloads free of account data', async () => {
        const account = {
            name: 'Event Fixture Person',
            username: 'event-fixture@example.invalid',
            homeAccountId: 'event-fixture-account-id'
        };
        const service = new AuthenticationService({}, createClient(account));
        const emitSpy = vi.spyOn(eventBus, 'emit');
        eventBus.setHistoryEnabled(true);

        await service.initialize();

        expect(emitSpy).toHaveBeenLastCalledWith(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            { state: AUTHENTICATION_STATES.READY }
        );
        const retainedPayload = JSON.stringify(eventBus.getHistory());
        expect(retainedPayload).not.toContain(account.name);
        expect(retainedPayload).not.toContain(account.username);
        expect(retainedPayload).not.toContain(account.homeAccountId);
    });
});

function installUserMenuDom() {
    document.body.innerHTML = `
        <main id="workspace"><button id="outside-button">Outside</button></main>
        <div id="user-menu" class="user-menu">
            <button id="user-menu-launcher" aria-expanded="false" aria-controls="user-menu-surface">
                <span id="user-menu-initials" aria-hidden="true"></span>
            </button>
            <div id="user-menu-surface" hidden>
                <section id="user-menu-root" aria-label="User menu">
                    <header>
                        <span class="user-menu-avatar" aria-hidden="true"></span>
                        <strong id="user-menu-name"></strong>
                        <span id="user-menu-username"></span>
                    </header>
                    <button id="user-menu-model" data-menu-view="model" aria-expanded="false">Model</button>
                    <button id="user-menu-microphone" data-menu-view="microphone" aria-expanded="false">Microphone</button>
                    <button id="user-menu-settings" data-menu-view="settings" aria-expanded="false">Settings</button>
                    <button id="user-menu-help">Help &amp; Azure setup</button>
                    <button id="user-menu-logout">Log out</button>
                </section>
                <section id="user-menu-detail" hidden aria-label="User menu detail">
                    <button id="user-menu-back">Back</button>
                    <strong id="user-menu-detail-title"></strong>
                    <div data-menu-panel="model" hidden>
                        <select id="model-select">
                            <option value="whisper">Azure Whisper</option>
                            <option value="mai-transcribe-1.5">MAI-Transcribe 1.5</option>
                        </select>
                        <button id="model-help">Help me choose a model</button>
                    </div>
                    <div data-menu-panel="microphone" hidden>
                        <select id="input-device"><option value="">System Default</option></select>
                        <input id="noise-toggle" type="checkbox">
                    </div>
                    <div data-menu-panel="settings" hidden>
                        <input id="whisper-uri">
                        <input id="mai-transcribe-uri">
                        <button id="save-settings">Save changes</button>
                    </div>
                    <div data-menu-panel="logout" hidden>
                        <p id="user-menu-logout-status"></p>
                        <button id="user-menu-download-recording">Download recording</button>
                        <button id="user-menu-continue-logout" hidden>Continue to log out</button>
                        <button id="user-menu-discard-logout">Discard recording and log out</button>
                    </div>
                </section>
                <div id="user-menu-status" role="status" aria-live="polite"></div>
            </div>
        </div>
    `;
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

function click(element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function createUserMenuHarness({
    presentation = { name: 'Example Person', username: 'person@example.invalid' },
    logoutState = AUTH_RECOVERY_STATES.NAVIGATING,
    narrow = false,
    useDefaultHelp = false
} = {}) {
    installUserMenuDom();
    const authenticationService = {
        getAccountPresentation: vi.fn(() => presentation)
    };
    const authInteractionController = {
        logOut: vi.fn().mockResolvedValue({ state: logoutState }),
        downloadUnsentRecording: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.DOWNLOADED }),
        continueLogoutAfterDownload: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.NAVIGATING }),
        discardUnsentAndLogOut: vi.fn().mockResolvedValue({ state: AUTH_RECOVERY_STATES.CANCELLED })
    };
    const settings = {
        openSettingsModal: vi.fn(),
        prepareSettingsDraft: vi.fn(),
        discardSettingsDraft: vi.fn(),
        populateDeviceList: vi.fn().mockResolvedValue(undefined)
    };
    const openHelp = vi.fn();
    const menuOptions = {
        authenticationService,
        authInteractionController,
        settings,
        isNarrow: () => narrow
    };
    if (!useDefaultHelp) menuOptions.openHelp = openHelp;
    const menu = new UserMenu(menuOptions);
    menu.init();
    menu.updateAuthenticationState(AUTHENTICATION_STATES.READY);

    return {
        menu,
        authenticationService,
        authInteractionController,
        settings,
        openHelp
    };
}

describe('unified User menu interactions', () => {
    beforeEach(() => {
        eventBus.clear();
        vi.clearAllMocks();
    });

    it('keeps the closed launcher initials-only and renders identity once in the open root', () => {
        createUserMenuHarness();
        const launcher = document.getElementById('user-menu-launcher');

        expect(launcher.textContent.trim()).toBe('EP');
        expect(launcher.textContent).not.toContain('Example Person');
        expect(launcher.textContent).not.toContain('person@example.invalid');

        click(launcher);

        const surfaceText = document.getElementById('user-menu-root').textContent;
        expect(surfaceText.match(/Example Person/g)).toHaveLength(1);
        expect(surfaceText.match(/person@example\.invalid/g)).toHaveLength(1);
        expect(surfaceText).not.toContain('Signed in with Microsoft');
        expect(surfaceText).not.toContain('Azure ready');
    });

    it('opens root then an adjacent desktop detail without an inside click dismissing it', () => {
        createUserMenuHarness();
        click(document.getElementById('user-menu-launcher'));

        expect(document.activeElement).toBe(document.getElementById('user-menu-model'));
        click(document.getElementById('user-menu-model'));

        expect(document.getElementById('user-menu-surface').hidden).toBe(false);
        expect(document.getElementById('user-menu-root').hidden).toBe(false);
        expect(document.getElementById('user-menu-detail').hidden).toBe(false);
        expect(document.querySelector('[data-menu-panel="model"]').hidden).toBe(false);
        expect(document.getElementById('user-menu-model').getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(document.getElementById('model-select'));
    });

    it('prepares settings drafts and refreshes microphone choices on detail entry', async () => {
        const { settings } = createUserMenuHarness();
        click(document.getElementById('user-menu-launcher'));

        click(document.getElementById('user-menu-settings'));
        expect(settings.prepareSettingsDraft).toHaveBeenCalledOnce();

        click(document.getElementById('user-menu-microphone'));
        await Promise.resolve();
        expect(settings.populateDeviceList).toHaveBeenCalledOnce();
    });

    it('replaces the root with detail on narrow screens and provides Back', () => {
        createUserMenuHarness({ narrow: true });
        click(document.getElementById('user-menu-launcher'));
        click(document.getElementById('user-menu-settings'));

        expect(document.getElementById('user-menu-root').hidden).toBe(true);
        expect(document.getElementById('user-menu-back').hidden).toBe(false);
        expect(document.activeElement).toBe(document.getElementById('user-menu-back'));

        click(document.getElementById('user-menu-back'));
        expect(document.getElementById('user-menu-root').hidden).toBe(false);
        expect(document.getElementById('user-menu-detail').hidden).toBe(true);
        expect(document.activeElement).toBe(document.getElementById('user-menu-settings'));
    });

    it('dismisses on outside pointer and Escape, restoring focus to the launcher', () => {
        createUserMenuHarness();
        const launcher = document.getElementById('user-menu-launcher');
        click(launcher);

        click(document.getElementById('outside-button'));
        expect(document.getElementById('user-menu-surface').hidden).toBe(true);
        expect(document.activeElement).toBe(launcher);

        click(launcher);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('user-menu-surface').hidden).toBe(true);
        expect(document.activeElement).toBe(launcher);
    });

    it('does not dismiss a detail opened by the same external action click', () => {
        const { menu } = createUserMenuHarness();
        const externalAction = document.getElementById('outside-button');
        externalAction.addEventListener('click', () => {
            menu.openDetail('settings', externalAction);
        });

        click(externalAction);

        expect(document.getElementById('user-menu-surface').hidden).toBe(false);
        expect(document.querySelector('[data-menu-panel="settings"]').hidden).toBe(false);
    });

    it('traps Tab focus within the open surface', () => {
        createUserMenuHarness();
        click(document.getElementById('user-menu-launcher'));
        const first = document.getElementById('user-menu-model');
        const last = document.getElementById('user-menu-logout');
        last.focus();
        const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            bubbles: true,
            cancelable: true
        });

        document.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);
    });

    it('opens delegated Azure RBAC guidance rather than managed-identity setup', () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        createUserMenuHarness({ useDefaultHelp: true });
        click(document.getElementById('user-menu-launcher'));

        click(document.getElementById('user-menu-help'));

        expect(openSpy).toHaveBeenCalledWith(
            'https://learn.microsoft.com/azure/role-based-access-control/role-assignments-portal',
            '_blank',
            'noopener,noreferrer'
        );
    });

    it('keeps Log out final and invokes one safe logout without clearing local content', async () => {
        const { authInteractionController } = createUserMenuHarness();
        localStorage.setItem('whisper_uri', 'https://target.invalid/transcribe');
        const transcript = document.createElement('textarea');
        transcript.value = 'Local transcript fixture';
        document.body.append(transcript);
        click(document.getElementById('user-menu-launcher'));

        const rootButtons = Array.from(document.querySelectorAll('#user-menu-root > button'));
        expect(rootButtons.at(-1).textContent).toBe('Log out');
        click(document.getElementById('user-menu-logout'));
        await Promise.resolve();

        expect(authInteractionController.logOut).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('whisper_uri')).toBe('https://target.invalid/transcribe');
        expect(transcript.value).toBe('Local transcript fixture');
    });

    it.each([
        AUDIO_SAFETY_STATES.ACTIVE,
        AUDIO_SAFETY_STATES.UNSENT,
        AUDIO_SAFETY_STATES.SELECTED
    ])('blocks logout and exposes recovery with zero navigation for %s', async (logoutState) => {
        const { authInteractionController } = createUserMenuHarness({ logoutState });
        click(document.getElementById('user-menu-launcher'));
        click(document.getElementById('user-menu-logout'));
        await Promise.resolve();

        expect(authInteractionController.logOut).toHaveBeenCalledTimes(1);
        expect(document.getElementById('user-menu-surface').hidden).toBe(false);
        if (logoutState === AUDIO_SAFETY_STATES.UNSENT) {
            expect(document.querySelector('[data-menu-panel="logout"]').hidden).toBe(false);
            expect(document.getElementById('user-menu-download-recording').hidden).toBe(false);
            expect(document.getElementById('user-menu-discard-logout').hidden).toBe(false);
        } else if (logoutState === AUDIO_SAFETY_STATES.ACTIVE) {
            expect(document.getElementById('user-menu-status').textContent)
                .toContain('Finish or discard the recording');
        } else {
            expect(document.getElementById('user-menu-status').textContent)
                .toBe('Remove Selected Audio before logging out.');
        }
        expect(authInteractionController.continueLogoutAfterDownload).not.toHaveBeenCalled();
        expect(authInteractionController.discardUnsentAndLogOut).not.toHaveBeenCalled();
    });

    it('reports a blocked logout without exposing a raw failure', async () => {
        createUserMenuHarness({ logoutState: AUTH_RECOVERY_STATES.BLOCKED });
        click(document.getElementById('user-menu-launcher'));

        click(document.getElementById('user-menu-logout'));
        await Promise.resolve();

        expect(document.getElementById('user-menu-status').textContent)
            .toBe('Log out could not be completed. Try again.');
    });
});
