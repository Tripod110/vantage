/* Vantage — sessions and load. Groups the light match-history entries (no
   /metadata needed) into play sessions and reports how a session went from
   its start to its end. Facts only: Vantage shows the numbers and leaves the
   verdict to the player — no "take a break" copy. */

const SESSION_GAP_S = 60 * 60; // more than an hour between games starts a new session
const MIN_GAMES_FOR_DECAY = 4;

const entryWin = (e) => e.match_result === e.player_team;
const entryEnd = (e) => e.start_time + (e.match_duration_s || 0);

/** Newest-first sessions: { games (oldest-first), start, end, durationS, wins, losses }. */
function buildSessions(entries) {
  const chrono = [...entries].sort((a, b) => a.start_time - b.start_time);
  const sessions = [];
  let current = null;
  for (const e of chrono) {
    if (!current || e.start_time - entryEnd(current.games[current.games.length - 1]) > SESSION_GAP_S) {
      current = { games: [] };
      sessions.push(current);
    }
    current.games.push(e);
  }
  return sessions
    .map((s) => {
      const wins = s.games.filter(entryWin).length;
      const start = s.games[0].start_time;
      const end = entryEnd(s.games[s.games.length - 1]);
      return { games: s.games, start, end, durationS: end - start, wins, losses: s.games.length - wins };
    })
    .reverse();
}

function halfStats(games) {
  const n = games.length;
  const k = games.reduce((s, e) => s + (e.player_kills || 0), 0);
  const d = games.reduce((s, e) => s + (e.player_deaths || 0), 0);
  const a = games.reduce((s, e) => s + (e.player_assists || 0), 0);
  const souls = games.reduce((s, e) => s + (e.net_worth || 0), 0);
  const mins = games.reduce((s, e) => s + (e.match_duration_s || 0), 0) / 60;
  return {
    n,
    wins: games.filter(entryWin).length,
    deathsPerGame: n ? d / n : 0,
    kda: (k + a) / Math.max(1, d),
    soulsPerMin: mins > 0 ? souls / mins : 0
  };
}

/** Early half vs late half of one session. Null when the session is too short to split. */
function sessionDecay(session) {
  if (session.games.length < MIN_GAMES_FOR_DECAY) return null;
  const mid = Math.floor(session.games.length / 2);
  return { early: halfStats(session.games.slice(0, mid)), late: halfStats(session.games.slice(mid)) };
}

/** How much has been played lately. `nowS` is passed in so this stays testable. */
function loadFacts(entries, nowS) {
  const startOfToday = new Date(nowS * 1000);
  startOfToday.setHours(0, 0, 0, 0);
  const todayS = startOfToday.getTime() / 1000;
  const weekAgo = nowS - 7 * 86400;

  const today = entries.filter((e) => e.start_time >= todayS);
  const week = entries.filter((e) => e.start_time >= weekAgo);
  const weekSessions = buildSessions(week);
  return {
    gamesToday: today.length,
    gamesLast7d: week.length,
    hoursLast7d: week.reduce((s, e) => s + (e.match_duration_s || 0), 0) / 3600,
    longestSessionGames7d: weekSessions.reduce((m, s) => Math.max(m, s.games.length), 0)
  };
}
