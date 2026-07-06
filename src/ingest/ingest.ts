import fs from 'node:fs';
import path from 'node:path';
import { rawLogDir, claudeProjectsDir } from '../paths.js';
import { normalizeHookLine } from './hooks.js';
import { normalizeTranscriptLine, type TranscriptNorm } from './transcripts.js';
import type { Store } from '../store.js';

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function listFiles(dir: string, ext: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function ingestHooks(store: Store): void {
  for (const file of listFiles(rawLogDir(), '.jsonl')) {
    for (const line of readLines(file)) {
      const norm = normalizeHookLine(line);
      if (!norm) continue;
      if (norm.session) store.upsertSession(norm.session);
      for (const e of norm.events) store.insertEvent(e);
      for (const t of norm.touches) store.insertFileTouch(t);
      if (norm.outcome) store.insertToolOutcome(norm.outcome);
    }
  }
}

function ingestTranscripts(store: Store): void {
  const projectDirs = (() => {
    try {
      const root = claudeProjectsDir();
      return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(root, d.name));
    } catch {
      return [];
    }
  })();

  for (const dir of projectDirs) {
    for (const file of listFiles(dir, '.jsonl')) {
      const norms = readLines(file)
        .map(normalizeTranscriptLine)
        .filter((n): n is TranscriptNorm => n !== null);
      if (norms.length === 0) continue;

      for (const n of norms) {
        if (n.session) store.upsertSession(n.session);
        if (n.usage) store.insertTokenUsage(n.usage);
      }

      // Hook events are the primary source; transcripts only backfill sessions
      // recorded before flightbox was installed. Claude Code writes one session
      // per transcript file, so gating on the first found is safe. Events without
      // a session are dropped (unattributable without a session).
      const sessionId = norms.find((n) => n.session)?.session?.id;
      if (sessionId && store.hookEventCount(sessionId) === 0) {
        for (const n of norms) {
          for (const e of n.events) store.insertEvent(e);
          for (const t of n.touches) store.insertFileTouch(t);
        }
      }
    }
  }
}

export function runIngest(store: Store): void {
  ingestHooks(store);
  ingestTranscripts(store);
}
