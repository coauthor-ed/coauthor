/**
 * SimChartCanvas - the canvas renderer for the chart-frame spec
 * (SimChartSpec.js: chartFrame, niceTicks). Same frame, scales and ticks as the
 * SVG renderer in SimChart.js. Tick numerals are at least MIN_PX (14); when
 * labels would touch, the denser ones are dropped, never overprinted. Animation
 * is a 0..1 progress you pass in (the scene owns the clock).
 *
 *   const f = chartFrame({ rect, x: { min, max, ticks, label, cats, fmt }, y: { ... } });
 *   axesCanvas(ctx, c, f, { grid, panel, right })      right: { min, max, ticks, label, fmt, tone } second y axis
 *   barsCanvas(ctx, c, f, bars, { grow: 0..1, labels, width, fmt })   bars [{ x, v | vs, tone, tones, text }]
 *   traceCanvas(ctx, c, f, pts, { tone, target, targetText, end, draw: 0..1, width })
 *   rightScale(f, right) -> { py(v) }                  map a right-axis value to y
 * Tones: series numbers 1..8 or 'accent' | 'good' | 'bad' | 'warning' | 'label'. ASCII only.
 */
import { MIN_PX, font, pill, darken, alpha, rr } from './SimLook.js';
import { fmtNum } from './SimText.js';
import { toneColor } from './SimNumberLineCanvas.js';
import { niceTicks } from './SimChartSpec.js';
import { lookOf } from './lookProfile.js';

const num = (v) => fmtNum(v, { dp: Math.abs(v) < 1 && v !== 0 ? 2 : 0 });
const SIZE = 15;

/** Map a right-axis value onto the frame's y pixels. */
export function rightScale(f, r) {
  const p = f.plot;
  return { py: (v) => p.y + p.h - ((v - r.min) / (r.max - r.min)) * p.h, ticks: r.ticks ?? niceTicks(r.min, r.max) };
}

