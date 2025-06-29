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

// Centralized Messages
export const MESSAGES = {
  // Browser & Permissions
  BROWSER_NOT_SUPPORTED: 'Your browser does not support audio recording.',
  PERMISSION_DENIED: '🚫 Microphone permission denied. Please allow microphone access.',
  NO_MICROPHONE: '🎤 No microphone found. Please connect a microphone.',
  MICROPHONE_ERROR_PREFIX: '❌ Error accessing microphone: ',
  MICROPHONE_ACCESS_GRANTED: 'Microphone access granted',
  
  // Configuration
  API_NOT_CONFIGURED: '⚙️ Please configure API settings first',
  CONFIGURE_SETTINGS_FIRST: 'Please configure settings first',
  CONFIGURE_AZURE: 'Please configure Azure OpenAI settings',
  FILL_REQUIRED_FIELDS: 'Please fill in all required fields',
  SETTINGS_SAVED: 'Settings saved',
  
  // API Validation
  API_KEY_REQUIRED: 'API key is required',
  URI_REQUIRED: 'URI is required',
  INVALID_URI_FORMAT: 'Invalid URI format',
  
  // Recording States
  RECORDING_IN_PROGRESS: 'Recording... Click again to stop',
  RECORDING_PAUSED: 'Recording paused',
  RECORDING_CANCELLED: 'Recording cancelled',
  FINISHING_RECORDING: 'Finishing...',
  PROCESSING_AUDIO: 'Processing audio...',
  INITIALIZING_MICROPHONE: 'Initializing microphone...',
  
  // API Communication
  SENDING_TO_WHISPER: 'Sending to Azure Whisper API...',
  SENDING_TO_GPT4O: 'Sending to Azure GPT-4o API...',
  UNKNOWN_API_RESPONSE: 'Unknown response format from API',
  
  // Transcription
  TRANSCRIPTION_COMPLETE: 'Transcription complete',
  
  // Clipboard Operations
  TEXT_CUT_SUCCESS: 'Text cut to clipboard',
  TEXT_CUT_FAILED: 'Failed to cut text',
  NO_TEXT_TO_CUT: 'No text to cut',
  
  // Permission Instructions
  PERMISSION_CHROME: 'Click the camera icon in the address bar and allow microphone access.',
  PERMISSION_FIREFOX: 'Click the microphone icon in the address bar and allow access.',
  PERMISSION_SAFARI: 'Go to Safari > Settings > Websites > Microphone and allow access.',
  PERMISSION_DEFAULT: 'Check your browser settings to allow microphone access for this site.',
  
  // Error Messages
  ERROR_PREFIX: 'Error: ',
  MICROPHONE_IN_USE: '⚠️ Microphone is already in use by another application.',
  MICROPHONE_NOT_SUITABLE: '⚠️ No microphone meets the requirements. Try with a different microphone.',
  INVALID_REQUEST: '❌ Invalid request. Please check your browser settings.'
};

// Recording State Machine
export const RECORDING_STATES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  PROCESSING: 'processing',
  CANCELLING: 'cancelling',
  ERROR: 'error'
};

// Valid state transitions
export const STATE_TRANSITIONS = {
  [RECORDING_STATES.IDLE]: [RECORDING_STATES.INITIALIZING],
  [RECORDING_STATES.INITIALIZING]: [RECORDING_STATES.RECORDING, RECORDING_STATES.ERROR, RECORDING_STATES.IDLE],
  [RECORDING_STATES.RECORDING]: [RECORDING_STATES.PAUSED, RECORDING_STATES.STOPPING, RECORDING_STATES.CANCELLING],
  [RECORDING_STATES.PAUSED]: [RECORDING_STATES.RECORDING, RECORDING_STATES.STOPPING, RECORDING_STATES.CANCELLING],
  [RECORDING_STATES.STOPPING]: [RECORDING_STATES.PROCESSING, RECORDING_STATES.ERROR],
  [RECORDING_STATES.PROCESSING]: [RECORDING_STATES.IDLE, RECORDING_STATES.ERROR],
  [RECORDING_STATES.CANCELLING]: [RECORDING_STATES.IDLE],
  [RECORDING_STATES.ERROR]: [RECORDING_STATES.IDLE]
};
