/**
 * @fileoverview Generates deterministic browser-test audio artifacts.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactsDirectory = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '.artifacts'
);
const fixturePath = path.join(artifactsDirectory, 'fake-microphone.wav');

export default async function globalSetup() {
    const sampleRate = 48_000;
    const durationSeconds = 3;
    const sampleCount = sampleRate * durationSeconds;
    const bytesPerSample = 2;
    const dataSize = sampleCount * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    for (let index = 0; index < sampleCount; index++) {
        const sample = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.3;
        view.setInt16(44 + index * bytesPerSample, sample * 0x7FFF, true);
    }

    mkdirSync(artifactsDirectory, { recursive: true });
    writeFileSync(fixturePath, Buffer.from(buffer));
}

function writeAscii(view, offset, value) {
    for (let index = 0; index < value.length; index++) {
        view.setUint8(offset + index, value.charCodeAt(index));
    }
}
