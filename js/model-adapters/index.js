/**
 * @fileoverview Registry of transcription model adapters.
 */

import { whisperModelAdapter } from './whisper.js';
import { maiTranscribe15ModelAdapter } from './mai-transcribe.js';

// Registry insertion order carries no production semantics; transcribe() uses the active adapter only.
export const modelAdapterRegistry = new Map([
    [maiTranscribe15ModelAdapter.id, maiTranscribe15ModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter]
]);
