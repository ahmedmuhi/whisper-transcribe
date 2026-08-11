/**
 * @fileoverview Unit tests for keyless Settings helpers and instant-apply controls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ID,
    MAI_TRANSCRIBE_STYLES,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS
} from '../js/constants.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';

function modelOptions() {
    return `
        <option value="${MODEL_TYPES.WHISPER}">Azure Whisper</option>
        <option value="${MODEL_TYPES.MAI_TRANSCRIBE_1_5}">MAI-Transcribe 1.5</option>
    `;
}

function installSettingsDom() {
    document.body.innerHTML = `
        <div id="${ID.STATUS}"></div>
        <select id="${ID.MODEL_SELECT}">${modelOptions()}</select>
        <input type="checkbox" id="${ID.QUICK_NOISE_TOGGLE}" role="switch">
        <input type="radio" name="theme-mode-quick" value="auto">
        <input type="radio" name="theme-mode-quick" value="light">
        <input type="radio" name="theme-mode-quick" value="dark">
        <dialog id="${ID.SETTINGS_MODAL}">
            <select id="${ID.SETTINGS_MODEL_SELECT}">${modelOptions()}</select>
            <div id="${ID.VERBATIM_SETTING}" class="settings-row" data-settings-row="verbatim">
                <input type="checkbox" id="${ID.VERBATIM_TOGGLE}" role="switch">
            </div>
            <select id="${ID.INPUT_DEVICE}"><option value="">System Default</option></select>
            <input type="checkbox" id="${ID.NOISE_TOGGLE}" role="switch">
            <input type="radio" name="theme-mode" value="auto">
            <input type="radio" name="theme-mode" value="light">
            <input type="radio" name="theme-mode" value="dark">
            <input type="url" id="${ID.WHISPER_URI}">
            <span id="${ID.WHISPER_URI_BADGE}" class="uri-badge"></span>
            <input type="url" id="${ID.MAI_TRANSCRIBE_URI}">
            <span id="${ID.MAI_URI_BADGE}" class="uri-badge"></span>
        </dialog>
        <input type="hidden" id="${ID.RECORDING_ENVIRONMENT}" value="quiet">
    `;
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

/** Fires the instant-apply event a real user interaction would fire. */
function fire(element, type) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
}

function badgeOf(element) {
    return { text: element.textContent, className: element.className };
}

let Settings;

beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    eventBus.clear();
    installSettingsDom();
    ({ Settings } = await import('../js/settings.js'));
});

describe('Settings DOM caching', () => {
    it('queries the DOM only during construction', () => {
        const getElementById = vi.spyOn(document, 'getElementById');
        const settings = new Settings();
        expect(getElementById).toHaveBeenCalled();

        getElementById.mockClear();
        settings.updateVerbatimVisibility();
        settings.loadTargetUris();
        settings.loadThemeMode();
        settings.loadNoiseToggle();
        settings.renderUriBadges();
        settings.getModelConfig();

        expect(getElementById).not.toHaveBeenCalled();
        settings.destroy();
    });
});

describe('Settings instant-apply surface', () => {
    it('exposes no draft, commit, or save API', () => {
        const settings = new Settings();

        expect(settings.saveSettings).toBeUndefined();
        expect(settings.getValidationErrors).toBeUndefined();
        expect(settings.getSettingsFocusTarget).toBeUndefined();
        expect(settings.setUserMenu).toBeUndefined();
        expect(settings.prepareSettingsDraft).toBeUndefined();
        expect(settings.discardSettingsDraft).toBeUndefined();
        expect(document.getElementById('save-settings')).toBeNull();

        settings.destroy();
    });

    it('routes modal open and close through the settings surface', () => {
        const settings = new Settings();
        const surface = { openModal: vi.fn(), closeModal: vi.fn() };
        settings.setSurface(surface);
        const opened = vi.fn();
        const closed = vi.fn();
        eventBus.on(APP_EVENTS.UI_SETTINGS_OPENED, opened);
        eventBus.on(APP_EVENTS.UI_SETTINGS_CLOSED, closed);
        const invoker = document.getElementById(ID.MODEL_SELECT);

        settings.openSettingsModal(invoker);
        settings.closeSettingsModal();

        expect(surface.openModal).toHaveBeenCalledWith({ category: 'connection', invoker });
        expect(surface.closeModal).toHaveBeenCalledTimes(1);
        // The surface owns the open/closed announcements (emitted from its own
        // openModal/close path); the Settings wrapper must not emit a duplicate.
        expect(opened).not.toHaveBeenCalled();
        expect(closed).not.toHaveBeenCalled();
        settings.destroy();
    });
});

