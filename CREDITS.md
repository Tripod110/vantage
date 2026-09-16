# Credits and sources

Every external idea, dataset, and asset Vantage draws on, so credit goes where
it belongs. Add an entry the moment something external shapes the app, and
update its **Status** when an idea actually ships.

Code reused from the owner's own earlier projects (Deadlock Tracker, Seance,
postmortem) isn't external and is documented in README → "Reused from prior
work" instead.

Vantage is an unofficial, fan-made tool. It is not affiliated with or endorsed
by Valve.

---

## Ideas and coaching frameworks

### Deathy — *The Framework to be Top 1% in Any Game*
- **Source:** YouTube, https://www.youtube.com/watch?v=o9-H6URkfDc (creator
  introduces himself as Deathy, a professional Deadlock coach). Transcript
  supplied by the project owner.
- **Added:** 2026-09-14
- **Ideas drawn on:**
  - Short-term goals should be measurable, answerable yes or no, and
    independent of winning or losing — so a lost game can still be a
    successful one.
  - Rank is fine as a long-term goal but a poor daily metric.
  - The "loading phase": early on, repetitions matter more than structure
    (the video estimates 50–100 hours for MOBA-complexity games).
  - A five-step improvement loop: identify mistakes → separate execution
    from game understanding → focused practice → trust the process →
    solidify learnings (including keeping a log and periodically re-checking
    old goals).
  - Regression timeline: ignore a day or two; after several days, check
    you're still applying past learnings; stuck for one to two weeks,
    restart at step one.
  - Rank "walls": higher brackets play differently, so learnings that worked
    below can stop working and a temporary drop is normal.
  - The "40/40/20" rule of thumb for team games. The video explicitly
    describes this as a made-up heuristic, not a measured statistic, and
    Vantage must present it that way if it's ever used.
  - Around 55% sustained win rate as a strong result.
- **Status:** partly implemented (2026-09-14):
  - **Shipped** — measurable yes/no goals judged independently of the
    result (`goals.js`); rank demoted from the headline; a goal log that
    marks goals learned and keeps re-checking them for slipping; automatic goal verdicts and optional notes/tags (updated 2026-09-15; self-grading removed at the owner's request).
  - **Not yet** — the loading phase, the execution vs. understanding split,
    the full regression timeline, the 40/40/20 heuristic, and the 55%
    benchmark.

### Chess.com Game Review
- **Source:** https://www.chess.com
- **Added:** 2026-09-08
- **Idea drawn on:** the overall product framing — a post-game review that
  tells you what happened and what to try next, rather than a stats dashboard.
- **Status:** inspiration for the core concept since the project began.

## Data

### deadlock-api.com
- **Source:** https://deadlock-api.com (API at https://api.deadlock-api.com)
- **Added:** 2026-09-08
- **Used for:** all match history, per-match metadata, MMR history, Steam
  profile lookups, and the hero and rank catalogs, including the hero icon and
  rank badge images Vantage displays.
- **Status:** in use. Primary and only live data source.

### Valve — Deadlock and Steam
- **Used for:** Deadlock hero names, hero art and rank badge art (Valve's
  property, served through deadlock-api.com), and Steam persona names and
  avatars.
- **Status:** in use.

## Consulted, not used

### Statlocker public API
- **Source:** https://statlocker.gg/api
- **Added:** 2026-09-08
- **Why consulted:** a possible secondary source for a ready-made skill rating
  (`ppScore`, `estimatedRankNumber`, `mvpScore`).
- **Status:** not integrated — keys require a manual application. Their docs
  ask for "Powered by Statlocker" credit if their data is ever shipped; see
  `docs/api-notes.md`.

## Assets

### Google Fonts — Inter and Sora
- **Source:** https://fonts.google.com
- **Added:** 2026-09-09
- **Used for:** all app typography (Sora for headings and numbers, Inter for
  body text), loaded from fonts.googleapis.com. Both are Open Font License.
- **Status:** in use.
