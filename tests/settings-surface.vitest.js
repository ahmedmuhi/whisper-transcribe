/**
 * @fileoverview Settings surface presentation and interaction tests: account
 * identity, the quick-settings popover, the settings modal (categories, search,
 * `Ctrl ,`), and the sign-out safety dialog.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationService } from '../js/authentication-service.js';
import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    AUTH_RECOVERY_STATES,
    MESSAGES,
    MODEL_TYPES
} from '../js/constants.js';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { computeInitials, SettingsSurface } from '../js/settings-surface.js';
import { renderConnectionRows } from '../js/settings.js';

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

describe('Account identity presentation', () => {
    beforeEach(() => {
        eventBus.clear();
        eventBus.setHistoryEnabled(false);
        vi.clearAllMocks();
    });

    it.each([
        ['  Ada   Lovelace  ', '', 'AL'],
        ['張 偉', '', '張偉'],
        ['👩🏽‍💻 Engineer', '', '👩🏽‍💻E'],
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

const indexSource = readFileSync('index.html', 'utf8');

/** Loads the production body so the surface reads the shipped ids and rows. */
function installProductionBody() {
    const body = indexSource.match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
    document.body.innerHTML = body.replace(/<script[^>]*src=[^>]*><\/script>/gu, '');
    // Connection rows are generated from the adapter registry in production;
    // this surface harness stubs Settings, so it renders them the same way.
    renderConnectionRows();
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

/**
 * Happy DOM ships no `<dialog>` behavior, so give the two production dialogs the
 * parts the surface depends on: `open`, `showModal()`, `close()`, and the `close`
 * event that restores focus.
 */
function polyfillDialogs() {
    document.querySelectorAll('dialog').forEach((dialog) => {
        dialog.open = false;
        dialog.showModal = () => { dialog.open = true; };
        dialog.close = () => {
            if (!dialog.open) return;
            dialog.open = false;
            dialog.dispatchEvent(new Event('close'));
        };
    });
}

function click(element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function pressKey(key, init = {}) {
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init
    }));
}

