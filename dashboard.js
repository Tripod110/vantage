/* Vantage — the dashboard: a hub for how you've been playing over your last
   20 games. Identity (Steam profile + current rank), form over the window,
   rank trend, and the match list itself — every row a door into that match's
   review. Everything here reads from the already-synced recent-games queue;
   only the Steam profile and MMR history are fetched on top of it. */

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

/** Aggregate form across the whole 20-game window. */
function windowSummary(items) {
  const profiles = items.map((it) => it.profile);
  const entries = items.map((it) => it.entry);
  const games = profiles.length;
  const wins = profiles.filter((p) => p.win).length;

  const totalK = profiles.reduce((s, p) => s + p.kills, 0);
  const totalD = profiles.reduce((s, p) => s + p.deaths, 0);
  const totalA = profiles.reduce((s, p) => s + p.assists, 0);

  const totalSouls = entries.reduce((s, e) => s + (e.net_worth || 0), 0);
  const totalSecs = entries.reduce((s, e) => s + (e.match_duration_s || 0), 0);

  const heroCounts = new Map();
  for (const e of entries) heroCounts.set(e.hero_id, (heroCounts.get(e.hero_id) ?? 0) + 1);
  const topHero = [...heroCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return {
    games,
    wins,
    losses: games - wins,
    winRate: games ? wins / games : 0,
    kda: (totalK + totalA) / Math.max(1, totalD),
    avgKills: games ? totalK / games : 0,
    avgDeaths: games ? totalD / games : 0,
    avgAssists: games ? totalA / games : 0,
    soulsPerMin: totalSecs ? totalSouls / (totalSecs / 60) : 0,
    topHero: topHero ? { heroId: topHero[0], count: topHero[1] } : null
  };
}

/** The mmr points that belong to this 20-game window, oldest-first. */
function windowRankPoints(items, mmr) {
  const ids = new Set(items.map((it) => it.entry.match_id));
  return mmr.filter((m) => ids.has(m.match_id)).sort((a, b) => a.start_time - b.start_time);
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

const compactSouls = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

function renderDashboard(container, { accountId, items, steam, mmr }) {
  const summary = windowSummary(items);
  const rankPoints = windowRankPoints(items, mmr);
  const current = mmr.length ? mmr[mmr.length - 1] : null;
  const windowStart = rankPoints.length ? rankPoints[0] : null;
  const scoreDelta = current && windowStart ? current.player_score - windowStart.player_score : null;

  container.innerHTML = '';

  /* ── Identity ──────────────────────────────────────────────────────── */
  const idCard = document.createElement('section');
  idCard.className = 'card identity fade-in';
  const badge = current ? rankBadgeFor(current.rank) : null;
  idCard.innerHTML = `
    <div class="identity-who">
      ${steam?.avatarfull ? `<img class="avatar" src="${steam.avatarfull}" alt="">` : '<div class="avatar avatar-blank"></div>'}
      <div>
        <h2>${steam?.personaname ?? `Account ${accountId}`}</h2>
        <p class="dim">${steam?.matches_played_last_30d != null ? `${steam.matches_played_last_30d} matches in the last 30 days` : 'Deadlock'}</p>
      </div>
    </div>
    <div class="identity-rank">
      ${badge ? `<img class="rank-badge" src="${badge}" alt="">` : ''}
      <div class="rank-text">
        <span class="rank-name">${current ? rankLabel(current.rank) : 'Unranked'}</span>
        ${current ? `<span class="dim">&asymp;${current.player_score} est. score</span>` : ''}
      </div>
    </div>
  `;
  container.appendChild(idCard);

  /* ── Form over the window ──────────────────────────────────────────── */
  const formCard = document.createElement('section');
  formCard.className = 'card fade-in';
  formCard.style.animationDelay = '60ms';
  const deltaLabel =
    scoreDelta === null || scoreDelta === 0
      ? '<span class="dim">level over this window</span>'
      : `<span class="${scoreDelta > 0 ? 'up' : 'down'}">${scoreDelta > 0 ? '▲' : '▼'} ${Math.abs(scoreDelta)} score over these ${rankPoints.length} games</span>`;

  formCard.innerHTML = `
    <h3 class="card-label">Last ${summary.games} games</h3>
    <div class="stat-row">
      <div class="stat"><span class="stat-value">${summary.wins}<span class="dash">&ndash;</span>${summary.losses}</span><span class="stat-label">record</span></div>
      <div class="stat"><span class="stat-value">${Math.round(summary.winRate * 100)}%</span><span class="stat-label">win rate</span></div>
      <div class="stat"><span class="stat-value">${summary.kda.toFixed(2)}</span><span class="stat-label">KDA</span></div>
      <div class="stat"><span class="stat-value">${Math.round(summary.soulsPerMin)}</span><span class="stat-label">souls/min</span></div>
    </div>
    <div class="trend">
      <canvas class="rank-spark"></canvas>
      <p class="trend-caption">${deltaLabel}</p>
    </div>
  `;
  container.appendChild(formCard);
  if (rankPoints.length > 1) {
    requestAnimationFrame(() => {
      drawSparkline(formCard.querySelector('.rank-spark'), rankPoints.map((p) => p.player_score));
    });
  } else {
    formCard.querySelector('.trend').remove();
  }

  /* ── Match list ────────────────────────────────────────────────────── */
  const listCard = document.createElement('section');
  listCard.className = 'card fade-in';
  listCard.style.animationDelay = '120ms';
  listCard.innerHTML =
    '<h3 class="card-label">Recent matches</h3>' +
    items
      .map(({ entry, profile }) => {
        const icon = heroIcon(entry.hero_id);
        return `
        <button class="match-row ${profile.win ? 'win' : 'loss'}" data-match-id="${entry.match_id}">
          <span class="result-pill">${profile.win ? 'W' : 'L'}</span>
          ${icon ? `<img class="hero-icon" src="${icon}" alt="">` : '<span class="hero-icon hero-icon-blank"></span>'}
          <span class="hero-name">${heroName(entry.hero_id)}</span>
          <span class="kda">${profile.kills}<span class="sep">/</span>${profile.deaths}<span class="sep">/</span>${profile.assists}</span>
          <span class="souls">${compactSouls(entry.net_worth)}</span>
          <span class="dur">${duration(entry.match_duration_s)}</span>
          <span class="ago">${relativeTime(entry.start_time)}</span>
        </button>`;
      })
      .join('');
  container.appendChild(listCard);
}
