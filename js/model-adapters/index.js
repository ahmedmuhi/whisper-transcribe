/**
 * @fileoverview Registry of transcription model adapters.
 */

import { whisperModelAdapter } from './whisper.js';
import { whisperTranslateModelAdapter } from './whisper-translate.js';
import { maiTranscribeModelAdapter } from './mai-transcribe.js';

// Order matters for AzureAPIClient.parseResponse(): adapters are tried in legacy parse precedence.
export const modelAdapterRegistry = new Map([
    [maiTranscribeModelAdapter.id, maiTranscribeModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter],
    [whisperTranslateModelAdapter.id, whisperTranslateModelAdapter]
]);
