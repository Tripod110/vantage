/* Vantage — syncs the recent-games queue against deadlock-api.com, reusing
   cached match profiles instead of re-fetching them every visit. This is
   the "store match history, don't re-poll live" layer: the light
   match-history list still has to be checked each time (that's the only
   way to know a new match happened), but the heavy per-match /metadata
   fetch only runs for matches not already in the local cache — so a
   returning visitor with no new games does zero /metadata calls. */

const HISTORY_FETCH_CONCURRENCY = 4;

/** Runs `tasks` (functions returning promises) with at most `limit` in flight at once. */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = null;
        console.warn('task failed', err);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** Syncs the last RECENT_GAMES_CAP matches for `accountId`, fetching /metadata only
    for matches not already cached locally. Returns { entry, profile }[], most-recent-
    first, length <= RECENT_GAMES_CAP. `onProgress(done, totalNew)` fires as new
    matches are fetched (totalNew is 0 when the cache is already fully up to date). */
async function syncMatchHistory(accountId, onProgress) {
  const cached = loadCachedHistory(accountId);
  const cachedByMatchId = new Map((cached?.items ?? []).map((it) => [it.entry.match_id, it]));

  const liveHistory = await getMatchHistory(accountId);
  if (!liveHistory.length) throw new Error('no matches found for that account');

  const queue = buildRecentGamesQueue(liveHistory);
  const wanted = queue.all; // <= RECENT_GAMES_CAP entries, most-recent-first

  const totalNew = wanted.filter((entry) => !cachedByMatchId.has(entry.match_id)).length;
  let done = 0;
  onProgress?.(done, totalNew);

  const tasks = wanted.map((entry) => async () => {
    const hit = cachedByMatchId.get(entry.match_id);
    if (hit) return hit; // already have it — no network call
    const meta = await getMatchMetadata(entry.match_id);
    const profile = extractProfile(meta, accountId);
    done++;
    onProgress?.(done, totalNew);
    return profile ? { entry, profile } : null;
  });

  const items = (await runWithConcurrency(tasks, HISTORY_FETCH_CONCURRENCY)).filter(Boolean);
  saveCachedHistory(accountId, items);
  return items;
}
