import { useEffect, useState } from 'react';
import { fetchSessions } from './api.js';
import type { SessionListItem } from './types.js';
import { formatTokens, formatDuration } from './format.js';

export function SessionList() {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions().then(setSessions).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p role="alert">Failed to load sessions: {error}</p>;
  if (sessions === null) return <p>Loading…</p>;
  if (sessions.length === 0) return <p>No sessions recorded yet.</p>;

  const shortId = (id: string) => id.slice(0, 8);
  return (
    <table>
      <thead>
        <tr><th>Session</th><th>Project</th><th>Started</th><th>Duration</th><th>Tokens</th><th>Files</th><th></th></tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td><a href={`#/session/${encodeURIComponent(s.id)}`}>{shortId(s.id)}</a></td>
            <td>{s.project ?? '—'}</td>
            <td>{s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'}</td>
            <td>{formatDuration(s.durationMs)}</td>
            <td>{formatTokens(s.tokens)}</td>
            <td>{s.fileCount}</td>
            <td>{s.hasDiscrepancy && <span data-testid="discrepancy-badge" title="Claims-vs-reality discrepancy">⚠</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
