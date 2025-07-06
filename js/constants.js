/**
 * @fileoverview Application constants for the whisper-transcribe app.
 * Contains all constant values, configuration keys, UI element IDs, and state definitions.
 * 
 * @module Constants
 * @since 1.0.0
 */

/**
 * Color constants for theme support and UI consistency.
 * 
 * @constant {Object} COLORS
 * @property {string} ERROR - Red color for error states (#dc2626)
 * @property {string} SUCCESS - Green color for success states (#16a34a)
 * @property {string} DARK_BG - Dark theme background color (#0f172a)
 * @property {string} LIGHT_BG - Light theme background color (#f8fafc)
 * @property {string} CANVAS_DARK_BG - Canvas background for dark theme
 * @property {string} CANVAS_LIGHT_BG - Canvas background for light theme
 */
export const COLORS = {
  ERROR:        '#dc2626',
  SUCCESS:      '#16a34a',
  DARK_BG:      '#0f172a',
  LIGHT_BG:     '#f8fafc',
  // visualiser fill colours
  CANVAS_DARK_BG: '#0f172a',
  CANVAS_LIGHT_BG: '#f8fafc'
};

/**
 * Local storage keys for persisting application settings.
 * 
 * @constant {Object} STORAGE_KEYS
 * @property {string} MODEL - Key for storing selected transcription model
 * @property {string} WHISPER_URI - Key for Whisper API endpoint URI
 * @property {string} WHISPER_API_KEY - Key for Whisper API authentication key
 * @property {string} GPT4O_URI - Key for GPT-4o API endpoint URI
 * @property {string} GPT4O_API_KEY - Key for GPT-4o API authentication key
 * @property {string} THEME_MODE - Key for storing user's preferred theme mode
 */
export const STORAGE_KEYS = {
  MODEL:            'transcription_model',
  WHISPER_URI:      'whisper_uri',
  WHISPER_API_KEY:  'whisper_api_key',
  GPT4O_URI:        'gpt4o_uri',
  GPT4O_API_KEY:    'gpt4o_api_key',
  THEME_MODE:       'themeMode'
};

/**
 * API parameter names for Azure Speech Services requests.
 * 
 * @constant {Object} API_PARAMS
 * @property {string} FILE - Form data field name for audio file upload
 * @property {string} LANGUAGE - Parameter name for transcription language
 * @property {string} RESPONSE_FORMAT - Parameter name for API response format
 * @property {string} TEMPERATURE - Parameter name for GPT-4o temperature setting
 * @property {string} API_KEY_HEADER - HTTP header name for API key authentication
 */
export const API_PARAMS = {
  FILE:            'file',
  LANGUAGE:        'language',
  RESPONSE_FORMAT: 'response_format',
  TEMPERATURE:     'temperature',
  API_KEY_HEADER:  'api-key'
};

/**
 * DOM element IDs for consistent element selection throughout the application.
 * Frozen object to prevent accidental modification.
 * 
 * @constant {Object} ID
 * @readonly
 * @property {string} MIC_BUTTON - Main microphone recording button
 * @property {string} PAUSE_BUTTON - Pause recording button
 * @property {string} CANCEL_BUTTON - Cancel recording button
 * @property {string} SETTINGS_BUTTON - Open settings modal button
 * @property {string} GRAB_TEXT_BUTTON - Copy transcription text button
 * @property {string} SAVE_SETTINGS - Save settings button
 * @property {string} THEME_TOGGLE - Theme switching toggle button
 * @property {string} STATUS - Status message display element
 * @property {string} TRANSCRIPT - Transcription text display area
 * @property {string} TIMER - Recording timer display element
 * @property {string} SETTINGS_MODAL - Settings configuration modal
 * @property {string} VISUALIZER - Audio visualization canvas element
 * @property {string} SPINNER_CONTAINER - Loading spinner container
 */
export const ID = Object.freeze({
  // Buttons
  MIC_BUTTON:       'mic-button',
  PAUSE_BUTTON:     'pause-button',
  CANCEL_BUTTON:    'cancel-button',
  SETTINGS_BUTTON:  'settings-button',
  GRAB_TEXT_BUTTON: 'grab-text-button',
  SAVE_SETTINGS:    'save-settings',
  THEME_TOGGLE:     'theme-toggle',

  // Status & text areas
  STATUS:           'status',
  TRANSCRIPT:       'transcript',
  TIMER:            'timer',

  // Modals & panes
  SETTINGS_MODAL:   'settings-modal',
  CLOSE_MODAL:      'close-modal',
  MODAL_TITLE:      'modal-title',
  WHISPER_SETTINGS: 'whisper-settings',
  GPT4O_SETTINGS:   'gpt4o-settings',

  // Selectors / inputs
  MODEL_SELECT:     'model-select',
  THEME_MODE:       'theme-mode',
  WHISPER_URI:      'whisper-uri',
  WHISPER_KEY:      'whisper-key',
  GPT4O_URI:        'gpt4o-uri',
  GPT4O_KEY:        'gpt4o-key',

  // Canvas / visualiser
  VISUALIZER:       'visualizer',
  VISUALIZER_CONTAINER: 'visualizer-container',

  // Icons
  PAUSE_ICON:       'pause-icon',
  PLAY_ICON:        'play-icon',
  MOON_ICON:        'moon-icon',
  SUN_ICON:         'sun-icon',
  THEME_ICON:       'theme-icon',

  // Misc
  SPINNER_CONTAINER: 'spinner-container'
});

/**
 * Default language code for transcription requests.
 * 
 * @constant {string} DEFAULT_LANGUAGE
 * @default 'en'
 */
export const DEFAULT_LANGUAGE  = 'en';

