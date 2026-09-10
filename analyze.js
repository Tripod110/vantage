/* Vantage — Analyze stage: turn one match's raw /metadata into a review.
   Ported from Seance's shared/core (D:\Claude\Projects\Seance\src\shared\core\
   performance.ts + takeaways.ts) — same algorithms, TS -> plain JS. Currency
   is Souls (the API names it net_worth / gold_*; those values ARE Souls). */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v ?? 0) || 0);

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

  const my10 = snapAt(me.stats, 10);
  const my12 = snapAt(me.stats, 12);

  const others = players.filter((p) => num(p.account_id) !== accountId);
  const otherNw10 = others
    .map((p) => snapAt(p.stats, 10))
    .filter((s) => s !== null)
    .map((s) => num(s.net_worth));
  const soulsVsLobby10 =
    my10 && otherNw10.length
      ? num(my10.net_worth) - otherNw10.reduce((a, b) => a + b, 0) / otherNw10.length
      : null;

  const soulsPerMin12 = my12 ? num(my12.net_worth) / (num(my12.time_stamp_s) / 60) : null;
  const csPct12 = my12 && num(my12.possible_creeps) > 0 ? num(my12.creep_kills) / num(my12.possible_creeps) : null;
  const deathsBy10 = my10 ? num(my10.deaths) : null;

  const last = (s) => (s && s.length ? s[s.length - 1] : null);
  const myDmg = num(last(me.stats)?.player_damage);
  const teamDmg = players
    .filter((p) => num(p.team) === myTeam)
    .reduce((sum, p) => sum + num(last(p.stats)?.player_damage), 0);
  const damageSharePct = teamDmg > 0 ? (100 * myDmg) / teamDmg : null;

  const myLast = last(me.stats);
  const fromKills = num(myLast?.gold_player);
  const fromFarm = num(myLast?.gold_lane_creep) + num(myLast?.gold_neutral_creep);
  const soulMixKillPct = fromKills + fromFarm > 0 ? (100 * fromKills) / (fromKills + fromFarm) : null;

  const kills = num(me.kills);
  const deaths = num(me.deaths);
  const assists = num(me.assists);

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
    matchId: num(info.match_id),
    startTime: num(info.start_time),
    durationS: num(info.duration_s),
    heroId: num(me.hero_id),
    matchMode: num(info.match_mode),
    isBot,
    win,
    soulsPerMin12,
    soulsVsLobby10,
    csPct12,
    deathsBy10,
    kills,
    deaths,
    assists,
    kda: (kills + assists) / Math.max(1, deaths),
    damageSharePct,
    soulMixKillPct,
    netWorthFinal: num(me.net_worth),
    lastHits: num(me.last_hits),
    denies: num(me.denies),
    mySoulsSeries: soulsSeries(me.stats),
    leadByMinute,
    // for flagged-moments detection:
    yourDeathTimesS: (me.death_details ?? me.deaths_details ?? []).map((d) => num(d.game_time_s ?? d.time_s)).filter((t) => t > 0),
    itemsBy10: (me.items ?? []).filter((it) => num(it.game_time_s) > 0 && num(it.game_time_s) <= 600).length,
    firstItemTimeS: (me.items ?? []).map((it) => num(it.game_time_s)).filter((t) => t > 0).sort((a, b) => a - b)[0] ?? null
  };
}

/** Resamples a {t, souls} series (t in seconds) to one value per whole minute,
    using the last known value at or before that minute (step-hold). */
function resampleToMinutes(series, maxMinute) {
  const out = [];
  let i = 0;
  let last = 0;
  for (let minute = 0; minute <= maxMinute; minute++) {
    const cutoff = minute * 60;
    while (i < series.length && series[i].t <= cutoff) {
      last = series[i].souls;
      i++;
    }
    out.push(last);
  }
  return out;
}

