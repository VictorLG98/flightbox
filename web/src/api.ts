import type { SessionListItem, SessionDetail, ClaimsDto, MetricsDto } from './types.js';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed: ${url} (${res.status})`);
  return (await res.json()) as T;
}

export function fetchSessions(): Promise<SessionListItem[]> {
  return getJson('/api/sessions');
}
export function fetchSession(id: string): Promise<SessionDetail> {
  return getJson(`/api/sessions/${encodeURIComponent(id)}`);
}
export function fetchClaims(id: string): Promise<ClaimsDto> {
  return getJson(`/api/sessions/${encodeURIComponent(id)}/claims`);
}
export interface MetricsParams { project?: string | null; from?: string | null; to?: string | null }
export function fetchMetrics(params: MetricsParams = {}): Promise<MetricsDto> {
  const q = new URLSearchParams();
  if (params.project) q.set('project', params.project);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return getJson(`/api/metrics${qs ? `?${qs}` : ''}`);
}
