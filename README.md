# flightbox

Local-first flight recorder for coding agent sessions. Records what your
agent actually did — tools called, files touched, commands run, tokens
spent — and turns it into an auditable timeline.

100% local. Zero telemetry. Your session data never leaves your machine.

## Install

```bash
npm install -g flightbox
flightbox install   # registers hooks in ~/.claude/settings.json
flightbox list      # your past sessions are already there
```

## Commands

| Command | What it does |
|---|---|
| `flightbox install` | Register collection hooks (Claude Code) |
| `flightbox list` | Recent sessions: project, started, events, tokens |
| `flightbox show <id>` | Timeline of one session |
| `flightbox stats` | Token usage by day and by project |

## How it works

Claude Code hooks append raw events to `~/.flightbox/raw/` (the collector
never fails and never slows your session). Transcripts under
`~/.claude/projects/` are parsed on demand for token usage — which is why
sessions from before you installed flightbox show up too. Everything is
normalized into SQLite at `~/.flightbox/db.sqlite`.

## Status

MVP: Claude Code only. The ingestion layer is adapter-based — other agents
are on the roadmap. Web UI with claims-vs-reality analysis is next.
