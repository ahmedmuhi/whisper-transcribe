/**
 * @fileoverview Focused tests for transcription model response parsers.
 */

import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../js/constants.js';
import {
    parseMaiTranscribeResponse,
    parseMaiTranscribeWords,
    parseWhisperResponse
} from '../js/model-adapters/response-parsers.js';

describe('response parsers', () => {
    it('accepts an empty Whisper JSON text string', () => {
        expect(parseWhisperResponse({ text: '' })).toBe('');
    });

    it('accepts an empty MAI JSON text string', () => {
        expect(parseMaiTranscribeResponse({ text: '' })).toBe('');
    });

    it('uses an empty MAI text fallback when combinedPhrases is empty', () => {
        expect(parseMaiTranscribeResponse({ combinedPhrases: [], text: '' })).toBe('');
    });

    it.each([
        ['Whisper', parseWhisperResponse, {}],
        ['Whisper', parseWhisperResponse, { text: null }],
        ['MAI', parseMaiTranscribeResponse, {}],
        ['MAI', parseMaiTranscribeResponse, { text: null }]
    ])('rejects an unknown %s response shape', (_name, parser, response) => {
        expect(() => parser(response)).toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
    });

    it('rejects a bare empty MAI combinedPhrases array', () => {
        expect(() => parseMaiTranscribeResponse({ combinedPhrases: [] }))
            .toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
    });

    it.each([
        ['empty combined phrases', { combinedPhrases: [], phrases: [] }],
        ['no combined phrases', { phrases: [] }]
    ])('returns no words for a silent piece with %s', (_name, response) => {
        expect(parseMaiTranscribeWords(response)).toEqual([]);
    });

    it.each([
        ['no phrases list', { combinedPhrases: [{ text: 'Tin kettle.' }] }],
        ['a phrase without words', { phrases: [{ text: 'Tin kettle.' }] }],
        ['a word without an offset', { phrases: [{ words: [{ text: 'Tin', durationMilliseconds: 200 }] }] }],
        ['a word without a duration', { phrases: [{ words: [{ text: 'Tin', offsetMilliseconds: 0 }] }] }],
        ['a word without text', { phrases: [{ words: [{ offsetMilliseconds: 0, durationMilliseconds: 200 }] }] }],
        ['a plain string', 'Tin kettle.'],
        ['a word with blank text', { phrases: [{ words: [{ text: ' ', offsetMilliseconds: 0, durationMilliseconds: 200 }] }] }],
        ['a phrase with text but no words', { phrases: [{ text: 'Tin kettle.', words: [] }] }],
        ['combined text but no phrases', { combinedPhrases: [{ text: 'Tin kettle.' }], phrases: [] }]
    ])('rejects a piece response with %s', (_name, response) => {
        expect(() => parseMaiTranscribeWords(response)).toThrow(MESSAGES.UNKNOWN_API_RESPONSE);
    });
});
