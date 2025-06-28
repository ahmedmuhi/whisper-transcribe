import { COLORS } from './constants.js';

export function showTemporaryStatus(element, message, type = 'info', duration = 3000) {
    element.textContent = message;

    const colors = {
        error: COLORS.ERROR,
        success: COLORS.SUCCESS,
        info: ''
    };

    element.style.color = colors[type] || '';

    if (duration > 0) {
        setTimeout(() => {
            element.textContent = '🎙️ Click the microphone to start recording';
            element.style.color = '';
        }, duration);
    }
}
