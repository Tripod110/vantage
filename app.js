/* Vantage — app shell: remembers whose page this is, keeps the synced
   20-game window in memory, and routes between the dashboard hub and a
   single-match review. Renders from the local cache first so a returning
   visit paints immediately, then syncs whatever is new on top. */

const State = {
  accountId: null,
  items: [], // { entry, profile }[], most-recent-first
  steam: null,
  mmr: [],
  selectedMatchId: null,
  teaching: false
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
  State.accountId = accountId;
  await openAccount(accountId);
}

async function openAccount(accountId) {
  // 1. Paint from cache if we have anything, so a return visit is instant.
  const cached = loadCachedHistory(accountId);
  if (cached?.items?.length) {
    State.items = cached.items;
    try {
      await loadCatalogs();
      State.steam = Store.get(`asset:steam:${accountId}`, null)?.value ?? null;
      renderDashboardView();
      showView('dashboard');
    } catch (err) {
      console.warn('cache-first paint failed', err);
    }
  } else {
    setStatus('Loading your last 20 games — this takes a moment the first time...');
  }

  // 2. Sync what's new, then repaint with fresh data.
  try {
    const [items] = await Promise.all([
      syncMatchHistory(accountId, (done, totalNew) => {
        if (totalNew > 0) setStatus(`Fetching ${done} of ${totalNew} new match${totalNew === 1 ? '' : 'es'}...`);
      }),
      loadCatalogs()
    ]);
    State.items = items;

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

function renderDashboardView() {
  renderDashboard(el.dashboard, {
    accountId: State.accountId,
    items: State.items,
    steam: State.steam,
    mmr: State.mmr
  });
}

/* ── Events ────────────────────────────────────────────────────────────── */

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const accountId = toAccountId(el.input.value);
  if (accountId === null) {
    setStatus('Enter a numeric SteamID64 or account id.', true);
    return;
  }
  State.accountId = accountId;
  State.items = [];
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
    showView('dashboard');
  }
});

el.switchAccount.addEventListener('click', () => {
  forgetAccount();
  State.accountId = null;
  State.items = [];
  State.steam = null;
  State.mmr = [];
  State.selectedMatchId = null;
  el.input.value = '';
  setStatus('');
  showView('landing');
});

el.backBtn.addEventListener('click', () => showView('dashboard'));

el.dashboard.addEventListener('click', (e) => {
  const row = e.target.closest('.match-row');
  if (!row) return;
  openReview(Number(row.dataset.matchId));
});

/* ── Review ────────────────────────────────────────────────────────────── */

function openReview(matchId) {
  if (!matchId || !State.items.length) return;
  const index = State.items.findIndex((it) => it.entry.match_id === matchId);
  if (index === -1) return;
  State.selectedMatchId = matchId;

  const subject = State.items[index];
  // Baseline is the rest of the same 20-game window — the reviewed match is
  // never compared against itself.
  const baselineProfiles = State.items.filter((_, i) => i !== index).map((it) => it.profile);

  renderReview(subject, baselineProfiles);
  showView('review');
}

function mmss(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderReview({ entry, profile }, baselineProfiles) {
  const baseline = rollingBaseline(baselineProfiles, baselineProfiles.length);
  const comparison = baselineProfiles.length ? compareToBaseline(profile, baseline) : [];
  const itemsBaseline = baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null;
  const moments = buildFlaggedMoments(profile, itemsBaseline, State.teaching);
  const quest = baselineProfiles.length
    ? buildQuest(comparison, State.teaching)
    : {
        text: State.teaching
          ? "Not enough recent match history yet to compare against a baseline — play a few more games and this'll fill in."
          : 'Not enough recent match history yet to compare against a baseline.',
        tone: 'neutral'
      };

  el.reviewCard.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'card match-header fade-in';
  const icon = heroIcon(entry.hero_id);
  header.innerHTML = `
    <div class="mh-left">
      ${icon ? `<img class="hero-icon lg" src="${icon}" alt="">` : ''}
      <h2>${heroName(entry.hero_id)} &mdash; <span class="${profile.win ? 'result-win' : 'result-loss'}">${profile.win ? 'Win' : 'Loss'}</span></h2>
    </div>
    <span class="duration">${mmss(profile.durationS)}</span>
  `;
  el.reviewCard.appendChild(header);

  const chartCard = document.createElement('div');
  chartCard.className = 'card chart-wrap fade-in';
  chartCard.style.animationDelay = '60ms';
  chartCard.innerHTML = `<canvas></canvas><p class="chart-caption">vs. your other ${baselineProfiles.length} recent game${baselineProfiles.length === 1 ? '' : 's'}</p>`;
  el.reviewCard.appendChild(chartCard);
  const maxMinute = Math.round(profile.durationS / 60);
  const thisSeries = resampleToMinutes(profile.mySoulsSeries, maxMinute);
  const baselineSeries = baselineProfiles.length ? averageSoulsCurve(baselineProfiles, maxMinute) : [];
  requestAnimationFrame(() => drawEconomyCurve(chartCard.querySelector('canvas'), thisSeries, baselineSeries));

  const momentsCard = document.createElement('div');
  momentsCard.className = 'card fade-in';
  momentsCard.style.animationDelay = '120ms';
  momentsCard.innerHTML =
    '<h3 class="card-label">Flagged moments</h3>' +
    (moments.length
      ? moments.map((m) => `<div class="moment ${m.tone}"><span class="ts">${mmss(m.atS)}</span><span>${m.text}</span></div>`).join('')
      : '<p class="dim">Nothing notable flagged this game.</p>');
  el.reviewCard.appendChild(momentsCard);

  const questCard = document.createElement('div');
  questCard.className = 'card quest-card fade-in';
  questCard.style.animationDelay = '180ms';
  questCard.innerHTML = `<h3>Try this next game</h3><p>${quest.text}</p>`;
  el.reviewCard.appendChild(questCard);

  const prefRow = document.createElement('label');
  prefRow.className = 'toggle-row review-pref';
  prefRow.innerHTML = `<input type="checkbox" ${State.teaching ? 'checked' : ''}><span>Teaching mode &mdash; explain terms as it goes</span>`;
  prefRow.querySelector('input').addEventListener('change', (e) => {
    State.teaching = e.target.checked;
    Store.set('teaching', State.teaching);
    el.teachingToggle.checked = State.teaching;
    renderReview({ entry, profile }, baselineProfiles);
  });
  el.reviewCard.appendChild(prefRow);
}

boot();
