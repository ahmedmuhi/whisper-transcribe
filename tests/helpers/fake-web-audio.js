/**
 * @fileoverview A stand-in for the AudioContext and AudioWorkletNode the
 * uncompressed capture uses. Happy DOM has no audio worklet, so tests play
 * samples into the capture through `speak()`.
 */

import { vi } from 'vitest';

export function installFakeWebAudio() {
    const audio = {
        contexts: [],
        nodes: [],
        addModuleError: null,
        /** Delivers samples the way the worklet would, while the context is open. */
        speak(samples) {
            const node = audio.nodes.at(-1);
            if (node && node.context.state !== 'closed') {
                node.port.onmessage?.({ data: Float32Array.from(samples) });
            }
        }
    };

    globalThis.AudioContext = class FakeAudioContext {
        constructor(options) {
            this.sampleRate = options?.sampleRate;
            this.state = 'running';
            this.close = vi.fn(async () => {
                this.state = 'closed';
            });
            this.audioWorklet = {
                addModule: vi.fn(async () => {
                    if (audio.addModuleError) throw audio.addModuleError;
                })
            };
            audio.contexts.push(this);
        }

        createMediaStreamSource(stream) {
            return { connect: vi.fn((node) => { node.stream = stream; }) };
        }
    };

    globalThis.AudioWorkletNode = class FakeAudioWorkletNode {
        constructor(context, name, options) {
            this.context = context;
            this.name = name;
            this.options = options;
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
