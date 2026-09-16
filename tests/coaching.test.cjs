const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ctx = require('./load.cjs')('queue.js', 'analyze.js', 'goals.js', 'coaching.js', 'store.js', 'history.js');
const goal = (id = 'g') => ({ id, metric: 'deathsBy10', threshold: 1, op: '<=', label: '1 or fewer deaths', setAt: 1000 });
const item = (id, at = id, o = {}) => {
  const { matchMode = 4, ...profile } = o;
  return { entry: { match_id: id, match_mode: matchMode, start_time: at }, profile: { matchId: id, matchMode, version: 3, durationS: 1800, deathsBy10: 1, ...profile } };
};
function storage() {
  const map = new Map();
  ctx.localStorage = { getItem: (k) => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: (k) => map.delete(k) };
  return map;
}
test('mixed-mode caches normalize by recency and never exceed ten', () => {
  const map = storage();
  const items = Array.from({ length: 20 }, (_, i) => item(i + 1, i + 1, { matchMode: i % 2 ? 4 : 1 }));
  map.set('vantage:history:1', JSON.stringify({ items, syncedAt: 123 }));
  const result = ctx.loadCachedHistory(1);
  assert.equal(result.items.length, 10); assert.equal(result.items[0].entry.match_id, 20); assert.equal(result.syncedAt, 123);
  assert.equal(JSON.parse(map.get('vantage:history:1')).items.length, 10);
  ctx.saveCachedHistory(1, items); assert.equal(ctx.loadCachedHistory(1).items.length, 10);
  const q = ctx.buildRecentGamesQueue(items.map((it) => it.entry).reverse());
  q.enqueue(item(21).entry); assert.equal(q.size, 10); assert.equal(q.all.at(-1).match_id, 12);
});
test('unchanged caches cause zero metadata fetches', async () => {
  storage();
  const items = Array.from({ length: 10 }, (_, i) => item(i + 1));
  ctx.saveCachedHistory(1, items);
  ctx.getMatchHistory = async () => items.map((it) => it.entry).reverse();
  let calls = 0; ctx.getMatchMetadata = async () => { calls++; throw Error('unexpected'); };
  const result = await ctx.syncMatchHistory(1);
  assert.equal(result.items.length, 10); assert.equal(calls, 0);
});
test('goal snapshots survive changes, closed sessions, and delayed metadata', () => {
  const c = ctx.migrateCoaching();
  const g = goal(); ctx.replaceCoachingGoal(c, g, 1000);
  g.threshold = 99;
  ctx.replaceCoachingGoal(c, { ...goal('new'), threshold: 3 }, 5000);
  assert.equal(ctx.matchGoalResult(item(1, 2, { deathsBy10: 2 }), c).hit, false);
  assert.equal(ctx.matchGoalResult(item(2, 5, { deathsBy10: 2 }), c).hit, true);
  ctx.endCoachingSession(c, 10000);
  assert.equal(ctx.matchGoalResult(item(3, 9), c).status, 'committed');
  assert.equal(ctx.matchGoalResult(item(4, 10), c).status, 'none');
  assert.equal(ctx.matchGoalResult(item(5, .5), c).status, 'none');
});
test('legacy recovery requires matching IDs and plausible commitment time', () => {
  const old = { ...goal(), setAt: 3000 };
  const c = ctx.migrateCoaching({ active: old, grades: { 7: { goalLabel: 'Old target', actualHit: false, note: 'keep', tags: ['farm'] } } }, [{ startedAt: 1000, endedAt: 10000, goalId: 'g' }]);
  assert.equal(ctx.matchGoalResult(item(6, 2), c).status, 'unavailable');
  assert.equal(ctx.matchGoalResult(item(7, 2), c).status, 'legacy');
  assert.equal(ctx.reflectionFor(c, 7).note, 'keep');
  const resolved = ctx.migrateCoaching({ active: goal() }, [{ startedAt: 1000, endedAt: 10000, goalId: 'g' }]);
  assert.equal(ctx.matchGoalResult(item(6, 2), resolved).status, 'committed');
});
test('eight of ten committed measured games graduates and closes session', () => {
  const c = ctx.migrateCoaching(); ctx.replaceCoachingGoal(c, goal(), 1000);
  const items = Array.from({ length: 10 }, (_, i) => item(i + 1, i + 2, { deathsBy10: i < 8 ? 0 : 2 }));
  ctx.reconcileCoaching(c, items, 20000);
  assert.equal(c.active, null); assert.equal(c.learned.length, 1); assert.equal(c.sessions[0].endedAt, 20000);
  assert.equal(ctx.matchGoalResult(items[0], c).hit, true);
});
test('uncommitted and unmeasurable games do not graduate goals', () => {
  const c = ctx.migrateCoaching(); ctx.replaceCoachingGoal(c, goal(), 1000); ctx.endCoachingSession(c, 2000);
  const items = Array.from({ length: 10 }, (_, i) => item(i + 1, i + 2));
  ctx.reconcileCoaching(c, items, 20000); assert.ok(c.active);
  assert.equal(ctx.evaluateGoal(goal(), { deathsBy10: 0, durationS: 500 }), null);
});
test('versioned migration and new reflections are account scoped; legacy remains preserved', () => {
  const map = storage();
  map.set('vantage:goals:1', JSON.stringify({ active: goal(), learned: [], grades: { 99: { note: 'legacy', tags: [] } } }));
  const c = ctx.loadCoaching(1); c.reflections[1] = { note: '<b>draft</b>', tags: ['farm'] }; c.reflections[2] = { note: 'evicted' };
  ctx.reconcileCoaching(c, [item(1)], 5000); ctx.saveCoaching(1, c);
  assert.equal(ctx.loadCoaching(1).reflections[1].note, '<b>draft</b>');
  assert.equal(ctx.loadCoaching(1).reflections[2], undefined);
  assert.equal(ctx.loadCoaching(1).legacyGrades[99].note, 'legacy');
  assert.equal(Object.keys(ctx.loadCoaching(2).reflections).length, 0);
  assert.ok(map.has('vantage:goals:1'));
});

