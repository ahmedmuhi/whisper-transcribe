/**
 * @fileoverview Model adapters for Azure MAI-Transcribe 2 and MAI-Transcribe 1.5 requests.
 * Both share one factory, one Target URI, and one response parser; they differ
 * only in the enhancedMode block of the request definition.
 */

import {
    AUDIO_FORMAT_UNSUPPORTED_ERROR_CODE,
    AUDIO_UPLOAD_LIMIT_ERROR_CODE,
    API_PARAMS,
    DEFAULT_WAV_FILENAME,
    formatAudioUploadLimitMessage,
    ID,
    MAI_TRANSCRIBE_2_STYLE_VALUES,
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
    uiOrder,
    buildEnhancedMode,
    uploadLimitLabel,
    uploadLimitVerdict,
    uri,
    announceAsNew = false
}) {
    return Object.freeze({
        id,
        label,
        optionLabel,
        uiOrder,
        // Only an announced model carries the flag, so other adapter shapes stay unchanged.
        ...(announceAsNew ? { announceAsNew: true } : {}),
        supportsTranscribeStyle: true,
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
            const enhancedMode = buildEnhancedMode(config?.transcribeStyle);
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode }));

            return {
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    });
}

// Both MAI models call the same Speech resource route and differ only inside
// the request body, so they share one stored Target URI and one settings row.
const MAI_TRANSCRIBE_URI_ROW = Object.freeze({
    rowId: 'maiUri',
    inputId: ID.MAI_TRANSCRIBE_URI,
    badgeId: ID.MAI_URI_BADGE,
    title: 'MAI-Transcribe Target URI',
    subtitle: 'Your Azure MAI-Transcribe endpoint, used by MAI-Transcribe 2 and 1.5 · HTTPS only',
    keywords: 'mai transcribe target uri endpoint https azure connection'
});

export const maiTranscribe2ModelAdapter = createMaiTranscribeModelAdapter({
    id: MODEL_TYPES.MAI_TRANSCRIBE_2,
    label: 'Azure MAI-Transcribe 2',
    optionLabel: 'MAI-Transcribe 2',
    uiOrder: 2,
    announceAsNew: true,
    buildEnhancedMode(transcribeStyle) {
        // MAI-Transcribe 2 defaults to verbatim, so the style is always explicit.
        // hasOwn, not `??`: an inherited name such as 'toString' must not select a value.
        const style = Object.hasOwn(MAI_TRANSCRIBE_2_STYLE_VALUES, transcribeStyle)
            ? MAI_TRANSCRIBE_2_STYLE_VALUES[transcribeStyle]
            : MAI_TRANSCRIBE_2_STYLE_VALUES[MAI_TRANSCRIBE_STYLES.READABILITY];
        return {
            enabled: true,
            model: MODEL_TYPES.MAI_TRANSCRIBE_2_API_MODEL,
            [API_PARAMS.MAI_MODEL_OPTIONS_FIELD]: {
                [API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD]: style
            }
        };
    },
    uploadLimitLabel: 'under 250 MB',
    uploadLimitVerdict: 'under 250 MB after conversion',
    uri: MAI_TRANSCRIBE_URI_ROW
});

export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter({
    id: MODEL_TYPES.MAI_TRANSCRIBE_1_5,
    label: 'Azure MAI-Transcribe 1.5',
    optionLabel: 'MAI-Transcribe 1.5',
    uiOrder: 3,
    buildEnhancedMode(transcribeStyle) {
        const enhancedMode = { enabled: true, model: MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL, task: 'transcribe' };
        // 1.5 documents only "verbatim"; its default is already the readable style,
        // so Clean sends no field and keeps the request exactly as it has always been.
        if (transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
            enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
        }
        return enhancedMode;
    },
    uploadLimitLabel: 'under 250 MB',
    uploadLimitVerdict: 'under 250 MB after conversion',
    uri: MAI_TRANSCRIBE_URI_ROW
});
