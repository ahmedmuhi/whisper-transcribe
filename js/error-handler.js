/**
 * @fileoverview Centralized error handling for application-wide error reporting
 */
import { eventBus, APP_EVENTS } from './event-bus.js';
import { MESSAGES } from './constants.js';
import { logger } from './logger.js';

/**
 * Centralized error handler to emit standardized error events
 */
class ErrorHandler {
  /**
   * Handle an error by logging and emitting an ERROR_OCCURRED event
   * @param {Error} error - The error object
   * @param {Object} [context={}] - Additional context for the error
   */
  static handleError(error, context = {}) {
    const code = context.code || error.name || 'UNKNOWN_ERROR';
    const message = error.message || MESSAGES.ERROR_OCCURRED;
    logger.error(`ErrorOccurred [${code}]:`, message, context);
    eventBus.emit(APP_EVENTS.ERROR_OCCURRED, { code, message, context });
  }
}

export const errorHandler = ErrorHandler;
