/**
 * @fileoverview One-time New notice for an adapter that opts in with
 * announceAsNew: the gear pill, the Model row pills, the option suffix, and the
 * per-model acknowledgement recorded the first time either surface opens.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUTHENTICATION_STATES,
    ID,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS
} from '../js/constants.js';
import { modelAdapterRegistry } from '../js/model-adapters/index.js';
import { Settings } from '../js/settings.js';
import { SettingsSurface } from '../js/settings-surface.js';

const indexSource = readFileSync('index.html', 'utf8');

function installProductionBody() {
    const body = indexSource.match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
    document.body.innerHTML = body.replace(/<script[^>]*src=[^>]*><\/script>/gu, '');
    document.getElementById = id => document.querySelector(`#${id}`);
}

const SECOND_NEW_MODEL = 'second-new-model';

/** A second announced adapter with UI metadata only. */
const secondNewAdapter = Object.freeze({
    id: SECOND_NEW_MODEL,
    label: 'Second New Transcribe',
    optionLabel: 'Second New Transcribe',
    uiOrder: 5,
    announceAsNew: true,
    scope: 'https://scope.invalid/.default',
    storageKeys: Object.freeze({ uri: 'secondNewModelTargetUri' }),
    uri: Object.freeze({
        rowId: 'secondNewUri',
        inputId: 'second-new-uri',
        badgeId: 'second-new-uri-badge',
        title: 'Second New Transcribe Target URI',
        subtitle: 'Your placeholder endpoint · HTTPS only',
        keywords: 'second new target uri endpoint https connection'
    })
});

const live = [];

function mountApp(registry = modelAdapterRegistry) {
    const settings = new Settings(registry);
    const surface = new SettingsSurface({
        authenticationService: { getState: vi.fn(() => AUTHENTICATION_STATES.READY) },
        authInteractionController: { logOut: vi.fn() },
        settings
    });
    settings.setSurface(surface);
    surface.init();
    live.push(settings, surface);
    return { settings, surface };
}

const el = id => document.getElementById(id);
const gear = () => el(ID.QUICK_SETTINGS_BUTTON);
const gearPill = () => el(ID.QUICK_SETTINGS_NEW_PILL);
const rowPills = () => [el(ID.QUICK_MODEL_NEW_PILL), el(ID.SETTINGS_MODEL_NEW_PILL)];
const storedAcknowledgement = () => localStorage.getItem(STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS);

function optionText(selectId, value) {
    return el(selectId).querySelector(`option[value="${value}"]`).textContent;
}

function expectNoticeFor(modelId, label) {
    expect(gearPill().hidden).toBe(false);
    expect(gear().getAttribute('aria-label')).toBe(MESSAGES.QUICK_SETTINGS_NEW_MODEL_LABEL);
    rowPills().forEach(pill => expect(pill.hidden).toBe(false));
    [ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT].forEach((selectId) => {
        expect(optionText(selectId, modelId)).toBe(`${label}${MESSAGES.NEW_MODEL_OPTION_SUFFIX}`);
    });
}

function expectInSurfaceNoticeKept() {
    rowPills().forEach(pill => expect(pill.hidden).toBe(false));
    [ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT].forEach((selectId) => {
        expect(optionText(selectId, MODEL_TYPES.MAI_TRANSCRIBE_2))
            .toBe(`MAI-Transcribe 2${MESSAGES.NEW_MODEL_OPTION_SUFFIX}`);
    });
}

function expectGearAcknowledged() {
    expect(gearPill().hidden).toBe(true);
    expect(gear().getAttribute('aria-label')).toBe(MESSAGES.QUICK_SETTINGS_LABEL);
}

