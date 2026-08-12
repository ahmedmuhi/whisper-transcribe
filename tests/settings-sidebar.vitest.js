/**
 * @fileoverview Settings modal sidebar behavior: category navigation, search
 * filtering, category chips, the no-results empty state, and verbatim gating.
 * The sidebar is owned by SettingsSurface; preference persistence is not.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ID, MODEL_TYPES } from '../js/constants.js';
import { eventBus } from '../js/event-bus.js';
import { SettingsSurface } from '../js/settings-surface.js';
import { renderConnectionRows } from '../js/settings.js';

const indexSource = readFileSync('index.html', 'utf8');

function installProductionBody() {
    const body = indexSource.match(/<body>([\s\S]*)<\/body>/u)?.[1] || '';
    document.body.innerHTML = body.replace(/<script[^>]*src=[^>]*><\/script>/gu, '');
    // Connection rows are generated from the adapter registry in production;
    // this surface harness stubs Settings, so it renders them the same way.
    renderConnectionRows();
    document.getElementById = (id) => document.querySelector(`#${id}`);
}

function visibleRows() {
    return [...document.querySelectorAll('[data-settings-row]')]
        .filter((row) => !row.hidden)
        .map((row) => row.dataset.settingsRow);
}

function categoryButton(category) {
    return document.querySelector(`[data-settings-category="${category}"]`);
}

/** Rows that are on screen and are showing their category chip. */
function rowsShowingChips() {
    return [...document.querySelectorAll('[data-settings-row]')]
        .filter((row) => !row.hidden && !row.querySelector('.settings-row-chip')?.hidden)
        .map((row) => row.dataset.settingsRow);
}

function search(query) {
    const input = document.getElementById(ID.SETTINGS_SEARCH);
    input.value = query;
    input.dispatchEvent(new Event('input'));
}

describe('Settings modal sidebar', () => {
    let surface;
    let currentModel;

    beforeEach(() => {
        eventBus.clear();
        eventBus.setHistoryEnabled(false);
        vi.restoreAllMocks();
        installProductionBody();
        currentModel = MODEL_TYPES.WHISPER;
        surface = new SettingsSurface({
            authenticationService: { getState: () => 'uninitialized' },
            authInteractionController: { logOut: vi.fn() },
            settings: {
                getCurrentModel: () => currentModel,
                populateDeviceList: vi.fn().mockResolvedValue(undefined)
            }
        });
        surface.init();
    });

    afterEach(() => {
        surface.destroy();
    });

    it('starts on the Model category with only its rows and no chips', () => {
        expect(visibleRows()).toEqual(['model']);
        expect(document.getElementById(ID.SETTINGS_HEADING).textContent).toBe('Model');
        expect(rowsShowingChips()).toEqual([]);
        expect(document.getElementById(ID.SETTINGS_NO_RESULTS).hidden).toBe(true);
        expect(categoryButton('model').getAttribute('aria-current')).toBe('true');
    });

    it.each([
        ['microphone', 'Microphone', ['device', 'noise']],
        ['appearance', 'Appearance', ['theme']],
        ['connection', 'Connection', ['whisperUri', 'maiUri', 'gptTranscribeUri']]
    ])('shows only %s rows when that category is selected', (category, heading, rows) => {
        categoryButton(category).click();

        expect(visibleRows()).toEqual(rows);
        expect(document.getElementById(ID.SETTINGS_HEADING).textContent).toBe(heading);
        expect(rowsShowingChips()).toEqual([]);
    });

    it('marks exactly one category button active', () => {
        categoryButton('connection').click();

        const active = [...document.querySelectorAll('[data-settings-category]')]
            .filter((button) => button.classList.contains('is-active'))
            .map((button) => button.dataset.settingsCategory);
        expect(active).toEqual(['connection']);
        expect(categoryButton('model').hasAttribute('aria-current')).toBe(false);
        expect(categoryButton('connection').getAttribute('aria-current')).toBe('true');
    });

    it('searches keywords across every category and shows category chips', () => {
        categoryButton('appearance').click();
        search('MICROPHONE');

        expect(visibleRows()).toEqual(['device']);
        expect(document.getElementById(ID.SETTINGS_HEADING).textContent)
            .toBe('Results for "MICROPHONE"');
        expect(document.getElementById(ID.SETTINGS_NO_RESULTS).hidden).toBe(true);

        const chip = document.querySelector('[data-settings-row="device"] .settings-row-chip');
        expect(chip.hidden).toBe(false);
        expect(chip.textContent).toBe('Microphone');
        expect(rowsShowingChips()).toEqual(['device']);
    });

    it('matches multiple rows across categories on a shared keyword', () => {
        search('azure');

        const rows = visibleRows();
        expect(rows).toContain('model');
        expect(rows).toContain('whisperUri');
        expect(rowsShowingChips()).toEqual(rows);
    });

    it('reports the empty state when nothing matches and clears it on reset', () => {
        search('parachute');

        const noResults = document.getElementById(ID.SETTINGS_NO_RESULTS);
        expect(visibleRows()).toEqual([]);
        expect(noResults.hidden).toBe(false);
        expect(noResults.textContent).toBe('No settings match "parachute"');

        search('');

        expect(noResults.hidden).toBe(true);
        expect(noResults.textContent).toBe('');
        expect(visibleRows()).toEqual(['model']);
        expect(document.getElementById(ID.SETTINGS_HEADING).textContent).toBe('Model');
        expect(rowsShowingChips()).toEqual([]);
    });

    it('treats a whitespace-only query as no search', () => {
        search('   ');

        expect(visibleRows()).toEqual(['model']);
        expect(document.getElementById(ID.SETTINGS_HEADING).textContent).toBe('Model');
        expect(document.getElementById(ID.SETTINGS_NO_RESULTS).hidden).toBe(true);
        expect(rowsShowingChips()).toEqual([]);
    });

    it('hides the verbatim row while Whisper is the active model', () => {
        expect(document.getElementById(ID.VERBATIM_SETTING).hidden).toBe(true);

        search('verbatim');

        expect(visibleRows()).toEqual([]);
        expect(document.getElementById(ID.SETTINGS_NO_RESULTS).hidden).toBe(false);
    });

    it('shows the verbatim row for MAI-Transcribe 1.5 in the Model category and in search', () => {
        currentModel = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        surface.refreshRows();

        expect(visibleRows()).toEqual(['model', 'verbatim']);

        search('filler words');

        expect(visibleRows()).toEqual(['verbatim']);
        expect(document.getElementById(ID.SETTINGS_NO_RESULTS).hidden).toBe(true);
        expect(
            document.querySelector('[data-settings-row="verbatim"] .settings-row-chip').hidden
        ).toBe(false);
    });

    it('re-hides the verbatim row when the model switches back to Whisper', () => {
        currentModel = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        surface.refreshRows();
        expect(visibleRows()).toContain('verbatim');

        currentModel = MODEL_TYPES.WHISPER;
        surface.refreshRows();

        expect(visibleRows()).toEqual(['model']);
        expect(document.getElementById(ID.VERBATIM_SETTING).hidden).toBe(true);
    });

    it('resets the search field and honours the requested category when the modal opens', () => {
        search('azure');

        surface.openModal({ category: 'connection' });

        expect(document.getElementById(ID.SETTINGS_SEARCH).value).toBe('');
        expect(visibleRows()).toEqual(['whisperUri', 'maiUri', 'gptTranscribeUri']);
        expect(document.getElementById(ID.SETTINGS_HEADING).textContent).toBe('Connection');
        expect(surface.settings.populateDeviceList).toHaveBeenCalled();
    });
});
