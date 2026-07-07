// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HourHeatmap, hourLevel } from './HourHeatmap.js';

describe('hourLevel', () => {
  it('scales relative to the busiest cell', () => {
    expect(hourLevel(0, 10)).toBe(0);
    expect(hourLevel(2, 10)).toBe(1);
    expect(hourLevel(10, 10)).toBe(4);
    expect(hourLevel(3, 0)).toBe(0);
  });
});

describe('HourHeatmap', () => {
  it('renders a full 7×24 grid and labels active cells', () => {
    const { container } = render(<HourHeatmap hourly={[{ weekday: 2, hour: 15, count: 8 }]} />);
    expect(container.querySelectorAll('.cal-cell').length).toBe(7 * 24);
    expect(screen.getByLabelText('Tue 15:00 — 8 events')).toBeInTheDocument();
  });
});
