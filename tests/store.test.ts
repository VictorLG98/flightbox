import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import type { AtfEvent } from '../src/atf.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
});

afterEach(() => store.close());

function evt(over: Partial<AtfEvent> = {}): AtfEvent {
  return {
    sessionId: 's1',
    ts: '2026-07-05T14:00:00.000Z',
    type: 'command',
    toolName: 'Bash',
    detail: 'npm test',
    source: 'hook',
    sidechain: false,
    uniqKey: over.uniqKey ?? 'k1',
    ...over,
  };
}

describe('store', () => {
  it('upsertSession merges fields and keeps earliest start / latest end', () => {
    store.upsertSession({ id: 's1', startedAt: '2026-07-05T14:00:00.000Z' });
    store.upsertSession({ id: 's1', projectDir: '/p/app', endedAt: '2026-07-05T15:00:00.000Z' });
    store.upsertSession({ id: 's1', startedAt: '2026-07-05T14:30:00.000Z' });
    const s = store.findSession('s1')!;
    expect(s.project_dir).toBe('/p/app');
    expect(s.started_at).toBe('2026-07-05T14:00:00.000Z');
    expect(s.ended_at).toBe('2026-07-05T15:00:00.000Z');
  });

  it('insertEvent is idempotent on uniqKey', () => {
    store.upsertSession({ id: 's1' });
    store.insertEvent(evt());
    store.insertEvent(evt());
    expect(store.eventsForSession('s1')).toHaveLength(1);
  });

  it('insertTokenUsage is idempotent on messageUuid and sums per session', () => {
    store.upsertSession({ id: 's1' });
    const u = {
      sessionId: 's1', messageUuid: 'm1', model: 'claude-sonnet-4-6',
      ts: '2026-07-05T14:00:01.000Z',
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, cacheCreationTokens: 10,
    };
    store.insertTokenUsage(u);
    store.insertTokenUsage(u);
    store.insertTokenUsage({ ...u, messageUuid: 'm2', inputTokens: 20, outputTokens: 5 });
    expect(store.sessionTokens('s1')).toEqual({ input: 120, output: 55, cacheRead: 1800, cacheCreation: 20 });
  });

  it('listSessions aggregates counts and tokens, newest first', () => {
    store.upsertSession({ id: 'aaa1', startedAt: '2026-07-04T10:00:00.000Z' });
    store.upsertSession({ id: 'bbb2', startedAt: '2026-07-05T10:00:00.000Z' });
    store.insertEvent(evt({ sessionId: 'bbb2', uniqKey: 'k2' }));
    const rows = store.listSessions();
    expect(rows.map((r) => r.id)).toEqual(['bbb2', 'aaa1']);
    expect(rows[0].event_count).toBe(1);
  });

  it('findSession matches by id prefix', () => {
    store.upsertSession({ id: 'abcdef-123' });
    expect(store.findSession('abcd')?.id).toBe('abcdef-123');
    expect(store.findSession('zzz')).toBeUndefined();
  });

  it('hookEventCount counts only hook-source events', () => {
    store.upsertSession({ id: 's1' });
    store.insertEvent(evt({ uniqKey: 'h1', source: 'hook' }));
    store.insertEvent(evt({ uniqKey: 't1', source: 'transcript' }));
    expect(store.hookEventCount('s1')).toBe(1);
  });

  it('fileTouchCount counts distinct paths', () => {
    store.upsertSession({ id: 's1' });
    const t = { sessionId: 's1', path: '/p/a.ts', action: 'edit' as const, ts: '2026-07-05T14:00:00.000Z', uniqKey: 'f1' };
    store.insertFileTouch(t);
    store.insertFileTouch({ ...t, uniqKey: 'f2' });
    store.insertFileTouch({ ...t, path: '/p/b.ts', uniqKey: 'f3' });
    expect(store.fileTouchCount('s1')).toBe(2);
  });
});
