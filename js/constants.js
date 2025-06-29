export const COLORS = {
  ERROR:        '#dc2626',
  SUCCESS:      '#16a34a',
  DARK_BG:      '#0f172a',
  LIGHT_BG:     '#f8fafc',
  // visualiser fill colours
  CANVAS_DARK_BG: '#0f172a',
  CANVAS_LIGHT_BG: '#f8fafc'
};

export const STORAGE_KEYS = {
  MODEL:            'transcription_model',
  WHISPER_URI:      'whisper_uri',
  WHISPER_API_KEY:  'whisper_api_key',
  GPT4O_URI:        'gpt4o_uri',
  GPT4O_API_KEY:    'gpt4o_api_key',
  THEME_MODE:       'themeMode'
};

export const API_PARAMS = {
  FILE:            'file',
  LANGUAGE:        'language',
  RESPONSE_FORMAT: 'response_format',
  TEMPERATURE:     'temperature',
  API_KEY_HEADER:  'api-key'
};

export const DEFAULT_LANGUAGE  = 'en';
export const DEFAULT_FILENAME  = 'recording.webm';   // used when uploading audio
export const DEFAULT_RESET_STATUS =
  '🎙️ Click the microphone to start recording';
