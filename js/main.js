import { Settings } from './settings.js';
import { UI } from './ui.js';
import { AzureAPIClient } from './api-client.js';
import { AudioHandler } from './audio-handler.js';
import { logger } from './logger.js';

/**
 * @fileoverview Application entry point: initializes core modules on DOMContentLoaded.
 * @module Main
 */
// Initialize app
document.addEventListener('DOMContentLoaded', () => {
     /**
      * Initialize the application: settings, UI, API client, audio handler.
      * @returns {void}
      */
    logger.info('Initializing Speech-to-Text App...');
    
    // Initialize modules
    const settings = new Settings();
    const ui = new UI();
    const apiClient = new AzureAPIClient(settings);
    const audioHandler = new AudioHandler(apiClient, ui, settings);
    
    // Initialize UI with settings reference
    ui.init(settings, audioHandler);
    
    logger.info('Speech-to-Text App initialized');
});
