/**
 * @fileoverview Helper functions for displaying temporary status messages
 */
import { DEFAULT_RESET_STATUS } from './constants.js';

/**
 * Clears the status type modifier classes so the base (AA-safe) colour returns.
 * @param {HTMLElement} element
 */
function clearStatusType(element) {
    if (element.classList) {
        element.classList.remove('status--error', 'status--success');
    }
}

/**
 * Display a temporary status message in a DOM element and optionally reset it.
 *
 * Colour comes from AA-compliant CSS tokens via type modifier classes
 * (`.status--error` / `.status--success`) — not inline hex — so error/success
 * text meets WCAG-AA contrast in both themes.
 *
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

    clearStatusType(element);
    if ((type === 'error' || type === 'success') && element.classList) {
        element.classList.add(`status--${type}`);
    }
    // Drop any stale inline colour from earlier inline-styled status writes.
    element.style.color = '';

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
                clearStatusType(element);
                element.style.color = '';
            }
            element._statusTimeout = null;
        }, duration);
    }
}
