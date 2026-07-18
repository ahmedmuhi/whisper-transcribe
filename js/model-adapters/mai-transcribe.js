/**
 * @fileoverview Model adapter for Azure MAI-Transcribe requests.
 */

import {
    AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    DEFAULT_WAV_FILENAME,
    formatAudioUploadLimitMessage,
    MAI_TRANSCRIBE_MAX_UPLOAD_BYTES,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS,
    SUPPORTED_AUDIO_FORMATS_LABEL,
    resolveSupportedAudioFormat
} from '../constants.js';
import { COGNITIVE_SERVICES_SCOPE } from '../authentication-config.js';
import { convertToWav } from '../audio-converter.js';
import { parseMaiTranscribeResponse } from './response-parsers.js';

function createMaiTranscribeModelAdapter(id, label, apiModel) {
    return Object.freeze({
        id,
        label,
        scope: COGNITIVE_SERVICES_SCOPE,
        storageKeys: Object.freeze({
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        }),
        async buildRequest(audioBlob, _config, onProgress) {
            const format = resolveSupportedAudioFormat(audioBlob.type, audioBlob.name);
            if (!format) {
                const error = new Error(
                    `Unsupported audio format. Supported types: ${SUPPORTED_AUDIO_FORMATS_LABEL}.`
                );
                error.code = AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE;
                error.retryable = false;
                throw error;
            }
            if (onProgress) {
                onProgress(MESSAGES.CONVERTING_AUDIO);
            }

            let wavBlob;
            try {
                wavBlob = await convertToWav(audioBlob);
            } catch {
                const error = new Error('The selected audio could not be decoded. Choose another file.');
                error.code = AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE;
                error.retryable = false;
                throw error;
            }

            if (wavBlob.size > MAI_TRANSCRIBE_MAX_UPLOAD_BYTES) {
                const error = new Error(formatAudioUploadLimitMessage(
                    'Azure MAI-Transcribe 1.5',
                    'under 300 MB'
                ));
                error.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
                error.retryable = false;
                throw error;
            }

            const formData = new FormData();
            formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({
                enhancedMode: {
                    enabled: true,
                    model: apiModel,
                    task: 'transcribe'
                }
            }));

            return {
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    });
}

export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE_1_5,
    'Azure MAI-Transcribe 1.5',
    MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
);
