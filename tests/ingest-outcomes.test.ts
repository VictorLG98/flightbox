import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { runIngest } from '../src/ingest/ingest.js';

let tmp: string;
let store: Store;

function hookLine(payload: unknown): string {
  return JSON.stringify({ received_at: '2026-07-05T14:02:11.000Z', payload }) + '\n';
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.TRACEBOX_HOME = path.join(tmp, 'fbx');
  process.env.TRACEBOX_CLAUDE_HOME = path.join(tmp, 'claude');
  fs.mkdirSync(path.join(tmp, 'fbx', 'raw'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'fbx', 'raw', 'hooks-2026-07-05.jsonl'),
    hookLine({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' } }) +
    hookLine({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' }, tool_response: { filePath: '/p/a.ts' } }) +
    hookLine({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Write', tool_input: { file_path: '/p/b.ts' } }) +
    hookLine({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Write', tool_input: { file_path: '/p/b.ts' }, tool_response: { error: 'nope' } }),
  );
  store = openStore(path.join(tmp, 'db.sqlite'));
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('runIngest — outcomes', () => {
  it('persists outcomes and yields claims statuses', () => {
    runIngest(store);
    expect(store.claimsForSession('s1')).toEqual([
      { path: '/p/a.ts', status: 'succeeded' },
      { path: '/p/b.ts', status: 'failed' },
    ]);
  });

  it('is idempotent across runs', () => {
    runIngest(store);
    runIngest(store);
    expect(store.claimsForSession('s1')).toEqual([
      { path: '/p/a.ts', status: 'succeeded' },
      { path: '/p/b.ts', status: 'failed' },
    ]);
  });
});
