import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({ id: 's1' });
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function touch(p: string, action: 'edit' | 'write' | 'read', key: string) {
  store.insertFileTouch({ sessionId: 's1', path: p, action, ts: '2026-07-05T14:00:00.000Z', uniqKey: key });
}
function outcome(p: string | null, success: boolean | null, key: string) {
  store.insertToolOutcome({
    sessionId: 's1', path: p, toolName: 'Edit', success,
    rawResponse: '{}', ts: '2026-07-05T14:00:01.000Z', uniqKey: key,
  });
}

describe('tool outcomes', () => {
  it('insertToolOutcome is idempotent on uniqKey', () => {
    outcome('/p/a.ts', true, 'o1');
    outcome('/p/a.ts', true, 'o1');
    expect(store.claimsForSession('s1')).toEqual([]); // no touches yet -> nothing attempted
  });

  it('classifies succeeded / failed / attempted per edited file', () => {
    touch('/p/a.ts', 'edit', 't1');
    touch('/p/b.ts', 'write', 't2');
    touch('/p/c.ts', 'edit', 't3');
    touch('/p/r.ts', 'read', 't4');   // read is not an attempted edit
    outcome('/p/a.ts', true, 'o1');
    outcome('/p/b.ts', false, 'o2');
    // c.ts has no outcome -> attempted
    const claims = store.claimsForSession('s1');
    expect(claims).toEqual([
      { path: '/p/a.ts', status: 'succeeded' },
      { path: '/p/b.ts', status: 'failed' },
      { path: '/p/c.ts', status: 'attempted' },
    ]);
  });

  it('treats success=null outcome as attempted (unknown)', () => {
    touch('/p/a.ts', 'edit', 't1');
    outcome('/p/a.ts', null, 'o1');
    expect(store.claimsForSession('s1')).toEqual([{ path: '/p/a.ts', status: 'attempted' }]);
  });

  it('any success wins over a failure for the same path', () => {
    touch('/p/a.ts', 'edit', 't1');
    outcome('/p/a.ts', false, 'o1');
    outcome('/p/a.ts', true, 'o2');
    expect(store.claimsForSession('s1')).toEqual([{ path: '/p/a.ts', status: 'succeeded' }]);
  });
});
