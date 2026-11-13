/**
 * @fileoverview A stand-in for the AudioContext and AudioWorkletNode the
 * uncompressed capture uses, with a clock. Happy DOM has no audio worklet, so
 * tests play samples into the capture through `speak()`, which also moves the
 * clock on by the length of those samples, as real time would.
 */

import { vi } from 'vitest';

const SAMPLE_RATE = 16000;

export function installFakeWebAudio() {
    const audio = {
        contexts: [],
        nodes: [],
        addModuleError: null,
        refuseResume: false,
        now: 1000,
        /** Delivers samples the way the worklet would while the context runs. */
        speak(samples) {
            audio.now += (samples.length / SAMPLE_RATE) * 1000;
            const node = audio.nodes.at(-1);
            if (node && node.context.state === 'running' && node.source) {
                node.port.onmessage?.({ data: Float32Array.from(samples) });
            }
        },
        /** Lets time pass with nothing reaching the capture, as when it stops partway. */
        passTime(ms) {
            audio.now += ms;
        }
    };

    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => audio.now);

    globalThis.AudioContext = class FakeAudioContext {
        constructor(options) {
            this.sampleRate = options?.sampleRate;
            this.state = 'suspended';
            this.resume = vi.fn(async () => {
                if (!audio.refuseResume) this.state = 'running';
            });
            this.suspend = vi.fn(async () => {
                this.state = 'suspended';
            });
            this.audioWorklet = {
                addModule: vi.fn(async () => {
                    if (audio.addModuleError) throw audio.addModuleError;
                })
            };
            audio.contexts.push(this);
        }

        createMediaStreamSource(stream) {
            const source = {
                stream,
                connect: vi.fn((node) => { node.source = source; }),
                disconnect: vi.fn(() => {
                    for (const node of audio.nodes) if (node.source === source) node.source = null;
                })
            };
            return source;
        }
    };

    globalThis.AudioWorkletNode = class FakeAudioWorkletNode {
        constructor(context, name, options) {
            this.context = context;
            this.name = name;
            this.options = options;
            this.source = null;
            this.port = { onmessage: null };
            audio.nodes.push(this);
        }
    };

    return audio;
}

export function removeFakeWebAudio() {
    delete globalThis.AudioContext;
    delete globalThis.AudioWorkletNode;
}

/** Reads the 16-bit samples out of a mono WAV Blob. */
export async function readWav(blob) {
    const view = new DataView(await blob.arrayBuffer());
    const dataBytes = view.getUint32(40, true);
    return {
        channels: view.getUint16(22, true),
        sampleRate: view.getUint32(24, true),
        bitDepth: view.getUint16(34, true),
        samples: Array.from({ length: dataBytes / 2 }, (_, index) => view.getInt16(44 + index * 2, true))
    };
}
