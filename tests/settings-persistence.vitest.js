/**
 * @fileoverview Instant-apply Settings persistence, Target URI validation, and badge states.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import {
    DEFAULT_MAI_TRANSCRIBE_STYLE,
    DEFAULT_MODEL_TYPE,
    ID,
    MAI_TRANSCRIBE_STYLES,
    MESSAGES,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS
} from '../js/constants.js';
import { modelAdapterRegistry } from '../js/model-adapters/index.js';

/** Target URI badge copy owned by the Settings modal rows. */
const BADGE = Object.freeze({
    VALID: { text: '✓ Valid HTTPS', modifier: 'uri-badge--valid' },
    NOT_HTTPS: { text: 'Must be HTTPS', modifier: 'uri-badge--error' },
    INVALID: { text: MESSAGES.INVALID_URI_FORMAT, modifier: 'uri-badge--error' },
    REQUIRED: { text: 'Required for the active model', modifier: 'uri-badge--warn' },
    UNSET: { text: 'Not set', modifier: 'uri-badge--muted' }
});

/**
 * Builds the instant-apply Settings DOM: the quick-settings popover controls plus
 * the modal rows that own the Target URI fields and their status badges.
 */
function installSettingsDom() {
    document.body.innerHTML = `
        <div id="${ID.STATUS}"></div>
        <select id="${ID.MODEL_SELECT}">
            <option value="${MODEL_TYPES.WHISPER}">Azure Whisper</option>
            <option value="${MODEL_TYPES.MAI_TRANSCRIBE_1_5}">MAI-Transcribe 1.5</option>
        </select>
        <input id="${ID.QUICK_NOISE_TOGGLE}" type="checkbox" role="switch">
        <input type="radio" name="theme-mode-quick" value="auto">
        <input type="radio" name="theme-mode-quick" value="light">
        <input type="radio" name="theme-mode-quick" value="dark">
        <dialog id="${ID.SETTINGS_MODAL}">
            <div class="settings-row" data-settings-row="model" data-category="model">
                <select id="${ID.SETTINGS_MODEL_SELECT}">
                    <option value="${MODEL_TYPES.WHISPER}">Azure Whisper</option>
                    <option value="${MODEL_TYPES.MAI_TRANSCRIBE_1_5}">MAI-Transcribe 1.5</option>
                </select>
            </div>
            <div class="settings-row" id="${ID.VERBATIM_SETTING}" data-settings-row="verbatim" data-category="model">
                <input id="${ID.VERBATIM_TOGGLE}" type="checkbox" role="switch">
            </div>
            <div class="settings-row" data-settings-row="device" data-category="microphone">
                <select id="${ID.INPUT_DEVICE}">
                    <option value="">System Default</option>
                    <option value="fixture-device">Fixture device</option>
                </select>
            </div>
            <div class="settings-row" data-settings-row="noise" data-category="microphone">
                <input id="${ID.NOISE_TOGGLE}" type="checkbox" role="switch">
            </div>
            <div class="settings-row" data-settings-row="theme" data-category="appearance">
                <input type="radio" name="theme-mode" value="auto">
                <input type="radio" name="theme-mode" value="light">
                <input type="radio" name="theme-mode" value="dark">
            </div>
            <div class="settings-row" data-settings-row="whisperUri" data-category="connection">
                <input type="url" id="${ID.WHISPER_URI}">
                <span id="${ID.WHISPER_URI_BADGE}" class="uri-badge"></span>
            </div>
            <div class="settings-row" data-settings-row="maiUri" data-category="connection">
                <input type="url" id="${ID.MAI_TRANSCRIBE_URI}">
                <span id="${ID.MAI_URI_BADGE}" class="uri-badge"></span>
            </div>
        </dialog>
        <input type="hidden" id="${ID.RECORDING_ENVIRONMENT}" value="${RECORDING_ENVIRONMENTS.QUIET}">
    `;
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

/** Types into a Target URI field the way a User does, one instant-apply input event. */
function typeUri(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

function readBadge(badgeId) {
    const badge = document.getElementById(badgeId);
    return { text: badge.textContent, className: badge.className };
}

function expectBadge(badgeId, state) {
    const { text, className } = readBadge(badgeId);
    expect(text).toBe(state.text);
    expect(className.split(/\s+/u)).toEqual(
        expect.arrayContaining(['uri-badge', state.modifier])
    );
}

function createSurfaceDouble() {
    return {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        refreshRows: vi.fn()
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

describe('Settings hydration', () => {
    it('loads both stored Target URIs, the model, and the recording environment on construction', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://mai.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.RECORDING_ENVIRONMENT, RECORDING_ENVIRONMENTS.NOISY);
        const settings = new Settings();

        expect(settings.whisperUriInput.value).toBe('https://whisper.invalid/transcribe');
        expect(settings.maiTranscribeUriInput.value).toBe('https://mai.invalid/transcribe');
        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(settings.settingsModelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(settings.noiseToggle.checked).toBe(true);
        expect(settings.quickNoiseToggle.checked).toBe(true);
        expect(settings.recordingEnvironmentSelect.value).toBe(RECORDING_ENVIRONMENTS.NOISY);
        settings.destroy();
    });

    it('exposes no draft, save, or User-menu API', () => {
        const settings = new Settings();

        [
            'saveSettings',
            'prepareSettingsDraft',
            'discardSettingsDraft',
            'getValidationErrors',
            'getSettingsFocusTarget',
            'setUserMenu'
        ].forEach((removedMethod) => {
            expect(settings[removedMethod]).toBeUndefined();
        });
        settings.destroy();
    });

    it('opens the Settings modal on Connection through the surface without a duplicate announcement', () => {
        const settings = new Settings();
        const surface = createSurfaceDouble();
        const invoker = document.createElement('button');
        const emit = vi.spyOn(eventBus, 'emit');
        settings.setSurface(surface);

        settings.openSettingsModal(invoker);

        expect(surface.openModal).toHaveBeenCalledWith({ category: 'connection', invoker });
        // The surface alone emits UI_SETTINGS_OPENED; Settings must not double it.
        expect(emit).not.toHaveBeenCalledWith(APP_EVENTS.UI_SETTINGS_OPENED);
        settings.destroy();
    });
});

describe('Model selection applies instantly', () => {
    it('persists the model, syncs both selects, and emits the switch contract', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://mai.invalid/transcribe');
        const settings = new Settings();
        const emit = vi.spyOn(eventBus, 'emit');

        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.settingsModelSelect.dispatchEvent(new Event('change'));

        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(settings.modelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(settings.getCurrentModel()).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_MODEL_SWITCHED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            savedModel: MODEL_TYPES.WHISPER
        });
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            previousModel: MODEL_TYPES.WHISPER
        });
        const presentation = { model: MODEL_TYPES.MAI_TRANSCRIBE_1_5, hasUri: true };
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, presentation);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, presentation);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        settings.destroy();
    });

    it('reports the committed model to SETTINGS_MODEL_CHANGED subscribers', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const setItem = vi.spyOn(localStorage, 'setItem');
        const observed = [];
        const off = eventBus.on(APP_EVENTS.SETTINGS_MODEL_CHANGED, () => {
            observed.push([settings.getCurrentModel(), localStorage.getItem(STORAGE_KEYS.MODEL)]);
        });

        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.settingsModelSelect.dispatchEvent(new Event('change'));
        off();

        expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.MODEL))
            .toEqual([[STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5]]);
        expect(observed).toEqual([
            [MODEL_TYPES.MAI_TRANSCRIBE_1_5, MODEL_TYPES.MAI_TRANSCRIBE_1_5]
        ]);
        settings.destroy();
    });

    it('mirrors a quick-settings model choice into the modal select', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();

        settings.modelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.modelSelect.dispatchEvent(new Event('change'));

        expect(settings.settingsModelSelect.value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        settings.destroy();
    });

    it('re-selecting the active model announces the switch without a model-changed event', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const emit = vi.spyOn(eventBus, 'emit');

        settings.settingsModelSelect.value = MODEL_TYPES.WHISPER;
        settings.settingsModelSelect.dispatchEvent(new Event('change'));

        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_MODEL_SWITCHED, {
            model: MODEL_TYPES.WHISPER,
            savedModel: MODEL_TYPES.WHISPER
        });
        expect(emit).not.toHaveBeenCalledWith(
            APP_EVENTS.SETTINGS_MODEL_CHANGED,
            expect.anything()
        );
        expect(emit).not.toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, expect.anything());
        settings.destroy();
    });

    it('reports the stored Target URI of the newly selected model', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const emit = vi.spyOn(eventBus, 'emit');

        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.settingsModelSelect.dispatchEvent(new Event('change'));

        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            hasUri: false
        });
        settings.destroy();
    });
});

