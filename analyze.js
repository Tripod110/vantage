/* Vantage — Analyze stage: turn one match's raw /metadata into a review.
   Ported from Seance's shared/core (D:\Claude\Projects\Seance\src\shared\core\
   performance.ts + takeaways.ts) — same algorithms, TS -> plain JS. Currency
   is Souls (the API names it net_worth / gold_*; those values ARE Souls). */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v ?? 0) || 0);

/* Bump whenever extractProfile gains or changes a field: cached profiles with an
   older version are re-fetched by syncMatchHistory instead of silently lacking it. */
const PROFILE_VERSION = 3;
const measuredNumber = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/** Nearest snapshot to targetMin minutes, within tolSec; null if the match never reached it. */
function snapAt(stats, targetMin, tolSec = 180) {
  const target = targetMin * 60;
  let best = null;
  for (const s of stats ?? []) {
    const t = num(s.time_stamp_s);
    if (t <= 0) continue;
    if (best === null || Math.abs(t - target) < Math.abs(num(best.time_stamp_s) - target)) best = s;
  }
  return best && Math.abs(num(best.time_stamp_s) - target) <= tolSec ? best : null;
}

/** Full net-worth-over-time series for one player, for the economy curve chart. */
function soulsSeries(playerStats) {
  return (playerStats ?? [])
    .map((s) => ({ t: num(s.time_stamp_s), souls: num(s.net_worth) }))
    .filter((p) => p.t >= 0)
    .sort((a, b) => a.t - b.t);
}

/* ── Per-match performance profile ──────────────────────────────────────── */

