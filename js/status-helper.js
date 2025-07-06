/**
 * @fileoverview Helper functions for displaying temporary status messages
 */
import { COLORS, DEFAULT_RESET_STATUS } from './constants.js';

/**
 * Display a temporary status message in a DOM element and optionally reset it.
 * @param {HTMLElement} element - The target element for status messages
 * @param {string} message - Status text to display
 * @param {('info'|'success'|'error')} [type='info'] - Message type for color coding
 * @param {number} [duration=3000] - Time in ms before resetting message
 * @param {string} [resetMessage] - Text to display after timeout
 */
export function showTemporaryStatus(
    element,
    message,
    type = 'info',
    duration = 3000,
    resetMessage = DEFAULT_RESET_STATUS
) {
    element.textContent = message;

    const colors = {
        error: COLORS.ERROR,
        success: COLORS.SUCCESS,
        info: ''
    };

    element.style.color = colors[type] || '';

    // Clear any existing timeout on the element
    if (element._statusTimeout) {
        clearTimeout(element._statusTimeout);
        element._statusTimeout = null;
    }

    if (duration > 0) {
        const originalMessage = message;
        element._statusTimeout = setTimeout(() => {
            // Only reset if the message has not been changed meanwhile
            if (element.textContent === originalMessage) {
                element.textContent = resetMessage;
                element.style.color = '';
            }
            element._statusTimeout = null;
        }, duration);
    }
}
