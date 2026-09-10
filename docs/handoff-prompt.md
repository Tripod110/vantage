# Vantage — handoff prompt

A self-contained brief for handing Vantage to another agent/tool that has no
access to this repo or the conversation history. Copy everything below the
line. Keep it updated when the architecture changes.

---

## Project

You are picking up **Vantage**, an existing, working web app. Repo:
`github.com/Tripod110/vantage`. Live: `https://tripod110.github.io/vantage/`.

**What it is:** a coaching-first gaming assistant for **Deadlock** (Valve). It
turns a player's own recent match data into concrete, per-match feedback — the
"chess.com game review" experience, but for Deadlock. It is a stats *tutor*,
not a stats dashboard.

**The differentiator, and the thing to protect:** every other tracker
(Statlocker, Deadlock Tracker, Seance) compiles **all-time** stats into one
static career average. Vantage is **dynamic**: it stores and morphs with the
player's **last 20 games only** — hard-capped, no more, no less. The picture
changes game to game so no two days look the same, instead of diluting into a
lifetime number that stops reacting to how someone is playing right now. Any
change that widens or unbounds that window breaks the product.

**Guiding principle (inherited, non-negotiable):** *narrate only what the data
supports.* Never invent a cause, never give strategy advice beyond a single
grounded "try this next game" line derived from a real measured gap. When
nothing lines up with an observed swing, say so rather than guessing. A single
match is a small sample — describe what happened, do not diagnose tendencies.

## Stack and constraints

- **Plain HTML/CSS/JS.** No framework, no build step, no bundler, no
  TypeScript. Global `<script>` files, versioned with `?v=N` in `index.html`
  (bump on every deploy).
- **No backend.** `api.deadlock-api.com` needs no API key, so the browser
  calls it directly. Deployed from the repo's `main` branch root via GitHub
  Pages — no `gh-pages` branch, no CI.
- **Persistence is `localStorage` only**, namespaced `vantage:`.
- Fonts: **Sora** (headings, numbers) + **Inter** (body), via Google Fonts.
- Dark theme tokens: `--bg #0b0c10`, `--panel #15171e`,
  `--panel-hover #1a1d26`, `--border rgba(255,255,255,0.08)`,
  `--text #eceef2`, `--text-dim rgba(236,238,242,0.62)`,
  `--text-faint rgba(236,238,242,0.4)`, `--accent #f0a020`,
  `--good #4caf7d`, `--bad #e05a5a`. Cards: 14px radius, `20px 22px` padding,
  `0 8px 24px rgba(0,0,0,0.35)` shadow.
- Run locally with `python -m http.server` from the repo root.

## Data model

**Source:** `https://api.deadlock-api.com`, no auth. Endpoints used:

| Endpoint | Use |
|---|---|
| `/v1/players/{id}/match-history` | light list of recent matches (detects new games) |
| `/v1/matches/{match_id}/metadata` | the heavy per-match document — per-player `stats[]` snapshots (~every 180s) carrying `net_worth`, `kills`, `deaths`, `creep_kills`, `possible_creeps`, `player_damage`, `gold_player`, `gold_lane_creep`, `gold_neutral_creep`; plus `items[]` with `game_time_s`, and `death_details[]` |
| `/v1/players/{id}/mmr-history` | `player_score` (~0–116 ladder index, NOT raw MMR), `rank` = `division*10 + division_tier` |
| `/v1/players/steam?account_ids=` | `personaname`, `avatarfull`, `matches_played_last_30d` |
| `/v1/assets/heroes?only_active=true` | hero names + `images.icon_image_small` |
| `/v1/assets/ranks` | rank tier names + badge images |

Rank badge image URL pattern: `/v1/assets/ranks/{division}/{subrank}/image` (PNG).

**Storage / sync model — important, this was a deliberate correction.**
Vantage does *not* re-fetch everything on each visit. On load it checks the
light match-history list, diffs it against the cached window, and fetches the
heavy `/metadata` **only for matches it doesn't already have**. A returning
visitor with no new games makes zero `/metadata` calls. The 20-game window is
modelled explicitly as a queue (most recent = front; when full, the least
recent is evicted). Cached profiles are ~33KB for 20 games.

## File map

| File | Role |
|---|---|
| `index.html` | app shell, tab bar (Dashboard / Review / Switch), script tags with `?v=N` |
| `style.css` | all styling and tokens |
| `steamid.js` | SteamID64 ↔ 32-bit `account_id` (BigInt; base `76561197960265728`) |
| `api.js` | thin fetch client over deadlock-api.com |
| `queue.js` | `RecentGamesQueue`, `RECENT_GAMES_CAP = 20` |
| `store.js` | localStorage wrapper, cached history, remembered account, TTL'd asset cache |
| `history.js` | `syncMatchHistory()` — the delta-sync described above, 4 concurrent fetches |
| `assets.js` | hero/rank catalogs, cached 7 days; `heroName`, `heroIcon`, `rankLabel`, `rankBadgeFor` |
| `analyze.js` | the analysis engine (below) |
| `charts.js` | canvas economy curve + sparkline, no charting library |
| `dashboard.js` | the dashboard hub |
| `app.js` | shell/router, state, review rendering |

## The analysis engine (`analyze.js`)

Ported from a sibling project's pure TypeScript core and rewritten as plain JS.

