import { protocol } from 'electron';
import { createReadStream, statSync } from 'node:fs';
import { guessMimeType } from '../shared/media-formats';

/**
 * Register the `local-media://` scheme as privileged.
 * Must be called before `app.whenReady()`.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'local-media', privileges: { standard: true, secure: true, stream: true, bypassCSP: true, supportFetchAPI: true } },
  ]);
}

/**
 * Install the `local-media://` protocol handler for streaming local files
 * with range-request support (needed for `<audio>` seeking).
 * Must be called after `app.whenReady()`.
 */
export function registerMediaProtocol(): void {
  protocol.handle('local-media', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname);

    try {
      const stat = statSync(filePath);
      const contentType = guessMimeType(filePath);

      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
          return new Response(createReadStream(filePath, { start, end }) as never, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Content-Length': String(end - start + 1),
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      return new Response(createReadStream(filePath) as never, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch {
      return new Response('File not found', { status: 404 });
    }
  });
}
