/**
 * @fileoverview End-to-end workflow tests for Settings + UI integration.
 *
 * Settings applies instantly: there is no Save button, no draft, and no commit
 * step. These tests cover the model-change event sequence, live Target URI
 * validation/persistence, and the readiness path the UI derives from them.
 */

import { vi } from 'vitest';
import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import {
    DEFAULT_RESET_STATUS,
    ID,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS
} from '../js/constants.js';
import { createStatefulMockElement, createLocalStorageMock } from './helpers/mock-settings-dom.js';

// Mock dependencies
vi.mock('../js/logger.js', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
    },
}));

vi.mock('../js/status-helper.js', () => ({
    showTemporaryStatus: vi.fn(),
}));

const localStorageMock = createLocalStorageMock();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});
global.localStorage = localStorageMock;

// Stateful backing store so instant-apply writes are visible to the next read
// (a model change reads the previous model straight after persisting it).
const storageState = new Map();

function installStorageBehaviour() {
    localStorageMock.getItem.mockImplementation(
        (key) => (storageState.has(key) ? storageState.get(key) : null)
    );
    localStorageMock.setItem.mockImplementation((key, value) => {
        storageState.set(key, String(value));
    });
    localStorageMock.removeItem.mockImplementation((key) => {
        storageState.delete(key);
    });
}

function seedStorage(entries = {}) {
    storageState.clear();
    Object.entries(entries).forEach(([key, value]) => storageState.set(key, value));
}

// Mock DOM elements — comprehensive set for both Settings and UI
const mockElements = new Map();
const requiredElementIds = [
    ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT, ID.STATUS,
    ID.WHISPER_URI, ID.WHISPER_URI_BADGE,
    ID.MAI_TRANSCRIBE_URI, ID.MAI_URI_BADGE,
    ID.NOISE_TOGGLE, ID.QUICK_NOISE_TOGGLE, ID.RECORDING_ENVIRONMENT,
    ID.VERBATIM_SETTING, ID.VERBATIM_TOGGLE, ID.INPUT_DEVICE,
    ID.GRAB_TEXT_BUTTON, ID.TRANSCRIPT, ID.TIMER, ID.SPINNER_CONTAINER
].filter(Boolean);

requiredElementIds.forEach(id => {
    mockElements.set(id, createStatefulMockElement(id));
});

// VISUALIZER needs getContext for canvas mock
const visualizerMock = createStatefulMockElement(ID.VISUALIZER);
visualizerMock.getContext = vi.fn(() => ({
    fillStyle: '',
    fillRect: vi.fn()
}));
mockElements.set(ID.VISUALIZER, visualizerMock);

global.document = {
    getElementById: vi.fn((id) => {
        if (!mockElements.has(id)) mockElements.set(id, createStatefulMockElement(id));
        return mockElements.get(id);
    }),
    querySelector: vi.fn(() => createStatefulMockElement('query')),
    querySelectorAll: vi.fn(() => []),
    body: createStatefulMockElement('body'),
    // The palette attribute and the .dark-theme class both land on this element.
    documentElement: createStatefulMockElement('documentElement')
};

// Mock window.matchMedia
global.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    }))
};

// Import modules after mocks are set up
let Settings, UI;
beforeAll(async () => {
    Settings = (await import('../js/settings.js')).Settings;
    UI = (await import('../js/ui.js')).UI;
});

// Shared helper: reset all mock elements to defaults
function resetMockElements() {
    mockElements.forEach(element => {
        element.value = '';
        element.textContent = '';
        element.style.display = 'block';
        element.disabled = false;
        element.hidden = false;
        element.checked = false;
        element.className = '';
        element.style.opacity = '1';
        element.style.cursor = 'pointer';
        if (element.id === ID.MODEL_SELECT || element.id === ID.SETTINGS_MODEL_SELECT) {
            element.value = MODEL_TYPES.WHISPER;
        }
    });
}

/**
 * Invokes the most recently registered listener of `type` on a mock element,
 * i.e. the one belonging to the Settings instance under test.
 */
function dispatch(element, type) {
    const handler = element.addEventListener.mock.calls
        .filter(([eventType]) => eventType === type)
        .at(-1)?.[1];
    if (!handler) throw new Error(`No "${type}" listener registered on #${element.id}`);
    handler({ target: element });
}

