# API notes

## deadlock-api.com (primary)

- Server: `https://api.deadlock-api.com`, OpenAPI 3.1 spec at
  `https://api.deadlock-api.com/openapi.json`.
- No authentication required for the core Game Data API. Optional $1.50/mo
  "Prioritized Fetching" patron tier bumps up to 50 of your own Steam
  accounts to the front of the fetch queue (faster freshness), not required
  to use the API.
- Auto-generated client libraries: https://github.com/deadlock-api/openapi-clients
- Also offers: Live Events API (SSE, real-time match events), UI Components
  (drop-in web components for items/shop), daily database dumps, and a
  one-line "contribute match data" installer.

Relevant analytics endpoints (from `/v1/analytics/...`, non-exhaustive —
pull the full OpenAPI doc when implementing):

| Endpoint | Use for |
|---|---|
| `player-performance-curve` | Per-match stat progression over time — core input for the review page's timeline. |
| `lane-soul-curve` | Net worth lead progression — economy curve vs. baseline. |
| `player-stats/metrics` | Comprehensive player performance analysis. |
| `item-flow-stats` | Item build progression / phase transitions — item-timing flags. |
| `build-item-stats`, `hero-build-stats/{hero_id}` | Build performance by hero — benchmark data for cohort quests later. |
| `badge-distribution` | Rank distribution — needed for rank-cohort benchmarking. |
| `hero-stats`, `item-stats`, `hero-counter-stats`, `hero-synergy-stats` | General analytics, useful for draft/matchup context. |

Match/player history endpoints (not analytics) exist separately for raw
match IDs and match details — confirm exact paths against the OpenAPI spec
before building the ingest job.

## statlocker.gg/api (secondary / reserve)

- Auth: `X-API-Key` header. Key issued only after manual review — apply by
  signing in with Steam at https://statlocker.gg/api and submitting a short
  application. No self-serve signup.
- Rate limits (per key, hourly sliding window): 1,000 match requests/hr,
  10,000 account requests/hr. Batch endpoints bill per item, not per call.
  Rate-limit headers included on every response.
- Endpoints:
  - `GET /api/public/match/{matchId}` — full match detail (12 players,
    items, `metrics`, `mvpScore`, `steamProfile`).
  - `POST /api/public/matches` — batch, max 10 match IDs.
  - `GET /api/public/profile/{accountId}` — `ppScore`, `estimatedRankNumber`,
    region, calibration info.
  - `POST /api/public/profiles` — batch, max 100 account IDs.
  - `POST /api/public-draft/draft` — create a draft lobby (used by
    NeatQueue/DSE/PRSM-style community tools; not relevant to Vantage yet).
- `ppScore` → rank number conversion: `rank = TIER*10 + SUBRANK`, 100 PP per
  sub-rank, clamped Initiate 1 (11) – Eternus 6 (116). Reference conversion
  functions are in their docs (JS + Python) if we ever wire this in.
- Field naming is inconsistent (snake_case/camelCase mixed) — expect a v2
  cleanup on their end.
- Attribution requested if we ship on their data ("Powered by Statlocker"
  credit or logo).
- **Not currently used by Vantage.** Revisit if we want a pre-built
  skill-rating/MVP-scoring signal instead of deriving our own from raw
  deadlock-api.com data.
