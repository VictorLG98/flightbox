// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ClaimsPanel } from './ClaimsPanel.js';
import * as api from './api.js';

afterEach(() => vi.restoreAllMocks());

describe('ClaimsPanel', () => {
  it('renders per-file status icons', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({
      sessionId: 's', hooksPresent: true,
      files: [
        { path: '/a.ts', status: 'succeeded' },
        { path: '/b.ts', status: 'failed' },
        { path: '/c.ts', status: 'attempted' },
      ],
    });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText('/a.ts')).toBeInTheDocument());
    expect(screen.getByTestId('status-/a.ts')).toHaveTextContent('✓');
    expect(screen.getByTestId('status-/b.ts')).toHaveTextContent('✗');
    expect(screen.getByTestId('status-/c.ts')).toHaveTextContent('⚠');
  });

  it('shows a degraded-mode warning when hooks are absent', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({
      sessionId: 's', hooksPresent: false, files: [{ path: '/a.ts', status: 'attempted' }],
    });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText(/hooks not installed/i)).toBeInTheDocument());
    expect(screen.getByText('/a.ts')).toBeInTheDocument();
  });

  it('shows an all-good message when every attempted edit succeeded', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({
      sessionId: 's', hooksPresent: true, files: [{ path: '/a.ts', status: 'succeeded' }],
    });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText(/everything attempted was executed/i)).toBeInTheDocument());
  });

  it('shows an empty message when no edits were attempted', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({ sessionId: 's', hooksPresent: true, files: [] });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText(/no file edits/i)).toBeInTheDocument());
  });
});
