import fs from 'node:fs';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function contentTypeFor(filePath: string): string {
  return TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve a URL path to a file inside distDir. Traversal-safe. Client routes
 *  (no file extension, no match) fall back to index.html so the SPA can route. */
export function resolveStaticFile(
  distDir: string,
  urlPath: string,
): { filePath: string; contentType: string } | null {
  const root = path.resolve(distDir);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null; // traversal

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return { filePath: candidate, contentType: contentTypeFor(candidate) };
  }
  // No extension → treat as a client-side route; serve index.html.
  if (path.extname(candidate) === '') {
    const index = path.join(root, 'index.html');
    if (fs.existsSync(index)) return { filePath: index, contentType: contentTypeFor(index) };
  }
  return null;
}
