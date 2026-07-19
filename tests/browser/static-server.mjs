/**
 * @fileoverview Static app server and local HTTPS transcription stub.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDirectory = path.join(repoRoot, 'dist');
const artifactsDirectory = path.join(repoRoot, 'tests/browser/.artifacts');
const keyPath = path.join(artifactsDirectory, 'localhost-key.pem');
const certificatePath = path.join(artifactsDirectory, 'localhost-cert.pem');
const transcriptionPath = '/speechtotext/transcriptions:transcribe';
const allowedOrigin = 'http://127.0.0.1:4173';
const maxPostBytes = 5 * 1024 * 1024;

let apiObservations = freshObservations();

function freshObservations() {
    return {
        optionsCount: 0,
        postCount: 0,
        preflightHeaders: {},
        postHeaders: {},
        postBodyBase64: '',
        captureError: null
    };
}

function sendJson(response, status, value) {
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
    });
    response.end(JSON.stringify(value));
}

const appServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, allowedOrigin);

    if (request.method === 'POST' && requestUrl.pathname === '/__browser-test__/reset') {
        apiObservations = freshObservations();
        sendJson(response, 200, { ok: true });
        return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/__browser-test__/api-observations') {
        sendJson(response, 200, apiObservations);
        return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
        return;
    }

    const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const decodedPath = decodeURIComponent(pathname);
    const filePath = path.resolve(distDirectory, `.${decodedPath}`);
    const relativePath = path.relative(distDirectory, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)
        || !existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404, { 'Cache-Control': 'no-store' });
        response.end('Not found');
        return;
    }

    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
    };
    response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream'
    });
    response.end(readFileSync(filePath));
});

function corsHeaders() {
    return {
        'Access-Control-Allow-Headers': 'Authorization',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Origin': allowedOrigin
    };
}

const apiServer = https.createServer(createCertificate(), (request, response) => {
    const requestUrl = new URL(request.url, 'https://127.0.0.1:4174');
    if (requestUrl.pathname !== transcriptionPath) {
        response.writeHead(404);
        response.end('Not found');
        return;
    }

    if (request.method === 'OPTIONS') {
        apiObservations.optionsCount += 1;
        apiObservations.preflightHeaders = { ...request.headers };
        response.writeHead(204, corsHeaders());
        response.end();
        return;
    }

    if (request.method !== 'POST') {
        response.writeHead(404);
        response.end('Not found');
        return;
    }

    apiObservations.postCount += 1;
    apiObservations.postHeaders = { ...request.headers };
    const chunks = [];
    let byteCount = 0;
    let exceededLimit = false;
    request.on('data', chunk => {
        byteCount += chunk.length;
        if (byteCount > maxPostBytes) {
            exceededLimit = true;
            apiObservations.captureError = `POST exceeded ${maxPostBytes} bytes (${byteCount} received)`;
            return;
        }
        chunks.push(chunk);
    });
    request.on('end', () => {
        if (exceededLimit) {
            response.writeHead(413, corsHeaders());
            response.end('Payload too large');
            return;
        }
        apiObservations.postBodyBase64 = Buffer.concat(chunks).toString('base64');
        response.writeHead(200, {
            ...corsHeaders(),
            'Content-Type': 'application/json'
        });
        response.end(JSON.stringify({
            combinedPhrases: [{ text: 'Browser smoke transcript' }],
            phrases: []
        }));
    });
    request.on('error', error => {
        apiObservations.captureError = error.message;
    });
});

const readinessServer = http.createServer((_request, response) => {
    response.writeHead(204, { Connection: 'close' });
    response.end();
});

function createCertificate() {
    mkdirSync(artifactsDirectory, { recursive: true });
    if (!existsSync(keyPath) || !existsSync(certificatePath)) {
        execFileSync('/usr/bin/openssl', [
            'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', keyPath, '-out', certificatePath,
            '-days', '1', '-subj', '/CN=127.0.0.1',
            '-addext', 'subjectAltName=IP:127.0.0.1'
        ], { stdio: 'ignore' });
    }
    return { key: readFileSync(keyPath), cert: readFileSync(certificatePath) };
}

appServer.listen(4173, '127.0.0.1', () => {
    apiServer.listen(4174, '127.0.0.1', () => {
        readinessServer.listen(4175, '::1', () => {
            console.log('Browser test servers listening on 127.0.0.1:4173, 127.0.0.1:4174, and [::1]:4175');
        });
    });
});

function shutdown() {
    readinessServer.closeAllConnections();
    apiServer.closeAllConnections();
    appServer.closeAllConnections();
    readinessServer.close(() => {
        apiServer.close(() => appServer.close(() => process.exit(0)));
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