describe('Target URI persists only while it is valid HTTPS', () => {
    it('stores a valid HTTPS Target URI as it is typed and announces the update', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();
        const emit = vi.spyOn(eventBus, 'emit');

        typeUri(settings.whisperUriInput, 'https://whisper.invalid/transcribe');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI))
            .toBe('https://whisper.invalid/transcribe');
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);
        settings.destroy();
    });

    it('strips pasted whitespace before validating and storing', () => {
        const settings = new Settings();

        typeUri(settings.whisperUriInput, '  https://whisper.invalid/tra nscribe\n');

        expect(settings.whisperUriInput.value).toBe('https://whisper.invalid/transcribe');
        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI))
            .toBe('https://whisper.invalid/transcribe');
        settings.destroy();
    });

    it('stores the inactive model Target URI too because both fields are live', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();

        typeUri(settings.maiTranscribeUriInput, 'https://mai.invalid/transcribe');

        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI))
            .toBe('https://mai.invalid/transcribe');
        settings.destroy();
    });

    it.each([
        ['http://target.invalid/transcribe'],
        ['not-a-target-uri'],
        ['https:/']
    ])('never stores the invalid value %j', (uri) => {
        const settings = new Settings();

        typeUri(settings.whisperUriInput, uri);

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
        settings.destroy();
    });

    it('keeps the last valid Target URI while the field is mid-edit and invalid', () => {
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        const settings = new Settings();

        typeUri(settings.whisperUriInput, 'https:/');
        typeUri(settings.whisperUriInput, 'http://whisper.invalid/transcribe');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI))
            .toBe('https://whisper.invalid/transcribe');
        settings.destroy();
    });

    it('clears the stored key when the field is emptied', () => {
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://stale.invalid/transcribe');
        const settings = new Settings();

        typeUri(settings.whisperUriInput, '');
        typeUri(settings.maiTranscribeUriInput, '   ');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI)).toBeNull();
        settings.destroy();
    });

    it('replaces a stored Target URI as soon as a new valid one is typed', () => {
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://old.invalid/transcribe');
        const settings = new Settings();

        typeUri(settings.whisperUriInput, 'https://new.invalid/transcribe');

        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI)).toBe('https://new.invalid/transcribe');
        settings.destroy();
    });
});