/** Build the player's performance profile for one match from its raw /metadata. Null if not in it. */
function extractProfile(raw, accountId) {
  const info = raw.match_info ?? raw;
  const players = info.players ?? [];
  const me = players.find((p) => num(p.account_id) === accountId);
  if (!me) return null;

  const myTeam = num(me.team);
  const win = num(info.winning_team) === myTeam;
  const isBot = num(info.bot_difficulty) > 0 || info.new_player_pool === true;

  const durationS = num(info.duration_s);
  const my10 = durationS >= 600 ? snapAt(me.stats, 10) : null;
  const my12 = durationS >= 720 ? snapAt(me.stats, 12) : null;

  const others = players.filter((p) => num(p.account_id) !== accountId);
  const otherNw10 = others
    .map((p) => snapAt(p.stats, 10))
    .filter((s) => s !== null)
    .map((s) => measuredNumber(s.net_worth)).filter((v) => v !== null);
  const soulsVsLobby10 =
    my10 && measuredNumber(my10.net_worth) !== null && otherNw10.length
      ? num(my10.net_worth) - otherNw10.reduce((a, b) => a + b, 0) / otherNw10.length
      : null;

  const soulsPerMin12 = my12 && measuredNumber(my12.net_worth) !== null ? num(my12.net_worth) / (num(my12.time_stamp_s) / 60) : null;
  const csPct12 = my12 && num(my12.possible_creeps) > 0 && measuredNumber(my12.creep_kills) !== null ? num(my12.creep_kills) / num(my12.possible_creeps) : null;
  const deathsBy10 = my10 ? measuredNumber(my10.deaths) : null;

  const last = (s) => (s && s.length ? s[s.length - 1] : null);
  const myDmg = num(last(me.stats)?.player_damage);
  const teamDmg = players
    .filter((p) => num(p.team) === myTeam)
    .reduce((sum, p) => sum + num(last(p.stats)?.player_damage), 0);
  const damageSharePct = teamDmg > 0 ? (100 * myDmg) / teamDmg : null;

  const myLast = last(me.stats);
  const my20 = durationS >= 1200 ? snapAt(me.stats, 20) : null;
  const creepDamage20 = my20 ? measuredNumber(my20.creep_damage) : null;
  const soulsLostToDeaths = myLast ? measuredNumber(myLast.gold_death_loss) : null;
  const shots = myLast && measuredNumber(myLast.shots_hit) !== null && measuredNumber(myLast.shots_missed) !== null ? num(myLast.shots_hit) + num(myLast.shots_missed) : 0;
  const accuracy = shots > 0 ? num(myLast.shots_hit) / shots : null;
  const fromKills = num(myLast?.gold_player);
  const fromFarm = num(myLast?.gold_lane_creep) + num(myLast?.gold_neutral_creep);
  const soulMixKillPct = fromKills + fromFarm > 0 ? (100 * fromKills) / (fromKills + fromFarm) : null;

  const kills = measuredNumber(me.kills);
  const deaths = measuredNumber(me.deaths);
  const assists = measuredNumber(me.assists);

  // Own team's Souls lead over time, for the economy-curve chart + momentum detection.
  const teamNetWorthAt = (t) =>
    players
      .filter((p) => num(p.team) === myTeam)
      .reduce((sum, p) => {
        const snap = (p.stats ?? []).find((s) => num(s.time_stamp_s) === t);
        return sum + (snap ? num(snap.net_worth) : 0);
      }, 0);
  const enemyNetWorthAt = (t) =>
    players
      .filter((p) => num(p.team) !== myTeam)
      .reduce((sum, p) => {
        const snap = (p.stats ?? []).find((s) => num(s.time_stamp_s) === t);
        return sum + (snap ? num(snap.net_worth) : 0);
      }, 0);
  const allTimestamps = [...new Set((me.stats ?? []).map((s) => num(s.time_stamp_s)))].sort((a, b) => a - b);
  const leadByMinute = allTimestamps.map((t) => ({
    minute: Math.round(t / 60),
    lead: teamNetWorthAt(t) - enemyNetWorthAt(t)
  }));

  return {
    version: PROFILE_VERSION,
    matchId: num(info.match_id),
    startTime: num(info.start_time),
    durationS: num(info.duration_s),
    heroId: num(me.hero_id),
    matchMode: num(info.match_mode),
    rankedType: num(info.ranked_type),
    notScored: info.not_scored === true,
    isBot,
    creepDamage20,
    soulsLostToDeaths,
    accuracy,
    win,
    soulsPerMin12,
    soulsVsLobby10,
    csPct12,
    deathsBy10,
    kills,
    deaths,
    assists,
    kda: [kills, deaths, assists].every((v) => v !== null) ? (kills + assists) / Math.max(1, deaths) : null,
    damageSharePct,
    soulMixKillPct,
    netWorthFinal: num(me.net_worth),
    lastHits: num(me.last_hits),
    denies: num(me.denies),
    mySoulsSeries: soulsSeries(me.stats),
    leadByMinute,
    // for flagged-moments detection:
    yourDeathTimesS: (me.death_details ?? me.deaths_details ?? []).map((d) => num(d.game_time_s ?? d.time_s)).filter((t) => t > 0),
    itemsBy10: durationS >= 600 && Array.isArray(me.items) ? me.items.filter((it) => num(it.game_time_s) > 0 && num(it.game_time_s) <= 600).length : null,
    firstItemTimeS: (me.items ?? []).map((it) => num(it.game_time_s)).filter((t) => t > 0).sort((a, b) => a - b)[0] ?? null
  };
}

/* ── Metric registry (baseline / comparison uniformly) ──────────────────── */

