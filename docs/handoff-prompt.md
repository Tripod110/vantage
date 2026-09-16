# Vantage — current handoff

Updated 2026-09-15. Read this before changing the app, then inspect current
Git history and source. Older entries in `PROMPTS.md` describe earlier versions.

## Project and decisions

- Repository: https://github.com/Tripod110/vantage
- Production: https://tripod110.github.io/vantage/
- Vantage is a coaching-first Deadlock assistant: recent match evidence,
  a committed session goal, automatic feedback, and optional reflection.
- **The owner explicitly changed the analysis window from 20 to 10 ranked
  games in this session.** Do not restore 20 based on older docs or designs.
- The owner requested automatic **S–F** personal-form grades **and** separate
  goal verdicts. Compare personal form with the other games in the window,
  not just winning games. Do not mix win/loss or goal outcomes into the letter.
- Self-grading and self-read accuracy were removed. Notes and tags are optional.
- This iteration covers coaching reliability, dashboard polish, and deeper
  review using existing match data. No Gemini/video or cloud integration.
- Narrate only what measurements support. Do not invent causes, equate a
  personal-form letter with rank, or claim the statistics judge all decisions.

## Stack and deployment

Plain HTML/CSS/global JavaScript; no framework, bundler, TypeScript, or backend.
API: `https://api.deadlock-api.com`, directly from the browser. Persistence:
`localStorage`, production namespace `vantage:`. Fonts: Sora and Inter.
Dark palette: background `#0b0c10`, panels `#15171e`, accent `#f0a020`,
positive `#4caf7d`, negative `#e05a5a`.

**Preserve existing Git history.** This iteration branched from `origin/main`
as `codex/ten-game-coaching`. Production is intended to serve `main` at `/`.
An older, unrelated Match desk exists on `gh-pages` and `codex/vantage-release`;
do not switch to those or recreate the app. A previous agent changed Pages
source and made main-branch updates invisible. Verify the actual public HTML
and script contents before claiming deployment. Release asset version: `v=9`.

## What this iteration implements

### Ten-game storage and sync

`RECENT_GAMES_CAP = 10`. `rankedWindow()` normalizes cache reads, saves, and app
state: ranked mode 4, no bots/unscored matches, newest first, unique IDs.
Existing 20-game caches are trimmed before first paint. The light all-mode
history remains capped at 100 entries for activity/session facts and does not
enter ranked grades or baselines. Incomplete seven-day coverage is labelled.

Delta sync fetches metadata only for uncached or outdated profiles, with four
concurrent requests and no polling. Explicit Refresh reports sync time and
retains usable cached content on failure. Partial profile failures are reported
and retried on the next refresh. Selection survives refresh while retained.

`PROFILE_VERSION = 3`: this version corrects missing measurements being
converted into zero and prevents timed measurements for matches that ended
before the target time. Consequently v2 profiles are refreshed once. The cap
change itself does not invalidate a profile; unchanged v3 caches fetch no
metadata. Preserve this distinction when explaining or testing the migration.

### Personal-form grading

`gradePersonalForm(subject, profiles)` in `grading.js` is pure and shared by
dashboard and review. It excludes the subject by match ID and uses at most
nine other profiles from the current ranked window.

Four equally weighted metrics:

1. Deaths by 10 minutes: lower is better.
2. Souls versus lobby at 10 minutes: higher is better.
3. Last-hit efficiency at 12 minutes: higher is better.
4. KDA: higher is better.

For each metric, score = 100 × (comparison games outperformed + half the
ties) / valid comparison games. Require five comparison values per metric
and three usable metrics overall. Otherwise show Insufficient data.

Average the eligible scores: S ≥90, A ≥75, B ≥60, C ≥40, D ≥25, E ≥10, F <10.
This is a transparent product heuristic, not a validated skill model. Display
comparison count, metric values/medians/sample counts/contributions, and the
rubric. Grades are derived, never stored; they change as the window moves.
Comparisons span heroes. Winning-game comparisons remain separate and require
three wins and three losses; the smaller window will sometimes lack that data.

### Coaching and reflections

`coaching.js` owns the pure state transitions. `store.js` persists
`vantage:coaching:<accountId>` with `version: 1`:

```
{
  version, active, learned,
  sessions: [{ id, startedAt, endedAt, goalId, goal, legacy? }],
  reflections: { [matchId]: { note, tags } },
  legacyGrades: { [matchId]: originalSavedGrade }
}
```

