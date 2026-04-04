/**
 * @fileoverview Converts audio blobs to WAV format using browser-native AudioContext.
 * Used for MAI-Transcribe which requires WAV/MP3/FLAC (rejects WebM/Opus).
 */

const TARGET_SAMPLE_RATE = 16000;
const BIT_DEPTH = 16;
const NUM_CHANNELS = 1;

/**
 * Converts an audio Blob (e.g. WebM/Opus) to a 16kHz mono 16-bit WAV Blob.
 *
 * @param {Blob} audioBlob - Source audio blob in any browser-decodable format
 * @returns {Promise<Blob>} WAV-encoded audio blob
 */
export async function convertToWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    // length=1 is a placeholder — decodeAudioData ignores the context's buffer length
    const audioContext = new OfflineAudioContext(NUM_CHANNELS, 1, TARGET_SAMPLE_RATE);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const resampledBuffer = await resampleAudio(audioBuffer, TARGET_SAMPLE_RATE);
    const monoSamples = downmixToMono(resampledBuffer);
    const wavBuffer = encodeWav(monoSamples, TARGET_SAMPLE_RATE, BIT_DEPTH);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Resamples an AudioBuffer to the target sample rate using OfflineAudioContext.
 *
 * @param {AudioBuffer} audioBuffer - Source audio buffer
 * @param {number} targetRate - Desired sample rate in Hz
 * @returns {Promise<AudioBuffer>} Resampled audio buffer
 */
async function resampleAudio(audioBuffer, targetRate) {
    if (audioBuffer.sampleRate === targetRate) {
        return audioBuffer;
    }

    const duration = audioBuffer.duration;
    const targetLength = Math.ceil(duration * targetRate);
    const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        targetLength,
        targetRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    return offlineCtx.startRendering();
}

/**
 * Downmixes a multi-channel AudioBuffer to a single mono Float32Array.
 *
 * @param {AudioBuffer} audioBuffer - Source audio buffer (any channel count)
 * @returns {Float32Array} Mono audio samples
 */
function downmixToMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
        return audioBuffer.getChannelData(0);
    }

    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    const channelCount = audioBuffer.numberOfChannels;

    for (let ch = 0; ch < channelCount; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            mono[i] += channelData[i] / channelCount;
        }
    }

    return mono;
}

/**
 * Encodes raw PCM float samples into a WAV file ArrayBuffer.
 *
 * @param {Float32Array} samples - Mono PCM samples in [-1, 1] range
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} bitDepth - Bits per sample (16)
 * @returns {ArrayBuffer} Complete WAV file as ArrayBuffer
 */
function encodeWav(samples, sampleRate, bitDepth) {
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
