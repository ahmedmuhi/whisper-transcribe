import { API_PARAMS, DEFAULT_LANGUAGE, DEFAULT_FILENAME, MESSAGES } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

export class AzureAPIClient {
    constructor(settings) {
        this.settings = settings;
    }
    
    async transcribe(audioBlob, onProgress) {
        const config = this.settings.getModelConfig();
        
        if (!config.apiKey || !config.uri) {
            throw new Error(MESSAGES.CONFIGURE_SETTINGS_FIRST);
        }
        
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, DEFAULT_FILENAME);
        if (config.model !== 'whisper-translate') {
            formData.append(API_PARAMS.LANGUAGE, DEFAULT_LANGUAGE);
        }
        
        // Add response_format for GPT-4o to avoid truncation
        if (config.model === 'gpt-4o-transcribe') {
            formData.append(API_PARAMS.RESPONSE_FORMAT, 'json');
            formData.append(API_PARAMS.TEMPERATURE, '0');
        }
        
        try {
            const statusMessage = config.model === 'whisper' ? 
                MESSAGES.SENDING_TO_WHISPER : 
                MESSAGES.SENDING_TO_GPT4O;
                
            if (onProgress) {
                onProgress(statusMessage);
            }
            
            eventBus.emit(APP_EVENTS.API_REQUEST_START, {
                model: config.model,
                message: statusMessage
            });
            
            const response = await fetch(config.uri, {
                method: 'POST',
                headers: { [API_PARAMS.API_KEY_HEADER]: config.apiKey },
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Details:', errorText);
                const error = new Error(`API responded with status: ${response.status}`);
                
                eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                    status: response.status,
                    error: error.message,
                    details: errorText
                });
                
                throw error;
            }
            
            const contentType = response.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await response.json()
                : await response.text();
            const transcription = this.parseResponse(data, config.model);
            
            eventBus.emit(APP_EVENTS.API_REQUEST_SUCCESS, {
                model: config.model,
                transcriptionLength: transcription.length
            });
            
            return transcription;
            
        } catch (error) {
            console.error('Error sending to Azure API:', error);
            
            eventBus.emit(APP_EVENTS.API_REQUEST_ERROR, {
                error: error.message
            });
            
            throw error;
        }
    }
    
    parseResponse(data, model) {
        // Text response
        if (typeof data === 'string') {
            return data.trim();
        }

        // Handle different JSON formats
        if (model === 'gpt-4o-transcribe' && data.segments) {
            // GPT-4o JSON format - merge all segments
            return data.segments.map(seg => seg.text).join(' ');
        } else if (data.text) {
            // Whisper or simple text response
            return data.text;
        }

        throw new Error(MESSAGES.UNKNOWN_API_RESPONSE);
    }
    
    // Validate configuration before attempting transcription
    validateConfig() {
        const config = this.settings.getModelConfig();
        
        if (!config.apiKey) {
            const error = new Error(`${config.model} ${MESSAGES.API_KEY_REQUIRED}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'apiKey', model: config.model });
            throw error;
        }
        
        if (!config.uri) {
            const error = new Error(`${config.model} ${MESSAGES.URI_REQUIRED}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'uri', model: config.model });
            throw error;
        }
        
        // Basic URI validation
        try {
            new URL(config.uri);
        } catch (e) {
            const error = new Error(`${MESSAGES.INVALID_URI_FORMAT} for ${config.model}`);
            eventBus.emit(APP_EVENTS.API_CONFIG_MISSING, { missing: 'validUri', model: config.model });
            throw error;
        }
        
        return config;
    }
}
