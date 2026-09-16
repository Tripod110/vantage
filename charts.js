/* Vantage — canvas-based economy curve chart. No charting library, matching
   peak's charts.js convention (custom canvas draw, no dependency). */

/** Draws two overlaid lines (this match vs. baseline average) onto a canvas element.
    seriesA/seriesB: arrays of numbers (souls), one point per minute, same length. */
function drawEconomyCurve(canvas, seriesA, seriesB, labelA = 'This match', labelB = 'Other games', selectedIndex = null) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 16, right: 16, bottom: 24, left: 48 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const all = [...seriesA, ...seriesB].filter(Number.isFinite);
  const maxV = Math.max(1, ...all);
  const minV = Math.min(0, ...all);
  const n = Math.max(seriesA.length, seriesB.length, 2);

  const x = (i) => pad.left + (i / (n - 1)) * plotW;
  const y = (v) => pad.top + plotH - ((v - minV) / (maxV - minV || 1)) * plotH;

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(Math.round(maxV).toLocaleString(), 2, pad.top + 8);
  ctx.fillText('0', 2, pad.top + plotH);

  function drawLine(series, color) {
    if (series.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let connected = false;
    series.forEach((v, i) => {
      if (!Number.isFinite(v)) { connected = false; return; }
      const px = x(i);
      const py = y(v);
      if (!connected) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      connected = true;
    });
    ctx.stroke();
  }

  drawLine(seriesB, 'rgba(255,255,255,0.35)'); // baseline, dimmer
  drawLine(seriesA, '#f0a020'); // this match, accent
  if (selectedIndex !== null) {
    ctx.strokeStyle = 'rgba(240,160,32,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(selectedIndex), pad.top); ctx.lineTo(x(selectedIndex), pad.top + plotH); ctx.stroke();
  }

  // Legend
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#f0a020';
  ctx.fillRect(pad.left, 2, 10, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(labelA, pad.left + 14, 11);
  const w1 = ctx.measureText(labelA).width;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(pad.left + 14 + w1 + 12, 2, 10, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(labelB, pad.left + 14 + w1 + 12 + 14, 11);
}

/** Pointer chart plus a native range slider for keyboard and screen-reader inspection. */
function mountEconomyInspector(card, subject, others) {
  const canvas = card.querySelector('canvas');
  const slider = card.querySelector('input[type="range"]');
  const output = card.querySelector('output');
  const maxSeconds = Math.floor(subject.durationS);
  const samples = Array.from({ length: maxSeconds + 1 }, (_, seconds) => economyAt(subject, others, seconds));
  const own = samples.map((p) => p.own?.value ?? null);
  const baseline = samples.map((p) => p.baseline);
  let selected = 0;
  let destroyed = false;
  function draw() {
    if (!destroyed) drawEconomyCurve(canvas, own, baseline, 'This match', 'Other games', selected);
  }
  function select(seconds) {
    selected = Math.max(0, Math.min(maxSeconds, Math.round(seconds)));
    slider.value = selected;
    const point = samples[selected];
    const ownText = point.own ? `${Math.round(point.own.value).toLocaleString()} Souls (snapshot ${duration(point.own.observedAt)})` : 'unavailable';
    const baseText = point.n ? `${Math.round(point.baseline).toLocaleString()} Souls from ${point.n} other games` : 'unavailable (0 other games)';
    output.textContent = `${duration(selected)} · This match: ${ownText}. Comparison: ${baseText}.`;
    slider.setAttribute('aria-valuetext', output.textContent);
    draw();
  }
  const onInput = () => select(Number(slider.value));
  const onPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    select((event.clientX - rect.left - 48) / Math.max(1, rect.width - 64) * maxSeconds);
  };
  slider.addEventListener('input', onInput);
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointermove', onPointer);
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  select(0);
  return { select, destroy() { destroyed = true; observer.disconnect(); slider.removeEventListener('input', onInput); canvas.removeEventListener('pointerdown', onPointer); canvas.removeEventListener('pointermove', onPointer); } };
}
