/* Shared presentation: the same automatic evidence on the dashboard and in review. */
function teachingHtml(teaching) {
  return `<label class="toggle-row"><input type="checkbox" data-teaching ${teaching ? 'checked' : ''}>Teaching mode — explain terms</label>`;
}

function gradeHtml(grade, expanded = false) {
  const format = (m, v) => v === null ? 'Unavailable' : FORM_METRICS.find((d) => d.key === m.key).fmt(v);
  return `<div class="form-grade"><span class="grade-letter ${grade.letter ? '' : 'no-grade'}">${grade.letter ?? '—'}</span>
    <div><h3>${grade.letter ? 'Personal form' : 'Insufficient data'}</h3><p class="fact">Personal form · compared with your other ${grade.n} ranked games</p></div></div>
    ${grade.reason ? `<p class="fact">${esc(grade.reason)}</p>` : ''}
    ${expanded ? `<details class="grade-breakdown"><summary>How this grade is calculated</summary>
    <p class="fact">Each usable metric has equal weight. A comparison game you outperformed counts as 1, a tie as ½. The average percentage determines the letter; match result and goal completion have no effect.</p>
    <div class="rubric">S ≥90 · A ≥75 · B ≥60 · C ≥40 · D ≥25 · E ≥10 · F &lt;10</div>
    ${grade.score === null ? '' : `<p class="fact">Combined score: ${grade.score.toFixed(1)} / 100 (${grade.metrics.filter((m) => m.score !== null).length} eligible metrics).</p>`}
    <div class="metric-evidence">${grade.metrics.map((m) => `<div><strong>${esc(m.label)}</strong><span>This game: ${esc(format(m, m.value))}</span><span>Comparison median: ${esc(format(m, m.median))} · ${m.n} games</span><span>${m.reason ? esc(m.reason) : `Contribution: ${m.score.toFixed(1)} / 100`}</span></div>`).join('')}</div>
    <p class="fact">At least three metrics need five comparison games each. These selected statistics compare your recent play across heroes; they do not measure rank or every decision. Grades recalculate when your 10-game window changes.</p></details>` : ''}`;
}

function goalEvidenceHtml(result, teaching = false) {
  if (result.status === 'none') return '<p class="fact">No session goal</p>';
  if (result.status === 'unavailable') return '<p class="fact">Historical goal unavailable — the saved session cannot be reliably linked to a target.</p>';
  const verdict = result.hit === null ? 'Unmeasurable' : result.hit ? 'Goal hit' : 'Goal missed';
  const def = SEPARATOR_METRICS.find((d) => d.key === result.goal.metric);
  const fmt = (v) => Number.isFinite(v) ? (def?.fmt(v) ?? String(v)) : 'Unavailable';
  return `<div class="goal-evidence"><strong class="${result.hit === null ? '' : result.hit ? 'up' : 'down'}">${verdict}</strong>
    <p class="fact">${esc(result.goal.label)}</p>
    ${result.status === 'legacy' ? '<p class="faint">Saved historical verdict. The original measured value and target are unavailable.</p>' : `<p class="fact">Measured: <strong>${esc(fmt(result.value))}</strong> · Target: <strong>${esc(result.goal.op)} ${esc(fmt(result.goal.threshold))}</strong></p>`}
    ${result.hit === null ? '<p class="faint">The match was too short or the required measurement was unavailable. It does not count as a miss.</p>' : ''}
    ${teaching ? '<p class="faint">The goal verdict checks the target you committed to before this match. It is separate from winning and from your personal-form letter.</p>' : ''}</div>`;
}

