import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { sessionListDto, sessionDetailDto, claimsDto } from '../src/server/store-api.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({ id: 'hooked', projectDir: '/p/app', startedAt: '2026-07-05T14:00:00.000Z', endedAt: '2026-07-05T14:10:00.000Z', model: 'claude-sonnet-4-6' });
  store.insertEvent({ sessionId: 'hooked', ts: '2026-07-05T14:01:00.000Z', type: 'command', toolName: 'Bash', detail: 'npm test', source: 'hook', sidechain: false, uniqKey: 'e1' });
  store.insertEvent({ sessionId: 'hooked', ts: '2026-07-05T14:02:00.000Z', type: 'subagent_spawn', toolName: 'Task', detail: 'fix', source: 'hook', sidechain: false, uniqKey: 'e2' });
  store.insertFileTouch({ sessionId: 'hooked', path: '/p/app/a.ts', action: 'edit', ts: '2026-07-05T14:03:00.000Z', uniqKey: 't1' });
  store.insertFileTouch({ sessionId: 'hooked', path: '/p/app/b.ts', action: 'edit', ts: '2026-07-05T14:04:00.000Z', uniqKey: 't2' });
  store.insertToolOutcome({ sessionId: 'hooked', path: '/p/app/a.ts', toolName: 'Edit', success: true, rawResponse: '{}', ts: '2026-07-05T14:03:01.000Z', uniqKey: 'o1' });
  // b.ts attempted, no outcome -> discrepancy
  store.insertTokenUsage({ sessionId: 'hooked', messageUuid: 'm1', model: 'claude-sonnet-4-6', ts: '2026-07-05T14:01:00.000Z', inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheCreationTokens: 10 });
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('sessionListDto', () => {
  it('summarizes sessions with duration and discrepancy flag', () => {
    const [row] = sessionListDto(store);
    expect(row).toMatchObject({
      id: 'hooked', project: '/p/app', durationMs: 600000,
      tokens: 1200, fileCount: 2, hasDiscrepancy: true,
    });
  });
});

describe('sessionDetailDto', () => {
  it('returns full detail with event/command/subagent counts', () => {
    const d = sessionDetailDto(store, 'hooked')!;
    expect(d.model).toBe('claude-sonnet-4-6');
    expect(d.durationMs).toBe(600000);
    expect(d.tokens).toEqual({ input: 1000, output: 200, cacheRead: 50, cacheCreation: 10 });
    expect(d.commandCount).toBe(1);
    expect(d.subagentCount).toBe(1);
    expect(d.fileCount).toBe(2);
    expect(d.events).toHaveLength(2);
    expect(d.events[0]).toMatchObject({ type: 'command', toolName: 'Bash', detail: 'npm test' });
  });
  it('returns null for unknown session', () => {
    expect(sessionDetailDto(store, 'nope')).toBeNull();
  });
});

describe('claimsDto', () => {
  it('reports hooksPresent and per-file status', () => {
    const c = claimsDto(store, 'hooked')!;
    expect(c.hooksPresent).toBe(true);
    expect(c.files).toEqual([
      { path: '/p/app/a.ts', status: 'succeeded' },
      { path: '/p/app/b.ts', status: 'attempted' },
    ]);
  });
  it('marks hooksPresent false for transcript-only sessions', () => {
    store.upsertSession({ id: 'tonly' });
    store.insertEvent({ sessionId: 'tonly', ts: '2026-07-05T15:00:00.000Z', type: 'file_touch', toolName: 'Edit', detail: '/p/x.ts', source: 'transcript', sidechain: false, uniqKey: 'te1' });
    store.insertFileTouch({ sessionId: 'tonly', path: '/p/x.ts', action: 'edit', ts: '2026-07-05T15:00:00.000Z', uniqKey: 'tt1' });
    const c = claimsDto(store, 'tonly')!;
    expect(c.hooksPresent).toBe(false);
    expect(c.files).toEqual([{ path: '/p/x.ts', status: 'attempted' }]);
  });
  it('returns null for unknown session', () => {
    expect(claimsDto(store, 'nope')).toBeNull();
  });
});