/**
 * Default filename for audio file uploads to the API.
 * 
 * @constant {string} DEFAULT_FILENAME
 * @default 'recording.webm'
 */
export const DEFAULT_FILENAME  = 'recording.webm';   // used when uploading audio

/**
 * Default status message displayed when the application is ready for recording.
 * 
 * @constant {string} DEFAULT_RESET_STATUS
 * @default '🎙️ Click the microphone to start recording'
 */
export const DEFAULT_RESET_STATUS =
  '🎙️ Click the microphone to start recording';

/**
 * Centralized user-facing messages for the application.
 * Organized by category for easy maintenance and potential internationalization.
 * 
 * @constant {Object} MESSAGES
 * @property {string} BROWSER_NOT_SUPPORTED - Error when browser lacks recording support
 * @property {string} PERMISSION_DENIED - Error when microphone permission is denied
 * @property {string} NO_MICROPHONE - Error when no microphone is detected
 * @property {string} API_NOT_CONFIGURED - Warning when API settings are missing
 * @property {string} RECORDING_IN_PROGRESS - Status during active recording
 * @property {string} PROCESSING_AUDIO - Status during transcription processing
 * @property {string} TRANSCRIPTION_COMPLETE - Success message after transcription
 * @property {string} SETTINGS_SAVED - Confirmation when settings are saved
 * @property {string} ERROR_PREFIX - Prefix for error messages
 */
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
  // Generic error message for unexpected errors
  ERROR_OCCURRED: 'An unexpected error occurred',
};

/**
 * Recording state machine states for managing the audio recording lifecycle.
 * Defines all possible states in the recording workflow.
 * 
 * @constant {Object} RECORDING_STATES
 * @property {string} IDLE - Ready to start recording
 * @property {string} INITIALIZING - Setting up recording (microphone access, etc.)
 * @property {string} RECORDING - Actively recording audio
 * @property {string} PAUSED - Recording temporarily paused
 * @property {string} STOPPING - Ending recording session
 * @property {string} PROCESSING - Transcribing recorded audio
 * @property {string} CANCELLING - Cancelling current recording
 * @property {string} ERROR - Error state requiring user intervention
 * 
 * @example
 * import { RECORDING_STATES } from './constants.js';
 * 
 * if (stateMachine.getState() === RECORDING_STATES.RECORDING) {
 *   logger.info('Recording is active');
 * }
 */
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

/**
 * Valid state transitions for the recording state machine.
 * Defines which states can transition to which other states.
 * Used by RecordingStateMachine.canTransitionTo() for validation.
 * 
 * @constant {Object} STATE_TRANSITIONS
 * @property {Array<string>} [RECORDING_STATES.IDLE] - States reachable from IDLE
 * @property {Array<string>} [RECORDING_STATES.INITIALIZING] - States reachable from INITIALIZING
 * @property {Array<string>} [RECORDING_STATES.RECORDING] - States reachable from RECORDING
 * @property {Array<string>} [RECORDING_STATES.PAUSED] - States reachable from PAUSED
 * @property {Array<string>} [RECORDING_STATES.STOPPING] - States reachable from STOPPING
 * @property {Array<string>} [RECORDING_STATES.PROCESSING] - States reachable from PROCESSING
 * @property {Array<string>} [RECORDING_STATES.CANCELLING] - States reachable from CANCELLING
 * @property {Array<string>} [RECORDING_STATES.ERROR] - States reachable from ERROR
 * 
 * @example
 * import { STATE_TRANSITIONS, RECORDING_STATES } from './constants.js';
 * 
 * const validNextStates = STATE_TRANSITIONS[RECORDING_STATES.RECORDING];
 * // Returns: ['paused', 'stopping', 'cancelling']
 */
export const STATE_TRANSITIONS = {
  [RECORDING_STATES.IDLE]: [RECORDING_STATES.INITIALIZING, RECORDING_STATES.ERROR],
  [RECORDING_STATES.INITIALIZING]: [RECORDING_STATES.RECORDING, RECORDING_STATES.ERROR, RECORDING_STATES.IDLE],
  [RECORDING_STATES.RECORDING]: [RECORDING_STATES.PAUSED, RECORDING_STATES.STOPPING, RECORDING_STATES.CANCELLING],
  [RECORDING_STATES.PAUSED]: [RECORDING_STATES.RECORDING, RECORDING_STATES.STOPPING, RECORDING_STATES.CANCELLING],
  [RECORDING_STATES.STOPPING]: [RECORDING_STATES.PROCESSING, RECORDING_STATES.ERROR],
  [RECORDING_STATES.PROCESSING]: [RECORDING_STATES.IDLE, RECORDING_STATES.ERROR],
  [RECORDING_STATES.CANCELLING]: [RECORDING_STATES.IDLE],
  [RECORDING_STATES.ERROR]: [RECORDING_STATES.IDLE]
};

/**
 * Timer configuration constants.
 * Centralizes magic values for timer intervals, display pattern, and stop delays.
 * @constant {Object} TIMER_CONFIG
 * @property {number} INTERVAL_MS - Interval in milliseconds for timer updates
 * @property {string} DEFAULT_DISPLAY - Initial timer display string
 * @property {number} GRACEFUL_STOP_DELAY_MS - Delay in milliseconds before recorder flush
 * @property {number} SECOND_MS - Number of milliseconds in one second
 * @property {number} MINUTE_MS - Number of milliseconds in one minute
 */
export const TIMER_CONFIG = {
  INTERVAL_MS: 1000,
  DEFAULT_DISPLAY: '00:00',
  GRACEFUL_STOP_DELAY_MS: 800,
  // Unit conversion constants
  SECOND_MS: 1000,
  MINUTE_MS: 60000
};
