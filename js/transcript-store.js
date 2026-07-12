/**
 * @fileoverview Thin storage gateway for the single-slot transcript record.
 *
 * The transcript text is the most valuable thing the app produces, so it must
 * never be lost to a reload, crash, or a mistimed Grab. This store keeps exactly
 * ONE slot — the last meaningful transcript — and exposes a
 * deliberately small interface (save/load/clear/has). localStorage backs it
 * today; the interface is the seam that lets a future backend (e.g. Cosmos DB)
 * swap in without touching any UI code.
 */

import { STORAGE_KEYS } from './constants.js';
import { logger } from './logger.js';

/**
 * Single-slot persistence for the current transcript.
 *
 * @class TranscriptStore
 */
export class TranscriptStore {
    /**
     * @param {Storage|null} [storage] - Storage backend. Defaults to localStorage
     *   when available; pass null explicitly to disable persistence (tests/SSR).
     * @param {string} [key] - Storage key for the single slot.
     */
    constructor(
        storage = (typeof localStorage !== 'undefined' ? localStorage : null),
        key = STORAGE_KEYS.TRANSCRIPT_RECORD
    ) {
        this.storage = storage;
        this.key = key;
    }

    /**
     * Persist the given text as the single recovery slot. Saving empty text
     * clears the slot (there is nothing to recover).
     *
     * @param {string} text
     * @returns {boolean} True when the transcript was persisted or cleared.
     */
    save(text) {
        if (!this.storage) return false;
        const value = typeof text === 'string' ? text : '';
        if (!value) {
            return this.clear();
        }
        try {
            this.storage.setItem(this.key, JSON.stringify({ text: value, savedAt: Date.now() }));
            return true;
        } catch (error) {
            logger.child('TranscriptStore').debug('Failed to persist transcript:', error);
            return false;
        }
    }

    /**
     * Read the recovery slot. Repeatable / non-consuming — loading never clears.
     *
     * @returns {{text: string, savedAt: number}|null}
     */
    load() {
        if (!this.storage) return null;
        try {
            const raw = this.storage.getItem(this.key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.text === 'string' && parsed.text) {
                return parsed;
            }
            return null;
        } catch (error) {
            logger.child('TranscriptStore').debug('Failed to read transcript record:', error);
            return null;
        }
    }

    /**
     * Remove the recovery slot.
     *
     * @returns {boolean} True when the recovery slot was removed.
     */
    clear() {
        if (!this.storage) return false;
        try {
            this.storage.removeItem(this.key);
            return true;
        } catch {
            /* storage unavailable — nothing to clear */
            return false;
        }
    }

    /**
     * @returns {boolean} True when a non-empty transcript is recoverable.
     */
    has() {
        return this.load() !== null;
    }
}
