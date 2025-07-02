/**
 * EventBus - Central event management system
 * Provides a decoupled way for modules to communicate
 */
export class EventBus {
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
            console.log(`[EventBus] Emitting: ${eventName}`, data);
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
                console.error(`[EventBus] Error in listener for ${eventName}:`, error);
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

// Create a singleton instance
export const eventBus = new EventBus();

// Export event names as constants to avoid typos
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