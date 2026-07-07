import { useEffect, useState } from 'react';
import { fetchMetrics } from './api.js';
import type { MetricsDto } from './types.js';
import { formatTokens, formatDuration } from './format.js';
import { navigate } from './router.js';
import { CalendarHeatmap, type CalendarMetric } from './CalendarHeatmap.js';
import { TokenTrend } from './TokenTrend.js';
import { HourHeatmap } from './HourHeatmap.js';
import { BarList, type BarItem } from './BarList.js';

const AUTO_REFRESH_MS = 10_000;

function basename(project: string): string {
  if (project === '(unknown)' || project === '(root)') return project;
  const parts = project.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || project;
}

function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 10) return `$${usd.toFixed(2)}`;
  if (usd < 1000) return `$${usd.toFixed(0)}`;
  return `$${(usd / 1000).toFixed(1)}K`;
}

type Range = 'all' | '30d' | '90d' | '12mo';
const RANGE_DAYS: Record<Range, number | null> = { all: null, '30d': 30, '90d': 90, '12mo': 365 };

/** Inclusive lower bound ('YYYY-MM-DD') for a range, or null for all-time. */
function rangeFrom(range: Range): string | null {
  const days = RANGE_DAYS[range];
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function Dashboard() {
  const [m, setM] = useState<MetricsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [metric, setMetric] = useState<CalendarMetric>('sessions');
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchMetrics({ project: project || null, from: rangeFrom(range) })
        .then((data) => { if (live) { setM(data); setError(null); } })
        .catch((e) => { if (live) setError(String(e)); });
    load();
    if (!auto) return () => { live = false; };
    const id = setInterval(load, AUTO_REFRESH_MS);
    return () => { live = false; clearInterval(id); };
  }, [project, range, auto]);

  if (error) return <p className="state error" role="alert">Failed to load metrics: {error}</p>;
  if (m === null) return <p className="state">Loading…</p>;

  const { totals, reliability, streak } = m;
  const totalTokens = totals.tokens.input + totals.tokens.output;
  const discrepancyPct =
    reliability.discrepancyRate === null ? '—' : `${Math.round(reliability.discrepancyRate * 100)}%`;

  const cards: Array<{ label: string; value: string; sub?: string; tone?: 'amber' | 'cyan' }> = [
    { label: 'Sessions', value: String(totals.sessions), tone: 'cyan' },
    { label: 'Tokens', value: formatTokens(totalTokens), sub: `${formatTokens(totals.tokens.cacheRead)} cache read` },
    { label: 'Files touched', value: String(totals.files) },
    { label: 'Avg duration', value: formatDuration(totals.avgDurationMs) },
    {
      label: 'Discrepancy rate',
      value: discrepancyPct,
      sub: `${reliability.sessionsWithDiscrepancy}/${reliability.sessionsWithHooks} with hooks`,
      tone: 'amber',
    },
    { label: 'Streak', value: `${streak.current}d`, sub: `longest ${streak.longest}d` },
    { label: 'Est. cost', value: formatUsd(m.cost.totalUsd), sub: 'list prices', tone: 'amber' },
  ];

  const projectItems: BarItem[] = m.byProject.map((p) => ({
    label: basename(p.project),
    value: p.tokens,
    display: formatTokens(p.tokens),
    sub: `${p.sessions} session${p.sessions === 1 ? '' : 's'}`,
  }));
  const toolItems: BarItem[] = m.topTools.map((t) => ({
    label: t.tool,
    value: t.count,
    display: String(t.count),
  }));
  const costItems: BarItem[] = m.cost.byModel
    .filter((c) => c.usd > 0)
    .map((c) => ({ label: basename(c.model), value: c.usd, display: formatUsd(c.usd) }));
  const eventItems: BarItem[] = m.eventTypes.map((e) => ({
    label: e.type,
    value: e.count,
    display: String(e.count),
  }));
  const fileItems: BarItem[] = m.topFiles.map((f) => ({
    label: basename(f.path),
    value: f.touches,
    display: String(f.touches),
  }));
  const folderItems: BarItem[] = m.topFolders.map((f) => ({
    label: basename(f.folder),
    value: f.touches,
    display: String(f.touches),
  }));

  return (
    <>
      <div className="controls dash-controls">
        <label>
          Project
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {m.projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Range
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12mo">Last 12 months</option>
          </select>
        </label>
        <label className="auto-toggle">
          Live
          <button
            type="button"
            className={`toggle-btn${auto ? ' on' : ''}`}
            aria-pressed={auto}
            onClick={() => setAuto((v) => !v)}
          >{auto ? 'Auto · 10s' : 'Off'}</button>
        </label>
      </div>

      <p className="section-label">Fleet overview</p>
      <div className="gauges">
        {cards.map((c, i) => (
          <div className="gauge" key={c.label} style={{ ['--i' as string]: i }}>
            <div className="label">{c.label}</div>
            <div className={`value${c.tone ? ` ${c.tone}` : ''}`}>
              {c.value}
              {c.sub && <small>{c.sub}</small>}
            </div>
          </div>
        ))}
      </div>

      <div className="section-label cal-head">
        <span>Activity · last 53 weeks</span>
        <span className="toggle" role="group" aria-label="Calendar metric">
          <button
            type="button"
            className={metric === 'sessions' ? 'on' : ''}
            aria-pressed={metric === 'sessions'}
            onClick={() => setMetric('sessions')}
          >Sessions</button>
          <button
            type="button"
            className={metric === 'tokens' ? 'on' : ''}
            aria-pressed={metric === 'tokens'}
            onClick={() => setMetric('tokens')}
          >Tokens</button>
        </span>
      </div>
      <div className="panel">
        <CalendarHeatmap calendar={m.calendar} metric={metric} onDayClick={(day) => navigate(`#/sessions/${day}`)} />
      </div>

      <p className="section-label">Token trend</p>
      <div className="panel">
        <TokenTrend calendar={m.calendar} />
      </div>

      <p className="section-label">Working hours · UTC</p>
      <div className="panel">
        <HourHeatmap hourly={m.hourly} />
      </div>

      <div className="dash-cols">
        {!project && (
          <section>
            <p className="section-label">Tokens by project</p>
            <div className="panel">
              <BarList items={projectItems} empty="No project data yet." />
            </div>
          </section>
        )}
        <section>
          <p className="section-label">Top tools</p>
          <div className="panel">
            <BarList items={toolItems} empty="No tool activity yet." />
          </div>
        </section>
        <section>
          <p className="section-label">Est. cost by model</p>
          <div className="panel">
            <BarList items={costItems} empty="No priced token usage yet." />
          </div>
        </section>
        <section>
          <p className="section-label">Event types</p>
          <div className="panel">
            <BarList items={eventItems} empty="No events yet." />
          </div>
        </section>
        <section>
          <p className="section-label">Most-touched files</p>
          <div className="panel">
            <BarList items={fileItems} empty="No file activity yet." />
          </div>
        </section>
        <section>
          <p className="section-label">Hottest folders</p>
          <div className="panel">
            <BarList items={folderItems} empty="No file activity yet." />
          </div>
        </section>
      </div>
    </>
  );
}
