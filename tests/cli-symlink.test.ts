import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression: when flightbox is installed as a command, npm puts a SYMLINK on
// PATH pointing at dist/cli.js. The direct-run detection must resolve that
// symlink, or `main()` never runs and every command is a silent no-op.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'dist', 'cli.js');

describe('CLI invoked via a symlink (npm-bin style)', () => {
  beforeAll(() => {
    if (!fs.existsSync(cli)) {
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'ignore' });
    }
  });

  it('runs main() through a symlinked bin and prints the version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-link-'));
    const link = path.join(dir, 'flightbox');
    fs.symlinkSync(cli, link);
    const out = execFileSync(process.execPath, [link, '--version'], { encoding: 'utf8' }).trim();
    expect(out).toMatch(/^\d+\.\d+\.\d+$/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