const METRICS = [
  { key: 'soulsPerMin12', label: 'Souls/min by 12 min', get: (p) => p.soulsPerMin12, higherIsBetter: 1, unit: 'souls/min' },
  // `scale`: soulsVsLobby10 can cross zero, so its baseline median can sit near 0 — dividing by
  // |base| (as every other metric does) then blows up into nonsense percentages (900% swings from
  // a $5 baseline, so to speak). Measure it against a fixed reference instead: 600 Souls, the same
  // "counts as a notable gap" band Seance's feltVsActual.ts uses for this exact metric.
  { key: 'soulsVsLobby10', label: 'Souls vs lobby avg at 10 min', get: (p) => p.soulsVsLobby10, higherIsBetter: 1, unit: 'souls', scale: 600 },
  { key: 'csPct12', label: 'Last-hit efficiency at 12 min', get: (p) => p.csPct12, higherIsBetter: 1, unit: '%' },
  { key: 'deathsBy10', label: 'Deaths by 10 min', get: (p) => p.deathsBy10, higherIsBetter: -1 },
  { key: 'kda', label: 'KDA', get: (p) => p.kda, higherIsBetter: 1 },
  { key: 'damageSharePct', label: 'Team damage share', get: (p) => p.damageSharePct, higherIsBetter: 0, unit: '%' },
  { key: 'netWorthFinal', label: 'Final net worth', get: (p) => p.netWorthFinal, higherIsBetter: 1, unit: 'souls' },
  { key: 'itemsBy10', label: 'Items bought by 10 min', get: (p) => p.itemsBy10, higherIsBetter: 1 }
];

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const values = (profiles, def) => profiles.map(def.get).filter(Number.isFinite);
const recent = (profiles, window) => [...profiles].sort((a, b) => b.startTime - a.startTime).slice(0, window);

/** The player's own recent baseline (default: last 10 non-bot games) for each metric. */
function rollingBaseline(profiles, window = 10) {
  window = Math.max(0, Math.min(10, window));
  const pool = recent(profiles.filter((p) => !p.isBot && !p.notScored), window);
  const metrics = {};
  for (const def of METRICS) {
    const vs = values(pool, def);
    metrics[def.key] = { median: median(vs), mean: mean(vs), n: vs.length };
  }
  return { window, metrics };
}

/* ── Flagged moments: momentum swing + death cluster ─────────────────────
   Ported from takeaways.ts's dominantSwing/deathCluster/buildReviewQueue.
   Hard rule: narrate only what the data supports — never invent a cause,
   never give strategy advice. */

const SWING_MIN = 2500; // Souls — below this, a swing isn't notable.

function dominantSwing(lead) {
  if (lead.length < 2) return null;
  let maxI = 0;
  let minI = 0;
  lead.forEach((p, i) => {
    if (p.lead > lead[maxI].lead) maxI = i;
    if (p.lead < lead[minI].lead) minI = i;
  });
  const a = Math.min(maxI, minI);
  const b = Math.max(maxI, minI);
  if (a === b) return null;
  const before = lead[a].lead;
  const after = lead[b].lead;
  if (Math.abs(after - before) < SWING_MIN) return null;
  return { before, after, fromMin: lead[a].minute, toMin: lead[b].minute, dir: after < before ? 'down' : 'up' };
}

/** Densest window of >=3 of your deaths inside ~6 minutes; null if none. */
function deathCluster(times) {
  if (times.length < 3) return null;
  const sorted = [...times].sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j < sorted.length && sorted[j] - sorted[i] <= 360) j++;
    const n = j - i;
    if (n >= 3 && (!best || n > best.n)) {
      best = { n, fromMin: Math.floor(sorted[i] / 60), toMin: Math.ceil(sorted[j - 1] / 60) };
    }
  }
  return best;
}