/** Selects a model on one of the two selects and fires its change listener. */
function selectModel(element, model) {
    element.value = model;
    dispatch(element, 'change');
}

/** Types into a Target URI field and fires its input listener. */
function typeUri(element, value) {
    element.value = value;
    dispatch(element, 'input');
}

const MODEL_EVENT_SEQUENCE = [
    APP_EVENTS.UI_MODEL_SWITCHED,
    APP_EVENTS.SETTINGS_MODEL_CHANGED,
    APP_EVENTS.SETTINGS_SAVED,
    APP_EVENTS.SETTINGS_LOADED,
    APP_EVENTS.SETTINGS_UPDATED
];

/** The model-related events emitted so far, in order. */
function emittedModelEvents(emitSpy) {
    return emitSpy.mock.calls
        .map(([name]) => name)
        .filter((name) => MODEL_EVENT_SEQUENCE.includes(name));
}

const WHISPER_TARGET_URI = 'https://whisper.invalid/transcribe';
const MAI_TARGET_URI = 'https://mai.invalid/transcribe';

// ─── Instant apply: model changes ────────────────────────────────────────────

describe('Settings instant apply: model changes', () => {
    let settings;
    let ui;
    let emitSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        installStorageBehaviour();
        seedStorage({ [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER });
        resetMockElements();

        emitSpy = vi.spyOn(eventBus, 'emit');

        settings = new Settings();
        ui = new UI();

        vi.spyOn(ui, 'checkBrowserSupport').mockReturnValue(true);
        ui.settings = settings;
        ui.setupEventBusListeners();
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    test('startup with an unconfigured Target URI reports it instead of SETTINGS_LOADED', async () => {
        seedStorage({ [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER });

        const newSettings = new Settings();
        emitSpy.mockClear();

        newSettings.checkInitialSettings();

        expect(emitSpy).not.toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, expect.any(Object));
        await vi.waitFor(() => {
            expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_STATUS_UPDATE, expect.objectContaining({
                message: MESSAGES.TARGET_URI_NOT_CONFIGURED,
                type: 'info'
            }));
        }, { timeout: 600 });

        newSettings.destroy();
    });

    test('page reload → SETTINGS_LOADED → primary control enabled (real path)', () => {
        seedStorage({
            [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER,
            [STORAGE_KEYS.WHISPER_URI]: WHISPER_TARGET_URI
        });

        const reloadedSettings = new Settings();
        // Wire the UI to the reloaded settings so its SETTINGS_LOADED listener
        // runs checkRecordingPrerequisites against the (valid) config for real.
        ui.settings = reloadedSettings;
        const setStatusSpy = vi.spyOn(ui, 'setStatus');

        emitSpy.mockClear();
        reloadedSettings.checkInitialSettings();

        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
            model: MODEL_TYPES.WHISPER,
            hasUri: true
        });
        // Real readiness, not a mocked side effect.
        expect(ui.ready).toBe(true);
        expect(ui.primaryAction.disabled).toBe(false);
        expect(setStatusSpy).toHaveBeenCalledWith(DEFAULT_RESET_STATUS);

        reloadedSettings.destroy();
    });

    test('quick-settings model change persists at once and emits the full event sequence', () => {
        seedStorage({
            [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER,
            [STORAGE_KEYS.WHISPER_URI]: WHISPER_TARGET_URI,
            [STORAGE_KEYS.MAI_TRANSCRIBE_URI]: MAI_TARGET_URI
        });
        emitSpy.mockClear();

        selectModel(mockElements.get(ID.MODEL_SELECT), MODEL_TYPES.MAI_TRANSCRIBE_1_5);

        // Persisted immediately — no Save step.
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.MODEL,
            MODEL_TYPES.MAI_TRANSCRIBE_1_5
        );
        expect(storageState.get(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        // Both selects show the same model.
        expect(mockElements.get(ID.SETTINGS_MODEL_SELECT).value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);

        expect(emittedModelEvents(emitSpy)).toEqual(MODEL_EVENT_SEQUENCE);
        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_MODEL_SWITCHED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            savedModel: MODEL_TYPES.WHISPER
        });
        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_MODEL_CHANGED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            previousModel: MODEL_TYPES.WHISPER
        });
        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            hasUri: true
        });
        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_LOADED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            hasUri: true
        });

        // Real readiness: the new model already has a Target URI.
        expect(ui.ready).toBe(true);
        expect(ui.primaryAction.disabled).toBe(false);
        expect(settings.getModelConfig().uri).toBe(MAI_TARGET_URI);
    });

    test('modal model change syncs the quick-settings select', () => {
        seedStorage({ [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER });

        selectModel(mockElements.get(ID.SETTINGS_MODEL_SELECT), MODEL_TYPES.MAI_TRANSCRIBE_1_5);

        expect(mockElements.get(ID.MODEL_SELECT).value).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(settings.getCurrentModel()).toBe(MODEL_TYPES.MAI_TRANSCRIBE_1_5);
    });

    test('switching to a model with no Target URI blocks recording through the real path', () => {
        seedStorage({
            [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER,
            [STORAGE_KEYS.WHISPER_URI]: WHISPER_TARGET_URI
        });
        emitSpy.mockClear();

        selectModel(mockElements.get(ID.MODEL_SELECT), MODEL_TYPES.MAI_TRANSCRIBE_1_5);

        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_SAVED, {
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            hasUri: false
        });
        expect(ui.ready).toBe(false);
        expect(ui.primaryAction.hidden).toBe(true);
        expect(ui.authPrimaryAction.textContent).toBe(MESSAGES.OPEN_SETTINGS);
    });

    test('re-selecting the current model announces the switch but changes nothing', () => {
        seedStorage({
            [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER,
            [STORAGE_KEYS.WHISPER_URI]: WHISPER_TARGET_URI
        });
        emitSpy.mockClear();

        selectModel(mockElements.get(ID.MODEL_SELECT), MODEL_TYPES.WHISPER);

        expect(emittedModelEvents(emitSpy)).toEqual([APP_EVENTS.UI_MODEL_SWITCHED]);
        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.UI_MODEL_SWITCHED, {
            model: MODEL_TYPES.WHISPER,
            savedModel: MODEL_TYPES.WHISPER
        });
        expect(storageState.get(STORAGE_KEYS.MODEL)).toBe(MODEL_TYPES.WHISPER);
    });

    test('the verbatim row follows the model, and the surface owns it once wired', () => {
        const verbatimRow = mockElements.get(ID.VERBATIM_SETTING);

        selectModel(mockElements.get(ID.MODEL_SELECT), MODEL_TYPES.MAI_TRANSCRIBE_1_5);
        expect(verbatimRow.hidden).toBe(false);

        selectModel(mockElements.get(ID.MODEL_SELECT), MODEL_TYPES.WHISPER);
        expect(verbatimRow.hidden).toBe(true);

        // With a surface attached, row visibility is re-derived by its filter so
        // the row cannot leak into an unrelated category.
        const surface = { refreshRows: vi.fn() };
        settings.setSurface(surface);
        selectModel(mockElements.get(ID.MODEL_SELECT), MODEL_TYPES.MAI_TRANSCRIBE_1_5);

        expect(surface.refreshRows).toHaveBeenCalledOnce();
        expect(verbatimRow.hidden).toBe(true);
    });

    test('the draft/commit API is gone', () => {
        [
            'saveSettings',
            'prepareSettings',
            'discardDraft',
            'getValidationErrors',
            'getSettingsFocusTarget',
            'setUserMenu'
        ].forEach((method) => {
            expect(settings[method]).toBeUndefined();
        });
    });
});

