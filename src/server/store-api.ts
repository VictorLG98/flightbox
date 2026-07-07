import type { Store, MetricsFilter } from '../store.js';

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
export interface MetricsDto {
  totals: {
    sessions: number;
    tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
    files: number;
    avgDurationMs: number | null;
  };
  reliability: {
    sessionsWithHooks: number;
    sessionsWithDiscrepancy: number;
    discrepancyRate: number | null;
  };
  calendar: Array<{ day: string; sessions: number; tokens: number }>;
  byProject: Array<{ project: string; sessions: number; tokens: number }>;
  topTools: Array<{ tool: string; count: number }>;
  streak: { current: number; longest: number };
  projects: string[]; // every known project (unfiltered), for the filter selector
  cost: { totalUsd: number; byModel: Array<{ model: string; usd: number }> };
  eventTypes: Array<{ type: string; count: number }>;
  topFiles: Array<{ path: string; touches: number }>;
  topFolders: Array<{ folder: string; touches: number }>;
  hourly: Array<{ weekday: number; hour: number; count: number }>;
}

/** Per-1M-token USD list prices by model family (input, output). Cache reads bill
 *  at ~0.1× input and cache writes at ~1.25× input. Estimates only — Anthropic
 *  list prices as of the current model lineup; historical models are approximated
 *  by family, and unknown models cost nothing. */
const MODEL_RATES: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /fable|mythos/, input: 10, output: 50 },
  { match: /opus/, input: 5, output: 25 },
  { match: /sonnet/, input: 3, output: 15 },
  { match: /haiku/, input: 1, output: 5 },
];

export function estimateCostUsd(
  model: string,
  t: { input: number; output: number; cacheRead: number; cacheCreation: number },
): number {
  const rate = MODEL_RATES.find((r) => r.match.test(model.toLowerCase()));
  if (!rate) return 0;
  const perM = (tokens: number, price: number) => (tokens / 1_000_000) * price;
  return (
    perM(t.input, rate.input) +
    perM(t.output, rate.output) +
    perM(t.cacheRead, rate.input * 0.1) +
    perM(t.cacheCreation, rate.input * 1.25)
  );
}

/** Parent folder of a POSIX-ish path ('/a/b/c.ts' -> '/a/b'); '(root)' when none. */
function dirOf(path: string): string {
  const i = path.replace(/\/+$/, '').lastIndexOf('/');
  return i <= 0 ? '(root)' : path.slice(0, i);
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

/** Longest run of consecutive calendar days, and the run ending on the most
 *  recent active day. Input days are 'YYYY-MM-DD' strings; order doesn't matter. */
export function streakOf(days: string[]): { current: number; longest: number } {
  if (days.length === 0) return { current: 0, longest: 0 };
  const sorted = [...new Set(days)].sort();
  const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
  let longest = 1;
  let run = 1;
  let current = 1; // run ending at the most recent day
  for (let i = 1; i < sorted.length; i++) {
    run = dayNum(sorted[i]) - dayNum(sorted[i - 1]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  current = run; // `run` now holds the streak ending on the last (most recent) day
  return { current, longest };
}

export function metricsDto(store: Store, filter: MetricsFilter = {}): MetricsDto {
  const sessions = store.filteredSessions(filter);
  const durations = sessions
    .map((s) => durationMs(s.started_at, s.ended_at))
    .filter((d): d is number => d !== null);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  let sessionsWithHooks = 0;
  let sessionsWithDiscrepancy = 0;
  for (const s of sessions) {
    if (store.hookEventCount(s.id) > 0) sessionsWithHooks++;
    if (discrepancy(store, s.id)) sessionsWithDiscrepancy++;
  }

  const calendar = store.activityByDay(filter);
  const streak = streakOf(calendar.filter((d) => d.sessions > 0).map((d) => d.day));

  const byModel = store.tokensByModel(filter).map((m) => ({ model: m.model, usd: estimateCostUsd(m.model, m) }));
  const totalUsd = byModel.reduce((a, b) => a + b.usd, 0);

  const fileStats = store.fileTouchStats(filter);
  const topFiles = fileStats.slice(0, 12);
  const folderTotals = new Map<string, number>();
  for (const f of fileStats) folderTotals.set(dirOf(f.path), (folderTotals.get(dirOf(f.path)) ?? 0) + f.touches);
  const topFolders = [...folderTotals.entries()]
    .map(([folder, touches]) => ({ folder, touches }))
    .sort((a, b) => b.touches - a.touches || a.folder.localeCompare(b.folder))
    .slice(0, 12);

  return {
    totals: {
      sessions: sessions.length,
      tokens: store.totalTokens(filter),
      files: store.totalFileTouches(filter),
      avgDurationMs,
    },
    reliability: {
      sessionsWithHooks,
      sessionsWithDiscrepancy,
      discrepancyRate: sessionsWithHooks ? sessionsWithDiscrepancy / sessionsWithHooks : null,
    },
    calendar,
    byProject: store.activityByProject(filter),
    topTools: store.topTools(8, filter),
    streak,
    projects: store.projectNames(),
    cost: { totalUsd, byModel },
    eventTypes: store.eventTypeBreakdown(filter),
    topFiles,
    topFolders,
    hourly: store.activityByHour(filter),
  };
}

export function claimsDto(store: Store, id: string): ClaimsDto | null {
  const s = store.findSession(id);
  if (!s) return null;
  return {
    sessionId: s.id,
    hooksPresent: store.hookEventCount(s.id) > 0,
    files: store.claimsForSession(s.id).map(({ path, status }) => ({ path, status })),
  };
}
