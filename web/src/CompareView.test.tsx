// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CompareView } from './CompareView.js';
import * as api from './api.js';
import type { SessionDetail } from './types.js';

afterEach(() => vi.restoreAllMocks());

const detail = (id: string, over: Partial<SessionDetail>): SessionDetail => ({
  id, project: '/repo/x', model: 'claude-opus-4-8',
  startedAt: '2026-07-06T10:00:00Z', endedAt: '2026-07-06T10:05:00Z', durationMs: 300000,
  tokens: { input: 1000, output: 200, cacheRead: 0, cacheCreation: 0 },
  fileCount: 2, commandCount: 1, subagentCount: 0, events: [],
  ...over,
});

describe('CompareView', () => {
  it('renders both sessions side by side and flags differing rows', async () => {
    vi.spyOn(api, 'fetchSession').mockImplementation((id: string) =>
      Promise.resolve(id === 'aaa' ? detail('aaa', { fileCount: 2 }) : detail('bbb', { fileCount: 7 })),
    );
    render(<CompareView a="aaa" b="bbb" />);
    await waitFor(() => expect(screen.getByText('Compare sessions')).toBeInTheDocument());
    expect(screen.getByText('Files touched')).toBeInTheDocument();
    // differing file counts get the diff class
    const seven = screen.getByText('7');
    expect(seven.className).toContain('diff');
  });
});