const soulsNum = (n) => `${Math.round(Math.abs(n) / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const soulsStr = (n) => soulsNum(n) + ' Souls';
const leadStr = (n) => {
  const r = Math.round(n / 100) * 100;
  if (Math.abs(r) < 200) return 'roughly even';
  return `${r > 0 ? '+' : '-'}${Math.abs(r).toLocaleString('en-US')} Souls`;
};

/** 1-4 grounded flagged moments for this match: label, tone, and a game-clock timestamp (seconds).
    `itemsBaseline` (optional) is the baseline's itemsBy10 median, for an item-timing flag.
    `teaching` (bool) switches to a voice that defines terms inline — same rules, same data,
    just more context, matching Seance's std/npm two-voice pattern in takeaways.ts. */
function buildFlaggedMoments(profile, itemsBaseline = null, teaching = false) {
  const out = [];
  const souls = teaching ? 'Souls (the currency you earn through the match)' : 'Souls';

  if (itemsBaseline !== null && itemsBaseline > 0 && profile.itemsBy10 !== null && profile.itemsBy10 < itemsBaseline - 1) {
    out.push({
      atS: 600,
      tone: 'bad',
      text: teaching
        ? `You'd bought ${profile.itemsBy10} item${profile.itemsBy10 === 1 ? '' : 's'} by the 10-minute mark, vs. your usual ${Math.round(itemsBaseline)}. Items are upgrades purchased with Souls. This counts purchases; it does not establish why the timing differed.`
        : `You'd bought ${profile.itemsBy10} item${profile.itemsBy10 === 1 ? '' : 's'} by the 10-minute mark, vs. your usual ${Math.round(itemsBaseline)} — item timing ran behind your normal pace this game.`
    });
  }

  const m = dominantSwing(profile.leadByMinute);
  if (m) {
    const swungAgainst = m.dir === 'down';
    out.push({
      atS: Math.max(0, m.fromMin * 60 - 30),
      tone: swungAgainst ? 'bad' : 'good',
      text: teaching
        ? `Between minute ${m.fromMin} and ${m.toMin}, your team's ${souls} lead over the enemy team went from ${leadStr(m.before)} to ${leadStr(m.after)} — ${swungAgainst ? 'that swing went against you' : 'that swing went your way'}. This records the change in team currency, without assigning a cause.`
        : swungAgainst
          ? `Momentum swung against you between minute ${m.fromMin} and ${m.toMin}: the Souls margin went from ${leadStr(m.before)} to ${leadStr(m.after)}.`
          : `Momentum swung your way between minute ${m.fromMin} and ${m.toMin}: the Souls margin went from ${leadStr(m.before)} to ${leadStr(m.after)}.`
    });
  }

  const cl = deathCluster(profile.yourDeathTimesS);
  if (cl) {
    out.push({
      atS: Math.max(0, cl.fromMin * 60 - 30),
      tone: 'bad',
      text: teaching
        ? `You died ${cl.n} times close together between minute ${cl.fromMin} and ${cl.toMin}. The data flags the run but not a reason for it — rewatching that stretch in the replay can show what was happening.`
        : `${cl.n} deaths bunched up between minute ${cl.fromMin} and ${cl.toMin} — worth a replay look.`
    });
  }

  if (profile.soulsVsLobby10 !== null && Math.abs(profile.soulsVsLobby10) >= 600) {
    const ahead = profile.soulsVsLobby10 > 0;
    out.push({
      atS: 600,
      tone: ahead ? 'good' : 'bad',
      text: teaching
        ? `At the 10-minute mark you had ${soulsNum(profile.soulsVsLobby10)} ${ahead ? 'more' : 'fewer'} ${souls} than the average player in this match. This is a currency comparison with the lobby; it does not identify how the gap happened.`
        : `At the 10-minute mark you were ${soulsStr(profile.soulsVsLobby10)} ${ahead ? 'ahead of' : 'behind'} the lobby average.`
    });
  }

  out.sort((a, b) => a.atS - b.atS);
  return out.slice(0, 4);
}

/* ── What separates your games ─────────────────────────────────────────────
   Compares the player's wins against their losses inside the ranked window,
   per metric. This replaces "furthest below your median": the median of a
   losing stretch is a losing standard, and a metric can sit far from median
   without having anything to do with whether games are won. Everything here
   is description — means on each side plus sample sizes — never a cause. */

const MIN_GAMES_PER_SIDE = 3;
const SEPARATION_MIN_EFFECT = 0.5; // standardized gap below this isn't shown as a separator