function reflectionHtml(matchId, coaching) {
  const reflection = reflectionFor(coaching, matchId);
  return `<section class="reflection" data-reflection="${matchId}"><h3 class="card-label">Your reflection · optional</h3>
    <div class="chips">${REFLECTION_TAGS.map((tag) => `<button class="chip ${reflection.tags.includes(tag) ? 'on' : ''}" data-tag="${tag}" aria-pressed="${reflection.tags.includes(tag)}">${tag}</button>`).join('')}</div>
    <label for="note-${matchId}">What did you notice?</label>
    <textarea id="note-${matchId}" maxlength="200" rows="3" data-note placeholder="One thing to remember next game…">${esc(reflection.note)}</textarea>
    <span class="faint">Saved on this device as you type · 200 characters maximum</span></section>`;
}

function coachingCardHtml(model, state) {
  const c = state.coaching;
  const active = c.active;
  const latest = state.items.find((it) => matchGoalResult(it, c).status !== 'none');
  const learned = c.learned.length ? `<p class="fact">Learned goals: ${c.learned.map((g) => esc(g.label)).join(' · ')}</p>` : '';
  const slipping = slippingGoals(c.learned, state.items);
  const regression = slipping.length ? `<ul class="slipping">${slipping.map(({ goal, progress }) => `<li>${esc(goal.label)}: hit ${progress.recentHits} of ${progress.recentMeasured} recent measured games since learning.</li>`).join('')}</ul>` : '';
  const latestHtml = latest ? `<div class="latest-verdict"><h4>Latest session result · ${esc(heroName(latest.entry.hero_id))}</h4>${goalEvidenceHtml(matchGoalResult(latest, c), state.teaching)}<button class="link-btn accent" data-action="review" data-match-id="${latest.entry.match_id}">Review evidence →</button></div>` : '';
  const progress = active ? committedProgress(active, state.items, c) : null;
  return `<section class="card goal-card"><div class="card-head"><h2 class="card-label accent">${active ? 'Your focus' : 'Choose your next focus'}</h2><span class="faint">One goal. Automatic feedback.</span></div>
    ${active ? `<p class="goal-title">${esc(active.label)}</p><p class="fact">Hit ${progress.hits} of ${progress.measured} measured, committed games in this window. Learned at 8 of 10.</p>
    <div class="actions"><button class="btn-primary" data-action="${model.openSession ? 'end-session' : 'start-session'}">${model.openSession ? 'End session' : 'Start session'}</button><button class="btn-ghost" data-action="change-goal">Change goal</button></div>
    <p class="faint">${model.openSession ? 'Session running. Refresh after a match to see its result.' : 'Start a session before you queue to commit this target.'}</p>` : `<p class="lede">Commit before you queue. Vantage checks the result after each ranked match.</p><div class="suggestions">${model.suggestions.map((g, i) => `<div class="suggestion"><div><span class="goal-label">${esc(g.label)}</span><span class="faint">${g.source === 'wins' ? `Based on ${g.nWins} wins in this window` : 'Starting target · not enough separating evidence yet'}</span></div><button class="btn-primary" data-action="adopt" data-index="${i}">Start session</button></div>`).join('') || '<p class="fact">You have learned the available suggested goals. Their recent results are still checked below.</p>'}</div>`}
    ${latestHtml}${learned}${regression}<p class="faint">${model.withoutSession.without} of your last ${model.withoutSession.total} ranked games had no recorded session goal.</p></section>`;
}

