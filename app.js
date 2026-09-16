/* Shell: cache-first ranked window, versioned commitments, and shared automatic evidence. */
const State = { accountId: null, items: [], recent: [], steam: null, mmr: [], selectedMatchId: null,
  teaching: Store.get('teaching', false), coaching: migrateCoaching(), lastModel: null, syncedAt: null,
  view: 'landing', loading: false, request: 0, chart: null };
const el = { tabs: document.getElementById('tabs'), landing: document.getElementById('landing'), dashboard: document.getElementById('dashboard'),
  review: document.getElementById('review'), reviewCard: document.getElementById('review-card'), status: document.getElementById('status'),
  form: document.getElementById('lookup-form'), input: document.getElementById('steam-input'), teachingToggle: document.getElementById('teaching-toggle') };

function setStatus(text = '', error = false) {
  el.status.textContent = text;
  el.status.classList.toggle('error', error);
}

function showView(name) {
  State.view = name;
  for (const key of ['landing', 'dashboard', 'review']) el[key].hidden = key !== name;
  el.tabs.hidden = name === 'landing';
  for (const tab of el.tabs.querySelectorAll('[data-tab]')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
}

function persistCoaching() { saveCoaching(State.accountId, State.coaching); }

function normalizeState() {
  State.items = rankedWindow(State.items);
  if (!State.items.some((it) => it.entry.match_id === State.selectedMatchId)) State.selectedMatchId = State.items[0]?.entry.match_id ?? null;
  reconcileCoaching(State.coaching, State.items, Date.now(), false);
  persistCoaching();
}

function renderDashboardView() {
  normalizeState();
  State.lastModel = renderExperience(el.dashboard, State);
}

function repaint() {
  renderDashboardView();
  if (State.view === 'review' && State.selectedMatchId) renderReview();
  else if (State.accountId) showView('dashboard');
}

async function refreshAccount() {
  if (!State.accountId || State.loading) return;
  const restoreRefreshFocus = document.activeElement?.dataset.action === 'refresh';
  const accountId = State.accountId;
  const request = ++State.request;
  State.loading = true;
  renderDashboardView();
  setStatus(State.items.length ? 'Checking for new ranked games…' : 'Loading your last 10 ranked games…');
  try {
    const [sync, catalogs, identity] = await Promise.allSettled([
      syncMatchHistory(accountId, (done, total) => {
        if (request === State.request && total) setStatus(`Fetching ${done} of ${total} new match profiles…`);
      }), loadCatalogs(), loadDashboardData(accountId)
    ]);
    if (request !== State.request) return;
    const warnings = [];
    if (sync.status === 'fulfilled') {
      Object.assign(State, { items: sync.value.items, recent: sync.value.recent, syncedAt: sync.value.syncedAt });
      if (!sync.value.missing) reconcileCoaching(State.coaching, State.items, Date.now());
      if (sync.value.missing) warnings.push(`${sync.value.missing} match profiles unavailable; Refresh to retry.`);
    } else warnings.push(`Refresh failed: ${sync.reason.message}. Showing available cached games.`);
    if (identity.status === 'fulfilled') Object.assign(State, identity.value);
    else warnings.push('Steam identity unavailable.');
    if (catalogs.status === 'rejected') warnings.push('Some hero or rank assets are unavailable.');
    State.loading = false;
    saveAccountId(accountId);
    repaint();
    if (restoreRefreshFocus && document.activeElement === document.body) el.dashboard.querySelector('[data-action="refresh"]')?.focus({ preventScroll: true });
    setStatus(warnings.join(' '), warnings.length > 0);
  } catch (err) {
    if (request !== State.request) return;
    State.loading = false;
    repaint();
    setStatus(`Refresh failed: ${err.message}. Showing available cached games.`, true);
  }
}

async function openAccount(accountId) {
  State.chart?.destroy();
  ++State.request;
  const cache = loadCachedHistory(accountId);
  Object.assign(State, { accountId, coaching: loadCoaching(accountId), items: (cache?.items ?? []).filter((it) => it.profile.version === PROFILE_VERSION),
    recent: cache?.recent ?? [], syncedAt: cache?.syncedAt ?? null, selectedMatchId: null, steam: Store.get(`asset:steam:${accountId}`, null)?.value ?? null,
    mmr: [], loading: false });
  showView('dashboard');
  renderDashboardView();
  await refreshAccount();
}

function openReview(matchId) {
  if (!State.items.some((it) => it.entry.match_id === matchId)) return;
  State.selectedMatchId = matchId;
  showView('review');
  renderReview();
  el.reviewCard.querySelector('h2')?.focus();
}

function renderReview() {
  const oldNote = el.reviewCard.querySelector('[data-note]');
  const focusedNote = oldNote && document.activeElement === oldNote;
  const selection = focusedNote ? [oldNote.selectionStart, oldNote.selectionEnd] : null;
  const sameMatch = el.reviewCard.dataset.matchId === String(State.selectedMatchId);
  const oldTime = sameMatch ? Number(el.reviewCard.querySelector('#chart-time')?.value ?? 0) : 0;
  const wasExpanded = sameMatch && el.reviewCard.querySelector('details')?.open;
  State.chart?.destroy();
  const subject = State.items.find((it) => it.entry.match_id === State.selectedMatchId);
  if (!subject) return;
  const { entry, profile } = subject;
  el.reviewCard.dataset.matchId = entry.match_id;
  const others = State.items.filter((it) => it.entry.match_id !== entry.match_id).map((it) => it.profile);
  const grade = gradePersonalForm(profile, others);
  const baseline = rollingBaseline(others, others.length);
  const moments = buildFlaggedMoments(profile, baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null, State.teaching)
    .filter((m) => m.atS <= profile.durationS);
  el.reviewCard.innerHTML = `<section class="card"><div class="card-head"><h2 tabindex="-1">${esc(heroName(entry.hero_id))} · ${profile.win ? 'Win' : 'Loss'}</h2><span class="faint">${duration(profile.durationS)}</span></div>
    ${gradeHtml(grade, true)}${goalEvidenceHtml(matchGoalResult(subject, State.coaching), State.teaching)}</section>
    <section class="card chart-wrap"><h3 class="card-label">Economy through the match</h3><canvas aria-label="Economy chart. Use the time slider below to inspect values."></canvas>
    <label for="chart-time">Inspect match time</label><input id="chart-time" type="range" min="0" max="${Math.floor(profile.durationS)}" value="0" step="1">
    <output id="chart-readout" for="chart-time" aria-live="polite"></output><p class="chart-caption">This match (amber) · other games (gray). Values use the last recorded snapshot and timing is approximate. Comparison counts shrink when coverage ends.</p></section>
    <section class="card"><h3 class="card-label">Flagged moments</h3>${moments.map((m) => `<button class="moment moment-button ${m.tone}" data-at="${m.atS}"><span class="ts">${duration(m.atS)}</span><span>${esc(m.text)}</span></button>`).join('') || '<p class="fact">No notable moments flagged this game.</p>'}<p class="faint">Select a moment to inspect that time on the chart.</p></section>
    <section class="card">${comparisonTableHtml(profile, others)}</section>
    <section class="card">${reflectionHtml(entry.match_id, State.coaching)}</section>${teachingHtml(State.teaching)}`;
  const card = el.reviewCard.querySelector('.chart-wrap');
  State.chart = mountEconomyInspector(card, profile, others);
  State.chart.select(oldTime);
  if (wasExpanded) el.reviewCard.querySelector('details').open = true;
  if (focusedNote && sameMatch) {
    const note = el.reviewCard.querySelector('[data-note]');
    note.focus({ preventScroll: true }); note.setSelectionRange(...selection);
  }
}

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const accountId = toAccountId(el.input.value);
  if (accountId === null) return setStatus('Enter an account ID, SteamID64, or numeric steamcommunity.com/profiles/ link. Custom /id/ links are not supported.', true);
  await openAccount(accountId);
});

