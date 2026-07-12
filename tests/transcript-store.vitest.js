import { describe, it, expect, vi } from 'vitest';
import { TranscriptStore } from '../js/transcript-store.js';

/** Minimal in-memory Storage stand-in so each test is fully isolated. */
function makeStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; },
        _data: data
    };
}

describe('TranscriptStore', () => {
    it('saves and loads a transcript round-trip', () => {
        const store = new TranscriptStore(makeStorage(), 'k');
        expect(store.save('hello world')).toBe(true);
        expect(store.load().text).toBe('hello world');
        expect(store.has()).toBe(true);
    });

    it('treats an empty string as a clear (nothing to recover)', () => {
        const store = new TranscriptStore(makeStorage(), 'k');
        store.save('something');
        expect(store.save('')).toBe(true);
        expect(store.load()).toBeNull();
        expect(store.has()).toBe(false);
    });

    it('clear() removes the slot', () => {
        const store = new TranscriptStore(makeStorage(), 'k');
        store.save('x');
        expect(store.clear()).toBe(true);
        expect(store.has()).toBe(false);
    });

    it('returns null on corrupt JSON instead of throwing', () => {
        const store = new TranscriptStore(makeStorage({ k: 'not-json{' }), 'k');
        expect(store.load()).toBeNull();
        expect(store.has()).toBe(false);
    });

    it('is non-consuming: load can be called repeatedly (survives Cut → Restore → Cut)', () => {
        const store = new TranscriptStore(makeStorage(), 'k');
        store.save('keep me');
        expect(store.load().text).toBe('keep me');
        expect(store.load().text).toBe('keep me');
        expect(store.has()).toBe(true);
    });

    it('stamps savedAt so the slot carries a timestamp', () => {
        const store = new TranscriptStore(makeStorage(), 'k');
        store.save('timestamped');
        expect(typeof store.load().savedAt).toBe('number');
    });

    it('degrades gracefully with no storage backend (explicit null)', () => {
        const store = new TranscriptStore(null, 'k');
        expect(store.save('x')).toBe(false);
        expect(store.clear()).toBe(false);
        expect(store.load()).toBeNull();
        expect(store.has()).toBe(false);
    });

    it('degrades gracefully when storage rejects a write', () => {
        const setItem = vi.fn(() => { throw new Error('quota exceeded'); });
        const store = new TranscriptStore({ setItem }, 'transcript-key');

        expect(store.save('valuable transcript')).toBe(false);

        expect(setItem).toHaveBeenCalledTimes(1);
        expect(setItem).toHaveBeenCalledWith('transcript-key', expect.any(String));
        expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({
            text: 'valuable transcript',
            savedAt: expect.any(Number)
        });
    });

    it('degrades gracefully when storage rejects a clear', () => {
        const removeItem = vi.fn(() => { throw new Error('storage unavailable'); });
        const store = new TranscriptStore({ removeItem }, 'transcript-key');

        expect(store.clear()).toBe(false);
        expect(removeItem).toHaveBeenCalledWith('transcript-key');
    });
});
