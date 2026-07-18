/**
 * @fileoverview Settings persistence, validation, and User-menu save workflow.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import {
    DEFAULT_MODEL_TYPE,
    ID,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS
} from '../js/constants.js';
import { modelAdapterRegistry } from '../js/model-adapters/index.js';

function installSettingsDom() {
    document.body.innerHTML = `
        <div id="${ID.STATUS}"></div>
        <select id="${ID.MODEL_SELECT}">
            <option value="${MODEL_TYPES.WHISPER}">Azure Whisper</option>
            <option value="${MODEL_TYPES.MAI_TRANSCRIBE_1_5}">MAI-Transcribe 1.5</option>
        </select>
        <select id="${ID.SETTINGS_MODEL_SELECT}">
            <option value="${MODEL_TYPES.WHISPER}">Azure Whisper</option>
            <option value="${MODEL_TYPES.MAI_TRANSCRIBE_1_5}">MAI-Transcribe 1.5</option>
        </select>
        <div id="${ID.WHISPER_SETTINGS}"><input id="${ID.WHISPER_URI}"></div>
        <div id="${ID.MAI_TRANSCRIBE_SETTINGS}"><input id="${ID.MAI_TRANSCRIBE_URI}"></div>
        <input id="${ID.RECORDING_ENVIRONMENT}" type="hidden">
        <select id="${ID.INPUT_DEVICE}">
            <option value="">System Default</option>
            <option value="fixture-device">Fixture device</option>
        </select>
        <input id="${ID.NOISE_TOGGLE}" type="checkbox">
        <button id="${ID.SAVE_SETTINGS}">Save changes</button>
        <input type="radio" name="theme-mode" value="auto">
        <input type="radio" name="theme-mode" value="light">
        <input type="radio" name="theme-mode" value="dark">
    `;
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

function createMenuDouble() {
    return {
        openDetail: vi.fn(),
        closeDetail: vi.fn()
    };
}

let Settings;

beforeEach(async () => {
    vi.restoreAllMocks();
    eventBus.clear();
    localStorage.clear();
    installSettingsDom();
    ({ Settings } = await import('../js/settings.js'));
});

afterEach(() => {
    eventBus.clear();
});

describe('Settings draft and persistence workflow', () => {
    it('loads both saved Target URIs and the recording environment into a draft', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://mai.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, RECORDING_ENVIRONMENTS.NOISY);
        const settings = new Settings();

        settings.prepareSettingsDraft();

        expect(settings.whisperUriInput.value).toBe('https://whisper.invalid/transcribe');
        expect(settings.maiTranscribeUriInput.value).toBe('https://mai.invalid/transcribe');
        expect(settings.recordingEnvironmentSelect.value).toBe(RECORDING_ENVIRONMENTS.NOISY);
        settings.destroy();
    });

    it('opens Settings through UserMenu and emits the existing semantic event', () => {
        const settings = new Settings();
        const menu = createMenuDouble();
        const invoker = document.createElement('button');
        const emit = vi.spyOn(eventBus, 'emit');
        settings.setUserMenu(menu);

        settings.openSettingsModal(invoker);

        expect(menu.openDetail).toHaveBeenCalledWith('settings', invoker);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);
        settings.destroy();
    });

    it('discards model and Target URI drafts without changing committed settings', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://saved.invalid/transcribe');
        const settings = new Settings();
        settings.prepareSettingsDraft();
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.whisperUriInput.value = 'https://draft.invalid/transcribe';

        settings.discardSettingsDraft();

        expect(settings.settingsModelSelect.value).toBe(MODEL_TYPES.WHISPER);
        expect(settings.whisperUriInput.value).toBe('https://saved.invalid/transcribe');
        expect(settings.getCurrentModel()).toBe(MODEL_TYPES.WHISPER);
        settings.destroy();
    });

    it('saves both valid Target URIs and closes the Settings detail', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const menu = createMenuDouble();
        settings.setUserMenu(menu);
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.whisperUriInput.value = '  https://whisper.invalid/transcribe  ';
        settings.maiTranscribeUriInput.value = 'https://mai.invalid/transcribe';

        expect(settings.saveSettings()).toBe(true);

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI))
            .toBe('https://whisper.invalid/transcribe');
        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI))
            .toBe('https://mai.invalid/transcribe');
        expect(menu.closeDetail).toHaveBeenCalledOnce();
        settings.destroy();
    });

    it('removes a cleared inactive Target URI instead of retaining stale configuration', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://stale.invalid/transcribe');
        const settings = new Settings();
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.whisperUriInput.value = 'https://whisper.invalid/transcribe';
        settings.maiTranscribeUriInput.value = '';

        expect(settings.saveSettings()).toBe(true);

        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI)).toBeNull();
        settings.destroy();
    });

    it('commits a valid model draft exactly once and announces it after commit', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.maiTranscribeUriInput.value = 'https://mai.invalid/transcribe';
        const setItem = vi.spyOn(localStorage, 'setItem');
        const observed = [];
        const off = eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, () => {
            observed.push(settings.getCurrentModel());
        });

        settings.saveSettings();
        off();

        expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.MODEL))
            .toEqual([[STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5]]);
        expect(observed).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_1_5]);
        settings.destroy();
    });

    it('persists the recording environment on save', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.whisperUriInput.value = 'https://target.invalid/transcribe';
        settings.recordingEnvironmentSelect.value = RECORDING_ENVIRONMENTS.NOISY;

        settings.saveSettings();

        expect(localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT))
            .toBe(RECORDING_ENVIRONMENTS.NOISY);
        settings.destroy();
    });
});

describe('Settings validation and events', () => {
    it.each([
        ['', MESSAGES.URI_REQUIRED],
        ['http://target.invalid/transcribe', MESSAGES.URI_MUST_BE_HTTPS],
        ['not-a-target-uri', MESSAGES.INVALID_URI_FORMAT]
    ])('keeps the detail open and emits validation for %j', (uri, expectedError) => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const menu = createMenuDouble();
        const emit = vi.spyOn(eventBus, 'emit');
        settings.setUserMenu(menu);
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.whisperUriInput.value = uri;

        expect(settings.saveSettings()).toBe(false);

        expect(menu.closeDetail).not.toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith(
            APP_EVENTS.SETTINGS_VALIDATION_ERROR,
            { errors: expect.arrayContaining([expectedError]) }
        );
        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
        settings.destroy();
    });

    it('validates a non-empty inactive Target URI because both fields are editable', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.whisperUriInput.value = 'https://whisper.invalid/transcribe';
        settings.maiTranscribeUriInput.value = 'malformed-target-uri';

        expect(settings.saveSettings()).toBe(false);
        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
        settings.destroy();
    });

    it('keeps the active model unchanged when a draft is invalid', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.maiTranscribeUriInput.value = '';

        settings.saveSettings();

        expect(settings.getCurrentModel()).toBe(MODEL_TYPES.WHISPER);
        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.WHISPER);
        settings.destroy();
    });

    it('emits the complete successful-save event contract', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const emit = vi.spyOn(eventBus, 'emit');
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.whisperUriInput.value = 'https://target.invalid/transcribe';

        settings.saveSettings();

        const presentation = { model: MODEL_TYPES.WHISPER, hasUri: true };
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, presentation);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, presentation);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.SETTINGS_SAVED,
            type: 'success',
            temporary: true,
            duration: 3000
        });
        settings.destroy();
    });

    it('switches the session model without persisting it before Save changes', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const emit = vi.spyOn(eventBus, 'emit');
        settings.modelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;

        settings.modelSelect.dispatchEvent(new Event('change'));

        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.WHISPER);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_MODEL_SWITCHED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            savedModel: MODEL_TYPES.WHISPER
        });
        settings.destroy();
    });
});

describe('Settings adapter metadata and initial configuration', () => {
    it('uses injected adapter Target URI metadata', () => {
        const customModel = 'fixture-model';
        const customUriKey = 'fixture_model_uri';
        const registry = new Map(modelAdapterRegistry);
        registry.set(customModel, { id: customModel, storageKeys: { uri: customUriKey } });
        const settings = new Settings(registry);
        const modelOption = document.createElement('option');
        modelOption.value = customModel;
        modelOption.textContent = 'Fixture model';
        const settingsOption = modelOption.cloneNode(true);
        settings.modelSelect.append(modelOption);
        settings.settingsModelSelect.append(settingsOption);
        settings.modelSelect.value = customModel;
        settings.settingsModelSelect.value = customModel;
        settings.whisperUriInput.value = 'https://custom.invalid/transcribe';

        settings.saveSettings();

        expect(localStorage.getItem(customUriKey)).toBe('https://custom.invalid/transcribe');
        expect(settings.getModelConfig()).toEqual({
            model: customModel,
            uri: 'https://custom.invalid/transcribe'
        });
        settings.destroy();
    });

    it('fails closed when adapter Target URI metadata is missing', () => {
        const registry = new Map(modelAdapterRegistry);
        registry.set('broken-model', { id: 'broken-model', storageKeys: {} });
        const settings = new Settings(registry);
        expect(() => settings._getTargetUriStorageKey('broken-model'))
            .toThrow(/Target URI storage metadata is missing/);
        settings.destroy();
    });

    it.each([
        [MODEL_TYPES.WHISPER, STORAGE_KEYS.WHISPER_URI],
        [MODEL_TYPES.MAI_TRANSCRIBE_1_5, STORAGE_KEYS.MAI_TRANSCRIBE_URI]
    ])('retrieves the committed configuration for %s', (model, uriKey) => {
        localStorage.setItem(STORAGE_KEYS.MODEL, model);
        localStorage.setItem(uriKey, 'https://target.invalid/transcribe');
        const settings = new Settings();

        expect(settings.getModelConfig()).toEqual({
            model,
            uri: 'https://target.invalid/transcribe'
        });
        settings.destroy();
    });

    it('reports incomplete configuration without opening navigation automatically', () => {
        const settings = new Settings();
        const menu = createMenuDouble();
        const emit = vi.spyOn(eventBus, 'emit');
        settings.setUserMenu(menu);
        emit.mockClear();

        settings.checkInitialSettings();

        expect(menu.openDetail).not.toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.TARGET_URI_NOT_CONFIGURED,
            type: 'info'
        });
        expect(settings.getCurrentModel()).toBe(DEFAULT_MODEL_TYPE);
        settings.destroy();
    });
});
