/* Vantage — glue: input -> account_id -> synced recent-games queue -> analyze
   -> render. See history.js/store.js for the "store, don't re-poll live"
   caching layer and queue.js for the hard-capped 20-game window. */

const form = document.getElementById('lookup-form');
const input = document.getElementById('steam-input');
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
  const teaching = teachingToggle.checked;

  form.querySelector('button').disabled = true;
  try {
    await runReview(accountId, teaching);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't load that match: ${err.message}`, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

async function runReview(accountId, teaching) {
  setStatus('Checking for new matches...');
  const items = await syncMatchHistory(accountId, (done, totalNew) => {
    setStatus(totalNew === 0 ? 'Up to date — no new matches since last visit.' : `Loading ${done} of ${totalNew} new match${totalNew === 1 ? '' : 'es'}...`);
  });

  const currentProfile = items[0]?.profile;
  if (!currentProfile) throw new Error('could not read your data from that match');
  const baselineProfiles = items.slice(1).map((it) => it.profile);

  setStatus('Loading hero info...');
  let heroName = `Hero ${currentProfile.heroId}`;
  try {
    const heroes = await getHeroes();
    const hero = heroes.find((h) => h.id === currentProfile.heroId);
    if (hero?.name) heroName = hero.name;
  } catch (err) {
    console.warn('hero lookup failed', err);
  }

  const baseline = rollingBaseline(baselineProfiles, baselineProfiles.length);
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

  renderReview({ currentProfile, baselineProfiles, comparison, moments, quest, heroName });
  landingView.hidden = true;
  reviewView.hidden = false;
}

function mmss(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderReview({ currentProfile, baselineProfiles, moments, quest, heroName }) {
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
  chartCard.innerHTML = `<canvas></canvas><p class="chart-caption">vs. your last ${baselineProfiles.length} game${baselineProfiles.length === 1 ? '' : 's'} (of a 20-game window)</p>`;
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
