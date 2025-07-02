/**
 * @fileoverview Central event management system for decoupled module communication.
 * Provides publish-subscribe pattern implementation with event history and debugging.
 * 
 * @module EventBus
 * @since 1.0.0
 */

import { logger } from './logger.js';

/**
 * EventBus - Central event management system for the application.
 * Provides a decoupled way for modules to communicate using publish-subscribe pattern.
 * Supports event prioritization, one-time listeners, and event history tracking.
 * 
 * @class EventBus
 * @example
 * // Subscribe to an event
 * const unsubscribe = eventBus.on('user:login', (data) => {
 *   logger.info('User logged in:', data.username);
 * });
 * 
 * // Emit an event
 * eventBus.emit('user:login', { username: 'john_doe' });
 * 
 * // Unsubscribe
 * unsubscribe();
 */
export class EventBus {
    /**
     * Creates a new EventBus instance.
     * Initializes the events map, event history, and debug mode.
     */
    constructor() {
        this.events = new Map();
        this.eventHistory = [];
        this.debugMode = false;
    }
    
    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Function to call when event is emitted
     * @param {Object} options - Options for the subscription
     * @returns {Function} Unsubscribe function
     */
    on(eventName, callback, options = {}) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        
        const listener = {
            callback,
            once: options.once || false,
            priority: options.priority || 0
        };
        
        const listeners = this.events.get(eventName);
        listeners.push(listener);
        
        // Sort by priority (higher priority first)
        listeners.sort((a, b) => b.priority - a.priority);
        
        // Return unsubscribe function
        return () => this.off(eventName, callback);
    }
    
    /**
     * Subscribe to an event only once
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Function to call when event is emitted
     * @returns {Function} Unsubscribe function
     */
    once(eventName, callback) {
        return this.on(eventName, callback, { once: true });
    }
    
    /**
     * Unsubscribe from an event
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Function to unsubscribe
     */
    off(eventName, callback) {
        if (!this.events.has(eventName)) return;
        
        const listeners = this.events.get(eventName);
        const index = listeners.findIndex(listener => listener.callback === callback);
        
        if (index > -1) {
            listeners.splice(index, 1);
        }
        
        // Clean up empty event arrays
        if (listeners.length === 0) {
            this.events.delete(eventName);
        }
    }
    
    /**
     * Emit an event
     * @param {string} eventName - Name of the event
     * @param {*} data - Data to pass to listeners
     */
    emit(eventName, data = {}) {
        if (this.debugMode) {
            const eventLogger = logger.child('EventBus');
            eventLogger.debug(`Emitting event: ${eventName}`, data);
        }
        
        // Record event in history
        this.eventHistory.push({
            eventName,
            data,
            timestamp: Date.now()
        });
        
        // Keep only last 50 events in history
        if (this.eventHistory.length > 50) {
            this.eventHistory.shift();
        }
        
        if (!this.events.has(eventName)) return;
        
        const listeners = [...this.events.get(eventName)];
        
        listeners.forEach(listener => {
            try {
                listener.callback(data);
                
                // Remove if it was a one-time listener
                if (listener.once) {
                    this.off(eventName, listener.callback);
                }
            } catch (error) {
                const eventLogger = logger.child('EventBus');
                eventLogger.error(`Error in listener for ${eventName}:`, error);
            }
        });
    }
    
    /**
     * Clear all listeners for a specific event or all events
     * @param {string} eventName - Optional event name to clear
     */
    clear(eventName = null) {
        if (eventName) {
            this.events.delete(eventName);
        } else {
            this.events.clear();
        }
    }
    
    /**
     * Get all registered events
     * @returns {Array} Array of event names
     */
    getEvents() {
        return Array.from(this.events.keys());
    }
    
    /**
     * Get event history
     * @returns {Array} Array of past events
     */
    getHistory() {
        return [...this.eventHistory];
    }
    
    /**
     * Enable/disable debug mode
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
}

/**
 * Singleton instance of EventBus for application-wide event communication.
 * Use this instance throughout the application for consistent event handling.
 * 
 * @type {EventBus}
 * @example
 * import { eventBus, APP_EVENTS } from './event-bus.js';
 * 
 * eventBus.on(APP_EVENTS.RECORDING_STARTED, (data) => {
 *   logger.info('Recording started at:', data.timestamp);
 * });
 */
export const eventBus = new EventBus();

