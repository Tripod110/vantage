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
