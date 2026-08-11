/**
 * @fileoverview Model adapter for Azure MAI-Transcribe requests.
 */

import {
    AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    DEFAULT_WAV_FILENAME,
    formatAudioUploadLimitMessage,
    ID,
    MAI_TRANSCRIBE_MAX_UPLOAD_BYTES,
    MAI_TRANSCRIBE_STYLES,
    MESSAGES,
    MODEL_TYPES,
    STORAGE_KEYS,
    SUPPORTED_AUDIO_FORMATS_LABEL,
    resolveSupportedAudioFormat
} from '../constants.js';
import { COGNITIVE_SERVICES_SCOPE } from '../authentication-config.js';
import { convertToWav } from '../audio-converter.js';
import { parseMaiTranscribeResponse } from './response-parsers.js';

function createMaiTranscribeModelAdapter({
    id,
    label,
    optionLabel,
    apiModel,
    uploadLimitLabel,
    uploadLimitVerdict,
    uri
}) {
    return Object.freeze({
        id,
        label,
        optionLabel,
        scope: COGNITIVE_SERVICES_SCOPE,
        storageKeys: Object.freeze({
            uri: STORAGE_KEYS.MAI_TRANSCRIBE_URI
        }),
        maxUploadBytes: MAI_TRANSCRIBE_MAX_UPLOAD_BYTES,
        uploadLimitLabel,
        uploadLimitVerdict,
        // The documented ceiling applies to the converted 16 kHz mono WAV, not the
        // source file. Selection-time gating on the source size stays conservative
        // because any supported source at or over the ceiling can only grow.
        uploadLimitAppliesTo: 'converted',
        uri: Object.freeze(uri),
        async buildRequest(audioBlob, config, onProgress) {
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
                const error = new Error(formatAudioUploadLimitMessage(label, uploadLimitLabel));
                error.code = AUDIO_UPLOAD_LIMIT_ERROR_CODE;
                error.retryable = false;
                throw error;
            }

            const formData = new FormData();
            formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
            const enhancedMode = {
                enabled: true,
                model: apiModel,
                task: 'transcribe'
            };
            if (config?.transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
                enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
            }
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode }));

            return {
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    });
}

export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter({
    id: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
    label: 'Azure MAI-Transcribe 1.5',
    optionLabel: 'MAI-Transcribe 1.5',
    apiModel: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL,
    uploadLimitLabel: 'under 300 MB',
    uploadLimitVerdict: 'under 300 MB after conversion',
    uri: {
        rowId: 'maiUri',
        inputId: ID.MAI_TRANSCRIBE_URI,
        badgeId: ID.MAI_URI_BADGE,
        title: 'MAI-Transcribe 1.5 Target URI',
        subtitle: 'Your Azure MAI-Transcribe endpoint · HTTPS only',
        keywords: 'mai transcribe target uri endpoint https azure connection'
    }
});
