import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { runIngest } from '../src/ingest/ingest.js';

let tmp: string;
let store: Store;

function hookLine(payload: unknown, receivedAt = '2026-07-05T14:02:11.000Z'): string {
  return JSON.stringify({ received_at: receivedAt, payload }) + '\n';
}

function transcriptLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant', uuid: 'm1', timestamp: '2026-07-05T14:02:12.000Z',
    sessionId: 's-hooked', cwd: '/p/app', isSidechain: false,
    message: {
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    },
    ...over,
  }) + '\n';
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.TRACEBOX_HOME = path.join(tmp, 'fbx');
  process.env.TRACEBOX_CLAUDE_HOME = path.join(tmp, 'claude');

  fs.mkdirSync(path.join(tmp, 'fbx', 'raw'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'fbx', 'raw', 'hooks-2026-07-05.jsonl'),
    hookLine({ hook_event_name: 'SessionStart', session_id: 's-hooked', cwd: '/p/app' }) +
    hookLine({ hook_event_name: 'PreToolUse', session_id: 's-hooked', tool_name: 'Bash', tool_input: { command: 'ls' } }) +
    'garbage line\n',
  );

  const proj = path.join(tmp, 'claude', 'projects', '-p-app');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 's-hooked.jsonl'), transcriptLine());
  fs.writeFileSync(
    path.join(proj, 's-old.jsonl'),
    transcriptLine({ sessionId: 's-old', uuid: 'm9' }),
  );

  store = openStore(path.join(tmp, 'db.sqlite'));
});

afterEach(() => store.close());

describe('runIngest', () => {
  it('ingests hook events and transcript token usage', () => {
    runIngest(store);
    const s = store.findSession('s-hooked')!;
    expect(s.project_dir).toBe('/p/app');
    expect(s.model).toBe('claude-sonnet-4-6');
    expect(store.sessionTokens('s-hooked').input).toBe(100);
    expect(store.hookEventCount('s-hooked')).toBe(2); // session_start + command
  });

  it('skips transcript events for sessions that have hook events', () => {
    runIngest(store);
    const events = store.eventsForSession('s-hooked');
    expect(events.every((e) => e.source === 'hook')).toBe(true);
  });

  it('backfills transcript events for hook-less sessions', () => {
    runIngest(store);
    const events = store.eventsForSession('s-old');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'transcript', type: 'command', detail: 'ls' });
  });

  it('is idempotent across runs', () => {
    runIngest(store);
    const before = {
      sessions: store.listSessions().length,
      events: store.eventsForSession('s-hooked').length,
      tokens: store.sessionTokens('s-hooked'),
    };
    runIngest(store);
    expect(store.listSessions().length).toBe(before.sessions);
    expect(store.eventsForSession('s-hooked').length).toBe(before.events);
    expect(store.sessionTokens('s-hooked')).toEqual(before.tokens);
  });

  it('survives missing source directories', () => {
    process.env.TRACEBOX_HOME = path.join(tmp, 'nope1');
    process.env.TRACEBOX_CLAUDE_HOME = path.join(tmp, 'nope2');
    expect(() => runIngest(store)).not.toThrow();
  });

  it('records attempted file_touches for a hook-less transcript session', () => {
    const proj = path.join(tmp, 'claude', 'projects', '-p-app');
    fs.writeFileSync(
      path.join(proj, 's-edit.jsonl'),
      JSON.stringify({
        type: 'assistant', uuid: 'e1', timestamp: '2026-07-05T14:03:00.000Z',
        sessionId: 's-edit', cwd: '/p/app', isSidechain: false,
        message: { model: 'claude-sonnet-4-6', content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/p/app/a.ts' } },
        ] },
      }) + '\n',
    );
    runIngest(store);
    expect(store.claimsForSession('s-edit')).toEqual([{ path: '/p/app/a.ts', status: 'attempted' }]);
  });
});
