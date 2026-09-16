const { test } = require('node:test');
const assert = require('node:assert/strict');
const ctx = require('./load.cjs')('analyze.js', 'grading.js');
const profile = (id, o = {}) => ({ matchId: id, matchMode: 4, startTime: id, durationS: 1800, deathsBy10: 2, soulsVsLobby10: 100, csPct12: .5, kda: 2, ...o });
const pool = Array.from({ length: 9 }, (_, i) => profile(i + 1));

test('every S–F threshold has explicit boundaries', () => {
  for (const [n, letter, below] of [[90,'S','A'],[75,'A','B'],[60,'B','C'],[40,'C','D'],[25,'D','E'],[10,'E','F']]) {
    assert.equal(ctx.formLetter(n), letter); assert.equal(ctx.formLetter(n - .001), below);
  }
  assert.equal(ctx.formLetter(0), 'F');
});
test('ties give half credit and subject identity is excluded', () => {
  const subject = profile(50);
  const r = ctx.gradePersonalForm(subject, [...pool, { ...subject }]);
  assert.equal(r.n, 9); assert.equal(r.score, 50); assert.equal(r.letter, 'C');
});
test('personal form excludes comparison games from another mode', () => {
  const otherMode = Array.from({ length: 6 }, (_, i) => profile(100 + i, { matchMode: 1, deathsBy10: 0 }));
  const r = ctx.gradePersonalForm(profile(50), [...pool.slice(0, 5), ...otherMode]);
  assert.equal(r.n, 5);
  assert.equal(r.metrics[0].n, 5);
  assert.equal(r.score, 50);
});
test('lower deaths and higher other metrics improve form, including crossing zero', () => {
  const subject = profile(50, { deathsBy10: 0, soulsVsLobby10: 200, csPct12: .9, kda: 5 });
  assert.equal(ctx.gradePersonalForm(subject, pool).letter, 'S');
  assert.equal(ctx.gradePersonalForm(profile(50, { deathsBy10: 4, soulsVsLobby10: -100, csPct12: .1, kda: .1 }), pool).letter, 'F');
});
test('win/loss and goal fields never affect the grade', () => {
  const a = ctx.gradePersonalForm(profile(50, { win: true, actualHit: true }), pool);
  const b = ctx.gradePersonalForm(profile(50, { win: false, actualHit: false }), pool.map((p) => ({ ...p, win: !p.win })));
  assert.equal(a.score, b.score);
});
test('five samples per metric and three usable metrics are required', () => {
  assert.equal(ctx.gradePersonalForm(profile(50), pool.slice(0, 4)).letter, null);
  assert.equal(ctx.gradePersonalForm(profile(50, { csPct12: null }), pool.slice(0, 5)).letter, 'C');
  const r = ctx.gradePersonalForm(profile(50, { csPct12: NaN, kda: undefined }), pool);
  assert.equal(r.letter, null); assert.match(r.reason, /2 of 4/);
  assert.equal(ctx.gradePersonalForm(profile(50), pool.map((p) => ({ ...p, kda: Infinity, csPct12: null }))).letter, null);
});
test('short games cannot produce timed measurements even if a nearby snapshot exists', () => {
  const r = ctx.gradePersonalForm(profile(50, { durationS: 500 }), pool);
  assert.equal(r.letter, null); assert.equal(r.metrics[0].value, null);
});
test('economy coverage does not fabricate zeros or extend final observations', () => {
  const own = profile(50, { mySoulsSeries: [{ t: 180, souls: 1000 }, { t: 600, souls: 3000 }] });
  const other = profile(1, { durationS: 500, mySoulsSeries: [{ t: 180, souls: 800 }, { t: 480, souls: 2200 }] });
  assert.equal(ctx.economyAt(own, [other], 0).own, null);
  assert.equal(ctx.economyAt(own, [other], 300).n, 1);
  assert.equal(ctx.economyAt(own, [other], 500).n, 0);
  assert.equal(ctx.economyAt(own, [other], 601).own, null);
  assert.equal(ctx.economyAt(own, [own], 300).n, 0);
});

test('profile extraction does not turn absent measurements into favorable zeroes', () => {
  const raw = { match_id: 1, duration_s: 1800, players: [{ account_id: 1, stats: [{ time_stamp_s: 600 }, { time_stamp_s: 720, possible_creeps: 10 }] }] };
  const p = ctx.extractProfile(raw, 1);
  assert.equal(p.deathsBy10, null); assert.equal(p.kda, null); assert.equal(p.csPct12, null);
  assert.equal(p.soulsVsLobby10, null); assert.equal(p.itemsBy10, null);
  raw.players[0].stats[0].deaths = 0;
  assert.equal(ctx.extractProfile(raw, 1).deathsBy10, 0);
  raw.duration_s = 590;
  assert.equal(ctx.extractProfile(raw, 1).deathsBy10, null);
});
