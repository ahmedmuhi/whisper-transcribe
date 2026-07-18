import { Settings } from './settings.js';
import { UI } from './ui.js';
import { AzureAPIClient } from './api-client.js';
import { AudioHandler } from './audio-handler.js';
import { TranscriptStore } from './transcript-store.js';
import { logger } from './logger.js';
import { cleanupLegacyCredentials } from './legacy-credential-cleanup.js';
import { createTokenProvider } from './token-provider.js';

/**
 * @fileoverview Application entry point: initializes core modules on DOMContentLoaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    cleanupLegacyCredentials();
    logger.info('Initializing Speech-to-Text App...');

    const { AuthenticationService } = await import('./authentication-service.js');
    const authenticationService = new AuthenticationService();
    await authenticationService.initialize();
    const settings = new Settings();
    const transcriptStore = new TranscriptStore();
    const ui = new UI();
    const tokenProvider = createTokenProvider(authenticationService);
    const apiClient = new AzureAPIClient(settings, tokenProvider);
    // Reference kept to prevent GC (AudioHandler lives via event bus listeners)
    // eslint-disable-next-line no-unused-vars
    const audioHandler = new AudioHandler(apiClient, settings, authenticationService);

    ui.init(settings, transcriptStore);

    logger.info('Speech-to-Text App initialized');
});
