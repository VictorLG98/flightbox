// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHash } from './router.js';

describe('parseHash', () => {
  it('maps empty/# to the dashboard', () => {
    expect(parseHash('')).toEqual({ route: 'dashboard' });
    expect(parseHash('#/')).toEqual({ route: 'dashboard' });
  });
  it('maps #/sessions to the session list', () => {
    expect(parseHash('#/sessions')).toEqual({ route: 'list' });
    expect(parseHash('#/sessions/')).toEqual({ route: 'list' });
  });
  it('maps #/sessions/:day to the list with a day filter', () => {
    expect(parseHash('#/sessions/2026-07-05')).toEqual({ route: 'list', day: '2026-07-05' });
  });
  it('maps #/session/:id to session', () => {
    expect(parseHash('#/session/abc123')).toEqual({ route: 'session', id: 'abc123' });
  });
  it('maps #/compare/:a/:b to a compare view', () => {
    expect(parseHash('#/compare/aaa/bbb')).toEqual({ route: 'compare', a: 'aaa', b: 'bbb' });
  });
  it('decodes the id', () => {
    expect(parseHash('#/session/a%20b')).toEqual({ route: 'session', id: 'a b' });
  });
});
