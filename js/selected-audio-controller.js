/**
 * @fileoverview Sole memory-only owner of one local Selected Audio File.
 */

import {
    API_ERROR_CODES,
    AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE,
    AUDIO_SAFETY_STATES,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    AUTHENTICATION_STATES,
    MODEL_TYPES,
    SELECTED_AUDIO_STATES,
    WHISPER_MAX_UPLOAD_BYTES,
    MESSAGES,
    resolveSupportedAudioFormat
} from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

const EMPTY_SNAPSHOT = Object.freeze({ state: SELECTED_AUDIO_STATES.IDLE });
const DURATION_TIMEOUT_MS = 5_000;

/**
 * Reads duration through a short-lived media object URL. Every outcome revokes
 * the URL, and unsupported metadata resolves to null rather than hanging.
 *
 * @param {File} file Selected local File.
 * @param {Object} [dependencies] Injectable browser primitives for tests.
 * @returns {Promise<number|null>}
 */
export function readSelectedAudioDuration(file, { signal } = {}) {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve(null);
            return;
        }

        const audio = document.createElement('audio');
        let objectUrl;
        try {
            objectUrl = URL.createObjectURL(file);
        } catch {
            resolve(null);
            return;
        }

        let timeoutId;
        const finish = (duration) => {
            if (!objectUrl) return;
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onUnavailable);
            audio.onloadedmetadata = null;
            audio.onerror = null;
            try {
                audio.removeAttribute('src');
                audio.load();
            } catch {
                // Resource release continues even when media teardown is unavailable.
            }
            try {
                URL.revokeObjectURL(objectUrl);
            } catch {
                // The File reference is still released by the controller.
            }
            objectUrl = '';
            resolve(Number.isFinite(duration) && duration >= 0 ? duration : null);
        };
        const onMetadata = () => finish(audio.duration);
        const onUnavailable = () => finish(null);

        audio.onloadedmetadata = onMetadata;
        audio.onerror = onUnavailable;
        signal?.addEventListener('abort', onUnavailable, { once: true });
        timeoutId = setTimeout(onUnavailable, DURATION_TIMEOUT_MS);
        try {
            audio.preload = 'metadata';
            audio.src = objectUrl;
        } catch {
            onUnavailable();
        }
    });
}

/**
 * Owns a selected File without exposing it through snapshots, events, or storage.
 */
export class SelectedAudioController {
    #file = null;
    #generation = 0;
    #snapshot = EMPTY_SNAPSHOT;
    #durationAbortController = null;
    #settings;
    #auth;
    #api;
    #recording;
    #readDuration;
    #offModelChanged;

