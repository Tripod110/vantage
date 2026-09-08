# Vantage

A coaching-first gaming assistant to help you improve in any game supported.
Starting with **Deadlock**: ingest a player's match history and turn it into
concrete, per-match deliverables — the "chess.com game review" experience,
but for Deadlock. Retention is driven by daily quests / "try this next game"
prompts generated from a player's own recent match diffs (and later, from
rank-cohort benchmarks).

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

## Architecture (planned, not yet built)

1. **Ingest** — poll deadlock-api.com for a linked player's match history.
2. **Analyze** — per-match report: economy curve vs. own recent baseline,
   item-timing flags, lane/kill-participation deltas, notable moments.
3. **Quest engine** — rule-based quests from match-to-match diffs first
   (ships fast, no benchmark data needed); rank-cohort benchmark quests
   layered in later once aggregate percentile data is available.
4. **Review UI** — single-match report card, chess.com-review-style.

## Status

Pre-scaffold. See [`PROMPTS.md`](PROMPTS.md) for the running decision log.
