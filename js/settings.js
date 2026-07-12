/**
 * @fileoverview Settings management for API configuration and user preferences.
 */

import { STORAGE_KEYS, MESSAGES, ID, MODEL_TYPES, DEFAULT_MODEL_TYPE, RECORDING_ENVIRONMENTS, API_KEY_VALUE_PATTERN } from './constants.js';
import { PermissionManager } from './permission-manager.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';
import { modelAdapterRegistry } from './model-adapters/index.js';

/**
 * Settings manager for API configuration and user preferences.
 * Handles model selection, API credentials, validation, and persistence to localStorage.
 * Provides configuration for Azure Whisper transcription models.
 * 
 * @class Settings
 * @fires APP_EVENTS.SETTINGS_UPDATED
 * @fires APP_EVENTS.SETTINGS_MODEL_CHANGED
 * @fires APP_EVENTS.SETTINGS_SAVED
 * @fires APP_EVENTS.SETTINGS_VALIDATION_ERROR
 * 
 * @example
 * const settings = new Settings();
 * 
 * // Get current model configuration
 * const config = settings.getModelConfig();
 * logger.info('Current model:', config.model);
 * 
 * // Open settings modal
 * settings.openSettingsModal();
 */
export class Settings {
    /**
     * Creates a new Settings manager instance.
     * Initializes DOM references and loads saved settings.
     *
     * @param {Map<string, object>} [adapterRegistry=modelAdapterRegistry] Registry of model adapters.
     */
    constructor(adapterRegistry = modelAdapterRegistry) {
        this.adapterRegistry = adapterRegistry;
        this.modelSelect = document.getElementById(ID.MODEL_SELECT);
        this.settingsModelSelect = document.getElementById(ID.SETTINGS_MODEL_SELECT);
        this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
        this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
        this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
        this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);

        // Cache the status element with the other DOM references
        this.statusElement = document.getElementById(ID.STATUS);
    // Cache settings containers and form inputs
    this.whisperSettings = document.getElementById(ID.WHISPER_SETTINGS);
    this.whisperUriInput = document.getElementById(ID.WHISPER_URI);
    this.whisperKeyInput = document.getElementById(ID.WHISPER_KEY);
    this.maiTranscribeSettings = document.getElementById(ID.MAI_TRANSCRIBE_SETTINGS);
    this.maiTranscribeUriInput = document.getElementById(ID.MAI_TRANSCRIBE_URI);
    this.maiTranscribeKeyInput = document.getElementById(ID.MAI_TRANSCRIBE_KEY);
    this.recordingEnvironmentSelect = document.getElementById(ID.RECORDING_ENVIRONMENT);

        // Side panel elements
        this.sidePanel = document.getElementById(ID.SIDE_PANEL);
        this.panelToggle = document.getElementById(ID.PANEL_TOGGLE);
        this.panelClose = document.getElementById(ID.PANEL_CLOSE);
        this.panelBackdrop = document.getElementById(ID.PANEL_BACKDROP);
        this.noiseToggle = document.getElementById(ID.NOISE_TOGGLE);
        this.inputDeviceSelect = document.getElementById(ID.INPUT_DEVICE);
        this._settingsModalInvoker = null;
        this._settingsModalIsOpen = false;
        this._settingsModalUsesNativeDialog = false;
        this._fallbackModalAttributes = null;
        this._fallbackBackgroundState = [];

