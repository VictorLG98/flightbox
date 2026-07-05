import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { cmdStats } from '../src/commands/stats.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({ id: 's1', projectDir: '/p/app' });
  store.insertTokenUsage({
    sessionId: 's1', messageUuid: 'm1', model: null, ts: '2026-07-05T14:00:00.000Z',
    inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreationTokens: 0,
  });
  store.insertTokenUsage({
    sessionId: 's1', messageUuid: 'm2', model: null, ts: '2026-07-04T10:00:00.000Z',
    inputTokens: 300, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
  });
});

afterEach(() => store.close());

describe('cmdStats', () => {
  it('prints tokens by day and by project', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdStats(store);
    const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('TOKENS BY DAY');
    expect(out).toContain('2026-07-05');
    expect(out).toContain('1.5K');
    expect(out).toContain('TOKENS BY PROJECT');
    expect(out).toContain('/p/app');
    expect(out).toContain('1.8K');
    log.mockRestore();
  });
});
