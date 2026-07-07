import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, type Store } from '../src/store.js';
import { sessionListDto, sessionDetailDto, claimsDto, metricsDto, streakOf, estimateCostUsd } from '../src/server/store-api.js';

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
  store = openStore(path.join(tmp, 'db.sqlite'));
  store.upsertSession({ id: 'hooked', projectDir: '/p/app', startedAt: '2026-07-05T14:00:00.000Z', endedAt: '2026-07-05T14:10:00.000Z', model: 'claude-sonnet-4-6' });
  store.insertEvent({ sessionId: 'hooked', ts: '2026-07-05T14:01:00.000Z', type: 'command', toolName: 'Bash', detail: 'npm test', source: 'hook', sidechain: false, uniqKey: 'e1' });
  store.insertEvent({ sessionId: 'hooked', ts: '2026-07-05T14:02:00.000Z', type: 'subagent_spawn', toolName: 'Task', detail: 'fix', source: 'hook', sidechain: false, uniqKey: 'e2' });
  store.insertFileTouch({ sessionId: 'hooked', path: '/p/app/a.ts', action: 'edit', ts: '2026-07-05T14:03:00.000Z', uniqKey: 't1' });
  store.insertFileTouch({ sessionId: 'hooked', path: '/p/app/b.ts', action: 'edit', ts: '2026-07-05T14:04:00.000Z', uniqKey: 't2' });
  store.insertToolOutcome({ sessionId: 'hooked', path: '/p/app/a.ts', toolName: 'Edit', success: true, rawResponse: '{}', ts: '2026-07-05T14:03:01.000Z', uniqKey: 'o1' });
  // b.ts attempted, no outcome -> discrepancy
  store.insertTokenUsage({ sessionId: 'hooked', messageUuid: 'm1', model: 'claude-sonnet-4-6', ts: '2026-07-05T14:01:00.000Z', inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheCreationTokens: 10 });
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('sessionListDto', () => {
  it('summarizes sessions with duration and discrepancy flag', () => {
    const [row] = sessionListDto(store);
    expect(row).toMatchObject({
      id: 'hooked', project: '/p/app', durationMs: 600000,
      tokens: 1200, fileCount: 2, hasDiscrepancy: true,
    });
  });
});

describe('sessionDetailDto', () => {
  it('returns full detail with event/command/subagent counts', () => {
    const d = sessionDetailDto(store, 'hooked')!;
    expect(d.model).toBe('claude-sonnet-4-6');
    expect(d.durationMs).toBe(600000);
    expect(d.tokens).toEqual({ input: 1000, output: 200, cacheRead: 50, cacheCreation: 10 });
    expect(d.commandCount).toBe(1);
    expect(d.subagentCount).toBe(1);
    expect(d.fileCount).toBe(2);
    expect(d.events).toHaveLength(2);
    expect(d.events[0]).toMatchObject({ type: 'command', toolName: 'Bash', detail: 'npm test' });
  });
  it('returns null for unknown session', () => {
    expect(sessionDetailDto(store, 'nope')).toBeNull();
  });
});

describe('claimsDto', () => {
  it('reports hooksPresent and per-file status', () => {
    const c = claimsDto(store, 'hooked')!;
    expect(c.hooksPresent).toBe(true);
    expect(c.files).toEqual([
      { path: '/p/app/a.ts', status: 'succeeded' },
      { path: '/p/app/b.ts', status: 'attempted' },
    ]);
  });
  it('marks hooksPresent false for transcript-only sessions', () => {
    store.upsertSession({ id: 'tonly' });
    store.insertEvent({ sessionId: 'tonly', ts: '2026-07-05T15:00:00.000Z', type: 'file_touch', toolName: 'Edit', detail: '/p/x.ts', source: 'transcript', sidechain: false, uniqKey: 'te1' });
    store.insertFileTouch({ sessionId: 'tonly', path: '/p/x.ts', action: 'edit', ts: '2026-07-05T15:00:00.000Z', uniqKey: 'tt1' });
    const c = claimsDto(store, 'tonly')!;
    expect(c.hooksPresent).toBe(false);
    expect(c.files).toEqual([{ path: '/p/x.ts', status: 'attempted' }]);
  });
  it('returns null for unknown session', () => {
    expect(claimsDto(store, 'nope')).toBeNull();
  });
});