test('saved legacy verdicts stay authoritative when goal associations resolve', () => {
  const c = ctx.migrateCoaching({ active: goal(), grades: { 7: { goalLabel: 'Old target', actualHit: false } } }, [{ startedAt: 1000, endedAt: 10000, goalId: 'g' }]);
  assert.equal(ctx.matchGoalResult(item(7, 2, { deathsBy10: 0 }), c).hit, false);
  assert.equal(ctx.committedProgress(c.active, [item(7, 2, { deathsBy10: 0 })], c).hits, 0);
});

test('partial or cache-only loads preserve drafts until a complete sync', () => {
  const c = ctx.migrateCoaching(); c.reflections[7] = { note: 'still needed', tags: [] };
  ctx.reconcileCoaching(c, [], 2000, false);
  assert.equal(c.reflections[7].note, 'still needed');
  ctx.reconcileCoaching(c, [], 2000, true);
  assert.equal(c.reflections[7], undefined);
});

test('failed metadata is reported and retried without fetching retained profiles', async () => {
  storage();
  const items = Array.from({ length: 10 }, (_, i) => item(i + 1));
  ctx.saveCachedHistory(1, items);
  ctx.getMatchHistory = async () => [item(11).entry, ...items.map((it) => it.entry).reverse()];
  let calls = 0; ctx.getMatchMetadata = async () => { calls++; throw Error('test unavailable'); };
  const first = await ctx.syncMatchHistory(1);
  assert.equal(first.missing, 1); assert.equal(first.items.length, 10); assert.equal(calls, 1);
  await ctx.syncMatchHistory(1);
  assert.equal(calls, 2, 'only the missing match is retried');
});

test('sync returns the latest valid matches across modes in one recency window', async () => {
  storage();
  const entries = Array.from({ length: 12 }, (_, i) => item(i + 1, i + 1, { matchMode: i % 3 === 0 ? 1 : 4 }));
  ctx.getMatchHistory = async () => entries.map((it) => it.entry).reverse();
  ctx.getMatchMetadata = async (id) => ({ match_id: id, duration_s: 1800, players: [{ account_id: 1, hero_id: 1, stats: [] }] });
  const result = await ctx.syncMatchHistory(1);
  assert.deepEqual(Array.from(result.items, (it) => it.entry.match_id), [12,11,10,9,8,7,6,5,4,3]);
  assert.ok(result.items.some((it) => it.entry.match_mode === 1));
  assert.ok(result.items.some((it) => it.entry.match_mode === 4));
});

test('mode-scoped commitments ignore matches from another mode', () => {
  const c = ctx.migrateCoaching();
  ctx.replaceCoachingGoal(c, { ...goal(), matchMode: 4 }, 1000);
  assert.equal(ctx.matchGoalResult(item(1, 2, { matchMode: 1, deathsBy10: 0 }), c).status, 'mode-mismatch');
  assert.equal(ctx.committedProgress(c.active, [item(1, 2, { matchMode: 1, deathsBy10: 0 })], c).measured, 0);
  assert.equal(ctx.matchGoalResult(item(2, 3, { matchMode: 4, deathsBy10: 0 }), c).hit, true);
});

test('metadata concurrency stays bounded at four', async () => {
  let active = 0; let peak = 0;
  const result = await ctx.runWithConcurrency(Array.from({ length: 10 }, (_, i) => async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2)); active--; return i;
  }), 4);
  assert.equal(peak, 4); assert.equal(result.length, 10);
});
