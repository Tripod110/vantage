# Prompt / decision log

Running paper trail of the prompts and decisions behind Vantage, so context
survives across devices via git history instead of living only in one
machine's chat log. Append new entries at the bottom; don't edit past ones
except to fix a factual error.

---

## 2026-09-08

**Prompt:** "Does statlocker.gg have a public API I can use to poll data?"

- Researched statlocker.gg/api. Public API exists, early/rough state,
  requires a manually-approved API key (Steam sign-in + application).
  Scoped to Statlocker's own derived data (ppScore, MVP scoring, per-match
  metrics), not raw Deadlock data. Rate limits: 1,000 match req/hr, 10,000
  account req/hr per key.

**Prompt:** "I desire to build a coaching platform for newer/older players
... think of it like the chess review feature from chess.com"

- Framed the product as: Statlocker-style derived metrics = the "how good
  was this game" signal; raw match/item-timing data = the "what actually
  happened" signal to diff against rank-appropriate benchmarks. Recommended
  starting with a single-match review page (thin vertical slice) before a
  full account-trends dashboard.

**Prompt:** "I prototyped an application called vantage. ... Starting with
deadlock it takes in all of your deadlock matches and gives you actual
deliverables you can improve upon from match to match. Things like daily
quests or try this out is what is used to keep user retention. ideally
most of the API calls would be from deadlock.api.com but keep statlocker on
the stove incase we need it later."

- Named the project **Vantage**. Decided: deadlock-api.com is the primary
  data source (free, no key, raw match/analytics data); statlocker.gg/api
  is kept as an optional secondary source for a pre-built skill-rating
  signal, not wired in yet.
- Clarifying question asked and answered: quest engine should support
  **both** rule-based (diff against the player's own recent matches — ships
  first, no benchmark data needed) and cohort-benchmark-based (diff against
  rank-appropriate players — needs an aggregate percentile pipeline, layered
  in later) quests. No existing Vantage repo/codebase elsewhere — starting
  fresh.
- Pulled deadlock-api.com's OpenAPI summary to confirm relevant analytics
  endpoints (`player-performance-curve`, `lane-soul-curve`,
  `player-stats/metrics`, `item-flow-stats`, `build-item-stats`,
  `badge-distribution`, etc). See [`docs/api-notes.md`](docs/api-notes.md).

**Prompt:** "create a new gh repo to and please keep an active paper trail
so I don't lose prompts across different devices."

- `gh` CLI not installed on this machine; user created the repo manually at
  https://github.com/Tripod110/vantage.git and I pushed the initial
  scaffold (this file, README, docs/api-notes.md) to it.

**Prompt:** "I think the first step should be as follows. 1. What is
vantage 2. How will vantage work? 3. what does done look like?"

