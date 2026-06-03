/**
 * @fileoverview Model adapter for Azure Whisper translation requests.
 */

import { API_PARAMS, DEFAULT_FILENAME, MESSAGES, MODEL_TYPES, STORAGE_KEYS } from '../constants.js';
import { parseWhisperResponse } from './response-parsers.js';

export const whisperTranslateModelAdapter = {
    id: MODEL_TYPES.WHISPER_TRANSLATE,
    label: 'Azure Whisper Translate',
    storageKeys: {
        apiKey: STORAGE_KEYS.WHISPER_API_KEY,
        uri: STORAGE_KEYS.WHISPER_URI
    },
    async buildRequest(audioBlob, config) {
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, DEFAULT_FILENAME);

        return {
            headers: { [API_PARAMS.API_KEY_HEADER]: config.apiKey },
            body: formData,
            statusMessage: MESSAGES.SENDING_TO_WHISPER
        };
    },
    parseResponse: parseWhisperResponse
};
