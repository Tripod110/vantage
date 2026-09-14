/* Vantage — app shell: remembers whose page this is, keeps the synced ranked
   window plus recent all-mode entries in memory, owns goal/session state, and
   routes between the homepage and a single-match review. Renders from the
   local cache first so a returning visit paints immediately, then syncs. */

const State = {
  accountId: null,
  items: [], // ranked { entry, profile }[], most-recent-first
  recent: [], // light entries, every mode, for sessions
  steam: null,
  mmr: [],
  selectedMatchId: null,
  teaching: false,
  goals: { active: null, learned: [], grades: {} },
  sessionLog: [],
  lastModel: null
};

const el = {
  tabs: document.getElementById('tabs'),
  landing: document.getElementById('landing'),
  dashboard: document.getElementById('dashboard'),
  review: document.getElementById('review'),
  reviewCard: document.getElementById('review-card'),
  status: document.getElementById('status'),
  form: document.getElementById('lookup-form'),
  input: document.getElementById('steam-input'),
  teachingToggle: document.getElementById('teaching-toggle'),
  backBtn: document.getElementById('back-btn'),
  switchAccount: document.getElementById('switch-account')
};

function setStatus(text, isError = false) {
  el.status.textContent = text ?? '';
  el.status.classList.toggle('error', !!isError);
}

function showView(name) {
  el.landing.hidden = name !== 'landing';
  el.dashboard.hidden = name !== 'dashboard';
  el.review.hidden = name !== 'review';
  el.tabs.hidden = name === 'landing';
  for (const tab of el.tabs.querySelectorAll('.tab[data-tab]')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
}

/* ── Boot ──────────────────────────────────────────────────────────────── */

async function boot() {
  State.teaching = Store.get('teaching', false);
  el.teachingToggle.checked = State.teaching;

  const accountId = loadAccountId();
  if (!accountId) {
    showView('landing');
    return;
  }
  await openAccount(accountId);
}

function loadAccountState(accountId) {
  State.accountId = accountId;
  State.goals = loadGoalState(accountId);
  State.sessionLog = loadSessionLog(accountId);
}

async function openAccount(accountId) {
  loadAccountState(accountId);

  // 1. Paint from cache if we have anything, so a return visit is instant.
  const cached = loadCachedHistory(accountId);
  const cachedRanked = (cached?.items ?? []).filter((it) => it.entry.match_mode === ANALYSIS_MATCH_MODE && it.profile?.version === PROFILE_VERSION);
  if (cachedRanked.length) {
    State.items = cachedRanked;
    State.recent = cached.recent ?? [];
    try {
      await loadCatalogs();
      State.steam = Store.get(`asset:steam:${accountId}`, null)?.value ?? null;
      renderDashboardView();
      showView('dashboard');
    } catch (err) {
      console.warn('cache-first paint failed', err);
    }
  } else {
    setStatus('Loading your last 20 ranked games — this takes a moment the first time...');
  }

  // 2. Sync what's new, then repaint with fresh data.
  try {
    const [{ items, recent }] = await Promise.all([
      syncMatchHistory(accountId, (done, totalNew) => {
        if (totalNew > 0) setStatus(`Fetching ${done} of ${totalNew} match${totalNew === 1 ? '' : 'es'}...`);
      }),
      loadCatalogs()
    ]);
    State.items = items;
    State.recent = recent;

    const { steam, mmr } = await loadDashboardData(accountId);
    State.steam = steam;
    State.mmr = mmr;

    saveAccountId(accountId);
    renderDashboardView();
    showView('dashboard');
    setStatus('');
  } catch (err) {
    console.error(err);
    if (!State.items.length) {
      setStatus(`Couldn't load that account: ${err.message}`, true);
      showView('landing');
    } else {
      setStatus(`Showing cached games — refresh failed: ${err.message}`, true);
    }
  }
}

/** Graduates the active goal once it's learned (8 of the last 10), then renders. */
function renderDashboardView() {
  const active = State.goals.active;
  if (active && goalProgress(active, State.items).learned) {
    State.goals.learned.push({ ...active, learnedAt: Date.now() });
    State.goals.active = null;
    saveGoalState(State.accountId, State.goals);
  }
  State.lastModel = renderDashboard(el.dashboard, {
    accountId: State.accountId,
    items: State.items,
    recent: State.recent,
    steam: State.steam,
    mmr: State.mmr,
    goals: State.goals,
    sessionLog: State.sessionLog,
    selectedMatchId: State.selectedMatchId,
    teaching: State.teaching
  });
}

/* ── Goal and session actions ─────────────────────────────────────────── */

function startSession() {
  const open = State.sessionLog.at(-1);
  if (open && open.endedAt == null) return;
  State.sessionLog.push({ startedAt: Date.now(), endedAt: null, goalId: State.goals.active?.id ?? null });
  saveSessionLog(State.accountId, State.sessionLog);
}

function endSession() {
  const open = State.sessionLog.at(-1);
  if (!open || open.endedAt != null) return;
  open.endedAt = Date.now();
  saveSessionLog(State.accountId, State.sessionLog);
}

function adoptGoal(index) {
  const g = State.lastModel?.suggestions?.[index];
  if (!g) return;
  const { evidence, ...goal } = g;
  State.goals.active = { ...goal, setAt: Date.now() };
  saveGoalState(State.accountId, State.goals);
  startSession();
}

function gradeGame(row, selfHit) {
  const matchId = Number(row.dataset.matchId);
  const item = State.items.find((it) => it.entry.match_id === matchId);
  const goal = State.goals.active;
  if (!item || !goal) return;
  State.goals.grades[matchId] = {
    goalId: goal.id,
    goalLabel: goal.label,
    selfHit,
    tags: [...row.querySelectorAll('.chip.on')].map((c) => c.dataset.tag),
    note: row.querySelector('.grade-note').value.trim().slice(0, 200),
    actualHit: evaluateGoal(goal, item.profile),
    gradedAt: Date.now()
  };
  saveGoalState(State.accountId, State.goals);
}

/* ── Events ────────────────────────────────────────────────────────────── */

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const accountId = toAccountId(el.input.value);
  if (accountId === null) {
    setStatus('Enter an account ID, SteamID64, or steamcommunity.com/profiles/ link. Custom /id/ links need a numeric SteamID64 instead.', true);
    return;
  }
  State.items = [];
  State.recent = [];
  el.form.querySelector('button').disabled = true;
  try {
    await openAccount(accountId);
  } finally {
    el.form.querySelector('button').disabled = false;
  }
});

