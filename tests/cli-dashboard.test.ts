import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { cmdDashboard } from '../src/commands/dashboard.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({ id: 's1', projectDir: '/p/app', startedAt: '2026-07-05T14:00:00.000Z', endedAt: '2026-07-05T14:10:00.000Z' });
  store.insertEvent({ sessionId: 's1', ts: '2026-07-05T14:01:00.000Z', type: 'command', toolName: 'Bash', detail: 'npm test', source: 'hook', sidechain: false, uniqKey: 'e1' });
  store.insertFileTouch({ sessionId: 's1', path: '/p/app/a.ts', action: 'edit', ts: '2026-07-05T14:02:00.000Z', uniqKey: 't1' });
  store.insertTokenUsage({ sessionId: 's1', messageUuid: 'm1', model: 'claude-opus-4-8', ts: '2026-07-05T14:01:00.000Z', inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
});

afterEach(() => store.close());

describe('cmdDashboard', () => {
  it('prints the fleet overview with cost and breakdowns', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdDashboard(store);
    const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('FLEET OVERVIEW');
    expect(out).toContain('Sessions');
    // 1M opus input tokens ≈ $5
    expect(out).toContain('$5');
    expect(out).toContain('EST. COST BY MODEL');
    expect(out).toContain('claude-opus-4-8');
    expect(out).toContain('TOP TOOLS');
    expect(out).toContain('Bash');
    expect(out).toContain('MOST-TOUCHED FILES');
    expect(out).toContain('/p/app/a.ts');
    log.mockRestore();
  });
});
