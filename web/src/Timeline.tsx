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
    <section>
      <div>
        <label>
          Filter type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Search
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="text or path" />
        </label>
      </div>
      <ol>
        {visible.map((e, i) => (
          <li key={i} data-testid={e.sidechain ? `sidechain-${e.detail}` : undefined} style={{ marginLeft: e.sidechain ? 24 : 0 }}>
            <time>{new Date(e.ts).toLocaleTimeString()}</time>
            <span> {e.type} </span>
            {e.toolName && <code>{e.toolName}</code>}
            <span> {e.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
