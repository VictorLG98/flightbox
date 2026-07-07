export interface BarItem {
  label: string;
  value: number;
  display: string; // formatted value shown at the row's end
  sub?: string; // optional secondary label (e.g. session count)
}

/** Horizontal bar chart drawn with divs — no chart library, matching the
 *  instrument-panel aesthetic. Bars are scaled to the largest value. */
export function BarList({ items, empty }: { items: BarItem[]; empty: string }) {
  if (items.length === 0) return <p className="feed-empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="bars">
      {items.map((it, i) => (
        <li className="bar-row" key={it.label} style={{ ['--i' as string]: i }}>
          <span className="bar-label" title={it.label}>{it.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">
            {it.display}
            {it.sub && <small>{it.sub}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
