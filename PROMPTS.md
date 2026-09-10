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

**Prompt:** "deploy it to GitHub Pages"

- `gh` CLI is now installed and authenticated as Tripod110 (it wasn't when
  the repo was first created — see the entry above from before this
  machine had it). Committed the v0 prototype (`7790177`) and pushed to
  `main`, then enabled Pages via
  `gh api repos/Tripod110/vantage/pages -X POST -f source[branch]=main -f source[path]=/`
  — serving straight from the repo root, no `gh-pages` branch or build
  step needed (matches the zero-build stack). Live at
  https://tripod110.github.io/vantage/. Did **not** add a service worker
  or `?v=N` cache-busting for this deploy — unlike peak/bloom, Vantage
  isn't installable/offline-first (it needs a live API call every visit
  regardless), so that piece of the original "Tech stack" section doesn't
  actually apply; revisit only if Vantage ever adds a PWA manifest.

**Prompt:** "HOW CAN WE IMPROVE THE EXISTING APP?" then "/council" (x2:
"Decide what features are needed" and "what features would be welcome")

- Gave a prioritized gap list (fetch speed, confusing baseline-percentage
  phrasing, no phrasing rotation, numeric-only input, unstyled visuals, no
  cache-busting, Clip Review unbuilt). Then ran two council sessions:
  "needed" surfaced replay-timestamp pointers, an honesty gate on the
  quest engine (don't overclaim from one match), and warned against
  repeating the Deadlock Tracker → Seance scope-creep pattern; "welcome"
  surfaced a teaching-mode voice for newer players (vs. a grinder wanting
  more density — direct conflict, resolved as "build both via a toggle,
  don't pick one"), visual polish, and flagged that social/sharing
  features carry a real privacy cost this app currently has no framework
  for. Councils are ideation, not committed decisions — nothing was built
  from them until the next prompt.

**Prompt:** "add the teaching-mode toggle and visual polish pass. allow
the lookup of only recent games... 15-30... Treat it as a Queue Data
structure... least recent is the next one out of the queue and the most
recent is the first."

- **Teaching-mode toggle**: added a std/npm dual-voice to every generated
  line in `analyze.js` (flagged moments + quest text), same data/rules,
  npm defines terms inline — directly following Seance's `takeaways.ts`
  pattern from the earlier reuse audit. Wired a checkbox in `index.html`.
- **Recent-games queue**: new **`queue.js`** — `RecentGamesQueue`
  (capacity 15-30, enforced), `enqueue`/`dequeue`, `mostRecent`/`rest`
  accessors, plus `buildRecentGamesQueue()` to load it from match history.
  Replaced the old fixed `BASELINE_WINDOW = 8` constant with a user
  ("Recent games to consider (15-30)") input, default 20. The reviewed
  match is the queue's front; the rest is the baseline pool — no more
  diffing against a player's entire history.
- **Visual polish pass**: Sora/Inter fonts, radial glow background, card
  shadows + fade-in-on-render animation, gradient button with hover lift,
  chart caption showing the actual window used, responsive tweaks.
- **Along the way, parallelized the `/metadata` fetches** (4 concurrent
  instead of sequential) since a 30-game window would have made the old
  one-at-a-time fetch loop from the improvement list unacceptably slow —
  addresses gap #1 from the "how can we improve" answer as a side effect.
- **Found and fixed two real bugs during live verification** (not
  hypothetical): (1) teaching-mode text said "900 Souls fewer Souls (the
  currency...)" — doubled units from concatenating an already-unit-suffixed
  string with a second unit phrase; split `soulsStr`/`soulsNum` to fix.
  (2) the quest text read "1069% below your baseline" — `compareToBaseline`
  divided by the baseline median, and `soulsVsLobby10` can have a
  near-zero or negative median (it crosses zero), so percent-of-baseline
  exploded. Fixed by giving that metric a fixed 600-Souls `scale` (matching
  Seance's `feltVsActual.ts` `PERSONAL_BAND` constant) to measure against
  instead of its own baseline — this was exactly the "confusing math" gap
  flagged in the earlier improvement list, now actually fixed rather than
  just noted. Verified both fixes live (teaching mode on/off, 20- and
  30-game windows) before committing.

**Prompt:** "First and foremost, I think our ideas of what vantage is
supposed to be are crossed... Vantage isn't supposed to poll live, it
should store match history... its point of interest is the dynamics of
it. It morphs to your recent match history so no two days are the same.
I think a 20 game limit should be hardcapped."

- Real correction, not a small tweak: the 15-30 configurable window was
  wrong on two counts — it should be a **hard 20, no more no less**, and
  the whole "fetch live every visit, keep nothing" model was backwards.
  Vantage's actual differentiator (vs. Statlocker/Deadlock Tracker/Seance,
  which all compile all-time stats into one static career average) is that
  it's **dynamic** — a stored, morphing 20-game window that changes
  game-to-game, not a fresh live pull with no memory.
- Asked to confirm what "store, don't poll live" meant precisely before
  rebuilding (persistent local cache vs. a real backend that polls
  independently) — user asked which option scales better. Recommended the
  local cache: a backend polling on every tracked user's behalf, forever,
  is exactly the operational burden that forced Deadlock Tracker's rewrite
  into Seance, whereas a client-side cache costs nothing extra per user
  since each browser does its own delta-sync against the free public API.
- **Rebuilt accordingly**: `queue.js` hard-caps at `RECENT_GAMES_CAP = 20`
  (no longer configurable). New **`store.js`** (localStorage, `vantage:`
  prefix, mirrors peak's `Store` pattern). New **`history.js`** —
  `syncMatchHistory()` diffs the live match-history list against the
  cached queue and only fetches `/metadata` for matches not already
  cached, so a returning visitor with no new games makes zero heavy API
  calls. Removed the window-size input from the UI entirely. Verified live:
  first lookup did a full 20-match fetch and cached 33KB; a second lookup
  for the same account (no new matches played) reused all 20 cached
  profiles and rendered in ~3s instead of the original ~10s+, confirming
  the delta-sync path actually skips re-fetching. Updated README's "What is
  Vantage?" to state the dynamic-window differentiator explicitly instead
  of leaving it implicit.

**Prompt:** "could we tie it to a google login so the data is synchronized
across devices?"

- Confirmed feasible without violating the zero-backend/zero-maintenance
  stack decision: **peak already has this exact architecture** —
  `firebase-config.js` + `sync.js`, Firebase Auth (magic-link email there;
  Google Sign-In is a drop-in different provider on the same SDK) +
  Firestore, gated behind an opt-in toggle, security rules restricting each
  user to their own document. Firebase is Google's managed backend, not a
  server the user has to run/maintain, so it doesn't reopen the earlier
  "real backend" tradeoff.
- One real constraint flagged: creating the Firebase project and enabling
  the Google Sign-In provider has to happen in the Firebase Console under
  the user's own Google account — an account-creation/OAuth step Claude
  cannot perform on the user's behalf. Firebase CLI isn't installed on
  this machine either (checked: `firebase: command not found`). Plan:
  local cache stays the source of truth (as just built); cloud sync would
  be an optional layer on top, same two-layer shape as peak. Not yet
  built — next step is the user completing the Firebase Console setup and
  handing over the resulting (non-secret) config, same as peak's
  `firebase-config.js` REPLACE_ME pattern.

**Prompt:** "before that we should work on the actual app itself... I
don't wanna rush things. Re-develop the experience of the app itself.
First tab is a dashboard that houses the recent matches and my current
rank and statlocker rank (if possible). It should have my profile pic
from steam on there somewhere to signify this is my page. Overall the
experience of a dashboard should really feel like a hub for my
performance over the last 20 games I've played."

- Deliberately parked the Firebase/sync work to build the actual product
  experience first. Restructured the single-screen lookup form into a
  **tabbed app shell**: Dashboard | Review | Switch.
- **Verified every data source live before building on it** — which caught
  a real bug: the `RANK_TIERS` constant ported from Deadlock Tracker is
  **stale**. It listed Alchemist/Arcanist/Ritualist/Archon; the live
  `/v1/assets/ranks` returns Acolyte/Sentinel/Mystic and has no Archon at
  all, so the user's rank 33 would have rendered "Alchemist 3" instead of
  the correct "Acolyte 3". Deleted the constant; rank names and badge
  images now come from the live catalog (new **`assets.js`**, disk-cached
  for a week via a new `cachedAsset()` in `store.js`). Lesson worth
  keeping: ported constants are point-in-time snapshots of someone else's
  game patch.
- **`dashboard.js`** (new): identity block (Steam `avatarfull` + persona +
  "78 matches in the last 30 days" + rank badge and ≈est. score), form
  across the window (record / win rate / KDA / souls-min), a rank-score
  trend sparkline, and the 20-match list with hero icons, K/D/A, souls,
  duration and relative time. Every row is a button that opens that
  match's review.
- **Review is no longer hard-wired to the most recent match** — `openReview
  (matchId)` reviews any match in the window, with the *other* 19 games as
  its baseline so a match is never compared against itself.
- App now **remembers the account** (`vantage:accountId`) and paints the
  dashboard from the local cache before the network sync finishes, so
  return visits are instant. "Switch" forgets the account but deliberately
  keeps the cached history, so switching back doesn't re-fetch.
- **Statlocker rank: not possible right now.** Their API issues keys only
  after a manual application (Steam sign-in, no self-serve), so there's no
  key to call it with. Left out rather than shipping dead UI; noted in
  README's status.
- Two bugs found and fixed during verification: (1) `.tabs { display:flex }`
  and `.view { display:block }` were overriding the `hidden` attribute, so
  "hidden" sections still rendered (landing showed the tab bar *and* the
  review's back button) — fixed with a `[hidden] { display:none
  !important }` rule. (2) the rank sparkline auto-scaled its y-axis to the
  data, turning a **1-point** score wobble into a dramatic cliff; floored
  the span at 4 points so small moves look small, which is the same
  "don't overstate what the data supports" rule the text already follows.
- Verified live end to end (first-run fetch, instant cached repaint,
  clicking into a specific match's review, teaching-mode toggle
  re-rendering in place, account switch, and the mobile layout at 375px).

**Prompt:** "this is a good baseline. not a fan of the match list. At
least not on the dashboard. how can we make it look more modern? like an
actual app dashboard? Could we generate some mockups of ideas you have?"

- Built four dashboard directions as a design canvas (artboard sources in
  `design/`, published to a Claude artifact). All four are hi-fi and use
  Vantage's real tokens (Sora/Inter, `#0b0c10` ground, `#15171e` panels,
  `#f0a020` accent, 14px radii) plus the real last-20 data and downloaded
  Steam avatar / hero icons, so they read as the same app rather than a
  different product.
- Framed the brief as one question — **where do the matches go?** — since
  that's the actual complaint behind "not a fan of the match list":
  - **A · Form strip** (`Main.dc.html`) — the 20-game window becomes one
    object: colour = result, bar height = souls/min. Match detail on
    hover. Tradeoff: no hero/KDA visible until you hover.
  - **B · Coach-first** (`Coach.dc.html`) — leads with a diagnosis
    ("you're falling behind before 10 minutes"), numbers below as
    evidence, matches demoted to a rail. Most true to the positioning.
    Tradeoff: needs a real cross-match pattern engine we haven't built —
    the current quest logic is per-match only — and falls flat if the
    headline is obvious or wrong.
  - **C · Command center** (`CommandCenter.dc.html`) — sidebar shell,
    rings vs. own median, switchable trend chart. Tradeoff: the most
    conventional, i.e. the most like every other tracker.
  - **D · Match spotlight** (`Spotlight.dc.html`) — last game as a full
    card carrying its own verdict + economy curve, older games as cards.
    Tradeoff: ~5 games before scrolling, and duplicates the Review tab.
- Static mockups, nothing clickable — the ask was direction-picking.
- Measured every artboard's natural height in a browser before finalizing
  (flattened each `.dc.html` and read `scrollHeight`) rather than guessing
  frame sizes: no clipping, but Main and Spotlight had ~130px of dead
  space, so frames were tightened and the canvas re-seeded.
- The ~2.6MB seeded canvas file is gitignored; the artboards, canvas.json
  and images in `design/` are the source of truth and re-seed from any
  machine.

**Prompt:** "I'm between A and D"

- Observed that A and D aren't actually competing — A answers "what does my
  form look like right now", D answers "what just happened and what do I do
  about it" — so drafted a fifth artboard, **`Hybrid.dc.html`
  ("A+D · Window as selector")**, rather than asking the user to pick
  between them. The 20-tile strip becomes the SELECTOR and the spotlight
  card becomes the DETAIL PANE: the highlighted tile is the game showing
  below (tied together with a notch), and clicking any other tile swaps the
  pane. That makes the match list a control rather than a list, which is
  the master-detail pattern that reads as an app.
- Tradeoff recorded on the canvas: the detail pane commits a lot of
  vertical space to one game and overlaps today's Review tab — if this
  direction wins, Review has to become the genuinely deeper surface
  (replay timestamps, full metric table vs. baseline) instead of a larger
  version of the same card.
- Measured the artboard's natural height (579px) before placing it, same
  as the other four. A/B/C/D keep their original identities and positions.
