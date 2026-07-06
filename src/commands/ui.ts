import fs from 'node:fs';
import { dbPath, traceboxHome } from '../paths.js';

export interface UiDeps {
  ingest: () => void;
  start: () => Promise<{ url: string; close: () => void }>;
  open: (url: string) => void;
  onStop: (fn: () => void) => void; // registers a one-shot stop handler (e.g. SIGINT)
  log: (msg: string) => void;
}

export function runUi(deps: UiDeps): Promise<number> {
  return new Promise((resolve) => {
    deps.ingest();
    deps.start().then(({ url, close }) => {
      deps.log(`tracebox UI running at ${url} — press Ctrl-C to stop`);
      deps.open(url);
      deps.onStop(() => {
        close();
        resolve(0);
      });
    });
  });
}

export async function cmdUi(): Promise<number> {
  const [{ openStore }, { runIngest }, { startServer }, { openBrowser }] = await Promise.all([
    import('../store.js'),
    import('../ingest/ingest.js'),
    import('../server/server.js'),
    import('../browser.js'),
  ]);
  fs.mkdirSync(traceboxHome(), { recursive: true });
  const store = openStore(dbPath());
  return runUi({
    ingest: () => runIngest(store),
    start: async () => {
      const { server, url } = await startServer(store);
      return { url, close: () => { server.close(); store.close(); } };
    },
    open: (url) => openBrowser(url),
    onStop: (fn) => process.once('SIGINT', fn),
    log: (msg) => console.log(msg),
  });
}
