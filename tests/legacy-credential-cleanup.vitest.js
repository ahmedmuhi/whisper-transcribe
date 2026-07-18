/**
 * @fileoverview Proves legacy credentials are removed without ever being read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '../js/event-bus.js';
import { logger } from '../js/logger.js';
import { cleanupLegacyCredentials } from '../js/legacy-credential-cleanup.js';

const bootstrapOrder = vi.hoisted(() => []);
const loggerMock = vi.hoisted(() => {
    const mock = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: null
    };
    mock.child = vi.fn(() => mock);
    return mock;
});

vi.mock('../js/logger.js', () => ({ logger: loggerMock }));
vi.mock('../js/authentication-service.js', () => ({
    AuthenticationService: class AuthenticationService {
        constructor() {
            bootstrapOrder.push('authentication:construct');
        }

        async initialize() {
            bootstrapOrder.push('authentication:initialize');
            localStorage.getItem('fake_msal_cache_entry');
        }
    }
}));
vi.mock('../js/settings.js', () => ({
    Settings: class Settings {
        constructor() {
            bootstrapOrder.push('settings:construct');
            localStorage.getItem('transcription_model');
        }
    }
}));
vi.mock('../js/transcript-store.js', () => ({
    TranscriptStore: class TranscriptStore {
        constructor() {
            bootstrapOrder.push('transcript-store:construct');
        }
    }
}));
vi.mock('../js/ui.js', () => ({
    UI: class UI {
        constructor() {
            bootstrapOrder.push('ui:construct');
        }

        init() {
            bootstrapOrder.push('ui:init');
        }
    }
}));
vi.mock('../js/api-client.js', () => ({
    AzureAPIClient: class AzureAPIClient {
        constructor() {
            bootstrapOrder.push('api-client:construct');
        }
    }
}));
vi.mock('../js/audio-handler.js', () => ({
    AudioHandler: class AudioHandler {
        constructor() {
            bootstrapOrder.push('audio-handler:construct');
        }

        setAudioSourceCoordinator() {}
    }
}));

const LEGACY_NAMES = Object.freeze([
    'whisper_api_key',
    'mai_transcribe_api_key'
]);

const UNRELATED_ENTRIES = Object.freeze({
    whisper_uri: 'https://whisper.invalid.example/transcribe',
    mai_transcribe_uri: 'https://speech.invalid.example/transcribe',
    transcription_model: 'mai-transcribe-1.5',
    theme: 'dark',
    input_device_id: 'fake-device-id',
    recording_environment: 'noisy',
    sidebar_collapsed: 'true',
    transcript_record: '{"text":"valuable transcript","savedAt":1}'
});

function createStorage(initial = {}) {
    const entries = new Map(Object.entries(initial));
    return {
        entries,
        getItem: vi.fn(key => entries.get(key) ?? null),
        setItem: vi.fn((key, value) => entries.set(key, String(value))),
        removeItem: vi.fn(key => entries.delete(key)),
        clear: vi.fn(() => entries.clear())
    };
}

function installStorage(storage) {
    vi.stubGlobal('localStorage', storage);
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: storage
    });
}

describe('legacy credential cleanup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bootstrapOrder.length = 0;
    });

    afterEach(() => {
        eventBus.clear();
        vi.unstubAllGlobals();
    });

    it('removes exactly the two legacy names without reading, rewriting, clearing, logging, or emitting them', () => {
        const storage = createStorage({
            ...UNRELATED_ENTRIES,
            whisper_api_key: 'fake-legacy-whisper-value',
            mai_transcribe_api_key: 'fake-legacy-speech-value'
        });
        installStorage(storage);
        const emitSpy = vi.spyOn(eventBus, 'emit');
        const consoleSpies = ['log', 'info', 'warn', 'error']
            .map(method => vi.spyOn(console, method).mockImplementation(() => {}));

        cleanupLegacyCredentials();

        expect(storage.removeItem.mock.calls).toEqual(LEGACY_NAMES.map(name => [name]));
        expect(storage.getItem).not.toHaveBeenCalled();
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(storage.clear).not.toHaveBeenCalled();
        expect(emitSpy).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
        expect(logger.debug).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.child).not.toHaveBeenCalled();
        consoleSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
        consoleSpies.forEach(spy => spy.mockRestore());
    });

    it('is safe to repeat and preserves every unrelated setting and transcript', () => {
        const storage = createStorage({
            ...UNRELATED_ENTRIES,
            whisper_api_key: 'fake-legacy-whisper-value',
            mai_transcribe_api_key: 'fake-legacy-speech-value'
        });
        installStorage(storage);

        cleanupLegacyCredentials();
        cleanupLegacyCredentials();

        expect(storage.removeItem.mock.calls).toEqual([
            ...LEGACY_NAMES.map(name => [name]),
            ...LEGACY_NAMES.map(name => [name])
        ]);
        expect(Object.fromEntries(storage.entries)).toEqual(UNRELATED_ENTRIES);
    });

    it('runs synchronously before Settings construction and the first bootstrap storage read', async () => {
        const storage = createStorage();
        storage.removeItem.mockImplementation(name => {
            bootstrapOrder.push(`remove:${name}`);
        });
        storage.getItem.mockImplementation(name => {
            bootstrapOrder.push(`read:${name}`);
            return null;
        });
        installStorage(storage);
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
        vi.resetModules();

        await import('../js/main.js');
        const bootstrap = addEventListenerSpy.mock.calls
            .findLast(([eventName]) => eventName === 'DOMContentLoaded')?.[1];
        expect(bootstrap).toBeTypeOf('function');

        await bootstrap();

        expect(bootstrapOrder.slice(0, 6)).toEqual([
            'remove:whisper_api_key',
            'remove:mai_transcribe_api_key',
            'authentication:construct',
            'authentication:initialize',
            'read:fake_msal_cache_entry',
            'settings:construct'
        ]);
        expect(bootstrapOrder.indexOf('settings:construct'))
            .toBeLessThan(bootstrapOrder.indexOf('read:transcription_model'));
        addEventListenerSpy.mockRestore();
    });
});