        this.init();
    }
    
    /**
     * Initializes the settings manager.
     * Loads saved preferences, sets up event listeners, and validates configuration.
     * 
     * @private
     * @method init
     */
    init() {
        this.loadSavedModel();
        this.loadNoiseToggle();
        this.setupEventListeners();
        this.setupPanelListeners();
        this.updateSettingsVisibility();
        this.checkInitialSettings();
    }

    /**
     * Load the noise toggle state from the recording environment setting.
     * @private
     */
    loadNoiseToggle() {
        const env = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT) || RECORDING_ENVIRONMENTS.QUIET;
        if (this.noiseToggle) {
            this.noiseToggle.checked = env === RECORDING_ENVIRONMENTS.NOISY;
        }
    }
    
    /**
     * Loads the previously saved transcription model from localStorage.
     * Defaults to 'whisper' if no model has been saved.
     * 
     * @private
     * @method loadSavedModel
     */
    loadSavedModel() {
        const defaultModel = DEFAULT_MODEL_TYPE;
        let savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || defaultModel;

        // Validate against the selectable dropdown options (the real UI set),
        // not the adapter registry — the registry includes the hidden
        // 'whisper-translate' adapter that is not a dropdown option, so
        // validating against it could leave a stored 'whisper-translate'
        // pointing at no visible selection. If the saved model is no longer
        // selectable (e.g. the removed 'mai-transcribe'), reset to the default
        // and persist the correction.
        const selectable = this._getSelectableModels();
        if (selectable.length > 0 && !selectable.includes(savedModel)) {
            savedModel = defaultModel;
            localStorage.setItem(STORAGE_KEYS.MODEL, savedModel);
        }

        this.modelSelect.value = savedModel;
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = savedModel;
        }
    }

    /**
     * The set of model ids the user can actually pick from the main dropdown.
     * Read from the live <option> values so the selectable set is the single
     * source of truth (not the adapter registry, which carries hidden models).
     * Returns [] when no options are present (e.g. a mocked test DOM) so callers
     * can fail open and skip validation rather than wrongly resetting.
     *
     * @private
     * @returns {string[]} Selectable model ids
     */
    _getSelectableModels() {
        const options = this.modelSelect?.options
            ? Array.from(this.modelSelect.options)
            : [];
        return options.map(o => o.value).filter(Boolean);
    }
    
    /**
     * Sets up event listeners for settings UI interactions.
     * Handles model changes, modal opening/closing, and form submission.
     * 
     * @private
     * @method setupEventListeners
     * @fires APP_EVENTS.SETTINGS_MODEL_CHANGED
     * @fires APP_EVENTS.UI_SETTINGS_OPENED
     * @fires APP_EVENTS.UI_SETTINGS_CLOSED
     */
    setupEventListeners() {
        // Main interface model change listener
        this.modelSelect.addEventListener('change', (e) => {
            const newModel = e.target.value;
            const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
            
            // Do NOT persist to localStorage for main UI selector changes
            const settingsLogger = logger.child('Settings');
            settingsLogger.info('UI model switched to:', newModel, '(session only)');
            
            // Sync settings modal selector to show current UI selection
            if (this.settingsModelSelect) {
                this.settingsModelSelect.value = newModel;
            }
            this.updateSettingsVisibility();
            
            // Emit UI-only model switched event (no persistence)
            eventBus.emit(APP_EVENTS.UI_MODEL_SWITCHED, {
                model: newModel,
                savedModel: savedModel
            });
        });

        // Settings modal model change listener
        if (this.settingsModelSelect) {
            this.settingsModelSelect.addEventListener('change', (e) => {
                const newModel = e.target.value;
                
                // Do NOT persist to localStorage until save is clicked
                const settingsLogger = logger.child('Settings');
                settingsLogger.info('Settings modal model changed to:', newModel, '(form only, not saved)');
                
                this.updateSettingsVisibility();
                
                // Do NOT emit any events until settings are saved
                // This keeps the form state separate from persisted configuration
            });
        }
        
        // Settings button listener (now inside the panel footer)
        this.settingsButton.addEventListener('click', () => {
            this.openSettingsModal(this.settingsButton);
        });
        
        // Close modal listeners
        this.closeModalButton.addEventListener('click', () => {
            this.closeSettingsModal();
        });
        
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal || e.target?.classList?.contains('modal-backdrop')) {
                this.closeSettingsModal();
            }
        });

        // Native <dialog> dispatches 'cancel' for Escape. Prevent its automatic
        // close so every exit takes the same draft-discard and focus-return path.
        this.settingsModal.addEventListener('cancel', (event) => {
            if (!this._settingsModalIsOpen) return;
            event.preventDefault();
            this.closeSettingsModal();
        });

        // Browsers without showModal() need their own Escape and Tab handling.
        // Native dialogs retain browser-provided containment and never enter this path.
        this._fallbackModalKeydownHandler = (event) => {
            if (!this._settingsModalIsOpen || this._settingsModalUsesNativeDialog) return;

            if (event.key === 'Escape') {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                this.closeSettingsModal();
            } else if (event.key === 'Tab') {
                this._containFallbackModalFocus(event);
            }
        };
        if (document.addEventListener) {
            document.addEventListener('keydown', this._fallbackModalKeydownHandler);
        }
        
        // Save settings listener
        this.saveSettingsButton.addEventListener('click', () => {
            this.saveSettings();
        });

        // Noise toggle — live-save to localStorage
        if (this.noiseToggle) {
            this.noiseToggle.addEventListener('change', () => {
                const env = this.noiseToggle.checked
                    ? RECORDING_ENVIRONMENTS.NOISY
                    : RECORDING_ENVIRONMENTS.QUIET;
                localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, env);
                if (this.recordingEnvironmentSelect) {
                    this.recordingEnvironmentSelect.value = env;
                }
            });
        }

        // Input device — live-save to localStorage
        if (this.inputDeviceSelect) {
            this.inputDeviceSelect.addEventListener('change', () => {
                const deviceId = this.inputDeviceSelect.value;
                if (deviceId) {
                    localStorage.setItem(STORAGE_KEYS.INPUT_DEVICE, deviceId);
                } else {
                    localStorage.removeItem(STORAGE_KEYS.INPUT_DEVICE);
                }
                eventBus.emit(APP_EVENTS.DEVICE_CHANGED, { deviceId });
            });
        }
    }

    /**
     * Set up Notion-style side panel with 3 states:
     * - pinned: sidebar visible, pushes content
     * - hover-preview: floating overlay on hamburger hover
     * - closed: sidebar hidden
     * @private
     */
    setupPanelListeners() {
        // Click hamburger → pin the sidebar open
        if (this.panelToggle) {
            this.panelToggle.addEventListener('click', () => {
                this._clearHoverTimers();
                this.pinSidebar();
            });

            // Hover hamburger → show floating preview after delay
            this.panelToggle.addEventListener('mouseenter', () => {
                if (!this._isSidebarPinned()) {
                    this._hoverOpenTimer = setTimeout(() => {
                        this._showHoverPreview();
                    }, 400);
                }
            });

            this.panelToggle.addEventListener('mouseleave', () => {
                this._clearHoverTimers();
            });
        }

        // « collapse button → unpin / close
        if (this.panelClose) {
            this.panelClose.addEventListener('click', () => this.unpinSidebar());
        }

        // Backdrop click (mobile) → close
        if (this.panelBackdrop) {
            this.panelBackdrop.addEventListener('click', () => this.unpinSidebar());
        }

        // Sidebar hover interactions
        if (this.sidePanel) {
            // Click sidebar while in hover-preview → pin it
            this.sidePanel.addEventListener('click', (e) => {
                if (this.sidePanel.classList.contains('hover-preview')) {
                    // Don't pin when interacting with controls inside the panel.
                    // This keeps hover-preview behavior consistent for actions like opening settings.
                    const interactiveTarget = typeof e.target.closest === 'function'
                        ? e.target.closest('button,select,input,option,label,a,textarea')
                        : null;
                    if (interactiveTarget) return;
                    this.pinSidebar();
                }
            });

            // Mouse leaves sidebar during hover-preview → hide after delay
            this.sidePanel.addEventListener('mouseleave', () => {
                if (this.sidePanel.classList.contains('hover-preview')) {
                    this._hoverCloseTimer = setTimeout(() => {
                        this._hideHoverPreview();
                    }, 300);
                }
            });

            this.sidePanel.addEventListener('mouseenter', () => {
                this._clearHoverTimers();
            });
        }

        // Refresh device list when mic permission is granted
        this._offPermissionGranted = eventBus.on(APP_EVENTS.PERMISSION_GRANTED, () => this.populateDeviceList());

        // Escape key → close sidebar
        this._panelEscHandler = (e) => {
            if (e.key === 'Escape') {
                if (this._settingsModalIsOpen) return;
                if (this._isSidebarPinned()) {
                    this.unpinSidebar();
                } else if (this.sidePanel?.classList.contains('hover-preview')) {
                    this._hideHoverPreview();
                }
            }
        };
        if (document.addEventListener) {
            document.addEventListener('keydown', this._panelEscHandler);
        }

        // Restore pinned state from localStorage
        if (localStorage.getItem(STORAGE_KEYS.SIDEBAR_PINNED) === 'true') {
            this.pinSidebar(false);
        }
    }

    _clearHoverTimers() {
        if (this._hoverOpenTimer) {
            clearTimeout(this._hoverOpenTimer);
            this._hoverOpenTimer = null;
        }
        if (this._hoverCloseTimer) {
            clearTimeout(this._hoverCloseTimer);
            this._hoverCloseTimer = null;
        }
    }

    _isSidebarPinned() {
        return this.sidePanel?.classList.contains('pinned');
    }

    _cancelHoverSlideOut() {
        if (!this._hoverSlidingOut) return;
        this._hoverSlidingOut = false;
        this.sidePanel.style.transform = '';
        if (this._onHoverTransitionEnd) {
            this.sidePanel.removeEventListener('transitionend', this._onHoverTransitionEnd);
            this._onHoverTransitionEnd = null;
        }
    }

    _showHoverPreview() {
        if (!this.sidePanel) return;
        this._cancelHoverSlideOut();
        this.sidePanel.classList.add('hover-preview');
        this._populateDeviceListIfStale();
    }

    _populateDeviceListIfStale() {
        const now = Date.now();
        if (this._deviceListPopulatedAt && now - this._deviceListPopulatedAt < 5000) return;
        this._deviceListPopulatedAt = now;
        this.populateDeviceList();
    }

    _hideHoverPreview() {
        if (!this.sidePanel) return;
        if (!this.sidePanel.classList.contains('hover-preview')) return;
        if (this._hoverSlidingOut) return;
        this._hoverSlidingOut = true;
        this.sidePanel.style.transform = 'translateX(-100%)';
        this._onHoverTransitionEnd = (e) => {
            if (e.propertyName !== 'transform') return;
            this.sidePanel.removeEventListener('transitionend', this._onHoverTransitionEnd);
            this._onHoverTransitionEnd = null;
            this._hoverSlidingOut = false;
            this.sidePanel.classList.remove('hover-preview');
            this.sidePanel.style.transform = '';
        };
        this.sidePanel.addEventListener('transitionend', this._onHoverTransitionEnd);
    }

    pinSidebar(persist = true) {
        if (!this.sidePanel) return;
        this._clearHoverTimers();
        this._cancelHoverSlideOut();
        this.sidePanel.classList.remove('hover-preview');
        this.sidePanel.classList.add('pinned');
        document.body.classList.add('sidebar-pinned');
        if (persist) localStorage.setItem(STORAGE_KEYS.SIDEBAR_PINNED, 'true');
        this._populateDeviceListIfStale();
    }

    unpinSidebar() {
        if (!this.sidePanel) return;
        this.sidePanel.classList.remove('pinned', 'hover-preview');
        document.body.classList.remove('sidebar-pinned');
        localStorage.removeItem(STORAGE_KEYS.SIDEBAR_PINNED);
    }

    /**
     * Populate the input device dropdown with available audio devices.
     * @private
     */
    async populateDeviceList() {
        if (!this.inputDeviceSelect) return;
        const devices = await PermissionManager.getAvailableDevices();
        const savedDevice = localStorage.getItem(STORAGE_KEYS.INPUT_DEVICE) || '';

        // Keep System Default option, clear the rest
        const defaultOption = this.inputDeviceSelect.querySelector('option[value=""]');
        this.inputDeviceSelect.innerHTML = '';
        if (defaultOption) {
            this.inputDeviceSelect.appendChild(defaultOption);
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'System Default';
            this.inputDeviceSelect.appendChild(opt);
        }

        for (const device of devices) {
            // Skip the "default" pseudo-device if present
            if (device.deviceId === 'default') continue;
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = device.label;
            this.inputDeviceSelect.appendChild(opt);
        }

        this.inputDeviceSelect.value = savedDevice;
    }
    
    /**
     * Updates visibility of model-specific settings sections based on selected model.
     * 
     * @method updateSettingsVisibility
     * @returns {void}
     */
    updateSettingsVisibility() {
        const currentModel = this.getCurrentModelFromSettings();
        const isMai = this._isMaiModel(currentModel);
        if (this.whisperSettings) {
            this.whisperSettings.style.display = isMai ? 'none' : 'block';
        }
        if (this.maiTranscribeSettings) {
            this.maiTranscribeSettings.style.display = isMai ? 'block' : 'none';
        }
    }
    
    /**
     * Opens the settings modal, loads current settings into form, and emits open event.
     * 
     * @method openSettingsModal
     * @param {HTMLElement|null} [invoker] Element that opened the modal, if known.
     * @fires APP_EVENTS.UI_SETTINGS_OPENED
     * @returns {void}
     */
    openSettingsModal(invoker = null) {
        this._settingsModalInvoker = this._getSettingsModalInvoker(invoker);
        this.loadSettingsToForm();
        this.updateSettingsVisibility();

        this._settingsModalUsesNativeDialog = false;
        if (typeof this.settingsModal?.showModal === 'function') {
            try {
                if (!this.settingsModal.open) {
                    this.settingsModal.showModal();
                }
                this._settingsModalUsesNativeDialog = true;
            } catch {
                this._activateFallbackModal();
            }
        } else {
            this._activateFallbackModal();
        }

        this._settingsModalIsOpen = true;
        this._focusSettingsModalEntry();

        eventBus.emit(APP_EVENTS.UI_SETTINGS_OPENED);
    }
    
    /**
     * Closes the settings modal without saving and emits closed event.
     * 
     * @method closeSettingsModal
     * @fires APP_EVENTS.UI_SETTINGS_CLOSED
     * @returns {void}
     */
    closeSettingsModal() {
        this._discardSettingsDraft();

        if (!this._settingsModalUsesNativeDialog) {
            this._deactivateFallbackModal();
        }

        if (
            this._settingsModalUsesNativeDialog &&
            this.settingsModal?.open &&
            typeof this.settingsModal.close === 'function'
        ) {
            try {
                this.settingsModal.close();
            } catch {
                this.settingsModal.style.display = 'none';
            }
        } else if (this.settingsModal) {
            this.settingsModal.style.display = 'none';
        }

        this._settingsModalIsOpen = false;
        this._settingsModalUsesNativeDialog = false;
        this._restoreSettingsModalFocus();
        
        eventBus.emit(APP_EVENTS.UI_SETTINGS_CLOSED);
    }

    /**
     * Provides visual and accessibility modality when showModal() is absent
     * or fails. This path deliberately remains separate from native dialogs.
     *
     * @private
     * @returns {void}
     */
    _activateFallbackModal() {
        if (!this.settingsModal) return;

        this._fallbackModalAttributes = ['role', 'aria-modal', 'tabindex'].map((name) => ({
            name,
            value: this.settingsModal.getAttribute?.(name),
            hadAttribute: this.settingsModal.hasAttribute?.(name) ?? false
        }));
        this.settingsModal.classList?.add('modal--fallback-open');
        this.settingsModal.setAttribute?.('role', 'dialog');
        this.settingsModal.setAttribute?.('aria-modal', 'true');
        this.settingsModal.setAttribute?.('tabindex', '-1');
        this.settingsModal.style.display = 'block';
        this._setFallbackBackgroundInert();
    }

    /**
     * Restores document and dialog state changed for the fallback modal.
     *
     * @private
     * @returns {void}
     */
    _deactivateFallbackModal() {
        if (this.settingsModal) {
            this.settingsModal.classList?.remove('modal--fallback-open');
            this._fallbackModalAttributes?.forEach(({ name, value, hadAttribute }) => {
                if (hadAttribute) {
                    this.settingsModal.setAttribute?.(name, value);
                } else {
                    this.settingsModal.removeAttribute?.(name);
                }
            });
        }
        this._fallbackModalAttributes = null;
        this._restoreFallbackBackground();
    }

    /**
     * Gets document siblings that should be inert while the fallback is open.
     *
     * @private
     * @returns {HTMLElement[]} Background elements outside the settings modal.
     */
    _getFallbackBackgroundElements() {
        const bodyChildren = document.body?.children ? Array.from(document.body.children) : [];
        return bodyChildren.filter((element) => (
            element !== this.settingsModal && element.tagName !== 'SCRIPT'
        ));
    }

    /**
     * Makes background content unavailable to assistive technology and input.
     *
     * @private
     * @returns {void}
     */
    _setFallbackBackgroundInert() {
        this._fallbackBackgroundState = this._getFallbackBackgroundElements().map((element) => ({
            element,
            inert: element.inert,
            supportsInert: 'inert' in element,
            ariaHidden: element.getAttribute?.('aria-hidden'),
            hadAriaHidden: element.hasAttribute?.('aria-hidden') ?? false
        }));

        this._fallbackBackgroundState.forEach(({ element }) => {
            element.inert = true;
            element.setAttribute?.('aria-hidden', 'true');
        });
    }

    /**
     * Restores background input and accessibility state after fallback close.
     *
     * @private
     * @returns {void}
     */
    _restoreFallbackBackground() {
        this._fallbackBackgroundState.forEach(({
            element, inert, supportsInert, ariaHidden, hadAriaHidden
        }) => {
            if (supportsInert) {
                element.inert = inert;
            } else {
                delete element.inert;
            }
            if (hadAriaHidden) {
                element.setAttribute?.('aria-hidden', ariaHidden);
            } else {
                element.removeAttribute?.('aria-hidden');
            }
        });
        this._fallbackBackgroundState = [];
    }

    /**
     * Keeps keyboard focus in the fallback dialog without duplicating native
     * dialog behavior when showModal() is available.
     *
     * @private
     * @param {KeyboardEvent} event Tab keydown event.
     * @returns {void}
     */
    _containFallbackModalFocus(event) {
        const focusable = this._getFallbackModalFocusableElements();
        if (focusable.length === 0) {
            event.preventDefault?.();
            this.settingsModal?.focus?.();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const target = event.target || document.activeElement;
        const isInsideModal = this.settingsModal?.contains
            ? this.settingsModal.contains(target)
            : focusable.includes(target);

        if (event.shiftKey && (target === first || !isInsideModal)) {
            event.preventDefault?.();
            last.focus();
        } else if (!event.shiftKey && (target === last || !isInsideModal)) {
            event.preventDefault?.();
            first.focus();
        }
    }

    /**
     * Collects visible, enabled controls that can receive fallback Tab focus.
     *
     * @private
     * @returns {HTMLElement[]} Focusable modal controls in document order.
     */
    _getFallbackModalFocusableElements() {
        if (!this.settingsModal?.querySelectorAll) return [];

        const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');
        return Array.from(this.settingsModal.querySelectorAll(selector)).filter((element) => (
            !element.hidden &&
            element.getAttribute?.('aria-hidden') !== 'true' &&
            (!('offsetParent' in element) || element.offsetParent !== null)
        ));
    }

    /**
     * Restores the modal selector to the active session model when the modal
     * exits without leaving an unsaved model draft behind.
     *
     * @private
     * @returns {void}
     */
    _discardSettingsDraft() {
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = this.getCurrentModel();
        }
        this.updateSettingsVisibility();
    }

    /**
     * Returns a focusable modal invoker, excluding startup's unfocused body.
     *
     * @private
     * @param {HTMLElement|null} invoker Explicit invoking element, if known.
     * @returns {HTMLElement|null} Focusable element to restore on close.
     */
    _getSettingsModalInvoker(invoker) {
        const candidate = invoker || document.activeElement;
        if (
            candidate &&
            candidate !== document.body &&
            candidate !== document.documentElement &&
            candidate.isConnected !== false &&
            typeof candidate.focus === 'function'
        ) {
            return candidate;
        }
        return null;
    }

    /**
     * Focuses an invalid active credential field, or the model selector when
     * the active configuration is already valid.
     *
     * @private
     * @returns {void}
     */
    _focusSettingsModalEntry() {
        const { apiKeyInput, uriInput } = this._getActiveInputs();
        const firstError = this.getValidationErrors()[0];
        const apiKeyErrors = [
            MESSAGES.API_KEY_REQUIRED,
            MESSAGES.INVALID_API_KEY_CHARACTERS,
            'Invalid API key format'
        ];
        const focusTarget = firstError
            ? (apiKeyErrors.includes(firstError) ? apiKeyInput : uriInput)
            : this.settingsModelSelect;

        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
        }
    }

    /**
     * Restores focus to the element that opened the dialog when it remains in
     * the document. Startup openings have no meaningful invoker to restore.
     *
     * @private
     * @returns {void}
     */
    _restoreSettingsModalFocus() {
        const invoker = this._settingsModalInvoker;
        this._settingsModalInvoker = null;

        if (invoker && invoker.isConnected !== false && typeof invoker.focus === 'function') {
            invoker.focus();
        }
    }

    /**
     * Resolves the credential storage keys declared by a model adapter.
     *
     * @private
     * @param {string} model Model identifier.
     * @returns {{apiKey: string, uri: string}} Credential storage keys.
     * @throws {Error} If the model has no complete credential storage metadata.
     */
    _getCredentialStorageKeys(model) {
        const adapter = this.adapterRegistry.get(model);
        const storageKeys = adapter?.storageKeys;
        if (
            typeof storageKeys?.apiKey !== 'string' ||
            storageKeys.apiKey.trim() === '' ||
            typeof storageKeys?.uri !== 'string' ||
            storageKeys.uri.trim() === ''
        ) {
            throw new Error(`Credential storage metadata is missing for model "${model}"`);
        }

        return {
            apiKey: storageKeys.apiKey,
            uri: storageKeys.uri
        };
    }

    /**
     * Loads one model's stored credentials into its cached form inputs.
     *
     * @private
     * @param {string} model Model identifier.
     * @param {HTMLElement|null} uriInput URI form input.
     * @param {HTMLElement|null} apiKeyInput API key form input.
     */
    _loadStoredCredentials(model, uriInput, apiKeyInput) {
        const { apiKey, uri } = this._getCredentialStorageKeys(model);
        const storedUri = localStorage.getItem(uri);
        const storedApiKey = localStorage.getItem(apiKey);

        if (uriInput && storedUri) {
            uriInput.value = storedUri;
        }
        if (apiKeyInput && storedApiKey) {
            apiKeyInput.value = storedApiKey;
        }
    }
    
    /**
     * Loads current settings from localStorage into the form fields.
     * Updates form inputs to reflect the currently saved configuration.
     * 
     * @private
     * @method loadSettingsToForm
     */
    loadSettingsToForm() {
        // Sync modal selector with main UI selector (user's current choice)
        if (this.settingsModelSelect) {
            this.settingsModelSelect.value = this.getCurrentModel();
        }

        this._loadStoredCredentials(
            MODEL_TYPES.WHISPER,
            this.whisperUriInput,
            this.whisperKeyInput
        );
        this._loadStoredCredentials(
            MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            this.maiTranscribeUriInput,
            this.maiTranscribeKeyInput
        );

        const savedEnv = localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT) || RECORDING_ENVIRONMENTS.QUIET;
        if (this.recordingEnvironmentSelect) {
            this.recordingEnvironmentSelect.value = savedEnv;
        }
    }

    /**
     * Resolves the active API key and URI input elements based on selected model.
      * Uses model-specific cached DOM references for Whisper or MAI-Transcribe.
     *
     * @private
     * @returns {{ apiKeyInput: HTMLElement|null, uriInput: HTMLElement|null }}
     */
    _getActiveInputs() {
        const isMai = this._isMaiModel(this.getCurrentModelFromSettings());
        return {
            apiKeyInput: isMai ? this.maiTranscribeKeyInput : this.whisperKeyInput,
            uriInput: isMai ? this.maiTranscribeUriInput : this.whisperUriInput
        };
    }

    sanitizeInputs() {
        const { apiKeyInput, uriInput } = this._getActiveInputs();

        if (apiKeyInput && typeof apiKeyInput.value === 'string') {
            // Remove whitespace and common invisible paste artifacts.
            apiKeyInput.value = apiKeyInput.value.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
        }

        if (uriInput && typeof uriInput.value === 'string') {
            uriInput.value = uriInput.value.replace(/\s+/g, '');
        }
    }

    /**
     * Retrieve human readable validation errors for the current
     * configuration without emitting any events.
     *
     * @method getValidationErrors
     * @returns {string[]} Array of error messages
     */
    getValidationErrors() {
        this.sanitizeInputs();
        const { apiKeyInput, uriInput } = this._getActiveInputs();

        const errors = [];

        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const isMai = this._isMaiModel(this.getCurrentModelFromSettings());
        if (!apiKey) {
            errors.push(MESSAGES.API_KEY_REQUIRED);
        } else if (!API_KEY_VALUE_PATTERN.test(apiKey)) {
            errors.push(MESSAGES.INVALID_API_KEY_CHARACTERS);
        } else if (!isMai && !/^[A-F0-9]{32}$/i.test(apiKey)) {
            // Whisper keys are 32-char hex; Speech keys are longer alphanumeric
            errors.push('Invalid API key format');
        }

        const uri = uriInput ? uriInput.value.trim() : '';
        if (!uri) {
            errors.push(MESSAGES.URI_REQUIRED);
        } else {
            try {
                const url = new URL(uri);
                if (url.protocol !== 'https:') {
                    errors.push(MESSAGES.URI_MUST_BE_HTTPS);
                }
            } catch {
                errors.push(MESSAGES.INVALID_URI_FORMAT);
            }
        }

        return errors;
    }
    
    /**
     * Saves current settings from form to localStorage, validates, and emits relevant events.
     * 
     * @method saveSettings
     * @fires APP_EVENTS.SETTINGS_SAVED
     * @fires APP_EVENTS.SETTINGS_VALIDATION_ERROR
     * @returns {void}
     */
    saveSettings() {
        const currentModel = this.getCurrentModelFromSettings();

        const errors = this.getValidationErrors();
        if (errors.length > 0) {
            eventBus.emit(APP_EVENTS.SETTINGS_VALIDATION_ERROR, { errors });
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: errors[0] || MESSAGES.FILL_REQUIRED_FIELDS,
                type: 'error',
                temporary: true
            });
            return;
        }

        const { apiKeyInput: keyInput, uriInput } = this._getActiveInputs();
        const targetUri = uriInput ? uriInput.value.trim() : '';
        const apiKey = keyInput ? keyInput.value.trim() : '';
        const { apiKey: apiKeyStorageKey, uri: uriStorageKey } = this._getCredentialStorageKeys(currentModel);

        const previousModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL_TYPE;
        localStorage.setItem(STORAGE_KEYS.MODEL, currentModel);
        localStorage.setItem(uriStorageKey, targetUri);
        localStorage.setItem(apiKeyStorageKey, apiKey);
        
        if (this.recordingEnvironmentSelect) {
            localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, this.recordingEnvironmentSelect.value);
        }

        this.modelSelect.value = currentModel;

        this.closeSettingsModal();

        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.SETTINGS_SAVED,
            type: 'success',
            temporary: true,
            duration: 3000
        });
        
        // Emit model changed event only when explicitly saved
        if (currentModel !== previousModel) {
            eventBus.emit(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
                model: currentModel,
                previousModel: previousModel
            });
        }
        
        // Emit settings saved event
        eventBus.emit(APP_EVENTS.SETTINGS_SAVED, {
            model: currentModel,
            hasUri: !!targetUri,
            hasApiKey: !!apiKey
        });

        // Emit SETTINGS_LOADED to mirror initial load behavior
        eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
            model: currentModel,
            hasUri: !!targetUri,
            hasApiKey: !!apiKey
        });

        eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);
    }
    
    /**
     * Gets the currently selected transcription model.
     * 
     * @method getCurrentModel
     * @returns {string} Current model identifier
     */
    getCurrentModel() {
        return this.modelSelect.value;
    }

    /**
     * Gets the currently selected transcription model from the settings modal.
     * Falls back to main interface model selector if settings modal selector is not available.
     * 
     * @method getCurrentModelFromSettings
     * @returns {string} Current model identifier
     */
    getCurrentModelFromSettings() {
        if (this.settingsModelSelect) {
            return this.settingsModelSelect.value;
        }
        return this.getCurrentModel();
    }
    
    /**
     * Gets the complete API configuration for the selected model.
     * 
     * @method getModelConfig
     * @returns {{model: string, apiKey: string, uri: string}} Model configuration object
     */
    getModelConfig() {
        const model = this.getCurrentModel();
        const { apiKey, uri } = this._getCredentialStorageKeys(model);
        return {
            model,
            apiKey: localStorage.getItem(apiKey),
            uri: localStorage.getItem(uri)
        };
    }

    _isMaiModel(model) {
        return model === MODEL_TYPES.MAI_TRANSCRIBE_1_5;
    }
    
    checkInitialSettings() {
        const config = this.getModelConfig();

        if (!config.apiKey || !config.uri) {
            this._initTimerId = setTimeout(() => {
                this._initTimerId = null;
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                    message: MESSAGES.CONFIGURE_AZURE,
                    type: 'info'
                });
                this.openSettingsModal();
            }, 500);
        } else {
            // Settings are complete - emit SETTINGS_LOADED event to notify UI
            eventBus.emit(APP_EVENTS.SETTINGS_LOADED, {
                model: config.model,
                hasUri: !!config.uri,
                hasApiKey: !!config.apiKey
            });
        }
    }

    /**
     * Cancels pending timers to prevent leaks.
     * Call when the Settings instance is no longer needed.
     *
     * @method destroy
     */
    destroy() {
        if (this._initTimerId) {
            clearTimeout(this._initTimerId);
            this._initTimerId = null;
        }
        if (this._panelEscHandler && document.removeEventListener) {
            document.removeEventListener('keydown', this._panelEscHandler);
        }
        if (this._fallbackModalKeydownHandler && document.removeEventListener) {
            document.removeEventListener('keydown', this._fallbackModalKeydownHandler);
        }
        this._deactivateFallbackModal();
        if (this._offPermissionGranted) {
            this._offPermissionGranted();
            this._offPermissionGranted = null;
        }
        this._clearHoverTimers();
    }
}
