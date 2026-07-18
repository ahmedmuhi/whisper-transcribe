/**
 * @fileoverview User interface controller for the whisper-transcribe application.
 */

import {
    API_ERROR_CODES,
    AUDIO_SAFETY_STATES,
    AUTHENTICATION_STATES,
    AUTH_PRESENTATION_STATES,
    AUTH_RECOVERY_STATES,
    AZURE_RBAC_HELP_URL,
    STORAGE_KEYS,
    COLORS,
    DEFAULT_RESET_STATUS,
    MESSAGES,
    ID,
    TRANSCRIPT_SEGMENT_DIVIDER,
    RECORDING_STATES,
    STATUS_TYPE_CLASSES
} from './constants.js';
import { showTemporaryStatus } from './status-helper.js';
import { PermissionManager } from './permission-manager.js';
import { eventBus, APP_EVENTS } from './event-bus.js';
import { logger } from './logger.js';

/**
 * User interface controller for managing DOM interactions and visual states.
 *
 * The recording controls are a guided-morph cluster derived from a single source
 * of truth — the FSM state — via {@link UI#renderControls}. There is no second
 * channel of granular UI_BUTTON_* events; the state machine owns status/recording
 * events, the UI owns rendering.
 *
 * @class UI
 * @fires APP_EVENTS.UI_STATUS_UPDATE
 * @fires APP_EVENTS.UI_THEME_CHANGED
 */
export class UI {
    /**
     * Creates a new UI controller instance and resolves DOM references.
     */
    constructor({
        authenticationState = AUTH_PRESENTATION_STATES.READY,
        authInteractionController = null,
        openHelp = null
    } = {}) {
        // Transcript + status + visualiser
        this.statusElement = document.getElementById(ID.STATUS);
        this.transcriptElement = document.getElementById(ID.TRANSCRIPT);
        this.grabTextButton = document.getElementById(ID.GRAB_TEXT_BUTTON);
        this.restoreButton = document.getElementById(ID.RESTORE_BUTTON);
        this.timerElement = document.getElementById(ID.TIMER);
        this.spinnerContainer = document.getElementById(ID.SPINNER_CONTAINER);
        this.visualizer = document.getElementById(ID.VISUALIZER);

        // Guided-morph recording controls (rendered from FSM state) — the
        // Dynamic Island cluster reshapes around these fixed-size buttons.
        this.controlCluster = document.getElementById(ID.CONTROL_CLUSTER);
        this.primaryAction = document.getElementById(ID.PRIMARY_ACTION);
        this.secondaryAction = document.getElementById(ID.SECONDARY_ACTION);
        this.discardAction = document.getElementById(ID.DISCARD_ACTION);
        this.retryAction = document.getElementById(ID.RETRY_ACTION);

        // Token-free authentication presentation inside the Dynamic Island.
        this.authContext = document.getElementById(ID.AUTH_CONTEXT);
        this.authContextTitle = document.getElementById(ID.AUTH_CONTEXT_TITLE);
        this.authContextBody = document.getElementById(ID.AUTH_CONTEXT_BODY);
        this.authContextNote = document.getElementById(ID.AUTH_CONTEXT_NOTE);
        this.authPrimaryAction = document.getElementById(ID.AUTH_PRIMARY_ACTION);
        this.authSecondaryAction = document.getElementById(ID.AUTH_SECONDARY_ACTION);
        this.authInteractionController = authInteractionController;
        this.openHelp = openHelp || (() => window.open(
            AZURE_RBAC_HELP_URL,
            '_blank',
            'noopener,noreferrer'
        ));

        // Proportional-discard confirm dialog
        this.discardDialog = document.getElementById(ID.DISCARD_DIALOG);
        this.discardDialogTitle = document.getElementById(ID.DISCARD_DIALOG_TITLE);
        this.discardDialogBody = document.getElementById(ID.DISCARD_DIALOG_BODY);
        this.discardKeepButton = document.getElementById(ID.DISCARD_KEEP);
        this.discardConfirmButton = document.getElementById(ID.DISCARD_CONFIRM);

        // Settings / theme
        this.themeToggle = document.getElementById(ID.THEME_TOGGLE);
        this.moonIcon = document.getElementById(ID.MOON_ICON);
        this.sunIcon = document.getElementById(ID.SUN_ICON);

        this.visualizationController = null;

        // Control-surface inputs: the current FSM state, whether prerequisites
        // (browser support + API config) are met, and whether the last error is
        // retryable. renderControls() derives the cluster from these — they persist
        // so a bare re-render (e.g. from _setReady) preserves Retry/escape controls.
        this.currentState = RECORDING_STATES.IDLE;
        this.authenticationPresentation = Object.values(AUTH_PRESENTATION_STATES)
            .includes(authenticationState)
            ? authenticationState
            : this._presentationStateFor(authenticationState);
        this.prerequisitesReady = false;
        this.prerequisiteReason = null;
        this.ready = false;
        this.canRetry = false;
        this._unsentDiscardResolve = null;
        this._unsentDiscardInvoker = null;
        this._autosaveTimer = null;
        this._autosaveFailureNotified = false;
        this._pagehideRegistered = false;
        this._pagehideHandler = () => {
            if (this._autosaveTimer === null) return;
            clearTimeout(this._autosaveTimer);
            this._autosaveTimer = null;
            this.persistTranscript();
        };
    }

    /**
     * Initializes UI controller, sets up listeners, loads theme and initial state.
     *
     * @method init
     * @param {Settings} settings - Settings manager instance
     * @param {TranscriptStore} [transcriptStore] - Single-slot transcript store
     * @returns {void}
     */
    init(settings, transcriptStore = null) {
        this.settings = settings;
        this.transcriptStore = transcriptStore;

        this.loadTheme();
        this.setupEventListeners();
        this.setupEventBusListeners();

        // Restore an autosaved transcript across reloads/crashes (single slot).
        this.restoreTranscriptIfEmpty();

        // After listeners are ready, verify saved configuration so SETTINGS_LOADED
        // events processed during init activate the microphone when settings exist.
        this.settings.checkInitialSettings();
        this.checkRecordingPrerequisites();

        eventBus.emit(APP_EVENTS.APP_INITIALIZED);
    }

