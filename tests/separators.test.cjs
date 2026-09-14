const { test } = require('node:test');
const assert = require('node:assert/strict');
const ctx = require('./load.cjs')('analyze.js');

const p = (o) => ({ win: false, deaths: 6, deathsBy10: 1, soulsVsLobby10: 0, soulsPerMin12: 700, creepDamage20: 15000, itemsBy10: 14, accuracy: 0.4, soulsLostToDeaths: 4000, csPct12: 0.7, kda: 2, ...o });

test('refuses to compare with fewer than 3 games on either side', () => {
  const r = ctx.separators([p({ win: true }), p({ win: true }), p({}), p({}), p({})]);
  assert.equal(r.ok, false);
  assert.equal(r.nWins, 2);
  assert.equal(r.rows.length, 0);
});

test('surfaces a metric that clearly differs, with direction and sample sizes', () => {
  const profiles = [
    p({ win: true, deaths: 3 }), p({ win: true, deaths: 4 }), p({ win: true, deaths: 5 }),
    p({ deaths: 8 }), p({ deaths: 9 }), p({ deaths: 10 }), p({ deaths: 9 })
  ];
  const r = ctx.separators(profiles);
  assert.equal(r.ok, true);
  const deaths = r.rows.find((x) => x.key === 'deaths');
  assert.ok(deaths, 'deaths separates wins from losses');
  assert.equal(deaths.nW, 3);
  assert.equal(deaths.nL, 4);
  assert.ok(deaths.effect > 0, 'fewer deaths in wins is the good direction');
});

test('a metric that is better in losses is not reported as a separator', () => {
  const profiles = [
    p({ win: true, csPct12: 0.6 }), p({ win: true, csPct12: 0.62 }), p({ win: true, csPct12: 0.64 }),
    p({ csPct12: 0.8 }), p({ csPct12: 0.82 }), p({ csPct12: 0.84 })
  ];
  const r = ctx.separators(profiles);
  assert.equal(r.rows.find((x) => x.key === 'csPct12'), undefined);
});

test('splitRecord tallies wins and losses either side of a cutoff', () => {
  const r = ctx.splitRecord([p({ win: true, soulsVsLobby10: 500 }), p({ soulsVsLobby10: -200 }), p({ soulsVsLobby10: -50 })], (x) => x.soulsVsLobby10, 0);
  assert.equal(r.below.w, 0);
  assert.equal(r.below.l, 2);
  assert.equal(r.atOrAbove.w, 1);
  assert.equal(r.atOrAbove.l, 0);
});
