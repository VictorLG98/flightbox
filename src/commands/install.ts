import fs from 'node:fs';
import path from 'node:path';
import { claudeSettingsPath, traceboxHome } from '../paths.js';

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'] as const;
const COLLECT_ENTRY = { hooks: [{ type: 'command', command: 'tracebox collect' }] };

export function buildHookConfig(settings: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(settings);
  const hooks: Record<string, unknown[]> = (out.hooks as Record<string, unknown[]>) ?? {};
  out.hooks = hooks;
  for (const ev of HOOK_EVENTS) {
    const entries = Array.isArray(hooks[ev]) ? hooks[ev] : [];
    hooks[ev] = entries;
    if (!JSON.stringify(entries).includes('tracebox collect')) {
      entries.push(structuredClone(COLLECT_ENTRY));
    }
  }
  return out;
}

export function cmdInstall(): number {
  try {
    fs.mkdirSync(traceboxHome(), { recursive: true });
    const file = claudeSettingsPath();
    let settings: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(file, 'utf8');
      try {
        settings = JSON.parse(raw);
      } catch {
        console.error(`install aborted: ${file} exists but is not valid JSON — fix or remove it first`);
        return 1;
      }
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      // file missing: proceed with empty settings
    }
    const updated = buildHookConfig(settings);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
    console.log(`tracebox hooks registered in ${file}`);
    console.log('Past sessions are already visible: try `tracebox list`');
    return 0;
  } catch (err) {
    console.error(`install failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