    constructor({
        settings,
        authenticationReadiness,
        apiClient,
        recordingSafety,
        durationReader = readSelectedAudioDuration
    }) {
        this.#settings = settings;
        this.#auth = authenticationReadiness;
        this.#api = apiClient;
        this.#recording = recordingSafety;
        this.#readDuration = durationReader;
        this.#offModelChanged = eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, () => {
            if (this.#file && this.#snapshot.state !== SELECTED_AUDIO_STATES.TRANSCRIBING) {
                void this.#validateCurrentFile();
            }
        });
    }

    getSnapshot() {
        return this.#snapshot;
    }

    getAudioSafetyState() {
        const recordingState = this.#recording?.getAudioSafetyState?.()
            || AUDIO_SAFETY_STATES.SAFE;
        return recordingState === AUDIO_SAFETY_STATES.SAFE && this.#file
            ? AUDIO_SAFETY_STATES.SELECTED
            : recordingState;
    }

    canSelectAudio() {
        return this.getAudioSafetyState() === AUDIO_SAFETY_STATES.SAFE;
    }

    downloadUnsentRecording() {
        return this.#recording?.downloadUnsentRecording?.() === true;
    }

    wasUnsentRecordingDownloadInitiated() {
        return this.#recording?.wasUnsentRecordingDownloadInitiated?.() === true;
    }

    discardUnsentRecording() {
        return this.#recording?.discardUnsentRecording?.() === true;
    }

    async select(file) {
        if (!this.#canSelect(file)) return false;

        this.#file = file;
        return this.#validateCurrentFile();
    }

    async replace(file) {
        if (
            !this.#file ||
            !file ||
            this.#snapshot.state === SELECTED_AUDIO_STATES.TRANSCRIBING ||
            this.#auth?.getState?.() !== AUTHENTICATION_STATES.READY ||
            this.#recording?.getAudioSafetyState?.() !== AUDIO_SAFETY_STATES.SAFE
        ) {
            return false;
        }

        this.#file = file;
        return this.#validateCurrentFile();
    }

    async transcribe() {
        if (!this.#file || ![
            SELECTED_AUDIO_STATES.READY,
            SELECTED_AUDIO_STATES.FAILED
        ].includes(this.#snapshot.state)) {
            return false;
        }

        if (this.#snapshot.model !== this.#settings.getCurrentModel()) {
            await this.#validateCurrentFile();
            return false;
        }

        const file = this.#file;
        const generation = this.#generation;
        const model = this.#snapshot.model;
        this.#setSnapshot({ ...this.#snapshot, state: SELECTED_AUDIO_STATES.TRANSCRIBING });

        let readinessState;
        try {
            const scope = this.#api.getScopeForModel(model);
            readinessState = await this.#auth.ensureTokenReady(scope);
        } catch {
            readinessState = AUTHENTICATION_STATES.AUTHENTICATION_ERROR;
        }

        if (file !== this.#file || generation !== this.#generation) return false;
        if (readinessState !== AUTHENTICATION_STATES.READY) {
            eventBus.emit(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, { state: readinessState });
            this.#setSnapshot({
                ...this.#snapshot,
                state: SELECTED_AUDIO_STATES.FAILED,
                errorCode: API_ERROR_CODES.AUTHENTICATION_REQUIRED,
                errorMessage: MESSAGES.AUTHENTICATION_REQUIRED
            });
            return false;
        }

        if (model !== this.#settings.getCurrentModel()) {
            await this.#validateCurrentFile();
            return false;
        }

        try {
            const text = await this.#api.transcribe(file, message => {
                eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, { message, type: 'info' });
            });
            if (file !== this.#file || generation !== this.#generation) return false;
            eventBus.emit(APP_EVENTS.UI_TRANSCRIPTION_READY, { text });
            eventBus.emit(APP_EVENTS.UI_STATUS_UPDATE, {
                message: MESSAGES.TRANSCRIPTION_COMPLETE,
                type: 'success',
                temporary: true
            });
            this.remove();
            return true;
        } catch (error) {
            if (file !== this.#file || generation !== this.#generation) return false;
            const validationState = error?.code === AUDIO_UPLOAD_LIMIT_ERROR_CODE
                ? SELECTED_AUDIO_STATES.TOO_LARGE
                : error?.code === AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE
                    ? SELECTED_AUDIO_STATES.UNSUPPORTED
                    : SELECTED_AUDIO_STATES.FAILED;
            this.#setSnapshot({
                ...this.#snapshot,
                state: validationState,
                errorCode: error?.code || null,
                errorMessage: error?.message || MESSAGES.ERROR_OCCURRED
            });
            return false;
        }
    }

    async #validateCurrentFile() {
        this.#abortDurationRead();
        const file = this.#file;
        if (!file) return false;
        const generation = ++this.#generation;
        const model = this.#settings.getCurrentModel();
        const base = {
            name: file.name || '',
            size: file.size,
            duration: null,
            format: '',
            model
        };
        this.#setSnapshot({ state: SELECTED_AUDIO_STATES.CHECKING, ...base });

        const format = resolveSupportedAudioFormat(file.type, file.name);
        if (!Number.isFinite(file.size) || file.size <= 0 || !format) {
            this.#setSnapshot({
                state: SELECTED_AUDIO_STATES.UNSUPPORTED,
                ...base,
                errorCode: AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE
            });
            return false;
        }

        if (model === MODEL_TYPES.WHISPER && file.size > WHISPER_MAX_UPLOAD_BYTES) {
            this.#setSnapshot({
                state: SELECTED_AUDIO_STATES.TOO_LARGE,
                ...base,
                format: format.format,
                errorCode: AUDIO_UPLOAD_LIMIT_ERROR_CODE
            });
            return false;
        }

        let duration = null;
        const durationAbortController = new AbortController();
        this.#durationAbortController = durationAbortController;
        try {
            const measuredDuration = await this.#readDuration(file, {
                signal: durationAbortController.signal
            });
            duration = Number.isFinite(measuredDuration) && measuredDuration >= 0
                ? measuredDuration
                : null;
        } catch {
            duration = null;
        } finally {
            if (this.#durationAbortController === durationAbortController) {
                this.#durationAbortController = null;
            }
        }

        if (generation !== this.#generation || file !== this.#file) return false;
        this.#setSnapshot({
            state: SELECTED_AUDIO_STATES.READY,
            ...base,
            duration,
            format: format.format
        });
        return true;
    }

    remove() {
        if (!this.#file) return false;
        this.#abortDurationRead();
        this.#generation += 1;
        this.#file = null;
        this.#setSnapshot(EMPTY_SNAPSHOT);
        return true;
    }

    destroy() {
        this.#offModelChanged?.();
        this.#offModelChanged = null;
        this.remove();
    }

    #canSelect(file) {
        if (!file || this.#file) return false;
        if (this.#auth?.getState?.() !== AUTHENTICATION_STATES.READY) {
            return false;
        }
        return this.canSelectAudio();
    }

    #abortDurationRead() {
        this.#durationAbortController?.abort();
        this.#durationAbortController = null;
    }

    #setSnapshot(snapshot) {
        this.#snapshot = Object.freeze(snapshot);
        eventBus.emit(APP_EVENTS.SELECTED_AUDIO_STATE_CHANGED, this.#snapshot);
    }
}
