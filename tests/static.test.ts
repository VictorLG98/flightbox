import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStaticFile, contentTypeFor } from '../src/server/static.js';

let dist: string;
beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-static-'));
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
});
afterAll(() => fs.rmSync(dist, { recursive: true, force: true }));

describe('contentTypeFor', () => {
  it('maps common extensions', () => {
    expect(contentTypeFor('a.html')).toMatch(/text\/html/);
    expect(contentTypeFor('a.js')).toMatch(/javascript/);
    expect(contentTypeFor('a.css')).toMatch(/text\/css/);
    expect(contentTypeFor('a.svg')).toMatch(/svg/);
    expect(contentTypeFor('a.unknown')).toMatch(/octet-stream/);
  });
});

describe('resolveStaticFile', () => {
  it('resolves a real asset', () => {
    const r = resolveStaticFile(dist, '/assets/app.js');
    expect(r?.filePath).toBe(path.join(dist, 'assets', 'app.js'));
    expect(r?.contentType).toMatch(/javascript/);
  });
  it('serves index.html for /', () => {
    expect(resolveStaticFile(dist, '/')?.filePath).toBe(path.join(dist, 'index.html'));
  });
  it('falls back to index.html for a client route (no extension, not found)', () => {
    expect(resolveStaticFile(dist, '/session/abc')?.filePath).toBe(path.join(dist, 'index.html'));
  });
  it('rejects path traversal', () => {
    expect(resolveStaticFile(dist, '/../../etc/passwd')).toBeNull();
    expect(resolveStaticFile(dist, '/assets/../../secret')).toBeNull();
  });
  it('returns null for a missing asset with an extension', () => {
    expect(resolveStaticFile(dist, '/assets/missing.js')).toBeNull();
  });
});