    /**
     * Sets up DOM event listeners for UI controls.
     *
     * @method setupEventListeners
     * @returns {void}
     */
    setupEventListeners() {
        // Theme toggle
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => {
                const currentMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'auto';
                let newMode;
                if (currentMode === 'auto') {
                    newMode = document.documentElement.classList.contains('dark-theme') ? 'light' : 'dark';
                } else if (currentMode === 'light') {
                    newMode = 'dark';
                } else {
                    newMode = 'light';
                }
                localStorage.setItem(STORAGE_KEYS.THEME_MODE, newMode);
                this.applyTheme();
                eventBus.emit(APP_EVENTS.UI_THEME_CHANGED, { mode: newMode });
            });
        }

        // Recording controls — each emits an intent event for AudioHandler.
        // The primary morphs Start↔Done; both map onto MIC_BUTTON_CLICKED (toggle).
        if (this.primaryAction) {
            this.primaryAction.addEventListener('click', () => eventBus.emit(APP_EVENTS.MIC_BUTTON_CLICKED));
        }
        if (this.secondaryAction) {
            this.secondaryAction.addEventListener('click', () => eventBus.emit(APP_EVENTS.PAUSE_BUTTON_CLICKED));
        }
        if (this.discardAction) {
            this.discardAction.addEventListener('click', () => eventBus.emit(APP_EVENTS.DISCARD_BUTTON_CLICKED));
        }
        if (this.retryAction) {
            this.retryAction.addEventListener('click', () => eventBus.emit(APP_EVENTS.RETRY_BUTTON_CLICKED));
        }
        if (this.authPrimaryAction) {
            this.authPrimaryAction.addEventListener('click', () => {
                void this._handleAuthenticationAction(this.authPrimaryAction.dataset.authAction);
            });
        }
        if (this.authSecondaryAction) {
            this.authSecondaryAction.addEventListener('click', () => {
                void this._handleAuthenticationAction(this.authSecondaryAction.dataset.authAction);
            });
        }

        // Discard confirm dialog — Keep resumes, Discard tears down, Escape = Keep.
        if (this.discardKeepButton) {
            this.discardKeepButton.addEventListener('click', () => {
                if (this._unsentDiscardResolve) {
                    this._resolveUnsentDiscard(false);
                } else {
                    this.closeDiscardDialog(APP_EVENTS.DISCARD_KEPT);
                }
            });
        }
        if (this.discardConfirmButton) {
            this.discardConfirmButton.addEventListener('click', () => {
                if (this._unsentDiscardResolve) {
                    this._resolveUnsentDiscard(true);
                } else {
                    this.closeDiscardDialog(APP_EVENTS.DISCARD_CONFIRMED);
                }
            });
        }
        if (this.discardDialog) {
            // Native <dialog> fires 'cancel' on Escape — treat it as Keep (safe default).
            this.discardDialog.addEventListener('cancel', (event) => {
                event.preventDefault();
                if (this._unsentDiscardResolve) {
                    this._resolveUnsentDiscard(false);
                } else {
                    this.closeDiscardDialog(APP_EVENTS.DISCARD_KEPT);
                }
            });
        }

        // Transcript actions — Grab (copy + clear, recoverable) and Restore (recover).
        if (this.grabTextButton) {
            this.grabTextButton.addEventListener('click', () => this.grabTranscript());
        }
        if (this.restoreButton) {
            this.restoreButton.addEventListener('click', () => this.restoreTranscript());
        }

        // Autosave in-place edits (debounced) so a crash/reload never loses words.
        if (!this._pagehideRegistered && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('pagehide', this._pagehideHandler);
            this._pagehideRegistered = true;
        }
        if (this.transcriptElement) {
            this.transcriptElement.addEventListener('input', () => {
                this.updateRestoreAffordance();
                clearTimeout(this._autosaveTimer);
                this._autosaveTimer = setTimeout(() => {
                    this._autosaveTimer = null;
                    this.persistTranscript();
                    this.updateRestoreAffordance();
                }, 500);
            });
        }
    }

    /**
     * Sets up event bus listeners to react to application events for UI updates.
     *
     * @method setupEventBusListeners
     * @private
     * @returns {void}
     */
    setupEventBusListeners() {
        eventBus.on(APP_EVENTS.UI_STATUS_UPDATE, (data) => {
            if (data.temporary) {
                showTemporaryStatus(
                    this.statusElement,
                    data.message,
                    data.type || 'info',
                    data.duration || 3000,
                    data.resetMessage || DEFAULT_RESET_STATUS
                );
            } else {
                this.setStatus(data.message);
            }
        });

        // Recording controls derive solely from the FSM state — one source of truth.
        eventBus.on(APP_EVENTS.RECORDING_STATE_CHANGED, (data) => {
            logger.child('UI').debug(`Recording state changed from ${data.oldState} to ${data.newState}`);
            this.currentState = data.newState;
            this.canRetry = Boolean(data.canRetry);
            this.renderControls(data.newState);
        });

        // Proportional-discard confirm dialog.
        eventBus.on(APP_EVENTS.DISCARD_CONFIRM_REQUESTED, (data) => {
            this.openDiscardDialog(data.durationLabel);
        });

        eventBus.on(APP_EVENTS.UI_TRANSCRIPTION_READY, (data) => {
            this.displayTranscription(data.text);
            this.hideSpinner();
        });

        eventBus.on(APP_EVENTS.API_REQUEST_ERROR, (data) => {
            this.hideSpinner();
            if (data?.code === API_ERROR_CODES.AUTHENTICATION_REQUIRED) {
                this.setAuthenticationPresentation(AUTH_PRESENTATION_STATES.INTERACTION_REQUIRED);
            } else if (data?.code === API_ERROR_CODES.AZURE_AUTHORIZATION_DENIED) {
                this.setAuthenticationPresentation(AUTH_PRESENTATION_STATES.AUTHORIZATION_DENIED);
            }
        });
        eventBus.on(APP_EVENTS.API_CONFIG_MISSING, () => {
            this.prerequisiteReason = 'config';
            this._setReady(false, 'config');
        });
        eventBus.on(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, ({ state }) => {
            this.setAuthenticationPresentation(this._presentationStateFor(state));
        });
        eventBus.on(APP_EVENTS.ERROR_OCCURRED, ({ message }) => this.showError(message || MESSAGES.ERROR_OCCURRED));

        eventBus.on(APP_EVENTS.PERMISSION_GRANTED, () => this.checkRecordingPrerequisites());
        eventBus.on(APP_EVENTS.PERMISSION_DENIED, () => this._setReady(false));

        eventBus.on(APP_EVENTS.SETTINGS_UPDATED, () => this.checkRecordingPrerequisites());
        eventBus.on(APP_EVENTS.SETTINGS_SAVED, () => this.checkRecordingPrerequisites());
        eventBus.on(APP_EVENTS.SETTINGS_LOADED, () => this.checkRecordingPrerequisites());

        eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, (data) => {
            logger.child('UI').info('Settings model changed to:', data.model);
        });

        eventBus.on(APP_EVENTS.UI_MODEL_SWITCHED, (data) => {
            const uiLogger = logger.child('UI');
            uiLogger.info('UI model switched to:', data.model, '(session only)');
            if (data.model !== data.savedModel) {
                uiLogger.info('UI model differs from saved configuration:', data.savedModel);
            }
        });

        eventBus.on(APP_EVENTS.UI_THEME_CHANGED, () => this.applyTheme());

        eventBus.on(APP_EVENTS.VISUALIZATION_START, async (data) => {
            if (this.visualizationController) {
                this.visualizationController.stop();
                this.visualizationController = null;
            }
            try {
                const { VisualizationController } = await import('./visualization.js');
                const { stream } = data;
                const isDarkTheme = document.documentElement.classList.contains('dark-theme');
                if (this.visualizer && stream) {
                    this.visualizationController = new VisualizationController(stream, this.visualizer, isDarkTheme);
                    this.visualizationController.start();
                }
            } catch (error) {
                logger.child('UI').error('Error starting visualization:', error);
            }
        });

        eventBus.on(APP_EVENTS.VISUALIZATION_STOP, () => {
            if (this.visualizationController) {
                this.visualizationController.stop();
                this.visualizationController = null;
            }
            this.clearVisualization();
        });

        eventBus.on(APP_EVENTS.UI_TIMER_UPDATE, (data) => this.updateTimer(data.display));
        eventBus.on(APP_EVENTS.UI_TIMER_RESET, () => this.updateTimer('00:00'));
    }

    loadTheme() {
        this.applyTheme();
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (localStorage.getItem(STORAGE_KEYS.THEME_MODE) === 'auto') {
                    this.applyTheme();
                }
            });
        }
    }

    applyTheme() {
        const themeMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'auto';
        let isDark = false;
        if (themeMode === 'dark') {
            isDark = true;
        } else if (themeMode === 'light') {
            isDark = false;
        } else {
            isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        document.documentElement.classList.toggle('dark-theme', isDark);
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

        if (isDark) {
            if (this.moonIcon) this.moonIcon.style.display = 'none';
            if (this.sunIcon) this.sunIcon.style.display = 'block';
        } else {
            if (this.moonIcon) this.moonIcon.style.display = 'block';
            if (this.sunIcon) this.sunIcon.style.display = 'none';
        }

        if (this.visualizer) {
            const canvasCtx = this.visualizer.getContext('2d');
            if (canvasCtx) {
                canvasCtx.fillStyle = isDark ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
                canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);
            }
        }
    }

    // ───────────────────────── Control rendering ─────────────────────────

    /**
     * Renders the guided-morph control cluster for a given FSM state. This is the
     * single source of truth for which controls are visible/labelled/enabled and
     * whether the spinner shows — replacing the former granular UI_BUTTON_* events.
     *
     * Visually it is a Dynamic Island: the cluster reshapes (size + radius) and its
     * contents cross-fade as the state changes. The size morph runs via FLIP +
     * Web Animations API in {@link UI#_morphIsland}; the buttons keep a fixed size
     * (the island animates around them — never the buttons' own geometry).
     *
     * @method renderControls
     * @param {string} state - Current RECORDING_STATES value
     * @returns {void}
     */
    renderControls(state) {
        const authenticationConfig = this._authenticationControlConfig(state);
        const cfg = this._controlConfig(state);

        // FLIP: measure → mutate → measure → animate the cluster's size between.
        this._morphIsland(() => {
            if (authenticationConfig) {
                this._renderAuthenticationContext(authenticationConfig);
                this._applyButton(this.primaryAction, { hidden: true });
                this._applyButton(this.secondaryAction, { hidden: true });
                this._applyButton(this.discardAction, { hidden: true });
                this._applyButton(this.retryAction, { hidden: true });
                if (this.timerElement) this.timerElement.hidden = true;
                this._setIslandState('island-auth');
                this.controlCluster?.classList?.toggle('island-has-indicator', false);
                this.hideSpinner();
                return;
            }

            this._hideAuthenticationContext();
            if (this.timerElement) this.timerElement.hidden = false;
            this._applyButton(this.primaryAction, cfg.primary);
            this._applyButton(this.secondaryAction, cfg.secondary);
            this._applyButton(this.discardAction, cfg.discard);
            this._applyButton(this.retryAction, cfg.retry);

            if (this.primaryAction && this.primaryAction.classList) {
                this.primaryAction.classList.toggle('recording', Boolean(cfg.primary.recording));
            }

            // The island's resting shape per state (CSS owns colour/radius).
            this._setIslandState(this._islandStateFor(state));

            // The dots indicator replaces the primary's label only when shown.
            if (this.controlCluster && this.controlCluster.classList) {
                this.controlCluster.classList.toggle('island-has-indicator', Boolean(cfg.spinner));
            }

            if (cfg.spinner) {
                this.showSpinner();
            } else {
                this.hideSpinner();
            }
        });
    }

    /**
     * Maps an FSM state to a Dynamic-Island shape class.
     *
     * @method _islandStateFor
     * @private
     * @param {string} state
     * @returns {('island-idle'|'island-recording'|'island-processing')}
     */
    _islandStateFor(state) {
        const S = RECORDING_STATES;
        if (state === S.RECORDING || state === S.PAUSED || state === S.CONFIRMING_DISCARD) {
            return 'island-recording';
        }
        if (state === S.STOPPING || state === S.PROCESSING || state === S.INITIALIZING || state === S.CANCELLING) {
            return 'island-processing';
        }
        return 'island-idle';
    }

    /**
     * Swaps the single active island-shape class on the cluster.
     *
     * @method _setIslandState
     * @private
     * @param {string} islandClass
     * @returns {void}
     */
    _setIslandState(islandClass) {
        if (!this.controlCluster || !this.controlCluster.classList) return;
        this.controlCluster.classList.remove(
            'island-idle',
            'island-recording',
            'island-processing',
            'island-auth'
        );
        this.controlCluster.classList.add(islandClass);
    }

    /**
     * FLIP size morph for the Dynamic Island. Measures the cluster, runs `mutate`
     * (which changes the visible/labelled controls and the shape class), measures
     * again, then animates width/height from old→new via the Web Animations API
     * with a gentle settle. Only the CONTAINER animates — never the buttons —
     * and only box-shadow/opacity/size, never the cluster's transform.
     *
     * Degrades gracefully: with no cluster, no element.animate, in tests (jsdom
     * lacks layout), or under prefers-reduced-motion, the mutation applies
     * instantly with a correct final layout and no animation.
     *
     * @method _morphIsland
     * @private
     * @param {Function} mutate - Applies the new state to the DOM.
     * @returns {void}
     */
    _morphIsland(mutate) {
        const cluster = this.controlCluster;
        const canAnimate = cluster &&
            typeof cluster.animate === 'function' &&
            typeof cluster.getBoundingClientRect === 'function' &&
            !this._prefersReducedMotion();

        if (!canAnimate) {
            mutate();
            return;
        }

        // Interrupt any morph still in flight: cancel it and drop the cross-fade
        // class. Two rapid state changes (e.g. PROCESSING → IDLE on a fast API
        // success) can land inside the 360ms window; without this we'd measure a
        // mid-tween size and stack a second animation on the first, jumping.
        this._cancelIslandMorph();

        const first = cluster.getBoundingClientRect();
        mutate();
        const last = cluster.getBoundingClientRect();

        // Nothing meaningful changed — skip the animation (avoids idle jitter).
        const dw = Math.abs(last.width - first.width);
        const dh = Math.abs(last.height - first.height);
        if (dw < 1 && dh < 1) return;

        const DURATION = 360;
        const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

        // Animate the cluster from its old size to the new one. fill defaults to
        // none, so after the run the element reverts to its natural `auto` size
        // (== `last`), leaving no locked inline width behind.
        let anim;
        try {
            anim = cluster.animate(
                [
                    { width: `${first.width}px`, height: `${first.height}px` },
                    { width: `${last.width}px`, height: `${last.height}px` }
                ],
                { duration: DURATION, easing: EASING }
            );
        } catch {
            // If WAAPI rejects the keyframes, the mutation already applied — the
            // final layout is correct, just without the tween.
            return;
        }

        // Cross-fade the contents over the same beat (opacity only — no geometry).
        this._islandAnim = anim;
        cluster.style.setProperty('--island-morph-ms', `${DURATION}ms`);
        cluster.classList.add('island-morphing');
        // End the cross-fade when THIS animation finishes. A newer morph that
        // supersedes it cancels it first (via _cancelIslandMorph), so a stale
        // finish never strips the class off the morph that replaced it.
        anim.onfinish = () => {
            if (this._islandAnim !== anim) return;
            this._islandAnim = null;
            this._endIslandMorph();
        };
    }

    /**
     * Cancels any in-flight island size morph and clears its cross-fade state,
     * so the next measure reads a resting size and animations never stack.
     *
     * @method _cancelIslandMorph
     * @private
     * @returns {void}
     */
    _cancelIslandMorph() {
        const stale = this._islandAnim;
        if (stale) {
            this._islandAnim = null;
            stale.onfinish = null; // its late finish must not touch the new morph
            if (typeof stale.cancel === 'function') stale.cancel();
        }
        this._endIslandMorph();
    }

    /**
     * Removes the transient cross-fade class and inline morph-duration property,
     * leaving the cluster at its natural resting style.
     *
     * @method _endIslandMorph
     * @private
     * @returns {void}
     */
    _endIslandMorph() {
        const cluster = this.controlCluster;
        if (!cluster || !cluster.classList) return;
        cluster.classList.remove('island-morphing');
        if (cluster.style && typeof cluster.style.removeProperty === 'function') {
            cluster.style.removeProperty('--island-morph-ms');
        }
    }

    /**
     * Whether the user has requested reduced motion. Guards every JS-driven
     * animation so reduced-motion users get instant, correct state changes.
     *
     * @method _prefersReducedMotion
     * @private
     * @returns {boolean}
     */
    _prefersReducedMotion() {
        return Boolean(
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    setAuthenticationPresentation(state) {
        this.authenticationPresentation = Object.values(AUTH_PRESENTATION_STATES).includes(state)
            ? state
            : AUTH_PRESENTATION_STATES.AUTHENTICATION_FAILED;
        this._recomputeReady();
        this.renderControls(this.currentState);
    }

    _presentationStateFor(authenticationState) {
        switch (authenticationState) {
            case AUTHENTICATION_STATES.UNINITIALIZED:
            case AUTHENTICATION_STATES.INITIALIZING:
                return AUTH_PRESENTATION_STATES.CHECKING;
            case AUTHENTICATION_STATES.SIGNED_OUT:
                return AUTH_PRESENTATION_STATES.SIGNED_OUT;
            case AUTHENTICATION_STATES.READY:
                return AUTH_PRESENTATION_STATES.READY;
            case AUTHENTICATION_STATES.INTERACTION_REQUIRED:
                return AUTH_PRESENTATION_STATES.INTERACTION_REQUIRED;
            case AUTHENTICATION_STATES.CONFIGURATION_ERROR:
            case AUTHENTICATION_STATES.NETWORK_ERROR:
            case AUTHENTICATION_STATES.AUTHENTICATION_ERROR:
            default:
                return AUTH_PRESENTATION_STATES.AUTHENTICATION_FAILED;
        }
    }

    _effectiveAuthenticationPresentation() {
        if (
            this.authenticationPresentation === AUTH_PRESENTATION_STATES.READY &&
            this.prerequisiteReason === 'config'
        ) {
            return AUTH_PRESENTATION_STATES.CONFIGURATION_REQUIRED;
        }
        return this.authenticationPresentation;
    }

    _authenticationControlConfig(recordingState) {
        if (![RECORDING_STATES.IDLE, RECORDING_STATES.ERROR].includes(recordingState)) {
            return null;
        }

        const presentation = this._effectiveAuthenticationPresentation();
        if (presentation === AUTH_PRESENTATION_STATES.READY) return null;

        const hidden = { hidden: true };
        switch (presentation) {
            case AUTH_PRESENTATION_STATES.CHECKING:
                return {
                    title: MESSAGES.AUTH_CHECKING,
                    body: '',
                    note: '',
                    primary: hidden,
                    secondary: hidden
                };
            case AUTH_PRESENTATION_STATES.SIGNED_OUT:
                return {
                    title: MESSAGES.AUTH_SIGN_IN_TITLE,
                    body: MESSAGES.AUTH_SIGN_IN_BODY,
                    note: MESSAGES.AUTH_SIGN_IN_NOTE,
                    primary: { label: MESSAGES.AUTH_CONTINUE, action: 'continue' },
                    secondary: hidden
                };
            case AUTH_PRESENTATION_STATES.INTERACTION_REQUIRED:
                return this._interactionRequiredControlConfig();
            case AUTH_PRESENTATION_STATES.AUTHORIZATION_DENIED:
                return {
                    title: MESSAGES.AUTHORIZATION_DENIED_TITLE,
                    body: MESSAGES.AUTHORIZATION_DENIED_BODY,
                    note: '',
                    primary: { label: MESSAGES.VIEW_AZURE_SETUP, action: 'help' },
                    secondary: hidden
                };
            case AUTH_PRESENTATION_STATES.CONFIGURATION_REQUIRED:
                return {
                    title: MESSAGES.TARGET_URI_REQUIRED_TITLE,
                    body: MESSAGES.TARGET_URI_REQUIRED_BODY,
                    note: '',
                    primary: { label: MESSAGES.OPEN_SETTINGS, action: 'open-settings' },
                    secondary: hidden
                };
            case AUTH_PRESENTATION_STATES.AUTHENTICATION_FAILED:
            default:
                return {
                    title: MESSAGES.AUTH_FAILED_TITLE,
                    body: MESSAGES.AUTH_FAILED_BODY,
                    note: '',
                    primary: { label: MESSAGES.AUTH_CONTINUE, action: 'continue' },
                    secondary: hidden
                };
        }
    }

    _interactionRequiredControlConfig() {
        const recoveryState = this.authInteractionController?.getRecoveryState?.().state;
        if (recoveryState === AUDIO_SAFETY_STATES.UNSENT) {
            return {
                title: 'Authentication required',
                body: MESSAGES.AUTH_UNSENT_BODY,
                note: '',
                primary: { label: MESSAGES.AUTH_DOWNLOAD_RECORDING, action: 'download' },
                secondary: { label: MESSAGES.AUTH_DISCARD_AND_SIGN_IN, action: 'discard' }
            };
        }
        if (recoveryState === AUTH_RECOVERY_STATES.DOWNLOADED) {
            return {
                title: 'Authentication required',
                body: 'The recording download was initiated. Continue only when you are ready to leave this page.',
                note: '',
                primary: { label: MESSAGES.AUTH_CONTINUE, action: 'continue-after-download' },
                secondary: { label: MESSAGES.AUTH_DISCARD_AND_SIGN_IN, action: 'discard' }
            };
        }
        if (recoveryState === AUDIO_SAFETY_STATES.ACTIVE) {
            return {
                title: 'Finish the recording first',
                body: 'Microsoft sign in cannot continue while recording audio.',
                note: '',
                primary: { hidden: true },
                secondary: { hidden: true }
            };
        }
        return {
            title: MESSAGES.AUTH_SIGN_IN_TITLE,
            body: 'Continue with Microsoft to restore authentication.',
            note: '',
            primary: { label: MESSAGES.AUTH_CONTINUE, action: 'continue' },
            secondary: { hidden: true }
        };
    }

    _renderAuthenticationContext(config) {
        if (!this.authContext) return;
        this.authContext.hidden = false;
        if (this.authContextTitle) this.authContextTitle.textContent = config.title;
        if (this.authContextBody) {
            this.authContextBody.textContent = config.body;
            this.authContextBody.hidden = !config.body;
        }
        if (this.authContextNote) {
            this.authContextNote.textContent = config.note;
            this.authContextNote.hidden = !config.note;
        }
        this._applyAuthenticationButton(this.authPrimaryAction, config.primary);
        this._applyAuthenticationButton(this.authSecondaryAction, config.secondary);
    }

    _hideAuthenticationContext() {
        if (this.authContext) this.authContext.hidden = true;
        if (this.authPrimaryAction?.dataset) this.authPrimaryAction.dataset.authAction = '';
        if (this.authSecondaryAction?.dataset) this.authSecondaryAction.dataset.authAction = '';
    }

    _applyAuthenticationButton(button, config) {
        this._applyButton(button, config);
        if (button?.dataset) button.dataset.authAction = config.action || '';
    }

    async _handleAuthenticationAction(action) {
        const interactionRequired = this.authenticationPresentation ===
            AUTH_PRESENTATION_STATES.INTERACTION_REQUIRED;
        let result;
        try {
            switch (action) {
                case 'continue':
                    result = await this.authInteractionController
                        ?.continueWithMicrosoft?.({ interactionRequired });
                    break;
                case 'download':
                    result = await this.authInteractionController?.downloadUnsentRecording?.();
                    this.renderControls(this.currentState);
                    break;
                case 'continue-after-download':
                    result = await this.authInteractionController
                        ?.continueAfterDownload?.({ interactionRequired: true });
                    break;
                case 'discard':
                    result = await this.authInteractionController
                        ?.discardUnsentAndContinue?.({ interactionRequired: true });
                    this.renderControls(this.currentState);
                    break;
                case 'open-settings':
                    this.settings?.openSettingsModal?.(this.authPrimaryAction);
                    break;
                case 'help':
                    this.openHelp();
                    break;
                default:
                    break;
            }
        } catch {
            result = { state: AUTH_RECOVERY_STATES.BLOCKED };
        }

        if (result?.state === AUTH_RECOVERY_STATES.BLOCKED) {
            this.renderControls(this.currentState);
            this.showError(action === 'download'
                ? MESSAGES.RECORDING_DOWNLOAD_FAILED
                : MESSAGES.AUTHENTICATION_ACTION_FAILED);
        }
    }

    _recomputeReady() {
        this.ready = Boolean(
            this.prerequisitesReady &&
            this._effectiveAuthenticationPresentation() === AUTH_PRESENTATION_STATES.READY
        );
    }

    /**
     * Computes the control-cluster configuration for a state. Pure (depends only
     * on the state, the canRetry flag, and this.ready) — easy to test.
     *
     * @method _controlConfig
     * @private
     * @param {string} state
     * @returns {Object} { primary, secondary, discard, retry, spinner }
     */
    _controlConfig(state) {
        const S = RECORDING_STATES;
        const hidden = Object.freeze({ hidden: true });
        const idle = {
            primary: { label: MESSAGES.CONTROL_START, hidden: false, disabled: !this.ready, recording: false },
            secondary: hidden,
            discard: hidden,
            retry: hidden,
            spinner: false
        };
        // "Busy" states show only a disabled primary (transient/processing) with an
        // optional spinner; "active" states (recording/paused) show Done + a
        // secondary (Pause/Resume) + Discard.
        const busy = (label, spinner = false) => ({
            ...idle,
            primary: { label, hidden: false, disabled: true, recording: false },
            spinner
        });
        const active = (secondaryLabel) => ({
            primary: { label: MESSAGES.CONTROL_DONE, hidden: false, disabled: false, recording: true },
            secondary: { label: secondaryLabel, hidden: false },
            discard: { hidden: false },
            retry: hidden,
            spinner: false
        });

        switch (state) {
            case S.INITIALIZING: return busy(MESSAGES.CONTROL_STARTING);
            case S.RECORDING: return active(MESSAGES.CONTROL_PAUSE);
            case S.PAUSED: return active(MESSAGES.CONTROL_RESUME);
            case S.CONFIRMING_DISCARD:
                // The dialog owns the interaction; the cluster stays but inert.
                return { ...idle, primary: { label: MESSAGES.CONTROL_DONE, hidden: false, disabled: true, recording: true } };
            case S.STOPPING: return busy(MESSAGES.CONTROL_FINISHING);
            case S.PROCESSING: return busy(MESSAGES.CONTROL_TRANSCRIBING, true);
            case S.CANCELLING: return busy(MESSAGES.CONTROL_START);
            case S.ERROR:
                // Primary stays enabled regardless of `ready` so ERROR always has an
                // escape (a fresh start re-runs the prerequisite checks). Retry shows
                // from the persisted this.canRetry, surviving bare re-renders.
                return {
                    ...idle,
                    primary: { label: MESSAGES.CONTROL_START, hidden: false, disabled: false, recording: false },
                    retry: { hidden: !this.canRetry, label: MESSAGES.RETRY_TRANSCRIPTION }
                };
            case S.IDLE:
            default:
                return idle;
        }
    }

    /**
     * Applies a button config: hidden/disabled/label. Labels write to a `.btn-label`
     * child when present (so an icon sibling is preserved) and to aria-label.
     *
     * @method _applyButton
     * @private
     * @param {HTMLElement|null} btn
     * @param {Object} cfg - { hidden, disabled, label }
     * @returns {void}
     */
    _applyButton(btn, cfg) {
        if (!btn) return;
        btn.hidden = Boolean(cfg.hidden);
        if (cfg.hidden) return;
        if (typeof cfg.label === 'string') {
            const labelEl = btn.querySelector ? btn.querySelector('.btn-label') : null;
            if (labelEl) {
                labelEl.textContent = cfg.label;
            } else {
                btn.textContent = cfg.label;
            }
            btn.setAttribute('aria-label', cfg.label);
        }
        btn.disabled = Boolean(cfg.disabled);
    }

    /**
     * Records prerequisite readiness and re-renders the current state's controls.
     *
     * @method _setReady
     * @private
     * @param {boolean} ready
     * @param {string|null} [reason]
     * @returns {void}
     */
    _setReady(ready, reason = null) {
        this.prerequisitesReady = Boolean(ready);
        this.prerequisiteReason = ready ? null : reason;
        this._recomputeReady();
        this.renderControls(this.currentState);
    }

    // ───────────────────────── Discard dialog ─────────────────────────

    /**
     * Opens the proportional-discard confirm dialog with the stakes named.
     *
     * @method openDiscardDialog
     * @param {string} [durationLabel] - Elapsed duration, e.g. "24:31"
     * @returns {void}
     */
    openDiscardDialog(durationLabel) {
        if (this.discardDialogBody) {
            this.discardDialogBody.textContent = durationLabel
                ? `Discard ${durationLabel} of recording?`
                : 'Discard this recording?';
        }
        // If the modal cannot be presented (no native <dialog> support, or showModal
        // throws), never strand the FSM in CONFIRMING_DISCARD with a live recorder —
        // fall back to keeping the recording (the safe default).
        if (!this.discardDialog || typeof this.discardDialog.showModal !== 'function') {
            eventBus.emit(APP_EVENTS.DISCARD_KEPT);
            return;
        }
        try {
            if (!this.discardDialog.open) this.discardDialog.showModal();
        } catch {
            eventBus.emit(APP_EVENTS.DISCARD_KEPT);
        }
    }

    confirmUnsentDiscard({ title, message, confirmLabel }) {
        if (!this.discardDialog || typeof this.discardDialog.showModal !== 'function') {
            return Promise.resolve(false);
        }
        if (this.discardDialogTitle) this.discardDialogTitle.textContent = title;
        if (this.discardDialogBody) this.discardDialogBody.textContent = message;
        this._setButtonLabel(this.discardConfirmButton, confirmLabel);
        this._setButtonLabel(this.discardKeepButton, 'Keep recording');

        const activeElement = document.activeElement;
        try {
            if (!this.discardDialog.open) this.discardDialog.showModal();
        } catch {
            return Promise.resolve(false);
        }

        this._unsentDiscardInvoker = activeElement && activeElement !== document.body
            ? activeElement
            : null;
        return new Promise((resolve) => {
            this._unsentDiscardResolve = resolve;
        });
    }

    _resolveUnsentDiscard(confirmed) {
        const resolve = this._unsentDiscardResolve;
        const invoker = this._unsentDiscardInvoker;
        this._unsentDiscardResolve = null;
        this._unsentDiscardInvoker = null;
        if (
            this.discardDialog &&
            typeof this.discardDialog.close === 'function' &&
            this.discardDialog.open
        ) {
            this.discardDialog.close();
        }
        if (this.discardDialogTitle) this.discardDialogTitle.textContent = 'Discard recording?';
        this._setButtonLabel(this.discardConfirmButton, 'Discard');
        resolve?.(Boolean(confirmed));
        const focusTarget = invoker?.isConnected === false ? null : invoker;
        (focusTarget || this.authPrimaryAction)?.focus?.();
    }

    _setButtonLabel(button, label) {
        if (!button) return;
        const labelElement = button.querySelector?.('.btn-label');
        if (labelElement) labelElement.textContent = label;
        else button.textContent = label;
        button.setAttribute?.('aria-label', label);
    }

    /**
     * Closes the discard dialog and emits the chosen outcome (Keep or Discard).
     *
     * @method closeDiscardDialog
     * @param {string} resultEvent - APP_EVENTS.DISCARD_KEPT or DISCARD_CONFIRMED
     * @returns {void}
     */
    closeDiscardDialog(resultEvent) {
        if (this.discardDialog && typeof this.discardDialog.close === 'function' && this.discardDialog.open) {
            this.discardDialog.close();
        }
        eventBus.emit(resultEvent);
        // The discard button that held focus was hidden before the modal opened, so
        // the browser drops focus to <body> on close — restore it to the primary.
        if (this.primaryAction && !this.primaryAction.disabled && typeof this.primaryAction.focus === 'function') {
            this.primaryAction.focus();
        }
    }

    // ───────────────────────── Prerequisites ─────────────────────────

    checkBrowserSupport() {
        if (!PermissionManager.checkBrowserSupport()) {
            this.setStatus(MESSAGES.BROWSER_NOT_SUPPORTED);
            return false;
        }
        return true;
    }

    /**
     * Checks all recording prerequisites (browser support + API config) and sets
     * readiness, which drives whether the primary control is enabled.
     *
     * @method checkRecordingPrerequisites
     * @returns {boolean} True when ready to record
     */
    checkRecordingPrerequisites() {
        if (!this.checkBrowserSupport()) {
            this._setReady(false, 'browser');
            eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'browser' });
            return false;
        }

        const config = this.settings.getModelConfig();
        // While in ERROR the FSM owns the status line ("…Tap mic to retry"); don't
        // clobber it with a generic ready/config message on a prerequisite re-check.
        const inError = this.currentState === RECORDING_STATES.ERROR;
        if (!config.uri) {
            if (!inError) this.setStatus(MESSAGES.API_NOT_CONFIGURED);
            this._setReady(false, 'config');
            eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'config' });
            return false;
        }

        this._setReady(true);
        if (!inError) this.setStatus(DEFAULT_RESET_STATUS);
        eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: true });
        eventBus.emit(APP_EVENTS.APP_READY);
        return true;
    }

    enableMicrophoneAfterFix() {
        if (this.checkRecordingPrerequisites()) {
            logger.child('UI').info('Microphone re-enabled after fixing prerequisites');
        }
    }

    // ───────────────────────── Status + transcript ─────────────────────────

    setStatus(message) {
        // While a temporary toast (success/error feedback) owns the status line,
        // defer this base message to become the toast's revert target instead of
        // stripping the toast's colour. The toast reverts to it when it expires.
        if (this.statusElement._statusTimeout) {
            this.statusElement._pendingBaseStatus = message;
            return;
        }
        this.statusElement.textContent = message;
        // Return to the base (AA-safe) colour: drop any temporary type modifier.
        if (this.statusElement.classList) {
            this.statusElement.classList.remove(...STATUS_TYPE_CLASSES);
        }
        this.statusElement._pendingBaseStatus = undefined;
        this.statusElement.style.color = '';
    }

    showError(message) {
        this.setStatus(message || MESSAGES.ERROR_OCCURRED);
    }

    /**
     * Displays transcribed text, appending below any existing text with a divider.
     *
     * @method displayTranscription
     * @param {string} text
     * @returns {void}
     */
    displayTranscription(text) {
        const incoming = text || 'No transcription returned';
        if (this.transcriptElement.value) {
            this.transcriptElement.value += TRANSCRIPT_SEGMENT_DIVIDER + incoming;
        } else {
            this.transcriptElement.value = incoming;
        }

        this.transcriptElement.focus();
        this.transcriptElement.selectionStart = this.transcriptElement.value.length;
        this.transcriptElement.selectionEnd = this.transcriptElement.value.length;
        this.transcriptElement.scrollTop = this.transcriptElement.scrollHeight;

        // Text-arrival animation — a quiet settle that marks freshly-landed words.
        this._playArrival();

        // Persist the freshly-updated transcript, then refresh Restore visibility.
        this.persistTranscript();
        this.updateRestoreAffordance();
    }

    /**
     * Plays the one-shot text-arrival animation on the transcript box. Retriggers
     * cleanly on each landing by toggling the class off then on across a frame.
     * No-op under reduced motion or without the box.
     *
     * @method _playArrival
     * @private
     * @returns {void}
     */
    _playArrival() {
        const el = this.transcriptElement;
        if (!el || !el.classList || this._prefersReducedMotion()) return;
        el.classList.remove('transcript-arrived');
        // Force a reflow so removing + re-adding the class restarts the animation.
        if (typeof el.offsetWidth === 'number') void el.offsetWidth;
        el.classList.add('transcript-arrived');
        clearTimeout(this._arrivalTimer);
        this._arrivalTimer = setTimeout(() => {
            if (el.classList) el.classList.remove('transcript-arrived');
        }, 700);
    }

    /**
     * Persists the current transcript text to the single-slot store (the seam that
     * later swaps localStorage for a backend). Empty text clears the recovery slot.
     *
     * @method persistTranscript
     * @returns {boolean} True when the transcript store reports success.
     */
    persistTranscript() {
        if (!this.transcriptStore || !this.transcriptElement) return false;

        const persisted = this.transcriptStore.save(this.transcriptElement.value);
        if (persisted) {
            this._autosaveFailureNotified = false;
            return true;
        }

        if (!this._autosaveFailureNotified) {
            this._autosaveFailureNotified = true;
            this._emitStatus(MESSAGES.TRANSCRIPT_AUTOSAVE_FAILED, 'error');
        }
        return false;
    }

    /**
     * Restores an autosaved transcript into an empty box on load (reload/crash
     * recovery). Leaves a non-empty box alone.
     *
     * @method restoreTranscriptIfEmpty
     * @returns {void}
     */
    restoreTranscriptIfEmpty() {
        if (!this.transcriptStore || !this.transcriptElement) return;
        if (!this.transcriptElement.value) {
            const record = this.transcriptStore.load();
            if (record && record.text) {
                this.transcriptElement.value = record.text;
            }
        }
        this.updateRestoreAffordance();
    }

    /**
     * Emits a transient status toast. Collapses the repeated UI_STATUS_UPDATE
     * boilerplate shared by the transcript actions.
     *
     * @method _emitStatus
     * @private
     * @param {string} message
     * @param {string} [type='info']
     * @returns {void}
     */
    _emitStatus(message, type = 'info') {
        eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, { message, type, temporary: true });
    }

    /**
     * Grab — copy the transcript to the clipboard and clear the box. The record is
     * persisted FIRST, so the words survive a clipboard failure or later clobber,
     * and remain recoverable via Restore.
     *
     * @method grabTranscript
     * @returns {Promise<boolean>} Resolves true when the text reached the clipboard.
     */
    grabTranscript() {
        const text = this.transcriptElement.value;
        if (!text) {
            this._emitStatus(MESSAGES.NO_TEXT_TO_GRAB, 'error');
            return Promise.resolve(false);
        }
        const persisted = this.persistTranscript();
        return navigator.clipboard.writeText(text)
            .then(() => {
                if (!persisted) {
                    this.updateRestoreAffordance();
                    return true;
                }
                clearTimeout(this._autosaveTimer);
                this._autosaveTimer = null;
                this.transcriptElement.value = '';
                this.updateRestoreAffordance();
                this._emitStatus(MESSAGES.TEXT_GRAB_SUCCESS, 'success');
                return true;
            })
            .catch(() => {
                this._emitStatus(MESSAGES.TEXT_GRAB_FAILED, 'error');
                return false;
            });
    }

    /**
     * Restore — resurrect the last transcript into the box. Persistent and
     * repeatable: Grab → clobbered clipboard → Restore → Grab again all work.
     *
     * @method restoreTranscript
     * @returns {void}
     */
    restoreTranscript() {
        if (!this.transcriptStore) return;
        const record = this.transcriptStore.load();
        if (!record || !record.text) return;
        this.transcriptElement.value = record.text;
        this.transcriptElement.focus();
        this.updateRestoreAffordance();
        this._emitStatus(MESSAGES.TRANSCRIPT_RESTORED, 'success');
    }

    /**
     * Shows the persistent Restore affordance exactly when the box is empty and a
     * saved record exists; hides it otherwise.
     *
     * @method updateRestoreAffordance
     * @returns {void}
     */
    updateRestoreAffordance() {
        if (!this.restoreButton) return;
        const boxEmpty = !this.transcriptElement || !this.transcriptElement.value;
        // Short-circuit on boxEmpty so we never touch storage on the typing hot
        // path — has() reads + JSON-parses, and while the box has text the button
        // is hidden regardless of what's saved.
        this.restoreButton.hidden = !(boxEmpty && Boolean(this.transcriptStore && this.transcriptStore.has()));
    }

    updateTimer(timeString) {
        this.timerElement.textContent = timeString;
    }

    showSpinner() {
        this.spinnerContainer.style.display = 'block';
    }

    hideSpinner() {
        this.spinnerContainer.style.display = 'none';
    }

    // ───────────────────────── Settings + visualisation helpers ─────────────────────────

    openSettingsModal() {
        if (this.settings) {
            this.settings.openSettingsModal();
        }
    }

    clearVisualization() {
        if (this.visualizer) {
            const canvasCtx = this.visualizer.getContext('2d');
            const isDarkTheme = document.documentElement.classList.contains('dark-theme');
            canvasCtx.fillStyle = isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
            canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);
        }
    }

    stopVisualization() {
        if (this.visualizationController) {
            this.visualizationController.stop();
            this.visualizationController = null;
        }
        this.clearVisualization();
    }
}
