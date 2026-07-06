import { spawn } from 'node:child_process';

export function browserOpenCommand(platform: NodeJS.Platform, url: string): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  return { cmd: 'xdg-open', args: [url] };
}

/** Best-effort browser open. Never throws — a failed spawn is swallowed so the
 *  command still prints the URL and stays up. */
export function openBrowser(url: string): void {
  try {
    const { cmd, args } = browserOpenCommand(process.platform, url);
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* ignore */
  }
}
