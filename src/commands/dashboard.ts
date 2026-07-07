import { formatTokens, pad } from '../format.js';
import { metricsDto } from '../server/store-api.js';
import type { Store } from '../store.js';

function usd(n: number): string {
  if (n === 0) return '$0';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}K`;
}

/** Terminal counterpart of the web dashboard: fleet-wide metrics in one view. */
export function cmdDashboard(store: Store): void {
  const m = metricsDto(store);
  const tokens = m.totals.tokens.input + m.totals.tokens.output;
  const rate = m.reliability.discrepancyRate;

  console.log('FLEET OVERVIEW');
  console.log(`  ${pad('Sessions', 20)}${m.totals.sessions}`);
  console.log(`  ${pad('Tokens', 20)}${formatTokens(tokens)}`);
  console.log(`  ${pad('Files touched', 20)}${m.totals.files}`);
  console.log(`  ${pad('Est. cost', 20)}${usd(m.cost.totalUsd)}  (list prices)`);
  console.log(`  ${pad('Discrepancy rate', 20)}${rate === null ? '—' : `${Math.round(rate * 100)}%`} (${m.reliability.sessionsWithDiscrepancy}/${m.reliability.sessionsWithHooks})`);
  console.log(`  ${pad('Active streak', 20)}${m.streak.current}d (longest ${m.streak.longest}d)`);

  const section = (title: string, rows: Array<[string, string]>) => {
    if (rows.length === 0) return;
    console.log('');
    console.log(title);
    for (const [label, value] of rows) console.log(`  ${pad(label, 40)}${value}`);
  };

  section('TOKENS BY PROJECT', m.byProject.map((p) => [p.project, formatTokens(p.tokens)]));
  section('EST. COST BY MODEL', m.cost.byModel.filter((c) => c.usd > 0).map((c) => [c.model, usd(c.usd)]));
  section('TOP TOOLS', m.topTools.map((t) => [t.tool, String(t.count)]));
  section('MOST-TOUCHED FILES', m.topFiles.map((f) => [f.path, String(f.touches)]));
}
