/**
 * @fileoverview Unified User-menu presentation helpers and controller.
 */

import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    AUTH_RECOVERY_STATES
} from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

function normalizeIdentityText(value) {
    return typeof value === 'string'
        ? value.trim().replace(/\s+/gu, ' ')
        : '';
}

function firstGrapheme(value) {
    if (!value) return '';
    if (typeof Intl?.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return segmenter.segment(value)[Symbol.iterator]().next().value?.segment || '';
    }
    return Array.from(value)[0] || '';
}

/**
 * Computes at most two visible initials without retaining identity state.
 *
 * @param {{name?: string, displayName?: string, username?: string}|null} presentation
 * @returns {string}
 */
export function computeInitials(presentation) {
    const displayName = normalizeIdentityText(
        presentation?.displayName || presentation?.name
    );
    const username = normalizeIdentityText(presentation?.username);
    const source = displayName || username;
    if (!source) return '?';

    const parts = displayName
        ? source.split(/\s+/u)
        : source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const selected = parts.slice(0, 2);
    const initials = selected
        .map((part) => firstGrapheme(part).toLocaleUpperCase())
        .join('');
    return initials || '?';
}

const VIEW_LABELS = Object.freeze({
    model: 'Model',
    microphone: 'Microphone',
    settings: 'Settings',
    logout: 'Unsent Recording'
});

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

const AZURE_SETUP_HELP_URL = 'https://learn.microsoft.com/azure/ai-services/openai/how-to/managed-identity';

export class UserMenu {
    constructor({
        authenticationService,
        authInteractionController,
        settings,
        openHelp,
        isNarrow = () => window.matchMedia?.('(max-width: 760px)')?.matches === true
    }) {
        this.authenticationService = authenticationService;
        this.authInteractionController = authInteractionController;
        this.settings = settings;
        this.openHelp = openHelp || (() => {
            window.open(AZURE_SETUP_HELP_URL, '_blank', 'noopener,noreferrer');
        });
        this.isNarrow = isNarrow;

        this.container = document.getElementById('user-menu');
        this.launcher = document.getElementById('user-menu-launcher');
        this.launcherInitials = document.getElementById('user-menu-initials');
        this.surface = document.getElementById('user-menu-surface');
        this.root = document.getElementById('user-menu-root');
        this.detail = document.getElementById('user-menu-detail');
        this.backButton = document.getElementById('user-menu-back');
        this.detailTitle = document.getElementById('user-menu-detail-title');
        this.nameElement = document.getElementById('user-menu-name');
        this.usernameElement = document.getElementById('user-menu-username');
        this.avatar = this.root?.querySelector?.('.user-menu-avatar') || null;
        this.status = document.getElementById('user-menu-status');
        this.logoutStatus = document.getElementById('user-menu-logout-status');
        this.logoutButton = document.getElementById('user-menu-logout');
        this.helpButton = document.getElementById('user-menu-help');
        this.downloadButton = document.getElementById('user-menu-download-recording');
        this.continueLogoutButton = document.getElementById('user-menu-continue-logout');
        this.discardLogoutButton = document.getElementById('user-menu-discard-logout');
        this.viewButtons = Array.from(document.querySelectorAll('[data-menu-view]'));
        this.panels = Array.from(document.querySelectorAll('[data-menu-panel]'));

        this.open = false;
        this.activeView = null;
        this.activeViewInvoker = null;
        this.openingExternalInvoker = null;
        this.openingExternalInvokerTimer = null;
        this._unsubscribers = [];
        this._outsideHandler = (event) => this._handleOutsideClick(event);
        this._keydownHandler = (event) => this._handleKeydown(event);
    }

