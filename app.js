/* Vantage — glue: input -> account_id -> match history -> per-match /metadata ->
   analyze -> render. v0 scope only (see README "What does done look like?"). */

const BASELINE_WINDOW = 8; // matches used for the recent-baseline, excluding the reviewed match

const form = document.getElementById('lookup-form');
const input = document.getElementById('steam-input');
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
  form.querySelector('button').disabled = true;
  try {
    await runReview(accountId);
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

async function runReview(accountId) {
  setStatus('Fetching match history...');
  const history = await getMatchHistory(accountId);
  if (!history.length) throw new Error('no matches found for that account');

  const currentEntry = history[0];
  const baselineEntries = history.slice(1, 1 + BASELINE_WINDOW);

  setStatus(`Loading match details (1 of ${1 + baselineEntries.length})...`);
  const currentMeta = await getMatchMetadata(currentEntry.match_id);
  const currentProfile = extractProfile(currentMeta, accountId);
  if (!currentProfile) throw new Error('could not read your data from that match');

  const baselineProfiles = [];
  for (let i = 0; i < baselineEntries.length; i++) {
    setStatus(`Loading match details (${i + 2} of ${1 + baselineEntries.length})...`);
    try {
      const meta = await getMatchMetadata(baselineEntries[i].match_id);
      const profile = extractProfile(meta, accountId);
      if (profile) baselineProfiles.push(profile);
    } catch (err) {
      console.warn('skipping baseline match', baselineEntries[i].match_id, err);
    }
  }

  setStatus('Loading hero info...');
  let heroName = `Hero ${currentProfile.heroId}`;
  try {
    const heroes = await getHeroes();
    const hero = heroes.find((h) => h.id === currentProfile.heroId);
    if (hero?.name) heroName = hero.name;
  } catch (err) {
    console.warn('hero lookup failed', err);
  }

  const baseline = rollingBaseline(baselineProfiles, BASELINE_WINDOW);
  const comparison = baselineProfiles.length ? compareToBaseline(currentProfile, baseline) : [];
  const itemsBaseline = baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null;
  const moments = buildFlaggedMoments(currentProfile, itemsBaseline);
  const quest = baselineProfiles.length
    ? buildQuest(comparison)
    : { text: 'Not enough recent match history yet to compare against a baseline.', tone: 'neutral' };

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
  header.className = 'card match-header';
  header.innerHTML = `
    <h2>${heroName} &mdash; <span class="${currentProfile.win ? 'result-win' : 'result-loss'}">${currentProfile.win ? 'Win' : 'Loss'}</span></h2>
    <span>${mmss(currentProfile.durationS)}</span>
  `;
  reviewCard.appendChild(header);

  // Economy curve
  const chartCard = document.createElement('div');
  chartCard.className = 'card chart-wrap';
  chartCard.innerHTML = '<canvas></canvas>';
  reviewCard.appendChild(chartCard);
  const maxMinute = Math.round(currentProfile.durationS / 60);
  const thisSeries = resampleToMinutes(currentProfile.mySoulsSeries, maxMinute);
  const baselineSeries = baselineProfiles.length ? averageSoulsCurve(baselineProfiles, maxMinute) : [];
  requestAnimationFrame(() => {
    drawEconomyCurve(chartCard.querySelector('canvas'), thisSeries, baselineSeries);
  });

  // Flagged moments
  const momentsCard = document.createElement('div');
  momentsCard.className = 'card';
  momentsCard.innerHTML =
    '<h3 style="margin-top:0;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim)">Flagged moments</h3>' +
    (moments.length
      ? moments.map((m) => `<div class="moment ${m.tone}"><span class="ts">${mmss(m.atS)}</span><span>${m.text}</span></div>`).join('')
      : '<p style="color:var(--text-dim);margin:0">Nothing notable flagged this game.</p>');
  reviewCard.appendChild(momentsCard);

  // Quest
  const questCard = document.createElement('div');
  questCard.className = 'card quest-card';
  questCard.innerHTML = `<h3>Try this next game</h3><p>${quest.text}</p>`;
  reviewCard.appendChild(questCard);
}
