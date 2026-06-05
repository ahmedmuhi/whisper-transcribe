/**
 * @fileoverview User interface controller for the whisper-transcribe application.
 */

import { STORAGE_KEYS, COLORS, DEFAULT_RESET_STATUS, MESSAGES, ID, TRANSCRIPT_SEGMENT_DIVIDER, RECORDING_STATES } from './constants.js';
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
    constructor() {
        // Transcript + status + visualiser
        this.statusElement = document.getElementById(ID.STATUS);
        this.transcriptElement = document.getElementById(ID.TRANSCRIPT);
        this.grabTextButton = document.getElementById(ID.GRAB_TEXT_BUTTON);
        this.clearButton = document.getElementById(ID.CLEAR_BUTTON);
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

        // Proportional-discard confirm dialog
        this.discardDialog = document.getElementById(ID.DISCARD_DIALOG);
        this.discardDialogBody = document.getElementById(ID.DISCARD_DIALOG_BODY);
        this.discardKeepButton = document.getElementById(ID.DISCARD_KEEP);
        this.discardConfirmButton = document.getElementById(ID.DISCARD_CONFIRM);

        // Settings / theme
        this.settingsButton = document.getElementById(ID.SETTINGS_BUTTON);
        this.themeToggle = document.getElementById(ID.THEME_TOGGLE);
        this.settingsModal = document.getElementById(ID.SETTINGS_MODAL);
        this.closeModalButton = document.getElementById(ID.CLOSE_MODAL);
        this.saveSettingsButton = document.getElementById(ID.SAVE_SETTINGS);
        this.moonIcon = document.getElementById(ID.MOON_ICON);
        this.sunIcon = document.getElementById(ID.SUN_ICON);

        this.visualizationController = null;

        // Control-surface inputs: the current FSM state, whether prerequisites
        // (browser support + API config) are met, and whether the last error is
        // retryable. renderControls() derives the cluster from these — they persist
        // so a bare re-render (e.g. from _setReady) preserves Retry/escape controls.
        this.currentState = RECORDING_STATES.IDLE;
        this.ready = false;
        this.canRetry = false;
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
                    newMode = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
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

        // Discard confirm dialog — Keep resumes, Discard tears down, Escape = Keep.
        if (this.discardKeepButton) {
            this.discardKeepButton.addEventListener('click', () => this.closeDiscardDialog(APP_EVENTS.DISCARD_KEPT));
        }
        if (this.discardConfirmButton) {
            this.discardConfirmButton.addEventListener('click', () => this.closeDiscardDialog(APP_EVENTS.DISCARD_CONFIRMED));
        }
        if (this.discardDialog) {
            // Native <dialog> fires 'cancel' on Escape — treat it as Keep (safe default).
            this.discardDialog.addEventListener('cancel', (event) => {
                event.preventDefault();
                this.closeDiscardDialog(APP_EVENTS.DISCARD_KEPT);
            });
        }

        // Transcript actions — Cut (grab + clear), Clear (wipe), Restore (recover).
        if (this.grabTextButton) {
            this.grabTextButton.addEventListener('click', () => this.cutTranscript());
        }
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => this.clearTranscript());
        }
        if (this.restoreButton) {
            this.restoreButton.addEventListener('click', () => this.restoreTranscript());
        }

        // Autosave in-place edits (debounced) so a crash/reload never loses words.
        if (this.transcriptElement) {
            this.transcriptElement.addEventListener('input', () => {
                this.updateRestoreAffordance();
                clearTimeout(this._autosaveTimer);
                this._autosaveTimer = setTimeout(() => this.persistTranscript(), 500);
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

        eventBus.on(APP_EVENTS.API_REQUEST_ERROR, () => this.hideSpinner());
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
                const isDarkTheme = document.body.classList.contains('dark-theme');
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
        const cfg = this._controlConfig(state);

        // FLIP: measure → mutate → measure → animate the cluster's size between.
        this._morphIsland(() => {
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
        this.controlCluster.classList.remove('island-idle', 'island-recording', 'island-processing');
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
        try {
            cluster.animate(
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
        cluster.style.setProperty('--island-morph-ms', `${DURATION}ms`);
        cluster.classList.add('island-morphing');
        clearTimeout(this._islandMorphTimer);
        this._islandMorphTimer = setTimeout(() => {
            cluster.classList.remove('island-morphing');
        }, DURATION);
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
     * @returns {void}
     */
    _setReady(ready) {
        this.ready = ready;
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
            this._setReady(false);
            eventBus.emit(APP_EVENTS.APP_PREREQUISITES_CHECKED, { ready: false, reason: 'browser' });
            return false;
        }

        const config = this.settings.getModelConfig();
        // While in ERROR the FSM owns the status line ("…Tap mic to retry"); don't
        // clobber it with a generic ready/config message on a prerequisite re-check.
        const inError = this.currentState === RECORDING_STATES.ERROR;
        if (!config.apiKey || !config.uri) {
            if (!inError) this.setStatus(MESSAGES.API_NOT_CONFIGURED);
            this._setReady(false);
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
        if (this.statusElement._statusTimeout) {
            clearTimeout(this.statusElement._statusTimeout);
            this.statusElement._statusTimeout = null;
        }
        this.statusElement.textContent = message;
        // Return to the base (AA-safe) colour: drop any temporary type modifier.
        if (this.statusElement.classList) {
            this.statusElement.classList.remove('status--error', 'status--success');
        }
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
     * later swaps localStorage for a backend). No-op without a store or with no text.
     *
     * @method persistTranscript
     * @returns {void}
     */
    persistTranscript() {
        if (this.transcriptStore && this.transcriptElement && this.transcriptElement.value) {
            this.transcriptStore.save(this.transcriptElement.value);
        }
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
     * Cut — copy the transcript to the clipboard and clear the box. The record is
     * persisted FIRST, so the words survive a clipboard failure or later clobber.
     *
     * @method cutTranscript
     * @returns {Promise<boolean>} Resolves true when the text reached the clipboard.
     */
    cutTranscript() {
        const text = this.transcriptElement.value;
        if (!text) {
            this._emitStatus(MESSAGES.NO_TEXT_TO_CUT, 'error');
            return Promise.resolve(false);
        }
        this.persistTranscript();
        return navigator.clipboard.writeText(text)
            .then(() => {
                this.transcriptElement.value = '';
                this.updateRestoreAffordance();
                this._emitStatus(MESSAGES.TEXT_CUT_SUCCESS, 'success');
                return true;
            })
            .catch(() => {
                this._emitStatus(MESSAGES.TEXT_CUT_FAILED, 'error');
                return false;
            });
    }

    /**
     * Clear — wipe the box WITHOUT copying. Rare. Record persisted first so a
     * Clear stays recoverable via Restore.
     *
     * @method clearTranscript
     * @returns {void}
     */
    clearTranscript() {
        if (!this.transcriptElement.value) return;
        this.persistTranscript();
        this.transcriptElement.value = '';
        this.updateRestoreAffordance();
        this._emitStatus(MESSAGES.TEXT_CLEARED);
    }

    /**
     * Restore — resurrect the last transcript into the box. Persistent and
     * repeatable: Cut → clobbered clipboard → Restore → Cut again all work.
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
            const isDarkTheme = document.body.classList.contains('dark-theme');
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
