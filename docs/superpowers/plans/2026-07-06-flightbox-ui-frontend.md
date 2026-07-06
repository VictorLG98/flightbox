# flightbox Plan 2b — Web UI + `flightbox ui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React SPA (session list + three-zone session view), serve it statically from the existing `node:http` server, add the `flightbox ui` command, and make degraded mode real by emitting `file_touches` from transcript `tool_use` blocks.

**Architecture:** The Plan 2a backend already exposes `GET /api/sessions`, `/api/sessions/:id`, and `/api/sessions/:id/claims` on `127.0.0.1`. This plan adds a Vite/React app (built to static assets) that the same server serves for non-API routes, plus a `flightbox ui` command that ingests, starts the server on a free port, opens the browser, and stays foreground until Ctrl-C. A prerequisite backend fix makes transcript-only sessions produce `file_touches` so the claims panel is never empty in degraded mode.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), React 19 + Vite (dev deps only), `node:http` static serving, vitest + @testing-library/react (jsdom via per-file docblock), better-sqlite3 (unchanged sole prod dep).

## Global Constraints

- **100% local, zero telemetry, no network calls.** The server binds `127.0.0.1` only. Browser-open helpers must never make network requests.
- **Sole production dependency stays `better-sqlite3`.** Vite, React, react-dom, and all testing libs are `devDependencies`. The shipped artifact is the built static bundle plus the compiled Node code — the SPA never imports Node/SQLite modules.
- **The API JSON is the only frontier.** The SPA reaches data exclusively through `fetch` to the three endpoints. It never imports from `src/store.ts` or any better-sqlite3-touching module (type-only shape duplication in `web/src/types.ts` is the boundary).
- **Public artifacts in English** (UI copy, README). Internal plan/spec stay Spanish.
- **Node ≥20**, TypeScript strict. ESM with explicit `.js` import extensions in Node code (`src/**`). The `web/**` app is bundled by Vite and uses normal TS/TSX imports.
- **Server foreground safety:** `flightbox ui` is the only long-lived command; it must handle SIGINT cleanly (close server, exit 0) and never crash the process on a failed browser open.

---

## File Structure

**Backend (Node, `src/**`):**
- `src/ingest/transcripts.ts` (modify) — add `touches` to `TranscriptNorm`, emit `FileTouchInput` from `tool_use` blocks.
- `src/ingest/ingest.ts` (modify) — insert transcript touches for hook-less sessions only.
- `src/paths.ts` (modify) — add `webDistDir()` pointing at packaged static assets.
- `src/server/static.ts` (create) — pure static-file resolver + content-type map with path-traversal guard.
- `src/server/server.ts` (modify) — serve static assets / SPA fallback for non-API GET routes.
- `src/commands/ui.ts` (create) — `cmdUi`: ingest, start server, open browser, foreground until SIGINT.
- `src/browser.ts` (create) — pure `browserOpenCommand(platform, url)` + `openBrowser` that never throws.
- `src/cli.ts` (modify) — route `ui`, extend HELP.
- `package.json` (modify) — devDeps, `build` = `tsc && vite build`, `build:web`, `files` includes web assets.

**Test convention (IMPORTANT):** This repo keeps ALL tests in `tests/` at the
repo root (e.g. `tests/ingest.test.ts`), importing source as `../src/<path>.js`.
There are NO co-located `*.test.ts` files under `src/`. Every backend test in
this plan goes in `tests/`, and web tests go under `web/src/`. The existing 69
tests all live in `tests/` — do not break their discovery.

**Frontend (Vite/React, `web/**`):**
- `web/index.html` — Vite entry.
- `web/vite.config.ts` — React plugin, `base: './'`, `build.outDir` = `../dist/web`, dev proxy `/api` → `127.0.0.1:51789`.
- `web/tsconfig.json` — DOM libs, `jsx: react-jsx`.
- `web/src/main.tsx` — mount `<App/>`.
- `web/src/types.ts` — DTO shapes mirrored from the API (boundary; no Node import).
- `web/src/api.ts` — `fetchSessions`, `fetchSession`, `fetchClaims`.
- `web/src/router.ts` — minimal `useHashRoute` hook (no router dep).
- `web/src/App.tsx` — route switch (list vs. session).
- `web/src/SessionList.tsx` — list view.
- `web/src/SessionView.tsx` — three-zone detail view (composes the three below).
- `web/src/Timeline.tsx` — zone 2 (filter/search/collapse/sidechain).
- `web/src/ClaimsPanel.tsx` — zone 3 (claims-vs-reality).
- `web/src/format.ts` — token/duration formatting for the UI.
- `web/src/*.test.tsx` — component tests (jsdom via `// @vitest-environment jsdom`).
- `vitest.config.ts` (create) — React plugin so `.tsx` tests transform; default env `node`.

---

### Task 1: Degraded-mode fix — emit `file_touches` from transcripts

**Files:**
- Modify: `src/ingest/transcripts.ts`
- Modify: `src/ingest/ingest.ts`
- Test: `tests/ingest-transcripts.test.ts` (append cases), `tests/ingest.test.ts` (append case) — both files already exist.

**Interfaces:**
- Consumes: `classifyTool` (returns optional `touch: {path, action}`), `makeUniqKey`, `FileTouchInput` from `../atf.js`.
- Produces: `TranscriptNorm` now carries `touches: FileTouchInput[]`. `runIngest` persists them for hook-less sessions.

- [ ] **Step 1: Write the failing test (transcripts emits a touch)**

Append to `tests/ingest-transcripts.test.ts` (it already imports `normalizeTranscriptLine` from `../src/ingest/transcripts.js` and has a `describe` block — add a new `describe` after the existing one):

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTranscriptLine } from '../src/ingest/transcripts.js';