describe('one-time New notice for a newly added model', () => {
    beforeEach(() => {
        localStorage.clear();
        installProductionBody();
    });

    afterEach(() => {
        while (live.length) live.pop().destroy?.();
        localStorage.clear();
    });

    it('announces only the adapter that opts in', () => {
        const announced = [...modelAdapterRegistry.values()]
            .filter(adapter => adapter.announceAsNew)
            .map(adapter => adapter.id);
        expect(announced).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_2]);
        expect(Object.hasOwn(modelAdapterRegistry.get(MODEL_TYPES.MAI_TRANSCRIBE_1_5), 'announceAsNew'))
            .toBe(false);
    });

    it('shows every marker on a first load with empty storage', () => {
        mountApp();

        expectNoticeFor(MODEL_TYPES.MAI_TRANSCRIBE_2, 'MAI-Transcribe 2');
        expect(optionText(ID.MODEL_SELECT, MODEL_TYPES.MAI_TRANSCRIBE_1_5)).toBe('MAI-Transcribe 1.5');
        expect(optionText(ID.MODEL_SELECT, MODEL_TYPES.WHISPER)).toBe('Azure Whisper');
        expect(optionText(ID.SETTINGS_MODEL_SELECT, MODEL_TYPES.GPT_TRANSCRIBE)).toBe('Azure GPT Transcribe');
    });

    it('acknowledges on opening the popover and keeps the in-surface markers for this load', () => {
        const { surface } = mountApp();

        surface.openPopover();

        expect(JSON.parse(storedAcknowledgement())).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_2]);
        expectGearAcknowledged();
        expectInSurfaceNoticeKept();
    });

    it('acknowledges on opening the modal without the popover first', () => {
        const { surface } = mountApp();

        surface.openModal();

        expect(JSON.parse(storedAcknowledgement())).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_2]);
        expectGearAcknowledged();
        expectInSurfaceNoticeKept();
    });

    it('shows nothing on a later load once acknowledged', () => {
        const first = mountApp();
        first.surface.openPopover();
        while (live.length) live.pop().destroy?.();
        installProductionBody();

        mountApp();

        expectGearAcknowledged();
        rowPills().forEach(pill => expect(pill.hidden).toBe(true));
        [ID.MODEL_SELECT, ID.SETTINGS_MODEL_SELECT].forEach((selectId) => {
            expect(optionText(selectId, MODEL_TYPES.MAI_TRANSCRIBE_2)).toBe('MAI-Transcribe 2');
        });
    });

    it.each(['not json', '{}'])('treats a corrupt stored value %j as nothing acknowledged', (raw) => {
        localStorage.setItem(STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS, raw);

        const { surface } = mountApp();
        expectNoticeFor(MODEL_TYPES.MAI_TRANSCRIBE_2, 'MAI-Transcribe 2');

        surface.openPopover();
        expect(JSON.parse(storedAcknowledgement())).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_2]);
        expectGearAcknowledged();
    });

    it('announces a later model even when MAI-Transcribe 2 is already acknowledged', () => {
        localStorage.setItem(
            STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS,
            JSON.stringify([MODEL_TYPES.MAI_TRANSCRIBE_2])
        );
        const registry = new Map([...modelAdapterRegistry, [secondNewAdapter.id, secondNewAdapter]]);

        const { settings, surface } = mountApp(registry);

        expect(settings.getUnacknowledgedNewModels()).toEqual([SECOND_NEW_MODEL]);
        expectNoticeFor(SECOND_NEW_MODEL, 'Second New Transcribe');
        expect(optionText(ID.MODEL_SELECT, MODEL_TYPES.MAI_TRANSCRIBE_2)).toBe('MAI-Transcribe 2');

        surface.openModal();
        expect(JSON.parse(storedAcknowledgement()))
            .toEqual([MODEL_TYPES.MAI_TRANSCRIBE_2, SECOND_NEW_MODEL]);
        expectGearAcknowledged();
    });

    it('hides the gear pill when another tab acknowledges', () => {
        mountApp();
        expect(gearPill().hidden).toBe(false);

        localStorage.setItem(
            STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS,
            JSON.stringify([MODEL_TYPES.MAI_TRANSCRIBE_2])
        );
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.ACKNOWLEDGED_NEW_MODELS }));

        expectGearAcknowledged();
    });

    it('is idempotent and never stores duplicates', () => {
        const { settings } = mountApp();

        expect(settings.acknowledgeNewModels()).toBe(true);
        expect(settings.acknowledgeNewModels()).toBe(false);

        expect(JSON.parse(storedAcknowledgement())).toEqual([MODEL_TYPES.MAI_TRANSCRIBE_2]);
    });

    it('does not throw when the acknowledgement cannot be stored', () => {
        const { surface } = mountApp();
        const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        try {
            expect(() => surface.openPopover()).not.toThrow();
            expect(gearPill().hidden).toBe(false);
        } finally {
            setItem.mockRestore();
        }
    });
});
