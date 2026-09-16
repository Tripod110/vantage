/* Vantage — syncs the recent-games queue against deadlock-api.com, reusing
   cached match profiles instead of re-fetching them every visit. This is
   the "store match history, don't re-poll live" layer: the light
   match-history list still has to be checked each time (that's the only
   way to know a new match happened), but the heavy per-match /metadata
   fetch only runs for matches not already in the local cache — so a
   returning visitor with no new games does zero /metadata calls. */

const HISTORY_FETCH_CONCURRENCY = 4;

/* The window only ever holds games of this mode. Mixing modes contaminated every
   baseline (8–12 overall was 5–10 in ranked). Deadlock's match_mode 4 is ranked
   (metadata ranked_type 1). Other modes still feed sessions, never the analysis. */
const ANALYSIS_MATCH_MODE = 4;

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

/** Syncs the last RECENT_GAMES_CAP ranked matches for `accountId`, fetching /metadata
    only for matches not cached at the current PROFILE_VERSION. Returns
    { items: {entry, profile}[] most-recent-first, recent: light entries of every mode }.
    `onProgress(done, totalNew)` fires as matches are fetched (totalNew 0 = up to date). */
async function syncMatchHistory(accountId, onProgress) {
  const cached = loadCachedHistory(accountId);
  const cachedByMatchId = new Map(
    (cached?.items ?? []).filter((it) => it.profile?.version === PROFILE_VERSION).map((it) => [it.entry.match_id, it])
  );

  const liveHistory = await getMatchHistory(accountId);
  if (!liveHistory.length) throw new Error('no matches found for that account');

  const ranked = liveHistory.filter((m) => m.match_mode === ANALYSIS_MATCH_MODE);
  if (!ranked.length) throw new Error('no ranked matches found for that account');

  const queue = buildRecentGamesQueue(ranked);
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

  const results = await runWithConcurrency(tasks, HISTORY_FETCH_CONCURRENCY);
  const missing = results.filter((it) => !it).length;
  const items = results
    .filter(Boolean)
    .filter((it) => !it.profile.isBot && !it.profile.notScored);
  saveCachedHistory(accountId, items, liveHistory);
  return { items, missing, recent: loadCachedHistory(accountId)?.recent ?? [], syncedAt: loadCachedHistory(accountId)?.syncedAt };
}
