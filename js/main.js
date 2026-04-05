import { Settings } from './settings.js';
import { UI } from './ui.js';
import { AzureAPIClient } from './api-client.js';
import { AudioHandler } from './audio-handler.js';
import { logger } from './logger.js';

/**
 * @fileoverview Application entry point: initializes core modules on DOMContentLoaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    logger.info('Initializing Speech-to-Text App...');
    
    const settings = new Settings();
    const ui = new UI();
    const apiClient = new AzureAPIClient(settings);
    // Reference kept to prevent GC (AudioHandler lives via event bus listeners)
    // eslint-disable-next-line no-unused-vars
    const audioHandler = new AudioHandler(apiClient, settings);

    ui.init(settings);
    
    logger.info('Speech-to-Text App initialized');
});
