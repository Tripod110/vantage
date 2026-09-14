/* Vantage — the homepage. Leads with what's been happening lately, then the one
   goal you're working on (and whether you're actually grading yourself on it),
   then what separates your wins from your losses, then the 20-game window as a
   selector with a detail pane. Rank is deliberately small: the goal is the
   headline, not the ladder. Pure rendering — app.js owns state and actions.
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

/** Everything the homepage shows, derived once per render. */
function buildDashboardModel({ items, recent, mmr, goals, sessionLog, nowS }) {
  const profiles = items.map((it) => it.profile);
  const sep = separators(profiles);
  const learnedMetrics = new Set(goals.learned.map((g) => g.metric));
  const suggestions = suggestGoals(sep, Date.now(), 5).filter((g) => !learnedMetrics.has(g.metric)).slice(0, 3);
  const openSession = sessionLog.length && sessionLog[sessionLog.length - 1].endedAt == null ? sessionLog[sessionLog.length - 1] : null;

  const active = goals.active;
  const progress = active ? goalProgress(active, items) : null;
  const pending =
    active && openSession
      ? items.filter((it) => it.entry.start_time * 1000 >= Math.max(openSession.startedAt, active.setAt) && !goals.grades[it.entry.match_id])
      : [];
  const graded = Object.entries(goals.grades)
    .map(([matchId, g]) => ({ matchId: Number(matchId), ...g }))
    .sort((a, b) => b.gradedAt - a.gradedAt);

  const sessions = buildSessions(recent);
  return {
    sep,
    split: splitRecord(profiles, (p) => p.soulsVsLobby10, 0),
    suggestions,
    openSession,
    progress,
    pending,
    graded,
    accuracy: selfReadAccuracy(goals.grades),
    slipping: slippingGoals(goals.learned, items),
    withoutSession: gamesWithoutSession(items, sessionLog),
    lastSession: sessions[0] ?? null,
    load: loadFacts(recent, nowS),
    trend: rankTrendFacts(mmr, nowS)
  };
}

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
  const ranked = s.games.filter((e) => e.match_mode === ANALYSIS_MATCH_MODE).length;
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
      ${other ? `<span class="faint">${ranked} ranked, ${other} unranked (unranked games aren't analyzed)</span>` : ''}
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

function pendingRowHtml(it) {
  const { entry, profile } = it;
  const icon = heroIcon(entry.hero_id);
  const tags = ['laning', 'positioning', 'fights', 'farm', 'objectives', 'tilted'];
  return `
  <div class="grade-row" data-match-id="${entry.match_id}">
    <div class="grade-game">
      ${icon ? `<img class="hero-icon" src="${esc(icon)}" alt="">` : ''}
      <span>${esc(heroName(entry.hero_id))}</span>
      <span class="${profile.win ? 'up' : 'down'}">${profile.win ? 'Win' : 'Loss'}</span>
      <span class="faint">${relativeTime(entry.start_time)}</span>
    </div>
    <p class="grade-q">Before you see the data: did you hit your goal?</p>
    <div class="chips">${tags.map((t) => `<button class="chip" data-action="tag" data-tag="${t}">${t}</button>`).join('')}</div>
    <input class="grade-note" type="text" maxlength="200" placeholder="What went wrong or right? (optional)">
    <div class="grade-buttons">
      <button class="btn-hit" data-action="grade" data-hit="1">I hit it</button>
      <button class="btn-miss" data-action="grade" data-hit="0">I missed it</button>
    </div>
  </div>`;
}

