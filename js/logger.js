/**
 * @fileoverview Centralized logging utility for the Speech-to-Text application.
 * Provides configurable log levels with environment-based control to prevent
 * debug information exposure in production environments.
 * 
 * @module Logger
 * @since 1.0.0
 * @author Development Team
 */

/**
 * Log levels enumeration
 * @readonly
 * @enum {number}
 */
const LOG_LEVELS = {
    /** Detailed debugging information */
    DEBUG: 0,
    /** General information about application flow */
    INFO: 1,
    /** Warning messages for non-critical issues */
    WARN: 2,
    /** Error messages for critical issues */
    ERROR: 3,
    /** Completely disable logging */
    NONE: 4
};

/**
 * Log level names for display
 * @readonly
 * @enum {string}
 */
const LOG_LEVEL_NAMES = {
    [LOG_LEVELS.DEBUG]: 'DEBUG',
    [LOG_LEVELS.INFO]: 'INFO',
    [LOG_LEVELS.WARN]: 'WARN',
    [LOG_LEVELS.ERROR]: 'ERROR'
};

/**
 * Environment detection utility
 * @returns {string} Current environment ('development' or 'production')
 */
function detectEnvironment() {
    // Check for common development indicators
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
        return process.env.NODE_ENV;
    }
    
    // Check for localhost or development domains
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
            return 'development';
        }
    }
    
    // Check for debug flag in URL
    if (typeof window !== 'undefined' && window.location && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            return 'development';
        }
    }
    
    // Default to production for safety
    return 'production';
}

/**
 * Centralized logging utility with configurable log levels and environment detection.
 * Automatically adjusts log level based on environment to prevent debug information
 * exposure in production.
 * 
 * @class Logger
 * @example
 * // Basic usage
 * import { logger } from './logger.js';
 * 
 * logger.debug('Detailed debugging info', { userId: 123 });
 * logger.info('User logged in successfully');
 * logger.warn('API rate limit approaching');
 * logger.error('Failed to connect to API', error);
 * 
 * @example
 * // Module-specific logging
 * import { logger } from './logger.js';
 * 
 * const moduleLogger = logger.child('AudioHandler');
 * moduleLogger.info('Recording started');
 * moduleLogger.error('Microphone access denied');
 */
class Logger {
    /**
     * Creates a new Logger instance
     * @param {Object} options - Logger configuration options
     * @param {number} [options.level] - Manual log level override
     * @param {string} [options.environment] - Manual environment override
     * @param {string} [options.moduleContext] - Module context for log messages
     */
    constructor(options = {}) {
        this.environment = options.environment || detectEnvironment();
        this.moduleContext = options.moduleContext || '';
        
        // Set default log level based on environment
        if (options.level !== undefined) {
            this.level = options.level;
        } else {
            this.level = this.environment === 'production' ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG;
        }
        
        // Bind methods to maintain context
        this.debug = this.debug.bind(this);
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);
    }
    
    /**
     * Creates a child logger with module context
     * @param {string} moduleContext - Module name for log message context
     * @returns {Logger} New logger instance with module context
     * @example
     * const moduleLogger = logger.child('RecordingStateMachine');
     * moduleLogger.info('State transition completed');
     */
    child(moduleContext) {
        return new Logger({
            level: this.level,
            environment: this.environment,
            moduleContext
        });
    }
    
    /**
     * Sets the current log level
     * @param {number} level - Log level from LOG_LEVELS enum
     * @example
     * logger.setLevel(LOG_LEVELS.WARN); // Only show warnings and errors
     */
    setLevel(level) {
        this.level = level;
    }
    
    /**
     * Gets the current log level
     * @returns {number} Current log level
     */
    getLevel() {
        return this.level;
    }
    
    /**
     * Checks if a log level is enabled
     * @param {number} level - Log level to check
     * @returns {boolean} True if the level is enabled
     */
    isLevelEnabled(level) {
        return level >= this.level;
    }
    
    /**
     * Formats a log message with timestamp and context
     * @private
     * @param {number} level - Log level
     * @param {string} message - Log message
     * @param {...*} args - Additional arguments
     * @returns {Array} Formatted message array for console output
     */
    _formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const levelName = LOG_LEVEL_NAMES[level];
        const context = this.moduleContext ? `[${this.moduleContext}]` : '';
        
        const prefix = `[${timestamp}] ${levelName}${context}:`;
        
        return [prefix, message, ...args];
    }
    
    /**
     * Logs a debug message (only in development)
     * @param {string} message - Debug message
     * @param {...*} args - Additional arguments to log
     * @example
     * logger.debug('Processing audio chunk', { size: chunk.length, timestamp: Date.now() });
     */
    debug(message, ...args) {
        if (this.isLevelEnabled(LOG_LEVELS.DEBUG)) {
            console.log(...this._formatMessage(LOG_LEVELS.DEBUG, message, ...args));
        }
    }
    
    /**
     * Logs an info message
     * @param {string} message - Info message
     * @param {...*} args - Additional arguments to log
     * @example
     * logger.info('User initiated recording session');
     */
    info(message, ...args) {
        if (this.isLevelEnabled(LOG_LEVELS.INFO)) {
            console.log(...this._formatMessage(LOG_LEVELS.INFO, message, ...args));
        }
    }
    
    /**
     * Logs a warning message
     * @param {string} message - Warning message
     * @param {...*} args - Additional arguments to log
     * @example
     * logger.warn('Microphone permissions not granted yet');
     */
    warn(message, ...args) {
        if (this.isLevelEnabled(LOG_LEVELS.WARN)) {
            console.warn(...this._formatMessage(LOG_LEVELS.WARN, message, ...args));
        }
    }
    
    /**
     * Logs an error message (always shown, even in production)
     * @param {string} message - Error message
     * @param {...*} args - Additional arguments to log (e.g., Error objects)
     * @example
     * logger.error('Failed to start recording', error);
     * logger.error('API request failed', { status: 500, url: '/api/transcribe' });
     */
    error(message, ...args) {
        if (this.isLevelEnabled(LOG_LEVELS.ERROR)) {
            console.error(...this._formatMessage(LOG_LEVELS.ERROR, message, ...args));
        }
    }
    
    /**
     * Logs an object or data structure for debugging
     * @param {string} label - Label for the data
     * @param {*} data - Data to log
     * @example
     * logger.logData('API Response', responseData);
     * logger.logData('User Settings', userConfig);
     */
    logData(label, data) {
        if (this.isLevelEnabled(LOG_LEVELS.DEBUG)) {
            console.group(`[${new Date().toISOString()}] DEBUG${this.moduleContext ? `[${this.moduleContext}]` : ''}: ${label}`);
            console.log(data);
            console.groupEnd();
        }
    }
}

// Create singleton logger instance
const logger = new Logger();

// Export both the Logger class and singleton instance
export { Logger, LOG_LEVELS, logger };