    init() {
        this.launcher?.addEventListener('click', () => {
            if (this.open) this.dismiss();
            else this.openRoot();
        });
        this.viewButtons.forEach((button) => {
            button.addEventListener('click', () => this.openDetail(button.dataset.menuView, button));
        });
        this.backButton?.addEventListener('click', () => this.closeDetail());
        this.helpButton?.addEventListener('click', () => this.openHelp?.());
        this.logoutButton?.addEventListener('click', () => void this._logOut());
        this.downloadButton?.addEventListener('click', () => void this._downloadForLogout());
        this.continueLogoutButton?.addEventListener('click', () => {
            void this.authInteractionController?.continueLogoutAfterDownload?.();
        });
        this.discardLogoutButton?.addEventListener('click', () => {
            void this.authInteractionController?.discardUnsentAndLogOut?.();
        });
        document.addEventListener('click', this._outsideHandler);
        document.addEventListener('keydown', this._keydownHandler);
        this._unsubscribers.push(eventBus.on(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            ({ state }) => this.updateAuthenticationState(state)
        ));

        const initialState = this.authenticationService?.getState?.();
        if (initialState) this.updateAuthenticationState(initialState);
    }

    updateAuthenticationState(state) {
        if (state !== AUTHENTICATION_STATES.READY) {
            if (this.launcher) this.launcher.hidden = true;
            if (this.open) this.dismiss({ restoreFocus: false });
            return;
        }

        const presentation = this.authenticationService?.getAccountPresentation?.();
        if (!presentation) {
            if (this.launcher) this.launcher.hidden = true;
            return;
        }

        const initials = computeInitials(presentation);
        if (this.launcher) this.launcher.hidden = false;
        if (this.launcherInitials) this.launcherInitials.textContent = initials;
        if (this.avatar) this.avatar.textContent = initials;
        const displayName = presentation.displayName || presentation.name || '';
        if (this.nameElement) this.nameElement.textContent = displayName || presentation.username || '';
        if (this.usernameElement) {
            this.usernameElement.textContent = displayName ? presentation.username || '' : '';
        }
        this.launcher?.setAttribute?.(
            'aria-label',
            `Open User menu for ${displayName || presentation.username || 'current User'}`
        );
    }

    openRoot() {
        if (!this.surface || !this.launcher) return;
        this.open = true;
        this.activeView = null;
        this.surface.hidden = false;
        this.root.hidden = false;
        this.detail.hidden = true;
        this.launcher.setAttribute('aria-expanded', 'true');
        this._setExpandedView(null);
        this._clearStatus();
        this._firstFocusable(this.root)?.focus?.();
    }

    openDetail(view, invoker = null) {
        if (!VIEW_LABELS[view] || !this.surface || !this.detail) return;
        if (invoker && !this.container?.contains?.(invoker)) {
            clearTimeout(this.openingExternalInvokerTimer);
            this.openingExternalInvoker = invoker;
            this.openingExternalInvokerTimer = setTimeout(() => {
                if (this.openingExternalInvoker === invoker) {
                    this.openingExternalInvoker = null;
                }
                this.openingExternalInvokerTimer = null;
            }, 0);
        }
        if (!this.open) this.openRoot();
        if (this.activeView === 'settings' && view !== 'settings') {
            this.settings?.discardSettingsDraft?.();
        }

        this.activeView = view;
        this.activeViewInvoker = invoker || this._viewButton(view);
        this.detail.hidden = false;
        if (this.detailTitle) this.detailTitle.textContent = VIEW_LABELS[view];
        this.panels.forEach((panel) => {
            panel.hidden = panel.dataset.menuPanel !== view;
        });
        this._setExpandedView(view);

        const narrow = this.isNarrow();
        this.root.hidden = narrow;
        if (this.backButton) this.backButton.hidden = !narrow;
        if (view === 'settings') this.settings?.prepareSettingsDraft?.();
        if (view === 'microphone') void this.settings?.populateDeviceList?.();

        const focusTarget = narrow
            ? this.backButton
            : view === 'settings'
                ? this.settings?.getSettingsFocusTarget?.() || this._firstFocusable(this._panel(view))
                : this._firstFocusable(this._panel(view));
        focusTarget?.focus?.();
    }

