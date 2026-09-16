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

/** Syncs the last RECENT_GAMES_CAP completed matches for `accountId`, fetching /metadata
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

  const candidates = [...new Map(liveHistory.map((entry) => [entry.match_id, entry])).values()]
    .sort((a, b) => b.start_time - a.start_time);
  const items = [];
  let done = 0;
  let totalNew = 0;
  let missing = 0;
  let cursor = 0;
  onProgress?.(0, 0);

  // Continue past unavailable, bot, or unscored matches so the visible window still
  // contains the latest ten usable completed matches whenever history permits it.
  while (items.length < RECENT_GAMES_CAP && cursor < candidates.length) {
    const needed = RECENT_GAMES_CAP - items.length;
    const batch = candidates.slice(cursor, cursor + needed);
    cursor += batch.length;
    const newEntries = batch.filter((entry) => !cachedByMatchId.has(entry.match_id));
    totalNew += newEntries.length;
    onProgress?.(done, totalNew);
    const fetched = new Map((await runWithConcurrency(newEntries.map((entry) => async () => {
      try {
        const meta = await getMatchMetadata(entry.match_id);
        const profile = extractProfile(meta, accountId);
        return profile ? { entry, profile: { ...profile, matchMode: entry.match_mode } } : null;
      } finally {
        done++;
        onProgress?.(done, totalNew);
      }
    }), HISTORY_FETCH_CONCURRENCY)).filter(Boolean).map((it) => [it.entry.match_id, it]));
    missing += newEntries.length - fetched.size;
    for (const entry of batch) {
      const item = cachedByMatchId.get(entry.match_id) ?? fetched.get(entry.match_id);
      if (item && !item.profile.isBot && !item.profile.notScored) items.push(item);
    }
  }
  const normalized = recentWindow(items);
  saveCachedHistory(accountId, normalized, liveHistory);
  return { items: normalized, missing, recent: loadCachedHistory(accountId)?.recent ?? [], syncedAt: loadCachedHistory(accountId)?.syncedAt };
}
