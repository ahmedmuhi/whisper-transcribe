/**
 * @fileoverview Shared response parsing helpers for transcription model adapters.
 */

import { MESSAGES } from '../constants.js';

export function parseWhisperResponse(data) {
    if (typeof data === 'string') {
        return data.trim();
    }

    if (data.text) {
        return data.text;
    }

    throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
}

export function parseMaiTranscribeResponse(data) {
    if (typeof data === 'string') {
        return data.trim();
    }

    if (data.combinedPhrases && data.combinedPhrases.length > 0) {
        return data.combinedPhrases.map(phrase => phrase.text).join(' ');
    }

    if (data.text) {
        return data.text;
    }

    throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
}
