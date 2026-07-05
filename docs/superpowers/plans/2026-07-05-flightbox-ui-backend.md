# flightbox Plan 2a — UI Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for the flightbox web UI: ingest PostToolUse outcomes, compute a structural claims-vs-reality per session, and expose everything as a read-only JSON API over `node:http`.

**Architecture:** Extend the existing ingest pipeline to persist tool outcomes (success/failure of Edit/Write, parsed from PostToolUse — already captured raw since Plan 1). Add a `tool_outcomes` table and a claims-vs-reality query joining attempted edits (`file_touches`) with outcomes. Wrap the existing `Store` in pure DTO builders, then serve those DTOs from a dependency-free HTTP server bound to `127.0.0.1`. No frontend in this plan — every deliverable is testable with `fetch`.

**Tech Stack:** Node ≥ 20, TypeScript (strict, ESM/NodeNext), better-sqlite3, `node:http`, vitest.

## Global Constraints

- Node `>=20`, `"type": "module"`, TypeScript `strict: true`, module `NodeNext` (local imports use `.js`).
- Only production dependency remains `better-sqlite3`. No HTTP framework — use `node:http`. No new prod deps in this plan.
- 100% local, zero telemetry, no outbound network. The server binds to `127.0.0.1` only.
- DB writes only through `Store`; all inserts idempotent (`INSERT OR IGNORE`).
- Outcome storage is defensive: persist the raw response (truncated) plus a derived `success: boolean | null`, so the success/failure heuristic can be refined and re-ingested without data loss.
- The claims-vs-reality result is purely structural (PreToolUse/`tool_use` = attempted, PostToolUse = outcome). No text scanning.
- API responses and any user-facing strings in English.
- Repo: `/Users/vic98lg/Documents/Proyectos/flightbox`, base branch `main`. Run all commands from repo root.

## Pre-Implementation De-Risk (context for Task 2)

The exact shape of a PostToolUse `tool_response` is not public API. Before/while implementing Task 2, capture one real payload to confirm the success/failure heuristic:

```bash
# Temporarily, in a throwaway dir, run: flightbox install; do one edit in a Claude Code
# session; then inspect ~/.flightbox/raw/hooks-*.jsonl for a line with
# payload.hook_event_name == "PostToolUse" and read payload.tool_response.
```

If capture isn't feasible in the implementation environment, implement the documented heuristic below and mark the task `DONE_WITH_CONCERNS` noting the heuristic is unconfirmed against a live payload. The defensive raw storage makes later refinement a re-ingest, not a rewrite.

## File Structure

- `src/atf.ts` — MODIFY: add `ToolOutcomeInput`.
- `src/store.ts` — MODIFY: add `tool_outcomes` table, `insertToolOutcome`, `claimsForSession`.
- `src/ingest/hooks.ts` — MODIFY: `HookNorm` gains `outcome?`; `normalizeHookLine` populates it for PostToolUse.
- `src/ingest/ingest.ts` — MODIFY: `runIngest` persists outcomes.
- `src/server/store-api.ts` — CREATE: pure DTO builders over `Store`.
- `src/server/server.ts` — CREATE: `createServer(store)` + `startServer(store, portStart?)`.
- Tests alongside in `tests/`.

---

### Task 1: `tool_outcomes` table + claims query

**Files:**
- Modify: `src/atf.ts` (append `ToolOutcomeInput`)
- Modify: `src/store.ts` (schema, interface, `insertToolOutcome`, `claimsForSession`)
- Test: `tests/store-outcomes.test.ts`

**Interfaces:**
- Consumes: existing `Store` from Task-3 of Plan 1.
- Produces:
  ```ts
  // atf.ts
  export interface ToolOutcomeInput {
    sessionId: string;
    path: string | null;      // file path for file tools, else null
    toolName: string;
    success: boolean | null;  // true=ok, false=failed, null=unknown
    rawResponse: string;      // truncated tool_response
    ts: string;               // ISO 8601
    uniqKey: string;
  }
  // store.ts — added to Store interface
  export interface ClaimRow { path: string; status: 'succeeded' | 'failed' | 'attempted'; }
  insertToolOutcome(o: ToolOutcomeInput): void;
  claimsForSession(sessionId: string): ClaimRow[];
  ```