describe('Settings model defaults', () => {
    it('defaults to MAI-Transcribe 1.5 when no model is saved', () => {
        const settings = new Settings();
        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(settings.settingsModelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
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

describe('Settings instant model change', () => {
    let settings;

    beforeEach(() => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        settings = new Settings();
    });

    it('persists the quick-settings choice at once and syncs the modal select', () => {
        const emit = vi.spyOn(eventBus, 'emit');

        settings.modelSelect.value = MODEL_TYPES.WHISPER;
        fire(settings.modelSelect, 'change');

        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.WHISPER);
        expect(settings.settingsModelSelect.value).toBe(MODEL_TYPES.WHISPER);
        expect(settings.getCurrentModel()).toBe(MODEL_TYPES.WHISPER);
        expect(emit.mock.calls.map(([name]) => name)).toEqual([
            APP_EVENTS.UI_MODEL_SWITCHED,
            APP_EVENTS.SETTINGS_MODEL_CHANGED,
            APP_EVENTS.SETTINGS_SAVED,
            APP_EVENTS.SETTINGS_LOADED,
            APP_EVENTS.SETTINGS_UPDATED
        ]);
    });

    it('persists the modal choice at once and syncs the quick-settings select', () => {
        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        fire(settings.settingsModelSelect, 'change');

        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.WHISPER);
        expect(settings.modelSelect.value).toBe(MODEL_TYPES.WHISPER);
    });

    it('reports the switch payload with the previous model and stored Target URI state', () => {
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://target.invalid/transcribe');
        const switched = vi.fn();
        const changed = vi.fn();
        const saved = vi.fn();
        eventBus.on(APP_EVENTS.UI_MODEL_SWITCHED, switched);
        eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, changed);
        eventBus.on(APP_EVENTS.SETTINGS_SAVED, saved);

        settings.modelSelect.value = MODEL_TYPES.WHISPER;
        fire(settings.modelSelect, 'change');

        expect(switched).toHaveBeenCalledWith({
            model: MODEL_TYPES.WHISPER,
            savedModel: MODEL_TYPES.MAI_TRANSCRIBE_1_5
        });
        expect(changed).toHaveBeenCalledWith({
            model: MODEL_TYPES.WHISPER,
            previousModel: MODEL_TYPES.MAI_TRANSCRIBE_1_5
        });
        expect(saved).toHaveBeenCalledWith({ model: MODEL_TYPES.WHISPER, hasUri: true });
    });

    it('announces the switch but skips the change events when the model is unchanged', () => {
        const emit = vi.spyOn(eventBus, 'emit');

        fire(settings.modelSelect, 'change');

        expect(emit.mock.calls.map(([name]) => name)).toEqual([APP_EVENTS.UI_MODEL_SWITCHED]);
        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
    });

    it('refreshes verbatim visibility through the surface when one is connected', () => {
        const surface = { refreshRows: vi.fn() };
        settings.setSurface(surface);

        settings.modelSelect.value = MODEL_TYPES.WHISPER;
        fire(settings.modelSelect, 'change');

        expect(surface.refreshRows).toHaveBeenCalled();
        expect(settings.verbatimSetting.hidden).toBe(false);
    });
});

describe('Settings MAI verbatim visibility', () => {
    it('shows the verbatim row only for MAI-Transcribe 1.5', () => {
        const settings = new Settings();

        settings.modelSelect.value = MODEL_TYPES.WHISPER;
        settings.updateVerbatimVisibility();
        expect(settings.verbatimSetting.hidden).toBe(true);

        settings.modelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.updateVerbatimVisibility();
        expect(settings.verbatimSetting.hidden).toBe(false);
        settings.destroy();
    });

    it('persists the verbatim choice the moment the switch is flipped', () => {
        const settings = new Settings();

        settings.verbatimToggle.checked = true;
        fire(settings.verbatimToggle, 'change');
        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE))
            .toBe(MAI_TRANSCRIBE_STYLES.VERBATIM);
        expect(settings.getModelConfig().transcribeStyle).toBe(MAI_TRANSCRIBE_STYLES.VERBATIM);

        settings.verbatimToggle.checked = false;
        fire(settings.verbatimToggle, 'change');
        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE))
            .toBe(MAI_TRANSCRIBE_STYLES.READABILITY);
        settings.destroy();
    });
});

