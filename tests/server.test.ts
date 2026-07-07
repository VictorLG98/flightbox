import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openStore, type Store } from '../src/store.js';
import { startServer } from '../src/server/server.js';

let tmp: string;
let store: Store;
let server: Server;
let base: string;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({ id: 'abc123', projectDir: '/p/app', startedAt: '2026-07-05T14:00:00.000Z', endedAt: '2026-07-05T14:10:00.000Z' });
  store.insertFileTouch({ sessionId: 'abc123', path: '/p/app/a.ts', action: 'edit', ts: '2026-07-05T14:03:00.000Z', uniqKey: 't1' });
  const started = await startServer(store, 0, tmp); // port 0 => OS-assigned free port; tmp has no HTML
  server = started.server;
  base = started.url;
});

afterEach(() => {
  server.close();
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('http server', () => {
  it('GET /api/sessions returns the list', async () => {
    const res = await fetch(`${base}/api/sessions`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body[0].id).toBe('abc123');
  });

  it('GET /api/sessions/:id returns detail', async () => {
    const res = await fetch(`${base}/api/sessions/abc123`);
    expect(res.status).toBe(200);
    expect((await res.json()).project).toBe('/p/app');
  });

  it('GET /api/sessions/:id/claims returns claims', async () => {
    const res = await fetch(`${base}/api/sessions/abc123/claims`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual([{ path: '/p/app/a.ts', status: 'attempted' }]);
  });

  it('GET /api/metrics returns the aggregate dashboard payload', async () => {
    const res = await fetch(`${base}/api/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.totals.sessions).toBe(1);
    expect(body.calendar).toContainEqual({ day: '2026-07-05', sessions: 1, tokens: 0 });
    expect(Array.isArray(body.byProject)).toBe(true);
    expect(body.streak).toEqual({ current: 1, longest: 1 });
    expect(body.projects).toContain('/p/app');
  });

  it('GET /api/metrics honours project and day filters', async () => {
    const other = await (await fetch(`${base}/api/metrics?project=${encodeURIComponent('/p/other')}`)).json();
    expect(other.totals.sessions).toBe(0);
    const inRange = await (await fetch(`${base}/api/metrics?from=2026-07-05&to=2026-07-05`)).json();
    expect(inRange.totals.sessions).toBe(1);
    const outOfRange = await (await fetch(`${base}/api/metrics?from=2026-07-06`)).json();
    expect(outOfRange.totals.sessions).toBe(0);
  });

  it('unknown session detail is 404 JSON', async () => {
    const res = await fetch(`${base}/api/sessions/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it('unknown route is 404 JSON', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });

  it('malformed percent-encoding in session id is 404', async () => {
    const res = await fetch(`${base}/api/sessions/%zz`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it('GLOB wildcard (*) in session id is 404', async () => {
    const res = await fetch(`${base}/api/sessions/*`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it('non-GET is 405', async () => {
    const res = await fetch(`${base}/api/sessions`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('retries next port on EADDRINUSE', async () => {
    // Occupy a free port with a throwaway net.Server
    const blocker = await new Promise<net.Server>((res, rej) => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => res(s));
      s.on('error', rej);
    });
    const blockedPort = (blocker.address() as AddressInfo).port;

    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-retry-'));
    const store2 = openStore(path.join(tmp2, 'db.sqlite'));
    let retryServer: Server | undefined;
    try {
      const result = await startServer(store2, blockedPort);
      retryServer = result.server;
      expect(result.port).toBeGreaterThan(blockedPort);
      expect(result.port).toBeLessThan(blockedPort + 50);
    } finally {
      await new Promise<void>((res) => blocker.close(() => res()));
      retryServer?.close();
      store2.close();
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });
});

describe('http server — static serving', () => {
  let servingServer: Server;
  let servingUrl: string;
  let distDir: string;
  let servingStore: Store;
  let servingTmp: string;

  beforeEach(async () => {
    servingTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-srv-'));
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-web-'));
    fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>SPA</body></html>');
    servingStore = openStore(path.join(servingTmp, 'db.sqlite'));
    const started = await startServer(servingStore, 0, distDir);
    servingServer = started.server;
    servingUrl = started.url;
  });

  afterEach(() => {
    servingServer.close();
    servingStore.close();
    fs.rmSync(servingTmp, { recursive: true, force: true });
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('serves the SPA index for the root', async () => {
    const res = await fetch(`${servingUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('serves index.html for client routes (no extension, no match)', async () => {
    const res = await fetch(`${servingUrl}/session/abc`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('still serves JSON for /api routes (no regression)', async () => {
    const res = await fetch(`${servingUrl}/api/sessions`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('returns 404 for a missing asset with an extension', async () => {
    const res = await fetch(`${servingUrl}/assets/missing.js`);
    expect(res.status).toBe(404);
  });
});
