import { formatTokens } from './format.js';

interface DayCell { day: string; tokens: number }

/** Compact filled-area sparkline of tokens-per-day, drawn as an inline SVG.
 *  Expects `calendar` ascending by day (as the API returns it). */
export function TokenTrend({ calendar, width = 640, height = 64 }: { calendar: DayCell[]; width?: number; height?: number }) {
  const pts = calendar.filter((d) => d.tokens > 0);
  if (pts.length < 2) return <p className="feed-empty">Not enough data for a trend yet.</p>;

  const max = Math.max(...pts.map((d) => d.tokens));
  const stepX = width / (pts.length - 1);
  const y = (t: number) => height - (t / max) * (height - 4) - 2;
  const line = pts.map((d, i) => `${i * stepX},${y(d.tokens)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const peak = pts.reduce((a, b) => (b.tokens > a.tokens ? b : a));

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
        aria-label={`Token trend, peak ${formatTokens(max)} on ${peak.day}`}>
        <polygon className="trend-area" points={area} />
        <polyline className="trend-line" points={line} />
      </svg>
      <div className="trend-scale">
        <span>{pts[0].day}</span>
        <span>peak {formatTokens(max)} · {peak.day}</span>
        <span>{pts[pts.length - 1].day}</span>
      </div>
    </div>
  );
}
