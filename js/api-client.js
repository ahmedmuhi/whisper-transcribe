import { API_PARAMS, DEFAULT_LANGUAGE, DEFAULT_FILENAME } from './constants.js';

export class AzureAPIClient {
    constructor(settings) {
        this.settings = settings;
    }
    
    async transcribe(audioBlob, onProgress) {
        const config = this.settings.getModelConfig();
        
        if (!config.apiKey || !config.uri) {
            throw new Error('Please configure settings first');
        }
        
        const formData = new FormData();
        formData.append(API_PARAMS.FILE, audioBlob, DEFAULT_FILENAME);
        formData.append(API_PARAMS.LANGUAGE, DEFAULT_LANGUAGE);
        
        // Add response_format for GPT-4o to avoid truncation
        if (config.model === 'gpt-4o-transcribe') {
            formData.append(API_PARAMS.RESPONSE_FORMAT, 'json');
            formData.append(API_PARAMS.TEMPERATURE, '0');
        }
        
        try {
            if (onProgress) {
                onProgress(`Sending to Azure ${config.model === 'whisper' ? 'Whisper' : 'GPT-4o'} API...`);
            }
            
            const response = await fetch(config.uri, {
                method: 'POST',
                headers: { [API_PARAMS.API_KEY_HEADER]: config.apiKey },
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Details:', errorText);
                throw new Error(`API responded with status: ${response.status}`);
            }
            
            const data = await response.json();
            return this.parseResponse(data, config.model);
            
        } catch (error) {
            console.error('Error sending to Azure API:', error);
            throw error;
        }
    }
    
    parseResponse(data, model) {
        // Handle different response formats
        if (model === 'gpt-4o-transcribe' && data.segments) {
            // GPT-4o JSON format - merge all segments
            return data.segments.map(seg => seg.text).join(' ');
        } else if (data.text) {
            // Whisper or simple text response
            return data.text;
        }
        
        throw new Error('Unknown response format from API');
    }
    
    // Validate configuration before attempting transcription
    validateConfig() {
        const config = this.settings.getModelConfig();
        
        if (!config.apiKey) {
            throw new Error(`${config.model} API key is required`);
        }
        
        if (!config.uri) {
            throw new Error(`${config.model} URI is required`);
        }
        
        // Basic URI validation
        try {
            new URL(config.uri);
        } catch (e) {
            throw new Error(`Invalid URI format for ${config.model}`);
        }
        
        return config;
    }
}
