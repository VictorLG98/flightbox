// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSessions, fetchSession, fetchClaims } from './api.js';

afterEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

describe('api client', () => {
  it('fetchSessions hits /api/sessions', async () => {
    mockFetch([{ id: 'a' }]);
    const r = await fetchSessions();
    expect(fetch).toHaveBeenCalledWith('/api/sessions');
    expect(r).toEqual([{ id: 'a' }]);
  });
  it('fetchSession encodes id', async () => {
    mockFetch({ id: 'a b' });
    await fetchSession('a b');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/a%20b');
  });
  it('fetchClaims targets the claims route', async () => {
    mockFetch({ sessionId: 'a', hooksPresent: false, files: [] });
    await fetchClaims('a');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/a/claims');
  });
  it('throws on non-ok', async () => {
    mockFetch({}, false);
    await expect(fetchSessions()).rejects.toThrow();
  });
});
