/**
 * @fileoverview Model adapter for Azure Whisper transcription requests.
 */

import { API_PARAMS, DEFAULT_LANGUAGE, getWhisperFilename, MESSAGES, MODEL_TYPES, STORAGE_KEYS } from '../constants.js';
import { parseWhisperResponse } from './response-parsers.js';

export const whisperModelAdapter = {
    id: MODEL_TYPES.WHISPER,
    label: 'Azure Whisper',
    storageKeys: {
        apiKey: STORAGE_KEYS.WHISPER_API_KEY,
        uri: STORAGE_KEYS.WHISPER_URI
    },
    async buildRequest(audioBlob, config) {
        const filename = getWhisperFilename(audioBlob.type);
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, filename);
        formData.append(API_PARAMS.LANGUAGE, DEFAULT_LANGUAGE);

        return {
            headers: { [API_PARAMS.API_KEY_HEADER]: config.apiKey },
            body: formData,
            statusMessage: MESSAGES.SENDING_TO_WHISPER
        };
    },
    parseResponse: parseWhisperResponse
};