el.teachingToggle.addEventListener('change', () => {
  State.teaching = el.teachingToggle.checked;
  Store.set('teaching', State.teaching);
});

el.tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab[data-tab]');
  if (!tab) return;
  if (tab.dataset.tab === 'review') {
    openReview(State.selectedMatchId ?? State.items[0]?.entry.match_id);
  } else {
    renderDashboardView();
    showView('dashboard');
  }
});

el.switchAccount.addEventListener('click', () => {
  forgetAccount();
  Object.assign(State, { accountId: null, items: [], recent: [], steam: null, mmr: [], selectedMatchId: null, goals: { active: null, learned: [], grades: {} }, sessionLog: [] });
  el.input.value = '';
  setStatus('');
  showView('landing');
});

el.backBtn.addEventListener('click', () => {
  renderDashboardView();
  showView('dashboard');
});

el.dashboard.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'tag') {
    target.classList.toggle('on');
    return; // no re-render: would wipe an in-progress note
  }
  if (action === 'select') State.selectedMatchId = Number(target.dataset.matchId);
  else if (action === 'review') return openReview(Number(target.dataset.matchId));
  else if (action === 'adopt') adoptGoal(Number(target.dataset.index));
  else if (action === 'start-session') startSession();
  else if (action === 'end-session') endSession();
  else if (action === 'change-goal') {
    State.goals.active = null;
    saveGoalState(State.accountId, State.goals);
  } else if (action === 'grade') gradeGame(target.closest('.grade-row'), target.dataset.hit === '1');
  else return;

  renderDashboardView();
});

/* ── Review ────────────────────────────────────────────────────────────── */

function openReview(matchId) {
  if (!matchId || !State.items.length) return;
  const index = State.items.findIndex((it) => it.entry.match_id === matchId);
  if (index === -1) return;
  State.selectedMatchId = matchId;

  const subject = State.items[index];
  // The reviewed match is never compared against itself.
  const others = State.items.filter((_, i) => i !== index).map((it) => it.profile);
  renderReview(subject, others);
  showView('review');
}