describe('normalizeTranscriptLine file_touches', () => {
  it('emits an edit touch for an Edit tool_use block', () => {
    const line = JSON.stringify({
      sessionId: 's1', timestamp: '2026-07-06T10:00:00Z', type: 'assistant', uuid: 'u1',
      message: { model: 'claude-x', content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/a.ts' } },
      ] },
    });
    const norm = normalizeTranscriptLine(line);
    expect(norm?.touches).toEqual([
      expect.objectContaining({ sessionId: 's1', path: '/repo/a.ts', action: 'edit', ts: '2026-07-06T10:00:00Z' }),
    ]);
    expect(norm?.touches[0].uniqKey).toMatch(/^[0-9a-f]{40}$/);
  });

  it('emits no touches for a Bash tool_use block', () => {
    const line = JSON.stringify({
      sessionId: 's1', timestamp: '2026-07-06T10:00:00Z', type: 'assistant', uuid: 'u2',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
    });
    expect(normalizeTranscriptLine(line)?.touches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ingest-transcripts.test.ts`
Expected: FAIL — `touches` is undefined on `TranscriptNorm`.

- [ ] **Step 3: Implement**

In `src/ingest/transcripts.ts`, extend the interface and emit touches. Change the import line and interface:

```ts
import { classifyTool, makeUniqKey } from '../atf.js';
import type { AtfEvent, SessionPatch, TokenUsageInput, FileTouchInput } from '../atf.js';

export interface TranscriptNorm {
  usage?: TokenUsageInput;
  events: AtfEvent[];
  touches: FileTouchInput[];
  session?: SessionPatch;
}
```

Initialize `touches` in the two early-return branches and the main object. Replace `const out: TranscriptNorm = { events: [], session };` with `{ events: [], touches: [], session }`. The first early return (`typeof sessionId !== 'string' ...`) already returns `null` — unchanged. The `if (obj.type !== 'assistant' || !obj.message) return out;` branch now returns an object whose `touches` is `[]` — correct.

Inside the `content.forEach` callback, after pushing the event, emit a touch when the tool is a file mutation/read:

```ts
    const c = classifyTool(block.name, block.input);
    out.events.push({
      sessionId, ts, type: c.type, toolName: block.name, detail: c.detail,
      source: 'transcript', sidechain: !!obj.isSidechain,
      uniqKey: makeUniqKey('transcript', String(obj.uuid ?? ts), String(i), block.name),
    });
    if (c.touch) {
      out.touches.push({
        sessionId, path: c.touch.path, action: c.touch.action, ts,
        uniqKey: makeUniqKey('transcript-touch', String(obj.uuid ?? ts), String(i), block.name),
      });
    }
```

- [ ] **Step 4: Run to verify transcript test passes**

Run: `npx vitest run tests/ingest-transcripts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing ingest test (touches persisted for hook-less session → attempted claim)**

Append a new `it(...)` to the existing `describe('runIngest', ...)` in `tests/ingest.test.ts`. That file's `beforeEach` already sets `FLIGHTBOX_HOME`/`FLIGHTBOX_CLAUDE_HOME` to temp dirs and creates `tmp/claude/projects/-p-app/`. Write a NEW hook-less transcript file there containing an `Edit` tool_use, then re-open/ingest. Model it on the existing `transcriptLine()` helper but with an Edit block. Concretely:

```ts
it('records attempted file_touches for a hook-less transcript session', () => {
  const proj = path.join(tmp, 'claude', 'projects', '-p-app');
  fs.writeFileSync(
    path.join(proj, 's-edit.jsonl'),
    JSON.stringify({
      type: 'assistant', uuid: 'e1', timestamp: '2026-07-05T14:03:00.000Z',
      sessionId: 's-edit', cwd: '/p/app', isSidechain: false,
      message: { model: 'claude-sonnet-4-6', content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: '/p/app/a.ts' } },
      ] },
    }) + '\n',
  );
  runIngest(store);
  expect(store.claimsForSession('s-edit')).toEqual([{ path: '/p/app/a.ts', status: 'attempted' }]);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/ingest.test.ts`
Expected: FAIL — claims empty because touches aren't inserted for transcript sessions.

- [ ] **Step 7: Implement ingest persistence**

In `src/ingest/ingest.ts`, inside `ingestTranscripts`, the hook-less backfill block currently inserts only events. Insert touches in the same gated block:

```ts
      const sessionId = norms.find((n) => n.session)?.session?.id;
      if (sessionId && store.hookEventCount(sessionId) === 0) {
        for (const n of norms) {
          for (const e of n.events) store.insertEvent(e);
          for (const t of n.touches) store.insertFileTouch(t);
        }
      }
```

Gating on `hookEventCount === 0` prevents double-counting when hooks already recorded the same edits (hook and transcript uniqKeys differ, so they would not dedup).

- [ ] **Step 8: Run all ingest tests**

Run: `npx vitest run tests/ingest.test.ts tests/ingest-transcripts.test.ts`
Expected: PASS (new + existing, no regression). Then run the whole suite once (`npx vitest run`) to confirm zero regressions before committing.

- [ ] **Step 9: Commit**

```bash
git add src/ingest/transcripts.ts src/ingest/ingest.ts tests/ingest-transcripts.test.ts tests/ingest.test.ts
git commit -m "feat: emit file_touches from transcripts so degraded mode shows attempted edits"
```

---

### Task 2: Frontend tooling, API client, and shared types

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/src/main.tsx`, `web/src/types.ts`, `web/src/api.ts`, `web/src/format.ts`, `web/src/App.tsx` (minimal placeholder)
- Create: `vitest.config.ts`
- Modify: `package.json` (devDeps + scripts)
- Test: `web/src/api.test.ts`, `web/src/format.test.ts`

**Interfaces:**
- Produces: `web/src/types.ts` exports `SessionListItem`, `SessionDetail`, `EventDto`, `ClaimsDto` (mirrors `src/server/store-api.ts`). `web/src/api.ts` exports `fetchSessions(): Promise<SessionListItem[]>`, `fetchSession(id: string): Promise<SessionDetail>`, `fetchClaims(id: string): Promise<ClaimsDto>`. `web/src/format.ts` exports `formatTokens(n: number): string`, `formatDuration(ms: number | null): string`.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vite@^6 @vitejs/plugin-react@^4 react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```

Expected: added to `devDependencies`; `dependencies` still contains only `better-sqlite3`. Verify: `node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies))"` prints `[ 'better-sqlite3' ]`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // web tests opt into jsdom via `// @vitest-environment jsdom`
    // MUST include the existing tests/ dir (69 tests live there) plus the new web tests.
    include: ['tests/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
  },
});
```

After creating this config, run `npx vitest run` and confirm all 69 existing tests still run and pass — a wrong `include` here silently drops the whole existing suite.

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:51789' } },
});
```

- [ ] **Step 5: Create `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx` (placeholder)**

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>flightbox</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`web/src/App.tsx` (placeholder, replaced in Task 3):

```tsx
export function App() {
  return <h1>flightbox</h1>;
}
```

- [ ] **Step 6: Create `web/src/types.ts`**

```ts
// Mirror of src/server/store-api.ts DTOs. This is the API boundary: the SPA never
// imports Node/SQLite modules, so shapes are duplicated here intentionally.
export interface SessionListItem {
  id: string; project: string | null; startedAt: string | null; endedAt: string | null;
  durationMs: number | null; tokens: number; fileCount: number; hasDiscrepancy: boolean;
}
export interface EventDto {
  ts: string; type: string; toolName: string | null; detail: string; sidechain: boolean;
}
export interface SessionDetail {
  id: string; project: string | null; model: string | null;
  startedAt: string | null; endedAt: string | null; durationMs: number | null;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  fileCount: number; commandCount: number; subagentCount: number; events: EventDto[];
}
export interface ClaimsDto {
  sessionId: string; hooksPresent: boolean;
  files: Array<{ path: string; status: 'succeeded' | 'failed' | 'attempted' }>;
}
```

- [ ] **Step 7: Write the failing tests for `format.ts` and `api.ts`**

`web/src/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatTokens, formatDuration } from './format.js';

describe('formatTokens', () => {
  it('formats thousands and millions', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(2_300_000)).toBe('2.3M');
  });
});

describe('formatDuration', () => {
  it('formats ms into h/m/s and handles null', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(3_661_000)).toBe('1h 1m');
  });
});
```

`web/src/api.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSessions, fetchSession, fetchClaims } from './api.js';

afterEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

describe('api client', () => {
  it('fetchSessions hits /api/sessions', async () => {
    mockFetch([{ id: 'a' }]);
    const r = await fetchSessions();
    expect(fetch).toHaveBeenCalledWith('/api/sessions');
    expect(r).toEqual([{ id: 'a' }]);
  });
  it('fetchSession encodes id', async () => {
    mockFetch({ id: 'a b' });
    await fetchSession('a b');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/a%20b');
  });
  it('fetchClaims targets the claims route', async () => {
    mockFetch({ sessionId: 'a', hooksPresent: false, files: [] });
    await fetchClaims('a');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/a/claims');
  });
  it('throws on non-ok', async () => {
    mockFetch({}, false);
    await expect(fetchSessions()).rejects.toThrow();
  });
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `npx vitest run web/src/format.test.ts web/src/api.test.ts`
Expected: FAIL — modules not implemented.

- [ ] **Step 9: Implement `web/src/format.ts` and `web/src/api.ts`**

`web/src/format.ts`:

```ts
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
```

`web/src/api.ts`:

```ts
import type { SessionListItem, SessionDetail, ClaimsDto } from './types.js';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed: ${url} (${res.status})`);
  return (await res.json()) as T;
}

export function fetchSessions(): Promise<SessionListItem[]> {
  return getJson('/api/sessions');
}
export function fetchSession(id: string): Promise<SessionDetail> {
  return getJson(`/api/sessions/${encodeURIComponent(id)}`);
}
export function fetchClaims(id: string): Promise<ClaimsDto> {
  return getJson(`/api/sessions/${encodeURIComponent(id)}/claims`);
}
```

- [ ] **Step 10: Update `package.json` scripts**

Set `"build": "tsc && vite build web"`, add `"build:web": "vite build web"`, add `"typecheck:web": "tsc -p web/tsconfig.json"`. Update `"prepack": "tsc && vite build web"`. Add `"web"` and the built assets to `files`: `"files": ["dist"]` already includes `dist/web` since Vite outputs there — confirm `outDir` is `../dist/web` so no extra `files` entry is needed. (Do NOT add `web/` source to `files`.)

- [ ] **Step 11: Run tests + verify Vite build works**

Run: `npx vitest run web/src/format.test.ts web/src/api.test.ts` → PASS.
Run: `npx vite build web` → produces `dist/web/index.html` and `dist/web/assets/*`. Verify: `test -f dist/web/index.html && echo OK`.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json vitest.config.ts web/
git commit -m "feat: scaffold Vite/React web app, API client, and shared DTO types"
```

---

### Task 3: Session list view + hash router

**Files:**
- Create: `web/src/router.ts`, `web/src/SessionList.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/SessionList.test.tsx`, `web/src/router.test.ts`

**Interfaces:**
- Consumes: `fetchSessions` from `./api.js`, `SessionListItem` from `./types.js`, `formatTokens`/`formatDuration` from `./format.js`.
- Produces: `web/src/router.ts` exports `useHashRoute(): { route: 'list' } | { route: 'session'; id: string }` and `navigate(hash: string): void`. `SessionList` renders a table; each row links to `#/session/<id>`.

- [ ] **Step 1: Write the failing router test**

`web/src/router.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHash } from './router.js';

describe('parseHash', () => {
  it('maps empty/# to list', () => {
    expect(parseHash('')).toEqual({ route: 'list' });
    expect(parseHash('#/')).toEqual({ route: 'list' });
  });
  it('maps #/session/:id to session', () => {
    expect(parseHash('#/session/abc123')).toEqual({ route: 'session', id: 'abc123' });
  });
  it('decodes the id', () => {
    expect(parseHash('#/session/a%20b')).toEqual({ route: 'session', id: 'a b' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/router.test.ts`
Expected: FAIL — `parseHash` not defined.

- [ ] **Step 3: Implement `web/src/router.ts`**

```ts
import { useEffect, useState } from 'react';

export type Route = { route: 'list' } | { route: 'session'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/session\/(.+)$/.exec(hash);
  if (m) return { route: 'session', id: decodeURIComponent(m[1]) };
  return { route: 'list' };
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

- [ ] **Step 4: Run to verify router test passes**

Run: `npx vitest run web/src/router.test.ts` → PASS.

- [ ] **Step 5: Write the failing SessionList test**

`web/src/SessionList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionList } from './SessionList.js';
import * as api from './api.js';

afterEach(() => vi.restoreAllMocks());

const rows = [
  { id: 'aaa111', project: '/repo/x', startedAt: '2026-07-06T10:00:00Z', endedAt: '2026-07-06T10:05:00Z',
    durationMs: 300000, tokens: 12000, fileCount: 3, hasDiscrepancy: true },
  { id: 'bbb222', project: null, startedAt: null, endedAt: null,
    durationMs: null, tokens: 0, fileCount: 0, hasDiscrepancy: false },
];

describe('SessionList', () => {
  it('renders a row per session with formatted tokens and a discrepancy badge', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue(rows as any);
    render(<SessionList />);
    await waitFor(() => expect(screen.getByText('/repo/x')).toBeInTheDocument());
    expect(screen.getByText('12.0K')).toBeInTheDocument();
    // discrepancy badge present for the first row only
    expect(screen.getAllByTestId('discrepancy-badge')).toHaveLength(1);
    // link points at the session hash route
    const link = screen.getByRole('link', { name: /aaa111/ });
    expect(link).toHaveAttribute('href', '#/session/aaa111');
  });

  it('shows an empty state when there are no sessions', async () => {
    vi.spyOn(api, 'fetchSessions').mockResolvedValue([]);
    render(<SessionList />);
    await waitFor(() => expect(screen.getByText(/no sessions/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run web/src/SessionList.test.tsx`
Expected: FAIL — `SessionList` not defined.

- [ ] **Step 7: Implement `web/src/SessionList.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { fetchSessions } from './api.js';
import type { SessionListItem } from './types.js';
import { formatTokens, formatDuration } from './format.js';

export function SessionList() {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions().then(setSessions).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p role="alert">Failed to load sessions: {error}</p>;
  if (sessions === null) return <p>Loading…</p>;
  if (sessions.length === 0) return <p>No sessions recorded yet.</p>;

  const shortId = (id: string) => id.slice(0, 8);
  return (
    <table>
      <thead>
        <tr><th>Session</th><th>Project</th><th>Started</th><th>Duration</th><th>Tokens</th><th>Files</th><th></th></tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td><a href={`#/session/${encodeURIComponent(s.id)}`}>{shortId(s.id)}</a></td>
            <td>{s.project ?? '—'}</td>
            <td>{s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'}</td>
            <td>{formatDuration(s.durationMs)}</td>
            <td>{formatTokens(s.tokens)}</td>
            <td>{s.fileCount}</td>
            <td>{s.hasDiscrepancy && <span data-testid="discrepancy-badge" title="Claims-vs-reality discrepancy">⚠</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Note: the test link name `/aaa111/` matches `href` containing the full id via `encodeURIComponent`, but the visible text is `shortId`. Adjust the assertion source: the visible link text is `aaic...`? To keep the test valid, change `getByRole('link', { name: /aaa111/ })` reliance — instead the test should query by href. Update Step 5 test's link assertion to: `const link = screen.getByText('aaa111'.slice(0,8)).closest('a'); expect(link).toHaveAttribute('href', '#/session/aaa111');`. Use this corrected form when writing the test.

- [ ] **Step 8: Wire `App.tsx` to the router**

```tsx
import { useHashRoute } from './router.js';
import { SessionList } from './SessionList.js';
import { SessionView } from './SessionView.js';

export function App() {
  const route = useHashRoute();
  return (
    <main>
      <header><a href="#/">flightbox</a></header>
      {route.route === 'list' ? <SessionList /> : <SessionView id={route.id} />}
    </main>
  );
}
```

`SessionView` is created in Task 4. Until then, add a temporary stub `web/src/SessionView.tsx`:

```tsx
export function SessionView({ id }: { id: string }) {
  return <p>Session {id}</p>;
}
```

- [ ] **Step 9: Run to verify SessionList test passes**

Run: `npx vitest run web/src/SessionList.test.tsx web/src/router.test.ts` → PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/router.ts web/src/SessionList.tsx web/src/App.tsx web/src/SessionView.tsx web/src/SessionList.test.tsx web/src/router.test.ts
git commit -m "feat: session list view with hash routing and discrepancy badge"
```

---

### Task 4: Session detail — header summary + timeline

**Files:**
- Create: `web/src/Timeline.tsx`
- Modify: `web/src/SessionView.tsx` (replace stub: header + timeline; claims panel added in Task 5)
- Test: `web/src/Timeline.test.tsx`, `web/src/SessionView.test.tsx`

**Interfaces:**
- Consumes: `fetchSession` from `./api.js`, `SessionDetail`/`EventDto` from `./types.js`, `formatTokens`/`formatDuration`.
- Produces: `Timeline` is `function Timeline({ events }: { events: EventDto[] })`. `SessionView` is `function SessionView({ id }: { id: string })` fetching detail and rendering zone 1 (header) + zone 2 (timeline). Claims panel slot left for Task 5.

- [ ] **Step 1: Write the failing Timeline test**

`web/src/Timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline.js';
import type { EventDto } from './types.js';

const events: EventDto[] = [
  { ts: '2026-07-06T10:00:00Z', type: 'command', toolName: 'Bash', detail: 'npm test', sidechain: false },
  { ts: '2026-07-06T10:01:00Z', type: 'file_touch', toolName: 'Edit', detail: '/repo/a.ts', sidechain: false },
  { ts: '2026-07-06T10:02:00Z', type: 'subagent_spawn', toolName: 'Task', detail: 'review', sidechain: false },
  { ts: '2026-07-06T10:02:30Z', type: 'file_touch', toolName: 'Read', detail: '/repo/b.ts', sidechain: true },
];

describe('Timeline', () => {
  it('renders all events by default', () => {
    render(<Timeline events={events} />);
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByText('/repo/a.ts')).toBeInTheDocument();
  });

  it('filters by event type', async () => {
    render(<Timeline events={events} />);
    await userEvent.selectOptions(screen.getByLabelText(/filter/i), 'command');
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.queryByText('/repo/a.ts')).not.toBeInTheDocument();
  });

  it('searches by detail text', async () => {
    render(<Timeline events={events} />);
    await userEvent.type(screen.getByLabelText(/search/i), 'a.ts');
    expect(screen.getByText('/repo/a.ts')).toBeInTheDocument();
    expect(screen.queryByText('npm test')).not.toBeInTheDocument();
  });

  it('marks sidechain (subagent) events', () => {
    render(<Timeline events={events} />);
    expect(screen.getByTestId('sidechain-/repo/b.ts')).toBeInTheDocument();
  });
});
```

Add `@testing-library/user-event` to devDeps in Step 1 install if not present: `npm install -D @testing-library/user-event@^14`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/Timeline.test.tsx`
Expected: FAIL — `Timeline` not defined.

- [ ] **Step 3: Implement `web/src/Timeline.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { EventDto } from './types.js';

const TYPES = ['all', 'tool_call', 'file_touch', 'command', 'subagent_spawn', 'session_start', 'session_end'] as const;

export function Timeline({ events }: { events: EventDto[] }) {
  const [type, setType] = useState<string>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) =>
      (type === 'all' || e.type === type) &&
      (q === '' || e.detail.toLowerCase().includes(q) || (e.toolName ?? '').toLowerCase().includes(q)),
    );
  }, [events, type, query]);

  return (
    <section>
      <div>
        <label>
          Filter type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Search
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="text or path" />
        </label>
      </div>
      <ol>
        {visible.map((e, i) => (
          <li key={i} data-testid={e.sidechain ? `sidechain-${e.detail}` : undefined} style={{ marginLeft: e.sidechain ? 24 : 0 }}>
            <time>{new Date(e.ts).toLocaleTimeString()}</time>
            <span> {e.type} </span>
            {e.toolName && <code>{e.toolName}</code>}
            <span> {e.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify Timeline test passes**

Run: `npx vitest run web/src/Timeline.test.tsx` → PASS.

- [ ] **Step 5: Write the failing SessionView test**

`web/src/SessionView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionView } from './SessionView.js';
import * as api from './api.js';

afterEach(() => vi.restoreAllMocks());

const detail = {
  id: 'aaa111bbb', project: '/repo/x', model: 'claude-opus',
  startedAt: '2026-07-06T10:00:00Z', endedAt: '2026-07-06T10:05:00Z', durationMs: 300000,
  tokens: { input: 1000, output: 2000, cacheRead: 500, cacheCreation: 100 },
  fileCount: 2, commandCount: 3, subagentCount: 1,
  events: [{ ts: '2026-07-06T10:01:00Z', type: 'command', toolName: 'Bash', detail: 'npm test', sidechain: false }],
};

describe('SessionView', () => {
  it('renders header summary and timeline', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(detail as any);
    // ClaimsPanel (Task 5) fetches claims; stub to avoid unhandled rejection
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({ sessionId: 'aaa111bbb', hooksPresent: true, files: [] } as any);
    render(<SessionView id="aaa111bbb" />);
    await waitFor(() => expect(screen.getByText('claude-opus')).toBeInTheDocument());
    expect(screen.getByText('/repo/x')).toBeInTheDocument();
    expect(screen.getByText('5m 0s')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
  });
});
```

(If Task 5 not yet built when this test runs, the `fetchClaims` spy line is harmless — remove the ClaimsPanel render from `SessionView` until Task 5, then this assertion still holds. When Task 5 lands, the stub prevents failures.)

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run web/src/SessionView.test.tsx`
Expected: FAIL — stub `SessionView` doesn't render header/timeline.

- [ ] **Step 7: Implement `web/src/SessionView.tsx` (header + timeline)**

```tsx
import { useEffect, useState } from 'react';
import { fetchSession } from './api.js';
import type { SessionDetail } from './types.js';
import { formatTokens, formatDuration } from './format.js';
import { Timeline } from './Timeline.js';

export function SessionView({ id }: { id: string }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    fetchSession(id).then(setDetail).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p role="alert">Failed to load session: {error}</p>;
  if (!detail) return <p>Loading…</p>;
  const t = detail.tokens;

  return (
    <article>
      <header>
        <h2>{detail.project ?? '(unknown project)'}</h2>
        <dl>
          <dt>Model</dt><dd>{detail.model ?? '—'}</dd>
          <dt>Duration</dt><dd>{formatDuration(detail.durationMs)}</dd>
          <dt>Tokens</dt><dd>in {formatTokens(t.input)} · out {formatTokens(t.output)} · cache r{formatTokens(t.cacheRead)}/c{formatTokens(t.cacheCreation)}</dd>
          <dt>Files</dt><dd>{detail.fileCount}</dd>
          <dt>Commands</dt><dd>{detail.commandCount}</dd>
          <dt>Subagents</dt><dd>{detail.subagentCount}</dd>
        </dl>
      </header>
      <Timeline events={detail.events} />
      {/* ClaimsPanel added in Task 5 */}
    </article>
  );
}
```

- [ ] **Step 8: Run to verify SessionView test passes**

Run: `npx vitest run web/src/SessionView.test.tsx` → PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/Timeline.tsx web/src/SessionView.tsx web/src/Timeline.test.tsx web/src/SessionView.test.tsx package.json package-lock.json
git commit -m "feat: session detail view with header summary and filterable timeline"
```

---

### Task 5: Claims-vs-reality panel (zone 3)

**Files:**
- Create: `web/src/ClaimsPanel.tsx`
- Modify: `web/src/SessionView.tsx` (mount `<ClaimsPanel id={id} />`)
- Test: `web/src/ClaimsPanel.test.tsx`

**Interfaces:**
- Consumes: `fetchClaims` from `./api.js`, `ClaimsDto` from `./types.js`.
- Produces: `ClaimsPanel` is `function ClaimsPanel({ id }: { id: string })`.

- [ ] **Step 1: Write the failing test (three statuses + degraded + all-succeeded)**

`web/src/ClaimsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ClaimsPanel } from './ClaimsPanel.js';
import * as api from './api.js';

afterEach(() => vi.restoreAllMocks());

describe('ClaimsPanel', () => {
  it('renders per-file status icons', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({
      sessionId: 's', hooksPresent: true,
      files: [
        { path: '/a.ts', status: 'succeeded' },
        { path: '/b.ts', status: 'failed' },
        { path: '/c.ts', status: 'attempted' },
      ],
    });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText('/a.ts')).toBeInTheDocument());
    expect(screen.getByTestId('status-/a.ts')).toHaveTextContent('✓');
    expect(screen.getByTestId('status-/b.ts')).toHaveTextContent('✗');
    expect(screen.getByTestId('status-/c.ts')).toHaveTextContent('⚠');
  });

  it('shows a degraded-mode warning when hooks are absent', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({
      sessionId: 's', hooksPresent: false, files: [{ path: '/a.ts', status: 'attempted' }],
    });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText(/hooks not installed/i)).toBeInTheDocument());
    expect(screen.getByText('/a.ts')).toBeInTheDocument();
  });

  it('shows an all-good message when every attempted edit succeeded', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({
      sessionId: 's', hooksPresent: true, files: [{ path: '/a.ts', status: 'succeeded' }],
    });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText(/everything attempted was executed/i)).toBeInTheDocument());
  });

  it('shows an empty message when no edits were attempted', async () => {
    vi.spyOn(api, 'fetchClaims').mockResolvedValue({ sessionId: 's', hooksPresent: true, files: [] });
    render(<ClaimsPanel id="s" />);
    await waitFor(() => expect(screen.getByText(/no file edits/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/ClaimsPanel.test.tsx`
Expected: FAIL — `ClaimsPanel` not defined.

- [ ] **Step 3: Implement `web/src/ClaimsPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { fetchClaims } from './api.js';
import type { ClaimsDto } from './types.js';

const ICON: Record<string, string> = { succeeded: '✓', failed: '✗', attempted: '⚠' };

export function ClaimsPanel({ id }: { id: string }) {
  const [claims, setClaims] = useState<ClaimsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClaims(null);
    fetchClaims(id).then(setClaims).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p role="alert">Failed to load claims: {error}</p>;
  if (!claims) return <p>Loading claims…</p>;

  const allSucceeded = claims.files.length > 0 && claims.files.every((f) => f.status === 'succeeded');

  return (
    <section>
      <h3>Claims vs. reality</h3>
      {!claims.hooksPresent && (
        <p role="note">⚠ Hooks not installed for this session — edits shown are attempts; execution outcome is unknown.</p>
      )}
      {claims.files.length === 0 ? (
        <p>No file edits were attempted in this session.</p>
      ) : (
        <ul>
          {claims.files.map((f) => (
            <li key={f.path}>
              <span data-testid={`status-${f.path}`} title={f.status}>{ICON[f.status] ?? '?'}</span>{' '}
              <code>{f.path}</code>
            </li>
          ))}
        </ul>
      )}
      {claims.hooksPresent && allSucceeded && <p>Everything attempted was executed ✓</p>}
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run web/src/ClaimsPanel.test.tsx` → PASS.

- [ ] **Step 5: Mount in `SessionView.tsx`**

Replace the `{/* ClaimsPanel added in Task 5 */}` comment with `<ClaimsPanel id={id} />` and add `import { ClaimsPanel } from './ClaimsPanel.js';`.

- [ ] **Step 6: Run the full web suite**

Run: `npx vitest run web/` → PASS (SessionView test's `fetchClaims` stub now consumed by the mounted panel).

- [ ] **Step 7: Commit**

```bash
git add web/src/ClaimsPanel.tsx web/src/SessionView.tsx web/src/ClaimsPanel.test.tsx
git commit -m "feat: claims-vs-reality panel with degraded-mode warning"
```

---

### Task 6: Static asset serving in the HTTP server

**Files:**
- Create: `src/server/static.ts`
- Modify: `src/paths.ts` (add `webDistDir`), `src/server/server.ts`
- Test: `tests/static.test.ts` (create), `tests/server.test.ts` (append serving cases)

**Interfaces:**
- Consumes: `webDistDir()` from `../paths.js`.
- Produces: `src/server/static.ts` exports `resolveStaticFile(distDir: string, urlPath: string): { filePath: string; contentType: string } | null` (returns null on traversal or missing dir root) and `contentTypeFor(filePath: string): string`. `server.ts` serves `resolveStaticFile` results for non-API GET routes, falling back to `index.html` for client routes.

- [ ] **Step 1: Add `webDistDir` to `src/paths.ts`**

At the top ensure these imports exist (add if missing): `import { fileURLToPath } from 'node:url';` and `import path from 'node:path';`. Then add:

```ts
// Static web assets are emitted by Vite to dist/web, a sibling of this compiled file
// (dist/paths.js). Resolve relative to the module so it works from any CWD and via npx.
export function webDistDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
}
```

- [ ] **Step 2: Write the failing static resolver test**

`tests/static.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStaticFile, contentTypeFor } from '../src/server/static.js';

let dist: string;
beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-static-'));
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
});
afterAll(() => fs.rmSync(dist, { recursive: true, force: true }));

describe('contentTypeFor', () => {
  it('maps common extensions', () => {
    expect(contentTypeFor('a.html')).toMatch(/text\/html/);
    expect(contentTypeFor('a.js')).toMatch(/javascript/);
    expect(contentTypeFor('a.css')).toMatch(/text\/css/);
    expect(contentTypeFor('a.svg')).toMatch(/svg/);
    expect(contentTypeFor('a.unknown')).toMatch(/octet-stream/);
  });
});

describe('resolveStaticFile', () => {
  it('resolves a real asset', () => {
    const r = resolveStaticFile(dist, '/assets/app.js');
    expect(r?.filePath).toBe(path.join(dist, 'assets', 'app.js'));
    expect(r?.contentType).toMatch(/javascript/);
  });
  it('serves index.html for /', () => {
    expect(resolveStaticFile(dist, '/')?.filePath).toBe(path.join(dist, 'index.html'));
  });
  it('falls back to index.html for a client route (no extension, not found)', () => {
    expect(resolveStaticFile(dist, '/session/abc')?.filePath).toBe(path.join(dist, 'index.html'));
  });
  it('rejects path traversal', () => {
    expect(resolveStaticFile(dist, '/../../etc/passwd')).toBeNull();
    expect(resolveStaticFile(dist, '/assets/../../secret')).toBeNull();
  });
  it('returns null for a missing asset with an extension', () => {
    expect(resolveStaticFile(dist, '/assets/missing.js')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/static.test.ts`
Expected: FAIL — module not implemented.

- [ ] **Step 4: Implement `src/server/static.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function contentTypeFor(filePath: string): string {
  return TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve a URL path to a file inside distDir. Traversal-safe. Client routes
 *  (no file extension, no match) fall back to index.html so the SPA can route. */
export function resolveStaticFile(
  distDir: string,
  urlPath: string,
): { filePath: string; contentType: string } | null {
  const root = path.resolve(distDir);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null; // traversal

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return { filePath: candidate, contentType: contentTypeFor(candidate) };
  }
  // No extension → treat as a client-side route; serve index.html.
  if (path.extname(candidate) === '') {
    const index = path.join(root, 'index.html');
    if (fs.existsSync(index)) return { filePath: index, contentType: contentTypeFor(index) };
  }
  return null;
}
```

- [ ] **Step 5: Run to verify static test passes**

Run: `npx vitest run tests/static.test.ts` → PASS.

- [ ] **Step 6: Write the failing server serving test**

Add to `tests/server.test.ts` (mirror the existing `startServer` + `fetch` harness used there — read that file first to reuse its store fixture and `url` variable):

```ts
// within the existing describe that starts the server against a fixture store:
it('serves the SPA index for the root and client routes', async () => {
  // The test must point the server at a temp dist dir with an index.html.
  // See note below on how server.ts obtains the dist dir.
  const res = await fetch(`${url}/`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/text\/html/);
});

it('still serves JSON for /api routes (no regression)', async () => {
  const res = await fetch(`${url}/api/sessions`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/application\/json/);
});
```

To make the dist dir injectable for tests, `createServer`/`startServer` gain an optional `distDir` parameter defaulting to `webDistDir()`. The serving test passes a temp dir containing `index.html`.

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL — non-API routes currently return `404 {error:'not found'}`.

- [ ] **Step 8: Modify `src/server/server.ts`**

Add the import and thread `distDir` through:

```ts
import fs from 'node:fs';
import { webDistDir } from '../paths.js';
import { resolveStaticFile } from './static.js';
```

Change `createServer(store: Store)` to `createServer(store: Store, distDir: string = webDistDir())`. Replace the final `sendJson(res, 404, { error: 'not found' });` (the fall-through after the `/api/sessions` block) with static serving:

```ts
    // Non-API GET: serve the built SPA (static asset or client-route fallback).
    const resolved = resolveStaticFile(distDir, url.pathname);
    if (resolved) {
      res.writeHead(200, { 'content-type': resolved.contentType });
      fs.createReadStream(resolved.filePath).pipe(res);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
```

Thread `distDir` through `startServer`:

```ts
export function startServer(
  store: Store,
  portStart = 51789,
  distDir: string = webDistDir(),
): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(store, distDir);
    // ...unchanged body...
```

- [ ] **Step 9: Run server + full backend suite**

Run: `npx vitest run tests/static.test.ts tests/server.test.ts` then `npx vitest run` (whole suite)
Expected: PASS, including existing API tests (no regression). Malformed-id → 404 tests still pass (those are `/api/...` routes, handled before the static fallback).

- [ ] **Step 10: Commit**

```bash
git add src/server/static.ts tests/static.test.ts src/server/server.ts tests/server.test.ts src/paths.ts
git commit -m "feat: serve built SPA statically with path-traversal-safe resolver and client-route fallback"
```

---

### Task 7: `flightbox ui` command + browser open + build wiring

**Files:**
- Create: `src/browser.ts`, `src/commands/ui.ts`
- Modify: `src/cli.ts` (route `ui`, extend HELP)
- Test: `tests/browser.test.ts` (create), `tests/ui.test.ts` (create)

**Interfaces:**
- Consumes: `startServer` from `../server/server.js`, `runIngest`+`openStore`, `browserOpenCommand`/`openBrowser` from `../browser.js`.
- Produces: `src/browser.ts` exports `browserOpenCommand(platform: NodeJS.Platform, url: string): { cmd: string; args: string[] }` and `openBrowser(url: string): void` (never throws). `src/commands/ui.ts` exports `cmdUi(): Promise<number>`.

- [ ] **Step 1: Write the failing browser test**

`tests/browser.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/browser.test.ts`
Expected: FAIL — module not implemented.

- [ ] **Step 3: Implement `src/browser.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify browser test passes**

Run: `npx vitest run tests/browser.test.ts` → PASS.

- [ ] **Step 5: Write the failing `cmdUi` test**

`tests/ui.test.ts` — verify wiring without blocking the process: inject seams for ingest/server/open so the test asserts the sequence and that the resolved URL is printed, then simulate SIGINT to resolve.

```ts
import { describe, it, expect, vi } from 'vitest';
import { runUi } from '../src/commands/ui.js';

describe('runUi', () => {
  it('ingests, starts the server, opens the browser, and closes on stop signal', async () => {
    const order: string[] = [];
    const close = vi.fn(() => order.push('close'));
    const deps = {
      ingest: vi.fn(() => order.push('ingest')),
      start: vi.fn(async () => { order.push('start'); return { url: 'http://127.0.0.1:51789', close }; }),
      open: vi.fn((u: string) => order.push(`open:${u}`)),
      onStop: (fn: () => void) => { order.push('armed'); queueMicrotask(fn); }, // fire stop immediately
      log: vi.fn(),
    };
    const code = await runUi(deps as any);
    expect(code).toBe(0);
    expect(order).toEqual(['ingest', 'start', 'open:http://127.0.0.1:51789', 'armed', 'close']);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:51789'));
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL — `runUi` not defined.

- [ ] **Step 7: Implement `src/commands/ui.ts`**

Split a pure, testable `runUi(deps)` from the process-wiring `cmdUi()`:

```ts
import fs from 'node:fs';
import { dbPath, flightboxHome } from '../paths.js';

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
      deps.log(`flightbox UI running at ${url} — press Ctrl-C to stop`);
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
  fs.mkdirSync(flightboxHome(), { recursive: true });
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
```

- [ ] **Step 8: Run to verify `cmdUi` test passes**

Run: `npx vitest run tests/ui.test.ts` → PASS.

- [ ] **Step 9: Route `ui` in `src/cli.ts`**

Add `import { cmdUi } from './commands/ui.js';`. Add a case:

```ts
    case 'ui':
      return await cmdUi();
```

Add to HELP after the `stats` line:

```
  flightbox ui          open the local web UI (Ctrl-C to stop)
```

- [ ] **Step 10: Full build + suite + manual smoke**

Run: `npm run build` → `tsc` compiles Node code to `dist/`, then `vite build web` emits `dist/web/`. Verify: `test -f dist/cli.js && test -f dist/web/index.html && echo OK`.
Run: `npx vitest run` → whole suite PASS.
Manual smoke (document, do not automate): `FLIGHTBOX_HOME=/tmp/fbx-ui-smoke node dist/cli.js ui` prints a `127.0.0.1` URL, opens the browser (or prints URL if open fails), and exits 0 on Ctrl-C.

- [ ] **Step 11: Commit**

```bash
git add src/browser.ts tests/browser.test.ts src/commands/ui.ts tests/ui.test.ts src/cli.ts
git commit -m "feat: flightbox ui command — ingest, serve, open browser, foreground until Ctrl-C"
```

---

### Task 8: README + docs update

**Files:**
- Modify: `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update `README.md`**

Add a `flightbox ui` entry to the command list and a short "Web UI" section describing: local-only server on `127.0.0.1`, session list + three-zone session view (summary, timeline, claims-vs-reality), and the degraded-mode note (claims need hooks installed for the "reality" signal; transcript-only sessions show attempted edits with a warning). Keep it English, factual, no overstated claims. Confirm no command is described that doesn't exist (mirror the corrected-columns discipline from Plan 1).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document flightbox ui and the web interface"
```

---

## Self-Review

**Spec coverage:**
- SPA React (list + three-zone session view) → Tasks 3, 4, 5. ✓
- Static serving from the server → Task 6. ✓
- `flightbox ui` (ingest + free-port server + browser open + foreground) → Task 7. ✓
- Vite/React as dev deps, single prod dep → Task 2 (verified in Step 1). ✓
- Degraded mode real (never empty) → Task 1 (backend) + Task 5 (warning + empty message). ✓
- Timeline filter/search/sidechain → Task 4. ✓
- Claims three statuses + degraded warning + all-succeeded → Task 5. ✓
- Testing: component tests + static-serving 200 smoke → Tasks 3–6. ✓
- English public artifacts → Tasks 5, 8 copy. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. The SessionList test link assertion is corrected inline in Task 3 Step 7. ✓

**Type consistency:** `web/src/types.ts` mirrors `store-api.ts` DTOs exactly (SessionListItem, EventDto, SessionDetail, ClaimsDto). `resolveStaticFile` signature is consistent between `static.ts`, its test, and `server.ts`. `runUi`'s `UiDeps` matches its test's injected object. `createServer`/`startServer` gain a trailing optional `distDir` — backward compatible with Plan 2a callers. ✓

**Scope:** Frontend + serving + `ui` command + the one backend degraded-mode fix the spec mandates. No streaming, no diff-level claims, no export — all correctly deferred to v3+. ✓
