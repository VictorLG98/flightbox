import fs from 'node:fs';
import path from 'node:path';
import { rawLogDir } from './paths.js';

const MAX_RAW_BYTES = 1_000_000;

export async function collect(stdin: NodeJS.ReadableStream): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(Buffer.from(c as Buffer));
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { unparsed: text.slice(0, MAX_RAW_BYTES) };
    }

    const isoNow = new Date().toISOString();
    const line = JSON.stringify({ received_at: isoNow, payload }) + '\n';
    const dir = rawLogDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `hooks-${isoNow.slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, line);
  } catch {
    // Contract: the collector runs inside the user's agent session.
    // It must never throw, never block, never break the session.
  }
}
