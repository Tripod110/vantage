/* Vantage — canvas-based economy curve chart. No charting library, matching
   peak's charts.js convention (custom canvas draw, no dependency). */

/** Draws two overlaid lines (this match vs. baseline average) onto a canvas element.
    seriesA/seriesB: arrays of numbers (souls), one point per minute, same length. */
function drawEconomyCurve(canvas, seriesA, seriesB, labelA = 'This match', labelB = 'Your recent average') {
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

  const all = [...seriesA, ...seriesB];
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
    series.forEach((v, i) => {
      const px = x(i);
      const py = y(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  drawLine(seriesB, 'rgba(255,255,255,0.35)'); // baseline, dimmer
  drawLine(seriesA, '#f0a020'); // this match, accent

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
