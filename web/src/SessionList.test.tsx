// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SessionList } from './SessionList.js';
import * as api from './api.js';

afterEach(() => vi.restoreAllMocks());

const rows = [
  { id: 'aaa111', project: '/repo/x', startedAt: '2026-07-06T10:00:00Z', endedAt: '2026-07-06T10:05:00Z',
    durationMs: 300000, tokens: 12000, fileCount: 3, hasDiscrepancy: true },
  { id: 'bbb222', project: null, startedAt: null, endedAt: null,
    durationMs: null, tokens: 0, fileCount: 0, hasDiscrepancy: false },
];

describe('SessionList', () => {
  it('renders a row per session with formatted tokens and a discrepancy badge', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue(rows as any);
    render(<SessionList />);
    await waitFor(() => expect(screen.getByText('/repo/x')).toBeInTheDocument());
    expect(screen.getByText('12.0K')).toBeInTheDocument();
    // discrepancy badge present for the first row only
    expect(screen.getAllByTestId('discrepancy-badge')).toHaveLength(1);
    // link points at the session hash route (visible text is short id)
    const link = screen.getByText('aaa111'.slice(0, 8)).closest('a');
    expect(link).toHaveAttribute('href', '#/session/aaa111');
  });

  it('shows an empty state when there are no sessions', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue([]);
    render(<SessionList />);
    await waitFor(() => expect(screen.getByText(/no sessions/i)).toBeInTheDocument());
  });

  it('filters to a single day and shows a clearable banner', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue(rows as any);
    render(<SessionList day="2026-07-06" />);
    await waitFor(() => expect(screen.getByText('2026-07-06')).toBeInTheDocument());
    // only the 2026-07-06 session (aaa111) is shown
    expect(screen.getByText('/repo/x')).toBeInTheDocument();
    expect(screen.getByText('Recorded sessions · 1')).toBeInTheDocument();
    // clear link points back to the unfiltered list
    expect(screen.getByText('clear').closest('a')).toHaveAttribute('href', '#/sessions');
  });

  it('shows a day-specific empty state when nothing matches', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue(rows as any);
    render(<SessionList day="2020-01-01" />);
    await waitFor(() => expect(screen.getByText(/no sessions on 2020-01-01/i)).toBeInTheDocument());
  });

  it('filters by the search box', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue(rows as any);
    render(<SessionList />);
    await waitFor(() => expect(screen.getByText('Recorded sessions · 2')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'repo/x' } });
    expect(screen.getByText('Recorded sessions · 1')).toBeInTheDocument();
    expect(screen.getByText('/repo/x')).toBeInTheDocument();
  });

  it('builds a compare link once two sessions are selected', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue(rows as any);
    render(<SessionList />);
    await waitFor(() => expect(screen.getByText('Recorded sessions · 2')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Select aaa111 to compare'));
    fireEvent.click(screen.getByLabelText('Select bbb222 to compare'));
    const link = screen.getByText('compare →').closest('a');
    expect(link).toHaveAttribute('href', '#/compare/aaa111/bbb222');
  });
});
