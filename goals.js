/* Vantage — goals and accountability. A goal is a yes/no rule checked against a
   match's data, independent of whether the game was won (the framing comes from
   Deathy's improvement framework — see CREDITS.md). Coaching evaluates the
   committed target automatically. Pure functions: persistence lives in store.js. */

const LEARNED_WINDOW = 10; // judge "learned" and "slipping" over this many recent games
const LEARNED_HITS = 8; // hits within the window to count a goal as learned
const SLIPPING_MIN_GAMES = 5;
const SLIPPING_RATE = 0.5;

const roundTo = (v, step) => Math.round(v / step) * step;

/* How each separator metric becomes a goal. `fromWins` turns the player's
   winning-game average into a threshold; `fallback` is used with too few wins. */
const GOAL_DEFS = {
  deathsBy10: {
    op: '<=', fallback: 1,
    fromWins: (m) => Math.max(0, Math.ceil(m)),
    label: (t) => (t === 0 ? 'No deaths before 10 minutes' : `${t} or fewer deaths before 10 minutes`)
  },
  deaths: {
    op: '<=', fallback: 6,
    fromWins: (m) => Math.max(1, Math.ceil(m)),
    label: (t) => `${t} or fewer deaths`
  },
  soulsLostToDeaths: {
    op: '<=', fallback: 5000,
    fromWins: (m) => Math.max(500, roundTo(m, 500)),
    label: (t) => `Lose ${t.toLocaleString('en-US')} Souls or fewer to deaths`
  },
  soulsVsLobby10: {
    op: '>=', fallback: 0,
    fromWins: (m) => Math.max(0, roundTo(m, 100)),
    label: (t) => (t === 0 ? 'Even or ahead of the lobby on Souls at 10 minutes' : `At least +${t.toLocaleString('en-US')} Souls vs the lobby at 10 minutes`)
  },
  soulsPerMin12: {
    op: '>=', fallback: 700,
    fromWins: (m) => roundTo(m, 25),
    label: (t) => `At least ${t} Souls/min by 12 minutes`
  },
  creepDamage20: {
    op: '>=', fallback: 15000,
    fromWins: (m) => roundTo(m, 1000),
    label: (t) => `At least ${t.toLocaleString('en-US')} trooper damage by 20 minutes`
  },
  itemsBy10: {
    op: '>=', fallback: 14,
    fromWins: (m) => Math.round(m),
    label: (t) => `${t}+ items bought by 10 minutes`
  },
  accuracy: {
    op: '>=', fallback: 0.35,
    fromWins: (m) => roundTo(m, 0.01),
    label: (t) => `${Math.round(t * 100)}%+ shot accuracy`
  }
};

const GOAL_METRIC_GET = {
  deathsBy10: (p) => p.deathsBy10,
  deaths: (p) => p.deaths,
  soulsLostToDeaths: (p) => p.soulsLostToDeaths,
  soulsVsLobby10: (p) => p.soulsVsLobby10,
  soulsPerMin12: (p) => p.soulsPerMin12,
  creepDamage20: (p) => p.creepDamage20,
  itemsBy10: (p) => p.itemsBy10,
  accuracy: (p) => p.accuracy
};

function makeGoal(metric, threshold, source, nWins, nowMs) {
  const def = GOAL_DEFS[metric];
  return {
    id: `${metric}:${threshold}:${nowMs}`,
    metric,
    op: def.op,
    threshold,
    label: def.label(threshold),
    source, // 'wins' = derived from your winning games, 'default' = too few wins yet
    nWins,
    setAt: nowMs
  };
}

/** Up to `limit` goal suggestions, strongest separator first. */
function suggestGoals(sep, nowMs, limit = 3) {
  const out = [];
  if (sep.ok) {
    for (const row of sep.rows) {
      const def = GOAL_DEFS[row.key];
      if (!def) continue;
      out.push({ ...makeGoal(row.key, def.fromWins(row.winMean), 'wins', sep.nWins, nowMs), evidence: row });
      if (out.length >= limit) return out;
    }
  }
  for (const metric of ['deathsBy10', 'soulsVsLobby10', 'deaths']) {
    if (out.length >= limit) break;
    if (out.some((g) => g.metric === metric)) continue;
    out.push(makeGoal(metric, GOAL_DEFS[metric].fallback, 'default', sep.nWins, nowMs));
  }
  return out;
}

