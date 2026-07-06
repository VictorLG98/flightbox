import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { collect } from '../src/collector.js';
import { rawLogDir } from '../src/paths.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  process.env.TRACEBOX_HOME = tmp;
});

function rawLines(): string[] {
  const dir = rawLogDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n'))
    .filter(Boolean);
}

describe('collect', () => {
  it('appends valid hook JSON as a raw line with received_at', async () => {
    await collect(Readable.from([JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's1' })]));
    const lines = rawLines();
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(rec.payload.session_id).toBe('s1');
    expect(rec.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores malformed input under payload.unparsed without throwing', async () => {
    await collect(Readable.from(['{not json']));
    const rec = JSON.parse(rawLines()[0]);
    expect(rec.payload.unparsed).toBe('{not json');
  });

  it('writes nothing on empty input', async () => {
    await collect(Readable.from(['']));
    expect(rawLines()).toHaveLength(0);
  });

  it('never throws even if TRACEBOX_HOME is unwritable', async () => {
    process.env.TRACEBOX_HOME = '/dev/null/nope';
    await expect(collect(Readable.from(['{"a":1}']))).resolves.toBeUndefined();
  });
});
