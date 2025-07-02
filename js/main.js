import { Settings } from './settings.js';
import { UI } from './ui.js';
import { AzureAPIClient } from './api-client.js';
import { AudioHandler } from './audio-handler.js';
import { logger } from './logger.js';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
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
