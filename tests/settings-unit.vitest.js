/**
 * @fileoverview Unit tests for keyless Settings helpers and menu form state.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ID, MESSAGES, MODEL_TYPES, STORAGE_KEYS } from '../js/constants.js';

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
        <select id="${ID.INPUT_DEVICE}"><option value="">System Default</option></select>
        <input id="${ID.NOISE_TOGGLE}" type="checkbox">
        <button id="${ID.SAVE_SETTINGS}">Save changes</button>
        <input type="radio" name="theme-mode" value="auto">
        <input type="radio" name="theme-mode" value="light">
        <input type="radio" name="theme-mode" value="dark">
    `;
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

let Settings;

beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    installSettingsDom();
    ({ Settings } = await import('../js/settings.js'));
});

describe('Settings DOM caching', () => {
    it('queries the DOM only during construction', () => {
        const getElementById = vi.spyOn(document, 'getElementById');
        const settings = new Settings();
        expect(getElementById).toHaveBeenCalled();

        getElementById.mockClear();
        settings.updateSettingsVisibility();
        settings.loadSettingsToForm();
        settings.sanitizeInputs();
        settings.getValidationErrors();

        expect(getElementById).not.toHaveBeenCalled();
        settings.destroy();
    });
});

describe('Settings model defaults', () => {
    it('defaults to MAI-Transcribe 1.5 when no model is saved', () => {
        const settings = new Settings();
        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        settings.destroy();
    });

    it('resets a removed saved model and persists the correction', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, 'removed-model');
        const setItem = vi.spyOn(localStorage, 'setItem');

        const settings = new Settings();

        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(setItem).toHaveBeenCalledWith(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        settings.destroy();
    });
});

describe('Settings Target URI helpers', () => {
    let settings;

    beforeEach(() => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        settings = new Settings();
        settings.modelSelect.value = MODEL_TYPES.WHISPER;
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
    });

    it('sanitizes whitespace from the active Target URI', () => {
        settings.whisperUriInput.value = ' https://target.invalid /transcribe\n';
        settings.sanitizeInputs();
        expect(settings.whisperUriInput.value).toBe('https://target.invalid/transcribe');
    });

    it('sanitizes only the selected model Target URI through the public helper', () => {
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.whisperUriInput.value = '  https://whisper.invalid/transcribe  ';
        settings.maiTranscribeUriInput.value = '  https://mai.invalid/transcribe  ';

        settings.sanitizeInputs();

        expect(settings.maiTranscribeUriInput.value).toBe('https://mai.invalid/transcribe');
        expect(settings.whisperUriInput.value).toBe('  https://whisper.invalid/transcribe  ');
    });

    it('selects exactly one active URI input', () => {
        expect(settings._getActiveInputs()).toEqual({ uriInput: settings.whisperUriInput });
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        expect(settings._getActiveInputs()).toEqual({ uriInput: settings.maiTranscribeUriInput });
    });

    it.each([
        ['', MESSAGES.URI_REQUIRED],
        ['http://target.invalid/transcribe', MESSAGES.URI_MUST_BE_HTTPS],
        ['not-a-target-uri', MESSAGES.INVALID_URI_FORMAT]
    ])('rejects invalid Target URI %j', (uri, expectedError) => {
        settings.whisperUriInput.value = uri;
        expect(settings.getValidationErrors()).toContain(expectedError);
    });

    it('accepts a valid HTTPS Target URI with path and query intact', () => {
        settings.whisperUriInput.value = 'https://target.invalid/path?version=fake';
        expect(settings.getValidationErrors()).toEqual([]);
        expect(settings.whisperUriInput.value).toBe('https://target.invalid/path?version=fake');
    });

    it('identifies the invalid Target URI as the Settings entry focus target', () => {
        settings.whisperUriInput.value = '';
        expect(settings.getSettingsFocusTarget()).toBe(settings.whisperUriInput);
    });

    it('handles a missing URI input without throwing', () => {
        settings.whisperUriInput = null;
        expect(() => settings.sanitizeInputs()).not.toThrow();
        expect(settings.getValidationErrors()).toEqual([MESSAGES.URI_REQUIRED]);
    });

    it('rejects adapters without Target URI storage metadata', () => {
        settings.adapterRegistry = new Map([['broken-model', {
            id: 'broken-model',
            storageKeys: Object.freeze({})
        }]]);
        expect(() => settings._getTargetUriStorageKey('broken-model'))
            .toThrow('Target URI storage metadata is missing for model "broken-model"');
    });
});
