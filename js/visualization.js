/**
 * @fileoverview Real-time audio visualization controller using Web Audio API.
 * Renders an amplitude waveform timeline that scrolls right-to-left,
 * inspired by the iPhone Voice Memos visualizer.
 */
import { COLORS } from './constants.js';

/** Saturated visualizer colors — punchier than the UI accent */
const VIZ_RGB_LIGHT = [60, 80, 255];    // vivid blue
const VIZ_RGB_DARK  = [90, 120, 255];   // bright blue

/** Interval between amplitude samples in milliseconds */
const SAMPLE_INTERVAL_MS = 100;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_SLOT = BAR_WIDTH + BAR_GAP;
const MIN_BAR_HEIGHT = 3;
const FADE_ZONE_FRACTION = 0.2;
const FADE_MIN_ALPHA = 0.3;
/** RMS amplification — raw mic RMS is typically 0.01-0.05 for speech */
const AMPLITUDE_SCALE = 15;
const IDLE_ALPHA = 0.28;
const ACTIVE_ALPHA_RANGE = 0.72;

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
        this.maxBars = Math.floor(this.canvas.width / BAR_SLOT);
        // Trim history if canvas shrunk so waveform stays current
        if (this.amplitudeHistory.length > this.maxBars) {
            this.amplitudeHistory.splice(0, this.amplitudeHistory.length - this.maxBars);
        }
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
        const rms = Math.sqrt(sumSquares / this.timeDomainData.length);
        return Math.min(1, rms * AMPLITUDE_SCALE);
    }

    /**
     * Begin audio visualization.
     * Samples amplitude at regular intervals into a rolling buffer
     * and renders the waveform timeline every animation frame.
     * @method start
     * @returns {void}
     */
    start() {
        const [baseR, baseG, baseB] = this.isDarkTheme ? VIZ_RGB_DARK : VIZ_RGB_LIGHT;
        const bgColor = this.isDarkTheme ? COLORS.CANVAS_DARK_BG : COLORS.CANVAS_LIGHT_BG;

        // Pre-fill with silent dots so the screen looks ready immediately
        this.amplitudeHistory = new Array(this.maxBars).fill(0);

        this.sampleTimerId = setInterval(() => {
            const amplitude = this._sampleAmplitude();
            this.amplitudeHistory.push(amplitude);
            if (this.amplitudeHistory.length > this.maxBars) {
                this.amplitudeHistory.shift();
            }
        }, SAMPLE_INTERVAL_MS);

        const draw = () => {
            this.animationId = requestAnimationFrame(draw);

            this.canvasCtx.fillStyle = bgColor;
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const centerY = this.canvas.height / 2;
            const maxHalfHeight = (this.canvas.height / 2) * 0.85;
            const fadeZone = this.canvas.width * FADE_ZONE_FRACTION;
            const totalBars = this.amplitudeHistory.length;

            // Newest bar on the right, oldest scrolls left
            for (let i = 0; i < totalBars; i++) {
                const amplitude = this.amplitudeHistory[i];
                const barIndex = totalBars - 1 - i;
                const x = this.canvas.width - (barIndex + 1) * BAR_SLOT;

                if (x + BAR_WIDTH < 0) continue;

                const halfHeight = Math.max(MIN_BAR_HEIGHT, amplitude * maxHalfHeight);

                // Keep idle dots connected while making spoken bars pop quickly.
                let alpha = IDLE_ALPHA + Math.pow(amplitude, 0.35) * ACTIVE_ALPHA_RANGE;
                // Left-edge fade
                if (x < fadeZone) {
                    alpha *= FADE_MIN_ALPHA + (x / fadeZone) * (1 - FADE_MIN_ALPHA);
                }

                const r = Math.max(0, Math.min(255, Math.round(baseR + (amplitude * 85))));
                const g = Math.max(0, Math.min(255, Math.round(baseG + (amplitude * 35))));
                const b = Math.max(0, Math.min(255, Math.round(baseB - (amplitude * 55))));

                this.canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

                const radius = Math.min(BAR_WIDTH / 2, halfHeight);
                const topY = centerY - halfHeight;
                const barHeight = halfHeight * 2;
                this.canvasCtx.beginPath();
                if (this.canvasCtx.roundRect) {
                    this.canvasCtx.roundRect(x, topY, BAR_WIDTH, barHeight, radius);
                } else {
                    this.canvasCtx.rect(x, topY, BAR_WIDTH, barHeight);
                }
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
