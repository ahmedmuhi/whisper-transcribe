/**
 * @fileoverview Real-time audio visualization controller using Web Audio API
 * Renders blue-toned frequency bars with rounded caps
 */
import { COLORS, ACCENT_RGB_LIGHT, ACCENT_RGB_DARK } from './constants.js';
export class VisualizationController {
    constructor(stream, canvas, isDarkTheme) {
        this.stream = stream;
        this.canvas = canvas;
        this.isDarkTheme = isDarkTheme;
        this.canvasCtx = canvas.getContext('2d');
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.source = this.audioContext.createMediaStreamSource(stream);
        this.analyser.fftSize = 256;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.animationId = null;
        this.resizeHandler = this.updateCanvasSize.bind(this);
        this.source.connect(this.analyser);
        this.updateCanvasSize();
        window.addEventListener('resize', this.resizeHandler);
    }

    /**
     * Adjust canvas dimensions to match parent container size.
     * @method updateCanvasSize
     * @returns {void}
     */
    updateCanvasSize() {
        this.canvas.width = this.canvas.parentElement.offsetWidth;
        this.canvas.height = this.canvas.parentElement.offsetHeight;
    }

    /**
     * Begin audio visualization rendering loop.
     * Draws blue-gradient frequency bars with rounded caps.
     * @method start
     * @returns {void}
     */
    start() {
        const [baseR, baseG, baseB] = this.isDarkTheme ? ACCENT_RGB_DARK : ACCENT_RGB_LIGHT;

        const draw = () => {
            this.animationId = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(this.dataArray);

            this.canvasCtx.fillStyle = this.isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const barWidth = (this.canvas.width / this.bufferLength) * 2.5;
            const gap = 1.5;
            const barRadius = barWidth / 2;
            let x = 0;

            for (let i = 0; i < this.bufferLength; i++) {
                const barHeight = (this.dataArray[i] / 255) * this.canvas.height * 0.85;

                if (barHeight > 1) {
                    const intensity = this.dataArray[i] / 255;
                    const r = Math.min(255, Math.round(baseR + (intensity * 30)));
                    const g = Math.min(255, Math.round(baseG + (intensity * 20)));
                    const b = Math.max(0, Math.round(baseB - (intensity * 15)));
                    const alpha = 0.5 + (intensity * 0.5);

                    this.canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

                    const y = this.canvas.height - barHeight;
                    this.canvasCtx.beginPath();
                    this.canvasCtx.moveTo(x + barRadius, y);
                    this.canvasCtx.lineTo(x + barWidth - barRadius, y);
                    this.canvasCtx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + barRadius);
                    this.canvasCtx.lineTo(x + barWidth, this.canvas.height);
                    this.canvasCtx.lineTo(x, this.canvas.height);
                    this.canvasCtx.lineTo(x, y + barRadius);
                    this.canvasCtx.quadraticCurveTo(x, y, x + barRadius, y);
                    this.canvasCtx.closePath();
                    this.canvasCtx.fill();
                }

                x += barWidth + gap;
            }
        };
        draw();
    }

    /**
     * Stop visualization loop and clean up audio context and event listeners.
     * @method stop
     * @returns {void}
     */
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        window.removeEventListener('resize', this.resizeHandler);
        if (this.source) {
            try { this.source.disconnect(); } catch { /* already disconnected */ }
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch { /* already closed */ }
        }
        this.canvasCtx.fillStyle = this.isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
        this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
