# Vantage

A coaching-first Deadlock companion: **your last 10 ranked games, read closely**.
Choose a measurable goal before a session, get automatic match feedback, and
keep optional notes about what you noticed.

**Live:** https://tripod110.github.io/vantage/

## Current experience

- Ten-game ranked window, cached on this device and synced incrementally.
- Automatic **S–F personal-form grades**, comparing each match with the other
  available games, independent of winning or meeting the session goal.
- Separate **goal hit / missed / unmeasurable** verdicts against the target
  committed before the match. Goal snapshots survive changes and session ends.
- Hero/result/grade tiles, a selected-match summary, and deeper match review.
- Interactive economy chart, timestamped observations, winning/losing averages,
  optional notes/tags, and teaching mode.
- Recent activity and session facts, with incomplete history clearly labelled.

The grade uses four equally weighted metrics: deaths by 10 minutes, Souls versus
the lobby at 10 minutes, last-hit efficiency at 12 minutes, and KDA. Each metric
scores how often this match outperformed comparison games, counting ties as
half. Five comparison values per metric and three usable metrics are required.
The review exposes the calculation and S–F thresholds. This measures recent
personal statistics across heroes, not rank or every decision in the match.

**Narrate only what the data supports.** Missing evidence stays unavailable;
Vantage does not invent causes. The player never has to self-grade to see a
review. Notes and tags save locally as edited.

## Run and test

Requires Node.js for the provided local server and tests; the app itself has
no runtime package dependencies or build step.

```
node tests/serve.cjs
node --test tests/*.test.cjs
```

Open http://127.0.0.1:8765/. Python's `python -m http.server` also works from
the repository root. If restricted Windows execution blocks Node test workers,
run `node --test --test-isolation=none tests/*.test.cjs`.

For deterministic browser checks, the Node server exposes
`http://127.0.0.1:8765/?fixture=coaching`. It uses synthetic data and a separate
storage namespace with offline/empty-history controls. The production app
does not load that fixture.

## Architecture and compatibility

Plain HTML/CSS/global JavaScript, no framework, backend, API key, or bundler.
Data comes from deadlock-api.com. Local storage uses `vantage:` keys.

- `queue.js` / `history.js` / `store.js`: last-ten ranked cache, four concurrent
  metadata fetches, no polling, versioned coaching migration.
- `analyze.js` / `grading.js`: profile extraction, comparisons, grounded
  moments, transparent personal-form grading and chart observations.
- `goals.js` / `coaching.js` / `sessions.js`: target generation, committed
  snapshots, automatic results, learning/regression, and session facts.
- `dashboard.js` / `experience.js` / `review-table.js`: dashboard and shared
  evidence presentation. `app.js` owns state, routing, and events;
  `charts.js` provides the responsive canvas inspector.
- `api.js` / `steamid.js` / `assets.js`: endpoint client, numeric Steam IDs and
  numeric profile links, cached hero and rank catalogs.

Older 20-game caches trim before rendering. Profile version 3 fixes missing
fields being interpreted as zero, requiring one refresh of older profiles;
an unchanged valid cache makes zero metadata requests. Existing goal records,
notes, tags, and saved verdicts are migrated without deleting legacy keys.

GitHub Pages serves `main` at the repository root; script/style asset version
is `v=9`. Preserve this app's Git history. Older unrelated app branches are
not the deployment source. Always verify public HTML/scripts after publishing.

## Handoff, history, and credits

- **[Current agent handoff](docs/handoff-prompt.md)** — decisions, rubric,
  state model, migration rules, validation and release status. Start here when
  continuing on another machine.
- [Decision log](PROMPTS.md) — historical discussion; older decisions may be
  superseded by the handoff.
- [Credits](CREDITS.md) — coaching inspiration, public data, and assets.
- [API notes](docs/api-notes.md) — endpoint notes.

Earlier work reused from the owner's Deadlock Tracker, Seance, and postmortem
projects includes the API/Steam ID client, profile extraction, grounded moments,
and rank-score trend logic. Their original implementations are credited in the
historical decision log.

Deferred: custom Steam vanity URLs, cloud sync/auth, Clip Review, cohort
benchmarks, replay playback, death maps, and other games. Statlocker is not
integrated; its API requires manual key approval.