function goalHtml(m, goals, items) {
  const active = goals.active;
  const acc = m.accuracy;
  const accText = acc.judged ? `Your self-grade matched the data in <strong>${acc.matched} of ${acc.judged}</strong> games.` : '';
  const without = m.withoutSession.total ? `<strong>${m.withoutSession.without} of your last ${m.withoutSession.total}</strong> ranked games were played without a session goal.` : '';
  const slipping = m.slipping
    .map(({ goal, progress }) => `<li>Slipping: <strong>${esc(goal.label)}</strong> &mdash; hit ${progress.recentHits} of last ${progress.recentMeasured}</li>`)
    .join('');

  if (!active) {
    return `
    <section class="card goal-card fade-in">
      <h3 class="card-label accent">Pick one goal before you queue</h3>
      <p class="lede">One measurable thing per session, judged yes or no whether you win or lose.</p>
      <div class="suggestions">
        ${m.suggestions
          .map(
            (g, i) => `
          <div class="suggestion">
            <div>
              <span class="goal-label">${esc(g.label)}</span>
              <span class="faint">${g.source === 'wins' ? evidenceText(g.evidence) : 'Starting target &mdash; not enough wins in the window to derive one yet'}</span>
            </div>
            <button class="btn-primary" data-action="adopt" data-index="${i}">Start session</button>
          </div>`
          )
          .join('')}
      </div>
      ${goals.learned.length ? `<p class="faint">Learned so far: ${goals.learned.map((g) => esc(g.label)).join(' &middot; ')}</p>` : ''}
      ${slipping ? `<ul class="slipping">${slipping}</ul>` : ''}
      ${without ? `<p class="fact">${without}</p>` : ''}
    </section>`;
  }

  const p = m.progress;
  const progressText = p.measured
    ? `Hit in <strong>${p.hits} of ${p.measured}</strong> games since you set it${p.measured > 10 ? ` &middot; last 10: <strong>${p.recentHits}/10</strong>` : ''}. Learned at 8 of the last 10.`
    : 'No ranked games since you set it yet.';
  const recentGraded = m.graded
    .slice(0, 3)
    .map((g) => {
      const it = items.find((x) => x.entry.match_id === g.matchId);
      const hero = it ? esc(heroName(it.entry.hero_id)) : 'Game';
      const verdict = g.actualHit === null ? 'data couldn’t judge it' : `data says <strong>${g.actualHit ? 'hit' : 'miss'}</strong>`;
      const matched = g.actualHit === null ? '' : g.selfHit === g.actualHit ? '<span class="up">read matched</span>' : '<span class="down">read didn’t match</span>';
      return `<li>${hero}: you said <strong>${g.selfHit ? 'hit' : 'miss'}</strong>, ${verdict} ${matched}${g.note ? ` &middot; <em>${esc(g.note)}</em>` : ''}</li>`;
    })
    .join('');

  return `
  <section class="card goal-card fade-in">
    <div class="card-head">
      <h3 class="card-label accent">${m.openSession ? `Session running &middot; started ${relativeTime(m.openSession.startedAt / 1000)}` : 'Your goal'}</h3>
      <button class="link-btn" data-action="change-goal">Change goal</button>
    </div>
    <p class="goal-title">${esc(active.label)}</p>
    <p class="faint">${active.source === 'wins' ? `Set from your ${active.nWins} winning games` : 'Starting target'}</p>
    <p class="fact">${progressText}</p>
    ${accText ? `<p class="fact">${accText}</p>` : ''}
    ${
      m.openSession
        ? `${m.pending.length ? `<div class="pending"><h4>${m.pending.length} game${m.pending.length === 1 ? '' : 's'} to grade</h4>${m.pending.map(pendingRowHtml).join('')}</div>` : '<p class="faint">Play a ranked game &mdash; it shows up here to grade once it syncs.</p>'}
           <button class="btn-ghost" data-action="end-session">End session</button>`
        : `<button class="btn-primary" data-action="start-session">Start session</button>`
    }
    ${recentGraded ? `<ul class="graded">${recentGraded}</ul>` : ''}
    ${slipping ? `<ul class="slipping">${slipping}</ul>` : ''}
    ${without ? `<p class="fact">${without}</p>` : ''}
  </section>`;
}