- [ ] **Step 1: Append `ToolOutcomeInput` to `src/atf.ts`** (exact interface above, after `TokenUsageInput`).

- [ ] **Step 2: Write the failing tests**

`tests/store-outcomes.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- store-outcomes`
Expected: FAIL — `insertToolOutcome`/`claimsForSession` not on `Store`.

- [ ] **Step 4: Implement in `src/store.ts`**

Add to the `SCHEMA` string (before the closing backtick):
```sql
CREATE TABLE IF NOT EXISTS tool_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT,
  tool_name TEXT NOT NULL,
  success INTEGER,
  raw_response TEXT NOT NULL,
  ts TEXT NOT NULL,
  uniq_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_outcomes_session_path ON tool_outcomes(session_id, path);
```

Add `ClaimRow` export and the two methods to the `Store` interface (signatures above). In `openStore`, prepare:
```ts
const insOutcome = db.prepare(`
  INSERT OR IGNORE INTO tool_outcomes (session_id, path, tool_name, success, raw_response, ts, uniq_key)
  VALUES (@sessionId, @path, @toolName, @success, @rawResponse, @ts, @uniqKey)
`);
const claimsSql = db.prepare(`
  SELECT ft.path AS path,
    MAX(CASE WHEN o.success = 1 THEN 1 ELSE 0 END) AS any_success,
    MAX(CASE WHEN o.success = 0 THEN 1 ELSE 0 END) AS any_failure
  FROM file_touches ft
  LEFT JOIN tool_outcomes o
    ON o.session_id = ft.session_id AND o.path = ft.path
  WHERE ft.session_id = ? AND ft.action IN ('edit', 'write')
  GROUP BY ft.path
  ORDER BY ft.path
`);
```
Implement the methods in the returned object:
```ts
insertToolOutcome: (o) =>
  insOutcome.run({ ...o, success: o.success === null ? null : o.success ? 1 : 0 }),
claimsForSession: (sessionId) =>
  (claimsSql.all(sessionId) as Array<{ path: string; any_success: number; any_failure: number }>).map((r) => ({
    path: r.path,
    status: r.any_success ? 'succeeded' : r.any_failure ? 'failed' : 'attempted',
  })),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- store-outcomes`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/atf.ts src/store.ts tests/store-outcomes.test.ts
git commit -m "feat: tool_outcomes table and structural claims-vs-reality query"
```

---

### Task 2: PostToolUse normalizer

**Files:**
- Modify: `src/ingest/hooks.ts` (extend `HookNorm`; populate `outcome` for PostToolUse)
- Test: `tests/ingest-hooks-outcomes.test.ts`

**Interfaces:**
- Consumes: `classifyTool`, `makeUniqKey`, `ToolOutcomeInput` from atf.
- Produces:
  ```ts
  export interface HookNorm {
    events: AtfEvent[];
    touches: FileTouchInput[];
    session?: SessionPatch;
    outcome?: ToolOutcomeInput;   // NEW: present for PostToolUse of a tracked tool
  }
  export function classifyOutcomeSuccess(toolResponse: unknown): boolean | null;
  ```

**Heuristic (`classifyOutcomeSuccess`, provisional — see De-Risk section):**
- If `toolResponse` is an object with a truthy `error` field, or a string containing `"error"` (case-insensitive) at its start → `false`.
- If `toolResponse` is a non-empty object/string with no error signal → `true`.
- If `toolResponse` is `null`/`undefined`/empty → `null`.

- [ ] **Step 1: Write the failing tests**

`tests/ingest-hooks-outcomes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeHookLine, classifyOutcomeSuccess } from '../src/ingest/hooks.js';

function rec(payload: unknown): string {
  return JSON.stringify({ received_at: '2026-07-05T14:02:11.000Z', payload });
}

describe('classifyOutcomeSuccess', () => {
  it('returns false on an error object', () => {
    expect(classifyOutcomeSuccess({ error: 'ENOENT' })).toBe(false);
  });
  it('returns false on an error-prefixed string', () => {
    expect(classifyOutcomeSuccess('Error: file not found')).toBe(false);
  });
  it('returns true on a normal result object', () => {
    expect(classifyOutcomeSuccess({ filePath: '/p/a.ts', newString: 'x' })).toBe(true);
  });
  it('returns null on empty / missing response', () => {
    expect(classifyOutcomeSuccess(null)).toBeNull();
    expect(classifyOutcomeSuccess({})).toBeNull();
    expect(classifyOutcomeSuccess('')).toBeNull();
  });
});

