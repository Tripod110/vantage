/* Loaded only by tests/serve.cjs at /?fixture=coaching. Uses a separate storage namespace. */
Store.get = (key, fallback) => { try { return JSON.parse(localStorage.getItem('vantage-fixture:' + key)) ?? fallback; } catch { return fallback; } };
Store.set = (key, value) => localStorage.setItem('vantage-fixture:' + key, JSON.stringify(value));
Store.remove = (key) => localStorage.removeItem('vantage-fixture:' + key);
const fixtureNow = Math.floor(Date.now() / 1000);
const fixtureItems = Array.from({ length: 20 }, (_, i) => {
  const id = 200 - i;
  const start = fixtureNow - 3600 * (i + 1);
  const matchMode = i % 4 === 0 ? 1 : 4;
  return { entry: { match_id: id, hero_id: 1, start_time: start, match_duration_s: 1800, match_mode: matchMode, player_team: 0, match_result: i % 2, player_kills: 3, player_deaths: 4, player_assists: 5, net_worth: 12000 },
    profile: { version: 3, matchId: id, matchMode, heroId: 1, startTime: start, durationS: 1800, win: i % 2 === 0, deaths: 4, kills: 3, assists: 5, deathsBy10: i % 3, soulsVsLobby10: i * 100 - 400, csPct12: .6 + i / 100, kda: 2,
      soulsPerMin12: 700, itemsBy10: 12, creepDamage20: 18000, soulsLostToDeaths: 500, accuracy: .4,
      mySoulsSeries: [{ t: 0, souls: 0 }, { t: 600, souls: 5000 + i * 100 }, { t: 1200, souls: 9000 }, { t: 1800, souls: 12000 }],
      leadByMinute: [{ minute: 0, lead: 0 }, { minute: 15, lead: 4000 }, { minute: 30, lead: -2000 }], yourDeathTimesS: [600, 680, 780] } };
});
if (!Store.get('initialized', false)) {
  Store.set('history:777', { items: fixtureItems, recent: fixtureItems.map((it) => it.entry), syncedAt: Date.now() });
  const g = { id: 'fixture-goal', metric: 'deathsBy10', op: '<=', threshold: 1, label: '1 or fewer deaths before 10 minutes', setAt: (fixtureNow - 86400) * 1000 };
  Store.set('goals:777', { active: g, learned: [], grades: { 195: { goalId: g.id, goalLabel: g.label, selfHit: false, actualHit: true, note: 'Legacy note', tags: ['farm'] } } });
  Store.set('sessions:777', [{ startedAt: g.setAt, endedAt: null, goalId: g.id }]);
  Store.set('initialized', true);
}
Store.set('accountId', 777);
let fixtureOffline = false;
getMatchHistory = async () => { if (fixtureOffline) throw Error('Simulated offline'); return fixtureItems.map((it) => it.entry); };
getMatchMetadata = async (id) => { throw Error(`Fixture profile ${id} unexpectedly refetched`); };
loadCatalogs = async () => { _heroesById = new Map([[1, { name: 'Example hero' }]]); _ranksByTier = new Map(); };
loadDashboardData = async () => ({ steam: { personaname: 'QA fixture — synthetic data' }, mmr: [] });
const fixtureBar = document.createElement('aside');
fixtureBar.style.cssText = 'padding:12px;border:2px solid #f0a020;display:flex;flex-wrap:wrap;gap:12px';
fixtureBar.innerHTML = '<strong>Local test fixture</strong><button id="fixture-offline">Simulate network failure</button><button id="fixture-empty">Simulate empty history</button>';
document.body.prepend(fixtureBar);
document.getElementById('fixture-offline').onclick = (event) => { fixtureOffline = !fixtureOffline; event.target.textContent = fixtureOffline ? 'Restore network' : 'Simulate network failure'; };
document.getElementById('fixture-empty').onclick = () => { fixtureItems.length = 0; };
