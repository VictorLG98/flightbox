import { formatTokens, pad } from '../format.js';
import type { Store } from '../store.js';

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '?';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return '?';
  const mins = Math.round(ms / 60_000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`;
}

export function cmdShow(store: Store, idPrefix: string): number {
  const s = store.findSession(idPrefix);
  if (!s) {
    console.error(`No session matching '${idPrefix}'. Try: flightbox list`);
    return 1;
  }
  const tokens = store.sessionTokens(s.id);
  console.log(`session   ${s.id}`);
  console.log(`project   ${s.project_dir ?? '(unknown)'}`);
  console.log(`model     ${s.model ?? '(unknown)'}`);
  console.log(`duration  ${duration(s.started_at, s.ended_at)}`);
  console.log(
    `tokens    ${formatTokens(tokens.input + tokens.output)} (in ${formatTokens(tokens.input)} / out ${formatTokens(tokens.output)} / cache-read ${formatTokens(tokens.cacheRead)})`,
  );
  console.log(`files     ${store.fileTouchCount(s.id)} touched`);
  console.log('');

  for (const e of store.eventsForSession(s.id)) {
    const time = e.ts.slice(11, 19);
    const prefix = e.sidechain ? '  ↳ ' : '';
    const tool = e.toolName ? `${e.toolName}  ` : '';
    console.log(`${time}  ${prefix}${pad(e.type, 15)}${tool}${e.detail}`);
  }
  return 0;
}
