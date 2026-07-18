import { Settings } from './settings.js';
import { UI } from './ui.js';
import { AzureAPIClient } from './api-client.js';
import { AudioHandler } from './audio-handler.js';
import { TranscriptStore } from './transcript-store.js';
import { logger } from './logger.js';
import { cleanupLegacyCredentials } from './legacy-credential-cleanup.js';
import { createTokenProvider } from './token-provider.js';
import { AuthInteractionController } from './auth-interaction-controller.js';
import { UserMenu } from './user-menu.js';
import { AUTH_PRESENTATION_STATES } from './constants.js';
import { SelectedAudioController } from './selected-audio-controller.js';
import { AuthenticationService } from './authentication-service.js';

/**
 * @fileoverview Application entry point: initializes core modules on DOMContentLoaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    cleanupLegacyCredentials();
    logger.info('Initializing Speech-to-Text App...');

    const authenticationService = new AuthenticationService();
    const authenticationInitialization = authenticationService.initialize();
    const settings = new Settings();
    const transcriptStore = new TranscriptStore();
    const tokenProvider = createTokenProvider(authenticationService);
    const apiClient = new AzureAPIClient(settings, tokenProvider);
    const audioHandler = new AudioHandler(apiClient, settings, authenticationService);
    const selectedAudioController = new SelectedAudioController({
        settings,
        authenticationReadiness: authenticationService,
        apiClient,
        recordingSafety: audioHandler
    });
    audioHandler.setAudioSourceCoordinator(selectedAudioController);
    let ui;
    const authInteractionController = new AuthInteractionController({
        authenticationService,
        audioSafety: selectedAudioController,
        getScope: () => apiClient.getScopeForModel(settings.getCurrentModel()),
        confirmDiscard: (confirmation) => ui.confirmUnsentDiscard(confirmation)
    });
    ui = new UI({
        authenticationState: authenticationService.getState?.()
            ?? AUTH_PRESENTATION_STATES.CHECKING,
        authInteractionController,
        selectedAudioController
    });
    const userMenu = new UserMenu({
        authenticationService,
        authInteractionController,
        settings
    });
    settings.setUserMenu?.(userMenu);

    ui.init(settings, transcriptStore);
    userMenu.init();
    await authenticationInitialization;

    logger.info('Speech-to-Text App initialized');
});
