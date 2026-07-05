# flightbox Core + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the flightbox core pipeline (collector → ingester → SQLite store) and CLI (`install`, `collect`, `list`, `show`, `stats`) so a Claude Code user gets an auditable timeline of their agent sessions.

**Architecture:** Hooks append raw JSONL (collector, never fails); transcripts in `~/.claude/projects` are parsed cold; a single ingester normalizes both sources into the Agent Trace Format (ATF) and writes idempotently into SQLite; CLI commands are read-only viewers that auto-ingest first. Web UI is a separate plan (Plan 2), including the claims-vs-reality panel.

**Tech Stack:** Node ≥ 20, TypeScript (strict, ESM), better-sqlite3, vitest.

## Global Constraints

- Node `>=20`, `"type": "module"`, TypeScript `strict: true`, module `NodeNext`.
- Only production dependency allowed: `better-sqlite3`. Dev deps: `typescript`, `vitest`, `@types/node`, `@types/better-sqlite3`.
- 100% local, zero telemetry, no network calls anywhere.
- The collector (`flightbox collect`) must NEVER exit non-zero and NEVER print to stdout — it runs inside the user's agent session.
- All filesystem roots resolved via `src/paths.ts` only, overridable with env vars `FLIGHTBOX_HOME` and `FLIGHTBOX_CLAUDE_HOME` (this is how tests isolate).
- DB writes only through `Store` (single writer); inserts idempotent (`INSERT OR IGNORE` / upsert).
- Public-facing text (CLI output, README) in English.
- Repo: `/Users/vic98lg/Documents/Proyectos/flightbox`. Run all commands from the repo root.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/version.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: build/test toolchain; `VERSION: string` exported from `src/version.ts`.

- [ ] **Step 1: Create package.json, tsconfig.json, .gitignore**

`package.json`:
```json
{
  "name": "flightbox",
  "version": "0.1.0",
  "description": "Local-first flight recorder for coding agent sessions",
  "type": "module",
  "license": "MIT",
  "bin": { "flightbox": "dist/cli.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "vitest"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 2: Install dependencies**

Run: `npm install better-sqlite3 && npm install -D typescript vitest @types/node @types/better-sqlite3`
Expected: lockfile created, no errors.

- [ ] **Step 3: Write the failing smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/version.js';

describe('scaffold', () => {
  it('exports a version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
```

Run: `npm test`
Expected: FAIL — cannot resolve `../src/version.js`.

- [ ] **Step 4: Implement `src/version.ts`**

```ts
export const VERSION = '0.1.0';
```

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 5: Verify build works and commit**

Run: `npm run build && ls dist/version.js`
Expected: file listed.

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/version.ts tests/smoke.test.ts
git commit -m "chore: scaffold TypeScript/vitest project"
```

---

### Task 2: Paths module + collector

**Files:**
- Create: `src/paths.ts`, `src/collector.ts`
- Test: `tests/collector.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `paths.ts`: `flightboxHome(): string`, `rawLogDir(): string`, `dbPath(): string`, `claudeHome(): string`, `claudeProjectsDir(): string`, `claudeSettingsPath(): string`. All read env at call time (`FLIGHTBOX_HOME`, `FLIGHTBOX_CLAUDE_HOME`).
  - `collector.ts`: `collect(stdin: NodeJS.ReadableStream): Promise<void>` — appends one JSON line `{ received_at, payload }` to `rawLogDir()/hooks-YYYY-MM-DD.jsonl`. Swallows every error.

- [ ] **Step 1: Write the failing tests**

`tests/collector.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { collect } from '../src/collector.js';
import { rawLogDir } from '../src/paths.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.FLIGHTBOX_HOME = tmp;
});

function rawLines(): string[] {
  const dir = rawLogDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n'))
    .filter(Boolean);
}

describe('collect', () => {
  it('appends valid hook JSON as a raw line with received_at', async () => {
    await collect(Readable.from([JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's1' })]));
    const lines = rawLines();
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(rec.payload.session_id).toBe('s1');
    expect(rec.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores malformed input under payload.unparsed without throwing', async () => {
    await collect(Readable.from(['{not json']));
    const rec = JSON.parse(rawLines()[0]);
    expect(rec.payload.unparsed).toBe('{not json');
  });

  it('writes nothing on empty input', async () => {
    await collect(Readable.from(['']));
    expect(rawLines()).toHaveLength(0);
  });

  it('never throws even if FLIGHTBOX_HOME is unwritable', async () => {
    process.env.FLIGHTBOX_HOME = '/dev/null/nope';
    await expect(collect(Readable.from(['{"a":1}']))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- collector`
Expected: FAIL — cannot resolve `../src/collector.js`.

- [ ] **Step 3: Implement `src/paths.ts` and `src/collector.ts`**

`src/paths.ts`:
```ts
import os from 'node:os';
import path from 'node:path';

export function flightboxHome(): string {
  return process.env.FLIGHTBOX_HOME ?? path.join(os.homedir(), '.flightbox');
}

export function rawLogDir(): string {
  return path.join(flightboxHome(), 'raw');
}

export function dbPath(): string {
  return path.join(flightboxHome(), 'db.sqlite');
}

export function claudeHome(): string {
  return process.env.FLIGHTBOX_CLAUDE_HOME ?? path.join(os.homedir(), '.claude');
}

export function claudeProjectsDir(): string {
  return path.join(claudeHome(), 'projects');
}

export function claudeSettingsPath(): string {
  return path.join(claudeHome(), 'settings.json');
}
```

