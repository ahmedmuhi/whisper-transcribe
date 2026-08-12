/**
 * @fileoverview Registry of transcription model adapters.
 */

import { whisperModelAdapter } from './whisper.js';
import { maiTranscribe15ModelAdapter } from './mai-transcribe.js';
import { gptTranscribeModelAdapter } from './gpt-transcribe.js';

// Registry insertion order carries no production semantics; transcribe() uses the active adapter only.
export const modelAdapterRegistry = new Map([
    [maiTranscribe15ModelAdapter.id, maiTranscribe15ModelAdapter],
    [whisperModelAdapter.id, whisperModelAdapter],
    [gptTranscribeModelAdapter.id, gptTranscribeModelAdapter]
]);

/**
 * Adapters in the order the user-visible surfaces present them. Registry order
 * is response-parser precedence, so presentation order is declared separately
 * as `uiOrder`; adapters without one keep registry order behind those that do.
 *
 * @param {Map<string, object>} [registry] Registry to list; defaults to the production one.
 * @returns {object[]} Adapters sorted for display.
 */
export function listModelAdapters(registry = modelAdapterRegistry) {
    return Array.from(registry.values())
        .map((adapter, index) => ({ adapter, index }))
        .sort((a, b) => {
            const orderA = Number.isFinite(a.adapter.uiOrder) ? a.adapter.uiOrder : Number.MAX_SAFE_INTEGER;
            const orderB = Number.isFinite(b.adapter.uiOrder) ? b.adapter.uiOrder : Number.MAX_SAFE_INTEGER;
            return orderA === orderB ? a.index - b.index : orderA - orderB;
        })
        .map((entry) => entry.adapter);
}