`extractProfile(rawMetadata, accountId)` → one match profile:
`soulsPerMin12`, `soulsVsLobby10` (your net worth minus the mean of all other
players at ~10 min), `csPct12`, `deathsBy10`, `kills/deaths/assists/kda`,
`damageSharePct`, `soulMixKillPct`, `netWorthFinal`, `itemsBy10`,
`mySoulsSeries` (economy curve), `leadByMinute` (your team's Souls lead),
`yourDeathTimesS`.

`rollingBaseline(profiles)` → per-metric median/mean over the window.
`compareToBaseline(profile, baseline)` → per-metric `deltaPct` + a standing of
`above` / `typical` / `below`.

**Metric registry gotcha:** most metrics measure delta as a percentage of the
baseline median. `soulsVsLobby10` **crosses zero**, so its median can sit near
0 and percent-of-baseline explodes (this shipped a "1069% below baseline"
string once). It therefore carries a fixed `scale: 600` (Souls) and is
measured against that instead, with a 1-band "typical" threshold rather than
10%. Any future metric that can cross zero needs the same treatment.

`buildFlaggedMoments(profile, itemsBaseline, teaching)` → 1–4 grounded,
timestamped observations, sorted chronologically:
- **Momentum swing** — largest max→min (or min→max) move in `leadByMinute`,
  only if ≥ 2500 Souls.
- **Death cluster** — densest run of ≥3 of your deaths inside ~6 minutes.
- **Item timing** — `itemsBy10` vs. the window's median.
- **Lobby comparison** — `soulsVsLobby10` at the 10-minute mark, if ≥600.

`buildQuest(comparison, teaching)` → one "try this next game" line, chosen from
whichever metric fell furthest below baseline, from a per-metric template map.

**Teaching mode** is a two-voice system (`std` / `npm`) on every generated
string: same data, same rules, but the teaching voice defines terms inline
("Souls (the currency you earn through the match)"). It's a persisted user
toggle, available on the landing form and in the review view.

## Current UI

**Dashboard tab** (the hub): Steam identity block (avatar, persona,
"78 matches in the last 30 days"), current rank badge + name + `≈score`; form
across the window (record, win rate, KDA, souls/min); a rank-score trend
sparkline; then the 20 matches as rows (hero icon, W/L, K/D/A, souls,
duration, relative time). Every row opens that match's review.

**Review tab:** header (hero, result, duration), canvas economy-curve chart of
this match vs. the average of the other games in the window, flagged moments
with timestamps, the quest card, and the teaching-mode toggle. The baseline for
a reviewed match is the **other 19 games**, so a match is never compared
against itself.

The account id is remembered, and the dashboard paints from cache before the
network sync finishes. "Switch" forgets the account but keeps the cached
history.

## Traps already hit — do not re-introduce

1. **Never hard-code Deadlock rank tier names.** A ported constant listed
   `Alchemist / Arcanist / Ritualist / Archon`; the live API returns
   `Obscurus, Initiate, Seeker, Acolyte, Sentinel, Mystic, Ritualist,
   Emissary, Oracle, Phantom, Ascendant, Eternus` and has no Archon. Always
   read names from `/v1/assets/ranks`.
2. **`[hidden]` needs `display: none !important`.** Class rules like
   `.view { display: block }` outrank the attribute, so `el.hidden = true`
   silently fails to hide anything.
3. **Don't auto-scale a sparkline to its own data range.** A 1-point rank
   change rendered as a dramatic cliff. Floor the span (currently 4 points).
4. **Don't concatenate an already-unit-suffixed string with another unit
   phrase** — produced "900 Souls fewer Souls (the currency...)". There are
   separate `soulsNum()` and `soulsStr()` helpers for this reason.
5. **deadlock-api.com rate-limits bursts.** Keep `/metadata` fetches at ~4
   concurrent, and never poll.

## Known-good test data

Account `186993885` (persona "Tripod") — the owner's account, currently
Acolyte 3, ≈15 score, 4–16 over the last 20. Account `1113640227` also has
ranked history.

## Not built yet

- **Statlocker rank** — blocked. `statlocker.gg/api` issues keys only after a
  manual application (Steam sign-in, no self-serve), so there is no key to
  call it with. It would provide a ready-made `ppScore` / `estimatedRankNumber`
  / `mvpScore`. Left out rather than shipping dead UI.
- **Vanity-URL / profile-link input** — only numeric SteamID64 or account id
  is accepted today.
- **Cross-device sync** — designed but not built: Firebase Auth (Google
  Sign-In) + Firestore as an opt-in layer *on top of* localStorage, mirroring
  a sibling project's pattern. Local stays the source of truth. Requires the
  owner to create the Firebase project themselves.
- **Clip Review** — planned v1 feature: upload a gameplay clip, get specific
  coaching feedback. Intended shape: user's own Gemini API key held
  client-side, clip uploaded via Gemini's File API (inline video caps at
  ~20MB, real clips exceed it), then analyzed with a coaching prompt that
  returns timestamped feedback. Video is token-expensive (~263 tokens/sec).
- **Rank-cohort benchmark quests** — currently all comparisons are against the
  player's own window. Cohort percentile data would need `badge-distribution`
  and hero/build aggregates.
- **A dashboard redesign is mid-decision.** The current match list reads as a
  table rather than an app surface. Five directions exist as mockups: a
  20-tile *form strip* (window as one readable object), a *coach-first* page
  led by a diagnosis, a *command-center* shell with rings vs. own median, a
  *match spotlight* card, and a hybrid where the form strip acts as a
  **selector** and a detail pane below shows the selected game (master-detail).
  The hybrid is the current front-runner; if it ships, the Review tab must
  become the genuinely deeper surface (replay timestamps, full metric table)
  rather than a bigger copy of the dashboard card.