describe('Settings Target URI instant apply', () => {
    let settings;

    beforeEach(() => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        settings = new Settings();
    });

    it('strips whitespace as the Target URI is typed', () => {
        settings.whisperUriInput.value = ' https://target.invalid /transcribe\n';
        fire(settings.whisperUriInput, 'input');

        expect(settings.whisperUriInput.value).toBe('https://target.invalid/transcribe');
    });

    it('persists a valid HTTPS Target URI immediately and reports the update', () => {
        const updated = vi.fn();
        eventBus.on(APP_EVENTS.SETTINGS_UPDATED, updated);

        settings.whisperUriInput.value = 'https://target.invalid/path?version=fake';
        fire(settings.whisperUriInput, 'input');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI))
            .toBe('https://target.invalid/path?version=fake');
        expect(settings.getModelConfig().uri).toBe('https://target.invalid/path?version=fake');
        expect(updated).toHaveBeenCalledTimes(1);
    });

    it('writes each model Target URI to its own adapter storage key', () => {
        settings.maiTranscribeUriInput.value = 'https://mai.invalid/transcribe';
        fire(settings.maiTranscribeUriInput, 'input');

        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI))
            .toBe('https://mai.invalid/transcribe');
        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
    });

    it.each([
        ['http://target.invalid/transcribe'],
        ['not-a-target-uri']
    ])('never persists the invalid Target URI %j', (uri) => {
        settings.whisperUriInput.value = uri;
        fire(settings.whisperUriInput, 'input');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
    });

    it('clears the stored Target URI when the field is emptied', () => {
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://target.invalid/transcribe');
        settings.whisperUriInput.value = '   ';
        fire(settings.whisperUriInput, 'input');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
    });

    it('loads each stored Target URI back into its field on construction', () => {
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://mai.invalid/transcribe');

        const reloaded = new Settings();

        expect(reloaded.whisperUriInput.value).toBe('https://whisper.invalid/transcribe');
        expect(reloaded.maiTranscribeUriInput.value).toBe('https://mai.invalid/transcribe');
        reloaded.destroy();
    });

    it('rejects adapters without Target URI storage metadata', () => {
        settings.adapterRegistry = new Map([['broken-model', {
            id: 'broken-model',
            storageKeys: Object.freeze({})
        }]]);
        expect(() => settings._getTargetUriStorageKey('broken-model'))
            .toThrow('Target URI storage metadata is missing for model "broken-model"');
    });

    it('handles a missing URI input without throwing', () => {
        settings.whisperUriInput = null;
        expect(() => settings.renderUriBadges()).not.toThrow();
        expect(() => settings.loadTargetUris()).not.toThrow();
    });
});

describe('Settings Target URI badges', () => {
    let settings;

    beforeEach(() => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        settings = new Settings();
    });

    it('marks the active model empty field as required and the other as not set', () => {
        expect(badgeOf(settings.whisperUriBadge)).toEqual({
            text: 'Required for the active model',
            className: 'uri-badge uri-badge--warn'
        });
        expect(badgeOf(settings.maiUriBadge)).toEqual({
            text: 'Not set',
            className: 'uri-badge uri-badge--muted'
        });
    });

    it.each([
        ['https://target.invalid/transcribe', '✓ Valid HTTPS', 'uri-badge uri-badge--valid'],
        ['http://target.invalid/transcribe', 'Must be HTTPS', 'uri-badge uri-badge--error'],
        ['not-a-target-uri', MESSAGES.INVALID_URI_FORMAT, 'uri-badge uri-badge--error']
    ])('renders %j as %j', (uri, text, className) => {
        settings.whisperUriInput.value = uri;
        fire(settings.whisperUriInput, 'input');

        expect(badgeOf(settings.whisperUriBadge)).toEqual({ text, className });
    });

    it('moves the required badge to the model that becomes active', () => {
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        fire(settings.settingsModelSelect, 'change');

        expect(settings.maiUriBadge.textContent).toBe('Required for the active model');
        expect(settings.whisperUriBadge.textContent).toBe('Not set');
    });
});