- Answered the three questions and wrote them into README.md as new
  sections ("What is Vantage?", "How will Vantage work?", "What does done
  look like?"). Summary: Vantage is a stats *tutor*, not a dashboard — its
  differentiator over Statlocker/deadlock-api's own UI is converting raw
  numbers into prescriptive per-match takeaways plus a quest-based retention
  loop. Done-for-v0 is a single Steam ID → single most-recent-match review
  card (economy curve vs. own baseline, one item-timing flag, one
  generated quest) — no auth, no persistence, no cohort benchmarking yet.
- Standing instruction from user: going forward, write up decisions in
  README.md and log the prompt/decision in this file at the end of every
  turn in this project.

**Prompt:** "where will vantage be used?"

- Asked user to choose a platform since nothing in the docs had decided
  this yet. Options offered: web app, Discord bot, browser
  extension/overlay, or leave undecided. User chose **web app** —
  matches how other Deadlock tools (Statlocker, deadlock-api's UI
  components) are consumed and is lowest-friction for v0. Logged as a new
  "Where will Vantage be used?" section in README.md; Discord bot and
  overlay noted as possible later distribution channels, not in scope now.

**Prompt:** "go with that stack, What should I use to design the look and
appeal of the app while you work on the backend?"

- Confirmed tech stack: plain HTML/CSS/JS, no build step, no backend
  (browser calls `api.deadlock-api.com` directly client-side, no key
  needed), canvas-based custom charts, no persistence for v0, GitHub Pages
  deploy — matching peak/bloom's pattern. Logged as a new "Tech stack"
  section in README.md.
- Asked about design tooling: offered Figma (independent manual design
  workflow), the built-in `design` skill (live visual canvas, editable by
  hand without touching code), or a reference-driven approach (point at
  existing sites, build directly in HTML/CSS). Awaiting user's choice.

**Prompt:** "give me some potential prompts I could use for design" /
"give me a short excerpt of what vantage is"

- Provided design-tool prompt options (overall mood, landing page, review
  card, quest card, tone anchors) and a short elevator-pitch excerpt of
  Vantage, for the user to take into whichever design tool they pick.
  Not logged as a repo decision (no state changed) — noted here only for
  paper-trail continuity.

**Prompt:** "before we continue is there anything that I've already built
that would aid us in building vantage?" / "yes, pull over what's reusable
into the ingest layer"

- Found real prior work: **Deadlock Tracker**
  (`D:\Claude\Projects\Deadlock Tracker`) has a live-validated
  `ApiClient.ts` over deadlock-api.com (match history, MMR history, match
  metadata, assets, player search) plus typed response shapes and the
  `player_score`/`rank` decoding quirks already documented in
  [[deadlock-api-mmr]]. **postmortem** has a boxscore mockup and
  narrative-copy-generation scripts relevant to the review card's design
  and flagged-moments text.
- Ported the reusable parts into **`api.js`** (new file, vanilla JS,
  matching the peak/bloom global-script convention — no build step): a
  `getJson` fetch wrapper, and functions for match-history, mmr-history,
  match-metadata, ranks/heroes/items assets, batch MMR, Steam profiles, and
  player search, plus the `RANK_TIERS` and `TEAM` constants. Flagged that
  the per-match economy-curve endpoint (`player-performance-curve` /
  `lane-soul-curve`) was never implemented in Deadlock Tracker and still
  needs confirming against the live OpenAPI spec before Analyze is built.
- Logged a new "Reused from prior work" section in README.md pointing at
  `api.js`, the postmortem design references, and the two known test
  account ids (186993885 "Tripod", 1113640227).

**Prompt:** "for vantage I'd also like to be able to submit clips of mine
that I may have a had good or bad plays on and it can tell me specific
things based on the clip. This would require live API calls likely from a
cheap LLM. My route is usually gemini flash as its free and lightweight."

- New stage proposed: **Clip Review** (v1+, not blocking the v0 match-
  review prototype). Stays zero-backend: user's own Gemini API key stored
  client-side (same pattern as peak's meal-scan feature), browser calls
  Gemini directly. Flagged two real constraints: inline video is capped
  ~20MB in `generateContent`, so real clips will need the File API upload
  flow (upload → file URI → reference in the analysis prompt); video is
  token-expensive (~263 tokens/sec on Flash), fine for occasional personal
  use but not "basically free" like a text prompt. Not yet written up in
  README — revisit once v0 match-review ships.

**Prompt:** "what is the overall view and what needs to be done in order
for the prototype to start?"

- Synthesized current state into an overview + ordered task list: verify
  browser CORS against deadlock-api.com, confirm the economy-curve data
  source, resolve Steam ID → account_id, then build the index.html/app.js/
  analyze.js/charts.js v0 slice, deferring Clip Review to v1. (Superseded
  below — the CORS/economy-curve/account-id blockers turned out to already
  be solved by Seance's core.)

**Prompt:** "what parts of the project are we reusing? I've built similar
apps/programs before so we don't need to reinvent the wheel. Note Seance,
or deadlock tracker."

- Read **Seance** (`D:\Claude\Projects\Seance`) — described in its own
  README as "the next iteration of Deadlock Tracker," a ban-safe personal
  coaching companion. Its `src/shared/core/` is a pure, framework-agnostic
  TS module (~1,756 lines, 13 files, 94 tests) carried forward from
  Deadlock Tracker, and it maps directly onto Vantage's Analyze/Quest
  stages:
  - `steamId.ts` solves SteamID64 ↔ `account_id` conversion outright.
  - `performance.ts`'s `extractProfile()` proved the economy curve is
    derived from per-minute `stats[]` snapshots inside raw `/metadata`
    (already fetched by `api.js`) — **not** a separate
    `player-performance-curve`/`lane-soul-curve` endpoint. This closes the
    open item from the previous entry. Its `rollingBaseline()`/
    `compareToBaseline()` is Vantage's "diff vs. own baseline" spec
    already implemented, plus a statistically strict pattern-detector
    that refuses to overclaim from small samples.
  - `takeaways.ts`'s `buildReviewQueue()` (2-4 timestamped moments from
    momentum-swing/death-cluster/objective-timing detectors, under a
    strict "narrate only what's supported, no invented causes, no advice"
    rule) **is** Vantage's "flagged moments" feature.
  - `trends.ts` (streaks/slump/per-hero baseline) and `goal.ts` (trend
    projection against a target rank/date) are candidate quest-engine
    inputs. `feltVsActual.ts` compares post-game gut-feel to the real
    numbers, non-judgmentally.
  - Noted the "narrate only what's supported" ethos matches bloom's "never
    claim precision it doesn't have" — a recurring house style worth
    adopting explicitly for Vantage.
- Logged the full inventory into README.md's "Reused from prior work"
  section, replacing the now-resolved "confirm the economy-curve endpoint"
  caveat. Next action: port `steamId.ts`, `performance.ts`, and
  `takeaways.ts` from TS to plain JS (`steamid.js`, `analyze.js`).

**Prompt:** "yes, start the port" / "/loop until the prototype of vantage
we declared is complete for now"

- Ported Seance's core into plain JS: **`steamid.js`** (SteamID64 ↔
  account_id), **`analyze.js`** (`extractProfile` from `performance.ts` —
  per-minute Souls series + baseline metrics; `dominantSwing`/
  `deathCluster`/`buildFlaggedMoments` from `takeaways.ts`;
  `rollingBaseline`/`compareToBaseline`; a new rule-based `buildQuest()`).
  Added one metric not in the Seance source: `itemsBy10` (items bought by
  10 min, from the `/metadata` `items[]` array's `game_time_s`) plus a
  flagged moment for it, closing the "item-timing flag" the v0 done-bar
  calls for. Also wrote **`charts.js`** (canvas economy-curve line chart,
  no library) and the UI: `index.html` / `app.js` / `style.css`.
- Set up a local static server (`python -m http.server --directory`, via
  `D:\Claude\.claude\launch.json` — launch.json has to live at the *session's*
  working-directory root, not the project folder, for `preview_start` to
  find it) and verified the full v0 flow live in the browser against
  account `186993885`: real match history fetched, hero "Pocket" / Loss /
  36:26, economy curve rendered (this-match vs. baseline lines nearly
  coincide because this player's recent games track close to their own
  average — confirmed correct, not a bug), and all four flagged-moment
  types fired correctly (momentum swing, death cluster, item-timing,
  10-min lobby comparison), sorted chronologically. Quest text generated
  from the worst baseline-relative metric. Input validation and the
  back-to-landing button also verified. No console errors.
- **v0 prototype is functionally complete** against the done-bar declared
  in README. Remaining known gaps (not blocking v0): GitHub Pages deploy +
  service worker, vanity-URL Steam input, Clip Review (v1). Updated
  README's "Architecture" and "Status" sections accordingly.
