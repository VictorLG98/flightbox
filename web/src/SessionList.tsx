import { useEffect, useState } from 'react';
import { fetchSessions } from './api.js';
import type { SessionListItem } from './types.js';
import { formatTokens, formatDuration } from './format.js';

const shortId = (id: string) => id.slice(0, 8);

export function SessionList({ day }: { day?: string }) {
  const [all, setAll] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => {
    fetchSessions().then(setAll).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="state error" role="alert">Failed to load sessions: {error}</p>;
  if (all === null) return <p className="state">Loading…</p>;

  const needle = q.trim().toLowerCase();
  const sessions = all.filter((s) => {
    if (day && s.startedAt?.slice(0, 10) !== day) return false;
    if (!needle) return true;
    return (
      s.id.toLowerCase().includes(needle) ||
      (s.project ?? '').toLowerCase().includes(needle) ||
      (s.startedAt ?? '').toLowerCase().includes(needle)
    );
  });

  // Selecting up to two sessions enables a side-by-side compare.
  const toggle = (id: string) =>
    setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : cur));

  return (
    <>
      {day && (
        <p className="filter-banner">
          <span>Day filter · <b>{day}</b></span>
          <a href="#/sessions">clear</a>
        </p>
      )}
      <div className="controls">
        <label>
          Search
          <input
            type="search"
            placeholder="project, id, or date…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search sessions"
          />
        </label>
      </div>
      {sel.length > 0 && (
        <p className="filter-banner">
          <span>{sel.length}/2 selected for compare</span>
          {sel.length === 2 ? (
            <a href={`#/compare/${encodeURIComponent(sel[0])}/${encodeURIComponent(sel[1])}`}>compare →</a>
          ) : (
            <a href="#/sessions" onClick={(e) => { e.preventDefault(); setSel([]); }}>clear</a>
          )}
        </p>
      )}
      {sessions.length === 0 ? (
        <p className="state">{day ? `No sessions on ${day}.` : needle ? 'No sessions match your search.' : 'No sessions recorded yet.'}</p>
      ) : (
        <>
          <p className="section-label">Recorded sessions · {sessions.length}</p>
          <table className="logtable">
            <thead>
              <tr>
                <th></th><th>Session</th><th>Project</th><th>Started</th>
                <th>Duration</th><th>Tokens</th><th>Files</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id} style={{ ['--i' as string]: i }}>
                  <td className="pick">
                    <input
                      type="checkbox"
                      checked={sel.includes(s.id)}
                      disabled={!sel.includes(s.id) && sel.length >= 2}
                      onChange={() => toggle(s.id)}
                      aria-label={`Select ${shortId(s.id)} to compare`}
                    />
                  </td>
                  <td className="id"><a href={`#/session/${encodeURIComponent(s.id)}`}>{shortId(s.id)}</a></td>
                  <td className="project">{s.project ?? '—'}</td>
                  <td className="dim">{s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'}</td>
                  <td className="dim">{formatDuration(s.durationMs)}</td>
                  <td className="num">{formatTokens(s.tokens)}</td>
                  <td className="num">{s.fileCount}</td>
                  <td className="badge">
                    {s.hasDiscrepancy && (
                      <span className="warn-led" data-testid="discrepancy-badge" title="Claims-vs-reality discrepancy">⚠</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
