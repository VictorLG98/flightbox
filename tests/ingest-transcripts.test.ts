import { describe, it, expect } from 'vitest';
import { normalizeTranscriptLine } from '../src/ingest/transcripts.js';

const assistantLine = JSON.stringify({
  type: 'assistant',
  uuid: 'm1',
  timestamp: '2026-07-05T14:02:12.000Z',
  sessionId: 's1',
  cwd: '/p/app',
  isSidechain: false,
  message: {
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
    content: [
      { type: 'text', text: 'running tests' },
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
    ],
  },
});

describe('normalizeTranscriptLine', () => {
  it('extracts token usage from assistant messages', () => {
    const out = normalizeTranscriptLine(assistantLine)!;
    expect(out.usage).toEqual({
      sessionId: 's1', messageUuid: 'm1', model: 'claude-sonnet-4-6',
      ts: '2026-07-05T14:02:12.000Z',
      inputTokens: 1200, outputTokens: 300, cacheReadTokens: 9000, cacheCreationTokens: 0,
    });
  });

  it('extracts tool_use blocks as transcript-source events', () => {
    const out = normalizeTranscriptLine(assistantLine)!;
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({
      sessionId: 's1', type: 'command', toolName: 'Bash', detail: 'npm test',
      source: 'transcript', sidechain: false,
    });
  });

  it('patches session with cwd, model and timestamps', () => {
    const out = normalizeTranscriptLine(assistantLine)!;
    expect(out.session).toEqual({
      id: 's1', projectDir: '/p/app', model: 'claude-sonnet-4-6',
      startedAt: '2026-07-05T14:02:12.000Z', endedAt: '2026-07-05T14:02:12.000Z',
    });
  });

  it('marks sidechain events', () => {
    const line = JSON.parse(assistantLine);
    line.isSidechain = true;
    line.uuid = 'm2';
    const out = normalizeTranscriptLine(JSON.stringify(line))!;
    expect(out.events[0].sidechain).toBe(true);
  });

  it('still patches timestamps for non-assistant lines with session info', () => {
    const out = normalizeTranscriptLine(JSON.stringify({
      type: 'user', sessionId: 's1', timestamp: '2026-07-05T14:05:00.000Z',
    }))!;
    expect(out.usage).toBeUndefined();
    expect(out.events).toHaveLength(0);
    expect(out.session).toEqual({
      id: 's1', startedAt: '2026-07-05T14:05:00.000Z', endedAt: '2026-07-05T14:05:00.000Z',
    });
  });

  it('returns null for malformed or unidentifiable lines', () => {
    expect(normalizeTranscriptLine('garbage')).toBeNull();
    expect(normalizeTranscriptLine('{"type":"summary"}')).toBeNull();
  });
});
