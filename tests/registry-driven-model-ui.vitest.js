/**
 * @fileoverview Proof that the user-visible half of a model comes from its
 * adapter: registering one extra adapter must produce its select options, its
 * Connection row, its Selected Audio panels, and its selection-time size gate
 * without touching index.html, Settings, or the UI.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIO_SAFETY_STATES,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    AUTHENTICATION_STATES,
    ID,
    MAI_TRANSCRIBE_MAX_UPLOAD_BYTES,
    MODEL_TYPES,
    SELECTED_AUDIO_STATES
} from '../js/constants.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { logger } from '../js/logger.js';
import { modelAdapterRegistry } from '../js/model-adapters/index.js';
import { SelectedAudioController } from '../js/selected-audio-controller.js';
import { Settings, renderConnectionRows } from '../js/settings.js';
import { UI, renderSelectedAudioModelPanels } from '../js/ui.js';
import { convertToWav } from '../js/audio-converter.js';

vi.mock('../js/audio-converter.js', () => ({ convertToWav: vi.fn() }));

const FAKE_MODEL = 'fake-model';
const FAKE_MAX_UPLOAD_BYTES = 4_096;

/** A third adapter with UI metadata only — enough to prove the seam. */
const fakeModelAdapter = Object.freeze({
    id: FAKE_MODEL,
    label: 'Fake Transcribe',
    optionLabel: 'Fake Transcribe',
    uiOrder: 3,
    scope: 'https://scope.invalid/.default',
    storageKeys: Object.freeze({ uri: 'fakeModelTargetUri' }),
    maxUploadBytes: FAKE_MAX_UPLOAD_BYTES,
    uploadLimitLabel: 'up to 4 KB',
    uploadLimitVerdict: '4 KB maximum',
    uploadLimitAppliesTo: 'source',
    uri: Object.freeze({
        rowId: 'fakeUri',
        inputId: 'fake-uri',
        badgeId: 'fake-uri-badge',
        title: 'Fake Transcribe Target URI',
        subtitle: 'Your fake endpoint · HTTPS only',
        keywords: 'fake target uri endpoint https connection'
    })
});

function registryWithFakeAdapter() {
    return new Map([...modelAdapterRegistry, [fakeModelAdapter.id, fakeModelAdapter]]);
}

const indexSource = readFileSync('index.html', 'utf8');

function installProductionBody() {
    const body = indexSource.match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
    document.body.innerHTML = body.replace(/<script[^>]*src=[^>]*><\/script>/gu, '');
    document.getElementById = id => document.querySelector(`#${id}`);
}

function createFile({ name = 'deterministic.wav', type = 'audio/wav', size = 16 } = {}) {
    const file = new File(['deterministic-test-placeholder'], name, { type });
    Object.defineProperty(file, 'size', { configurable: true, value: size });
    return file;
}

function createController({ model, adapterRegistry }) {
    return new SelectedAudioController({
        settings: { getCurrentModel: vi.fn(() => model) },
        authenticationReadiness: {
            getState: vi.fn(() => AUTHENTICATION_STATES.READY),
            ensureTokenReady: vi.fn().mockResolvedValue(AUTHENTICATION_STATES.READY)
        },
        apiClient: {
            getScopeForModel: vi.fn(() => 'https://scope.invalid/.default'),
            transcribe: vi.fn()
        },
        recordingSafety: { getAudioSafetyState: vi.fn(() => AUDIO_SAFETY_STATES.SAFE) },
        durationReader: vi.fn().mockResolvedValue(12.5),
        adapterRegistry
    });
}

beforeEach(() => {
    eventBus.clear();
    localStorage.clear();
    vi.restoreAllMocks();
    installProductionBody();
});

afterEach(() => {
    eventBus.clear();
});

