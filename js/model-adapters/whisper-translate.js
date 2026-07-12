/**
 * @fileoverview Model adapter for Azure Whisper translation requests.
 */

import {
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    formatAudioUploadLimitMessage,
    getWhisperFilename,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS,
    WHISPER_MAX_UPLOAD_BYTES
} from '../constants.js';
import { parseWhisperResponse } from './response-parsers.js';

export const whisperTranslateModelAdapter = {
    id: MODEL_TYPES.WHISPER_TRANSLATE,
    label: 'Azure Whisper Translate',
    storageKeys: {
        apiKey: STORAGE_KEYS.WHISPER_API_KEY,
        uri: STORAGE_KEYS.WHISPER_URI
    },
    async buildRequest(audioBlob, config) {
        if (audioBlob.size > WHISPER_MAX_UPLOAD_BYTES) {
            const error = new Error(formatAudioUploadLimitMessage('Azure Whisper Translate', 'up to 25 MB'));
            error.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
            error.retryable = false;
            throw error;
        }

        const filename = getWhisperFilename(audioBlob.type);
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, filename);

        return {
            headers: { [API_PARAMS.API_KEY_HEADER]: config.apiKey },
            body: formData,
            statusMessage: MESSAGES.SENDING_TO_WHISPER
        };
    },
    parseResponse: parseWhisperResponse
};
