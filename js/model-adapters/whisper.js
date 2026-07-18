/**
 * @fileoverview Model adapter for Azure Whisper transcription requests.
 */

import {
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    DEFAULT_LANGUAGE,
    formatAudioUploadLimitMessage,
    getWhisperFilename,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS,
    WHISPER_MAX_UPLOAD_BYTES
} from '../constants.js';
import { COGNITIVE_SERVICES_SCOPE } from '../authentication-config.js';
import { parseWhisperResponse } from './response-parsers.js';

export const whisperModelAdapter = Object.freeze({
    id: MODEL_TYPES.WHISPER,
    label: 'Azure Whisper',
    scope: COGNITIVE_SERVICES_SCOPE,
    storageKeys: Object.freeze({
        uri: STORAGE_KEYS.WHISPER_URI
    }),
    async buildRequest(audioBlob) {
        if (audioBlob.size > WHISPER_MAX_UPLOAD_BYTES) {
            const error = new Error(formatAudioUploadLimitMessage('Azure Whisper', 'up to 25 MB'));
            error.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
            error.retryable = false;
            throw error;
        }

        const filename = getWhisperFilename(audioBlob.type);
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, filename);
        formData.append(API_PARAMS.LANGUAGE, DEFAULT_LANGUAGE);

        return {
            body: formData,
            statusMessage: MESSAGES.SENDING_TO_WHISPER
        };
    },
    parseResponse: parseWhisperResponse
});
