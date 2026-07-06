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
    fetchSession(id).then(setDetail).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p role="alert">Failed to load session: {error}</p>;
  if (!detail) return <p>Loading…</p>;
  const t = detail.tokens;

  return (
    <article>
      <header>
        <h2>{detail.project ?? '(unknown project)'}</h2>
        <dl>
          <dt>Model</dt><dd>{detail.model ?? '—'}</dd>
          <dt>Duration</dt><dd>{formatDuration(detail.durationMs)}</dd>
          <dt>Tokens</dt><dd>in {formatTokens(t.input)} · out {formatTokens(t.output)} · cache r{formatTokens(t.cacheRead)}/c{formatTokens(t.cacheCreation)}</dd>
          <dt>Files</dt><dd>{detail.fileCount}</dd>
          <dt>Commands</dt><dd>{detail.commandCount}</dd>
          <dt>Subagents</dt><dd>{detail.subagentCount}</dd>
        </dl>
      </header>
      <Timeline events={detail.events} />
      <ClaimsPanel id={id} />
    </article>
  );
}
