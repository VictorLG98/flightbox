import { useState } from 'react';
import { formatTokens } from './format.js';

const DAY_MS = 86_400_000;
const WEEKS = 53;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dnum = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
const keyOf = (dn: number) => new Date(dn * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (dn: number) => new Date(dn * DAY_MS).getUTCDay(); // 0 = Sunday

/** Sessions-per-day → intensity bucket 0..4 (GitHub contribution-graph style). */
export function level(sessions: number): 0 | 1 | 2 | 3 | 4 {
  if (sessions <= 0) return 0;
  if (sessions === 1) return 1;
  if (sessions === 2) return 2;
  if (sessions <= 4) return 3;
  return 4;
}

/** Token volume → intensity bucket 0..4, scaled relative to the busiest day. */
export function tokenLevel(tokens: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (tokens <= 0 || max <= 0) return 0;
  const f = tokens / max;
  if (f <= 0.25) return 1;
  if (f <= 0.5) return 2;
  if (f <= 0.75) return 3;
  return 4;
}

export type CalendarMetric = 'sessions' | 'tokens';
interface DayCell { day: string; sessions: number; tokens: number }
interface Tip { text: string; x: number; y: number }

/** A 53-week grid ending on the week of the most recent day with data (or today
 *  when empty), so the latest activity is always the rightmost column. */
export function CalendarHeatmap({
  calendar,
  metric = 'sessions',
  onDayClick,
}: {
  calendar: DayCell[];
  metric?: CalendarMetric;
  onDayClick?: (day: string) => void;
}) {
  // Custom tooltip (instead of the native `title`, which the browser delays ~1s):
  // shown immediately on pointer enter, positioned in fixed/viewport coordinates
  // so the calendar's horizontal scroll container can't clip it.
  const [tip, setTip] = useState<Tip | null>(null);

  const maxTokens = Math.max(0, ...calendar.map((d) => d.tokens));
  const byDay = new Map(calendar.map((d) => [d.day, d]));
  const daysSorted = calendar.map((d) => d.day).sort();
  const anchor = daysSorted.length
    ? dnum(daysSorted[daysSorted.length - 1])
    : Math.floor(Date.now() / DAY_MS);
  const lastSaturday = anchor + (6 - weekdayOf(anchor));
  const firstSunday = lastSaturday - (WEEKS * 7 - 1);

  const weeks: number[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: number[] = [];
    for (let d = 0; d < 7; d++) col.push(firstSunday + w * 7 + d);
    weeks.push(col);
  }

  const showTip = (e: { currentTarget: HTMLElement }, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <div className="cal" role="img" aria-label="Session activity calendar, last 53 weeks">
      <div className="cal-months" aria-hidden="true">
        {weeks.map((col, i) => {
          const first = new Date(col[0] * DAY_MS);
          const prev = i > 0 ? new Date(weeks[i - 1][0] * DAY_MS) : null;
          const show = !prev || first.getUTCMonth() !== prev.getUTCMonth();
          return <span key={i} className="cal-month">{show ? MONTHS[first.getUTCMonth()] : ''}</span>;
        })}
      </div>
      <div className="cal-grid">
        {weeks.map((col, i) => (
          <div className="cal-col" key={i}>
            {col.map((dn) => {
              const k = keyOf(dn);
              const cell = byDay.get(k);
              const s = cell?.sessions ?? 0;
              const t = cell?.tokens ?? 0;
              const future = dn > anchor;
              const lvl = metric === 'tokens' ? tokenLevel(t, maxTokens) : level(s);
              const label = future
                ? k
                : `${k} · ${s} session${s === 1 ? '' : 's'} · ${formatTokens(t)} tokens`;
              const clickable = !future && s > 0 && !!onDayClick;
              return (
                <span
                  key={dn}
                  className={`cal-cell l${lvl}${future ? ' future' : ''}${clickable ? ' clickable' : ''}`}
                  data-level={lvl}
                  role={clickable ? 'button' : undefined}
                  aria-label={label}
                  tabIndex={0}
                  onMouseEnter={(e) => showTip(e, label)}
                  onFocus={(e) => showTip(e, label)}
                  onMouseLeave={() => setTip(null)}
                  onBlur={() => setTip(null)}
                  onClick={clickable ? () => onDayClick!(k) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick!(k); } }
                      : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="cal-legend" aria-hidden="true">
        <span>less</span>
        {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`cal-cell l${l}`} />)}
        <span>more</span>
      </div>
      {tip && (
        <div className="cal-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
