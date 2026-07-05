import fs from 'node:fs';
import path from 'node:path';
import { claudeSettingsPath, flightboxHome } from '../paths.js';

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'] as const;
const COLLECT_ENTRY = { hooks: [{ type: 'command', command: 'flightbox collect' }] };

export function buildHookConfig(settings: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(settings);
  const hooks: Record<string, unknown[]> = (out.hooks as Record<string, unknown[]>) ?? {};
  out.hooks = hooks;
  for (const ev of HOOK_EVENTS) {
    const entries = Array.isArray(hooks[ev]) ? hooks[ev] : [];
    hooks[ev] = entries;
    if (!JSON.stringify(entries).includes('flightbox collect')) {
      entries.push(structuredClone(COLLECT_ENTRY));
    }
  }
  return out;
}

export function cmdInstall(): number {
  try {
    fs.mkdirSync(flightboxHome(), { recursive: true });
    const file = claudeSettingsPath();
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      // missing or unparseable settings file: start from empty
    }
    const updated = buildHookConfig(settings);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
    console.log(`flightbox hooks registered in ${file}`);
    console.log('Past sessions are already visible: try `flightbox list`');
    return 0;
  } catch (err) {
    console.error(`install failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
