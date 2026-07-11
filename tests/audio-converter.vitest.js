/**
 * @fileoverview Tests for audio-converter.js WebM-to-WAV conversion.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

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

describe('Audio Converter — Web Worker offload', () => {
    const originalWorker = global.Worker;

    afterAll(() => {
        if (originalWorker === undefined) {
            delete global.Worker;
        } else {
            global.Worker = originalWorker;
        }
    });

    afterEach(() => {
        if (originalWorker === undefined) {
            delete global.Worker;
        } else {
            global.Worker = originalWorker;
        }
    });

    /**
     * Imports a fresh copy of the module so its lazily-constructed worker state
     * does not leak between the worker/fallback scenarios.
     */
    async function freshConvertToWav(audioBuffer = createMockAudioBuffer(16000, 1, 16000)) {
        vi.resetModules();
        mockDecodeAudioData.mockResolvedValue(audioBuffer);
        mockStartRendering.mockResolvedValue(audioBuffer);
        const mod = await import('../js/audio-converter.js');
        return mod.convertToWav;
    }

    it('should delegate the encode to the Worker and round-trip the WAV bytes', async () => {
        let postedMessage = null;
        let postedTransfer = null;
        const listeners = { message: [], error: [] };
        const workerInstances = [];

        // A fake Worker that, on postMessage, synthesises a valid WAV ArrayBuffer
        // from the received samples and delivers it via the 'message' listener.
        global.Worker = vi.fn().mockImplementation(function FakeWorker() {
            workerInstances.push(this);
            this.addEventListener = (type, fn) => listeners[type].push(fn);
            this.removeEventListener = (type, fn) => {
                listeners[type] = listeners[type].filter(l => l !== fn);
            };
            this.postMessage = (data, transfer) => {
                postedMessage = data;
                postedTransfer = transfer;
                const { requestId, samples, sampleRate, bitDepth } = data;
                // Mirror the worker's encode using the same byte layout the
                // synchronous fallback produces.
                const bytesPerSample = bitDepth / 8;
                const wav = new ArrayBuffer(44 + samples.length * bytesPerSample);
                const view = new DataView(wav);
                const write = (off, str) => {
                    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
                };
                write(0, 'RIFF');
                view.setUint32(4, 36 + samples.length * bytesPerSample, true);
                write(8, 'WAVE');
                write(12, 'fmt ');
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true);
                view.setUint16(22, 1, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, sampleRate * bytesPerSample, true);
                view.setUint16(32, bytesPerSample, true);
                view.setUint16(34, bitDepth, true);
                write(36, 'data');
                view.setUint32(40, samples.length * bytesPerSample, true);
                let offset = 44;
                for (let i = 0; i < samples.length; i++) {
                    const clamped = Math.max(-1, Math.min(1, samples[i]));
                    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
                    view.setInt16(offset, int16, true);
                    offset += bytesPerSample;
                }
                // Deliver asynchronously, mimicking a real worker message.
                Promise.resolve().then(() => {
                    for (const fn of listeners.message) fn({ data: { requestId, wavBuffer: wav } });
                });
            };
            this.terminate = vi.fn();
        });

        const monoBuffer = createMockAudioBuffer(16000, 1, 16000);
        const convert = await freshConvertToWav(monoBuffer);
        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convert(inputBlob);
        const arrayBuffer = await result.arrayBuffer();
        const view = new DataView(arrayBuffer);

        // The Worker was constructed and received the encode work.
        expect(global.Worker).toHaveBeenCalledTimes(1);
        expect(workerInstances).toHaveLength(1);
        expect(postedMessage).not.toBeNull();
        expect(postedMessage.requestId).toEqual(expect.any(Number));
        expect(postedMessage.sampleRate).toBe(16000);
        expect(postedMessage.bitDepth).toBe(16);
        expect(postedMessage.samples).toBeInstanceOf(Float32Array);
        expect(postedMessage.samples).not.toBe(monoBuffer.getChannelData(0));
        // The samples buffer is handed over as a Transferable.
        expect(postedTransfer).toEqual([postedMessage.samples.buffer]);

        // The bytes round-trip into a valid WAV the caller can use.
        expect(result.type).toBe('audio/wav');
        expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
        expect(arrayBuffer.byteLength).toBe(44 + 16000 * 2);
    });

    it('transfers an owned stereo downmix without a second full-length Float32Array allocation', async () => {
        const stereoBuffer = createMockAudioBuffer(16000, 2, 32);
        const NativeFloat32Array = global.Float32Array;
        const fullLengthAllocations = [];
        let postedSamples = null;
        const listeners = { message: [], error: [] };

        global.Worker = vi.fn().mockImplementation(function FakeWorker() {
            this.addEventListener = (type, fn) => listeners[type].push(fn);
            this.removeEventListener = (type, fn) => {
                listeners[type] = listeners[type].filter(l => l !== fn);
            };
            this.postMessage = (data) => {
                postedSamples = data.samples;
                const wavBuffer = new ArrayBuffer(44 + data.samples.length * 2);
                Promise.resolve().then(() => {
                    for (const fn of listeners.message) {
                        fn({ data: { requestId: data.requestId, wavBuffer } });
                    }
                });
            };
        });

        global.Float32Array = new Proxy(NativeFloat32Array, {
            construct(target, args) {
                const allocation = Reflect.construct(target, args);
                if (allocation.length === stereoBuffer.length) {
                    fullLengthAllocations.push(allocation);
                }
                return allocation;
            }
        });

        try {
            const convert = await freshConvertToWav(stereoBuffer);
            await convert(new Blob(['stereo'], { type: 'audio/webm' }));

            expect(fullLengthAllocations).toHaveLength(1);
            expect(postedSamples).toBe(fullLengthAllocations[0]);
        } finally {
            global.Float32Array = NativeFloat32Array;
        }
    });

    it('should correlate overlapping Worker responses to the matching conversion', async () => {
        const listeners = { message: [], error: [] };
        const postedMessages = [];

        global.Worker = vi.fn().mockImplementation(function FakeWorker() {
            this.addEventListener = (type, fn) => listeners[type].push(fn);
            this.removeEventListener = (type, fn) => {
                listeners[type] = listeners[type].filter(l => l !== fn);
            };
            this.postMessage = (data) => {
                postedMessages.push(data);
            };
        });

        const firstBuffer = createMockAudioBuffer(16000, 1, 1000);
        const secondBuffer = createMockAudioBuffer(16000, 1, 2000);
        mockDecodeAudioData
            .mockResolvedValueOnce(firstBuffer)
            .mockResolvedValueOnce(secondBuffer);

        const convert = await freshConvertToWav();
        const first = convert(new Blob(['first'], { type: 'audio/webm' }));
        const second = convert(new Blob(['second'], { type: 'audio/webm' }));

        for (let i = 0; i < 10 && postedMessages.length < 2; i++) {
            await Promise.resolve();
        }
        expect(postedMessages).toHaveLength(2);

        const sendResponse = (message) => {
            const wavBuffer = new ArrayBuffer(44 + message.samples.length * 2);
            for (const fn of [...listeners.message]) {
                fn({ data: { requestId: message.requestId, wavBuffer } });
            }
        };

        // Resolve in reverse order; each promise must receive its own response.
        sendResponse(postedMessages[1]);
        sendResponse(postedMessages[0]);

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect((await firstResult.arrayBuffer()).byteLength).toBe(44 + 1000 * 2);
        expect((await secondResult.arrayBuffer()).byteLength).toBe(44 + 2000 * 2);
    });

    it('should disable the cached Worker after a runtime failure', async () => {
        const listeners = { message: [], error: [] };
        const terminate = vi.fn();
        let postCount = 0;
        const sampleCount = 32;
        const stereoBuffer = createMockAudioBuffer(16000, 2, sampleCount);

        global.Worker = vi.fn().mockImplementation(function FakeWorker() {
            this.addEventListener = (type, fn) => listeners[type].push(fn);
            this.removeEventListener = (type, fn) => {
                listeners[type] = listeners[type].filter(l => l !== fn);
            };
            this.postMessage = (data, transfer) => {
                postCount++;
                structuredClone(data, { transfer });
                Promise.resolve().then(() => {
                    for (const fn of [...listeners.error]) {
                        fn({ error: new Error('module worker failed') });
                    }
                });
            };
            this.terminate = terminate;
        });

        const convert = await freshConvertToWav(stereoBuffer);
        const first = await convert(new Blob(['first'], { type: 'audio/webm' }));
        const second = await convert(new Blob(['second'], { type: 'audio/webm' }));

        expect(first.type).toBe('audio/wav');
        expect(second.type).toBe('audio/wav');
        expect((await first.arrayBuffer()).byteLength).toBe(44 + sampleCount * 2);
        expect((await second.arrayBuffer()).byteLength).toBe(44 + sampleCount * 2);
        expect(global.Worker).toHaveBeenCalledTimes(1);
        expect(terminate).toHaveBeenCalledTimes(1);
        expect(postCount).toBe(1);
    });

    it('should fall back to the synchronous encode when Worker construction throws', async () => {
        global.Worker = vi.fn().mockImplementation(() => {
            throw new Error('Worker unavailable');
        });

        const convert = await freshConvertToWav();
        const inputBlob = new Blob(['fake-audio'], { type: 'audio/webm' });
        const result = await convert(inputBlob);
        const arrayBuffer = await result.arrayBuffer();
        const view = new DataView(arrayBuffer);

        // Construction was attempted but the encode still succeeded on-thread.
        expect(global.Worker).toHaveBeenCalled();
        expect(result.type).toBe('audio/wav');
        expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
        expect(view.getUint32(24, true)).toBe(16000); // sample rate
        expect(view.getUint16(34, true)).toBe(16);    // bit depth
        expect(arrayBuffer.byteLength).toBe(44 + 16000 * 2);
    });
});
