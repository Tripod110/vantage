/* Shared formatting, identity, session facts, and win/loss comparisons.
   experience.js composes the ten-game dashboard; app.js owns state/actions.
   Everything external (Steam names, hero names, notes) goes through esc(). */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PROFILE_TTL = 6 * 60 * 60 * 1000; // Steam persona/avatar change rarely

async function loadDashboardData(accountId) {
  const [steam, mmr] = await Promise.all([
    cachedAsset(`steam:${accountId}`, async () => (await getSteamProfiles([accountId]))[0] ?? null, PROFILE_TTL),
    getMmrHistory(accountId).catch((err) => {
      console.warn('mmr history unavailable', err);
      return [];
    })
  ]);
  return { steam, mmr };
}

function relativeTime(unixSeconds) {
  const mins = Math.max(0, Math.round((Date.now() / 1000 - unixSeconds) / 60));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function duration(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function hoursMinutes(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const clock = (unixSeconds) => new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const compactSouls = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const record = (w, l) => `${w}<span class="dash">&ndash;</span>${l}`;
const isWinEntry = (e) => e.match_result === e.player_team;

/* ── Sections ──────────────────────────────────────────────────────────── */

function identityHtml(accountId, steam, mmr) {
  const current = mmr.length ? mmr[mmr.length - 1] : null;
  const badge = current ? rankBadgeFor(current.rank) : null;
  return `
  <section class="identity-strip fade-in">
    ${steam?.avatarfull ? `<img class="avatar-sm" src="${esc(steam.avatarfull)}" alt="">` : '<div class="avatar-sm avatar-blank"></div>'}
    <span class="who">${esc(steam?.personaname ?? `Account ${accountId}`)}</span>
    <span class="rank-mini">
      ${badge ? `<img src="${esc(badge)}" alt="">` : ''}
      ${current ? `${esc(rankLabel(current.rank))} <span class="faint">&asymp;${current.player_score}</span>` : 'Unranked'}
    </span>
  </section>`;
}

function recentlyHtml(m, nowS) {
  const s = m.lastSession;
  if (!s) return '';
  const ranked = s.games.filter((e) => e.match_mode === 4).length;
  const other = s.games.length - ranked;
  const decay = sessionDecay(s);
  const lastEnd = s.end;
  const isToday = new Date(s.start * 1000).toDateString() === new Date(nowS * 1000).toDateString();

  let decayHtml = '';
  if (decay) {
    const e = decay.early;
    const l = decay.late;
    const n1 = e.n;
    const cell = (label, a, b, fmt, lowerIsBetter) => {
      const worse = lowerIsBetter ? b > a : b < a;
      return `<div class="decay-cell"><span class="decay-label">${label}</span><span class="decay-values">${fmt(a)} <span class="arrow">&rarr;</span> <span class="${a === b ? '' : worse ? 'down' : 'up'}">${fmt(b)}</span></span></div>`;
    };
    decayHtml = `
      <div class="decay">
        <span class="decay-head">Games 1&ndash;${n1} vs ${n1 + 1}&ndash;${n1 + l.n} of that session</span>
        <div class="decay-grid">
          <div class="decay-cell"><span class="decay-label">Record</span><span class="decay-values">${record(e.wins, e.n - e.wins)} <span class="arrow">&rarr;</span> ${record(l.wins, l.n - l.wins)}</span></div>
          ${cell('Deaths / game', e.deathsPerGame, l.deathsPerGame, (v) => v.toFixed(1), true)}
          ${cell('KDA', e.kda, l.kda, (v) => v.toFixed(2), false)}
          ${cell('Souls / min', e.soulsPerMin, l.soulsPerMin, (v) => Math.round(v), false)}
        </div>
      </div>`;
  }

  const t = m.trend;
  const trendText = t
    ? `Rank score <strong>${t.perWeek === null ? 'n/a' : `${t.perWeek >= 0 ? '+' : '−'}${Math.abs(t.perWeek).toFixed(1)}/week`}</strong> over 30 days &middot; last new high ${t.daysSinceHigh === 0 ? 'today' : `${t.daysSinceHigh}d ago`}`
    : '';

  return `
  <section class="card recently fade-in">
    <div class="card-head">
      <h3 class="card-label">Recently</h3>
      <span class="faint">last game ended ${relativeTime(lastEnd)}</span>
    </div>
    <div class="session-line">
      <span class="big">${isToday ? 'Today' : new Date(s.start * 1000).toLocaleDateString([], { weekday: 'long' })}, ${clock(s.start)}&ndash;${clock(s.end)}</span>
      <span>${s.games.length} game${s.games.length === 1 ? '' : 's'} &middot; ${record(s.wins, s.losses)} &middot; ${hoursMinutes(s.durationS)}</span>
      ${other ? `<span class="faint">${ranked} ranked, ${other} non-ranked</span>` : ''}
    </div>
    ${decayHtml}
    <div class="facts">
      <span><strong>${m.load.gamesToday}</strong> games today</span>
      <span><strong>${m.load.gamesLast7d}</strong> games &middot; <strong>${m.load.hoursLast7d.toFixed(1)}h</strong> in 7 days</span>
      <span>Longest session this week: <strong>${m.load.longestSessionGames7d}</strong> games</span>
      ${trendText ? `<span>${trendText}</span>` : ''}
    </div>
  </section>`;
}

function evidenceText(ev) {
  if (!ev) return '';
  return `Your ${ev.nW} wins: <strong>${esc(ev.fmt ? ev.fmt(ev.winMean) : Math.round(ev.winMean * 10) / 10)}</strong> &middot; your ${ev.nL} losses: <strong>${esc(ev.fmt ? ev.fmt(ev.lossMean) : Math.round(ev.lossMean * 10) / 10)}</strong>`;
}

function separatorsHtml(m) {
  const sep = m.sep;
  const scope = `<p class="faint">Using ${m.analysisCount} ${esc(matchModeLabel(m.analysisMode)).toLowerCase()} match${m.analysisCount === 1 ? '' : 'es'} from the recent window.</p>`;
  if (!sep.ok) {
    return `
    <section class="card fade-in">
      <h3 class="card-label">What separates your wins from your losses</h3>
      ${scope}<p class="fact">Not enough to compare yet: <strong>${sep.nWins} wins</strong> and <strong>${sep.nLosses} losses</strong> in this mode. It needs at least 3 of each.</p>
    </section>`;
  }
  const rows = sep.rows.slice(0, 4);
  const s = m.split;
  const splitHtml =
    s.below.w + s.below.l && s.atOrAbove.w + s.atOrAbove.l
      ? `<p class="fact">Behind the lobby on Souls at 10 min: <strong>${record(s.below.w, s.below.l)}</strong> &middot; even or ahead: <strong>${record(s.atOrAbove.w, s.atOrAbove.l)}</strong></p>`
      : '';
  return `
  <section class="card fade-in">
    <h3 class="card-label">What separates your wins from your losses</h3>
    ${scope}${
      rows.length
        ? `<div class="sep-table">
        <div class="sep-row sep-head"><span></span><span>Wins (${sep.nWins})</span><span>Losses (${sep.nLosses})</span></div>
        ${rows.map((r) => `<div class="sep-row"><span>${esc(r.label)}</span><span class="up">${esc(r.fmt(r.winMean))}</span><span class="down">${esc(r.fmt(r.lossMean))}</span></div>`).join('')}
      </div>`
        : '<p class="fact">No metric clearly differs between your wins and losses in this window.</p>'
    }
    ${splitHtml}
    <p class="faint">Averages from ${sep.nWins} wins and ${sep.nLosses} losses &mdash; a pattern in your last games, not a proven cause.</p>
  </section>`;
}
