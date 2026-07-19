/**
 * @fileoverview Regression tests for Settings behavior moved into the User menu.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_EVENTS, eventBus } from '../js/event-bus.js';
import {
    ID,
    MODEL_TYPES,
    RECORDING_ENVIRONMENTS,
    STORAGE_KEYS
} from '../js/constants.js';
import { PermissionManager } from '../js/permission-manager.js';

function installSettingsMenuDom() {
    document.body.innerHTML = `
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

describe('Settings behavior owned by the User menu', () => {
    let Settings;
    let settings;

    beforeEach(async () => {
        vi.restoreAllMocks();
        localStorage.clear();
        installSettingsMenuDom();
        ({ Settings } = await import('../js/settings.js'));
        settings = new Settings();
    });

    it('opens Settings through the menu and preserves draft discard semantics', () => {
        const userMenu = {
            openDetail: vi.fn(),
            closeDetail: vi.fn()
        };
        settings.setUserMenu(userMenu);
        settings.modelSelect.value = MODEL_TYPES.WHISPER;

        settings.openSettingsModal();
        settings.settingsModelSelect.value = MODEL_TYPES.MAI_TRANSCRIBE_1_5;
        settings.discardSettingsDraft();

        expect(userMenu.openDetail).toHaveBeenCalledWith('settings', null);
        expect(settings.settingsModelSelect.value).toBe(MODEL_TYPES.WHISPER);
        expect(settings.getCurrentModel()).toBe(MODEL_TYPES.WHISPER);
    });

    it('shows both Target URI drafts in the Settings detail', () => {
        settings.updateSettingsVisibility();

        expect(settings.whisperSettings.hidden).toBe(false);
        expect(settings.maiTranscribeSettings.hidden).toBe(false);
    });

    it('persists theme selection and announces the semantic change', () => {
        const emit = vi.spyOn(eventBus, 'emit');
        const dark = document.querySelector('input[name="theme-mode"][value="dark"]');

        dark.checked = true;
        dark.dispatchEvent(new Event('change'));

        expect(localStorage.getItem(STORAGE_KEYS.THEME_MODE)).toBe('dark');
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.UI_THEME_CHANGED, { mode: 'dark' });
    });

    it('live-saves microphone/noise preferences without sidebar state', () => {
        const noise = document.getElementById(ID.NOISE_TOGGLE);
        const input = document.getElementById(ID.INPUT_DEVICE);
        const emit = vi.spyOn(eventBus, 'emit');

        noise.checked = true;
        noise.dispatchEvent(new Event('change'));
        input.value = '';
        input.dispatchEvent(new Event('change'));

        expect(localStorage.getItem(STORAGE_KEYS.RECORDING_ENVIRONMENT))
            .toBe(RECORDING_ENVIRONMENTS.NOISY);
        expect(emit).toHaveBeenCalledWith(APP_EVENTS.DEVICE_CHANGED, { deviceId: '' });
        expect(Object.values(STORAGE_KEYS)).not.toContain('sidebar_pinned');
    });

    it('lists enumerated microphones returned by PermissionManager', async () => {
        vi.spyOn(PermissionManager, 'getAvailableDevices').mockResolvedValue([
            { deviceId: 'default', label: 'Default microphone' },
            { deviceId: 'headset-mic', label: 'Headset microphone' }
        ]);

        await settings.populateDeviceList();

        const options = [...document.getElementById(ID.INPUT_DEVICE).options]
            .map(({ value, textContent }) => ({ value, textContent }));
        expect(options).toEqual([
            { value: '', textContent: 'System Default' },
            { value: 'headset-mic', textContent: 'Headset microphone' }
        ]);
    });
});
