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