    closeDetail() {
        if (!this.activeView) return;
        const previousView = this.activeView;
        const invoker = this.activeViewInvoker || this._viewButton(previousView);
        if (previousView === 'settings') this.settings?.discardSettingsDraft?.();
        this.activeView = null;
        this.activeViewInvoker = null;
        this.detail.hidden = true;
        this.root.hidden = false;
        this.panels.forEach((panel) => { panel.hidden = true; });
        this._setExpandedView(null);
        invoker?.focus?.();
    }

    dismiss({ restoreFocus = true } = {}) {
        if (!this.open) return;
        if (this.activeView === 'settings') this.settings?.discardSettingsDraft?.();
        this.open = false;
        this.activeView = null;
        this.activeViewInvoker = null;
        if (this.surface) this.surface.hidden = true;
        if (this.root) this.root.hidden = false;
        if (this.detail) this.detail.hidden = true;
        this.panels.forEach((panel) => { panel.hidden = true; });
        this.launcher?.setAttribute?.('aria-expanded', 'false');
        this._setExpandedView(null);
        if (restoreFocus) this.launcher?.focus?.();
    }

    destroy() {
        clearTimeout(this.openingExternalInvokerTimer);
        this.openingExternalInvokerTimer = null;
        document.removeEventListener('click', this._outsideHandler);
        document.removeEventListener('keydown', this._keydownHandler);
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
        this._unsubscribers = [];
    }

    async _logOut() {
        const result = await this.authInteractionController?.logOut?.();
        if (result?.state === AUDIO_SAFETY_STATES.UNSENT) {
            this.openDetail('logout', this.logoutButton);
            if (this.downloadButton) this.downloadButton.hidden = false;
            if (this.continueLogoutButton) this.continueLogoutButton.hidden = true;
        } else if (result?.state === AUDIO_SAFETY_STATES.ACTIVE) {
            this._setStatus('Finish or discard the recording before logging out.');
        }
    }

    async _downloadForLogout() {
        const result = await this.authInteractionController?.downloadUnsentRecording?.();
        if (result?.state !== AUTH_RECOVERY_STATES.DOWNLOADED) return;
        if (this.downloadButton) this.downloadButton.hidden = true;
        if (this.continueLogoutButton) this.continueLogoutButton.hidden = false;
        if (this.logoutStatus) {
            this.logoutStatus.textContent = 'The recording download was initiated. Continue only when you are ready to leave this page.';
        }
        this.continueLogoutButton?.focus?.();
    }

    _handleOutsideClick(event) {
        if (!this.open || this.container?.contains?.(event.target)) return;
        if (this.openingExternalInvoker?.contains?.(event.target)) return;
        this.dismiss();
    }

    _handleKeydown(event) {
        if (!this.open) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.dismiss();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = this._focusableElements();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    _focusableElements() {
        const owner = this.isNarrow() && this.activeView ? this.detail : this.surface;
        if (!owner?.querySelectorAll) return [];
        return Array.from(owner.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => (
            !element.hidden && !element.closest?.('[hidden]')
        ));
    }

    _firstFocusable(owner) {
        if (!owner?.querySelectorAll) return null;
        return Array.from(owner.querySelectorAll(FOCUSABLE_SELECTOR)).find((element) => (
            !element.hidden && !element.closest?.('[hidden]')
        )) || null;
    }

    _setExpandedView(view) {
        this.viewButtons.forEach((button) => {
            button.setAttribute('aria-expanded', String(button.dataset.menuView === view));
        });
    }

    _viewButton(view) {
        return this.viewButtons.find((button) => button.dataset.menuView === view) || null;
    }

    _panel(view) {
        return this.panels.find((panel) => panel.dataset.menuPanel === view) || null;
    }

    _setStatus(message) {
        if (this.status) this.status.textContent = message;
    }

    _clearStatus() {
        this._setStatus('');
    }
}