`src/collector.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { rawLogDir } from './paths.js';

const MAX_RAW_BYTES = 1_000_000;

export async function collect(stdin: NodeJS.ReadableStream): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(Buffer.from(c as Buffer));
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { unparsed: text.slice(0, MAX_RAW_BYTES) };
    }

    const line = JSON.stringify({ received_at: new Date().toISOString(), payload }) + '\n';
    const dir = rawLogDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `hooks-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, line);
  } catch {
    // Contract: the collector runs inside the user's agent session.
    // It must never throw, never block, never break the session.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- collector`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/paths.ts src/collector.ts tests/collector.test.ts
git commit -m "feat: collector appends raw hook events, never fails"
```

---

### Task 3: ATF types + SQLite store

**Files:**
- Create: `src/atf.ts`, `src/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `dbPath()` from Task 2.
- Produces (used by every later task):

`src/atf.ts`:
```ts
export type AtfEventType =
  | 'session_start'
  | 'session_end'
  | 'tool_call'
  | 'file_touch'
  | 'command'
  | 'subagent_spawn';

export interface AtfEvent {
  sessionId: string;
  ts: string; // ISO 8601
  type: AtfEventType;
  toolName: string | null;
  detail: string;
  source: 'hook' | 'transcript';
  sidechain: boolean;
  uniqKey: string;
}

export interface FileTouchInput {
  sessionId: string;
  path: string;
  action: 'read' | 'edit' | 'write';
  ts: string;
  uniqKey: string;
}

export interface SessionPatch {
  id: string;
  projectDir?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string;
}

export interface TokenUsageInput {
  sessionId: string;
  messageUuid: string;
  model: string | null;
  ts: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
```

`src/store.ts` exports `openStore(file?: string): Store` with:
```ts
export interface SessionSummary {
  id: string;
  project_dir: string | null;
  started_at: string | null;
  ended_at: string | null;
  model: string | null;
  event_count: number;
  total_tokens: number;
}

export interface Store {
  upsertSession(p: SessionPatch): void;
  insertEvent(e: AtfEvent): void;
  insertFileTouch(t: FileTouchInput): void;
  insertTokenUsage(u: TokenUsageInput): void;
  listSessions(): SessionSummary[];
  findSession(idPrefix: string): SessionSummary | undefined;
  eventsForSession(sessionId: string): AtfEvent[];
  hookEventCount(sessionId: string): number;
  fileTouchCount(sessionId: string): number;
  sessionTokens(sessionId: string): {
    input: number; output: number; cacheRead: number; cacheCreation: number;
  };
  statsByDay(): Array<{ day: string; tokens: number }>;
  statsByProject(): Array<{ project: string; tokens: number }>;
  close(): void;
}
```

- [ ] **Step 1: Create `src/atf.ts` exactly as specified in Interfaces above**

(No test of its own — pure types; the classify helper is added in Task 4.)

- [ ] **Step 2: Write the failing store tests**

`tests/store.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- store`
Expected: FAIL — cannot resolve `../src/store.js`.

- [ ] **Step 4: Implement `src/store.ts`**

```ts
import Database from 'better-sqlite3';
import { dbPath } from './paths.js';
import type { AtfEvent, FileTouchInput, SessionPatch, TokenUsageInput } from './atf.js';

export interface SessionSummary {
  id: string;
  project_dir: string | null;
  started_at: string | null;
  ended_at: string | null;
  model: string | null;
  event_count: number;
  total_tokens: number;
}

export interface Store {
  upsertSession(p: SessionPatch): void;
  insertEvent(e: AtfEvent): void;
  insertFileTouch(t: FileTouchInput): void;
  insertTokenUsage(u: TokenUsageInput): void;
  listSessions(): SessionSummary[];
  findSession(idPrefix: string): SessionSummary | undefined;
  eventsForSession(sessionId: string): AtfEvent[];
  hookEventCount(sessionId: string): number;
  fileTouchCount(sessionId: string): number;
  sessionTokens(sessionId: string): {
    input: number; output: number; cacheRead: number; cacheCreation: number;
  };
  statsByDay(): Array<{ day: string; tokens: number }>;
  statsByProject(): Array<{ project: string; tokens: number }>;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_dir TEXT,
  started_at TEXT,
  ended_at TEXT,
  model TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  tool_name TEXT,
  detail TEXT NOT NULL,
  source TEXT NOT NULL,
  sidechain INTEGER NOT NULL DEFAULT 0,
  uniq_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
CREATE TABLE IF NOT EXISTS file_touches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  action TEXT NOT NULL,
  ts TEXT NOT NULL,
  uniq_key TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS token_usage (
  message_uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  model TEXT,
  ts TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0
);
`;

const LIST_SQL = `
SELECT s.*,
  (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
  COALESCE((SELECT SUM(input_tokens + output_tokens) FROM token_usage t WHERE t.session_id = s.id), 0) AS total_tokens
FROM sessions s
`;

export function openStore(file: string = dbPath()): Store {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const upsert = db.prepare(`
    INSERT INTO sessions (id, project_dir, started_at, ended_at, model)
    VALUES (@id, @projectDir, @startedAt, @endedAt, @model)
    ON CONFLICT(id) DO UPDATE SET
      project_dir = COALESCE(excluded.project_dir, project_dir),
      started_at  = COALESCE(MIN(excluded.started_at, started_at), excluded.started_at, started_at),
      ended_at    = COALESCE(MAX(excluded.ended_at, ended_at), excluded.ended_at, ended_at),
      model       = COALESCE(excluded.model, model)
  `);
  const insEvent = db.prepare(`
    INSERT OR IGNORE INTO events (session_id, ts, type, tool_name, detail, source, sidechain, uniq_key)
    VALUES (@sessionId, @ts, @type, @toolName, @detail, @source, @sidechain, @uniqKey)
  `);
  const insTouch = db.prepare(`
    INSERT OR IGNORE INTO file_touches (session_id, path, action, ts, uniq_key)
    VALUES (@sessionId, @path, @action, @ts, @uniqKey)
  `);
  const insUsage = db.prepare(`
    INSERT OR IGNORE INTO token_usage
      (message_uuid, session_id, model, ts, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
    VALUES
      (@messageUuid, @sessionId, @model, @ts, @inputTokens, @outputTokens, @cacheReadTokens, @cacheCreationTokens)
  `);

  const rowToEvent = (r: any): AtfEvent => ({
    sessionId: r.session_id,
    ts: r.ts,
    type: r.type,
    toolName: r.tool_name,
    detail: r.detail,
    source: r.source,
    sidechain: !!r.sidechain,
    uniqKey: r.uniq_key,
  });

  return {
    upsertSession: (p) =>
      upsert.run({
        id: p.id,
        projectDir: p.projectDir ?? null,
        startedAt: p.startedAt ?? null,
        endedAt: p.endedAt ?? null,
        model: p.model ?? null,
      }),
    insertEvent: (e) => insEvent.run({ ...e, sidechain: e.sidechain ? 1 : 0 }),
    insertFileTouch: (t) => insTouch.run(t),
    insertTokenUsage: (u) => insUsage.run(u),
    listSessions: () =>
      db.prepare(`${LIST_SQL} ORDER BY s.started_at DESC`).all() as SessionSummary[],
    findSession: (idPrefix) =>
      db.prepare(`${LIST_SQL} WHERE s.id LIKE ? || '%' LIMIT 1`).get(idPrefix) as SessionSummary | undefined,
    eventsForSession: (sessionId) =>
      (db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts, id').all(sessionId) as any[]).map(rowToEvent),
    hookEventCount: (sessionId) =>
      (db.prepare("SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND source = 'hook'").get(sessionId) as any).n,
    fileTouchCount: (sessionId) =>
      (db.prepare('SELECT COUNT(DISTINCT path) AS n FROM file_touches WHERE session_id = ?').get(sessionId) as any).n,
    sessionTokens: (sessionId) => {
      const r = db.prepare(`
        SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output,
               COALESCE(SUM(cache_read_tokens),0) AS cacheRead, COALESCE(SUM(cache_creation_tokens),0) AS cacheCreation
        FROM token_usage WHERE session_id = ?
      `).get(sessionId) as any;
      return { input: r.input, output: r.output, cacheRead: r.cacheRead, cacheCreation: r.cacheCreation };
    },
    statsByDay: () =>
      db.prepare(`
        SELECT substr(ts, 1, 10) AS day, SUM(input_tokens + output_tokens) AS tokens
        FROM token_usage GROUP BY day ORDER BY day DESC LIMIT 14
      `).all() as Array<{ day: string; tokens: number }>,
    statsByProject: () =>
      db.prepare(`
        SELECT COALESCE(s.project_dir, '(unknown)') AS project, SUM(t.input_tokens + t.output_tokens) AS tokens
        FROM token_usage t LEFT JOIN sessions s ON s.id = t.session_id
        GROUP BY project ORDER BY tokens DESC
      `).all() as Array<{ project: string; tokens: number }>,
    close: () => db.close(),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- store`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/atf.ts src/store.ts tests/store.test.ts
git commit -m "feat: ATF types and idempotent SQLite store"
```

---

### Task 4: Hook-event normalizer

**Files:**
- Modify: `src/atf.ts` (append `classifyTool` and `makeUniqKey`)
- Create: `src/ingest/hooks.ts`
- Test: `tests/ingest-hooks.test.ts`

**Interfaces:**
- Consumes: `AtfEvent`, `FileTouchInput`, `SessionPatch` from Task 3.
- Produces:
  - `atf.ts` additions:
    ```ts
    export function makeUniqKey(...parts: string[]): string; // sha1 hex of parts joined with '|'
    export interface Classified {
      type: AtfEventType;
      detail: string;
      touch?: { path: string; action: 'read' | 'edit' | 'write' };
    }
    export function classifyTool(toolName: string, input: unknown): Classified;
    ```
  - `ingest/hooks.ts`:
    ```ts
    export interface HookNorm {
      events: AtfEvent[];
      touches: FileTouchInput[];
      session?: SessionPatch;
    }
    export function normalizeHookLine(line: string): HookNorm | null;
    ```

- [ ] **Step 1: Write the failing tests**

`tests/ingest-hooks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeHookLine } from '../src/ingest/hooks.js';

function rec(payload: unknown): string {
  return JSON.stringify({ received_at: '2026-07-05T14:02:11.000Z', payload });
}

describe('normalizeHookLine', () => {
  it('maps Bash PreToolUse to a command event', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1', cwd: '/p/app',
      tool_name: 'Bash', tool_input: { command: 'npm test' },
    }))!;
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({
      sessionId: 's1', type: 'command', toolName: 'Bash',
      detail: 'npm test', source: 'hook', ts: '2026-07-05T14:02:11.000Z',
    });
    expect(out.events[0].uniqKey).toHaveLength(40);
  });

  it('maps Edit PreToolUse to file_touch event plus touch row', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1',
      tool_name: 'Edit', tool_input: { file_path: '/p/app/a.ts' },
    }))!;
    expect(out.events[0].type).toBe('file_touch');
    expect(out.touches).toEqual([expect.objectContaining({ path: '/p/app/a.ts', action: 'edit' })]);
  });

  it('maps Task tool to subagent_spawn using description', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1',
      tool_name: 'Task', tool_input: { description: 'fix tests', prompt: 'long...' },
    }))!;
    expect(out.events[0]).toMatchObject({ type: 'subagent_spawn', detail: 'fix tests' });
  });

  it('maps SessionStart to session patch + session_start event', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'SessionStart', session_id: 's1', cwd: '/p/app',
    }))!;
    expect(out.session).toEqual({ id: 's1', projectDir: '/p/app', startedAt: '2026-07-05T14:02:11.000Z' });
    expect(out.events[0].type).toBe('session_start');
  });

  it('maps Stop to session_end + endedAt patch', () => {
    const out = normalizeHookLine(rec({ hook_event_name: 'Stop', session_id: 's1' }))!;
    expect(out.session).toEqual({ id: 's1', endedAt: '2026-07-05T14:02:11.000Z' });
    expect(out.events[0].type).toBe('session_end');
  });

  it('ignores PostToolUse (raw is kept, normalization skips it)', () => {
    const out = normalizeHookLine(rec({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash' }))!;
    expect(out.events).toHaveLength(0);
  });

  it('returns null for garbage or missing session_id', () => {
    expect(normalizeHookLine('nope')).toBeNull();
    expect(normalizeHookLine(rec({ hook_event_name: 'PreToolUse' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ingest-hooks`
Expected: FAIL — cannot resolve `../src/ingest/hooks.js`.

- [ ] **Step 3: Append helpers to `src/atf.ts` and implement `src/ingest/hooks.ts`**

Append to `src/atf.ts`:
```ts
import { createHash } from 'node:crypto';

export function makeUniqKey(...parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex');
}

export interface Classified {
  type: AtfEventType;
  detail: string;
  touch?: { path: string; action: 'read' | 'edit' | 'write' };
}

export function classifyTool(toolName: string, input: unknown): Classified {
  const inp = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case 'Bash':
      return { type: 'command', detail: String(inp.command ?? '') };
    case 'Read':
      return { type: 'file_touch', detail: String(inp.file_path ?? ''), touch: { path: String(inp.file_path ?? ''), action: 'read' } };
    case 'Edit':
    case 'NotebookEdit':
      return { type: 'file_touch', detail: String(inp.file_path ?? inp.notebook_path ?? ''), touch: { path: String(inp.file_path ?? inp.notebook_path ?? ''), action: 'edit' } };
    case 'Write':
      return { type: 'file_touch', detail: String(inp.file_path ?? ''), touch: { path: String(inp.file_path ?? ''), action: 'write' } };
    case 'Task':
    case 'Agent':
      return { type: 'subagent_spawn', detail: String(inp.description ?? String(inp.prompt ?? '').slice(0, 80)) };
    default:
      return { type: 'tool_call', detail: JSON.stringify(inp).slice(0, 120) };
  }
}
```

`src/ingest/hooks.ts`:
```ts
import { classifyTool, makeUniqKey } from '../atf.js';
import type { AtfEvent, FileTouchInput, SessionPatch } from '../atf.js';

export interface HookNorm {
  events: AtfEvent[];
  touches: FileTouchInput[];
  session?: SessionPatch;
}

export function normalizeHookLine(line: string): HookNorm | null {
  let rec: any;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  const p = rec?.payload;
  const sessionId: unknown = p?.session_id;
  const ts: unknown = rec?.received_at;
  if (typeof sessionId !== 'string' || typeof ts !== 'string') return null;

  const base = { sessionId, ts, source: 'hook' as const, sidechain: false };
  const key = (...extra: string[]) => makeUniqKey(ts, sessionId, ...extra);

  switch (p.hook_event_name) {
    case 'SessionStart':
      return {
        events: [{ ...base, type: 'session_start', toolName: null, detail: String(p.cwd ?? ''), uniqKey: key('session_start') }],
        touches: [],
        session: { id: sessionId, ...(p.cwd ? { projectDir: String(p.cwd) } : {}), startedAt: ts },
      };
    case 'Stop':
      return {
        events: [{ ...base, type: 'session_end', toolName: null, detail: '', uniqKey: key('session_end') }],
        touches: [],
        session: { id: sessionId, endedAt: ts },
      };
    case 'PreToolUse': {
      const toolName = String(p.tool_name ?? 'unknown');
      const c = classifyTool(toolName, p.tool_input);
      const uniqKey = key('pre', toolName, JSON.stringify(p.tool_input ?? null));
      const events: AtfEvent[] = [{ ...base, type: c.type, toolName, detail: c.detail, uniqKey }];
      const touches: FileTouchInput[] = c.touch
        ? [{ sessionId, path: c.touch.path, action: c.touch.action, ts, uniqKey: makeUniqKey(uniqKey, 'touch') }]
        : [];
      return { events, touches, session: { id: sessionId } };
    }
    case 'PostToolUse':
      // Raw log keeps the tool response for future use; MVP timeline skips it
      // to avoid duplicating every PreToolUse line.
      return { events: [], touches: [], session: { id: sessionId } };
    default:
      return { events: [], touches: [], session: { id: sessionId } };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ingest-hooks`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atf.ts src/ingest/hooks.ts tests/ingest-hooks.test.ts
git commit -m "feat: normalize raw hook events into ATF"
```

---

### Task 5: Transcript normalizer

**Files:**
- Create: `src/ingest/transcripts.ts`
- Test: `tests/ingest-transcripts.test.ts`

**Interfaces:**
- Consumes: `classifyTool`, `makeUniqKey`, `AtfEvent`, `SessionPatch`, `TokenUsageInput` (Tasks 3–4).
- Produces:
  ```ts
  export interface TranscriptNorm {
    usage?: TokenUsageInput;
    events: AtfEvent[];
    session?: SessionPatch;
  }
  export function normalizeTranscriptLine(line: string): TranscriptNorm | null;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/ingest-transcripts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeTranscriptLine } from '../src/ingest/transcripts.js';

const assistantLine = JSON.stringify({
  type: 'assistant',
  uuid: 'm1',
  timestamp: '2026-07-05T14:02:12.000Z',
  sessionId: 's1',
  cwd: '/p/app',
  isSidechain: false,
  message: {
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
    content: [
      { type: 'text', text: 'running tests' },
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
    ],
  },
});

describe('normalizeTranscriptLine', () => {
  it('extracts token usage from assistant messages', () => {
    const out = normalizeTranscriptLine(assistantLine)!;
    expect(out.usage).toEqual({
      sessionId: 's1', messageUuid: 'm1', model: 'claude-sonnet-4-6',
      ts: '2026-07-05T14:02:12.000Z',
      inputTokens: 1200, outputTokens: 300, cacheReadTokens: 9000, cacheCreationTokens: 0,
    });
  });

  it('extracts tool_use blocks as transcript-source events', () => {
    const out = normalizeTranscriptLine(assistantLine)!;
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({
      sessionId: 's1', type: 'command', toolName: 'Bash', detail: 'npm test',
      source: 'transcript', sidechain: false,
    });
  });

  it('patches session with cwd, model and timestamps', () => {
    const out = normalizeTranscriptLine(assistantLine)!;
    expect(out.session).toEqual({
      id: 's1', projectDir: '/p/app', model: 'claude-sonnet-4-6',
      startedAt: '2026-07-05T14:02:12.000Z', endedAt: '2026-07-05T14:02:12.000Z',
    });
  });

  it('marks sidechain events', () => {
    const line = JSON.parse(assistantLine);
    line.isSidechain = true;
    line.uuid = 'm2';
    const out = normalizeTranscriptLine(JSON.stringify(line))!;
    expect(out.events[0].sidechain).toBe(true);
  });

  it('still patches timestamps for non-assistant lines with session info', () => {
    const out = normalizeTranscriptLine(JSON.stringify({
      type: 'user', sessionId: 's1', timestamp: '2026-07-05T14:05:00.000Z',
    }))!;
    expect(out.usage).toBeUndefined();
    expect(out.events).toHaveLength(0);
    expect(out.session).toEqual({
      id: 's1', startedAt: '2026-07-05T14:05:00.000Z', endedAt: '2026-07-05T14:05:00.000Z',
    });
  });

  it('returns null for malformed or unidentifiable lines', () => {
    expect(normalizeTranscriptLine('garbage')).toBeNull();
    expect(normalizeTranscriptLine('{"type":"summary"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ingest-transcripts`
Expected: FAIL — cannot resolve `../src/ingest/transcripts.js`.

- [ ] **Step 3: Implement `src/ingest/transcripts.ts`**

```ts
import { classifyTool, makeUniqKey } from '../atf.js';
import type { AtfEvent, SessionPatch, TokenUsageInput } from '../atf.js';

export interface TranscriptNorm {
  usage?: TokenUsageInput;
  events: AtfEvent[];
  session?: SessionPatch;
}

export function normalizeTranscriptLine(line: string): TranscriptNorm | null {
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  const sessionId: unknown = obj?.sessionId;
  const ts: unknown = obj?.timestamp;
  if (typeof sessionId !== 'string' || typeof ts !== 'string') return null;

  const session: SessionPatch = { id: sessionId, startedAt: ts, endedAt: ts };
  if (typeof obj.cwd === 'string') session.projectDir = obj.cwd;

  const out: TranscriptNorm = { events: [], session };
  if (obj.type !== 'assistant' || !obj.message) return out;

  const msg = obj.message;
  if (typeof msg.model === 'string') session.model = msg.model;

  if (msg.usage && typeof obj.uuid === 'string') {
    out.usage = {
      sessionId,
      messageUuid: obj.uuid,
      model: typeof msg.model === 'string' ? msg.model : null,
      ts,
      inputTokens: msg.usage.input_tokens ?? 0,
      outputTokens: msg.usage.output_tokens ?? 0,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
    };
  }

  const content = Array.isArray(msg.content) ? msg.content : [];
  content.forEach((block: any, i: number) => {
    if (block?.type !== 'tool_use' || typeof block.name !== 'string') return;
    const c = classifyTool(block.name, block.input);
    out.events.push({
      sessionId,
      ts,
      type: c.type,
      toolName: block.name,
      detail: c.detail,
      source: 'transcript',
      sidechain: !!obj.isSidechain,
      uniqKey: makeUniqKey('transcript', String(obj.uuid ?? ts), String(i), block.name),
    });
  });

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ingest-transcripts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ingest/transcripts.ts tests/ingest-transcripts.test.ts
git commit -m "feat: normalize Claude Code transcripts into ATF + token usage"
```

---

### Task 6: Ingest orchestrator

**Files:**
- Create: `src/ingest/ingest.ts`
- Test: `tests/ingest.test.ts`

**Interfaces:**
- Consumes: `normalizeHookLine` (Task 4), `normalizeTranscriptLine` (Task 5), `Store` (Task 3), `rawLogDir`/`claudeProjectsDir` (Task 2).
- Produces: `runIngest(store: Store): void` — reads all raw hook logs, then all transcripts; hook events win: transcript events are only inserted for sessions with zero hook-source events (backfill of old sessions). Token usage and session patches from transcripts always apply. Safe to re-run (idempotent).

- [ ] **Step 1: Write the failing tests**

`tests/ingest.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { runIngest } from '../src/ingest/ingest.js';

let tmp: string;
let store: Store;

function hookLine(payload: unknown, receivedAt = '2026-07-05T14:02:11.000Z'): string {
  return JSON.stringify({ received_at: receivedAt, payload }) + '\n';
}

function transcriptLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant', uuid: 'm1', timestamp: '2026-07-05T14:02:12.000Z',
    sessionId: 's-hooked', cwd: '/p/app', isSidechain: false,
    message: {
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    },
    ...over,
  }) + '\n';
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.FLIGHTBOX_HOME = path.join(tmp, 'fbx');
  process.env.FLIGHTBOX_CLAUDE_HOME = path.join(tmp, 'claude');

  fs.mkdirSync(path.join(tmp, 'fbx', 'raw'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'fbx', 'raw', 'hooks-2026-07-05.jsonl'),
    hookLine({ hook_event_name: 'SessionStart', session_id: 's-hooked', cwd: '/p/app' }) +
    hookLine({ hook_event_name: 'PreToolUse', session_id: 's-hooked', tool_name: 'Bash', tool_input: { command: 'ls' } }) +
    'garbage line\n',
  );

  const proj = path.join(tmp, 'claude', 'projects', '-p-app');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 's-hooked.jsonl'), transcriptLine());
  fs.writeFileSync(
    path.join(proj, 's-old.jsonl'),
    transcriptLine({ sessionId: 's-old', uuid: 'm9' }),
  );

  store = openStore(path.join(tmp, 'db.sqlite'));
});

afterEach(() => store.close());

describe('runIngest', () => {
  it('ingests hook events and transcript token usage', () => {
    runIngest(store);
    const s = store.findSession('s-hooked')!;
    expect(s.project_dir).toBe('/p/app');
    expect(s.model).toBe('claude-sonnet-4-6');
    expect(store.sessionTokens('s-hooked').input).toBe(100);
    expect(store.hookEventCount('s-hooked')).toBe(2); // session_start + command
  });

  it('skips transcript events for sessions that have hook events', () => {
    runIngest(store);
    const events = store.eventsForSession('s-hooked');
    expect(events.every((e) => e.source === 'hook')).toBe(true);
  });

  it('backfills transcript events for hook-less sessions', () => {
    runIngest(store);
    const events = store.eventsForSession('s-old');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'transcript', type: 'command', detail: 'ls' });
  });

  it('is idempotent across runs', () => {
    runIngest(store);
    const before = {
      sessions: store.listSessions().length,
      events: store.eventsForSession('s-hooked').length,
      tokens: store.sessionTokens('s-hooked'),
    };
    runIngest(store);
    expect(store.listSessions().length).toBe(before.sessions);
    expect(store.eventsForSession('s-hooked').length).toBe(before.events);
    expect(store.sessionTokens('s-hooked')).toEqual(before.tokens);
  });

  it('survives missing source directories', () => {
    process.env.FLIGHTBOX_HOME = path.join(tmp, 'nope1');
    process.env.FLIGHTBOX_CLAUDE_HOME = path.join(tmp, 'nope2');
    expect(() => runIngest(store)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ingest.test.ts`
Expected: FAIL — cannot resolve `../src/ingest/ingest.js`.

- [ ] **Step 3: Implement `src/ingest/ingest.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { rawLogDir, claudeProjectsDir } from '../paths.js';
import { normalizeHookLine } from './hooks.js';
import { normalizeTranscriptLine, type TranscriptNorm } from './transcripts.js';
import type { Store } from '../store.js';

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function listFiles(dir: string, ext: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function ingestHooks(store: Store): void {
  for (const file of listFiles(rawLogDir(), '.jsonl')) {
    for (const line of readLines(file)) {
      const norm = normalizeHookLine(line);
      if (!norm) continue;
      if (norm.session) store.upsertSession(norm.session);
      for (const e of norm.events) store.insertEvent(e);
      for (const t of norm.touches) store.insertFileTouch(t);
    }
  }
}

function ingestTranscripts(store: Store): void {
  const projectDirs = (() => {
    try {
      return fs
        .readdirSync(claudeProjectsDir(), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(claudeProjectsDir(), d.name));
    } catch {
      return [];
    }
  })();

  for (const dir of projectDirs) {
    for (const file of listFiles(dir, '.jsonl')) {
      const norms = readLines(file)
        .map(normalizeTranscriptLine)
        .filter((n): n is TranscriptNorm => n !== null);
      if (norms.length === 0) continue;

      for (const n of norms) {
        if (n.session) store.upsertSession(n.session);
        if (n.usage) store.insertTokenUsage(n.usage);
      }

      // Hook events are the primary source; transcripts only backfill
      // sessions recorded before flightbox was installed.
      const sessionId = norms.find((n) => n.session)?.session?.id;
      if (sessionId && store.hookEventCount(sessionId) === 0) {
        for (const n of norms) for (const e of n.events) store.insertEvent(e);
      }
    }
  }
}

export function runIngest(store: Store): void {
  ingestHooks(store);
  ingestTranscripts(store);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ingest.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: all tests pass.

```bash
git add src/ingest/ingest.ts tests/ingest.test.ts
git commit -m "feat: idempotent ingest orchestrator (hooks primary, transcripts backfill)"
```

---

### Task 7: CLI dispatcher + `list` command

**Files:**
- Create: `src/cli.ts`, `src/commands/list.ts`, `src/format.ts`
- Test: `tests/cli-list.test.ts`

**Interfaces:**
- Consumes: `openStore`, `runIngest`, `collect`, `VERSION`, `dbPath`.
- Produces:
  - `format.ts`: `formatTokens(n: number): string` (`532` → `"532"`, `45230` → `"45.2K"`, `1200000` → `"1.2M"`), `pad(s: string, w: number): string`.
  - `commands/list.ts`: `cmdList(store: Store): void` — prints table to stdout.
  - `cli.ts`: `main(argv: string[]): Promise<number>` — routes `collect | install | list | show | stats | --version | help`; `list/show/stats` open store at `dbPath()` and call `runIngest` first. Has shebang `#!/usr/bin/env node` and a footer that runs `main(process.argv.slice(2))` when executed directly, setting `process.exitCode`. The `collect` route always returns 0.

- [ ] **Step 1: Write the failing tests**

`tests/cli-list.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';
import { formatTokens } from '../src/format.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.FLIGHTBOX_HOME = path.join(tmp, 'fbx');
  process.env.FLIGHTBOX_CLAUDE_HOME = path.join(tmp, 'claude');

  // one past transcript session so list has content (backfill path)
  const proj = path.join(tmp, 'claude', 'projects', '-p-app');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'abcd1234-x.jsonl'), JSON.stringify({
    type: 'assistant', uuid: 'm1', timestamp: '2026-07-05T14:02:12.000Z',
    sessionId: 'abcd1234-x', cwd: '/p/app',
    message: {
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 45230, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    },
  }) + '\n');
});

describe('formatTokens', () => {
  it('formats plain, K and M', () => {
    expect(formatTokens(532)).toBe('532');
    expect(formatTokens(45230)).toBe('45.2K');
    expect(formatTokens(1200000)).toBe('1.2M');
  });
});

describe('cli list', () => {
  it('auto-ingests and prints sessions table', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await main(['list']);
    expect(code).toBe(0);
    const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('SESSION');
    expect(out).toContain('abcd1234');
    expect(out).toContain('app'); // project basename
    expect(out).toContain('45.3K'); // 45230 + 100
    log.mockRestore();
  });

  it('returns 1 and prints help for unknown command', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['wat'])).toBe(1);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cli-list`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 3: Implement `src/format.ts`, `src/commands/list.ts`, `src/cli.ts`**

`src/format.ts`:
```ts
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s.padEnd(w);
}
```

`src/commands/list.ts`:
```ts
import path from 'node:path';
import { formatTokens, pad } from '../format.js';
import type { Store } from '../store.js';

export function cmdList(store: Store): void {
  const rows = store.listSessions();
  console.log(`${pad('SESSION', 10)}${pad('PROJECT', 22)}${pad('STARTED', 18)}${pad('EVENTS', 8)}TOKENS`);
  for (const r of rows) {
    const started = (r.started_at ?? '').slice(0, 16).replace('T', ' ');
    const project = r.project_dir ? path.basename(r.project_dir) : '(unknown)';
    console.log(
      `${pad(r.id.slice(0, 8), 10)}${pad(project, 22)}${pad(started, 18)}${pad(String(r.event_count), 8)}${formatTokens(r.total_tokens)}`,
    );
  }
  if (rows.length === 0) {
    console.log('(no sessions yet — run some agent sessions or check ~/.claude/projects)');
  }
}
```

`src/cli.ts`:
```ts
#!/usr/bin/env node
import { collect } from './collector.js';
import { openStore } from './store.js';
import { runIngest } from './ingest/ingest.js';
import { cmdList } from './commands/list.js';
import { dbPath, flightboxHome } from './paths.js';
import { VERSION } from './version.js';
import fs from 'node:fs';

const HELP = `flightbox ${VERSION} — local flight recorder for coding agent sessions

Usage:
  flightbox install     register hooks in ~/.claude/settings.json
  flightbox list        recent sessions
  flightbox show <id>   session timeline
  flightbox stats       token usage aggregates
  flightbox collect     (internal) hook entry point, reads stdin
`;

function withStore<T>(fn: (store: ReturnType<typeof openStore>) => T): T {
  fs.mkdirSync(flightboxHome(), { recursive: true });
  const store = openStore(dbPath());
  try {
    runIngest(store);
    return fn(store);
  } finally {
    store.close();
  }
}

export async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  switch (cmd) {
    case 'collect':
      await collect(process.stdin);
      return 0; // contract: never non-zero
    case 'list':
      withStore((s) => cmdList(s));
      return 0;
    case '--version':
    case '-v':
      console.log(VERSION);
      return 0;
    case 'help':
    case '--help':
    case undefined:
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n\n${HELP}`);
      return 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
```

Note: `show`, `stats`, `install` routes are added in Tasks 8–10; until then they fall through to `Unknown command`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cli-list`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/commands/list.ts src/format.ts tests/cli-list.test.ts
git commit -m "feat: CLI dispatcher and list command with auto-ingest"
```

---

### Task 8: `show` command

**Files:**
- Create: `src/commands/show.ts`
- Modify: `src/cli.ts` (add `show` route)
- Test: `tests/cli-show.test.ts`

**Interfaces:**
- Consumes: `Store.findSession`, `Store.eventsForSession`, `Store.sessionTokens`, `Store.fileTouchCount`, `formatTokens`.
- Produces: `cmdShow(store: Store, idPrefix: string): number` — 0 on success, 1 if session not found. Sidechain events are indented with two spaces and `↳ `.

- [ ] **Step 1: Write the failing tests**

`tests/cli-show.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cli-show`
Expected: FAIL — cannot resolve `../src/commands/show.js`.

- [ ] **Step 3: Implement `src/commands/show.ts` and wire the route**

`src/commands/show.ts`:
```ts
import { formatTokens, pad } from '../format.js';
import type { Store } from '../store.js';

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '?';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return '?';
  const mins = Math.round(ms / 60_000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`;
}

export function cmdShow(store: Store, idPrefix: string): number {
  const s = store.findSession(idPrefix);
  if (!s) {
    console.error(`No session matching '${idPrefix}'. Try: flightbox list`);
    return 1;
  }
  const tokens = store.sessionTokens(s.id);
  console.log(`session   ${s.id}`);
  console.log(`project   ${s.project_dir ?? '(unknown)'}`);
  console.log(`model     ${s.model ?? '(unknown)'}`);
  console.log(`duration  ${duration(s.started_at, s.ended_at)}`);
  console.log(
    `tokens    ${formatTokens(tokens.input + tokens.output)} (in ${formatTokens(tokens.input)} / out ${formatTokens(tokens.output)} / cache-read ${formatTokens(tokens.cacheRead)})`,
  );
  console.log(`files     ${store.fileTouchCount(s.id)} touched`);
  console.log('');

  for (const e of store.eventsForSession(s.id)) {
    const time = e.ts.slice(11, 19);
    const prefix = e.sidechain ? '  ↳ ' : '';
    const tool = e.toolName ? `${e.toolName}  ` : '';
    console.log(`${time}  ${prefix}${pad(e.type, 15)}${tool}${e.detail}`);
  }
  return 0;
}
```

Add to the `switch` in `src/cli.ts` (after `case 'list'`):
```ts
    case 'show': {
      const idPrefix = argv[1];
      if (!idPrefix) {
        console.error('Usage: flightbox show <session-id-prefix>');
        return 1;
      }
      return withStore((s) => cmdShow(s, idPrefix));
    }
```
And add the import at the top of `src/cli.ts`:
```ts
import { cmdShow } from './commands/show.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cli-show`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/show.ts src/cli.ts tests/cli-show.test.ts
git commit -m "feat: show command prints session summary and timeline"
```

---

### Task 9: `stats` command

**Files:**
- Create: `src/commands/stats.ts`
- Modify: `src/cli.ts` (add `stats` route)
- Test: `tests/cli-stats.test.ts`

**Interfaces:**
- Consumes: `Store.statsByDay`, `Store.statsByProject`, `formatTokens`, `pad`.
- Produces: `cmdStats(store: Store): void` — prints "TOKENS BY DAY (last 14)" then "TOKENS BY PROJECT".

- [ ] **Step 1: Write the failing tests**

`tests/cli-stats.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cli-stats`
Expected: FAIL — cannot resolve `../src/commands/stats.js`.

- [ ] **Step 3: Implement `src/commands/stats.ts` and wire the route**

`src/commands/stats.ts`:
```ts
import { formatTokens, pad } from '../format.js';
import type { Store } from '../store.js';

export function cmdStats(store: Store): void {
  console.log('TOKENS BY DAY (last 14)');
  for (const r of store.statsByDay()) {
    console.log(`  ${pad(r.day, 12)}${formatTokens(r.tokens)}`);
  }
  console.log('');
  console.log('TOKENS BY PROJECT');
  for (const r of store.statsByProject()) {
    console.log(`  ${pad(r.project, 40)}${formatTokens(r.tokens)}`);
  }
}
```

Add to the `switch` in `src/cli.ts`:
```ts
    case 'stats':
      withStore((s) => cmdStats(s));
      return 0;
```
And the import:
```ts
import { cmdStats } from './commands/stats.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cli-stats`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/commands/stats.ts src/cli.ts tests/cli-stats.test.ts
git commit -m "feat: stats command with per-day and per-project token totals"
```

---

### Task 10: `install` command, packaging, README

**Files:**
- Create: `src/commands/install.ts`, `README.md`
- Modify: `src/cli.ts` (add `install` route)
- Test: `tests/install.test.ts`

**Interfaces:**
- Consumes: `claudeSettingsPath`, `flightboxHome`.
- Produces:
  ```ts
  export function buildHookConfig(settings: Record<string, unknown>): Record<string, unknown>; // pure, idempotent
  export function cmdInstall(): number;
  ```
  `buildHookConfig` adds `{ hooks: [{ type: 'command', command: 'flightbox collect' }] }` under `hooks.SessionStart`, `hooks.PreToolUse`, `hooks.PostToolUse`, `hooks.Stop`, preserving everything already present; running it twice adds nothing.

- [ ] **Step 1: Write the failing tests**

`tests/install.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHookConfig, cmdInstall } from '../src/commands/install.js';
import { claudeSettingsPath } from '../src/paths.js';

const EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'];

describe('buildHookConfig', () => {
  it('adds flightbox collect to all four events on empty settings', () => {
    const out = buildHookConfig({}) as any;
    for (const ev of EVENTS) {
      const cmds = JSON.stringify(out.hooks[ev]);
      expect(cmds).toContain('flightbox collect');
    }
  });

  it('preserves existing hooks and is idempotent', () => {
    const existing = {
      permissions: { allow: ['Bash(ls:*)'] },
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool.sh' }] },
        ],
      },
    };
    const once = buildHookConfig(existing) as any;
    const twice = buildHookConfig(once) as any;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(JSON.stringify(once.hooks.PreToolUse)).toContain('other-tool.sh');
    expect(once.permissions.allow).toEqual(['Bash(ls:*)']);
    const flightboxEntries = JSON.stringify(once.hooks.PreToolUse).match(/flightbox collect/g);
    expect(flightboxEntries).toHaveLength(1);
  });
});

describe('cmdInstall', () => {
  it('writes settings file, creating it if missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
    process.env.FLIGHTBOX_HOME = path.join(tmp, 'fbx');
    process.env.FLIGHTBOX_CLAUDE_HOME = path.join(tmp, 'claude');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(cmdInstall()).toBe(0);
    const written = JSON.parse(fs.readFileSync(claudeSettingsPath(), 'utf8'));
    expect(JSON.stringify(written.hooks.Stop)).toContain('flightbox collect');
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- install`
Expected: FAIL — cannot resolve `../src/commands/install.js`.

- [ ] **Step 3: Implement `src/commands/install.ts` and wire the route**

`src/commands/install.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { claudeSettingsPath, flightboxHome } from '../paths.js';

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'] as const;
const COLLECT_ENTRY = { hooks: [{ type: 'command', command: 'flightbox collect' }] };

export function buildHookConfig(settings: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(settings);
  const hooks: Record<string, unknown[]> = (out.hooks as Record<string, unknown[]>) ?? {};
  out.hooks = hooks;
  for (const ev of HOOK_EVENTS) {
    const entries = Array.isArray(hooks[ev]) ? hooks[ev] : [];
    hooks[ev] = entries;
    if (!JSON.stringify(entries).includes('flightbox collect')) {
      entries.push(structuredClone(COLLECT_ENTRY));
    }
  }
  return out;
}

export function cmdInstall(): number {
  try {
    fs.mkdirSync(flightboxHome(), { recursive: true });
    const file = claudeSettingsPath();
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      // missing or unparseable settings file: start from empty
    }
    const updated = buildHookConfig(settings);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
    console.log(`flightbox hooks registered in ${file}`);
    console.log('Past sessions are already visible: try `flightbox list`');
    return 0;
  } catch (err) {
    console.error(`install failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
```

Add to the `switch` in `src/cli.ts`:
```ts
    case 'install':
      return cmdInstall();
```
And the import:
```ts
import { cmdInstall } from './commands/install.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- install`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `README.md`**

```markdown
# flightbox

Local-first flight recorder for coding agent sessions. Records what your
agent actually did — tools called, files touched, commands run, tokens
spent — and turns it into an auditable timeline.

100% local. Zero telemetry. Your session data never leaves your machine.

## Install

```bash
npm install -g flightbox
flightbox install   # registers hooks in ~/.claude/settings.json
flightbox list      # your past sessions are already there
```

## Commands

| Command | What it does |
|---|---|
| `flightbox install` | Register collection hooks (Claude Code) |
| `flightbox list` | Recent sessions: project, duration, events, tokens |
| `flightbox show <id>` | Timeline of one session |
| `flightbox stats` | Token usage by day and by project |

## How it works

Claude Code hooks append raw events to `~/.flightbox/raw/` (the collector
never fails and never slows your session). Transcripts under
`~/.claude/projects/` are parsed on demand for token usage — which is why
sessions from before you installed flightbox show up too. Everything is
normalized into SQLite at `~/.flightbox/db.sqlite`.

## Status

MVP: Claude Code only. The ingestion layer is adapter-based — other agents
are on the roadmap. Web UI with claims-vs-reality analysis is next.
```

- [ ] **Step 6: Full suite, build, manual smoke test, commit**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

Run: `node dist/cli.js --version`
Expected: `0.1.0`

Run: `FLIGHTBOX_HOME=/tmp/fbx-smoke node dist/cli.js list`
Expected: table header plus real sessions from `~/.claude/projects` (transcript backfill), no errors.

```bash
git add src/commands/install.ts src/cli.ts tests/install.test.ts README.md
git commit -m "feat: install command, README and packaging"
```

---

## Out of Scope (Plan 2)

- Web UI (`flightbox ui`): Node server exposing SQLite as JSON + Vite/React SPA.
- Claims-vs-reality v1 (mentioned-vs-edited files) — lives in the UI per the spec.
- Everything in the spec's post-MVP roadmap.