function typeSearch(query) {
    const input = document.getElementById('settings-search');
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function row(name) {
    return document.querySelector(`[data-settings-row="${name}"]`);
}

function visibleRows() {
    return Array.from(document.querySelectorAll('[data-settings-row]'))
        .filter((element) => !element.hidden)
        .map((element) => element.dataset.settingsRow);
}

const openSurfaces = [];

function createSurfaceHarness({
    presentation = { name: 'Example Person', username: 'person@example.invalid' },
    logoutState = AUTH_RECOVERY_STATES.NAVIGATING,
    downloadState = AUTH_RECOVERY_STATES.DOWNLOADED,
    model = MODEL_TYPES.WHISPER,
    authenticationState = AUTHENTICATION_STATES.UNINITIALIZED
} = {}) {
    installProductionBody();
    polyfillDialogs();

    const authenticationService = {
        getState: vi.fn(() => authenticationState),
        getAccountPresentation: vi.fn(() => presentation)
    };
    const authInteractionController = {
        logOut: vi.fn().mockResolvedValue({ state: logoutState }),
        downloadUnsentRecording: vi.fn().mockResolvedValue({ state: downloadState }),
        continueLogoutAfterDownload: vi.fn().mockResolvedValue({
            state: AUTH_RECOVERY_STATES.NAVIGATING
        }),
        discardUnsentAndLogOut: vi.fn().mockResolvedValue({
            state: AUTH_RECOVERY_STATES.NAVIGATING
        })
    };
    const settings = {
        getCurrentModel: vi.fn(() => model),
        populateDeviceList: vi.fn().mockResolvedValue(undefined)
    };

    const surface = new SettingsSurface({
        authenticationService,
        authInteractionController,
        settings
    });
    surface.init();
    openSurfaces.push(surface);

    return { surface, authenticationService, authInteractionController, settings };
}

function signIn() {
    eventBus.emit(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, {
        state: AUTHENTICATION_STATES.READY
    });
}

describe('Settings surface', () => {
    beforeEach(() => {
        eventBus.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        while (openSurfaces.length) openSurfaces.pop().destroy();
    });

    describe('quick-settings popover', () => {
        it('opens from the gear, marks it expanded, and focuses the first control', () => {
            createSurfaceHarness();
            const gear = document.getElementById('quick-settings-button');

            click(gear);

            expect(document.getElementById('quick-settings').hidden).toBe(false);
            expect(gear.getAttribute('aria-expanded')).toBe('true');
            expect(document.activeElement).toBe(document.getElementById('model-select'));
        });

        it('closes on a second gear click and returns focus to the gear', () => {
            createSurfaceHarness();
            const gear = document.getElementById('quick-settings-button');
            click(gear);

            click(gear);

            expect(document.getElementById('quick-settings').hidden).toBe(true);
            expect(gear.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(gear);
        });

        it('closes on an outside click', () => {
            createSurfaceHarness();
            click(document.getElementById('quick-settings-button'));

            click(document.getElementById('transcript'));

            expect(document.getElementById('quick-settings').hidden).toBe(true);
            expect(document.getElementById('quick-settings-button').getAttribute('aria-expanded'))
                .toBe('false');
        });

        it('closes on Escape and returns focus to the gear', () => {
            createSurfaceHarness();
            const gear = document.getElementById('quick-settings-button');
            click(gear);

            pressKey('Escape');

            expect(document.getElementById('quick-settings').hidden).toBe(true);
            expect(document.activeElement).toBe(gear);
        });

        it('leaves the popover alone when Escape arrives with it closed', () => {
            createSurfaceHarness();

            pressKey('Escape');

            expect(document.getElementById('quick-settings').hidden).toBe(true);
        });

        it('swaps the popover for the modal from "All settings…"', () => {
            createSurfaceHarness();
            click(document.getElementById('quick-settings-button'));

            click(document.getElementById('open-all-settings'));

            expect(document.getElementById('quick-settings').hidden).toBe(true);
            expect(document.getElementById('settings-modal').open).toBe(true);
        });
    });

    describe('settings modal', () => {
        it('opens on a requested category, refreshes devices, and announces itself', () => {
            const { surface, settings } = createSurfaceHarness();
            const opened = vi.fn();
            eventBus.on(APP_EVENTS.UI_SETTINGS_OPENED, opened);
            const invoker = document.getElementById('grab-text-button');

            surface.openModal({ category: 'connection', invoker });

            expect(document.getElementById('settings-modal').open).toBe(true);
            expect(document.getElementById('settings-heading').textContent).toBe('Connection');
            expect(visibleRows()).toEqual(['whisperUri', 'maiUri', 'gptTranscribeUri']);
            expect(settings.populateDeviceList).toHaveBeenCalledOnce();
            expect(opened).toHaveBeenCalledOnce();
            expect(document.activeElement).toBe(document.getElementById('settings-search'));
        });

        it('closes from the ✕ control, returning focus to the invoker', () => {
            const { surface } = createSurfaceHarness();
            const closed = vi.fn();
            eventBus.on(APP_EVENTS.UI_SETTINGS_CLOSED, closed);
            const invoker = document.getElementById('grab-text-button');
            surface.openModal({ category: 'model', invoker });

            click(document.getElementById('settings-close'));

            expect(document.getElementById('settings-modal').open).toBe(false);
            expect(document.activeElement).toBe(invoker);
            expect(closed).toHaveBeenCalledOnce();
        });

        it('toggles the modal with Ctrl+, from anywhere and closes the popover with it', () => {
            createSurfaceHarness();
            click(document.getElementById('quick-settings-button'));

            pressKey(',', { ctrlKey: true });

            expect(document.getElementById('settings-modal').open).toBe(true);
            expect(document.getElementById('quick-settings').hidden).toBe(true);

            pressKey(',', { ctrlKey: true });

            expect(document.getElementById('settings-modal').open).toBe(false);
        });

        it('accepts the Cmd+, shortcut and prevents the browser default', () => {
            createSurfaceHarness();
            const event = new KeyboardEvent('keydown', {
                key: ',',
                metaKey: true,
                bubbles: true,
                cancelable: true
            });

            document.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            expect(document.getElementById('settings-modal').open).toBe(true);
        });

        it('switches categories, updating the heading, the active button, and the rows', () => {
            const { surface } = createSurfaceHarness();
            surface.openModal({ category: 'model' });
            const microphone = document.querySelector('[data-settings-category="microphone"]');

            click(microphone);

            expect(document.getElementById('settings-heading').textContent).toBe('Microphone');
            expect(microphone.classList.contains('is-active')).toBe(true);
            expect(microphone.getAttribute('aria-current')).toBe('true');
            const model = document.querySelector('[data-settings-category="model"]');
            expect(model.classList.contains('is-active')).toBe(false);
            expect(model.hasAttribute('aria-current')).toBe(false);
            expect(visibleRows()).toEqual(['device', 'noise']);
        });

        it('shows the verbatim row only while MAI-Transcribe 1.5 is the current model', () => {
            const { surface } = createSurfaceHarness({ model: MODEL_TYPES.WHISPER });
            surface.openModal({ category: 'model' });
            expect(row('verbatim').hidden).toBe(true);
            expect(visibleRows()).toEqual(['model']);

            openSurfaces.pop().destroy();
            const mai = createSurfaceHarness({ model: MODEL_TYPES.MAI_TRANSCRIBE_1_5 });
            mai.surface.openModal({ category: 'model' });

            expect(row('verbatim').hidden).toBe(false);
            expect(visibleRows()).toEqual(['model', 'verbatim']);
        });
    });

    describe('settings search', () => {
        it('matches keywords across categories and labels each hit with its chip', () => {
            const { surface } = createSurfaceHarness();
            surface.openModal({ category: 'model' });

            typeSearch('Whisper');

            expect(visibleRows()).toEqual(['model', 'whisperUri']);
            expect(document.getElementById('settings-heading').textContent)
                .toBe('Results for "Whisper"');
            expect(document.getElementById('settings-no-results').hidden).toBe(true);
            expect(row('model').querySelector('.settings-row-chip').hidden).toBe(false);
            expect(row('whisperUri').querySelector('.settings-row-chip').hidden).toBe(false);
        });

        it('keeps the verbatim row out of results while Whisper is the current model', () => {
            const { surface } = createSurfaceHarness({ model: MODEL_TYPES.WHISPER });
            surface.openModal({ category: 'model' });

            typeSearch('verbatim');

            expect(row('verbatim').hidden).toBe(true);
            expect(visibleRows()).toEqual([]);
            expect(document.getElementById('settings-no-results').textContent)
                .toBe('No settings match "verbatim"');
        });

        it('reports an empty result set and recovers when the query is cleared', () => {
            const { surface } = createSurfaceHarness();
            surface.openModal({ category: 'appearance' });

            typeSearch('nothing-matches-this');

            const noResults = document.getElementById('settings-no-results');
            expect(visibleRows()).toEqual([]);
            expect(noResults.hidden).toBe(false);
            expect(noResults.textContent).toBe('No settings match "nothing-matches-this"');

            typeSearch('');

            expect(noResults.hidden).toBe(true);
            expect(visibleRows()).toEqual(['theme']);
            expect(document.getElementById('settings-heading').textContent).toBe('Appearance');
            expect(row('theme').querySelector('.settings-row-chip').hidden).toBe(true);
        });
    });

    describe('account presentation', () => {
        it('withholds identity until authentication is READY and keeps the gear reachable', () => {
            createSurfaceHarness();
            const badge = document.getElementById('user-badge');

            expect(badge.hidden).toBe(true);
            expect(badge.textContent).toBe('');
            expect(document.getElementById('settings-account-name').textContent).toBe('');
            expect(document.querySelector('.settings-account').hidden).toBe(true);
            expect(document.getElementById('quick-settings-button').hidden).toBe(false);
        });

        it('renders initials and the display name once READY arrives', () => {
            createSurfaceHarness();

            signIn();

            const badge = document.getElementById('user-badge');
            expect(badge.hidden).toBe(false);
            expect(badge.textContent).toBe('EP');
            expect(badge.title).toBe('Example Person');
            expect(document.getElementById('settings-avatar').textContent).toBe('EP');
            expect(document.getElementById('settings-account-name').textContent)
                .toBe('Example Person');
            expect(document.querySelector('.settings-account').hidden).toBe(false);
        });

        it('withdraws identity again when authentication leaves READY', () => {
            createSurfaceHarness();
            signIn();

            eventBus.emit(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, {
                state: AUTHENTICATION_STATES.SIGNED_OUT
            });

            expect(document.getElementById('user-badge').hidden).toBe(true);
            expect(document.getElementById('user-badge').textContent).toBe('');
            expect(document.getElementById('settings-avatar').textContent).toBe('?');
            expect(document.getElementById('settings-account-name').textContent).toBe('');
            expect(document.querySelector('.settings-account').hidden).toBe(true);
            expect(document.getElementById('quick-settings-button').hidden).toBe(false);
        });
    });

    describe('sign out', () => {
        it('routes one safe sign-out without clearing local content', async () => {
            const { authInteractionController } = createSurfaceHarness();
            signIn();
            localStorage.setItem('whisper_uri', 'https://target.invalid/transcribe');
            const transcript = document.getElementById('transcript');
            transcript.value = 'Local transcript fixture';

            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            expect(authInteractionController.logOut).toHaveBeenCalledTimes(1);
            expect(document.getElementById('logout-dialog').open).toBe(false);
            expect(localStorage.getItem('whisper_uri')).toBe('https://target.invalid/transcribe');
            expect(transcript.value).toBe('Local transcript fixture');
        });

        it('names the Unsent Recording and offers download or discard before leaving', async () => {
            const { authInteractionController } = createSurfaceHarness({
                logoutState: AUDIO_SAFETY_STATES.UNSENT
            });
            signIn();

            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            expect(document.getElementById('logout-dialog').open).toBe(true);
            expect(document.getElementById('logout-dialog-status').textContent)
                .toBe('Protect the Unsent Recording before signing out.');
            expect(document.getElementById('logout-download').hidden).toBe(false);
            expect(document.getElementById('logout-discard').hidden).toBe(false);
            expect(document.getElementById('logout-continue').hidden).toBe(true);
            expect(document.activeElement).toBe(document.getElementById('logout-download'));
            expect(authInteractionController.continueLogoutAfterDownload).not.toHaveBeenCalled();
            expect(authInteractionController.discardUnsentAndLogOut).not.toHaveBeenCalled();
        });

        it('requires an explicit continue after the download is initiated', async () => {
            const { authInteractionController } = createSurfaceHarness({
                logoutState: AUDIO_SAFETY_STATES.UNSENT
            });
            signIn();
            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            click(document.getElementById('logout-download'));
            await Promise.resolve();
            await Promise.resolve();

            expect(authInteractionController.downloadUnsentRecording).toHaveBeenCalledTimes(1);
            expect(document.getElementById('logout-download').hidden).toBe(true);
            expect(document.getElementById('logout-continue').hidden).toBe(false);
            expect(document.getElementById('logout-dialog-status').textContent)
                .toContain('download was initiated');
            expect(document.activeElement).toBe(document.getElementById('logout-continue'));
            expect(authInteractionController.continueLogoutAfterDownload).not.toHaveBeenCalled();

            click(document.getElementById('logout-continue'));
            await Promise.resolve();

            expect(authInteractionController.continueLogoutAfterDownload).toHaveBeenCalledTimes(1);
        });

        it('reports a failed download and keeps the recovery choices open', async () => {
            const { authInteractionController } = createSurfaceHarness({
                logoutState: AUDIO_SAFETY_STATES.UNSENT,
                downloadState: AUTH_RECOVERY_STATES.BLOCKED
            });
            signIn();
            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            click(document.getElementById('logout-download'));
            await Promise.resolve();
            await Promise.resolve();

            expect(document.getElementById('logout-dialog-status').textContent)
                .toBe(MESSAGES.RECORDING_DOWNLOAD_FAILED);
            expect(document.getElementById('logout-download').hidden).toBe(false);
            expect(document.getElementById('logout-continue').hidden).toBe(true);
            expect(authInteractionController.continueLogoutAfterDownload).not.toHaveBeenCalled();
        });

        it('discards the Unsent Recording only on the explicit discard action', async () => {
            const { authInteractionController } = createSurfaceHarness({
                logoutState: AUDIO_SAFETY_STATES.UNSENT
            });
            signIn();
            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            click(document.getElementById('logout-discard'));
            await Promise.resolve();

            expect(authInteractionController.discardUnsentAndLogOut).toHaveBeenCalledTimes(1);
            expect(authInteractionController.continueLogoutAfterDownload).not.toHaveBeenCalled();
        });

        it.each([
            [AUDIO_SAFETY_STATES.ACTIVE, 'Finish or discard the recording before signing out.'],
            [AUDIO_SAFETY_STATES.SELECTED, 'Remove Selected Audio before signing out.'],
            [AUTH_RECOVERY_STATES.BLOCKED, MESSAGES.LOGOUT_FAILED]
        ])('explains a blocked sign-out for %s with Cancel as the only way on', async (
            logoutState,
            message
        ) => {
            const { authInteractionController } = createSurfaceHarness({ logoutState });
            signIn();

            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            expect(authInteractionController.logOut).toHaveBeenCalledTimes(1);
            expect(document.getElementById('logout-dialog').open).toBe(true);
            expect(document.getElementById('logout-dialog-status').textContent).toBe(message);
            expect(document.getElementById('logout-download').hidden).toBe(true);
            expect(document.getElementById('logout-discard').hidden).toBe(true);
            expect(document.getElementById('logout-continue').hidden).toBe(true);
            expect(authInteractionController.continueLogoutAfterDownload).not.toHaveBeenCalled();
            expect(authInteractionController.discardUnsentAndLogOut).not.toHaveBeenCalled();
        });

        it('closes the safety dialog on Cancel and returns focus to Sign out', async () => {
            createSurfaceHarness({ logoutState: AUDIO_SAFETY_STATES.ACTIVE });
            signIn();
            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();

            click(document.getElementById('logout-cancel'));

            expect(document.getElementById('logout-dialog').open).toBe(false);
            expect(document.activeElement).toBe(document.getElementById('settings-sign-out'));
        });

        it('treats a rejected sign-out as blocked rather than leaking the failure', async () => {
            const { authInteractionController } = createSurfaceHarness();
            authInteractionController.logOut.mockRejectedValueOnce(
                new Error('fixture-transport-failure')
            );
            signIn();

            click(document.getElementById('settings-sign-out'));
            await Promise.resolve();
            await Promise.resolve();

            const status = document.getElementById('logout-dialog-status').textContent;
            expect(status).toBe(MESSAGES.LOGOUT_FAILED);
            expect(status).not.toContain('fixture-transport-failure');
        });
    });
});