describe('Target URI badges', () => {
    it.each([
        ['https://whisper.invalid/transcribe', BADGE.VALID],
        ['http://whisper.invalid/transcribe', BADGE.NOT_HTTPS],
        ['not-a-target-uri', BADGE.INVALID]
    ])('reports %j while typing', (uri, expectedState) => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();

        typeUri(settings.whisperUriInput, uri);

        expectBadge(ID.WHISPER_URI_BADGE, expectedState);
        settings.destroy();
    });

    it('asks for the active model Target URI and stays quiet about the inactive one', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();

        expectBadge(ID.WHISPER_URI_BADGE, BADGE.REQUIRED);
        expectBadge(ID.MAI_URI_BADGE, BADGE.UNSET);
        settings.destroy();
    });

    it('moves the requirement to the other field when the model changes', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        const settings = new Settings();

        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.settingsModelSelect.dispatchEvent(new Event('change'));

        expectBadge(ID.MAI_URI_BADGE, BADGE.REQUIRED);
        expectBadge(ID.WHISPER_URI_BADGE, BADGE.UNSET);
        settings.destroy();
    });

    it('confirms stored Target URIs on load', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_URI, 'https://mai.invalid/transcribe');
        const settings = new Settings();

        expectBadge(ID.WHISPER_URI_BADGE, BADGE.VALID);
        expectBadge(ID.MAI_URI_BADGE, BADGE.VALID);
        settings.destroy();
    });

    it('returns to the requirement badge when the active field is emptied', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.WHISPER);
        localStorage.setItem(STORAGE_KEYS.WHISPER_URI, 'https://whisper.invalid/transcribe');
        const settings = new Settings();

        typeUri(settings.whisperUriInput, '');

        expectBadge(ID.WHISPER_URI_BADGE, BADGE.REQUIRED);
        settings.destroy();
    });

    it('replaces the badge modifier instead of stacking states', () => {
        const settings = new Settings();

        typeUri(settings.whisperUriInput, 'http://whisper.invalid/transcribe');
        typeUri(settings.whisperUriInput, 'https://whisper.invalid/transcribe');

        expect(readBadge(ID.WHISPER_URI_BADGE).className).toBe('uri-badge uri-badge--valid');
        settings.destroy();
    });
});

