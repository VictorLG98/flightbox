import { useMemo, useState } from 'react';
import type { EventDto } from './types.js';

const TYPES = ['all', 'tool_call', 'file_touch', 'command', 'subagent_spawn', 'session_start', 'session_end'] as const;

export function Timeline({ events }: { events: EventDto[] }) {
  const [type, setType] = useState<string>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) =>
      (type === 'all' || e.type === type) &&
      (q === '' || e.detail.toLowerCase().includes(q) || (e.toolName ?? '').toLowerCase().includes(q)),
    );
  }, [events, type, query]);

  return (
    <section className="panel">
      <p className="section-label">Timeline · {visible.length}/{events.length}</p>
      <div className="controls">
        <label>
          <span>Filter type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          <span>Search</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="text or path" />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="feed-empty">No events match.</p>
      ) : (
        <ol className="feed">
          {visible.map((e, i) => (
            <li
              key={i}
              className={`event ${e.sidechain ? 'sidechain' : ''}`}
              data-testid={e.sidechain ? `sidechain-${e.detail}` : undefined}
              style={{ ['--i' as string]: i }}
            >
              <time>{new Date(e.ts).toLocaleTimeString()}</time>
              <span className="body">
                <span className={`chip ${e.type}`}>{e.type}</span>
                {e.toolName && <code className="tool">{e.toolName}</code>}
                <span className="detail">{e.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
