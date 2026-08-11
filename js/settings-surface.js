/**
 * @fileoverview Settings surface: quick-settings popover, settings modal, account
 * presentation, and the logout safety dialog. Replaces the former User menu.
 */

import {
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    AUTH_RECOVERY_STATES,
    ID,
    MESSAGES,
    MODEL_TYPES
} from './constants.js';
import { APP_EVENTS, eventBus } from './event-bus.js';

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

/** Settings categories in sidebar order, mapped to their content headings. */
const CATEGORY_LABELS = Object.freeze({
    model: 'Model',
    microphone: 'Microphone',
    appearance: 'Appearance',
    connection: 'Connection'
});

const DEFAULT_CATEGORY = 'model';

/** Class marking the active category button and the searching modal state. */
const ACTIVE_CLASS = 'is-active';
const SEARCHING_CLASS = 'settings-searching';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Owns every settings presentation surface: the header gear popover, the
 * settings modal (categories, search, account footer), the `Ctrl ,` shortcut,
 * and the logout safety dialog. Preference persistence stays in `Settings`.
 */
export class SettingsSurface {
    constructor({ authenticationService, authInteractionController, settings }) {
        this.authenticationService = authenticationService;
        this.authInteractionController = authInteractionController;
        this.settings = settings;

        this.gearButton = document.getElementById(ID.QUICK_SETTINGS_BUTTON);
        this.popover = document.getElementById(ID.QUICK_SETTINGS);
        this.openAllSettingsButton = document.getElementById(ID.OPEN_ALL_SETTINGS);
        this.userBadge = document.getElementById(ID.USER_BADGE);

        this.modal = document.getElementById(ID.SETTINGS_MODAL);
        this.searchInput = document.getElementById(ID.SETTINGS_SEARCH);
        this.heading = document.getElementById(ID.SETTINGS_HEADING);
        this.closeButton = document.getElementById(ID.SETTINGS_CLOSE);
        this.noResults = document.getElementById(ID.SETTINGS_NO_RESULTS);
        this.avatar = document.getElementById(ID.SETTINGS_AVATAR);
        this.accountName = document.getElementById(ID.SETTINGS_ACCOUNT_NAME);
        this.signOutButton = document.getElementById(ID.SETTINGS_SIGN_OUT);
        this.accountBlock = this.signOutButton?.closest?.('.settings-account') || null;
        this.categoryButtons = Array.from(
            this.modal?.querySelectorAll?.('[data-settings-category]') || []
        );
        this.rows = Array.from(this.modal?.querySelectorAll?.('[data-settings-row]') || []);

        this.logoutDialog = document.getElementById(ID.LOGOUT_DIALOG);
        this.logoutStatus = document.getElementById(ID.LOGOUT_DIALOG_STATUS);
        this.logoutDownloadButton = document.getElementById(ID.LOGOUT_DOWNLOAD);
        this.logoutContinueButton = document.getElementById(ID.LOGOUT_CONTINUE);
        this.logoutDiscardButton = document.getElementById(ID.LOGOUT_DISCARD);
        this.logoutCancelButton = document.getElementById(ID.LOGOUT_CANCEL);

        this.popoverOpen = false;
        this.activeCategory = DEFAULT_CATEGORY;
        this.modalInvoker = null;
        this.logoutInvoker = null;
        this._unsubscribers = [];
        this._outsideHandler = (event) => this._handleOutsideClick(event);
        this._keydownHandler = (event) => this._handleKeydown(event);
    }

