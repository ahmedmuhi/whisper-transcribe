/**
 * Remove credentials persisted by releases that predate Entra authentication.
 *
 * These private names intentionally remain here forever so a browser profile
 * returning months after the migration is still cleaned without reading or
 * copying either value.
 */
export function cleanupLegacyCredentials() {
    localStorage.removeItem('whisper_api_key');
    localStorage.removeItem('mai_transcribe_api_key');
}
