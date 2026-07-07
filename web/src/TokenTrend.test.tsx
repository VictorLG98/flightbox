// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenTrend } from './TokenTrend.js';

describe('TokenTrend', () => {
  it('renders a sparkline with a peak label once there are 2+ points', () => {
    render(
      <TokenTrend
        calendar={[
          { day: '2026-07-05', tokens: 1000 },
          { day: '2026-07-06', tokens: 3000 },
        ]}
      />,
    );
    // peak is 3.0K on the second day
    expect(screen.getByText(/peak 3.0K · 2026-07-06/)).toBeInTheDocument();
  });

  it('shows a fallback with fewer than 2 data points', () => {
    render(<TokenTrend calendar={[{ day: '2026-07-05', tokens: 1000 }]} />);
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
  });
});
