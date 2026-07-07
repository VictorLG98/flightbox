const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface HourCell { weekday: number; hour: number; count: number }

/** Intensity bucket 0..4 relative to the busiest cell. */
export function hourLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const f = count / max;
  if (f <= 0.25) return 1;
  if (f <= 0.5) return 2;
  if (f <= 0.75) return 3;
  return 4;
}

/** Weekday × hour activity grid (UTC) — "when do I actually work". */
export function HourHeatmap({ hourly }: { hourly: HourCell[] }) {
  const byKey = new Map(hourly.map((h) => [`${h.weekday}:${h.hour}`, h.count]));
  const max = Math.max(0, ...hourly.map((h) => h.count));

  return (
    <div className="hours" role="img" aria-label="Activity by weekday and hour (UTC)">
      <div className="hours-cols" aria-hidden="true">
        <span className="hours-daylabel" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="hours-hourlabel">{h % 6 === 0 ? h : ''}</span>
        ))}
      </div>
      {DAYS.map((day, wd) => (
        <div className="hours-row" key={wd}>
          <span className="hours-daylabel">{day}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const count = byKey.get(`${wd}:${h}`) ?? 0;
            return (
              <span
                key={h}
                className={`cal-cell l${hourLevel(count, max)}`}
                aria-label={`${day} ${String(h).padStart(2, '0')}:00 — ${count} event${count === 1 ? '' : 's'}`}
                title={`${day} ${String(h).padStart(2, '0')}:00 · ${count} events`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