function separatorsHtml(m) {
  const sep = m.sep;
  if (!sep.ok) {
    return `
    <section class="card fade-in">
      <h3 class="card-label">What separates your wins from your losses</h3>
      <p class="fact">Not enough to compare yet: <strong>${sep.nWins} wins</strong> and <strong>${sep.nLosses} losses</strong> in your window. It needs at least 3 of each.</p>
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
    ${
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

function windowHtml(items, selectedMatchId, teaching, goals) {
  if (!items.length) return '';
  const chrono = [...items].reverse();
  const spm = (it) => it.entry.net_worth / Math.max(1, it.entry.match_duration_s / 60);
  const vals = chrono.map(spm);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const wins = items.filter((it) => it.profile.win).length;
  const selected = items.find((it) => it.entry.match_id === selectedMatchId) ?? items[0];

  const tiles = chrono
    .map((it) => {
      const h = hi > lo ? 25 + ((spm(it) - lo) / (hi - lo)) * 70 : 60;
      const sel = it.entry.match_id === selected.entry.match_id;
      return `<button class="tile ${it.profile.win ? 'win' : 'loss'}${sel ? ' selected' : ''}" data-action="select" data-match-id="${it.entry.match_id}" title="${esc(heroName(it.entry.hero_id))} &middot; ${it.profile.win ? 'Win' : 'Loss'}"><span style="height:${h.toFixed(0)}%"></span></button>`;
    })
    .join('');

  const { entry, profile } = selected;
  const others = items.filter((it) => it !== selected).map((it) => it.profile);
  const baseline = rollingBaseline(others, others.length);
  const itemsBaseline = baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null;
  const moments = buildFlaggedMoments(profile, itemsBaseline, teaching).slice(0, 3);
  const grade = goals.grades[entry.match_id];
  const icon = heroIcon(entry.hero_id);
  const fmtLobby = profile.soulsVsLobby10 === null ? '&ndash;' : `${profile.soulsVsLobby10 >= 0 ? '+' : '−'}${Math.round(Math.abs(profile.soulsVsLobby10)).toLocaleString('en-US')}`;

  return `
  <section class="card window-card fade-in">
    <div class="card-head">
      <h3 class="card-label">Your window &middot; last ${items.length} ranked games</h3>
      <span class="faint">${record(wins, items.length - wins)} &middot; ${Math.round((wins / items.length) * 100)}% &middot; bar height = souls/min</span>
    </div>
    <div class="tiles">${tiles}</div>
    <div class="detail">
      <div class="detail-main">
        <div class="detail-hero">
          ${icon ? `<img class="hero-icon lg" src="${esc(icon)}" alt="">` : ''}
          <div>
            <span class="detail-name">${esc(heroName(entry.hero_id))}</span>
            <span class="${profile.win ? 'up' : 'down'}">${profile.win ? 'Win' : 'Loss'}</span>
            <span class="faint">${duration(profile.durationS)} &middot; ${relativeTime(entry.start_time)}</span>
          </div>
        </div>
        <div class="detail-stats">
          <div><strong>${profile.kills}/${profile.deaths}/${profile.assists}</strong><span>K/D/A</span></div>
          <div><strong>${compactSouls(entry.net_worth)}</strong><span>souls</span></div>
          <div><strong>${profile.deathsBy10 ?? '&ndash;'}</strong><span>deaths by 10</span></div>
          <div><strong>${fmtLobby}</strong><span>vs lobby @10</span></div>
        </div>
        ${grade ? `<p class="fact">Goal &ldquo;${esc(grade.goalLabel)}&rdquo;: you said <strong>${grade.selfHit ? 'hit' : 'miss'}</strong>, data says <strong>${grade.actualHit === null ? 'n/a' : grade.actualHit ? 'hit' : 'miss'}</strong></p>` : ''}
      </div>
      <div class="detail-moments">
        ${moments.length ? moments.map((mo) => `<div class="moment ${mo.tone}"><span class="ts">${duration(mo.atS)}</span><span>${esc(mo.text)}</span></div>`).join('') : '<p class="faint">Nothing notable flagged this game.</p>'}
        <button class="link-btn accent" data-action="review" data-match-id="${entry.match_id}">Full review &rarr;</button>
      </div>
    </div>
  </section>`;
}

/** Renders the homepage and returns the model (app.js needs the suggestions it offered). */
function renderDashboard(container, { accountId, items, recent, steam, mmr, goals, sessionLog, selectedMatchId, teaching }) {
  const nowS = Date.now() / 1000;
  const model = buildDashboardModel({ items, recent, mmr, goals, sessionLog, nowS });
  container.innerHTML = [
    identityHtml(accountId, steam, mmr),
    recentlyHtml(model, nowS),
    goalHtml(model, goals, items),
    separatorsHtml(model),
    windowHtml(items, selectedMatchId, teaching, goals)
  ].join('');
  return model;
}
