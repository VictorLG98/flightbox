import { describe, it, expect, vi } from 'vitest';
import { runUi } from '../src/commands/ui.js';

describe('runUi', () => {
  it('ingests, starts the server, opens the browser, and closes on stop signal', async () => {
    const order: string[] = [];
    const close = vi.fn(() => order.push('close'));
    const deps = {
      ingest: vi.fn(() => order.push('ingest')),
      start: vi.fn(async () => { order.push('start'); return { url: 'http://127.0.0.1:51789', close }; }),
      open: vi.fn((u: string) => order.push(`open:${u}`)),
      onStop: (fn: () => void) => { order.push('armed'); queueMicrotask(fn); }, // fire stop immediately
      log: vi.fn(),
    };
    const code = await runUi(deps as any);
    expect(code).toBe(0);
    expect(order).toEqual(['ingest', 'start', 'open:http://127.0.0.1:51789', 'armed', 'close']);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:51789'));
  });
});
