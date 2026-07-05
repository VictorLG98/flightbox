import path from 'node:path';
import { formatTokens, pad } from '../format.js';
import type { Store } from '../store.js';

export function cmdList(store: Store): void {
  const rows = store.listSessions();
  console.log(`${pad('SESSION', 10)}${pad('PROJECT', 22)}${pad('STARTED', 18)}${pad('EVENTS', 8)}TOKENS`);
  for (const r of rows) {
    const started = (r.started_at ?? '').slice(0, 16).replace('T', ' ');
    const project = r.project_dir ? path.basename(r.project_dir) : '(unknown)';
    console.log(
      `${pad(r.id.slice(0, 8), 10)}${pad(project, 22)}${pad(started, 18)}${pad(String(r.event_count), 8)}${formatTokens(r.total_tokens)}`,
    );
  }
  if (rows.length === 0) {
    console.log('(no sessions yet — run some agent sessions or check ~/.claude/projects)');
  }
}
