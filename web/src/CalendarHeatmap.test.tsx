// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarHeatmap, level, tokenLevel } from './CalendarHeatmap.js';

describe('level', () => {
  it('buckets sessions-per-day into 0..4', () => {
    expect(level(0)).toBe(0);
    expect(level(1)).toBe(1);
    expect(level(2)).toBe(2);
    expect(level(4)).toBe(3);
    expect(level(9)).toBe(4);
  });
});

describe('tokenLevel', () => {
  it('scales token volume relative to the busiest day', () => {
    expect(tokenLevel(0, 100)).toBe(0);
    expect(tokenLevel(20, 100)).toBe(1);
    expect(tokenLevel(50, 100)).toBe(2);
    expect(tokenLevel(75, 100)).toBe(3);
    expect(tokenLevel(100, 100)).toBe(4);
    expect(tokenLevel(5, 0)).toBe(0); // no data
  });
});

describe('CalendarHeatmap', () => {
  it('labels a day cell with its breakdown and intensity level', () => {
    render(<CalendarHeatmap calendar={[{ day: '2026-07-05', sessions: 3, tokens: 12000 }]} />);
    const cell = screen.getByLabelText('2026-07-05 · 3 sessions · 12.0K tokens');
    expect(cell).toBeInTheDocument();
    expect(cell.className).toContain('l3');
  });

  it('shows an instant tooltip on hover and hides it on leave', () => {
    render(<CalendarHeatmap calendar={[{ day: '2026-07-05', sessions: 3, tokens: 12000 }]} />);
    const cell = screen.getByLabelText('2026-07-05 · 3 sessions · 12.0K tokens');
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(cell);
    expect(screen.getByRole('tooltip')).toHaveTextContent('2026-07-05 · 3 sessions · 12.0K tokens');
    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders an empty grid without data', () => {
    const { container } = render(<CalendarHeatmap calendar={[]} />);
    // 53 weeks × 7 days
    expect(container.querySelectorAll('.cal-cell').length).toBeGreaterThan(53 * 7 - 1);
  });

  it('invokes onDayClick for a day with sessions', () => {
    const onDayClick = vi.fn();
    render(
      <CalendarHeatmap calendar={[{ day: '2026-07-05', sessions: 3, tokens: 12000 }]} onDayClick={onDayClick} />,
    );
    fireEvent.click(screen.getByLabelText('2026-07-05 · 3 sessions · 12.0K tokens'));
    expect(onDayClick).toHaveBeenCalledWith('2026-07-05');
  });

  it('recolors cells by token volume when metric="tokens"', () => {
    render(
      <CalendarHeatmap
        metric="tokens"
        calendar={[
          { day: '2026-07-05', sessions: 1, tokens: 1000 }, // max -> level 4
          { day: '2026-07-06', sessions: 9, tokens: 100 }, // 10% -> level 1
        ]}
      />,
    );
    expect(screen.getByLabelText('2026-07-05 · 1 session · 1.0K tokens').className).toContain('l4');
    expect(screen.getByLabelText('2026-07-06 · 9 sessions · 100 tokens').className).toContain('l1');
  });
});
