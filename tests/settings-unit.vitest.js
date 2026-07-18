/**
 * @fileoverview Unit tests for keyless Settings helpers and model selection.
 */

import { vi } from 'vitest';
import { ID, MESSAGES, MODEL_TYPES, STORAGE_KEYS } from '../js/constants.js';
import { applyDomSpies } from './helpers/test-dom-vitest.js';
import { createLocalStorageMock, createMockElement } from './helpers/mock-settings-dom.js';

function installSettingsElements() {
    const elements = new Map();
    const inputIds = new Set([
        ID.WHISPER_URI,
        ID.MAI_TRANSCRIBE_URI,
        ID.RECORDING_ENVIRONMENT
    ]);
    const ids = [
        ID.MODEL_SELECT,
        ID.SETTINGS_MODEL_SELECT,
        ID.SETTINGS_MODAL,
        ID.CLOSE_MODAL,
        ID.SAVE_SETTINGS,
        ID.SETTINGS_BUTTON,
        ID.STATUS,
        ID.WHISPER_SETTINGS,
        ID.MAI_TRANSCRIBE_SETTINGS,
        ...inputIds
    ];

    for (const id of ids) {
        const element = createMockElement();
        element.id = id;
        elements.set(id, element);
    }
    elements.get(ID.MODEL_SELECT).value = MODEL_TYPES.WHISPER;
    elements.get(ID.SETTINGS_MODEL_SELECT).value = MODEL_TYPES.WHISPER;
    return elements;
}

describe('Settings DOM caching', () => {
    let Settings;
    let getElementByIdSpy;

    beforeAll(async () => {
        vi.useFakeTimers();
        ({ Settings } = await import('../js/settings.js'));
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        const ids = [
            ID.MODEL_SELECT,
            ID.SETTINGS_MODEL_SELECT,
            ID.SETTINGS_MODAL,
            ID.CLOSE_MODAL,
            ID.SAVE_SETTINGS,
            ID.SETTINGS_BUTTON,
            ID.STATUS,
            ID.WHISPER_SETTINGS,
            ID.MAI_TRANSCRIBE_SETTINGS,
            ID.WHISPER_URI,
            ID.MAI_TRANSCRIBE_URI,
            ID.RECORDING_ENVIRONMENT
        ];
        for (const id of ids) {
            const element = document.createElement(id.includes('uri') ? 'input' : 'div');
            element.id = id;
            document.body.appendChild(element);
        }
        getElementByIdSpy = vi.spyOn(document, 'getElementById');
    });

    afterEach(() => {
        vi.clearAllTimers();
        getElementByIdSpy.mockRestore();
    });

    it('queries the DOM only during construction', () => {
        const settings = new Settings();
        expect(getElementByIdSpy).toHaveBeenCalled();

        getElementByIdSpy.mockClear();
        settings.updateSettingsVisibility();
        settings.loadSettingsToForm();
        settings.sanitizeInputs();
        settings.getValidationErrors();
        settings.saveSettings();

        expect(getElementByIdSpy).not.toHaveBeenCalled();
        settings.destroy();
    });
});

describe('Settings default model and reset migration', () => {
    let Settings;
    let getItemSpy;
    let setItemSpy;

    beforeAll(async () => {
        ({ Settings } = await import('../js/settings.js'));
    });

    beforeEach(() => {
        delete document.getElementById;
        document.body.innerHTML = `
            <select id="${ID.MODEL_SELECT}">
                <option value="${MODEL_TYPES.WHISPER}">Whisper</option>
                <option value="${MODEL_TYPES.MAI_TRANSCRIBE_1_5}">MAI</option>
            </select>
            <select id="${ID.SETTINGS_MODEL_SELECT}"></select>
            <div id="${ID.SETTINGS_MODAL}"></div>
            <button id="${ID.CLOSE_MODAL}"></button>
            <button id="${ID.SAVE_SETTINGS}"></button>
            <button id="${ID.SETTINGS_BUTTON}"></button>
            <div id="${ID.STATUS}"></div>
            <div id="${ID.WHISPER_SETTINGS}"></div>
            <div id="${ID.MAI_TRANSCRIBE_SETTINGS}"></div>
            <input id="${ID.WHISPER_URI}">
            <input id="${ID.MAI_TRANSCRIBE_URI}">
            <input id="${ID.RECORDING_ENVIRONMENT}">
        `;
        getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem').mockReturnValue(null);
        setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {});
    });

    afterEach(() => {
        getItemSpy.mockRestore();
        setItemSpy.mockRestore();
        document.body.innerHTML = '';
        applyDomSpies();
    });

    it('defaults to MAI-Transcribe 1.5 when no model is saved', () => {
        const settings = new Settings();
        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        settings.destroy();
    });

    it('resets a removed saved model to the default and persists the correction', () => {
        getItemSpy.mockImplementation((key) => key === STORAGE_KEYS.MODEL ? 'removed-model' : null);

        const settings = new Settings();

        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(setItemSpy).toHaveBeenCalledWith(
            STORAGE_KEYS.MODEL,
            MODEL_TYPES.MAI_TRANSCRIBE_1_5
        );
        settings.destroy();
    });
});

