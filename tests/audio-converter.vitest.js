/**
 * @fileoverview Tests for audio-converter.js WebM-to-WAV conversion.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock OfflineAudioContext and decodeAudioData
function createMockAudioBuffer(sampleRate = 48000, channels = 1, length = 4800) {
    const channelData = [];
    for (let ch = 0; ch < channels; ch++) {
        const data = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            data[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
        }
        channelData.push(data);
    }

    return {
        sampleRate,
        numberOfChannels: channels,
        length,
        duration: length / sampleRate,
        getChannelData: (ch) => channelData[ch]
    };
}

const mockStartRendering = vi.fn();
const mockDecodeAudioData = vi.fn();
const mockConnect = vi.fn();
const mockStart = vi.fn();

const originalOfflineAudioContext = global.OfflineAudioContext;

global.OfflineAudioContext = vi.fn().mockImplementation((channels, length, sampleRate) => ({
    decodeAudioData: mockDecodeAudioData,
    createBufferSource: () => ({
        buffer: null,
        connect: mockConnect,
        start: mockStart
    }),
    destination: {},
    startRendering: mockStartRendering
}));

let convertToWav;

afterAll(() => {
    global.OfflineAudioContext = originalOfflineAudioContext;
});

beforeEach(async () => {
    vi.clearAllMocks();

    // Default: decodeAudioData returns a 16kHz mono buffer (no resample needed)
    const defaultBuffer = createMockAudioBuffer(16000, 1, 16000);
    mockDecodeAudioData.mockResolvedValue(defaultBuffer);
    mockStartRendering.mockResolvedValue(defaultBuffer);

    // Dynamic import to pick up mocks
    const mod = await import('../js/audio-converter.js');
    convertToWav = mod.convertToWav;
});

describe('Audio Converter — convertToWav', () => {
    it('should return a Blob with audio/wav MIME type', async () => {
        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convertToWav(inputBlob);

        expect(result).toBeInstanceOf(Blob);
        expect(result.type).toBe('audio/wav');
    });

    it('should produce a valid WAV header', async () => {
        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convertToWav(inputBlob);
        const buffer = await result.arrayBuffer();
        const view = new DataView(buffer);

        // RIFF header
        expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
        expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');

        // fmt chunk
        expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))).toBe('fmt ');
        expect(view.getUint16(20, true)).toBe(1);       // PCM format
        expect(view.getUint16(22, true)).toBe(1);       // mono
        expect(view.getUint32(24, true)).toBe(16000);   // sample rate
        expect(view.getUint16(34, true)).toBe(16);      // bit depth

        // data chunk
        expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))).toBe('data');
    });

    it('should produce correct file size for given sample count', async () => {
        const sampleCount = 16000; // 1 second at 16kHz
        const buffer = createMockAudioBuffer(16000, 1, sampleCount);
        mockDecodeAudioData.mockResolvedValue(buffer);

        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convertToWav(inputBlob);
        const arrayBuffer = await result.arrayBuffer();

        // 44 byte header + (16000 samples * 2 bytes per sample)
        expect(arrayBuffer.byteLength).toBe(44 + sampleCount * 2);
    });

    it('should trigger resampling when source rate differs from 16kHz', async () => {
        const buffer48k = createMockAudioBuffer(48000, 1, 48000);
        const resampledBuffer = createMockAudioBuffer(16000, 1, 16000);
        mockDecodeAudioData.mockResolvedValue(buffer48k);
        mockStartRendering.mockResolvedValue(resampledBuffer);

        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convertToWav(inputBlob);

        // OfflineAudioContext should be called twice: once for decode, once for resample
        expect(global.OfflineAudioContext).toHaveBeenCalledTimes(2);
        expect(result.type).toBe('audio/wav');
    });

    it('should skip resampling when source is already 16kHz', async () => {
        const buffer16k = createMockAudioBuffer(16000, 1, 16000);
        mockDecodeAudioData.mockResolvedValue(buffer16k);

        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        await convertToWav(inputBlob);

        // Only one OfflineAudioContext for the initial decode
        expect(global.OfflineAudioContext).toHaveBeenCalledTimes(1);
    });

    it('should downmix stereo to mono', async () => {
        const stereoBuffer = createMockAudioBuffer(16000, 2, 16000);
        mockDecodeAudioData.mockResolvedValue(stereoBuffer);

        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convertToWav(inputBlob);
        const arrayBuffer = await result.arrayBuffer();
        const view = new DataView(arrayBuffer);

        // Output should still be mono
        expect(view.getUint16(22, true)).toBe(1);
        // Size: 44 header + 16000 samples * 2 bytes
        expect(arrayBuffer.byteLength).toBe(44 + 16000 * 2);
    });

    it('should clamp samples to [-1, 1] range', async () => {
        // Create buffer with out-of-range samples
        const buffer = createMockAudioBuffer(16000, 1, 4);
        const data = buffer.getChannelData(0);
        data[0] = -2.0;  // below -1
        data[1] = 2.0;   // above 1
        data[2] = 0.0;   // zero
        data[3] = -1.0;  // exact -1
        mockDecodeAudioData.mockResolvedValue(buffer);

        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convertToWav(inputBlob);
        const arrayBuffer = await result.arrayBuffer();
        const view = new DataView(arrayBuffer);

        // Check clamped int16 values at data offset (44)
        expect(view.getInt16(44, true)).toBe(-32768);  // clamped -1 → -0x8000
        expect(view.getInt16(46, true)).toBe(32767);   // clamped 1 → 0x7FFF
        expect(view.getInt16(48, true)).toBe(0);       // 0 → 0
        expect(view.getInt16(50, true)).toBe(-32768);  // -1 → -0x8000
    });

    it('should reject when decodeAudioData fails (corrupt/unsupported source)', async () => {
        mockDecodeAudioData.mockRejectedValue(new DOMException('Unable to decode audio data'));

        const inputBlob = new Blob(['corrupt-data'], { type: 'audio/webm' });
        await expect(convertToWav(inputBlob)).rejects.toThrow('Unable to decode audio data');
    });
});
