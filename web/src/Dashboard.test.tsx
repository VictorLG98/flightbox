// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard.js';
import * as api from './api.js';
import type { MetricsDto } from './types.js';

afterEach(() => vi.restoreAllMocks());

const metrics: MetricsDto = {
  totals: {
    sessions: 2,
    tokens: { input: 1500, output: 300, cacheRead: 900, cacheCreation: 10 },
    files: 5,
    avgDurationMs: 600000,
  },
  reliability: { sessionsWithHooks: 2, sessionsWithDiscrepancy: 1, discrepancyRate: 0.5 },
  calendar: [{ day: '2026-07-05', sessions: 2, tokens: 1800 }],
  byProject: [{ project: '/repo/app', sessions: 2, tokens: 1234 }],
  topTools: [{ tool: 'Read', count: 7 }],
  streak: { current: 3, longest: 5 },
  projects: ['/repo/app'],
  cost: { totalUsd: 4.2, byModel: [{ model: 'claude-sonnet-4-6', usd: 4.2 }] },
  eventTypes: [{ type: 'command', count: 6 }],
  topFiles: [{ path: '/repo/app/server.ts', touches: 4 }],
  topFolders: [{ folder: '/repo/app', touches: 9 }],
  hourly: [{ weekday: 1, hour: 9, count: 5 }],
};

describe('Dashboard', () => {
  it('renders metric cards, calendar, and bar breakdowns', async () => {
    vi.spyOn(api, 'fetchMetrics').mockResolvedValue(metrics);
    render(<Dashboard />);

    await waitFor(() => expect(screen.getByText('Files touched')).toBeInTheDocument());
    // 'Sessions' labels both a metric card and the calendar toggle button
    expect(screen.getAllByText('Sessions').length).toBeGreaterThanOrEqual(2);
    // total tokens 1500 + 300 = 1800 -> 1.8K
    expect(screen.getByText('1.8K')).toBeInTheDocument();
    // discrepancy rate 0.5 -> 50%
    expect(screen.getByText('50%')).toBeInTheDocument();
    // streak current
    expect(screen.getByText('3d')).toBeInTheDocument();
    // project bar uses the basename, tool bar shows the tool
    expect(screen.getAllByText('app').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Read')).toBeInTheDocument();
    // calendar cell present, labelled with its daily breakdown
    expect(screen.getByLabelText('2026-07-05 · 2 sessions · 1.8K tokens')).toBeInTheDocument();
    // cost card + by-model bar, event types, and most-touched file
    expect(screen.getByText('Est. cost')).toBeInTheDocument();
    expect(screen.getAllByText('$4.20').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('command')).toBeInTheDocument();
    expect(screen.getByText('server.ts')).toBeInTheDocument();
    // working-hours heatmap cell present
    expect(screen.getByLabelText(/Mon 09:00 — 5 events/)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    vi.spyOn(api, 'fetchMetrics').mockRejectedValue(new Error('boom'));
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/failed to load metrics/i)).toBeInTheDocument());
  });
});