describe('Microphone and transcription preferences apply instantly', () => {
    it('keeps both noise switches in sync and persists the recording environment', () => {
        const settings = new Settings();

        settings.noiseToggle.checked = true;
        settings.noiseToggle.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT))
            .toBe(RECORDING_ENVIRONMENTS.NOISY);
        expect(settings.quickNoiseToggle.checked).toBe(true);
        expect(settings.recordingEnvironmentSelect.value).toBe(RECORDING_ENVIRONMENTS.NOISY);

        settings.quickNoiseToggle.checked = false;
        settings.quickNoiseToggle.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT))
            .toBe(RECORDING_ENVIRONMENTS.QUIET);
        expect(settings.noiseToggle.checked).toBe(false);
        expect(settings.recordingEnvironmentSelect.value).toBe(RECORDING_ENVIRONMENTS.QUIET);
        settings.destroy();
    });

    it('persists verbatim transcription immediately when the switch changes', () => {
        const settings = new Settings();

        settings.verbatimToggle.checked = true;
        settings.verbatimToggle.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE))
            .toBe(MAI_TRANSCRIBE_STYLES.VERBATIM);

        settings.verbatimToggle.checked = false;
        settings.verbatimToggle.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE))
            .toBe(MAI_TRANSCRIBE_STYLES.READABILITY);
        settings.destroy();
    });

    it('hydrates stored verbatim transcription into the switch and MAI configuration', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        localStorage.setItem(
            STORAGE_KEYS.MAI_TRANSCRIBE_STYLE,
            MAI_TRANSCRIBE_STYLES.VERBATIM
        );
        const settings = new Settings();

        expect(settings.verbatimToggle.checked).toBe(true);
        expect(settings.getModelConfig().transcribeStyle)
            .toBe(MAI_TRANSCRIBE_STYLES.VERBATIM);
        settings.destroy();
    });

    it('synchronizes cross-tab transcription-style changes and removes the listener on destroy', () => {
        const settings = new Settings();
        const dispatchStyleChange = () => window.dispatchEvent(new StorageEvent('storage', {
            key: STORAGE_KEYS.MAI_TRANSCRIBE_STYLE
        }));

        localStorage.setItem(
            STORAGE_KEYS.MAI_TRANSCRIBE_STYLE,
            MAI_TRANSCRIBE_STYLES.VERBATIM
        );
        dispatchStyleChange();
        expect(settings.verbatimToggle.checked).toBe(true);

        localStorage.setItem(
            STORAGE_KEYS.MAI_TRANSCRIBE_STYLE,
            MAI_TRANSCRIBE_STYLES.READABILITY
        );
        dispatchStyleChange();
        expect(settings.verbatimToggle.checked).toBe(false);

        settings.destroy();
        localStorage.setItem(
            STORAGE_KEYS.MAI_TRANSCRIBE_STYLE,
            MAI_TRANSCRIBE_STYLES.VERBATIM
        );
        dispatchStyleChange();
        expect(settings.verbatimToggle.checked).toBe(false);
    });

    it('fails closed to readability for an unknown stored transcription style', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        localStorage.setItem(STORAGE_KEYS.MAI_TRANSCRIBE_STYLE, 'VERBATIM ');
        const settings = new Settings();

        expect(settings.verbatimToggle.checked).toBe(false);
        expect(settings.getModelConfig().transcribeStyle)
            .toBe(MAI_TRANSCRIBE_STYLES.READABILITY);
        settings.destroy();
    });

    it('persists a chosen microphone and clears it for System Default', () => {
        const settings = new Settings();

        settings.inputDeviceSelect.value = 'fixture-device';
        settings.inputDeviceSelect.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(STORAGE_KEYS.INPUT_DEVICE)).toBe('fixture-device');

        settings.inputDeviceSelect.value = '';
        settings.inputDeviceSelect.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(STORAGE_KEYS.INPUT_DEVICE)).toBeNull();
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

        settings.settingsModelSelect.value = customModel;
        settings.settingsModelSelect.dispatchEvent(new Event('change'));
        typeUri(settings.whisperUriInput, 'https://custom.invalid/transcribe');

        expect(localStorage.getItem(STORAGE_KEYS.MODEL)).toBe(customModel);
        expect(localStorage.getItem(STORAGE_KEYS.WHISPER_URI))
            .toBe('https://custom.invalid/transcribe');
        localStorage.setItem(customUriKey, 'https://custom.invalid/transcribe');
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
        [MODEL_TYPES.WHISPER, STORAGE_KEYS.WHISPER_URI, {}],
        [
            MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            STORAGE_KEYS.MAI_TRANSCRIBE_URI,
            { transcribeStyle: DEFAULT_MAI_TRANSCRIBE_STYLE }
        ]
    ])('retrieves the stored configuration for %s', (model, uriKey, expectedExtraFields) => {
        localStorage.setItem(STORAGE_KEYS.MODEL, model);
        localStorage.setItem(uriKey, 'https://target.invalid/transcribe');
        const settings = new Settings();

        expect(settings.getModelConfig()).toEqual({
            model,
            uri: 'https://target.invalid/transcribe',
            ...expectedExtraFields
        });
        settings.destroy();
    });

    it('reports incomplete configuration without opening navigation automatically', () => {
        const settings = new Settings();
        const surface = createSurfaceDouble();
        const emit = vi.spyOn(eventBus, 'emit');
        settings.setSurface(surface);
        emit.mockClear();

        settings.checkInitialSettings();

        expect(surface.openModal).not.toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, {
            message: MESSAGES.TARGET_URI_NOT_CONFIGURED,
            type: 'info'
        });
        expect(settings.getCurrentModel()).toBe(DEFAULT_MODEL_TYPE);
        settings.destroy();
    });
});