const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const fmtOne = (v) => (Math.round(v * 10) / 10).toString();
const fmtSigned = (v) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`;
const fmtPct = (v) => `${Math.round(v * 100)}%`;

const SEPARATOR_METRICS = [
  { key: 'deaths', label: 'Deaths', get: (p) => p.deaths, higherIsBetter: -1, fmt: fmtOne },
  { key: 'deathsBy10', label: 'Deaths before 10 min', get: (p) => p.deathsBy10, higherIsBetter: -1, fmt: fmtOne },
  { key: 'soulsLostToDeaths', label: 'Souls lost to deaths', get: (p) => p.soulsLostToDeaths, higherIsBetter: -1, fmt: fmtInt },
  { key: 'soulsVsLobby10', label: 'Souls vs lobby at 10 min', get: (p) => p.soulsVsLobby10, higherIsBetter: 1, fmt: fmtSigned },
  { key: 'soulsPerMin12', label: 'Souls/min by 12 min', get: (p) => p.soulsPerMin12, higherIsBetter: 1, fmt: fmtInt },
  { key: 'creepDamage20', label: 'Trooper damage by 20 min', get: (p) => p.creepDamage20, higherIsBetter: 1, fmt: fmtInt },
  { key: 'itemsBy10', label: 'Items bought by 10 min', get: (p) => p.itemsBy10, higherIsBetter: 1, fmt: fmtOne },
  { key: 'accuracy', label: 'Shot accuracy', get: (p) => p.accuracy, higherIsBetter: 1, fmt: fmtPct },
  { key: 'csPct12', label: 'Last-hit efficiency at 12 min', get: (p) => p.csPct12, higherIsBetter: 1, fmt: fmtPct },
  { key: 'kda', label: 'KDA', get: (p) => p.kda, higherIsBetter: 1, fmt: (v) => v.toFixed(2) }
];

function sideStats(profiles, get) {
  const vs = profiles.map(get).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  const n = vs.length;
  const avg = n ? vs.reduce((a, b) => a + b, 0) / n : null;
  const variance = n > 1 ? vs.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1) : 0;
  return { n, mean: avg, variance };
}

/** Wins vs losses per metric. `ok: false` when either side has fewer than
    MIN_GAMES_PER_SIDE games — too few to say anything, and we say exactly that. */
function separators(profiles) {
  profiles = recent(profiles.filter((p) => !p.isBot && !p.notScored), 10);
  const wins = profiles.filter((p) => p.win);
  const losses = profiles.filter((p) => !p.win);
  const base = { nWins: wins.length, nLosses: losses.length };
  if (wins.length < MIN_GAMES_PER_SIDE || losses.length < MIN_GAMES_PER_SIDE) {
    return { ok: false, ...base, rows: [] };
  }

  const rows = [];
  for (const def of SEPARATOR_METRICS) {
    const w = sideStats(wins, def.get);
    const l = sideStats(losses, def.get);
    if (w.n < MIN_GAMES_PER_SIDE || l.n < MIN_GAMES_PER_SIDE) continue;
    const pooled = Math.sqrt(((w.n - 1) * w.variance + (l.n - 1) * l.variance) / (w.n + l.n - 2));
    const rawGap = w.mean - l.mean;
    // Positive effect = wins are better in the direction that matters for this metric.
    const effect = pooled > 0 ? (rawGap * def.higherIsBetter) / pooled : rawGap * def.higherIsBetter > 0 ? Infinity : 0;
    rows.push({ key: def.key, label: def.label, fmt: def.fmt, higherIsBetter: def.higherIsBetter, winMean: w.mean, lossMean: l.mean, nW: w.n, nL: l.n, effect });
  }
  rows.sort((a, b) => b.effect - a.effect);
  return { ok: true, ...base, rows: rows.filter((r) => r.effect >= SEPARATION_MIN_EFFECT), all: rows };
}

/** Record on each side of a cutoff, e.g. games where you were behind the lobby at 10. */
function splitRecord(profiles, get, cutoff) {
  const tally = { below: { w: 0, l: 0 }, atOrAbove: { w: 0, l: 0 } };
  for (const p of profiles) {
    const v = get(p);
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const side = v < cutoff ? tally.below : tally.atOrAbove;
    if (p.win) side.w++;
    else side.l++;
  }
  return tally;
}
