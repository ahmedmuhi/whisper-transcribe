/**
 * @fileoverview Model adapter for Azure MAI-Transcribe requests.
 */

import { API_PARAMS, DEFAULT_WAV_FILENAME, MAI_TRANSCRIBE_STYLES, MESSAGES, MODEL_TYPES, STORAGE_KEYS } from '../constants.js';
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

            const formData = new FormData();
            const wavBlob = await convertToWav(audioBlob);
            formData.append(API_PARAMS.MAI_AUDIO_FIELD, wavBlob, DEFAULT_WAV_FILENAME);
            const enhancedMode = {
                enabled: true,
                model: apiModel,
                task: 'transcribe'
            };
            if (apiModel === MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
                && config.transcribeStyle === MAI_TRANSCRIBE_STYLES.VERBATIM) {
                enhancedMode[API_PARAMS.MAI_TRANSCRIBE_STYLE_FIELD] = MAI_TRANSCRIBE_STYLES.VERBATIM;
            }
            formData.append(API_PARAMS.MAI_DEFINITION_FIELD, JSON.stringify({ enhancedMode }));

            return {
                headers: { [API_PARAMS.MAI_API_KEY_HEADER]: config.apiKey },
                body: formData,
                statusMessage: MESSAGES.SENDING_TO_MAI_TRANSCRIBE
            };
        },
        parseResponse: parseMaiTranscribeResponse
    };
}

export const maiTranscribeModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE,
    'Azure MAI-Transcribe 1',
    MODEL_TYPES.MAI_TRANSCRIBE_API_MODEL
);

export const maiTranscribe15ModelAdapter = createMaiTranscribeModelAdapter(
    MODEL_TYPES.MAI_TRANSCRIBE_1_5,
    'Azure MAI-Transcribe 1.5',
    MODEL_TYPES.MAI_TRANSCRIBE_1_5_API_MODEL
);
