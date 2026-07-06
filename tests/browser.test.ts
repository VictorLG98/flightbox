import { describe, it, expect } from 'vitest';
import { browserOpenCommand } from '../src/browser.js';

describe('browserOpenCommand', () => {
  it('uses open on macOS', () => {
    expect(browserOpenCommand('darwin', 'http://x')).toEqual({ cmd: 'open', args: ['http://x'] });
  });
  it('uses xdg-open on linux', () => {
    expect(browserOpenCommand('linux', 'http://x')).toEqual({ cmd: 'xdg-open', args: ['http://x'] });
  });
  it('uses cmd start on windows', () => {
    const r = browserOpenCommand('win32', 'http://x');
    expect(r.cmd).toBe('cmd');
    expect(r.args).toEqual(['/c', 'start', '', 'http://x']);
  });
});