New sessions store a complete goal snapshot. Eligibility uses match start time
within `[startedAt, endedAt)`. Changing goals ends the old session; adopting
starts the replacement. Closing a session retains its match verdicts, including
metadata arriving later. Eight hits in ten measured committed games graduates
the goal, preserves it under learned, and closes its session. Matches without
a commitment still receive a form grade and show No session goal.

Migrate old `goals:<accountId>` and `sessions:<accountId>` lazily without
deleting those legacy keys. Resolve legacy sessions only through an unambiguous
matching goal ID whose set time precedes session start. Preserve recorded
verdicts and reflections; label unresolved history rather than guessing.
Legacy verdicts contribute to goal progress only when their goal resolves.

Notes (200 characters) and tags save immediately as edited, survive rerenders,
navigation, and reload, and remain account scoped. New reflections are pruned
after a complete successful sync to the retained window; do not prune during
cache-only/failed/partial loads. Legacy records remain preserved but are not
included in statistics outside the current window. Session retention keeps the
latest 60 records plus any needed by retained matches.

### Dashboard and review

Dashboard order: compact identity/rank → teaching/refresh controls → active
goal/latest verdict → ten equal-size hero/result/grade selector tiles and
selected-match summary → recent-session facts → win/loss comparisons.
Default selection is newest. Tiles have accessible names and pressed state.

Review: shared form grade and committed goal evidence, expandable rubric,
economy chart, clickable flagged moments, winning/losing averages, optional
notes/tags, teaching mode. Timestamp clicks select chart time, not a replay.
The range slider provides keyboard inspection. Output shows own observed
snapshot time, comparison value, and contributing count. Comparisons stop at
each match's last recorded coverage; no synthetic zeros or extended tails.
`ResizeObserver` redraws the canvas and is disconnected on replacement.

All external names, notes, and generated strings rendered as HTML pass through
`esc()`. Preserve `[hidden] { display:none !important }`. Rank names come from
the API catalog, never hard-coded constants. Keep standard and teaching-mode
copy equally grounded in evidence.

## File map

| Files | Role |
|---|---|
| `index.html`, `style.css` | Shell, ordered global scripts, responsive theme |
| `steamid.js`, `api.js`, `assets.js` | IDs, API calls, cached hero/rank catalogs |
| `queue.js`, `history.js`, `store.js` | Bounded ranked cache, delta sync, persistence/migration |
| `analyze.js`, `grading.js` | Profiles, comparisons/moments, form grades, chart observations |
| `goals.js`, `coaching.js`, `sessions.js` | Targets, commitments/results, play-session facts |
| `dashboard.js`, `experience.js` | Formatting and dashboard/shared evidence HTML |
| `review-table.js`, `charts.js`, `app.js` | Comparison table, inspector, routing/events/state |
| `tests/` | Node regression tests and isolated browser fixture |

## Running and checking

```
node tests/serve.cjs
node --test tests/*.test.cjs
```

Preview: http://127.0.0.1:8765/. If a restricted Windows environment blocks
Node worker creation with EPERM, use:

```
node --test --test-isolation=none tests/*.test.cjs
```

The local server also provides `/?fixture=coaching`, a synthetic browser test
with separate `vantage-fixture:` storage, mock APIs, migrated legacy data,
and offline/empty-history controls. This is not a product demo mode; the
production index does not load its script. Restart the local server after
changing the server itself.

Known real test account: `186993885` (Tripod); `1113640227` also has ranked
history. Do not hard-code their changing ranks, counts, or outcomes.

## Validation and release status

Implementation is complete; final validation and production publication are
being completed in this session. Update this section before the final push.
Browser checks already exercised the live API account, matching dashboard and
review grades, timestamp/keyboard inspection, teaching mode, mobile layout
at 375px, optional notes/tags, and cached offline results. Regression tests
cover the rubric, cache migration, zero metadata calls, goal lifecycle, missing
measurements, legacy migration, and account isolation.

## Deferred work

Custom Steam `/id/` URLs, cross-device sync/auth, Clip Review, rank-cohort
benchmarks, replay playback/deep links, death maps, and other games remain
outside this iteration. Statlocker remains blocked on a manually issued key.
The session end remains explicit; do not quietly infer new commitment windows.

External inspirations and assets are credited in `CREDITS.md`; add credit when
a new external source shapes behavior. Earlier product decisions are retained
in `PROMPTS.md` as history, not current implementation instructions.
