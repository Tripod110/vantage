/* Vantage — bounded recent-games memory, modeled explicitly as a queue.
   Vantage never diffs a match against a player's ENTIRE history (that
   erases who they are right now behind years of stale data) — only
   against a hard-capped window of their last 20 games, no more, no less.
   The most recent game is always the front; once the window is full, the
   least recent game is the next one out. This queue is what gets persisted
   (see store.js) so day-to-day play morphs the window instead of Vantage
   re-fetching a player's whole history from scratch on every visit. */

const RECENT_GAMES_CAP = 20;

class RecentGamesQueue {
  constructor(capacity = RECENT_GAMES_CAP) {
    this.capacity = capacity;
    this.items = []; // index 0 = most recent (front); last index = least recent (back)
  }

  /** Adds a match as the most recent; evicts the least recent one if over capacity. */
  enqueue(entry) {
    this.items.unshift(entry);
    if (this.items.length > this.capacity) this.items.pop();
  }

  /** Removes and returns the least recent match (back of the queue), or null if empty. */
  dequeue() {
    return this.items.length ? this.items.pop() : null;
  }

  /** The most recent match — the one under review. */
  get mostRecent() {
    return this.items[0] ?? null;
  }

  /** Everything except the most recent match — the baseline pool. */
  get rest() {
    return this.items.slice(1);
  }

  get all() {
    return this.items;
  }

  get size() {
    return this.items.length;
  }
}

/** Builds a queue from match-history entries (must already be sorted newest-first),
    capped to RECENT_GAMES_CAP. Enqueues oldest-to-newest so the newest ends up at the
    front, matching how the games actually arrived. */
function buildRecentGamesQueue(newestFirstEntries) {
  const queue = new RecentGamesQueue();
  const windowed = newestFirstEntries.slice(0, RECENT_GAMES_CAP);
  for (const entry of [...windowed].reverse()) queue.enqueue(entry);
  return queue;
}
