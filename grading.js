/* Personal form is a transparent relative-statistics rubric, never a rank estimate. */
const FORM_METRICS = [
  { key: 'deathsBy10', label: 'Deaths by 10 minutes', direction: -1, minSeconds: 600, fmt: (v) => v.toFixed(0) },
  { key: 'soulsVsLobby10', label: 'Souls vs lobby at 10 minutes', direction: 1, minSeconds: 600, fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v)).toLocaleString('en-US')}` },
  { key: 'csPct12', label: 'Last-hit efficiency at 12 minutes', direction: 1, minSeconds: 720, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'kda', label: 'KDA', direction: 1, minSeconds: 0, fmt: (v) => v.toFixed(2) }
];

function formLetter(score) {
  return [[90, 'S'], [75, 'A'], [60, 'B'], [40, 'C'], [25, 'D'], [10, 'E'], [0, 'F']].find(([min]) => score >= min)?.[1] ?? null;
}

function formValue(profile, def) {
  const v = profile[def.key];
  return Number.isFinite(v) && !(Number.isFinite(profile.durationS) && profile.durationS < def.minSeconds) ? v : null;
}

/** Profiles may span modes; only the subject's mode is a valid comparison baseline. */
function gradePersonalForm(subject, profiles) {
  const pool = [...new Map(profiles.filter((p) => p.matchId !== subject.matchId && !p.isBot && !p.notScored &&
      (subject.matchMode == null || p.matchMode === subject.matchMode))
    .sort((a, b) => b.startTime - a.startTime).map((p) => [p.matchId, p])).values()].slice(0, 9);
  const metrics = FORM_METRICS.map((def) => {
    const value = formValue(subject, def);
    const vs = pool.map((p) => formValue(p, def)).filter((v) => v !== null);
    const reason = value === null ? 'This match has no usable measurement.' : vs.length < 5 ? `Needs 5 comparison games; ${vs.length} available.` : null;
    const score = reason ? null : 100 * vs.reduce((sum, v) => sum + (value === v ? 0.5 : (value - v) * def.direction > 0 ? 1 : 0), 0) / vs.length;
    return { key: def.key, label: def.label, value, median: vs.length ? median(vs) : null, n: vs.length, score, reason };
  });
  const eligible = metrics.filter((m) => m.score !== null);
  const score = eligible.length >= 3 ? mean(eligible.map((m) => m.score)) : null;
  return { letter: score === null ? null : formLetter(score), score, n: pool.length, metrics,
    reason: score === null ? `Insufficient data: ${eligible.length} of 4 metrics eligible; at least 3 need 5 comparison games each.` : null };
}

/** Step-held observations only inside a match's recorded coverage. No synthetic zero or tail. */
function economyObservation(profile, seconds) {
  const series = (profile.mySoulsSeries ?? []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.souls)).sort((a, b) => a.t - b.t);
  if (!series.length || seconds < series[0].t || seconds > Math.min(profile.durationS, series.at(-1).t)) return null;
  const point = series.findLast((p) => p.t <= seconds);
  return point ? { value: point.souls, observedAt: point.t } : null;
}

function economyAt(subject, others, seconds) {
  const observations = others.filter((p) => p.matchId !== subject.matchId).map((p) => economyObservation(p, seconds)).filter(Boolean);
  return { seconds, own: economyObservation(subject, seconds), baseline: observations.length ? mean(observations.map((p) => p.value)) : null, n: observations.length };
}