describe('A newly registered adapter renders itself', () => {
    it('adds its option to both model selects', () => {
        const settings = new Settings(registryWithFakeAdapter());

        for (const select of [settings.modelSelect, settings.settingsModelSelect]) {
            const options = Array.from(select.options).map(option => option.value);
            expect(options).toContain(FAKE_MODEL);
            expect(options).toEqual([
                MODEL_TYPES.WHISPER,
                MODEL_TYPES.MAI_TRANSCRIBE_1_5,
                FAKE_MODEL
            ]);
        }
        expect(
            Array.from(settings.settingsModelSelect.options)
                .find(option => option.value === FAKE_MODEL).textContent
        ).toBe('Fake Transcribe');
        settings.destroy();
    });

    it('generates a searchable Connection row whose badge tracks the typed URI', () => {
        const settings = new Settings(registryWithFakeAdapter());
        const row = document.querySelector('[data-settings-row="fakeUri"]');

        expect(row.dataset.category).toBe('connection');
        expect(row.dataset.keywords).toBe(fakeModelAdapter.uri.keywords);
        expect(row.querySelector('.settings-row-title').textContent)
            .toContain('Fake Transcribe Target URI');

        const input = document.getElementById('fake-uri');
        const badge = document.getElementById('fake-uri-badge');
        expect(input.type).toBe('url');

        input.value = 'http://fake.invalid/transcribe';
        input.dispatchEvent(new Event('input'));
        expect(badge.textContent).toBe('Must be HTTPS');
        expect(localStorage.getItem('fakeModelTargetUri')).toBeNull();

        input.value = 'https://fake.invalid/transcribe';
        input.dispatchEvent(new Event('input'));
        expect(badge.textContent).toBe('✓ Valid HTTPS');
        expect(localStorage.getItem('fakeModelTargetUri'))
            .toBe('https://fake.invalid/transcribe');
        settings.destroy();
    });

    it('generates its ready and tooLarge panels with the adapter copy and actions', () => {
        renderSelectedAudioModelPanels(
            document.getElementById(ID.SELECTED_AUDIO_WORKSPACE),
            registryWithFakeAdapter()
        );
        const workspace = document.getElementById(ID.SELECTED_AUDIO_WORKSPACE);

        const ready = workspace.querySelector(`[data-selected-state="ready-${FAKE_MODEL}"]`);
        expect(ready.querySelector('.selected-audio-verdict').textContent)
            .toBe('Ready for Fake Transcribe');
        expect(Array.from(ready.querySelectorAll('[data-selected-action]'))
            .map(button => button.dataset.selectedAction)).toEqual(['transcribe', 'remove']);

        const tooLarge = workspace.querySelector(`[data-selected-state="tooLarge-${FAKE_MODEL}"]`);
        expect(tooLarge.querySelector('.selected-audio-verdict').textContent)
            .toBe('This file is too large for Fake Transcribe (4 KB maximum).');
        expect(Array.from(tooLarge.querySelectorAll('[data-selected-action]'))
            .map(button => button.dataset.selectedAction)).toEqual(['choose', 'remove']);
        expect(ready.hidden).toBe(true);
        expect(tooLarge.hidden).toBe(true);
    });

    it('gates selection on its declared upload limit', async () => {
        const controller = createController({
            model: FAKE_MODEL,
            adapterRegistry: registryWithFakeAdapter()
        });

        await controller.select(createFile({ size: FAKE_MAX_UPLOAD_BYTES + 1 }));

        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.TOO_LARGE,
            model: FAKE_MODEL,
            errorCode: AUDIO_UPLOAD_LIMIT_ERROR_CODE
        });

        await controller.replace(createFile({ size: FAKE_MAX_UPLOAD_BYTES }));
        expect(controller.getSnapshot().state).toBe(SELECTED_AUDIO_STATES.READY);
        controller.destroy();
    });

    it('keeps the shipped models byte-identical in the generated markup', () => {
        renderSelectedAudioModelPanels(
            document.getElementById(ID.SELECTED_AUDIO_WORKSPACE),
            modelAdapterRegistry
        );
        renderConnectionRows(document.querySelector('.settings-rows'), modelAdapterRegistry);
        const verdict = state => document
            .querySelector(`[data-selected-state="${state}"] .selected-audio-verdict`)
            .textContent;

        expect(verdict('ready-whisper')).toBe('Ready for Azure Whisper');
        expect(verdict('ready-mai-transcribe-1.5')).toBe('Ready for Azure MAI-Transcribe 1.5');
        expect(verdict('tooLarge-whisper'))
            .toBe('This file is too large for Azure Whisper (25 MB maximum).');
        expect(verdict('tooLarge-mai-transcribe-1.5'))
            .toBe('This file is too large for Azure MAI-Transcribe 1.5 (under 300 MB after conversion).');
        expect(document.querySelectorAll('[data-settings-row="whisperUri"]')).toHaveLength(1);
        expect(document.querySelectorAll('[data-settings-row="maiUri"]')).toHaveLength(1);
    });
});

describe('Selection-time limits for the shipped models', () => {
    it('stops an oversized MAI file before any conversion work starts', async () => {
        const controller = createController({
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            adapterRegistry: modelAdapterRegistry
        });
        await controller.select(createFile({ size: MAI_TRANSCRIBE_MAX_UPLOAD_BYTES + 1 }));

        expect(controller.getSnapshot()).toMatchObject({
            state: SELECTED_AUDIO_STATES.TOO_LARGE,
            model: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
            errorCode: AUDIO_UPLOAD_LIMIT_ERROR_CODE
        });
        expect(convertToWav).not.toHaveBeenCalled();
        controller.destroy();
    });
});

describe('Unknown panel states never blank the workspace', () => {
    it('falls back to the failed panel and warns', () => {
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const ui = new UI({
            selectedAudioController: {
                getSnapshot: vi.fn(() => ({ state: SELECTED_AUDIO_STATES.IDLE })),
                canSelectAudio: vi.fn(() => true)
            }
        });
        ui.setupEventBusListeners();

        eventBus.emit(APP_EVENTS.SELECTED_AUDIO_STATE_CHANGED, {
            state: SELECTED_AUDIO_STATES.READY,
            name: 'deterministic.wav',
            size: 1_536,
            duration: 65,
            format: 'WAV',
            model: 'unregistered-model'
        });

        const failedPanel = document
            .querySelector(`[data-selected-state="${SELECTED_AUDIO_STATES.FAILED}"]`);
        expect(failedPanel.hidden).toBe(false);
        expect(document.querySelectorAll('[data-selected-state]:not([hidden])')).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('ready-unregistered-model')
        );
    });
});
