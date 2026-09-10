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

/** The cached recent-games record for one account: up to RECENT_GAMES_CAP
    { entry, profile } pairs, most-recent-first, plus when it was last synced. */
function loadCachedHistory(accountId) {
  return Store.get(`history:${accountId}`, null);
}

function saveCachedHistory(accountId, items) {
  Store.set(`history:${accountId}`, { items, syncedAt: Date.now() });
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
