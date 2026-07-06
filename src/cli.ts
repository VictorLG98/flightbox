#!/usr/bin/env node
import { collect } from './collector.js';
import { cmdList } from './commands/list.js';
import { cmdShow } from './commands/show.js';
import { cmdStats } from './commands/stats.js';
import { cmdInstall } from './commands/install.js';
import { cmdUi } from './commands/ui.js';
import { dbPath, flightboxHome } from './paths.js';
import { VERSION } from './version.js';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HELP = `flightbox ${VERSION} — local flight recorder for coding agent sessions

Usage:
  flightbox install     register hooks in ~/.claude/settings.json
  flightbox list        recent sessions
  flightbox show <id>   session timeline
  flightbox stats       token usage aggregates
  flightbox ui          open the local web UI (Ctrl-C to stop)
  flightbox collect     (internal) hook entry point, reads stdin
`;

async function withStore<T>(fn: (store: import('./store.js').Store) => T): Promise<T> {
  const [{ openStore }, { runIngest }] = await Promise.all([
    import('./store.js'),
    import('./ingest/ingest.js'),
  ]);
  fs.mkdirSync(flightboxHome(), { recursive: true });
  const store = openStore(dbPath());
  try {
    runIngest(store);
    return fn(store);
  } finally {
    store.close();
  }
}

export async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  switch (cmd) {
    case 'collect':
      await collect(process.stdin);
      return 0; // contract: never non-zero
    case 'install':
      return cmdInstall();
    case 'list':
      await withStore((s) => cmdList(s));
      return 0;
    case 'show': {
      const idPrefix = argv[1];
      if (!idPrefix) {
        console.error('Usage: flightbox show <session-id-prefix>');
        return 1;
      }
      return await withStore((s) => cmdShow(s, idPrefix));
    }
    case 'stats':
      await withStore((s) => cmdStats(s));
      return 0;
    case 'ui':
      return await cmdUi();
    case '--version':
    case '-v':
      console.log(VERSION);
      return 0;
    case 'help':
    case '--help':
    case undefined:
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n\n${HELP}`);
      return 1;
  }
}

// Detect direct execution robustly, including when invoked via a symlinked bin
// (npm install / npm link put a symlink on PATH, so argv[1] is the link path
// while import.meta.url is the resolved real path — a bare string compare fails).
const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === self;
  } catch {
    return entry === self;
  }
})();
if (isDirectRun) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      const isCollect = process.argv[2] === 'collect';
      if (!isCollect) console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = isCollect ? 0 : 1;
    });
}
