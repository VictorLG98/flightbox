import { useEffect, useState } from 'react';
import { fetchSession } from './api.js';
import type { SessionDetail } from './types.js';
import { ClaimsPanel } from './ClaimsPanel.js';
import { formatTokens, formatDuration } from './format.js';
import { Timeline } from './Timeline.js';

export function SessionView({ id }: { id: string }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    fetchSession(id).then(setDetail).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="state error" role="alert">Failed to load session: {error}</p>;
  if (!detail) return <p className="state">Loading…</p>;
  const t = detail.tokens;

  const gauges = [
    { label: 'Model', value: detail.model ?? '—', cls: 'amber' },
    { label: 'Duration', value: formatDuration(detail.durationMs) },
    { label: 'Files', value: String(detail.fileCount) },
    { label: 'Commands', value: String(detail.commandCount) },
    { label: 'Subagents', value: String(detail.subagentCount) },
  ];

  return (
    <article>
      <a className="back" href="#/">◄ All sessions</a>

      <header className="summary-head">
        <div className="sid">SESSION {detail.id.slice(0, 8)}</div>
        <h1 className="project-name">{detail.project ?? '(unknown project)'}</h1>
      </header>

      <div className="gauges">
        {gauges.map((g, i) => (
          <div className="gauge" key={g.label} style={{ ['--i' as string]: i }}>
            <div className="label">{g.label}</div>
            <div className={`value ${g.cls ?? ''}`}>{g.value}</div>
          </div>
        ))}
        <div className="gauge" style={{ ['--i' as string]: gauges.length }}>
          <div className="label">Tokens</div>
          <div className="value cyan">
            {formatTokens(t.input + t.output)}
            <small>in {formatTokens(t.input)} · out {formatTokens(t.output)} · cache {formatTokens(t.cacheRead + t.cacheCreation)}</small>
          </div>
        </div>
      </div>

      <Timeline events={detail.events} />
      <ClaimsPanel id={id} />
    </article>
  );
}