describe('Settings noise cancellation', () => {
    it('keeps the popover switch, the modal switch, and the legacy field in step', () => {
        const settings = new Settings();

        settings.quickNoiseToggle.checked = true;
        fire(settings.quickNoiseToggle, 'change');

        expect(localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT))
            .toBe(RECORDING_ENVIRONMENTS.NOISY);
        expect(settings.noiseToggle.checked).toBe(true);
        expect(settings.recordingEnvironmentSelect.value).toBe(RECORDING_ENVIRONMENTS.NOISY);

        settings.noiseToggle.checked = false;
        fire(settings.noiseToggle, 'change');

        expect(localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT))
            .toBe(RECORDING_ENVIRONMENTS.QUIET);
        expect(settings.quickNoiseToggle.checked).toBe(false);
        expect(settings.recordingEnvironmentSelect.value).toBe(RECORDING_ENVIRONMENTS.QUIET);
        settings.destroy();
    });

    it('restores the stored environment into both switches on construction', () => {
        localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, RECORDING_ENVIRONMENTS.NOISY);

        const settings = new Settings();

        expect(settings.noiseToggle.checked).toBe(true);
        expect(settings.quickNoiseToggle.checked).toBe(true);
        settings.destroy();
    });
});

describe('Settings theme mode', () => {
    function checkedThemeValues(name) {
        return Array.from(document.querySelectorAll(`input[name="${name}"]`))
            .filter((input) => input.checked)
            .map((input) => input.value);
    }

    it('applies a popover theme choice to the modal radios and persists it', () => {
        const settings = new Settings();
        const themeChanged = vi.fn();
        eventBus.on(APP_EVENTS.UI_THEME_CHANGED, themeChanged);

        const darkQuick = document.querySelector('input[name="theme-mode-quick"][value="dark"]');
        darkQuick.checked = true;
        fire(darkQuick, 'change');

        expect(localStorage.getItem(STORAGE_KEYS.THEME_MODE)).toBe('dark');
        expect(checkedThemeValues('theme-mode')).toEqual(['dark']);
        expect(checkedThemeValues('theme-mode-quick')).toEqual(['dark']);
        expect(themeChanged).toHaveBeenCalledWith({ mode: 'dark' });
        settings.destroy();
    });

    it('applies a modal theme choice to the popover radios', () => {
        const settings = new Settings();

        const lightModal = document.querySelector('input[name="theme-mode"][value="light"]');
        lightModal.checked = true;
        fire(lightModal, 'change');

        expect(checkedThemeValues('theme-mode-quick')).toEqual(['light']);
        settings.destroy();
    });

    it('restores the stored mode into both radio groups and falls back to auto', () => {
        localStorage.setItem(STORAGE_KEYS.THEME_MODE, 'nonsense');
        const settings = new Settings();

        expect(checkedThemeValues('theme-mode')).toEqual(['auto']);
        expect(checkedThemeValues('theme-mode-quick')).toEqual(['auto']);
        settings.destroy();
    });
});

describe('Settings startup status', () => {
    it('asks for a Target URI when the active model has none', () => {
        const status = vi.fn();
        eventBus.on(APP_EVENTS.UI_STATUS_UPDATE, status);

        const settings = new Settings();

        expect(status).toHaveBeenCalledWith({
            message: MESSAGES.TARGET_URI_NOT_CONFIGURED,
            type: 'info'
        });
        settings.destroy();
    });

    it('reports a configured model instead of a warning', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://target.invalid/transcribe');
        const status = vi.fn();
        const loaded = vi.fn();
        eventBus.on(APP_EVENTS.UI_STATUS_UPDATE, status);
        eventBus.on(APP_EVENTS.SETTINGS_LOADED, loaded);

        const settings = new Settings();

        expect(status).not.toHaveBeenCalled();
        expect(loaded).toHaveBeenCalledWith({ model: MODEL_TYPES.WHISPER, hasUri: true });
        settings.destroy();
    });
});
