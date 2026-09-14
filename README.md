# Vantage

A coaching-first gaming assistant to help you improve in any game supported.
Starting with **Deadlock**: ingest a player's match history and turn it into
concrete, per-match deliverables — the "chess.com game review" experience,
but for Deadlock. Retention is driven by daily quests / "try this next game"
prompts generated from a player's own recent match diffs (and later, from
rank-cohort benchmarks).

## What is Vantage?

Not a stats dashboard — a stats *tutor*. Existing trackers (Statlocker,
deadlock-api's own UI components, Deadlock Tracker/Seance before this)
compile **all-time** stats into one static career average. Vantage's
point of interest is different: it's **dynamic** — it stores and morphs
with your last 20 games specifically, so the picture it shows changes
game to game and no two days look the same, instead of slowly diluting
into a lifetime number that stops reacting to how you're playing right
now. On top of that, it converts the numbers into prescriptive, per-match
takeaways plus a retention loop of daily quests, the same job chess.com's
game review does for chess players.

## How will Vantage work?

Four-stage pipeline:

1. **Ingest** — store a linked player's recent match history locally
   (`deadlock-api.com` needs no auth), syncing only what's new on each
   visit rather than re-fetching everything from scratch.
2. **Analyze** — turn one match into a report: economy curve vs. the
   player's own recent baseline, item-timing flags, lane/kill-participation
   deltas, notable moments. Diffed against the player's own history first —
   no cohort/rank data required to ship.
3. **Quest engine** — the retention hook: rule-based "try this next game"
   quests generated from match-to-match diffs. Rank-cohort benchmark quests
   (diff against similarly-ranked players) come later, once
   `badge-distribution` and hero/build stat aggregates are pulled in.
4. **Review UI** — single-match report card, chess.com-review-style — the
   surface a player actually looks at after a game.

`statlocker.gg/api` stays on the shelf as an optional secondary source for a
pre-built skill-rating signal (`ppScore`, MVP scoring) if deriving that
signal from raw data proves too heavy — not on the critical path.

## What does done look like?

Done for the first slice (v0), per the "thin vertical slice before a full
dashboard" principle in [`PROMPTS.md`](PROMPTS.md):

- A player links a Steam ID.
- Vantage pulls their most recent Deadlock match from `deadlock-api.com`.
- It renders one review card for that match: economy curve vs. their own
  recent average, at least one item-timing flag, and one generated "try
  this next game" quest.
- No auth system, no account persistence, no cohort benchmarking required
  yet — those are v1+.

## Where will Vantage be used?

**Web app.** Browser-based, no install — in line with how other Deadlock
tools (Statlocker, deadlock-api's own UI components) are consumed, and
lowest-friction to iterate on for v0. Discord bot and browser-overlay
delivery are plausible later distribution channels but out of scope for
now.

## Tech stack

Same zero-cost, zero-build pattern as this author's other apps (peak,
bloom): plain HTML/CSS/JS, no framework, no build step, deployed to GitHub
Pages.

- **No backend.** `api.deadlock-api.com` requires no auth key, so the
  browser calls it directly client-side (needs a CORS smoke test before
  relying on this).
- **Canvas-based custom charts** for the economy curve — no charting
  library dependency.
- **No persistence for v0** — each visit is a fresh single-match lookup;
  localStorage (e.g. for recent lookups) can be added later if needed.
- **GitHub Pages** deploy with `?v=N` cache-busting + service worker,
  matching peak/bloom's release pattern.

## Reused from prior work

- **[`api.js`](api.js)** — ported from the `ApiClient` built for
  **Deadlock Tracker** (`D:\Claude\Projects\Deadlock Tracker`), a working,
  live-validated client over `deadlock-api.com`: match history, MMR
  history, match metadata, heroes/items/ranks assets, player search. Carries
  over the rank-tier names, team ids, and the `player_score` /
  `rank = division*10 + division_tier` quirks documented there.
- **Seance** (`D:\Claude\Projects\Seance`) — the "next iteration of Deadlock
  Tracker," a ban-safe personal coaching companion. Its
  `src/shared/core/` is a pure, framework-agnostic TS module (~1,756 lines,
  13 files, 94 tests) that maps directly onto Vantage's Analyze/Quest
  stages — to port (TS → plain JS, same algorithms):
  - `steamId.ts` — SteamID64 ↔ `account_id` conversion. Resolves how a
    player's input gets turned into what the API wants.
  - `performance.ts` — `extractProfile()` parses per-minute `stats[]`
    snapshots inside raw `/metadata` (net worth, CS%, damage share) into a
    match profile — **this is the economy-curve data source**; it's
    derived from `/metadata` (already fetched by `api.js`), not a separate
    analytics endpoint. Also has `rollingBaseline()`/`compareToBaseline()`
    — "diff this match against your own recent baseline," Vantage's
    Analyze spec verbatim — and a statistically strict pattern-detector
    that reports "no reliable signal yet" rather than overclaiming from a
    small sample.
  - `takeaways.ts` — narration engine: momentum swings, death clusters,
    objective timing → grounded, non-repeating text, under a hard "narrate
    only what the data supports, never invent a cause, never give advice"
    rule. `buildReviewQueue()` outputs 2-4 timestamped moments — this **is**
    Vantage's "flagged moments" feature.
  - `trends.ts` — streaks, slump detection, per-hero recent-vs-baseline.
  - `goal.ts` — trend projection against a target rank/date
    (ahead/on-pace/behind) — a natural fit for a rank-goal quest.
  - `feltVsActual.ts` — post-game gut-feel vs. the real numbers, phrased
    non-judgmentally.
  - **House style to carry over:** "narrate only what's supported, never
    invent a cause, no advice" — the same ethos as bloom's "never claim
    precision it doesn't have." Adopt as Vantage's own guiding principle.
- **[`postmortem`](../postmortem)**'s
  [`design/boxscore-mockup.html`](../postmortem/design/boxscore-mockup.html)
  is a visual reference for a post-match report card, and its
  `postmortem_fullrecord.js`/`postmortem_headline.js` show a prior attempt
  at turning raw match stats into narrative "what happened" copy — relevant
  to the review card's flagged-moments text.
- Test accounts: `186993885` ("Tripod", the user's own account) and
  `1113640227` (has ranked history) — both already used in sibling
  Deadlock projects.

## Data sources

- **Primary: [deadlock-api.com](https://api.deadlock-api.com)** — free, open,
  no API key required for the core Game Data API. Raw match history, player
  stats, item purchase timing, ability builds, analytics endpoints (lane soul
  curve, player performance curve, hero/item stats, etc). This is what the
  match-review and quest engine are built on.
- **Secondary (reserve): [statlocker.gg/api](https://statlocker.gg/api)** —
  requires a manually-approved API key (apply via Steam sign-in on their
  site). Exposes Statlocker's own derived metrics: `ppScore`,
  `estimatedRankNumber`, `mvpScore`, per-player `metrics` object. Not wired
  in yet — kept as an optional secondary source if/when we want a
  ready-made skill-rating signal instead of building our own from raw data.
  Rate limits: 1,000 match req/hr, 10,000 account req/hr per key.

See [`docs/api-notes.md`](docs/api-notes.md) for endpoint-level notes on both.

## Architecture

1. **Ingest** — [`api.js`](api.js) + [`steamid.js`](steamid.js). Resolves a
   SteamID64/account id/profile link and pulls the live match-history list
   (the one light call needed to know a new match happened).
2. **Ranked window** — [`queue.js`](queue.js) + [`store.js`](store.js) +
   [`history.js`](history.js). A hard-capped window of the player's last 20
   **ranked** games (`match_mode 4`), stored in `localStorage` and
   delta-synced: `/metadata` is only fetched for matches not already cached
   at the current `PROFILE_VERSION`. Other modes are kept as light entries
   for sessions but never enter baselines — mixing modes had been
   contaminating every number (8–12 overall was 5–10 in ranked).
3. **Analyze** — [`analyze.js`](analyze.js). Per-match profile from
   `/metadata` (deaths, deaths by 10, Souls lost to deaths, Souls vs lobby at
   10, Souls/min, trooper damage by 20, items by 10, accuracy, economy
   curve), grounded flagged moments, and `separators()`: wins vs losses per
   metric with sample sizes, refusing to compare below 3 of each. This
   replaced "furthest from your median", because the median of a losing
   stretch is a losing standard.
4. **Sessions** — [`sessions.js`](sessions.js). Matches under an hour apart
   form a session; reports the early half vs late half of a session and
   recent load (games today, hours this week). Facts only, no advice.
5. **Goals and accountability** — [`goals.js`](goals.js). One yes/no goal
   at a time, with its threshold derived from the player's winning games.
   Before a session the player picks it; after each ranked game they grade
   themselves *before* seeing the data, and Vantage scores how often their
   read matched. Hit 8 of the last 10 → learned; learned goals keep being
   checked and are flagged when they slip. Also reports ranked games played
   without a session goal, and rank-score trend (slope ported from Seance
   `goal.ts`).
6. **Catalogs** — [`assets.js`](assets.js). Hero and rank catalogs, cached a
   week. Rank names are never hard-coded (a ported list was already stale).
7. **Homepage** — [`dashboard.js`](dashboard.js): Recently → your goal and
   pending self-grades → what separates your wins from losses → the window
   as a 20-tile selector with a detail pane. Rank is deliberately small.
8. **Review** — [`app.js`](app.js) / [`charts.js`](charts.js): this game's
   numbers next to your winning and losing averages (labelled only where the
   two actually differ), your goal verdict, economy curve and flagged
   moments. Teaching mode rewrites generated lines with terms defined.

`app.js` is the shell: it owns goal/session state, paints from cache before
syncing, and routes between Dashboard and Review. Tests:
`node --test tests/*.test.cjs`.

## Status

**Live** at https://tripod110.github.io/vantage/, no backend, deployed
straight from `main` via GitHub Pages. Run locally with
`python -m http.server` from this directory.

Not yet done: **Statlocker rank** (blocked on a manually-approved key),
custom `/id/` Steam links, cross-device sync (Firebase design discussed),
Clip Review, and the later ideas listed in PROMPTS.md (replay links,
execution vs understanding profile, lobby-rank context, death map, tag
trends, weekly digest).

See [`PROMPTS.md`](PROMPTS.md) for the running decision log.

## Credits

External ideas, data and assets Vantage relies on — including the coaching
frameworks shaping its goal and regression design — are credited in
[`CREDITS.md`](CREDITS.md).
