# Changelog

All notable changes to tracebox are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [0.2.0] — 2026-07-07

### Added

- **Dashboard** — new home view in the web UI aggregating every recorded session:
  totals (sessions, tokens, files touched, average duration), a claims-vs-reality
  discrepancy rate, and an active-day streak.
- **Activity calendar** — a GitHub-style contribution grid (one cell per day over
  the last 53 weeks, shaded by session count, hover for the daily session/token
  breakdown).
- **Breakdowns** — tokens-by-project and top-tool bar charts on the dashboard.
- **Analytics** — a token-per-day trend sparkline, estimated cost by model (Anthropic
  list prices; cache reads/writes included), an event-type breakdown, and
  most-touched files / hottest folders — all respecting the active project/time filter.
- **Working-hours heatmap** — a weekday × hour (UTC) grid of event activity, backed by
  a new `activityByHour` store aggregate.
- **Session search & compare** — a search box on the session list (project / id / date)
  and two-session selection that opens a side-by-side comparison at `#/compare/:a/:b`.
- **Live dashboard** — an optional auto-refresh (every 10s) toggle on the dashboard.
- `tracebox dashboard` — a terminal summary of the fleet-wide metrics (totals, cost,
  reliability, streak, and the project / model / tool / file breakdowns).
- **Dashboard filters** — filter every metric by project and by time range
  (30 days / 90 days / 12 months / all), served by `GET /api/metrics?project=&from=&to=`.
- **Calendar interactions** — toggle the heatmap between session count and token
  volume; an instant custom tooltip (replacing the delayed native one); click a
  day to jump to the session list filtered to that date (`#/sessions/:day`).
- `GET /api/metrics` endpoint backing the dashboard; new store aggregates
  (`filteredSessions`, `activityByDay`, `activityByProject`, `topTools`,
  `totalTokens`, `totalFileTouches`, `projectNames`), all accepting an optional
  project/date filter.
- Web routing: the dashboard is now the home route (`#/`); the session list moved
  to `#/sessions` (with an optional `#/sessions/:day` filter).

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

[0.2.0]: https://github.com/VictorLG98/tracebox/releases/tag/v0.2.0
[0.1.0]: https://github.com/VictorLG98/tracebox/releases/tag/v0.1.0