function matchWindowHtml(state) {
  if (!state.items.length) return '<section class="card"><h2>No ranked reviews available yet</h2><p class="fact">Refresh to retry missing match data. Up to 10 ranked games will appear here.</p></section>';
  const selected = state.items.find((it) => it.entry.match_id === state.selectedMatchId) ?? state.items[0];
  const profiles = state.items.map((it) => it.profile);
  const wins = profiles.filter((p) => p.win).length;
  const tiles = [...state.items].reverse().map((it) => {
    const grade = gradePersonalForm(it.profile, profiles);
    const hero = heroName(it.entry.hero_id);
    const icon = heroIcon(it.entry.hero_id);
    const sel = it.entry.match_id === selected.entry.match_id;
    const result = it.profile.win ? 'Win' : 'Loss';
    return `<button class="match-tile ${sel ? 'selected' : ''}" data-action="select" data-match-id="${it.entry.match_id}" aria-pressed="${sel}" aria-label="${esc(hero)}, ${result}, ${grade.letter ? `personal form ${grade.letter}` : 'insufficient data'}, ${esc(relativeTime(it.entry.start_time))}">${icon ? `<img src="${esc(icon)}" alt="">` : ''}<strong>${grade.letter ?? '—'}</strong><span class="tile-hero">${esc(hero)}</span><span class="${it.profile.win ? 'up' : 'down'}">${result}</span></button>`;
  }).join('');
  const { entry, profile } = selected;
  const others = profiles.filter((p) => p.matchId !== profile.matchId);
  const baseline = rollingBaseline(others, others.length);
  const moments = buildFlaggedMoments(profile, baseline.metrics.itemsBy10?.n ? baseline.metrics.itemsBy10.median : null, state.teaching).slice(0, 2);
  return `<section class="card window-card"><div class="card-head"><h2 class="card-label">Your last ${state.items.length} ranked games</h2><span class="faint">${wins} wins · ${state.items.length - wins} losses</span></div><p class="faint">Oldest → newest · select a match</p><div class="match-tiles">${tiles}</div>
    <div class="detail"><div><div class="detail-hero"><div><h3 class="detail-name">${esc(heroName(entry.hero_id))}</h3><span>${profile.win ? 'Win' : 'Loss'} · ${duration(profile.durationS)} · ${relativeTime(entry.start_time)}</span></div></div>${gradeHtml(gradePersonalForm(profile, profiles))}${goalEvidenceHtml(matchGoalResult(selected, state.coaching), state.teaching)}</div>
    <div><h3 class="card-label">What the data shows</h3>${moments.map((m) => `<p class="fact">${esc(m.text)}</p>`).join('') || '<p class="fact">No notable moments flagged for this match.</p>'}<button class="btn-primary" data-action="review" data-match-id="${entry.match_id}">Full review →</button></div></div></section>`;
}

function renderExperience(container, state) {
  const nowS = Date.now() / 1000;
  const sep = separators(state.items.map((it) => it.profile));
  const learnedMetrics = new Set(state.coaching.learned.map((g) => g.metric));
  const model = { sep, split: splitRecord(state.items.map((it) => it.profile), (p) => p.soulsVsLobby10, 0),
    suggestions: suggestGoals(sep, Date.now(), 8).filter((g) => !learnedMetrics.has(g.metric)).slice(0, 3),
    openSession: state.coaching.sessions.at(-1)?.endedAt === null ? state.coaching.sessions.at(-1) : null,
    withoutSession: { total: state.items.length, without: state.items.filter((it) => ['none', 'unavailable'].includes(matchGoalResult(it, state.coaching).status)).length },
    lastSession: buildSessions(state.recent)[0] ?? null, load: loadFacts(state.recent, nowS), trend: rankTrendFacts(state.mmr, nowS) };
  const oldest = state.recent.length ? Math.min(...state.recent.map((e) => e.start_time)) : nowS;
  container.innerHTML = identityHtml(state.accountId, state.steam, state.mmr) +
    `<div class="dashboard-controls">${teachingHtml(state.teaching)}<button class="btn-ghost" data-action="refresh" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Refreshing…' : 'Refresh'}</button><span class="faint">${state.syncedAt ? `Last synced ${esc(new Date(state.syncedAt).toLocaleString())}` : 'Not synced yet'}</span></div>` +
    coachingCardHtml(model, state) + matchWindowHtml(state) + recentlyHtml(model, nowS) +
    (oldest > nowS - 7 * 86400 ? '<p class="coverage-note faint">Activity totals use the available recent history (up to 100 entries). It does not cover the full seven days; session boundaries and totals may be incomplete.</p>' : '') + separatorsHtml(model);
  return model;
}