// ─── Instant apply: Target URI validation and persistence ────────────────────

describe('Settings instant apply: Target URI', () => {
    let settings;
    let emitSpy;
    let whisperUri;
    let whisperBadge;
    let maiBadge;

    beforeEach(() => {
        vi.clearAllMocks();
        installStorageBehaviour();
        seedStorage({ [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER });
        resetMockElements();

        emitSpy = vi.spyOn(eventBus, 'emit');
        settings = new Settings();

        whisperUri = mockElements.get(ID.WHISPER_URI);
        whisperBadge = mockElements.get(ID.WHISPER_URI_BADGE);
        maiBadge = mockElements.get(ID.MAI_URI_BADGE);
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    test('badges open on the state of each stored Target URI', () => {
        expect(whisperBadge.textContent).toBe('Required for the active model');
        expect(whisperBadge.className).toBe('uri-badge uri-badge--warn');
        expect(maiBadge.textContent).toBe('Not set');
        expect(maiBadge.className).toBe('uri-badge uri-badge--muted');
    });

    test('a valid HTTPS Target URI persists as it is typed and survives a reload', () => {
        typeUri(whisperUri, `  ${WHISPER_TARGET_URI}  `);

        expect(whisperUri.value).toBe(WHISPER_TARGET_URI);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_URI,
            WHISPER_TARGET_URI
        );
        expect(whisperBadge.textContent).toBe('✓ Valid HTTPS');
        expect(whisperBadge.className).toBe('uri-badge uri-badge--valid');
        expect(emitSpy).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_UPDATED);

        const reloadedSettings = new Settings();
        const config = reloadedSettings.getModelConfig();
        expect(config.model).toBe(MODEL_TYPES.WHISPER);
        expect(config.uri).toBe(WHISPER_TARGET_URI);
        reloadedSettings.destroy();
    });

    test('a non-HTTPS Target URI is reported and never persisted', () => {
        typeUri(whisperUri, 'http://whisper.invalid/transcribe');

        expect(storageState.has(STORAGE_KEYS.WHISPER_URI)).toBe(false);
        expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
            STORAGE_KEYS.WHISPER_URI,
            expect.anything()
        );
        expect(whisperBadge.textContent).toBe('Must be HTTPS');
        expect(whisperBadge.className).toBe('uri-badge uri-badge--error');
    });

    test('an unparsable Target URI is reported and never persisted', () => {
        typeUri(whisperUri, 'not-a-uri');

        expect(storageState.has(STORAGE_KEYS.WHISPER_URI)).toBe(false);
        expect(whisperBadge.textContent).toBe(MESSAGES.INVALID_URI_FORMAT);
        expect(whisperBadge.className).toBe('uri-badge uri-badge--error');
    });

    test('clearing the field removes the stored Target URI', () => {
        typeUri(whisperUri, WHISPER_TARGET_URI);
        expect(storageState.get(STORAGE_KEYS.WHISPER_URI)).toBe(WHISPER_TARGET_URI);

        typeUri(whisperUri, '');

        expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.WHISPER_URI);
        expect(storageState.has(STORAGE_KEYS.WHISPER_URI)).toBe(false);
        expect(whisperBadge.textContent).toBe('Required for the active model');
    });
});

