# flightbox

Local-first flight recorder for coding agent sessions. Records what your
agent actually did — tools called, files touched, commands run, tokens
spent — and turns it into an auditable timeline.

100% local. Zero telemetry. Your session data never leaves your machine.

## Install

Not published to npm yet — run from a clone:

```bash
git clone <repo> flightbox && cd flightbox
npm install
npm run build
npm link            # puts `flightbox` on your PATH

flightbox install   # registers hooks in ~/.claude/settings.json
flightbox list      # your past sessions are already there
flightbox ui        # open the web UI
```

## Commands

| Command | What it does |
|---|---|
| `flightbox install` | Register collection hooks (Claude Code) |
| `flightbox list` | Recent sessions: project, started, events, tokens |
| `flightbox show <id>` | Timeline of one session |
| `flightbox stats` | Token usage by day and by project |
| `flightbox ui` | Open the local web UI (Ctrl-C to stop) |

## Web UI

`flightbox ui` ingests the latest data, starts a local server on `127.0.0.1`
(no auth, no network — it binds loopback only), and opens your browser. It
serves a small single-page app with two views:

- **Session list** — project, date, duration, tokens, files touched, and a
  badge on sessions with a claims-vs-reality discrepancy.
- **Session view** — three zones: a summary header, a filterable/searchable
  timeline (subagent events nested), and a **claims-vs-reality** panel.

### Claims vs. reality

For each file the agent tried to edit, the panel shows whether the edit
**succeeded** (✓), **failed** (✗), or was **attempted** with no recorded
outcome (⚠). This is a structural, deterministic comparison — attempts come
from the agent's `Edit`/`Write` calls, outcomes come from the hook results.
No text analysis, no guessing.

The "reality" signal requires hooks (`flightbox install`). Sessions recorded
before hooks were installed still show attempted edits, marked ⚠ with a
"hooks not installed" note — never a blank screen.

## How it works

Claude Code hooks append raw events to `~/.flightbox/raw/` (the collector
never fails and never slows your session). Transcripts under
`~/.claude/projects/` are parsed on demand for token usage — which is why
sessions from before you installed flightbox show up too. Everything is
normalized into SQLite at `~/.flightbox/db.sqlite`.

## Status

MVP: Claude Code only. The ingestion layer is adapter-based — other agents
are on the roadmap.
