import { describe, it, expect } from 'vitest';
import { normalizeHookLine } from '../src/ingest/hooks.js';

function rec(payload: unknown): string {
  return JSON.stringify({ received_at: '2026-07-05T14:02:11.000Z', payload });
}

describe('normalizeHookLine', () => {
  it('maps Bash PreToolUse to a command event', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1', cwd: '/p/app',
      tool_name: 'Bash', tool_input: { command: 'npm test' },
    }))!;
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({
      sessionId: 's1', type: 'command', toolName: 'Bash',
      detail: 'npm test', source: 'hook', ts: '2026-07-05T14:02:11.000Z',
    });
    expect(out.events[0].uniqKey).toHaveLength(40);
  });

  it('maps Edit PreToolUse to file_touch event plus touch row', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1',
      tool_name: 'Edit', tool_input: { file_path: '/p/app/a.ts' },
    }))!;
    expect(out.events[0].type).toBe('file_touch');
    expect(out.touches).toEqual([expect.objectContaining({ path: '/p/app/a.ts', action: 'edit' })]);
  });

  it('maps Task tool to subagent_spawn using description', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1',
      tool_name: 'Task', tool_input: { description: 'fix tests', prompt: 'long...' },
    }))!;
    expect(out.events[0]).toMatchObject({ type: 'subagent_spawn', detail: 'fix tests' });
  });

  it('maps SessionStart to session patch + session_start event', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'SessionStart', session_id: 's1', cwd: '/p/app',
    }))!;
    expect(out.session).toEqual({ id: 's1', projectDir: '/p/app', startedAt: '2026-07-05T14:02:11.000Z' });
    expect(out.events[0].type).toBe('session_start');
  });

  it('maps Stop to session_end + endedAt patch', () => {
    const out = normalizeHookLine(rec({ hook_event_name: 'Stop', session_id: 's1' }))!;
    expect(out.session).toEqual({ id: 's1', endedAt: '2026-07-05T14:02:11.000Z' });
    expect(out.events[0].type).toBe('session_end');
  });

  it('ignores PostToolUse (raw is kept, normalization skips it)', () => {
    const out = normalizeHookLine(rec({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash' }))!;
    expect(out.events).toHaveLength(0);
  });

  it('returns null for garbage or missing session_id', () => {
    expect(normalizeHookLine('nope')).toBeNull();
    expect(normalizeHookLine(rec({ hook_event_name: 'PreToolUse' }))).toBeNull();
  });
});
