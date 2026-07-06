import type { SessionListItem, SessionDetail, ClaimsDto } from './types.js';

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
