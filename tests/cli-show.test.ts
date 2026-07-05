import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { cmdShow } from '../src/commands/show.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({
    id: 'abcd-1', projectDir: '/p/app',
    startedAt: '2026-07-05T14:00:00.000Z', endedAt: '2026-07-05T14:10:00.000Z',
    model: 'claude-sonnet-4-6',
  });
  store.insertEvent({
    sessionId: 'abcd-1', ts: '2026-07-05T14:02:11.000Z', type: 'command',
    toolName: 'Bash', detail: 'npm test', source: 'hook', sidechain: false, uniqKey: 'k1',
  });
  store.insertEvent({
    sessionId: 'abcd-1', ts: '2026-07-05T14:03:00.000Z', type: 'tool_call',
    toolName: 'Grep', detail: 'pattern', source: 'transcript', sidechain: true, uniqKey: 'k2',
  });
  store.insertTokenUsage({
    sessionId: 'abcd-1', messageUuid: 'm1', model: 'claude-sonnet-4-6',
    ts: '2026-07-05T14:02:00.000Z',
    inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheCreationTokens: 0,
  });
});

afterEach(() => store.close());

describe('cmdShow', () => {
  it('prints header summary and timeline with sidechain indent', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = cmdShow(store, 'abcd');
    expect(code).toBe(0);
    const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('abcd-1');
    expect(out).toContain('claude-sonnet-4-6');
    expect(out).toContain('10m');                 // duration
    expect(out).toContain('1.2K');                // input+output
    expect(out).toContain('14:02:11  command');   // timeline line
    expect(out).toContain('  ↳ ');                // sidechain indent
    log.mockRestore();
  });

  it('returns 1 for unknown session', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cmdShow(store, 'zzz')).toBe(1);
    err.mockRestore();
  });
});
