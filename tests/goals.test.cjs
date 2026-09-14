const { test } = require('node:test');
const assert = require('node:assert/strict');
const ctx = require('./load.cjs')('analyze.js', 'goals.js');

const prof = (o) => ({ win: false, deaths: 6, deathsBy10: 1, soulsVsLobby10: 0, soulsPerMin12: 700, creepDamage20: 15000, itemsBy10: 14, accuracy: 0.4, soulsLostToDeaths: 4000, csPct12: 0.7, kda: 2, ...o });
const item = (startS, p) => ({ entry: { match_id: startS, start_time: startS }, profile: prof(p) });

test('goal evaluation respects direction and unmeasurable matches', () => {
  const g = { metric: 'deathsBy10', op: '<=', threshold: 1 };
  assert.equal(ctx.evaluateGoal(g, prof({ deathsBy10: 1 })), true);
  assert.equal(ctx.evaluateGoal(g, prof({ deathsBy10: 2 })), false);
  assert.equal(ctx.evaluateGoal({ metric: 'creepDamage20', op: '>=', threshold: 10 }, prof({ creepDamage20: null })), null);
});

test('only games since the goal was set count, and 8 of the last 10 means learned', () => {
  const setAt = 1000 * 1000;
  const g = { metric: 'deathsBy10', op: '<=', threshold: 1, setAt };
  const before = item(999, { deathsBy10: 5 });
  const after = Array.from({ length: 10 }, (_, i) => item(2000 + i, { deathsBy10: i < 8 ? 0 : 3 }));
  const p = ctx.goalProgress(g, [before, ...after]);
  assert.equal(p.measured, 10);
  assert.equal(p.recentHits, 8);
  assert.equal(p.learned, true);

  const notYet = ctx.goalProgress(g, after.slice(0, 9));
  assert.equal(notYet.learned, false, 'needs a full 10-game window');
});

test('learned goals that drop below 50% are reported as slipping', () => {
  const learned = [{ metric: 'deaths', op: '<=', threshold: 5, learnedAt: 0 }];
  const items = Array.from({ length: 6 }, (_, i) => item(100 + i, { deaths: i < 2 ? 3 : 9 }));
  assert.equal(ctx.slippingGoals(learned, items).length, 1);
  const fine = Array.from({ length: 6 }, (_, i) => item(100 + i, { deaths: 3 }));
  assert.equal(ctx.slippingGoals(learned, fine).length, 0);
});

test('self-read accuracy ignores games the data could not judge', () => {
  const r = ctx.selfReadAccuracy({
    a: { selfHit: true, actualHit: true },
    b: { selfHit: true, actualHit: false },
    c: { selfHit: false, actualHit: null }
  });
  assert.equal(r.judged, 2);
  assert.equal(r.matched, 1);
});

test('suggestions come from real separators, and fall back to defaults with too few wins', () => {
  const now = 5;
  const few = ctx.separators([prof({ win: true }), prof({}), prof({}), prof({})]);
  const fallback = ctx.suggestGoals(few, now);
  assert.equal(fallback.length, 3);
  assert.ok(fallback.every((g) => g.source === 'default'));

  const profiles = [
    ...Array.from({ length: 4 }, (_, i) => prof({ win: true, deathsBy10: i % 2 ? 0 : 1 })),
    ...Array.from({ length: 6 }, (_, i) => prof({ deathsBy10: 2 + (i % 2) }))
  ];
  const sep = ctx.separators(profiles);
  const [top] = ctx.suggestGoals(sep, now);
  assert.equal(top.metric, 'deathsBy10');
  assert.equal(top.source, 'wins');
  assert.equal(top.threshold, 1, 'ceil of the winning average (0.5)');
});

test('games played outside a started session are counted', () => {
  const items = [item(100, {}), item(200, {}), item(300, {})];
  const r = ctx.gamesWithoutSession(items, [{ startedAt: 150 * 1000, endedAt: 250 * 1000 }]);
  assert.equal(r.total, 3);
  assert.equal(r.without, 2);
});

test('rank trend reports slope per week and days since a new high', () => {
  const day = 86400;
  const mmr = [0, 7, 14, 21].map((d, i) => ({ start_time: d * day, player_score: 10 + i }));
  const f = ctx.rankTrendFacts(mmr, 25 * day);
  assert.equal(Math.round(f.perWeek * 100) / 100, 1);
  assert.equal(f.daysSinceHigh, 4);
});
