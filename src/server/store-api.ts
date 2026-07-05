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