    init() {
        this.gearButton?.addEventListener('click', () => this.togglePopover());
        this.openAllSettingsButton?.addEventListener('click', () => {
            const invoker = this.gearButton;
            this.closePopover({ restoreFocus: false });
            this.openModal({ invoker });
        });
        this.closeButton?.addEventListener('click', () => this.closeModal());
        this.categoryButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.selectCategory(button.dataset.settingsCategory);
            });
        });
        this.searchInput?.addEventListener('input', () => this.applyFilter());
        this.signOutButton?.addEventListener('click', () => void this._logOut());
        this.logoutDownloadButton?.addEventListener('click', () => void this._downloadForLogout());
        this.logoutContinueButton?.addEventListener('click', () => {
            void this._continueLogoutAfterDownload();
        });
        this.logoutDiscardButton?.addEventListener('click', () => {
            void this._discardUnsentAndLogOut();
        });
        this.logoutCancelButton?.addEventListener('click', () => this._closeLogoutDialog());
        this.modal?.addEventListener('close', () => this._afterModalClose());
        this.logoutDialog?.addEventListener('close', () => this._afterLogoutDialogClose());
        document.addEventListener('click', this._outsideHandler);
        document.addEventListener('keydown', this._keydownHandler);

        this._unsubscribers.push(eventBus.on(
            APP_EVENTS.AUTHENTICATION_STATE_CHANGED,
            ({ state }) => this.updateAuthenticationState(state)
        ));

        this.selectCategory(this.activeCategory);
        this.updateAuthenticationState(
            this.authenticationService?.getState?.() || AUTHENTICATION_STATES.UNINITIALIZED
        );
    }

    destroy() {
        document.removeEventListener('click', this._outsideHandler);
        document.removeEventListener('keydown', this._keydownHandler);
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
        this._unsubscribers = [];
    }

    /* ---------------------------------------------------------------- account */

    /**
     * Shows account presentation only while authentication is READY. The gear
     * button stays visible in every state so settings remain reachable.
     *
     * @param {string} state
     */
    updateAuthenticationState(state) {
        const presentation = state === AUTHENTICATION_STATES.READY
            ? this.authenticationService?.getAccountPresentation?.()
            : null;

        if (!presentation) {
            this._setAccountVisible(false);
            if (this.userBadge) {
                this.userBadge.textContent = '';
                this.userBadge.removeAttribute('title');
                this.userBadge.removeAttribute('aria-label');
            }
            if (this.avatar) this.avatar.textContent = '?';
            if (this.accountName) this.accountName.textContent = '';
            return;
        }

        const initials = computeInitials(presentation);
        const displayName = presentation.displayName
            || presentation.name
            || presentation.username
            || '';
        if (this.userBadge) {
            this.userBadge.textContent = initials;
            if (displayName) {
                this.userBadge.title = displayName;
                this.userBadge.setAttribute('aria-label', `Signed in as ${displayName}`);
            }
        }
        if (this.avatar) this.avatar.textContent = initials;
        if (this.accountName) this.accountName.textContent = displayName;
        this._setAccountVisible(true);
    }

    _setAccountVisible(visible) {
        if (this.userBadge) this.userBadge.hidden = !visible;
        if (this.accountBlock) this.accountBlock.hidden = !visible;
        else if (this.signOutButton) this.signOutButton.hidden = !visible;
    }

    /* --------------------------------------------------------------- popover */

    togglePopover() {
        if (this.popoverOpen) this.closePopover();
        else this.openPopover();
    }

    openPopover() {
        if (!this.popover) return;
        this.popoverOpen = true;
        this.popover.hidden = false;
        this.gearButton?.setAttribute?.('aria-expanded', 'true');
        this._firstFocusable(this.popover)?.focus?.();
    }

    closePopover({ restoreFocus = true } = {}) {
        if (!this.popoverOpen) return;
        this.popoverOpen = false;
        if (this.popover) this.popover.hidden = true;
        this.gearButton?.setAttribute?.('aria-expanded', 'false');
        if (restoreFocus) this.gearButton?.focus?.();
    }

    /* ----------------------------------------------------------------- modal */

    /** @returns {boolean} */
    isModalOpen() {
        return this.modal?.open === true;
    }

    /**
     * Opens the settings modal on a category and remembers the invoker so focus
     * can return to it on close.
     *
     * @param {{category?: string, invoker?: HTMLElement|null}} [options]
     */
    openModal({ category, invoker = null } = {}) {
        if (!this.modal) return;
        this.closePopover({ restoreFocus: false });
        this.modalInvoker = invoker || this.modalInvoker || this.gearButton;
        if (this.searchInput) this.searchInput.value = '';
        this.selectCategory(category || this.activeCategory || DEFAULT_CATEGORY);
        void this.settings?.populateDeviceList?.();

        if (!this.modal.open) {
            if (typeof this.modal.showModal === 'function') this.modal.showModal();
            else this.modal.open = true;
        }
        this._firstFocusable(this.modal)?.focus?.();
        eventBus.emit(APP_EVENTS.UI_SETTINGS_OPENED);
    }

    closeModal() {
        if (!this.modal) return;
        if (typeof this.modal.close === 'function') this.modal.close();
        else {
            this.modal.open = false;
            this._afterModalClose();
        }
    }

    _afterModalClose() {
        const invoker = this.modalInvoker;
        this.modalInvoker = null;
        invoker?.focus?.();
        eventBus.emit(APP_EVENTS.UI_SETTINGS_CLOSED);
    }

    /* ------------------------------------------------ categories and search */

    /**
     * Activates a settings category and refreshes the visible rows.
     *
     * @param {string} category
     */
    selectCategory(category) {
        const next = CATEGORY_LABELS[category] ? category : DEFAULT_CATEGORY;
        this.activeCategory = next;
        this.categoryButtons.forEach((button) => {
            const active = button.dataset.settingsCategory === next;
            button.classList.toggle(ACTIVE_CLASS, active);
            if (active) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
        });
        this.applyFilter();
    }

    /**
     * Re-applies row visibility after something outside the modal changed what
     * belongs in it — today, a model switch made from the quick-settings popover.
     */
    refreshRows() {
        this.applyFilter();
    }

    /** Re-runs row visibility for the active search query or category. */
    applyFilter() {
        const query = (this.searchInput?.value || '').trim().toLowerCase();
        const searching = query.length > 0;
        this.modal?.classList?.toggle(SEARCHING_CLASS, searching);

        let matches = 0;
        this.rows.forEach((row) => {
            const visible = searching
                ? (row.dataset.keywords || '').toLowerCase().includes(query)
                : row.dataset.category === this.activeCategory;
            const allowed = visible && this._isRowAllowed(row);
            row.hidden = !allowed;
            if (allowed) matches += 1;
            const chip = row.querySelector?.('.settings-row-chip');
            if (chip) chip.hidden = !searching;
        });

        if (this.heading) {
            this.heading.textContent = searching
                ? `Results for "${this.searchInput.value.trim()}"`
                : CATEGORY_LABELS[this.activeCategory];
        }
        if (this.noResults) {
            const empty = searching && matches === 0;
            this.noResults.hidden = !empty;
            this.noResults.textContent = empty
                ? `No settings match "${this.searchInput.value.trim()}"`
                : '';
        }
    }

    /** The verbatim row belongs to MAI-Transcribe 1.5 only, search included. */
    _isRowAllowed(row) {
        if (row.dataset.settingsRow !== 'verbatim') return true;
        return this.settings?.getCurrentModel?.() === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
    }

    /* -------------------------------------------------------------- log out */

    async _logOut() {
        this.logoutInvoker = this.signOutButton;
        let result;
        try {
            result = await this.authInteractionController?.logOut?.();
        } catch {
            result = { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        if (result?.state === AUDIO_SAFETY_STATES.UNSENT) {
            this._openLogoutDialog('Protect the Unsent Recording before logging out.', {
                download: true
            });
        } else if (result?.state === AUDIO_SAFETY_STATES.ACTIVE) {
            this._openLogoutDialog('Finish or discard the recording before logging out.');
        } else if (result?.state === AUDIO_SAFETY_STATES.SELECTED) {
            this._openLogoutDialog('Remove Selected Audio before logging out.');
        } else if (result?.state === AUTH_RECOVERY_STATES.BLOCKED) {
            this._openLogoutDialog(MESSAGES.LOGOUT_FAILED);
        }
    }

    async _downloadForLogout() {
        let result;
        try {
            result = await this.authInteractionController?.downloadUnsentRecording?.();
        } catch {
            result = { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        if (result?.state === AUTH_RECOVERY_STATES.BLOCKED) {
            this._setLogoutStatus(MESSAGES.RECORDING_DOWNLOAD_FAILED);
            return;
        }
        if (result?.state !== AUTH_RECOVERY_STATES.DOWNLOADED) return;
        if (this.logoutDownloadButton) this.logoutDownloadButton.hidden = true;
        if (this.logoutContinueButton) this.logoutContinueButton.hidden = false;
        this._setLogoutStatus('The recording download was initiated. Continue only when you are ready to leave this page.');
        this.logoutContinueButton?.focus?.();
    }

    async _continueLogoutAfterDownload() {
        let result;
        try {
            result = await this.authInteractionController?.continueLogoutAfterDownload?.();
        } catch {
            result = { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        if (result?.state === AUTH_RECOVERY_STATES.BLOCKED) {
            this._setLogoutStatus(MESSAGES.LOGOUT_FAILED);
        }
    }

    async _discardUnsentAndLogOut() {
        let result;
        try {
            result = await this.authInteractionController?.discardUnsentAndLogOut?.();
        } catch {
            result = { state: AUTH_RECOVERY_STATES.BLOCKED };
        }
        if (result?.state === AUTH_RECOVERY_STATES.BLOCKED) {
            this._setLogoutStatus(MESSAGES.LOGOUT_FAILED);
        }
    }

    _openLogoutDialog(message, { download = false } = {}) {
        this._setLogoutStatus(message);
        if (this.logoutDownloadButton) this.logoutDownloadButton.hidden = !download;
        if (this.logoutContinueButton) this.logoutContinueButton.hidden = true;
        if (this.logoutDiscardButton) this.logoutDiscardButton.hidden = !download;
        if (!this.logoutDialog) return;
        if (!this.logoutDialog.open) {
            if (typeof this.logoutDialog.showModal === 'function') this.logoutDialog.showModal();
            else this.logoutDialog.open = true;
        }
        this._firstFocusable(this.logoutDialog)?.focus?.();
    }

    _closeLogoutDialog() {
        if (!this.logoutDialog) return;
        if (typeof this.logoutDialog.close === 'function') this.logoutDialog.close();
        else {
            this.logoutDialog.open = false;
            this._afterLogoutDialogClose();
        }
    }

    _afterLogoutDialogClose() {
        const invoker = this.logoutInvoker;
        this.logoutInvoker = null;
        invoker?.focus?.();
    }

    _setLogoutStatus(message) {
        if (this.logoutStatus) this.logoutStatus.textContent = message;
    }

    /* --------------------------------------------------------------- events */

    _handleOutsideClick(event) {
        if (!this.popoverOpen) return;
        if (this.popover?.contains?.(event.target)) return;
        if (this.gearButton?.contains?.(event.target)) return;
        this.closePopover({ restoreFocus: false });
    }

    _handleKeydown(event) {
        if (event.key === ',' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (this.isModalOpen()) this.closeModal();
            else this.openModal({ invoker: document.activeElement });
            return;
        }
        if (event.key !== 'Escape') return;
        if (this.popoverOpen) {
            event.preventDefault();
            this.closePopover();
        }
    }

    _firstFocusable(owner) {
        if (!owner?.querySelectorAll) return null;
        return Array.from(owner.querySelectorAll(FOCUSABLE_SELECTOR)).find((element) => (
            !element.hidden && !element.closest?.('[hidden]')
        )) || null;
    }
}