/** Per-minute average Souls curve across a set of baseline matches (for the economy chart). */
function averageSoulsCurve(profiles, maxMinute) {
  const resampled = profiles
    .filter((p) => p.mySoulsSeries && p.mySoulsSeries.length)
    .map((p) => resampleToMinutes(p.mySoulsSeries, maxMinute));
  const out = [];
  for (let minute = 0; minute <= maxMinute; minute++) {
    const vals = resampled.map((r) => r[minute]).filter((v) => v !== undefined);
    out.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  }
  return out;
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
const values = (profiles, def) => profiles.map(def.get).filter((v) => v !== null);
const recent = (profiles, window) => [...profiles].sort((a, b) => b.startTime - a.startTime).slice(0, window);

/** The player's own recent baseline (default: last 10 non-bot games) for each metric. */
function rollingBaseline(profiles, window = 10) {
  const pool = recent(profiles.filter((p) => !p.isBot), window);
  const metrics = {};
  for (const def of METRICS) {
    const vs = values(pool, def);
    metrics[def.key] = { median: median(vs), mean: mean(vs), n: vs.length };
  }
  return { window, metrics };
}

/** Compare a single match's metrics to the player's baseline. typicalBand = fraction counted as typical. */
function compareToBaseline(profile, baseline, typicalBand = 0.1) {
  return METRICS.map((def) => {
    const value = def.get(profile);
    const base = baseline.metrics[def.key]?.median ?? 0;
    let deltaPct = null;
    let standing = 'typical';
    // `scale` metrics measure against a fixed reference instead of |base| — see the comment on
    // soulsVsLobby10 above: a near-zero baseline makes percent-of-baseline meaningless.
    const canMeasure = value !== null && (def.scale ? true : base !== 0);
    if (canMeasure) {
      const rel = def.scale ? (value - base) / def.scale : (value - base) / Math.abs(base);
      deltaPct = 100 * rel;
      // A `scale` metric's rel is "how many bands off," not a fraction of baseline — 1 band (not
      // 10%) is the typical/notable line for it.
      const bandThreshold = def.scale ? 1 : typicalBand;
      if (Math.abs(rel) <= bandThreshold) standing = 'typical';
      else {
        const better = def.higherIsBetter === 0 ? null : def.higherIsBetter === 1 ? rel > 0 : rel < 0;
        standing = better === null ? (rel > 0 ? 'above' : 'below') : better ? 'above' : 'below';
      }
    }
    return { key: def.key, label: def.label, value, baselineMedian: base, deltaPct, standing, unit: def.unit };
  });
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

  if (itemsBaseline !== null && itemsBaseline > 0 && profile.itemsBy10 < itemsBaseline - 1) {
    out.push({
      atS: 600,
      tone: 'bad',
      text: teaching
        ? `You'd bought ${profile.itemsBy10} item${profile.itemsBy10 === 1 ? '' : 's'} by the 10-minute mark, vs. your usual ${Math.round(itemsBaseline)}. Buying items (upgrades from the shop, paid for with Souls) later than usual can mean less power right when early fights happen.`
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
        ? `Between minute ${m.fromMin} and ${m.toMin}, your team's ${souls} lead over the enemy team went from ${leadStr(m.before)} to ${leadStr(m.after)} — ${swungAgainst ? 'that swing went against you' : 'that swing went your way'}. Big Souls swings like this are usually where a game turns.`
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
        ? `At the 10-minute mark you had ${soulsNum(profile.soulsVsLobby10)} ${ahead ? 'more' : 'fewer'} ${souls} than the average player in this match. That's a rough read on early-game farm and fighting, relative to everyone else in the lobby.`
        : `At the 10-minute mark you were ${soulsStr(profile.soulsVsLobby10)} ${ahead ? 'ahead of' : 'behind'} the lobby average.`
    });
  }

  out.sort((a, b) => a.atS - b.atS);
  return out.slice(0, 4);
}

/* ── Quest: one "try this next game" line, derived from the baseline diff ─
   Rule-based, from THIS player's own recent matches only — no cohort data
   needed yet (see README's "How will Vantage work?"). */

function buildQuest(comparison, teaching = false) {
  const worst = comparison
    .filter((c) => c.standing === 'below' && c.deltaPct !== null)
    .sort((a, b) => a.deltaPct - b.deltaPct)[0];
  if (!worst) {
    return {
      text: teaching
        ? 'Nothing in this game fell below your recent average by much — a game like this is exactly what "keep doing what works" looks like.'
        : "Nothing stood out as below your recent baseline this game — keep doing what you're doing.",
      tone: 'neutral'
    };
  }
  const pct = Math.round(Math.abs(worst.deltaPct));
  // soulsVsLobby10 is measured against a fixed Souls scale (see METRICS), not baseline percent —
  // show the actual Souls gap instead of a percentage that stops meaning anything near zero.
  const soulsGap = worst.value !== null ? soulsStr(worst.value - worst.baselineMedian) : '';
  const QUESTS = {
    soulsPerMin12: {
      std: `Your Souls/min by 12 minutes was ${pct}% below your recent average — try this next game: land last hits earlier in the lane instead of trading.`,
      npm: `You farmed Souls (the currency for buying items) more slowly than usual by 12 minutes, ${pct}% below your average — try this next game: prioritize landing the killing blow on lane creeps (last-hitting) over trading blows with the enemy.`
    },
    soulsVsLobby10: {
      std: `You were ${soulsGap} behind your usual standing vs. the lobby at 10 minutes — try this next game: prioritize farm over fights before the 10-minute mark.`,
      npm: `You had ${soulsGap} less than you usually do, compared to the lobby, at the 10-minute mark — try this next game: focus on farming lane creeps before picking fights in the first 10 minutes.`
    },
    csPct12: {
      std: `Last-hit efficiency was ${pct}% below your baseline by 12 minutes — try this next game: focus on creep timing in your next few laning phases.`,
      npm: `You landed fewer last hits than usual by 12 minutes (last-hitting = getting the killing blow on a creep for Souls) — try this next game: practice timing your attack so it lands right as a creep would die anyway.`
    },
    deathsBy10: {
      std: `You died more before 10 minutes than usual — try this next game: play a touch safer in the opening laning phase.`,
      npm: `You died more times than usual before the 10-minute mark — try this next game: play a bit more cautiously early on, since an early death sets you behind on Souls for a while.`
    },
    kda: {
      std: `KDA was ${pct}% below your recent baseline — try this next game: look for fights you can win instead of even ones.`,
      npm: `Your kills+assists vs. deaths ratio (KDA) was ${pct}% below your average — try this next game: look for fights where you and your team clearly outnumber the enemy, instead of even ones.`
    },
    damageSharePct: {
      std: `Your share of team damage was ${pct}% below your baseline — try this next game: stay in fights a beat longer if it's safe to.`,
      npm: `You dealt a smaller share of your team's total damage than usual — try this next game: stay in fights a moment longer when it's safe, instead of disengaging early.`
    },
    netWorthFinal: {
      std: `Final net worth was ${pct}% below your recent baseline — try this next game: keep farming between fights instead of standing idle.`,
      npm: `Your final net worth (total Souls earned) was ${pct}% below your average — try this next game: keep farming creeps between fights instead of standing around.`
    },
    itemsBy10: {
      std: `You bought fewer items by 10 minutes than usual — try this next game: return to base to shop as soon as you've got enough Souls, rather than waiting.`,
      npm: `You bought fewer items (shop upgrades paid for with Souls) by 10 minutes than usual — try this next game: head back to base to shop as soon as you've saved up enough, rather than waiting.`
    }
  };
  const variant = QUESTS[worst.key];
  const text = variant ? (teaching ? variant.npm : variant.std) : `${worst.label} was below your recent baseline this game.`;
  return { text, tone: 'quest' };
}