describe('normalizeHookLine — PostToolUse outcomes', () => {
  it('emits an outcome for a successful Edit', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PostToolUse', session_id: 's1',
      tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' },
      tool_response: { filePath: '/p/a.ts' },
    }))!;
    expect(out.events).toHaveLength(0); // still no timeline event for PostToolUse
    expect(out.outcome).toMatchObject({
      sessionId: 's1', path: '/p/a.ts', toolName: 'Edit', success: true,
      ts: '2026-07-05T14:02:11.000Z',
    });
    expect(out.outcome!.uniqKey).toHaveLength(40);
  });

  it('emits a failed outcome for an errored Write', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PostToolUse', session_id: 's1',
      tool_name: 'Write', tool_input: { file_path: '/p/b.ts' },
      tool_response: { error: 'permission denied' },
    }))!;
    expect(out.outcome).toMatchObject({ path: '/p/b.ts', toolName: 'Write', success: false });
  });

  it('does not emit an outcome for non-file tools (Bash)', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PostToolUse', session_id: 's1',
      tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'x' },
    }))!;
    expect(out.outcome).toBeUndefined();
  });

  it('PreToolUse is unchanged (no outcome)', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1',
      tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' },
    }))!;
    expect(out.outcome).toBeUndefined();
    expect(out.events[0].type).toBe('file_touch');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ingest-hooks-outcomes`
Expected: FAIL — `classifyOutcomeSuccess` not exported.

- [ ] **Step 3: Implement in `src/ingest/hooks.ts`**

Add `ToolOutcomeInput` to the type import from `../atf.js`. Add `outcome?: ToolOutcomeInput;` to `HookNorm`. Add:
```ts
export function classifyOutcomeSuccess(toolResponse: unknown): boolean | null {
  if (toolResponse == null) return null;
  if (typeof toolResponse === 'string') {
    if (toolResponse.trim() === '') return null;
    return /^\s*error/i.test(toolResponse) ? false : true;
  }
  if (typeof toolResponse === 'object') {
    const obj = toolResponse as Record<string, unknown>;
    if ('error' in obj && obj.error) return false;
    return Object.keys(obj).length === 0 ? null : true;
  }
  return null;
}
```
In the `PostToolUse` case of `normalizeHookLine`, replace the current empty return. Determine the file path via `classifyTool` (reuse its touch detection):
```ts
case 'PostToolUse': {
  const toolName = String(p.tool_name ?? 'unknown');
  const c = classifyTool(toolName, p.tool_input);
  // Only file-mutating tools carry a claims-relevant outcome.
  const isFileMutation = c.touch && (c.touch.action === 'edit' || c.touch.action === 'write');
  if (!isFileMutation) {
    return { events: [], touches: [], session: { id: sessionId } };
  }
  const rawResponse = JSON.stringify(p.tool_response ?? null).slice(0, 2000);
  const uniqKey = makeUniqKey(ts, sessionId, 'post', toolName, c.touch!.path);
  const outcome: ToolOutcomeInput = {
    sessionId,
    path: c.touch!.path,
    toolName,
    success: classifyOutcomeSuccess(p.tool_response),
    rawResponse,
    ts,
    uniqKey,
  };
  return { events: [], touches: [], session: { id: sessionId }, outcome };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ingest-hooks-outcomes`
Expected: PASS (8 tests). Also run `npm test -- ingest-hooks` (Plan 1's suite) to confirm no regression: the old PostToolUse test asserted `events` empty — still true.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/hooks.ts tests/ingest-hooks-outcomes.test.ts
git commit -m "feat: parse PostToolUse into tool outcomes (defensive success/failure)"
```

---

### Task 3: Wire outcomes into ingest

**Files:**
- Modify: `src/ingest/ingest.ts` (persist `norm.outcome`)
- Test: `tests/ingest-outcomes.test.ts`

**Interfaces:**
- Consumes: `runIngest(store)`, `Store.insertToolOutcome`, `Store.claimsForSession`.
- Produces: no signature change; `runIngest` now also inserts outcomes from hook lines.

- [ ] **Step 1: Write the failing test**

`tests/ingest-outcomes.test.ts`:
```ts
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
  process.env.FLIGHTBOX_HOME = path.join(tmp, 'fbx');
  process.env.FLIGHTBOX_CLAUDE_HOME = path.join(tmp, 'claude');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ingest-outcomes`
Expected: FAIL — claims empty (outcomes not inserted).

- [ ] **Step 3: Implement in `src/ingest/ingest.ts`**

In `ingestHooks`, inside the per-line loop, after inserting events/touches, add:
```ts
if (norm.outcome) store.insertToolOutcome(norm.outcome);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ingest-outcomes`
Expected: PASS (2 tests).

- [ ] **Step 5: Full suite, commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/ingest/ingest.ts tests/ingest-outcomes.test.ts
git commit -m "feat: persist tool outcomes during ingest"
```

---

### Task 4: API DTO builders

**Files:**
- Create: `src/server/store-api.ts`
- Test: `tests/store-api.test.ts`

**Interfaces:**
- Consumes: `Store` (listSessions, findSession, eventsForSession, sessionTokens, fileTouchCount, hookEventCount, claimsForSession).
- Produces:
  ```ts
  export interface SessionListItem {
    id: string; project: string | null; startedAt: string | null; endedAt: string | null;
    durationMs: number | null; tokens: number; fileCount: number; hasDiscrepancy: boolean;
  }
  export interface EventDto { ts: string; type: string; toolName: string | null; detail: string; sidechain: boolean; }
  export interface SessionDetail {
    id: string; project: string | null; model: string | null;
    startedAt: string | null; endedAt: string | null; durationMs: number | null;
    tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
    fileCount: number; commandCount: number; subagentCount: number; events: EventDto[];
  }
  export interface ClaimsDto {
    sessionId: string; hooksPresent: boolean;
    files: Array<{ path: string; status: 'succeeded' | 'failed' | 'attempted' }>;
  }
  export function sessionListDto(store: Store): SessionListItem[];
  export function sessionDetailDto(store: Store, id: string): SessionDetail | null;
  export function claimsDto(store: Store, id: string): ClaimsDto | null;
  ```
  `durationMs` = `end - start` when both parse, else `null`. `hasDiscrepancy` (list) and detail's discrepancy flag: true when `hooksPresent` and any claim status is `failed` or `attempted`. When hooks absent, `hasDiscrepancy=false` (all-attempted is expected, not a discrepancy).

- [ ] **Step 1: Write the failing tests**

`tests/store-api.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- store-api`
Expected: FAIL — cannot resolve `../src/server/store-api.js`.

- [ ] **Step 3: Implement `src/server/store-api.ts`**

```ts
import type { Store } from '../store.js';

export interface SessionListItem {
  id: string; project: string | null; startedAt: string | null; endedAt: string | null;
  durationMs: number | null; tokens: number; fileCount: number; hasDiscrepancy: boolean;
}
export interface EventDto { ts: string; type: string; toolName: string | null; detail: string; sidechain: boolean; }
export interface SessionDetail {
  id: string; project: string | null; model: string | null;
  startedAt: string | null; endedAt: string | null; durationMs: number | null;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  fileCount: number; commandCount: number; subagentCount: number; events: EventDto[];
}
export interface ClaimsDto {
  sessionId: string; hooksPresent: boolean;
  files: Array<{ path: string; status: 'succeeded' | 'failed' | 'attempted' }>;
}

function durationMs(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isNaN(ms) || ms < 0 ? null : ms;
}

function discrepancy(store: Store, id: string): boolean {
  if (store.hookEventCount(id) === 0) return false;
  return store.claimsForSession(id).some((c) => c.status !== 'succeeded');
}

export function sessionListDto(store: Store): SessionListItem[] {
  return store.listSessions().map((s) => ({
    id: s.id,
    project: s.project_dir,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    durationMs: durationMs(s.started_at, s.ended_at),
    tokens: s.total_tokens,
    fileCount: store.fileTouchCount(s.id),
    hasDiscrepancy: discrepancy(store, s.id),
  }));
}

export function sessionDetailDto(store: Store, id: string): SessionDetail | null {
  const s = store.findSession(id);
  if (!s) return null;
  const events = store.eventsForSession(s.id);
  return {
    id: s.id,
    project: s.project_dir,
    model: s.model,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    durationMs: durationMs(s.started_at, s.ended_at),
    tokens: store.sessionTokens(s.id),
    fileCount: store.fileTouchCount(s.id),
    commandCount: events.filter((e) => e.type === 'command').length,
    subagentCount: events.filter((e) => e.type === 'subagent_spawn').length,
    events: events.map((e) => ({ ts: e.ts, type: e.type, toolName: e.toolName, detail: e.detail, sidechain: e.sidechain })),
  };
}

export function claimsDto(store: Store, id: string): ClaimsDto | null {
  const s = store.findSession(id);
  if (!s) return null;
  return {
    sessionId: s.id,
    hooksPresent: store.hookEventCount(s.id) > 0,
    files: store.claimsForSession(s.id),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store-api`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/store-api.ts tests/store-api.test.ts
git commit -m "feat: pure DTO builders for the session API"
```

---

### Task 5: HTTP server + endpoints

**Files:**
- Create: `src/server/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `sessionListDto`, `sessionDetailDto`, `claimsDto`; `Store`.
- Produces:
  ```ts
  import type { Server } from 'node:http';
  export function createServer(store: Store): Server;
  export function startServer(store: Store, portStart?: number): Promise<{ server: Server; port: number; url: string }>;
  ```
  Routes (GET only): `/api/sessions` → list; `/api/sessions/:id` → detail (404 JSON if null); `/api/sessions/:id/claims` → claims (404 if null); anything else → 404 JSON `{ error: 'not found' }`. Non-GET → 405. All responses `application/json`. `startServer` binds `127.0.0.1`, tries `portStart` (default 51789) and increments on `EADDRINUSE`.

- [ ] **Step 1: Write the failing tests**

`tests/server.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
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
  const started = await startServer(store, 0); // port 0 => OS-assigned free port
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

  it('unknown session detail is 404 JSON', async () => {
    const res = await fetch(`${base}/api/sessions/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it('unknown route is 404 JSON', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });

  it('non-GET is 405', async () => {
    const res = await fetch(`${base}/api/sessions`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/server.test.ts`
Expected: FAIL — cannot resolve `../src/server/server.js`.

- [ ] **Step 3: Implement `src/server/server.ts`**

```ts
import http, { type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Store } from '../store.js';
import { sessionListDto, sessionDetailDto, claimsDto } from './store-api.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

export function createServer(store: Store): Server {
  return http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','sessions','abc','claims']

    if (parts[0] === 'api' && parts[1] === 'sessions') {
      if (parts.length === 2) {
        sendJson(res, 200, sessionListDto(store));
        return;
      }
      const id = decodeURIComponent(parts[2]);
      if (parts.length === 3) {
        const detail = sessionDetailDto(store, id);
        detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'session not found' });
        return;
      }
      if (parts.length === 4 && parts[3] === 'claims') {
        const claims = claimsDto(store, id);
        claims ? sendJson(res, 200, claims) : sendJson(res, 404, { error: 'session not found' });
        return;
      }
    }
    sendJson(res, 404, { error: 'not found' });
  });
}

export function startServer(
  store: Store,
  portStart = 51789,
): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(store);
    let port = portStart;
    const tryListen = () => {
      server.listen(port, '127.0.0.1');
    };
    server.on('listening', () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, port: boundPort, url: `http://127.0.0.1:${boundPort}` });
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port !== 0 && port < portStart + 50) {
        port += 1;
        tryListen();
      } else {
        reject(err);
      }
    });
    tryListen();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/server.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite, build, commit**

Run: `npm test && npm run build`
Expected: all pass, build clean.

```bash
git add src/server/server.ts tests/server.test.ts
git commit -m "feat: node:http JSON API server with free-port binding"
```

---

## Out of Scope (Plan 2b)

- React SPA (list + session views, three zones).
- Static file serving from the server (SPA build output).
- `flightbox ui` command (ingest + startServer + open browser + foreground).
- Vite/React dev dependencies and build wiring.