describe('Settings Target URI helpers', () => {
    const localStorageMock = createLocalStorageMock();
    let Settings;
    let settings;
    let elements;

    beforeAll(async () => {
        ({ Settings } = await import('../js/settings.js'));
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        elements = installSettingsElements();
        globalThis.localStorage = localStorageMock;
        localStorageMock.getItem.mockReturnValue(null);
        vi.spyOn(document, 'getElementById').mockImplementation(
            (id) => elements.get(id) || createMockElement()
        );
        settings = new Settings();
        settings.modelSelect = elements.get(ID.MODEL_SELECT);
        settings.settingsModelSelect = elements.get(ID.SETTINGS_MODEL_SELECT);
        settings.whisperUriInput = elements.get(ID.WHISPER_URI);
        settings.maiTranscribeUriInput = elements.get(ID.MAI_TRANSCRIBE_URI);
        settings.modelSelect.value = MODEL_TYPES.WHISPER;
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
    });

    afterEach(() => {
        settings.destroy();
        vi.restoreAllMocks();
        vi.clearAllTimers();
    });

    it('sanitizes whitespace from the active Whisper Target URI', () => {
        settings.whisperUriInput.value = ' https://target.invalid /transcribe\n';

        settings.sanitizeInputs();

        expect(settings.whisperUriInput.value).toBe('https://target.invalid/transcribe');
    });

    it('sanitizes only the selected model Target URI', () => {
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.whisperUriInput.value = '  https://whisper.invalid/transcribe  ';
        settings.maiTranscribeUriInput.value = '  https://mai.invalid/transcribe  ';

        settings.sanitizeInputs();

        expect(settings.maiTranscribeUriInput.value).toBe('https://mai.invalid/transcribe');
        expect(settings.whisperUriInput.value).toBe('  https://whisper.invalid/transcribe  ');
    });

    it('selects exactly one active URI input', () => {
        expect(settings._getActiveInputs()).toEqual({
            uriInput: settings.whisperUriInput
        });

        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        expect(settings._getActiveInputs()).toEqual({
            uriInput: settings.maiTranscribeUriInput
        });
    });

    it.each([
        ['', MESSAGES.URI_REQUIRED],
        ['http://target.invalid/transcribe', MESSAGES.URI_MUST_BE_HTTPS],
        ['not-a-target-uri', MESSAGES.INVALID_URI_FORMAT]
    ])('rejects invalid Target URI %j', (uri, expectedError) => {
        settings.whisperUriInput.value = uri;
        expect(settings.getValidationErrors()).toContain(expectedError);
    });

    it('accepts a valid HTTPS Target URI and preserves its path and query', () => {
        settings.whisperUriInput.value = 'https://target.invalid/path?version=fake';

        expect(settings.getValidationErrors()).toEqual([]);
        expect(settings.whisperUriInput.value).toBe('https://target.invalid/path?version=fake');
    });

    it('focuses the Target URI when the modal opens with invalid configuration', () => {
        settings.whisperUriInput.value = '';

        settings._focusSettingsModalEntry();

        expect(settings.whisperUriInput.focus).toHaveBeenCalledTimes(1);
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