el.tabs.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  if (tab.dataset.tab === 'review') openReview(State.selectedMatchId);
  else { renderDashboardView(); showView('dashboard'); }
});

document.getElementById('back-btn').addEventListener('click', () => {
  renderDashboardView(); showView('dashboard');
  el.dashboard.querySelector('.match-tile.selected')?.focus();
});

document.getElementById('switch-account').addEventListener('click', () => {
  ++State.request;
  State.chart?.destroy();
  forgetAccount();
  Object.assign(State, { accountId: null, items: [], recent: [], selectedMatchId: null, steam: null, mmr: [], coaching: migrateCoaching(), loading: false });
  el.input.value = ''; setStatus(); showView('landing'); el.input.focus();
});

el.dashboard.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const now = Date.now();
  if (action === 'refresh') return refreshAccount();
  if (action === 'review') return openReview(Number(button.dataset.matchId));
  if (action === 'select') State.selectedMatchId = Number(button.dataset.matchId);
  else if (action === 'adopt') {
    const offered = State.lastModel.suggestions[Number(button.dataset.index)];
    if (!offered) return;
    const { evidence, ...goal } = offered;
    replaceCoachingGoal(State.coaching, goal, now);
  } else if (action === 'start-session') startCoachingSession(State.coaching, now);
  else if (action === 'end-session') endCoachingSession(State.coaching, now);
  else if (action === 'change-goal') replaceCoachingGoal(State.coaching, null, now);
  else return;
  persistCoaching();
  renderDashboardView();
  const replacement = action === 'select' ? el.dashboard.querySelector('.match-tile.selected') : el.dashboard.querySelector('.goal-card button');
  replacement?.focus({ preventScroll: true });
});

function saveReflection(row) {
  const id = row.dataset.reflection;
  if (!State.items.some((it) => String(it.entry.match_id) === id)) return;
  State.coaching.reflections[id] = { note: row.querySelector('[data-note]').value.slice(0, 200),
    tags: [...row.querySelectorAll('[data-tag][aria-pressed="true"]')].map((b) => b.dataset.tag) };
  persistCoaching();
}

el.reviewCard.addEventListener('input', (event) => {
  if (event.target.matches('[data-note]')) saveReflection(event.target.closest('[data-reflection]'));
});
el.reviewCard.addEventListener('click', (event) => {
  const tag = event.target.closest('[data-tag]');
  if (tag) {
    tag.setAttribute('aria-pressed', String(tag.getAttribute('aria-pressed') !== 'true'));
    tag.classList.toggle('on'); saveReflection(tag.closest('[data-reflection]'));
  }
  const moment = event.target.closest('[data-at]');
  if (moment) { State.chart?.select(Number(moment.dataset.at)); el.reviewCard.querySelector('#chart-time').focus({ preventScroll: true }); }
});

document.addEventListener('change', (event) => {
  if (!event.target.matches('[data-teaching], #teaching-toggle')) return;
  State.teaching = event.target.checked;
  Store.set('teaching', State.teaching); el.teachingToggle.checked = State.teaching;
  if (State.accountId) {
    repaint();
    (State.view === 'review' ? el.reviewCard : el.dashboard).querySelector('[data-teaching]')?.focus({ preventScroll: true });
  }
});

el.teachingToggle.checked = State.teaching;
const remembered = loadAccountId();
if (remembered) openAccount(remembered); else showView('landing');
