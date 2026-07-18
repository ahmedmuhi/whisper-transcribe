/**
 * @fileoverview Accepted Variant B Selected Audio UI behavior.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    API_ERROR_CODES,
    AUTH_PRESENTATION_STATES,
    MODEL_TYPES,
    RECORDING_STATES,
    SELECTED_AUDIO_STATES
} from '../js/constants.js';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import { UI } from '../js/ui.js';

const indexSource = readFileSync('index.html', 'utf8');

function installProductionBody() {
    const body = indexSource.match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
    document.body.innerHTML = body.replace(/<script[^>]*src=[^>]*><\/script>/gu, '');
    document.getElementById = id => document.querySelector(`#${id}`);
}

function readySnapshot(overrides = {}) {
    return {
        state: SELECTED_AUDIO_STATES.READY,
        name: 'deterministic.wav',
        size: 1_536,
        duration: 65,
        format: 'WAV',
        model: MODEL_TYPES.WHISPER,
        modelLabel: 'Azure Whisper',
        errorCode: null,
        errorMessage: '',
        ...overrides
    };
}

function createHarness({ canSelect = true } = {}) {
    installProductionBody();
    const selectedAudioController = {
        select: vi.fn().mockResolvedValue(true),
        replace: vi.fn().mockResolvedValue(true),
        remove: vi.fn(() => true),
        transcribe: vi.fn().mockResolvedValue(true),
        getSnapshot: vi.fn(() => ({ state: SELECTED_AUDIO_STATES.IDLE }))
    };
    const audioSourceCoordinator = {
        canSelectAudio: vi.fn(() => canSelect)
    };
    const ui = new UI({
        authenticationState: AUTH_PRESENTATION_STATES.READY,
        selectedAudioController,
        audioSourceCoordinator
    });
    ui.settings = {
        getModelConfig: vi.fn(() => ({
            model: MODEL_TYPES.WHISPER,
            uri: 'https://target.invalid/transcribe'
        })),
        openSettingsModal: vi.fn()
    };
    ui.setupEventListeners();
    ui.setupEventBusListeners();
    ui._setReady(true);

    return { ui, selectedAudioController, audioSourceCoordinator };
}

function emitSnapshot(snapshot) {
    eventBus.emit(APP_EVENTS.SELECTED_AUDIO_STATE_CHANGED, snapshot);
}

function fileDragEvent(type, files) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
        value: {
            files,
            items: files.map(file => ({ kind: 'file', type: file.type })),
            dropEffect: 'none'
        }
    });
    return event;
}

describe('Selected Audio production markup and idle controls', () => {
    beforeEach(() => {
        eventBus.clear();
        vi.clearAllMocks();
    });

    it('uses accepted two-line idle copy without a permanent decorative upload icon', () => {
        const { ui } = createHarness();

        expect(document.querySelector('.transcript-empty-title').textContent)
            .toBe('Record or upload audio');
        expect(document.querySelector('.transcript-empty-hint').textContent)
            .toBe('Drop an audio file here');
        expect(document.querySelector('.transcript-empty-mark')).toBeNull();
        expect(ui.uploadAction.hidden).toBe(false);
        expect(ui.primaryAction.hidden).toBe(false);
    });

    it('opens one native non-multiple picker from Upload audio', () => {
        const { ui } = createHarness();
        const pickerSpy = vi.spyOn(ui.audioFileInput, 'click');

        ui.uploadAction.click();

        expect(pickerSpy).toHaveBeenCalledOnce();
        expect(ui.audioFileInput.multiple).toBe(false);
        expect(ui.audioFileInput.accept).toContain('audio/');
    });

    it('hides Upload as soon as the recording lifecycle is active', () => {
        const { ui } = createHarness();

        ui.renderControls(RECORDING_STATES.RECORDING);

        expect(ui.uploadAction.hidden).toBe(true);
    });
});

describe('Selected Audio picker and transient drag/drop', () => {
    beforeEach(() => {
        eventBus.clear();
        vi.clearAllMocks();
    });

    it('selects one picker File without automatically transcribing it', async () => {
        const { ui, selectedAudioController } = createHarness();
        const file = new File(['deterministic-placeholder'], 'choice.wav', { type: 'audio/wav' });
        Object.defineProperty(ui.audioFileInput, 'files', { configurable: true, value: [file] });

        ui.audioFileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();

        expect(selectedAudioController.select).toHaveBeenCalledWith(file);
        expect(selectedAudioController.transcribe).not.toHaveBeenCalled();
        expect(ui.audioFileInput.value).toBe('');
    });

    it('highlights only an eligible single-file drag and restores immediately on leave', () => {
        const { ui } = createHarness();
        const file = new File(['deterministic-placeholder'], 'drop.wav', { type: 'audio/wav' });

        document.dispatchEvent(fileDragEvent('dragover', [file]));
        expect(ui.transcriptBody.classList.contains('selected-audio-dragging')).toBe(true);
        expect(ui.transcriptEmptyTitle.textContent).toBe('Drop an audio file here');

        document.dispatchEvent(fileDragEvent('dragleave', [file]));
        expect(ui.transcriptBody.classList.contains('selected-audio-dragging')).toBe(false);
        expect(ui.transcriptEmptyTitle.textContent).toBe('Record or upload audio');
    });

    it('prevents drop navigation and selects without an automatic Azure action', async () => {
        const { selectedAudioController } = createHarness();
        const file = new File(['deterministic-placeholder'], 'drop.wav', { type: 'audio/wav' });
        const drop = fileDragEvent('drop', [file]);

        document.dispatchEvent(drop);
        await Promise.resolve();

        expect(drop.defaultPrevented).toBe(true);
        expect(selectedAudioController.select).toHaveBeenCalledWith(file);
        expect(selectedAudioController.transcribe).not.toHaveBeenCalled();
    });

    it.each([
        ['two files', 2, true],
        ['unavailable source coordination', 1, false]
    ])('rejects %s and restores the ordinary transcript', async (_caseName, count, canSelect) => {
        const { ui, selectedAudioController } = createHarness({ canSelect });
        const files = Array.from({ length: count }, (_, index) => (
            new File(['deterministic-placeholder'], `drop-${index}.wav`, { type: 'audio/wav' })
        ));

        document.dispatchEvent(fileDragEvent('dragover', files));
        document.dispatchEvent(fileDragEvent('drop', files));
        await Promise.resolve();

        expect(selectedAudioController.select).not.toHaveBeenCalled();
        expect(ui.transcriptBody.classList.contains('selected-audio-dragging')).toBe(false);
        expect(ui.transcriptEmptyTitle.textContent).toBe('Record or upload audio');
    });

    it('Escape and picker cancel restore transient drag presentation', () => {
        const { ui } = createHarness();
        const file = new File(['deterministic-placeholder'], 'drop.wav', { type: 'audio/wav' });
        document.dispatchEvent(fileDragEvent('dragover', [file]));

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(ui.transcriptBody.classList.contains('selected-audio-dragging')).toBe(false);

        document.dispatchEvent(fileDragEvent('dragover', [file]));
        ui.audioFileInput.dispatchEvent(new Event('cancel'));
        expect(ui.transcriptBody.classList.contains('selected-audio-dragging')).toBe(false);
    });
});

describe('Selected Audio Variant B review states', () => {
    beforeEach(() => {
        eventBus.clear();
        vi.clearAllMocks();
    });

    it('renders checking locally and says nothing was sent to Azure', () => {
        const { ui } = createHarness();

        emitSnapshot(readySnapshot({ state: SELECTED_AUDIO_STATES.CHECKING }));

        expect(ui.selectedAudioWorkspace.hidden).toBe(false);
        expect(ui.selectedAudioWorkspace.textContent).toContain('Checking format and file size…');
        expect(ui.selectedAudioWorkspace.textContent).toContain('Nothing has been sent to Azure.');
        expect(ui.controlCluster.hidden).toBe(true);
    });

    it('shows safe metadata once, names the model only in the verdict, and focuses Transcribe', () => {
        const { ui } = createHarness();

        emitSnapshot(readySnapshot({ name: '<img src=x onerror=alert(1)>.wav' }));

        expect(ui.selectedAudioName.textContent).toBe('<img src=x onerror=alert(1)>.wav');
        expect(ui.selectedAudioWorkspace.querySelector('img')).toBeNull();
        expect(ui.selectedAudioMetadata.textContent).toBe('1:05 · 1.5 KB · WAV');
        expect(ui.selectedAudioWorkspace.textContent.match(/Azure Whisper/gu)).toHaveLength(1);
        expect(ui.selectedAudioVerdict.textContent).toBe('Ready for Azure Whisper');
        expect(ui.selectedAudioPrimary.textContent.trim()).toBe('Transcribe');
        expect(ui.selectedAudioRemove.textContent.trim()).toBe('Remove');
        expect(document.activeElement).toBe(ui.selectedAudioPrimary);
    });

    it('shows Duration unavailable honestly when metadata cannot be read', () => {
        const { ui } = createHarness();

        emitSnapshot(readySnapshot({ duration: null }));

        expect(ui.selectedAudioMetadata.textContent).toContain('Duration unavailable');
    });

    it.each([
        [SELECTED_AUDIO_STATES.UNSUPPORTED, 'Unsupported audio file', 'Choose another'],
        [SELECTED_AUDIO_STATES.TOO_LARGE, 'too large for Azure Whisper', 'Choose another'],
        [SELECTED_AUDIO_STATES.FAILED, 'Azure request failed', 'Retry']
    ])('renders canonical %s recovery actions', (state, expectedCopy, expectedPrimary) => {
        const { ui } = createHarness();

        emitSnapshot(readySnapshot({
            state,
            size: 26 * 1024 * 1024,
            errorMessage: state === SELECTED_AUDIO_STATES.FAILED ? 'Azure request failed' : ''
        }));

        expect(ui.selectedAudioVerdict.textContent).toContain(expectedCopy);
        expect(ui.selectedAudioPrimary.textContent.trim()).toBe(expectedPrimary);
        expect(ui.selectedAudioRemove.textContent.trim()).toBe('Remove');
    });

    it('renders honest indeterminate transcription with no percentage or source controls', () => {
        const { ui } = createHarness();

        emitSnapshot(readySnapshot({ state: SELECTED_AUDIO_STATES.TRANSCRIBING }));

        expect(ui.selectedAudioWorkspace.textContent).toContain('Sending and transcribing…');
        expect(ui.selectedAudioWorkspace.textContent).not.toMatch(/\d+%/u);
        expect(ui.selectedAudioPrimary.hidden).toBe(true);
        expect(ui.selectedAudioRemove.hidden).toBe(true);
        expect(ui.controlCluster.hidden).toBe(true);
    });

    it('uses explicit Transcribe/Retry and replacement/removal actions', async () => {
        const { ui, selectedAudioController } = createHarness();
        emitSnapshot(readySnapshot());

        ui.selectedAudioPrimary.click();
        await Promise.resolve();
        expect(selectedAudioController.transcribe).toHaveBeenCalledOnce();

        emitSnapshot(readySnapshot({ state: SELECTED_AUDIO_STATES.UNSUPPORTED }));
        const pickerSpy = vi.spyOn(ui.audioFileInput, 'click');
        ui.selectedAudioPrimary.click();
        expect(pickerSpy).toHaveBeenCalledOnce();

        ui.selectedAudioRemove.click();
        expect(selectedAudioController.remove).toHaveBeenCalledOnce();
    });

    it('does not offer Retry silently for an interaction-required failure', () => {
        const { ui } = createHarness();

        emitSnapshot(readySnapshot({
            state: SELECTED_AUDIO_STATES.FAILED,
            errorCode: API_ERROR_CODES.AUTHENTICATION_REQUIRED,
            errorMessage: 'Authentication is required.'
        }));

        expect(ui.selectedAudioPrimary.hidden).toBe(true);
        expect(ui.selectedAudioRemove.hidden).toBe(false);
        expect(ui.selectedAudioWorkspace.textContent).not.toContain('Retry silently');
    });
});
