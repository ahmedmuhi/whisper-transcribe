/**
 * @fileoverview Focused tests for transcription model response parsers.
 */

import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../js/constants.js';
import {
    parseMaiTranscribeResponse,
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
});
