import { describe, it, expect } from 'vitest';
import { normalizeHookLine, classifyOutcomeSuccess } from '../src/ingest/hooks.js';

function rec(payload: unknown): string {
  return JSON.stringify({ received_at: '2026-07-05T14:02:11.000Z', payload });
}

describe('classifyOutcomeSuccess', () => {
  it('returns false on an error object', () => {
    expect(classifyOutcomeSuccess({ error: 'ENOENT' })).toBe(false);
  });
  it('returns false on an error-prefixed string', () => {
    expect(classifyOutcomeSuccess('Error: file not found')).toBe(false);
  });
  it('returns true on a normal result object', () => {
    expect(classifyOutcomeSuccess({ filePath: '/p/a.ts', newString: 'x' })).toBe(true);
  });
  it('returns null on empty / missing response', () => {
    expect(classifyOutcomeSuccess(null)).toBeNull();
    expect(classifyOutcomeSuccess({})).toBeNull();
    expect(classifyOutcomeSuccess('')).toBeNull();
  });
});

describe('normalizeHookLine — PostToolUse outcomes', () => {
  it('emits an outcome for a successful Edit', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PostToolUse', session_id: 's1',
      tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' },
      tool_response: { filePath: '/p/a.ts' },
    }))!;
    expect(out.events).toHaveLength(0); // still no timeline event for PostToolUse
    expect(out.outcome).toMatchObject({
      sessionId: 's1', path: '/p/a.ts', toolName: 'Edit', success: true,
      ts: '2026-07-05T14:02:11.000Z',
    });
    expect(out.outcome!.uniqKey).toHaveLength(40);
  });

  it('emits a failed outcome for an errored Write', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PostToolUse', session_id: 's1',
      tool_name: 'Write', tool_input: { file_path: '/p/b.ts' },
      tool_response: { error: 'permission denied' },
    }))!;
    expect(out.outcome).toMatchObject({ path: '/p/b.ts', toolName: 'Write', success: false });
  });

  it('does not emit an outcome for non-file tools (Bash)', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PostToolUse', session_id: 's1',
      tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'x' },
    }))!;
    expect(out.outcome).toBeUndefined();
  });

  it('PreToolUse is unchanged (no outcome)', () => {
    const out = normalizeHookLine(rec({
      hook_event_name: 'PreToolUse', session_id: 's1',
      tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' },
    }))!;
    expect(out.outcome).toBeUndefined();
    expect(out.events[0].type).toBe('file_touch');
  });
});
