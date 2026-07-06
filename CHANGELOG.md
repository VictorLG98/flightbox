# Changelog

All notable changes to tracebox are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [0.1.0] — 2026-07-06

Initial release.

### Added

- `tracebox install` — register Claude Code hooks (`PreToolUse`, `PostToolUse`,
  `SessionStart`, `Stop`). The collector never fails and never slows a session.
- `tracebox list` / `tracebox show <id>` / `tracebox stats` — terminal views over
  recorded sessions. Past transcripts under `~/.claude/projects/` are backfilled
  automatically, so history shows up on first run.
- `tracebox ui` — local web UI on `127.0.0.1` (no auth, no network). A session list
  plus a three-zone session view: instrument summary, filterable/searchable
  timeline (subagent events nested), and a claims-vs-reality panel.
- **Claims vs. reality** — a structural, deterministic comparison of the edits an
  agent *attempted* against the ones that actually *executed*: ✓ succeeded,
  ✗ failed, ⚠ attempted-without-outcome. No text analysis.
- Dual capture (hooks + transcripts) normalized to a common Agent Trace Format,
  stored in SQLite at `~/.tracebox/db.sqlite`.
- 100% local, zero telemetry. Sole runtime dependency: `better-sqlite3`.

[0.1.0]: https://github.com/VictorLG98/tracebox/releases/tag/v0.1.0
