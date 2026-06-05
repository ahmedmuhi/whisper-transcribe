/**
 * @fileoverview Pure PCM-to-WAV encoding helpers with no WebAudio dependency.
 * Shared between the main-thread synchronous fallback and the off-thread
 * Web Worker (js/audio-converter.worker.js). Keeping these functions free of
 * OfflineAudioContext/decodeAudioData lets them run inside a Worker, where
 * WebAudio is unavailable.
 */

const NUM_CHANNELS = 1;

/**
 * Encodes raw PCM float samples into a WAV file ArrayBuffer.
 *
 * @param {Float32Array} samples - Mono PCM samples in [-1, 1] range
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} bitDepth - Bits per sample (16)
 * @returns {ArrayBuffer} Complete WAV file as ArrayBuffer
 */
export function encodeWav(samples, sampleRate, bitDepth) {
    const bytesPerSample = bitDepth / 8;
    const dataSize = samples.length * bytesPerSample;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);                          // chunk size
    view.setUint16(20, 1, true);                            // PCM format
    view.setUint16(22, NUM_CHANNELS, true);                 // channels
    view.setUint32(24, sampleRate, true);                   // sample rate
    view.setUint32(28, sampleRate * NUM_CHANNELS * bytesPerSample, true); // byte rate
    view.setUint16(32, NUM_CHANNELS * bytesPerSample, true); // block align
    view.setUint16(34, bitDepth, true);                     // bits per sample

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM samples (convert float [-1,1] to int16)
    let offset = headerSize;
    for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += bytesPerSample;
    }

    return buffer;
}

/**
 * Writes an ASCII string into a DataView at the given offset.
 *
 * @param {DataView} view - Target DataView
 * @param {number} offset - Byte offset to write at
 * @param {string} str - ASCII string to write
 */
function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