describe('streakOf', () => {
  it('is zero for no active days', () => {
    expect(streakOf([])).toEqual({ current: 0, longest: 0 });
  });
  it('finds the longest run and the run ending on the most recent day', () => {
    // two runs: [01,02,03] (len 3) and [10,11] (len 2, most recent)
    const days = ['2026-07-11', '2026-07-01', '2026-07-02', '2026-07-10', '2026-07-03'];
    expect(streakOf(days)).toEqual({ current: 2, longest: 3 });
  });
  it('deduplicates repeated days', () => {
    expect(streakOf(['2026-07-01', '2026-07-01', '2026-07-02'])).toEqual({ current: 2, longest: 2 });
  });
});

describe('estimateCostUsd', () => {
  it('prices input/output plus cache read (0.1x) and write (1.25x) by model family', () => {
    // Opus: $5/1M input, $25/1M output. 1M input + 1M output = 5 + 25 = 30.
    expect(estimateCostUsd('claude-opus-4-8', { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheCreation: 0 })).toBeCloseTo(30);
    // Sonnet cache read: 1M * ($3 * 0.1) = 0.30
    expect(estimateCostUsd('claude-sonnet-4-6', { input: 0, output: 0, cacheRead: 1_000_000, cacheCreation: 0 })).toBeCloseTo(0.3);
    // Unknown model → no estimate
    expect(estimateCostUsd('gpt-4', { input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 })).toBe(0);
  });
});

describe('metricsDto', () => {
  it('aggregates totals, reliability, calendar, projects, tools and streak', () => {
    // beforeEach seeds one hooked session ('hooked') on 2026-07-05 with a discrepancy.
    store.upsertSession({ id: 'plain', projectDir: '/p/other', startedAt: '2026-07-06T10:00:00.000Z', endedAt: '2026-07-06T10:20:00.000Z' });
    store.insertTokenUsage({ sessionId: 'plain', messageUuid: 'pm1', model: 'x', ts: '2026-07-06T10:01:00.000Z', inputTokens: 500, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0 });

    const m = metricsDto(store);
    expect(m.totals.sessions).toBe(2);
    expect(m.totals.tokens).toEqual({ input: 1500, output: 300, cacheRead: 50, cacheCreation: 10 });
    expect(m.totals.files).toBe(2);
    expect(m.totals.avgDurationMs).toBe(900000); // (10min + 20min) / 2 = 15min

    // only 'hooked' has hook events, and it has a discrepancy
    expect(m.reliability).toEqual({ sessionsWithHooks: 1, sessionsWithDiscrepancy: 1, discrepancyRate: 1 });

    expect(m.calendar).toEqual([
      { day: '2026-07-05', sessions: 1, tokens: 1200 },
      { day: '2026-07-06', sessions: 1, tokens: 600 },
    ]);
    expect(m.streak).toEqual({ current: 2, longest: 2 });
    expect(m.byProject).toContainEqual({ project: '/p/app', sessions: 1, tokens: 1200 });
    expect(m.topTools).toContainEqual({ tool: 'Bash', count: 1 });

    // cost: only the sonnet tokens are priced; 'plain' uses model 'x' (unknown -> $0)
    expect(m.cost.byModel).toContainEqual({ model: 'claude-sonnet-4-6', usd: expect.any(Number) });
    expect(m.cost.totalUsd).toBeGreaterThan(0);
    // event-type breakdown from hook events
    expect(m.eventTypes).toContainEqual({ type: 'command', count: 1 });
    expect(m.eventTypes).toContainEqual({ type: 'subagent_spawn', count: 1 });
    // files & folders touched
    expect(m.topFiles).toContainEqual({ path: '/p/app/a.ts', touches: 1 });
    expect(m.topFolders).toContainEqual({ folder: '/p/app', touches: 2 });
    // hourly heatmap: hooked's two events land Sunday (weekday 0) at 14:00 UTC
    expect(m.hourly).toContainEqual({ weekday: 0, hour: 14, count: 2 });
  });
});