// ─── Microphone Activation ───────────────────────────────────────────────────

describe('Microphone Activation Issue Analysis', () => {
    let settings;
    let ui;

    beforeEach(() => {
        vi.clearAllMocks();
        installStorageBehaviour();
        seedStorage({ [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER });
        resetMockElements();

        settings = new Settings();
        ui = new UI();

        ui.checkBrowserSupport = vi.fn().mockReturnValue(true);
    });

    afterEach(() => {
        settings.destroy();
        eventBus.clear();
    });

    describe('Microphone State Management', () => {
        it('enables the primary control when settings are valid', () => {
            seedStorage({
                [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER,
                [STORAGE_KEYS.WHISPER_URI]: WHISPER_TARGET_URI
            });

            ui.settings = settings;

            const result = ui.checkRecordingPrerequisites();

            expect(result).toBe(true);
            expect(ui.ready).toBe(true);
            expect(ui.primaryAction.disabled).toBe(false);
        });

        it('keeps the primary control disabled when settings are invalid', () => {
            seedStorage({ [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER });

            ui.settings = settings;

            const result = ui.checkRecordingPrerequisites();

            expect(result).toBe(false);
            expect(ui.ready).toBe(false);
            expect(ui.primaryAction.hidden).toBe(true);
            expect(ui.authPrimaryAction.textContent).toBe(MESSAGES.OPEN_SETTINGS);
        });

        it('SETTINGS_UPDATED → checkRecordingPrerequisites → primary enabled', () => {
            seedStorage({
                [STORAGE_KEYS.MODEL]: MODEL_TYPES.WHISPER,
                [STORAGE_KEYS.WHISPER_URI]: WHISPER_TARGET_URI
            });

            ui.settings = settings;
            ui.setupEventBusListeners();

            eventBus.emit(APP_EVENTS.SETTINGS_UPDATED);

            expect(ui.primaryAction.disabled).toBe(false);
        });

    });
});
