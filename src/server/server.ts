import http, { type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Store } from '../store.js';
import { sessionListDto, sessionDetailDto, claimsDto } from './store-api.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

/** Decode a raw path segment into a session id, or null if invalid.
 *  Invalid means: URIError on decode, empty string, or contains a GLOB
 *  metacharacter (* ? [) that would widen the store's prefix query.
 */
function decodeId(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded === '' || /[*?[]/.test(decoded)) return null;
  return decoded;
}

export function createServer(store: Store): Server {
  return http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','sessions','abc','claims']

    if (parts[0] === 'api' && parts[1] === 'sessions') {
      if (parts.length === 2) {
        sendJson(res, 200, sessionListDto(store));
        return;
      }
      const id = decodeId(parts[2]);
      if (id === null) {
        sendJson(res, 404, { error: 'session not found' });
        return;
      }
      if (parts.length === 3) {
        const detail = sessionDetailDto(store, id);
        detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'session not found' });
        return;
      }
      if (parts.length === 4 && parts[3] === 'claims') {
        const claims = claimsDto(store, id);
        claims ? sendJson(res, 200, claims) : sendJson(res, 404, { error: 'session not found' });
        return;
      }
    }
    sendJson(res, 404, { error: 'not found' });
  });
}

export function startServer(
  store: Store,
  portStart = 51789,
): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(store);
    let port = portStart;
    const tryListen = () => {
      server.listen(port, '127.0.0.1');
    };
    server.on('listening', () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, port: boundPort, url: `http://127.0.0.1:${boundPort}` });
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port !== 0 && port < portStart + 50) {
        port += 1;
        server.close(() => tryListen());
      } else {
        reject(err);
      }
    });
    tryListen();
  });
}
