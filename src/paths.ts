import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function flightboxHome(): string {
  return process.env.FLIGHTBOX_HOME ?? path.join(os.homedir(), '.flightbox');
}

export function rawLogDir(): string {
  return path.join(flightboxHome(), 'raw');
}

export function dbPath(): string {
  return path.join(flightboxHome(), 'db.sqlite');
}

export function claudeHome(): string {
  return process.env.FLIGHTBOX_CLAUDE_HOME ?? path.join(os.homedir(), '.claude');
}

export function claudeProjectsDir(): string {
  return path.join(claudeHome(), 'projects');
}

export function claudeSettingsPath(): string {
  return path.join(claudeHome(), 'settings.json');
}

// Static web assets are emitted by Vite to dist/web, a sibling of this compiled file
// (dist/paths.js). Resolve relative to the module so it works from any CWD and via npx.
export function webDistDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
}
