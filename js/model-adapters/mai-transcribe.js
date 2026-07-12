/**
 * @fileoverview Model adapter for Azure MAI-Transcribe requests.
 */

import {
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    DEFAULT_WAV_FILENAME,
    formatAudioUploadLimitMessage,
    MAI_TRANSCRIBE_MAX_UPLOAD_BYTES,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS
} from '../constants.js';
import { convertToWav } from '../audio-converter.js';
import { parseMaiTranscribeResponse } from './response-parsers.js';

function createMaiTranscribeModelAdapter(id, label, apiModel) {
    return {
        id,
        label,
        storageKeys: {
            apiKey: STORAGE_KEYS.MAI_TRANSCRIBE_API_KEY,
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        },
        async buildRequest(audioBlob, config, onProgress) {
            if (onProgress) {
                onProgress(MESSAGES.CONVERTING_AUDIO);
            }

            const wavBlob = await convertToWav(audioBlob);

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
                headers: { [API_PARAMS.MAI_API_KEY_HEADER]: config.apiKey },
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    };
}

export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE_1_5,
    'Azure MAI-Transcribe 1.5',
    MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
);
