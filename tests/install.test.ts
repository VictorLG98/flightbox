import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHookConfig, cmdInstall } from '../src/commands/install.js';
import { claudeSettingsPath } from '../src/paths.js';

const EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'];

describe('buildHookConfig', () => {
  it('adds tracebox collect to all four events on empty settings', () => {
    const out = buildHookConfig({}) as any;
    for (const ev of EVENTS) {
      const cmds = JSON.stringify(out.hooks[ev]);
      expect(cmds).toContain('tracebox collect');
    }
  });

  it('preserves existing hooks and is idempotent', () => {
    const existing = {
      permissions: { allow: ['Bash(ls:*)'] },
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool.sh' }] },
        ],
      },
    };
    const once = buildHookConfig(existing) as any;
    const twice = buildHookConfig(once) as any;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(JSON.stringify(once.hooks.PreToolUse)).toContain('other-tool.sh');
    expect(once.permissions.allow).toEqual(['Bash(ls:*)']);
    const traceboxEntries = JSON.stringify(once.hooks.PreToolUse).match(/tracebox collect/g);
    expect(traceboxEntries).toHaveLength(1);
  });
});

describe('cmdInstall', () => {
  it('writes settings file, creating it if missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
    process.env.TRACEBOX_HOME = path.join(tmp, 'fbx');
    process.env.TRACEBOX_CLAUDE_HOME = path.join(tmp, 'claude');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(cmdInstall()).toBe(0);
    const written = JSON.parse(fs.readFileSync(claudeSettingsPath(), 'utf8'));
    expect(JSON.stringify(written.hooks.Stop)).toContain('tracebox collect');
    log.mockRestore();
  });

  it('aborts with return 1 and leaves file unchanged when settings.json is corrupt JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
    process.env.TRACEBOX_HOME = path.join(tmp, 'fbx');
    process.env.TRACEBOX_CLAUDE_HOME = path.join(tmp, 'claude');
    // Pre-create the settings dir and write garbage JSON
    const settingsFile = claudeSettingsPath();
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, '{oops');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cmdInstall()).toBe(1);
    // File must remain unchanged
    expect(fs.readFileSync(settingsFile, 'utf8')).toBe('{oops');
    errSpy.mockRestore();
  });
});
