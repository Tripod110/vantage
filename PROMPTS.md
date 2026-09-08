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
