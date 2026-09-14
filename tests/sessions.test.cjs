const { test } = require('node:test');
const assert = require('node:assert/strict');
const ctx = require('./load.cjs')('sessions.js');

const game = (start, { dur = 1800, win = true, k = 5, d = 5, a = 5, souls = 30000 } = {}) => ({
  start_time: start, match_duration_s: dur, player_team: 0, match_result: win ? 0 : 1,
  player_kills: k, player_deaths: d, player_assists: a, net_worth: souls
});

test('games less than an hour apart share a session; a longer gap splits them', () => {
  const t = 1_000_000;
  const entries = [
    game(t),
    game(t + 1800 + 600), // 10 min after the first ended
    game(t + 1800 + 600 + 1800 + 3601) // 60m01s after the second ended
  ];
  const sessions = ctx.buildSessions(entries);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].games.length, 1, 'newest session first');
  assert.equal(sessions[1].games.length, 2);
});

test('session record and duration', () => {
  const t = 2_000_000;
  const [s] = ctx.buildSessions([game(t, { win: true }), game(t + 2000, { win: false })]);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  assert.equal(s.durationS, 2000 + 1800);
});

test('decay compares the early half to the late half, and refuses short sessions', () => {
  const t = 3_000_000;
  const short = ctx.buildSessions([game(t), game(t + 2000), game(t + 4000)])[0];
  assert.equal(ctx.sessionDecay(short), null);

  const long = ctx.buildSessions([
    game(t, { d: 2 }), game(t + 2000, { d: 2 }),
    game(t + 4000, { d: 8 }), game(t + 6000, { d: 10 })
  ])[0];
  const decay = ctx.sessionDecay(long);
  assert.equal(decay.early.deathsPerGame, 2);
  assert.equal(decay.late.deathsPerGame, 9);
});

test('load facts count only the last 7 days', () => {
  const now = 10_000_000;
  const entries = [game(now - 3600), game(now - 2 * 86400), game(now - 8 * 86400)];
  const f = ctx.loadFacts(entries, now);
  assert.equal(f.gamesLast7d, 2);
  assert.equal(Math.round(f.hoursLast7d * 10) / 10, 1);
});
