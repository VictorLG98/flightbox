import { formatTokens, pad } from '../format.js';
import type { Store } from '../store.js';

export function cmdStats(store: Store): void {
  console.log('TOKENS BY DAY (last 14)');
  for (const r of store.statsByDay()) {
    console.log(`  ${pad(r.day, 12)}${formatTokens(r.tokens)}`);
  }
  console.log('');
  console.log('TOKENS BY PROJECT');
  for (const r of store.statsByProject()) {
    console.log(`  ${pad(r.project, 40)}${formatTokens(r.tokens)}`);
  }
}
