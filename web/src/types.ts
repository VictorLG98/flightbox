// Mirror of src/server/store-api.ts DTOs. This is the API boundary: the SPA never
// imports Node/SQLite modules, so shapes are duplicated here intentionally.
export interface SessionListItem {
  id: string; project: string | null; startedAt: string | null; endedAt: string | null;
  durationMs: number | null; tokens: number; fileCount: number; hasDiscrepancy: boolean;
}
export interface EventDto {
  ts: string; type: string; toolName: string | null; detail: string; sidechain: boolean;
}
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
  projects: string[];
  cost: { totalUsd: number; byModel: Array<{ model: string; usd: number }> };
  eventTypes: Array<{ type: string; count: number }>;
  topFiles: Array<{ path: string; touches: number }>;
  topFolders: Array<{ folder: string; touches: number }>;
  hourly: Array<{ weekday: number; hour: number; count: number }>;
}