/** Panel card, grid, tick labels, baseline, axis titles, optional right axis. @opts panel, grid, right */
export function axesCanvas(ctx, c, f, o = {}) {
  const p = f.plot, r = f.rect, size = Math.max(MIN_PX, SIZE), L = lookOf();
  ctx.save();
  if (o.panel !== false) {
    if (L.lip) { rr(ctx, r.x, r.y + 5 * L.lip, r.w, r.h, 14); ctx.fillStyle = darken(c.bgSurface, 0.35); ctx.fill(); }
    rr(ctx, r.x, r.y, r.w, r.h, 14); ctx.fillStyle = c.bgSurface; ctx.fill();
    ctx.lineWidth = 2.5 * L.rim; ctx.strokeStyle = c.stroke; ctx.stroke();
  }
  const fy = f.y.fmt ?? num, fx = f.x.fmt ?? num;
  ctx.font = font(c, 700, size);
  // y labels: drop any that would touch the one above
  let lastY = Infinity;
  for (const v of [...f.yticks].sort((a, b) => b - a)) {
    const y = f.py(v);
    if (o.grid !== false) { ctx.fillStyle = alpha(c.stroke, 0.35); ctx.fillRect(p.x, y - 1, p.w, 2); }
    if (Math.abs(lastY - y) < size + 4) continue;
    lastY = y;
    ctx.fillStyle = c.labelMuted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fy(v), p.x - 10, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let lastRight = -Infinity;
  const xlabel = (txt, x, col) => {
    const w = ctx.measureText(txt).width;
    if (x - w / 2 < lastRight + 6) return;
    lastRight = x + w / 2;
    ctx.fillStyle = col; ctx.fillText(txt, x, p.y + p.h + 24);
  };
  if (f.x.cats) f.x.cats.forEach((cat, i) => xlabel(String(cat), f.px(i), c.label));
  else for (const v of f.xticks) {
    const x = f.px(v);
    if (o.grid !== false) { ctx.fillStyle = alpha(c.stroke, 0.25); ctx.fillRect(x - 1, p.y, 2, p.h); }
    xlabel(fx(v), x, c.labelMuted);
  }
  ctx.fillStyle = c.label;
  rr(ctx, p.x - 2, p.y + p.h - 2 * L.rim, p.w + 4, 5 * L.rim, 2.5 * L.rim); ctx.fill();
  if (o.right) {
    const rs = rightScale(f, o.right), rf = o.right.fmt ?? num, col = o.right.tone ? toneColor(c, o.right.tone) : c.labelMuted;
    ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let ly = Infinity;
    for (const v of [...rs.ticks].sort((a, b) => b - a)) {
      const y = rs.py(v);
      if (Math.abs(ly - y) < size + 4) continue;
      ly = y;
      ctx.fillText(rf(v), p.x + p.w + 8, y);
    }
    if (o.right.label) {
      ctx.save(); ctx.translate(r.x + r.w - 6, p.y + p.h / 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(o.right.label, 0, 0); ctx.restore();
    }
  }
  ctx.fillStyle = c.label; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (f.x.label) ctx.fillText(f.x.label, p.x + p.w / 2, r.y + r.h - 10);
  if (f.y.label) {
    ctx.save(); ctx.translate(r.x + 22, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(f.y.label, 0, 0); ctx.restore();
  }
  ctx.restore();
}

/** Bars from 0 (stacked when vs: [...]); grow 0..1 staggers them in. @opts grow, labels, width, fmt */
export function barsCanvas(ctx, c, f, bars, o = {}) {
  const fmt = o.fmt ?? ((v) => fmtNum(v));
  const base = f.py(Math.max(f.y.min, 0)), grow = o.grow ?? 1, L = lookOf();
  bars.forEach((b, i) => {
    const k = Math.max(0, Math.min(1, grow * (1 + bars.length * 0.08) - i * 0.08));
    const band = f.x.cats ? f.band(b.x) : { x: f.px(b.x) - 20, w: 40 };
    const w = band.w * (o.width ?? 0.62), x = band.x + (band.w - w) / 2;
    let top = base;
    (b.vs ?? [b.v]).forEach((v, j) => {
      const h = (base - f.py(v)) * k;
      if (h > 0.5) {
        const col = toneColor(c, b.tones?.[j] ?? b.tone ?? 1), r = Math.min(10 * L.radius, w / 2, h);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top); ctx.lineTo(x, top - h + r); ctx.quadraticCurveTo(x, top - h, x + r, top - h);
        ctx.lineTo(x + w - r, top - h); ctx.quadraticCurveTo(x + w, top - h, x + w, top - h + r); ctx.lineTo(x + w, top); ctx.closePath();
        ctx.fillStyle = L.lip ? darken(col, 0.28) : col; ctx.fill();
        if (L.lip) { ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x, top - h, w - Math.max(4, w * 0.16), h); }
        ctx.restore();
      }
      top -= h;
    });
    if (o.labels !== false && k >= 1) {
      const total = (b.vs ?? [b.v]).reduce((s, v) => s + v, 0);
      pill(ctx, c, b.text ?? fmt(total), x + w / 2, top - 18, { bg: toneColor(c, b.tone ?? 1), size: MIN_PX });
    }
  });
}

/** A line through pts; draw 0..1 reveals it left to right. @opts tone, width, target, targetText, targetBelow, end, draw */
export function traceCanvas(ctx, c, f, pts, o = {}) {
  const col = toneColor(c, o.tone ?? 1), p = f.plot, w = o.width ?? 6;
  ctx.save();
  if (o.target != null) {
    const y = f.py(o.target);
    ctx.strokeStyle = c.warning; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke(); ctx.setLineDash([]);
  }
  if (pts.length) {
    const k = Math.max(0, Math.min(1, o.draw ?? 1)), n = (pts.length - 1) * k, last = Math.floor(n);
    const path = [];
    for (let i = 0; i <= last && i < pts.length; i++) path.push([f.px(pts[i].x), f.py(pts[i].y)]);
    if (last < pts.length - 1 && n > last) {
      const a = pts[last], b = pts[last + 1], t = n - last;
      path.push([f.px(a.x + (b.x - a.x) * t), f.py(a.y + (b.y - a.y) * t)]);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w;
    const lip = lookOf().lip;
    for (const [dy, stroke] of lip ? [[3 * lip, darken(col, 0.3)], [0, col]] : [[0, col]]) {
      ctx.strokeStyle = stroke; ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
      ctx.stroke();
    }
    if (o.end !== false && k >= 1) {
      const [x, y] = path[path.length - 1];
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = alpha(col, 0.25); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = c.bgSurface; ctx.stroke();
    }
  }
  ctx.restore();
  // the target's label last, so the line never runs over it
  if (o.target != null && o.targetText) pill(ctx, c, o.targetText, p.x + p.w - 8, f.py(o.target) + (o.targetBelow ? 22 : -22), { bg: c.warning, size: MIN_PX, align: 'right' });
}
