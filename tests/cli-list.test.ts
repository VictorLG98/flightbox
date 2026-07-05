import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';
import { formatTokens } from '../src/format.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.FLIGHTBOX_HOME = path.join(tmp, 'fbx');
  process.env.FLIGHTBOX_CLAUDE_HOME = path.join(tmp, 'claude');

  // one past transcript session so list has content (backfill path)
  const proj = path.join(tmp, 'claude', 'projects', '-p-app');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'abcd1234-x.jsonl'), JSON.stringify({
    type: 'assistant', uuid: 'm1', timestamp: '2026-07-05T14:02:12.000Z',
    sessionId: 'abcd1234-x', cwd: '/p/app',
    message: {
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 45230, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    },
  }) + '\n');
});

describe('formatTokens', () => {
  it('formats plain, K and M', () => {
    expect(formatTokens(532)).toBe('532');
    expect(formatTokens(45230)).toBe('45.2K');
    expect(formatTokens(1200000)).toBe('1.2M');
  });
});

describe('cli list', () => {
  it('auto-ingests and prints sessions table', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await main(['list']);
    expect(code).toBe(0);
    const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('SESSION');
    expect(out).toContain('abcd1234');
    expect(out).toContain('app'); // project basename
    expect(out).toContain('45.3K'); // 45230 + 100
    log.mockRestore();
  });

  it('returns 1 and prints help for unknown command', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['wat'])).toBe(1);
    err.mockRestore();
  });
});
