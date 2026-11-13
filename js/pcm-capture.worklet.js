/**
 * @fileoverview AudioWorklet processor for the uncompressed capture. Copies the
 * first (downmixed) channel of each render quantum to the main thread.
 * Loaded by js/pcm-capture.js as a same-origin file emitted by the build.
 */

registerProcessor('pcm-capture', class extends AudioWorkletProcessor {
    process([input]) {
        if (input[0]) this.port.postMessage(input[0].slice());
        return true;
    }
});
