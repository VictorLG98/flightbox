// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline.js';
import type { EventDto } from './types.js';

const events: EventDto[] = [
  { ts: '2026-07-06T10:00:00Z', type: 'command', toolName: 'Bash', detail: 'npm test', sidechain: false },
  { ts: '2026-07-06T10:01:00Z', type: 'file_touch', toolName: 'Edit', detail: '/repo/a.ts', sidechain: false },
  { ts: '2026-07-06T10:02:00Z', type: 'subagent_spawn', toolName: 'Task', detail: 'review', sidechain: false },
  { ts: '2026-07-06T10:02:30Z', type: 'file_touch', toolName: 'Read', detail: '/repo/b.ts', sidechain: true },
];

describe('Timeline', () => {
  it('renders all events by default', () => {
    render(<Timeline events={events} />);
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByText('/repo/a.ts')).toBeInTheDocument();
  });

  it('filters by event type', async () => {
    render(<Timeline events={events} />);
    await userEvent.selectOptions(screen.getByLabelText(/filter/i), 'command');
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.queryByText('/repo/a.ts')).not.toBeInTheDocument();
  });

  it('searches by detail text', async () => {
    render(<Timeline events={events} />);
    await userEvent.type(screen.getByLabelText(/search/i), 'a.ts');
    expect(screen.getByText('/repo/a.ts')).toBeInTheDocument();
    expect(screen.queryByText('npm test')).not.toBeInTheDocument();
  });

  it('marks sidechain (subagent) events', () => {
    render(<Timeline events={events} />);
    expect(screen.getByTestId('sidechain-/repo/b.ts')).toBeInTheDocument();
  });
});
