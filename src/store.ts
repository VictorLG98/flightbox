import Database from 'better-sqlite3';
import { dbPath } from './paths.js';
import type { AtfEvent, FileTouchInput, SessionPatch, TokenUsageInput, ToolOutcomeInput } from './atf.js';

export interface SessionSummary {
  id: string;
  project_dir: string | null;
  started_at: string | null;
  ended_at: string | null;
  model: string | null;
  event_count: number;
  total_tokens: number;
}

export interface ClaimRow {
  path: string;
  status: 'succeeded' | 'failed' | 'attempted';
}

export interface Store {
  upsertSession(p: SessionPatch): void;
  insertEvent(e: AtfEvent): void;
  insertFileTouch(t: FileTouchInput): void;
  insertTokenUsage(u: TokenUsageInput): void;
  insertToolOutcome(o: ToolOutcomeInput): void;
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
  claimsForSession(sessionId: string): ClaimRow[];
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

  const listSql = db.prepare(`${LIST_SQL} ORDER BY s.started_at DESC`);
  const findSessionSql = db.prepare(`${LIST_SQL} WHERE s.id GLOB ? || '*' LIMIT 1`);
  const eventsForSessionSql = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts, id');
  const hookEventCountSql = db.prepare("SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND source = 'hook'");
  const fileTouchCountSql = db.prepare('SELECT COUNT(DISTINCT path) AS n FROM file_touches WHERE session_id = ?');
  const sessionTokensSql = db.prepare(`
    SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output,
           COALESCE(SUM(cache_read_tokens),0) AS cacheRead, COALESCE(SUM(cache_creation_tokens),0) AS cacheCreation
    FROM token_usage WHERE session_id = ?
  `);
  const statsByDaySql = db.prepare(`
    SELECT substr(ts, 1, 10) AS day, SUM(input_tokens + output_tokens) AS tokens
    FROM token_usage GROUP BY day ORDER BY day DESC LIMIT 14
  `);
  const statsByProjectSql = db.prepare(`
    SELECT COALESCE(s.project_dir, '(unknown)') AS project, SUM(t.input_tokens + t.output_tokens) AS tokens
    FROM token_usage t LEFT JOIN sessions s ON s.id = t.session_id
    GROUP BY project ORDER BY tokens DESC
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
      listSql.all() as SessionSummary[],
    findSession: (idPrefix) =>
      findSessionSql.get(idPrefix) as SessionSummary | undefined,
    eventsForSession: (sessionId) =>
      (eventsForSessionSql.all(sessionId) as any[]).map(rowToEvent),
    hookEventCount: (sessionId) =>
      (hookEventCountSql.get(sessionId) as any).n,
    fileTouchCount: (sessionId) =>
      (fileTouchCountSql.get(sessionId) as any).n,
    sessionTokens: (sessionId) => {
      const r = sessionTokensSql.get(sessionId) as any;
      return { input: r.input, output: r.output, cacheRead: r.cacheRead, cacheCreation: r.cacheCreation };
    },
    statsByDay: () =>
      statsByDaySql.all() as Array<{ day: string; tokens: number }>,
    statsByProject: () =>
      statsByProjectSql.all() as Array<{ project: string; tokens: number }>,
    insertToolOutcome: (o) =>
      insOutcome.run({ ...o, success: o.success === null ? null : o.success ? 1 : 0 }),
    claimsForSession: (sessionId) =>
      (claimsSql.all(sessionId) as Array<{ path: string; any_success: number; any_failure: number }>).map((r) => ({
        path: r.path,
        status: r.any_success ? 'succeeded' : r.any_failure ? 'failed' : 'attempted',
      })),
    close: () => db.close(),
  };
}
