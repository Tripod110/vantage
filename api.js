/* Vantage — thin client over the public deadlock-api.com REST API.
   No API key; rate-limited server-side (bursts can drop the connection), so
   call gently and don't poll. Ported from the ApiClient built for Deadlock
   Tracker (D:\Claude\Projects\Deadlock Tracker), validated live against the
   same endpoints — see that project's ApiClient.ts / types/api.ts /
   types/analytics.ts if a field or endpoint here needs extending. */

const API_BASE = 'https://api.deadlock-api.com';

/** Deadlock team ids. */
const TEAM = { AMBER: 0, SAPPHIRE: 1 };

/** Rank tier names by division (badge/rank = division*10 + subrank 1-6). */
const RANK_TIERS = [
  'Obscurus', 'Initiate', 'Seeker', 'Alchemist', 'Arcanist', 'Ritualist',
  'Emissary', 'Archon', 'Oracle', 'Phantom', 'Ascendant', 'Eternus'
];

async function getJson(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(API_BASE + path, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const accountIdsQuery = (ids) => ids.map((id) => `account_ids=${id}`).join('&');

/* One row: { account_id, match_id, hero_id, hero_level, start_time (unix s),
   match_mode, game_mode?, player_team (0=Amber/1=Sapphire), match_result
   (winning team index), player_kills, player_deaths, player_assists, denies,
   last_hits, net_worth, match_duration_s, team_abandoned? } */
async function getMatchHistory(accountId, forceRefetch = false) {
  const q = forceRefetch ? '?force_refetch=true' : '';
  const list = await getJson(`/v1/players/${accountId}/match-history${q}`);
  return list.sort((a, b) => b.start_time - a.start_time);
}

/* One point: { account_id, match_id, start_time, player_score (community
   rank estimate, ~0-116, NOT raw MMR), rank (division*10+division_tier),
   division (0-11), division_tier (1-6) } */
async function getMmrHistory(accountId) {
  const list = await getJson(`/v1/players/${accountId}/mmr-history`);
  return list.sort((a, b) => a.start_time - b.start_time);
}

function getRanks() {
  return getJson('/v1/assets/ranks');
}

function getHeroes() {
  return getJson('/v1/assets/heroes?only_active=true');
}

function getItems() {
  return getJson('/v1/assets/items?language=english');
}

/** Raw /metadata document for one finished match (full 12-player roster + timeline). */
function getMatchMetadata(matchId) {
  return getJson(`/v1/matches/${matchId}/metadata`);
}

function getBatchMmr(accountIds) {
  if (accountIds.length === 0) return Promise.resolve([]);
  return getJson(`/v1/players/mmr?${accountIdsQuery(accountIds)}`);
}

function getSteamProfiles(accountIds) {
  if (accountIds.length === 0) return Promise.resolve([]);
  return getJson(`/v1/players/steam?${accountIdsQuery(accountIds)}`);
}

function searchPlayers(query) {
  return getJson(`/v1/players/steam-search?search_query=${encodeURIComponent(query)}`);
}

/* NOT yet ported/verified: player-performance-curve, lane-soul-curve,
   item-flow-stats, badge-distribution and the other /v1/analytics/*
   endpoints listed in docs/api-notes.md. Deadlock Tracker never needed a
   per-match economy-over-time curve (Vantage's headline chart does) — pull
   the live OpenAPI spec to confirm the exact path/shape before building
   the Analyze stage. */
