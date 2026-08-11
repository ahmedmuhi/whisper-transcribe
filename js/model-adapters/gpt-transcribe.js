/**
 * @fileoverview Model adapter for Azure GPT Transcribe requests.
 *
 * The deployment speaks the same Azure OpenAI `/audio/transcriptions` FormData
 * protocol as Whisper, so this adapter mirrors the Whisper one and reuses the
 * shared `{ text }` parser. It stays credential-blind: no URI, header, or key.
 */

import {
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    formatAudioUploadLimitMessage,
    getWhisperFilename,
    GPT_TRANSCRIBE_MAX_UPLOAD_BYTES,
    ID,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS
} from '../constants.js';
import { COGNITIVE_SERVICES_SCOPE } from '../authentication-config.js';
import { parseWhisperResponse } from './response-parsers.js';

const GPT_TRANSCRIBE_LABEL = 'Azure GPT Transcribe';
const GPT_TRANSCRIBE_UPLOAD_LIMIT_LABEL = 'up to 25 MB';

export const gptTranscribeModelAdapter = Object.freeze({
    id: MODEL_TYPES.GPT_TRANSCRIBE,
    label: GPT_TRANSCRIBE_LABEL,
    optionLabel: GPT_TRANSCRIBE_LABEL,
    uiOrder: 3,
    scope: COGNITIVE_SERVICES_SCOPE,
    storageKeys: Object.freeze({
        uri: STORAGE_KEYS.GPT_TRANSCRIBE_URI
    }),
    maxUploadBytes: GPT_TRANSCRIBE_MAX_UPLOAD_BYTES,
    uploadLimitLabel: GPT_TRANSCRIBE_UPLOAD_LIMIT_LABEL,
    uploadLimitVerdict: '25 MB maximum',
    uploadLimitAppliesTo: 'source',
    uri: Object.freeze({
        rowId: 'gptTranscribeUri',
        inputId: ID.GPT_TRANSCRIBE_URI,
        badgeId: ID.GPT_TRANSCRIBE_URI_BADGE,
        title: 'GPT Transcribe Target URI',
        subtitle: 'Your Azure GPT Transcribe endpoint · HTTPS only',
        keywords: 'gpt transcribe target uri endpoint https azure connection openai'
    }),
    async buildRequest(audioBlob) {
        if (audioBlob.size > GPT_TRANSCRIBE_MAX_UPLOAD_BYTES) {
            const error = new Error(formatAudioUploadLimitMessage(
                GPT_TRANSCRIBE_LABEL,
                GPT_TRANSCRIBE_UPLOAD_LIMIT_LABEL
            ));
            error.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
            error.retryable = false;
            throw error;
        }

        const filename = getWhisperFilename(audioBlob.type, audioBlob.name);
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, filename);
        // No `language` field: this deployment's support for it is unverified,
        // so the model is left to detect the spoken language itself.

        return {
            body: formData,
            statusMessage: MESSAGES.SENDING_TO_GPT_TRANSCRIBE
        };
    },
    parseResponse: parseWhisperResponse
});
