/**
 * @fileoverview Real-time audio visualization controller using Web Audio API.
 * Renders an amplitude waveform timeline that scrolls right-to-left,
 * inspired by the iPhone Voice Memos visualizer.
 */
import { COLORS, ACCENT_RGB_LIGHT, ACCENT_RGB_DARK } from './constants.js';

/** Interval between amplitude samples in milliseconds */
const SAMPLE_INTERVAL_MS = 50;

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
        this.timeDomainData = new Uint8Array(this.analyser.fftSize);
        this.animationId = null;
        this.sampleTimerId = null;
        this.resizeHandler = this.updateCanvasSize.bind(this);
        this.source.connect(this.analyser);

        // Rolling amplitude history — each value 0..1
        this.amplitudeHistory = [];
        this.maxBars = 0;

        this.updateCanvasSize();
        window.addEventListener('resize', this.resizeHandler);
    }

    /**
     * Adjust canvas dimensions to match parent container size
     * and recalculate how many bars fit.
     * @method updateCanvasSize
     * @returns {void}
     */
    updateCanvasSize() {
        this.canvas.width = this.canvas.parentElement.offsetWidth;
        this.canvas.height = this.canvas.parentElement.offsetHeight;
        // Bar width (3px) + gap (2px) = 5px per slot
        this.maxBars = Math.floor(this.canvas.width / 5);
    }

    /**
     * Compute RMS amplitude from the current time-domain audio data.
     * @private
     * @returns {number} Amplitude in range 0..1
     */
    _sampleAmplitude() {
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        let sumSquares = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const normalized = (this.timeDomainData[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        return Math.sqrt(sumSquares / this.timeDomainData.length);
    }

    /**
     * Begin audio visualization.
     * Samples amplitude at regular intervals into a rolling buffer
     * and renders the waveform timeline every animation frame.
     * @method start
     * @returns {void}
     */
    start() {
        const [baseR, baseG, baseB] = this.isDarkTheme ? ACCENT_RGB_DARK : ACCENT_RGB_LIGHT;
        const bgColor = this.isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;

        // Sample amplitude into history at fixed intervals
        this.sampleTimerId = setInterval(() => {
            const amplitude = this._sampleAmplitude();
            this.amplitudeHistory.push(amplitude);
            if (this.amplitudeHistory.length > this.maxBars) {
                this.amplitudeHistory.shift();
            }
        }, SAMPLE_INTERVAL_MS);

        const barWidth = 3;
        const gap = 2;
        const minBarHeight = 3;

        const draw = () => {
            this.animationId = requestAnimationFrame(draw);

            this.canvasCtx.fillStyle = bgColor;
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const centerY = this.canvas.height / 2;
            const maxHalfHeight = (this.canvas.height / 2) * 0.85;
            const totalBars = this.amplitudeHistory.length;

            // Draw bars right-to-left: newest on the right
            for (let i = 0; i < totalBars; i++) {
                const amplitude = this.amplitudeHistory[i];
                const barIndex = totalBars - 1 - i;
                const x = this.canvas.width - (barIndex + 1) * (barWidth + gap);

                if (x + barWidth < 0) continue;

                const halfHeight = Math.max(minBarHeight, amplitude * maxHalfHeight);

                // Opacity fades on the left edge
                const fadeZone = this.canvas.width * 0.2;
                let alpha;
                if (x < fadeZone) {
                    alpha = 0.3 + (x / fadeZone) * 0.7;
                } else {
                    alpha = amplitude < 0.05 ? 0.6 : 0.5 + (amplitude * 0.5);
                }

                const intensity = amplitude;
                const r = Math.max(0, Math.min(255, Math.round(baseR + (intensity * 30))));
                const g = Math.max(0, Math.min(255, Math.round(baseG + (intensity * 20))));
                const b = Math.max(0, Math.min(255, Math.round(baseB - (intensity * 15))));

                this.canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

                // Draw bar extending up and down from center
                const radius = Math.min(barWidth / 2, halfHeight);
                const topY = centerY - halfHeight;
                const bottomY = centerY + halfHeight;
                this.canvasCtx.beginPath();
                this.canvasCtx.moveTo(x + radius, topY);
                this.canvasCtx.lineTo(x + barWidth - radius, topY);
                this.canvasCtx.quadraticCurveTo(x + barWidth, topY, x + barWidth, topY + radius);
                this.canvasCtx.lineTo(x + barWidth, bottomY - radius);
                this.canvasCtx.quadraticCurveTo(x + barWidth, bottomY, x + barWidth - radius, bottomY);
                this.canvasCtx.lineTo(x + radius, bottomY);
                this.canvasCtx.quadraticCurveTo(x, bottomY, x, bottomY - radius);
                this.canvasCtx.lineTo(x, topY + radius);
                this.canvasCtx.quadraticCurveTo(x, topY, x + radius, topY);
                this.canvasCtx.closePath();
                this.canvasCtx.fill();
            }
        };
        draw();
    }

    /**
     * Stop visualization loop and clean up all resources.
     * @method stop
     * @returns {void}
     */
    stop() {
        if (this.sampleTimerId) {
            clearInterval(this.sampleTimerId);
            this.sampleTimerId = null;
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        window.removeEventListener('resize', this.resizeHandler);
        if (this.source) {
            try { this.source.disconnect(); } catch { /* already disconnected */ }
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch { /* already closed */ }
        }
        this.amplitudeHistory = [];
        this.canvasCtx.fillStyle = this.isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;
        this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
