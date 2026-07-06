// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionView } from './SessionView.js';
import * as api from './api.js';

afterEach(() => vi.restoreAllMocks());

const detail = {
  id: 'aaa111bbb', project: '/repo/x', model: 'claude-opus',
  startedAt: '2026-07-06T10:00:00Z', endedAt: '2026-07-06T10:05:00Z', durationMs: 300000,
  tokens: { input: 1000, output: 2000, cacheRead: 500, cacheCreation: 100 },
  fileCount: 2, commandCount: 3, subagentCount: 1,
  events: [{ ts: '2026-07-06T10:01:00Z', type: 'command', toolName: 'Bash', detail: 'npm test', sidechain: false }],
};

describe('SessionView', () => {
  it('renders header summary and timeline', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(detail as any);
    // ClaimsPanel (Task 5) fetches claims; stub to avoid unhandled rejection
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({ sessionId: 'aaa111bbb', hooksPresent: true, files: [] } as any);
    render(<SessionView id="aaa111bbb" />);
    await waitFor(() => expect(screen.getByText('claude-opus')).toBeInTheDocument());
    expect(screen.getByText('/repo/x')).toBeInTheDocument();
    expect(screen.getByText('5m 0s')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
  });
});