/** true / false, or null when this match can't measure the goal (e.g. ended before 20 min). */
function evaluateGoal(goal, profile) {
  const required = { deathsBy10: 600, soulsVsLobby10: 600, itemsBy10: 600, soulsPerMin12: 720, creepDamage20: 1200 }[goal.metric];
  if (required && Number.isFinite(profile.durationS) && profile.durationS < required) return null;
  const v = GOAL_METRIC_GET[goal.metric]?.(profile);
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return goal.op === '<=' ? v <= goal.threshold : v >= goal.threshold;
}

/** Legacy goals had no mode field and remain universal; new goals are mode-scoped. */
function goalAppliesToItem(goal, item) {
  return goal?.matchMode == null || goal.matchMode === item.entry.match_mode;
}

/** Hit rate for a goal over window items played since it was set (most-recent-first in, any order ok). */
function goalProgress(goal, items, sinceMs = goal.setAt) {
  const games = items
    .filter((it) => it.entry.start_time * 1000 >= sinceMs && goalAppliesToItem(goal, it))
    .sort((a, b) => b.entry.start_time - a.entry.start_time).slice(0, 10);
  const results = games.map((it) => ({ matchId: it.entry.match_id, hit: evaluateGoal(goal, it.profile) })).filter((r) => r.hit !== null);
  const recent = results.slice(0, LEARNED_WINDOW);
  const recentHits = recent.filter((r) => r.hit).length;
  return {
    measured: results.length,
    hits: results.filter((r) => r.hit).length,
    recentMeasured: recent.length,
    recentHits,
    learned: recent.length >= LEARNED_WINDOW && recentHits >= LEARNED_HITS,
    results
  };
}

/** Learned goals whose hit rate in the latest games has dropped below SLIPPING_RATE. */
function slippingGoals(learned, items) {
  return learned
    .map((g) => ({ goal: g, progress: goalProgress(g, items, g.learnedAt ?? 0) }))
    .filter(({ progress }) => progress.recentMeasured >= SLIPPING_MIN_GAMES && progress.recentHits / progress.recentMeasured < SLIPPING_RATE);
}

/** Recent games in the window played outside any started session. */
function gamesWithoutSession(items, sessionStarts) {
  const recent = [...items].sort((a, b) => b.entry.start_time - a.entry.start_time).slice(0, LEARNED_WINDOW);
  const inSession = (it) => sessionStarts.some((s) => it.entry.start_time * 1000 >= s.startedAt && (s.endedAt == null || it.entry.start_time * 1000 <= s.endedAt));
  return { total: recent.length, without: recent.filter((it) => !inSession(it)).length };
}

/* Least-squares slope of player_score per day over the recent window — ported
   from Seance's goal.ts (scoreRatePerDay). Null when there isn't enough signal. */
function scoreRatePerDay(points, windowDays = 30) {
  if (points.length < 2) return null;
  const latestT = points[points.length - 1].start_time;
  const windowed = points.filter((p) => p.start_time >= latestT - windowDays * 86400);
  const use = windowed.length >= 2 ? windowed : points.slice(-10);
  if (use.length < 2) return null;
  const t0 = use[0].start_time;
  const xs = use.map((p) => (p.start_time - t0) / 86400);
  const ys = use.map((p) => p.player_score);
  const n = use.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? null : (n * sxy - sx * sy) / denom;
}

/** Rank-score trend facts: weekly slope and days since the score last set a new high. */
function rankTrendFacts(mmr, nowS) {
  const points = [...mmr].sort((a, b) => a.start_time - b.start_time);
  if (!points.length) return null;
  const perDay = scoreRatePerDay(points);
  let best = -Infinity;
  let lastHighAt = null;
  for (const p of points) {
    if (p.player_score > best) {
      best = p.player_score;
      lastHighAt = p.start_time;
    }
  }
  return {
    perWeek: perDay === null ? null : perDay * 7,
    highScore: best,
    daysSinceHigh: lastHighAt === null ? null : Math.floor((nowS - lastHighAt) / 86400),
    points: points.length
  };
}
