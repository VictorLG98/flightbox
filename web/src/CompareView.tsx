import { useEffect, useState } from 'react';
import { fetchSession } from './api.js';
import type { SessionDetail } from './types.js';
import { formatTokens, formatDuration } from './format.js';

const short = (id: string) => id.slice(0, 8);

/** Side-by-side comparison of two sessions across the headline metrics. */
export function CompareView({ a, b }: { a: string; b: string }) {
  const [sessions, setSessions] = useState<[SessionDetail, SessionDetail] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchSession(a), fetchSession(b)])
      .then((pair) => setSessions(pair as [SessionDetail, SessionDetail]))
      .catch((e) => setError(String(e)));
  }, [a, b]);

  if (error) return <p className="state error" role="alert">Failed to load sessions: {error}</p>;
  if (sessions === null) return <p className="state">Loading…</p>;

  const [x, y] = sessions;
  const tokens = (s: SessionDetail) => s.tokens.input + s.tokens.output;
  const rows: Array<[string, string, string]> = [
    ['Project', x.project ?? '—', y.project ?? '—'],
    ['Model', x.model ?? '—', y.model ?? '—'],
    ['Duration', formatDuration(x.durationMs), formatDuration(y.durationMs)],
    ['Tokens', formatTokens(tokens(x)), formatTokens(tokens(y))],
    ['Cache read', formatTokens(x.tokens.cacheRead), formatTokens(y.tokens.cacheRead)],
    ['Files touched', String(x.fileCount), String(y.fileCount)],
    ['Commands', String(x.commandCount), String(y.commandCount)],
    ['Subagents', String(x.subagentCount), String(y.subagentCount)],
    ['Events', String(x.events.length), String(y.events.length)],
  ];

  return (
    <>
      <a className="back" href="#/sessions">← sessions</a>
      <p className="section-label">Compare sessions</p>
      <table className="logtable compare">
        <thead>
          <tr>
            <th />
            <th><a href={`#/session/${encodeURIComponent(x.id)}`}>{short(x.id)}</a></th>
            <th><a href={`#/session/${encodeURIComponent(y.id)}`}>{short(y.id)}</a></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, xv, yv], i) => (
            <tr key={label} style={{ ['--i' as string]: i }}>
              <td className="dim">{label}</td>
              <td className={xv !== yv ? 'num diff' : 'num'}>{xv}</td>
              <td className={xv !== yv ? 'num diff' : 'num'}>{yv}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
