/**
 * @fileoverview Registry of transcription model adapters.
 */

import { whisperModelAdapter } from './whisper.js';
import { maiTranscribe15ModelAdapter } from './mai-transcribe.js';

// Order matters for AzureAPIClient.parseResponse(): MAI's structured shape is checked first.
export const modelAdapterRegistry = new Map([
    [maiTranscribe15ModelAdapter.id, maiTranscribe15ModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter]
]);
