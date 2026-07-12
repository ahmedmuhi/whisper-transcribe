/**
 * @fileoverview Local static server for developing the browser application.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultHost = '127.0.0.1';
const defaultPort = 4173;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const host = validatedHost(process.env.HOST);
const port = validatedPort(process.env.PORT);
const acceptedHostHeaders = acceptedHostHeadersFor(host, port);

function validatedHost(value) {
    if (value === undefined) {
        return defaultHost;
    }

    if (value === 'localhost' || value === '::1'
        || (isIP(value) === 4 && value.startsWith('127.'))) {
        return value;
    }

    throw new Error('HOST must be localhost, ::1, or a 127.0.0.0/8 address.');
}

function validatedPort(value) {
    if (value === undefined) {
        return defaultPort;
    }

    if (!/^\d+$/.test(value)) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }

    const parsedPort = Number(value);
    if (!Number.isSafeInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }

    return parsedPort;
}

function displayHost(hostname) {
    return isIP(hostname) === 6 ? `[${hostname}]` : hostname;
}

function hostHeader(hostname, listenPort) {
    return `${displayHost(hostname)}:${listenPort}`;
}

function acceptedHostHeadersFor(hostname, listenPort) {
    const hostnameOnly = displayHost(hostname).toLowerCase();
    const acceptedHeaders = new Set([`${hostnameOnly}:${listenPort}`]);
    if (listenPort === 80) {
        acceptedHeaders.add(hostnameOnly);
    }

    return acceptedHeaders;
}

function hasExpectedHost(request) {
    const requestHost = request.headers.host?.toLowerCase();
    return requestHost !== undefined && acceptedHostHeaders.has(requestHost);
}

function requestPathname(requestUrl) {
    const queryStart = requestUrl.search(/[?#]/);
    return queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart);
}

function filePathFor(pathname) {
    try {
        const decodedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
            .replaceAll('\\', '/');
        if (decodedPath.split('/').some(segment => segment.startsWith('.'))) {
            return null;
        }

        const filePath = path.resolve(repoRoot, `.${decodedPath}`);
        const relativePath = path.relative(repoRoot, filePath);

        if (relativePath === '' || relativePath === '..'
            || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
            return null;
        }

        return filePath;
    } catch {
        return null;
    }
}

function sendNotFound(response) {
    response.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
    });
    response.end('Not found');
}

async function serveFile(request, response) {
    if (!hasExpectedHost(request)) {
        sendNotFound(response);
        return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendNotFound(response);
        return;
    }

    const pathname = requestPathname(request.url ?? '/');
    if (!pathname.startsWith('/')) {
        sendNotFound(response);
        return;
    }

    const filePath = filePathFor(pathname);
    if (!filePath) {
        sendNotFound(response);
        return;
    }

    try {
        const fileStats = await stat(filePath);
        if (!fileStats.isFile()) {
            sendNotFound(response);
            return;
        }

        const headers = {
            'Cache-Control': 'no-store',
            'Content-Length': fileStats.size,
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
        };

        if (request.method === 'HEAD') {
            response.writeHead(200, headers);
            response.end();
            return;
        }

        const fileStream = createReadStream(filePath);
        let responseStarted = false;
        fileStream.once('error', () => {
            if (responseStarted) {
                response.destroy();
                return;
            }

            sendNotFound(response);
        });
        fileStream.once('open', () => {
            responseStarted = true;
            response.writeHead(200, headers);
            fileStream.pipe(response);
        });
    } catch {
        sendNotFound(response);
    }
}

const server = createServer((request, response) => {
    void serveFile(request, response);
});

server.once('error', error => {
    console.error(`Unable to start local server: ${error.message}`);
    process.exitCode = 1;
});

server.listen(port, host, () => {
    console.log(`Local app available at http://${hostHeader(host, port)}/`);
    console.log('Press Ctrl+C to stop.');
});

let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}; shutting down local server.`);
    server.close(error => {
        if (error) {
            console.error(`Unable to stop local server: ${error.message}`);
            process.exitCode = 1;
            return;
        }

        console.log('Local server stopped.');
    });
    server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
