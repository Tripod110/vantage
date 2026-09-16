/* Vantage — local data layer (localStorage). Mirrors peak's Store pattern:
   a namespaced key prefix, JSON in/out, fail-soft on a bad/blocked store.
   This is what makes Vantage "store match history" instead of re-fetching
   a player's whole recent-games window from scratch on every visit. */

const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('vantage:' + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('vantage:' + key, JSON.stringify(val));
    } catch (err) {
      console.warn('Store.set failed (storage full or blocked)', err);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem('vantage:' + key);
    } catch {
      /* ignore */
    }
  }
};

/** The cached record for one account: up to RECENT_GAMES_CAP recent completed
    { entry, profile } pairs (most-recent-first), the light entries of recent
    matches in every mode (for sessions), and when it was last synced. */
function loadCachedHistory(accountId) {
  const cache = Store.get(`history:${accountId}`, null);
  if (!cache) return null;
  const items = recentWindow(cache.items ?? []);
  const normalized = { ...cache, items };
  if (JSON.stringify(items) !== JSON.stringify(cache.items)) Store.set(`history:${accountId}`, normalized);
  return normalized;
}

const RECENT_ENTRY_FIELDS = ['match_id', 'hero_id', 'start_time', 'match_duration_s', 'match_mode', 'match_result', 'player_team', 'player_kills', 'player_deaths', 'player_assists', 'net_worth'];
const RECENT_ENTRY_LIMIT = 100;

function saveCachedHistory(accountId, items, recentEntries = []) {
  const recent = recentEntries.slice(0, RECENT_ENTRY_LIMIT).map((e) => Object.fromEntries(RECENT_ENTRY_FIELDS.map((f) => [f, e[f]])));
  Store.set(`history:${accountId}`, { items: recentWindow(items), recent, syncedAt: Date.now() });
}

function loadCoaching(accountId) {
  const saved = Store.get(`coaching:${accountId}`, null);
  if (saved?.version === COACHING_VERSION) return saved;
  const coaching = migrateCoaching(loadGoalState(accountId), loadSessionLog(accountId));
  saveCoaching(accountId, coaching);
  return coaching;
}

function saveCoaching(accountId, coaching) {
  Store.set(`coaching:${accountId}`, coaching);
}

/* Goals and sessions, per account. Shape:
   goals:    { active: goal|null, learned: goal[], grades: { [matchId]: grade } }
   sessions: [{ startedAt, endedAt|null, goalId }] (oldest-first, capped) */
const SESSION_LOG_LIMIT = 60;

function loadGoalState(accountId) {
  return Store.get(`goals:${accountId}`, { active: null, learned: [], grades: {} });
}

function saveGoalState(accountId, state) {
  Store.set(`goals:${accountId}`, state);
}

function loadSessionLog(accountId) {
  return Store.get(`sessions:${accountId}`, []);
}

function saveSessionLog(accountId, log) {
  Store.set(`sessions:${accountId}`, log.slice(-SESSION_LOG_LIMIT));
}

/** Whose page this is. Remembered so returning visits land straight on the
    dashboard instead of asking for the id again. */
function loadAccountId() {
  return Store.get('accountId', null);
}

function saveAccountId(accountId) {
  Store.set('accountId', accountId);
}

function forgetAccount() {
  Store.remove('accountId');
}

/* Slow-changing catalogs (heroes, ranks) — fetched rarely, TTL'd on disk.
   Same reasoning as Deadlock Tracker's 7-day asset TTLs: these change on
   Valve's patch cadence, not per-visit. */
const ASSET_TTL = 7 * 24 * 60 * 60 * 1000;

async function cachedAsset(key, fetcher, ttlMs = ASSET_TTL) {
  const hit = Store.get(`asset:${key}`, null);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  try {
    const value = await fetcher();
    Store.set(`asset:${key}`, { at: Date.now(), value });
    return value;
  } catch (err) {
    // A stale catalog beats no catalog — only fail if we have nothing at all.
    if (hit) {
      console.warn(`asset "${key}" refresh failed, using stale copy`, err);
      return hit.value;
    }
    throw err;
  }
}
