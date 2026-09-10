/* Vantage — glue: input -> account_id -> match history -> per-match /metadata ->
   analyze -> render. v0+ scope (see README "What does done look like?"). */

const FETCH_CONCURRENCY = 4; // parallel /metadata requests — polite to deadlock-api.com's rate limit

const form = document.getElementById('lookup-form');
const input = document.getElementById('steam-input');
const windowInput = document.getElementById('window-input');
const teachingToggle = document.getElementById('teaching-toggle');
const statusEl = document.getElementById('status');
const landingView = document.getElementById('landing');
const reviewView = document.getElementById('review');
const reviewCard = document.getElementById('review-card');
const backBtn = document.getElementById('back-btn');

backBtn.addEventListener('click', () => {
  reviewView.hidden = true;
  landingView.hidden = false;
  statusEl.textContent = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = input.value;
  const accountId = toAccountId(raw);
  if (accountId === null) {
    setStatus('Enter a numeric SteamID64 or account id.', true);
    return;
  }
  const windowSize = clampWindow(Number(windowInput.value));
  windowInput.value = windowSize;
  const teaching = teachingToggle.checked;

  form.querySelector('button').disabled = true;
  try {
    await runReview(accountId, windowSize, teaching);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't load that match: ${err.message}`, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

function clampWindow(n) {
  if (!Number.isFinite(n)) return 20;
  return Math.min(30, Math.max(15, Math.round(n)));
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

/** Runs `tasks` (functions returning promises) with at most `limit` in flight at once,
    calling `onProgress(doneCount, total)` after each settles. */
async function runWithConcurrency(tasks, limit, onProgress) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let done = 0;

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
      done++;
      onProgress?.(done, tasks.length);
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function runReview(accountId, windowSize, teaching) {
  setStatus('Fetching match history...');
  const history = await getMatchHistory(accountId);
  if (!history.length) throw new Error('no matches found for that account');

  // Bounded recent-games memory: never diff against a player's entire history,
  // only their last `windowSize` games (15-30). See queue.js.
  const queue = buildRecentGamesQueue(history, windowSize);
  const currentEntry = queue.mostRecent;
  const baselineEntries = queue.rest;

  setStatus(`Loading match details (0 of ${queue.size})...`);
  const tasks = [currentEntry, ...baselineEntries].map((entry) => async () => {
    const meta = await getMatchMetadata(entry.match_id);
    return extractProfile(meta, accountId);
  });
  const profiles = await runWithConcurrency(tasks, FETCH_CONCURRENCY, (done, total) =>
    setStatus(`Loading match details (${done} of ${total})...`)
  );

  const currentProfile = profiles[0];
  if (!currentProfile) throw new Error('could not read your data from that match');
  const baselineProfiles = profiles.slice(1).filter((p) => p !== null);

  setStatus('Loading hero info...');
  let heroName = `Hero ${currentProfile.heroId}`;
  try {
    const heroes = await getHeroes();
    const hero = heroes.find((h) => h.id === currentProfile.heroId);
    if (hero?.name) heroName = hero.name;
  } catch (err) {
    console.warn('hero lookup failed', err);
  }

  const baseline = rollingBaseline(baselineProfiles, baselineEntries.length);
  const comparison = baselineProfiles.length ? compareToBaseline(currentProfile, baseline) : [];
  const itemsBaseline = baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null;
  const moments = buildFlaggedMoments(currentProfile, itemsBaseline, teaching);
  const quest = baselineProfiles.length
    ? buildQuest(comparison, teaching)
    : {
        text: teaching
          ? "Not enough recent match history yet to compare against a baseline — play a few more games and this'll fill in."
          : 'Not enough recent match history yet to compare against a baseline.',
        tone: 'neutral'
      };

  renderReview({ currentProfile, baselineProfiles, comparison, moments, quest, heroName, windowSize });
  landingView.hidden = true;
  reviewView.hidden = false;
}

function mmss(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderReview({ currentProfile, baselineProfiles, moments, quest, heroName, windowSize }) {
  reviewCard.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'card match-header fade-in';
  header.innerHTML = `
    <h2>${heroName} &mdash; <span class="${currentProfile.win ? 'result-win' : 'result-loss'}">${currentProfile.win ? 'Win' : 'Loss'}</span></h2>
    <span class="duration">${mmss(currentProfile.durationS)}</span>
  `;
  reviewCard.appendChild(header);

  // Economy curve
  const chartCard = document.createElement('div');
  chartCard.className = 'card chart-wrap fade-in';
  chartCard.style.animationDelay = '60ms';
  chartCard.innerHTML = `<canvas></canvas><p class="chart-caption">vs. your last ${baselineProfiles.length} game${baselineProfiles.length === 1 ? '' : 's'} (of a ${windowSize}-game window)</p>`;
  reviewCard.appendChild(chartCard);
  const maxMinute = Math.round(currentProfile.durationS / 60);
  const thisSeries = resampleToMinutes(currentProfile.mySoulsSeries, maxMinute);
  const baselineSeries = baselineProfiles.length ? averageSoulsCurve(baselineProfiles, maxMinute) : [];
  requestAnimationFrame(() => {
    drawEconomyCurve(chartCard.querySelector('canvas'), thisSeries, baselineSeries);
  });

  // Flagged moments
  const momentsCard = document.createElement('div');
  momentsCard.className = 'card fade-in';
  momentsCard.style.animationDelay = '120ms';
  momentsCard.innerHTML =
    '<h3 class="card-label">Flagged moments</h3>' +
    (moments.length
      ? moments.map((m) => `<div class="moment ${m.tone}"><span class="ts">${mmss(m.atS)}</span><span>${m.text}</span></div>`).join('')
      : '<p class="dim">Nothing notable flagged this game.</p>');
  reviewCard.appendChild(momentsCard);

  // Quest
  const questCard = document.createElement('div');
  questCard.className = 'card quest-card fade-in';
  questCard.style.animationDelay = '180ms';
  questCard.innerHTML = `<h3>Try this next game</h3><p>${quest.text}</p>`;
  reviewCard.appendChild(questCard);
}
