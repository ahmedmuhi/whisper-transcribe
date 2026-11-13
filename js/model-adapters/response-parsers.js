/**
 * @fileoverview Shared response parsing helpers for transcription model adapters.
 */

import { MESSAGES } from '../constants.js';

export function parseWhisperResponse(data) {
    if (typeof data === 'string') {
        return data.trim();
    }

    if (typeof data?.text === 'string') {
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

    if (typeof data?.text === 'string') {
        return data.text;
    }

    throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
}

function isTimedWord(word) {
    return typeof word?.text === 'string'
        && Number.isFinite(word.offsetMilliseconds)
        && Number.isFinite(word.durationMilliseconds);
}

/**
 * Reads the words of a MAI-Transcribe response that was asked for word
 * timestamps. Each word keeps its display text, punctuation included.
 *
 * @param {object} data Parsed JSON response.
 * @returns {{ text: string, offsetMs: number, durationMs: number }[]} Words in spoken order.
 */
export function parseMaiTranscribeWords(data) {
    if (!Array.isArray(data?.phrases)) {
        throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
    }

    return data.phrases.flatMap((phrase) => {
        if (!Array.isArray(phrase?.words) || !phrase.words.every(isTimedWord)) {
            throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
        }
        return phrase.words.map(word => ({
            text: word.text,
            offsetMs: word.offsetMilliseconds,
            durationMs: word.durationMilliseconds
        }));
    });
}
