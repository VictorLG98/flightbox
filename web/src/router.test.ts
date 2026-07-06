// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHash } from './router.js';

describe('parseHash', () => {
  it('maps empty/# to list', () => {
    expect(parseHash('')).toEqual({ route: 'list' });
    expect(parseHash('#/')).toEqual({ route: 'list' });
  });
  it('maps #/session/:id to session', () => {
    expect(parseHash('#/session/abc123')).toEqual({ route: 'session', id: 'abc123' });
  });
  it('decodes the id', () => {
    expect(parseHash('#/session/a%20b')).toEqual({ route: 'session', id: 'a b' });
  });
});
