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
   SteamID64/account id, pulls the live match-history list from
   deadlock-api.com (that one light call is unavoidable — it's the only
   way to know a new match happened).
2. **Recent-games memory** — [`queue.js`](queue.js) + [`store.js`](store.js)
   + [`history.js`](history.js). Vantage never diffs a match against a
   player's entire history — only a **hard-capped window of their last 20
   games**, modeled explicitly as a queue (most recent = front; once full,
   the least recent game is the next one evicted). Vantage **stores** this
   window in the browser (`localStorage`) instead of re-fetching it fresh
   every visit: `syncMatchHistory()` diffs the live match list against what's
   cached and only fetches the heavy `/metadata` for genuinely new matches
   — a returning visitor with no new games makes zero of those calls. This
   is the actual differentiator from other trackers that compile all-time
   stats: Vantage's picture morphs game-to-game, so no two days look the
   same, instead of accumulating into one static career average. Currently
   local to one browser/device — see PROMPTS.md for the cross-device sync
   discussion.
3. **Analyze** — [`analyze.js`](analyze.js), ported from Seance's
   `performance.ts`/`takeaways.ts`. Per-match profile from raw `/metadata`
   (economy curve, item timing, deaths), a rolling baseline over the
   recent-games queue, and grounded flagged moments (momentum swings, death
   clusters, item-timing, lobby comparison). Every metric that can cross
   zero (e.g. Souls vs. lobby average, which can be negative) is measured
   against a fixed Souls scale rather than baseline percentage — dividing
   by a near-zero baseline was producing nonsense (1000%+) swings.
4. **Quest engine** — `buildQuest()` in `analyze.js`: one rule-based "try
   this next game" line from whichever baseline metric this match fell
   furthest below. Rank-cohort benchmark quests are still future work.
5. **Catalogs** — [`assets.js`](assets.js). Hero and rank catalogs from
   `/v1/assets/*`, cached on disk for a week. Rank *names* are deliberately
   not hard-coded: the list ported from Deadlock Tracker was already stale
   against live data (Alchemist/Arcanist/Ritualist/Archon where the API now
   returns Acolyte/Sentinel/Mystic and no Archon), which would have
   mislabelled every badge.
6. **Dashboard** — [`dashboard.js`](dashboard.js). The hub: Steam identity
   (avatar, persona, current rank badge + est. score), form across the
   window (record, win rate, KDA, souls/min), a rank-score trend sparkline,
   and the 20 matches themselves. Every match row opens that match's review
   — the review is no longer hard-wired to "most recent".
7. **Review UI** — [`index.html`](index.html) / [`app.js`](app.js) /
   [`charts.js`](charts.js) / [`style.css`](style.css): single-match report
   card with a canvas economy-curve chart, flagged moments, and the quest.
   Baseline for a reviewed match is the *other* 19 games in the window, so a
   match is never compared against itself. A **teaching-mode toggle**
   switches every generated line to a voice that defines terms inline
   (Seance's std/npm two-voice pattern) — same data, same rules, more
   context for a newer player.

`app.js` is the shell: it remembers whose page this is, paints the
dashboard from cache before the network sync finishes, and routes between
the two tabs.

## Status

**Live** at https://tripod110.github.io/vantage/, verified against
`api.deadlock-api.com` with no backend. Enter a SteamID64/account id once
and it's remembered; after that you land on a dashboard of your last 20
games, and any match opens its own review. Deployed straight from this
repo's `main` branch root via GitHub Pages — no build step, no `gh-pages`
branch. To run locally: `python -m http.server` from this directory.

**In flight:** the dashboard's match list reads as a table rather than an
app surface, so four redesign directions are up for a decision — see
`design/` for the artboard sources (`Main`/`Coach`/`CommandCenter`/
`Spotlight`, laid out by `canvas.json`) and PROMPTS.md for what each one
trades off. Nothing is wired into the app yet.

Not yet done: **Statlocker rank** (blocked — their API needs a
manually-approved key, no self-serve signup; see `docs/api-notes.md`),
non-numeric (vanity URL) Steam id input, cross-device sync (a Google-login
+ Firebase design is under discussion, see PROMPTS.md), and Clip Review.
No service worker/cache-busting — unlike peak/bloom, Vantage isn't
installable/offline-first, so that part of the original "Tech stack" note
doesn't apply here.

See [`PROMPTS.md`](PROMPTS.md) for the running decision log.