/**
 * Application event constants to prevent typos and provide centralized event management.
 * All events follow a namespace:action pattern for better organization.
 * 
 * @constant {Object} APP_EVENTS
 * @property {string} RECORDING_STATE_CHANGED - Emitted when recording state transitions occur
 * @property {string} RECORDING_STARTED - Emitted when audio recording begins
 * @property {string} RECORDING_STOPPED - Emitted when audio recording ends
 * @property {string} RECORDING_PAUSED - Emitted when recording is paused
 * @property {string} RECORDING_RESUMED - Emitted when recording resumes from pause
 * @property {string} RECORDING_CANCELLED - Emitted when recording is cancelled
 * @property {string} RECORDING_ERROR - Emitted when recording encounters an error
 * 
 * @property {string} PERMISSION_GRANTED - Emitted when microphone permission is granted
 * @property {string} PERMISSION_DENIED - Emitted when microphone permission is denied
 * @property {string} PERMISSION_ERROR - Emitted when permission check encounters error
 * @property {string} PERMISSION_STATUS_CHANGED - Emitted when permission status changes
 * 
 * @property {string} API_REQUEST_START - Emitted when API transcription request begins
 * @property {string} API_REQUEST_SUCCESS - Emitted when API request completes successfully
 * @property {string} API_REQUEST_ERROR - Emitted when API request encounters error
 * @property {string} API_CONFIG_MISSING - Emitted when API configuration is missing
 * 
 * @property {string} UI_STATUS_UPDATE - Emitted when UI status message should be updated
 * @property {string} UI_TRANSCRIPTION_READY - Emitted when transcription is ready for display
 * @property {string} UI_THEME_CHANGED - Emitted when UI theme is switched
 * @property {string} UI_SETTINGS_OPENED - Emitted when settings modal is opened
 * @property {string} UI_SETTINGS_CLOSED - Emitted when settings modal is closed
 * 
 * @property {string} VISUALIZATION_START - Emitted when audio visualization should start
 * @property {string} VISUALIZATION_STOP - Emitted when audio visualization should stop
 * 
 * @property {string} SETTINGS_UPDATED - Emitted when application settings are updated
 * @property {string} SETTINGS_MODEL_CHANGED - Emitted when transcription model is changed
 * @property {string} SETTINGS_SAVED - Emitted when settings are successfully saved
 * @property {string} SETTINGS_VALIDATION_ERROR - Emitted when settings validation fails
 * 
 * @property {string} APP_INITIALIZED - Emitted when application initialization completes
 * @property {string} APP_ERROR - Emitted when application encounters critical error
 * @property {string} APP_PREREQUISITES_CHECKED - Emitted when initial checks complete
 * @property {string} APP_READY - Emitted when application is ready for user interaction
 * 
 * @example
 * import { APP_EVENTS } from './event-bus.js';
 * 
 * // Use constants instead of strings to prevent typos
 * eventBus.emit(APP_EVENTS.RECORDING_STARTED, { 
 *   timestamp: Date.now() 
 * });
 */
export const APP_EVENTS = {
    // Recording events
    RECORDING_STATE_CHANGED: 'recording:stateChanged',
    RECORDING_STARTED: 'recording:started',
    RECORDING_STOPPED: 'recording:stopped',
    RECORDING_PAUSED: 'recording:paused',
    RECORDING_RESUMED: 'recording:resumed',
    RECORDING_CANCELLED: 'recording:cancelled',
    RECORDING_ERROR: 'recording:error',
    
    // Permission events
    PERMISSION_GRANTED: 'permission:granted',
    PERMISSION_DENIED: 'permission:denied',
    PERMISSION_ERROR: 'permission:error',
    PERMISSION_STATUS_CHANGED: 'permission:statusChanged',
    
    // API events
    API_REQUEST_START: 'api:requestStart',
    API_REQUEST_SUCCESS: 'api:requestSuccess',
    API_REQUEST_ERROR: 'api:requestError',
    API_CONFIG_MISSING: 'api:configMissing',
    
    // UI events
    UI_STATUS_UPDATE: 'ui:statusUpdate',
    UI_TRANSCRIPTION_READY: 'ui:transcriptionReady',
    UI_THEME_CHANGED: 'ui:themeChanged',
    UI_SETTINGS_OPENED: 'ui:settingsOpened',
    UI_SETTINGS_CLOSED: 'ui:settingsClosed',
    
    // UI Control events - for decoupled UI state management
    UI_TIMER_UPDATE: 'ui:timerUpdate',
    UI_TIMER_RESET: 'ui:timerReset',
    UI_BUTTON_ENABLE_MIC: 'ui:buttonEnableMic',
    UI_BUTTON_DISABLE_MIC: 'ui:buttonDisableMic',
    UI_BUTTON_SET_RECORDING_STATE: 'ui:buttonSetRecordingState',
    UI_BUTTON_SET_PAUSE_STATE: 'ui:buttonSetPauseState',
    UI_CONTROLS_RESET: 'ui:controlsReset',
    UI_SPINNER_SHOW: 'ui:spinnerShow',
    UI_SPINNER_HIDE: 'ui:spinnerHide',

    // Visualization events
    VISUALIZATION_START: 'visualization:start',
    VISUALIZATION_STOP: 'visualization:stop',
    
    // Settings events
    SETTINGS_UPDATED: 'settings:updated',
    SETTINGS_MODEL_CHANGED: 'settings:modelChanged',
    SETTINGS_SAVED: 'settings:saved',
    SETTINGS_VALIDATION_ERROR: 'settings:validationError',
    
    // Application events
    APP_INITIALIZED: 'app:initialized',
    APP_ERROR: 'app:error',
    APP_PREREQUISITES_CHECKED: 'app:prerequisitesChecked',
    APP_READY: 'app:ready'
};