function mmss(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** This game's numbers next to your winning and losing averages from the rest of the window. */
function comparisonTableHtml(profile, others) {
  const sep = separators(others);
  const separating = new Set(sep.rows.map((r) => r.key));
  const rows = SEPARATOR_METRICS.map((def) => {
    const v = def.get(profile);
    const row = sep.all?.find((r) => r.key === def.key);
    // "Closer to your wins/losses" only means something where wins and losses actually differ.
    let standing = row ? '<span class="faint">no clear difference</span>' : '';
    if (row && separating.has(def.key) && v !== null && Number.isFinite(v)) {
      const nearWin = Math.abs(v - row.winMean) <= Math.abs(v - row.lossMean);
      standing = nearWin ? '<span class="up">closer to your wins</span>' : '<span class="down">closer to your losses</span>';
    }
    return `<div class="cmp-row">
      <span>${esc(def.label)}</span>
      <strong>${v === null || !Number.isFinite(v) ? '&ndash;' : esc(def.fmt(v))}</strong>
      <span class="up">${row ? esc(def.fmt(row.winMean)) : '&ndash;'}</span>
      <span class="down">${row ? esc(def.fmt(row.lossMean)) : '&ndash;'}</span>
      <span>${standing}</span>
    </div>`;
  }).join('');
  const note = sep.ok
    ? `Averages from your other ${sep.nWins} wins and ${sep.nLosses} losses in the window.`
    : `Not enough to compare: ${sep.nWins} wins and ${sep.nLosses} losses in the rest of the window (needs 3 of each).`;
  return `<h3 class="card-label">This game vs. your wins and losses</h3>
    <div class="cmp-row cmp-head"><span></span><span>This game</span><span>Your wins</span><span>Your losses</span><span></span></div>
    ${rows}
    <p class="faint">${note}</p>`;
}

function renderReview({ entry, profile }, others) {
  const baseline = rollingBaseline(others, others.length);
  const itemsBaseline = baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null;
  const moments = buildFlaggedMoments(profile, itemsBaseline, State.teaching);

  el.reviewCard.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'card match-header fade-in';
  const icon = heroIcon(entry.hero_id);
  header.innerHTML = `
    <div class="mh-left">
      ${icon ? `<img class="hero-icon lg" src="${esc(icon)}" alt="">` : ''}
      <h2>${esc(heroName(entry.hero_id))} &mdash; <span class="${profile.win ? 'result-win' : 'result-loss'}">${profile.win ? 'Win' : 'Loss'}</span></h2>
    </div>
    <span class="duration">${mmss(profile.durationS)}</span>
  `;
  el.reviewCard.appendChild(header);

  const grade = State.goals.grades[entry.match_id];
  if (grade) {
    const gradeCard = document.createElement('div');
    gradeCard.className = 'card goal-card fade-in';
    gradeCard.innerHTML = `<h3 class="card-label accent">Your goal this game</h3>
      <p class="goal-title">${esc(grade.goalLabel)}</p>
      <p class="fact">You said <strong>${grade.selfHit ? 'hit' : 'miss'}</strong>. The data says <strong>${grade.actualHit === null ? 'it can’t be measured this game' : grade.actualHit ? 'hit' : 'miss'}</strong>.</p>
      ${grade.tags.length ? `<p class="faint">Your tags: ${grade.tags.map(esc).join(', ')}</p>` : ''}
      ${grade.note ? `<p class="faint"><em>${esc(grade.note)}</em></p>` : ''}`;
    el.reviewCard.appendChild(gradeCard);
  }

  const cmpCard = document.createElement('div');
  cmpCard.className = 'card fade-in';
  cmpCard.innerHTML = comparisonTableHtml(profile, others);
  el.reviewCard.appendChild(cmpCard);

  const chartCard = document.createElement('div');
  chartCard.className = 'card chart-wrap fade-in';
  chartCard.innerHTML = `<canvas></canvas><p class="chart-caption">Souls over time vs. your other ${others.length} ranked game${others.length === 1 ? '' : 's'}</p>`;
  el.reviewCard.appendChild(chartCard);
  const maxMinute = Math.round(profile.durationS / 60);
  const thisSeries = resampleToMinutes(profile.mySoulsSeries, maxMinute);
  const baselineSeries = others.length ? averageSoulsCurve(others, maxMinute) : [];
  requestAnimationFrame(() => drawEconomyCurve(chartCard.querySelector('canvas'), thisSeries, baselineSeries));

  const momentsCard = document.createElement('div');
  momentsCard.className = 'card fade-in';
  momentsCard.innerHTML =
    '<h3 class="card-label">Flagged moments</h3>' +
    (moments.length
      ? moments.map((m) => `<div class="moment ${m.tone}"><span class="ts">${mmss(m.atS)}</span><span>${esc(m.text)}</span></div>`).join('')
      : '<p class="dim">Nothing notable flagged this game.</p>');
  el.reviewCard.appendChild(momentsCard);

  const prefRow = document.createElement('label');
  prefRow.className = 'toggle-row review-pref';
  prefRow.innerHTML = `<input type="checkbox" ${State.teaching ? 'checked' : ''}><span>Teaching mode &mdash; explain terms as it goes</span>`;
  prefRow.querySelector('input').addEventListener('change', (e) => {
    State.teaching = e.target.checked;
    Store.set('teaching', State.teaching);
    el.teachingToggle.checked = State.teaching;
    renderReview({ entry, profile }, others);
  });
  el.reviewCard.appendChild(prefRow);
}

boot();
