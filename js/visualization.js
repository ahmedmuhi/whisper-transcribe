// js/visualization.js
import { COLORS } from './constants.js';

/**
 * VisualizationController handles real-time audio visualization on a canvas.
 * Usage:
 *   const controller = new VisualizationController(stream, canvas, isDarkTheme);
 *   controller.start();
 *   controller.stop();
 */
/**
 * Handles real-time audio visualization on a canvas element using Web Audio API.
 * @module VisualizationController
 */
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
     * @method start
     * @returns {void}
     */
    start() {
        const draw = () => {
            this.animationId = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(this.dataArray);
            this.canvasCtx.fillStyle = this.isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            const barWidth = (this.canvas.width / this.bufferLength) * 2.5;
            let x = 0;
            for (let i = 0; i < this.bufferLength; i++) {
                const barHeight = (this.dataArray[i] / 255) * this.canvas.height * 0.8;
                const hue = (i / this.bufferLength) * 360;
                this.canvasCtx.fillStyle = `hsl(${hue}, 70%, 60%)`;
                this.canvasCtx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
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
        // Clear the canvas
        this.canvasCtx.fillStyle = this.isDarkTheme ? COLORS.DARK_BG : COLORS.LIGHT_BG;
        this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
