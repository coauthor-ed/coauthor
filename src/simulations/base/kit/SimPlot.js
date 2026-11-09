/** SimPlot.js
 * SimPlot - the motion layer for canvas charts (recipe R17): scales, nice ticks,
 * axes that build, a line that draws itself, bars that grow from zero, and a
 * data-point callout that fires exactly when the line head passes the point.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/chart.js (MIT, (c) 2026 alchaincyf) - lin (+inv), ticks, callout stage windows, grid lag, bar lag
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/motion.js (MIT, (c) 2026 alchaincyf) - invert (via SimAnim.invertEase)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/demos/t3_finance_chart/t3_s2.js (MIT, (c) 2026 alchaincyf) - callout fired at the head-passes-point time
 *   Original code: plotFrame, lenAtX, eventTime by arc length, calloutState, axesOn, plotLine, barsOn, barEnd.
 *
 * Builds on, does not replace: SimChartSpec.chartFrame (plot rect layout) and
 * SimDrawOn (cumOf, pathLen, pointAt, subPath, drawPartial, drawDuration). The
 * static chart renderers stay in SimChartCanvas.js (canvas) and SimChart.js (SVG).
 * Note: SimChartSpec.niceTicks returns ticks INSIDE [min, max]; SimPlot.niceTicks
 * covers the range (0..87 -> 0..100) so the data never runs off the top tick.
 *
 * Pure (no canvas; safe in Node):
 *   linScale(d0, d1, r0, r1)      value -> px function f, with f.inv(px) -> value, f.domain, f.range
 *   niceStep(min, max, n = 5)      step from {1, 2, 2.5, 5, 10} x 10^k, the first >= (max - min) / n
 *   niceTicks(min, max, n = 5, o)  round ticks covering [min, max]; o.inside: only ticks inside (huashu original)
 *   plotFrame(rect, o)             chartFrame with nice covering domains and linScale px/py (with .inv)
 *   lenAtX(pts, x)                 arc length at which an x-monotone polyline reaches screen x
 *   lineDur(o)                     seconds plotLine takes (o.dur, default PLOT.line); 0 under reduced motion
 *   eventTime(pts, at, drawDur, easeFn, by)  seconds after the line starts when its head reaches pts[at]
 *                                  (at an index) or screen x (at = { x }); by 'len' (default) or 'x'
 *   CALLOUT                        the callout schedule as data (seconds, px)
 *   calloutState(age, S)           { dot, ring, line, text, done } for a callout fired `age` s ago (null before)
 *   PLOT, AXES                     line / bar / axes timings (seconds)
 *   axesDone(t), barEnd(i, n, o), barsDone(t, n, o)
 *
 * Canvas (ctx in, picture out; same t -> same pixels; colours are resolved c.* tokens):
 *   axesOn(ctx, c, f, t, o)        axis lines, then lagged grid + tick labels, then axis titles; { done }
 *   plotLine(ctx, c, pts, t, o)    the polyline drawing on (SimDrawOn) with a head dot; { head, done, d, p }
 *   barsOn(ctx, c, f, bars, t, o)  bars growing from the zero line, lagged; { tops, done }
 *   drawCallout(ctx, c, age, o)    dot springs in, ring pulses, leader draws, label fades in; { done }
 *   slopeTriangle(ctx, c, f, A, B, o)  the book's A-C-B slope triangle on a frame, legs labelled; { A, B, C, rise, run }
 *   areaUnder(ctx, c, f, pts, o)   area between a data line and the v = 0 axis; o.split: rectangle + triangle tones
 *   o.shade(col): optional darker shade (pass SimLook darken) for the lip under a line, bar or chip.
 *   This module never imports SimLook (its bare-specifier import breaks plain Node tests).
 *
 * Chart honesty (from huashu references t3_finance_chart.md, the rules of the chart grammar):
 *   - Build order: structure (axes, ticks) first, then the data, then ONE annotation.
 *   - One annotation per beat: a beat labels one thing. A second fact is a second beat.
 *   - Bars start at zero. If a value axis cannot start at zero, say so in the subtitle.
 *   - Animation changes how a value appears, never the value: no overshoot past a data
 *     point, no bar that grows past its height, no number that counts past its total.
 *   - Draw a line over a time axis by x (by: 'x') when time should read as flowing evenly,
 *     so steep parts draw fast; by arc length (the default) when the shape matters more.
 *   - Units on the axis titles; tick numbers stay round (niceTicks).
 *
 * Colours: data uses series tokens c.s1..c.s8, axes use c.label / c.labelMuted / c.stroke,
 * the one callout uses c.accent. Geometry is in our 680x520 design px: huashu's 1920-wide
 * sizes are rescaled by about 0.5-0.6 to our 14-15 px type (dot 11 -> 7, ring +34 -> +18,
 * line 5 -> 5, leader 2 -> 2.5).
 * Reduced motion: every animated helper draws its end state (no callout ring).
 */
import { ease, invertEase, laggedP, reducedMotion, spring, uiSpring } from './SimAnim.js';
import { cumOf, pathLen, pointAt, subPath, drawPartial, drawDuration } from './SimDrawOn.js';
import { chartFrame } from './SimChartSpec.js';

const TAU = Math.PI * 2;
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
/** huashu MO.quintOut. */
const quintOut = (u) => 1 - (1 - clamp01(u)) ** 5;
const fontOf = (c, w, px) => `${w} ${px}px ${c.fontBody || 'sans-serif'}`;
const fmtDefault = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

// -- Scales and ticks (pure) ----------------------------------------------------------

/** Linear scale value -> px, with .inv(px) -> value (huashu CH.lin). */
export function linScale(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  f.inv = (y) => d0 + ((y - r0) / (r1 - r0)) * (d1 - d0);
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

/** Nice step from {1, 2, 2.5, 5, 10} x 10^k: the first one >= (max - min) / n (huashu CH.ticks). */
export function niceStep(min, max, n = 5) {
  const raw = (max - min) / (n > 0 ? n : 5);
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw - 1e-12 * mag) ?? 10 * mag;
}

/**
 * Round ticks for [min, max]. Default: the ticks COVER the range (the first <= min,
 * the last >= max), so niceTicks(0, 87) is [0, 20, 40, 60, 80, 100]. o.inside: only
 * the ticks inside the range (huashu original, [0, 20, 40, 60, 80]).
 */
export function niceTicks(min, max, n = 5, o = {}) {
  if (!(max > min)) return [min];
  const step = niceStep(min, max, n);
  const a = o.inside ? Math.ceil(min / step - 1e-9) : Math.floor(min / step + 1e-9);
  const b = o.inside ? Math.floor(max / step + 1e-9) : Math.ceil(max / step - 1e-9);
  const out = [];
  for (let k = a; k <= b; k++) out.push(+(k * step).toFixed(10));
  return out;
}

/**
 * A chart frame (SimChartSpec.chartFrame layout) whose domains are widened to the
 * covering nice ticks, with linScale px/py (vx/vy are their .inv).
 * o: { x: { min, max, n, ticks, label, fmt, cats }, y: { min, max, n, ticks, label, fmt },
 *      zero (true: the y domain includes 0; always use it for bars), rightPad }
 */
export function plotFrame(rect, o = {}) {
  const X = { ...(o.x ?? {}) }, Y = { ...(o.y ?? {}) };
  if (!X.cats) {
    X.ticks = X.ticks ?? niceTicks(X.min, X.max, X.n ?? 5);
    X.min = Math.min(X.min, X.ticks[0]);
    X.max = Math.max(X.max, X.ticks[X.ticks.length - 1]);
  }
  if (o.zero) { Y.min = Math.min(0, Y.min); Y.max = Math.max(0, Y.max); }
  Y.ticks = Y.ticks ?? niceTicks(Y.min, Y.max, Y.n ?? 5);
  Y.min = Math.min(Y.min, Y.ticks[0]);
  Y.max = Math.max(Y.max, Y.ticks[Y.ticks.length - 1]);
  const f = chartFrame({ rect, x: X, y: Y, rightPad: o.rightPad });
  const p = f.plot;
  if (!X.cats) { f.px = linScale(X.min, X.max, p.x, p.x + p.w); f.vx = f.px.inv; }
  f.py = linScale(Y.min, Y.max, p.y + p.h, p.y);
  f.vy = f.py.inv;
  return f;
}

// -- Timing (pure) ---------------------------------------------------------------------

/** Seconds. line: a plotted line (huashu 1.5 s); bars: whole group, barLag: lag ratio per bar (huashu 0.22). */
export const PLOT = { line: 1.5, bars: 1.3, barLag: 0.22 };

/** Axes build windows (seconds after the axes start); grid lag ratio 0.12 as in huashu CH.grid. */
export const AXES = {
  lines: [0, 0.4],
  grid: [0.15, 0.75],
  gridLag: 0.12,
  xlabels: [0.3, 0.9],
  titles: [0.75, 1.05],
  end: 1.05,
};

/** True once the axes are built (always under reduced motion). */
export function axesDone(t) {
  return reducedMotion() || t >= AXES.end;
}

/** Seconds a plotLine takes: o.dur (default PLOT.line); 0 under reduced motion. */
export function lineDur(o = {}) {
  return reducedMotion() ? 0 : Math.max(0, o.dur ?? PLOT.line);
}

/** Arc length at which an x-monotone polyline (screen px) first reaches screen x; vertical runs at x are included. */
export function lenAtX(pts, x) {
  const n = pts.length;
  if (n < 2 || x <= pts[0][0]) return 0;
  const C = cumOf(pts);
  let i = 1;
  while (i < n && pts[i][0] <= x) i++;
  if (i >= n) return C[n - 1];
  const a = pts[i - 1], b = pts[i];
  const q = (x - a[0]) / (b[0] - a[0] || 1);
  return C[i - 1] + clamp01(q) * (C[i] - C[i - 1]);
}

/** Fraction (0..1) of the draw at which the head reaches `at` (index or { x }). */
function fracOf(pts, at, by) {
  const len = pathLen(pts);
  if (pts.length < 2) return 0;
  const x0 = pts[0][0], xN = pts[pts.length - 1][0];
  if (by === 'x') {
    const x = typeof at === 'number' ? pts[Math.max(0, Math.min(pts.length - 1, at))][0] : at.x;
    return xN === x0 ? 1 : clamp01((x - x0) / (xN - x0));
  }
  if (!(len > 0)) return 0;
  const d = typeof at === 'number' ? cumOf(pts)[Math.max(0, Math.min(pts.length - 1, at))] : lenAtX(pts, at.x);
  return clamp01(d / len);
}

/**
 * Seconds after a plotLine starts (add its delay yourself) at which the head
 * reaches pts[at] (at an index) or screen x (at = { x }). drawDur and easeFn must
 * be the ones plotLine uses (lineDur(o), o.ease); by matches o.by. Uses invertEase,
 * so a callout fired at this time lands exactly on its point.
 */
export function eventTime(pts, at, drawDur, easeFn = ease.smooth, by = 'len') {
  if (!(drawDur > 0)) return 0;
  const f = fracOf(pts, at, by);
  if (f <= 0) return 0;
  if (f >= 1) return drawDur;
  return drawDur * invertEase(easeFn, f);
}

/** Seconds after the bars start at which bar i of n is fully grown. */
export function barEnd(i, n, o = {}) {
  if (reducedMotion()) return 0;
  const D = o.dur ?? PLOT.bars, r = o.lag ?? PLOT.barLag;
  return (D * (1 + i * r)) / (1 + Math.max(0, n - 1) * r);
}

/** True once all n bars are grown. */
export function barsDone(t, n, o = {}) {
  return reducedMotion() || t >= (o.dur ?? PLOT.bars);
}

// -- Callout schedule (pure) ---------------------------------------------------------

/**
 * huashu CH.callout as data. Dot springs in (duration 0.45 s, bounce 0.25 ->
 * SimAnim spring { period 0.45, zeta 0.75 }); ring expands and fades over 0.6 s;
 * leader draws quintOut 0.12-0.45 s; label fades in quintOut 0.3-0.7 s; done at 0.7 s.
 * Sizes are design px (rescaled from huashu's 1920 frame).
 */
export const CALLOUT = {
  dotDur: 0.45, dotBounce: 0.25,
  ringDur: 0.6, ringGrow: 18,
  lineFrom: 0.12, lineTo: 0.45,
  textFrom: 0.3, textTo: 0.7,
  done: 0.7,
  r: 7, lineW: 2.5, rise: 8,
};

/**
 * State of a callout fired `age` seconds ago, or null before it fires.
 * { dot: scale (springs past 1, exactly 1 once done), ring: null | { k, alpha },
 *   line: 0..1, text: 0..1, done }. Reduced motion: the end state, no ring.
 */
export function calloutState(age, S = CALLOUT) {
  if (!(age >= 0)) return null;
  if (reducedMotion() || age >= S.done) return { dot: 1, ring: null, line: 1, text: 1, done: true };
  const dot = spring(age, uiSpring({ period: S.dotDur, zeta: 1 - S.dotBounce }));
  const pr = seg(age, 0, S.ringDur);
  return {
    dot: Math.max(0, dot),
    ring: pr > 0 && pr < 1 ? { k: pr, alpha: 1 - pr } : null,
    line: quintOut(seg(age, S.lineFrom, S.lineTo)),
    text: quintOut(seg(age, S.textFrom, S.textTo)),
    done: false,
  };
}

// -- Canvas: text cache ----------------------------------------------------------------

const WIDTHS = new Map();
function textW(ctx, font, text) {
  const k = font + '|' + text;
  let w = WIDTHS.get(k);
  if (w == null) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    if (WIDTHS.size > 500) WIDTHS.clear();
    WIDTHS.set(k, w);
  }
  return w;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

// -- Canvas: axes --------------------------------------------------------------------------

/**
 * Axes building at time t (seconds since they start). f: a frame (plotFrame or
 * SimChartSpec.chartFrame). Order: axis lines draw out, then the grid lines sweep in
 * bottom to top with their tick numbers, x tick numbers rise in, axis titles last.
 * o: { grid = true, size = 14 (tick px), titleSize = 15, fmtX, fmtY }. Returns { done }.
 */
export function axesOn(ctx, c, f, t, o = {}) {
  const T = reducedMotion() ? Infinity : t;
  const p = f.plot, size = Math.max(14, o.size ?? 14), ts = Math.max(14, o.titleSize ?? 15);
  const fy = o.fmtY ?? f.y.fmt ?? fmtDefault, fx = o.fmtX ?? f.x.fmt ?? fmtDefault;
  const base = p.y + p.h;
  ctx.save();
  ctx.lineCap = 'round';

  // Grid lines with their y numbers (lagged, bottom to top).
  const ys = f.yticks ?? [];
  const gp = seg(T, AXES.grid[0], AXES.grid[1]);
  ctx.font = fontOf(c, 700, size);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ys.forEach((v, i) => {
    const q = gp >= 1 ? 1 : laggedP(gp, i, ys.length, AXES.gridLag);
    if (q <= 0) return;
    const y = Math.round(f.py(v)) + 0.5;
    if (o.grid !== false && Math.abs(y - base) > 2) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + p.w * quintOut(q), y);
      ctx.stroke();
    }
    ctx.globalAlpha = seg(q, 0.3, 1);
    ctx.fillStyle = c.labelMuted;
    ctx.fillText(fy(v), p.x - 10 - (1 - ctx.globalAlpha) * 6, y);
  });

  // Axis lines: x left to right, y bottom to top.
  const lp = quintOut(seg(T, AXES.lines[0], AXES.lines[1]));
  if (lp > 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.label;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, base);
    ctx.lineTo(p.x + p.w * lp, base);
    ctx.moveTo(p.x, base);
    ctx.lineTo(p.x, base - p.h * lp);
    ctx.stroke();
  }

  // x tick marks and numbers (or category names).
  const cats = f.x.cats;
  const xs = cats ? cats.map((_, i) => i) : (f.xticks ?? []);
  const xp = seg(T, AXES.xlabels[0], AXES.xlabels[1]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  xs.forEach((v, i) => {
    const q = xp >= 1 ? 1 : laggedP(xp, i, xs.length, 0.1);
    if (q <= 0) return;
    const x = f.px(v), e = quintOut(q);
    ctx.globalAlpha = e;
    if (!cats) {
      ctx.strokeStyle = c.label;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, base + 2);
      ctx.lineTo(x, base + 8);
      ctx.stroke();
    }
    ctx.font = fontOf(c, cats ? 800 : 700, cats ? Math.max(size, 15) : size);
    ctx.fillStyle = cats ? c.label : c.labelMuted;
    ctx.fillText(cats ? String(cats[v]) : fx(v), x, base + 12 + (1 - e) * 6);
  });

  // Axis titles last.
  const tp = seg(T, AXES.titles[0], AXES.titles[1]);
  if (tp > 0) {
    ctx.globalAlpha = tp;
    ctx.fillStyle = c.label;
    ctx.font = fontOf(c, 800, ts);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const r = f.rect;
    if (f.x.label) ctx.fillText(f.x.label, p.x + p.w / 2, r.y + r.h - 8);
    if (f.y.label) {
      ctx.save();
      ctx.translate(r.x + 20, p.y + p.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(f.y.label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
  return { done: T >= AXES.end };
}

// -- Canvas: line -------------------------------------------------------------------------------

/**
 * pts (screen px, x-monotone for by 'x') drawing itself at t (seconds since its
 * start). o: { dur (PLOT.line), delay, ease (ease.smooth), by ('len' | 'x'),
 * col (c.s1), width (5), head (true), headR (7), shade(col) for a lip under the line,
 * area (baseline y px: a soft fill under the drawn part) }.
 * Returns { head: [x, y], done, d (px drawn), p (eased progress) }.
 */
export function plotLine(ctx, c, pts, t, o = {}) {
  const col = o.col ?? c.s1, w = o.width ?? 5;
  const D = drawDuration(pts, { dur: o.dur ?? PLOT.line });
  const u = reducedMotion() || D <= 0 ? 1 : clamp01((t - (o.delay ?? 0)) / D);
  const p = u >= 1 ? 1 : (o.ease ?? ease.smooth)(u);
  const done = u >= 1;
  const C = cumOf(pts), len = C[C.length - 1] || 0;
  let d = len * p;
  if (o.by === 'x' && pts.length > 1 && p < 1) d = lenAtX(pts, lerp(pts[0][0], pts[pts.length - 1][0], p));
  if (p <= 0 || pts.length < 2) return { head: pts[0] || [0, 0], done, d: 0, p };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (o.area != null) {
    const S = d >= len ? pts : subPath(pts, d / (len || 1));
    ctx.beginPath();
    ctx.moveTo(S[0][0], o.area);
    for (const q of S) ctx.lineTo(q[0], q[1]);
    ctx.lineTo(S[S.length - 1][0], o.area);
    ctx.closePath();
    ctx.globalAlpha = o.areaAlpha ?? 0.16;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = w;
  if (o.shade) {
    ctx.save();
    ctx.translate(0, 3);
    ctx.strokeStyle = o.shade(col);
    drawPartial(ctx, pts, d, C);
    ctx.restore();
  }
  ctx.strokeStyle = col;
  drawPartial(ctx, pts, d, C);
  const head = pointAt(pts, d, C);
  if (o.head !== false) {
    const r = o.headR ?? 7;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(head[0], head[1], r + 6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(head[0], head[1], r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.bgSurface;
    ctx.stroke();
  }
  ctx.restore();
  return { head, done, d, p };
}

// -- Canvas: bars ------------------------------------------------------------------------------------

/**
 * Bars growing from the zero line, lagged (huashu: quintOut, lag 0.22, 1.3 s).
 * f: a frame with cats (plotFrame({ zero: true, x: { cats } })). bars: [{ x (cat index), v, col }].
 * o: { dur, lag, col (c.s1), width (0.6 of the band), shade(col) }.
 * Returns { tops: [[x, y], ...] final tops (for a callout), done }.
 */
export function barsOn(ctx, c, f, bars, t, o = {}) {
  const n = bars.length, D = o.dur ?? PLOT.bars, r = o.lag ?? PLOT.barLag;
  const g = reducedMotion() ? 1 : clamp01(t / D);
  const p = f.plot;
  const zero = Math.max(p.y, Math.min(p.y + p.h, f.py(0)));
  const tops = [];
  ctx.save();
  bars.forEach((b, i) => {
    const band = f.band ? f.band(b.x ?? i) : { x: f.px(b.x ?? i) - 20, w: 40 };
    const w = band.w * (o.width ?? 0.6), x = band.x + (band.w - w) / 2;
    const top = f.py(b.v);
    tops.push([x + w / 2, top]);
    const k = g >= 1 ? 1 : quintOut(laggedP(g, i, n, r));
    const h = (zero - top) * k;
    if (Math.abs(h) < 0.5) return;
    const col = b.col ?? o.col ?? c.s1, rad = Math.min(9, w / 2, Math.abs(h));
    const y = h > 0 ? zero - h : zero;
    ctx.fillStyle = o.shade ? o.shade(col) : col;
    roundRect(ctx, x, y, w, Math.abs(h), rad);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w - (o.shade ? Math.max(4, w * 0.16) : 0), Math.abs(h));
    ctx.restore();
  });
  ctx.restore();
  return { tops, done: g >= 1 };
}

// -- Canvas: callout ---------------------------------------------------------------------------------

/**
 * One data-point callout, `age` seconds after it fires (huashu CH.callout):
 * the dot springs in, a ring expands and fades (0-0.6 s), the leader draws from the
 * dot to (tx, ty) (0.12-0.45 s), the label chip fades in and settles (0.3-0.7 s).
 * o: { x, y (data point), tx, ty (label anchor), text, col (c.accent), ink (c.bgDeep),
 *      align ('center' | 'left' | 'right': which chip edge sits on tx), size (15),
 *      r (CALLOUT.r), shade(col) for the chip lip, S (schedule, default CALLOUT) }.
 * Nothing before age 0. Reduced motion: the end state, no ring. Returns { done, box }.
 */
export function drawCallout(ctx, c, age, o) {
  const S = o.S ?? CALLOUT;
  const st = calloutState(age, S);
  if (!st) return { done: false, box: null };
  const col = o.col ?? c.accent, r = o.r ?? S.r;
  const { x, y, tx, ty } = o;
  ctx.save();
  ctx.lineCap = 'round';
  if (st.ring) {
    ctx.globalAlpha = st.ring.alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = S.lineW;
    ctx.beginPath();
    ctx.arc(x, y, r + st.ring.k * S.ringGrow, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (st.line > 0) {
    ctx.strokeStyle = col;
    ctx.lineWidth = S.lineW;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(lerp(x, tx, st.line), lerp(y, ty, st.line));
    ctx.stroke();
  }
  if (st.dot > 0) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r * st.dot, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = c.bgSurface;
    ctx.stroke();
  }
  let box = null;
  if (st.text > 0 && o.text) {
    const size = Math.max(14, o.size ?? 15), font = fontOf(c, 800, size);
    const w = textW(ctx, font, o.text) + 24, h = size + 14;
    const x0 = o.align === 'left' ? tx : o.align === 'right' ? tx - w : tx - w / 2;
    const y0 = ty - h / 2 + (1 - st.text) * S.rise;
    box = { x0, y0: ty - h / 2, w, h };
    ctx.globalAlpha = st.text;
    if (o.shade) {
      ctx.fillStyle = o.shade(col);
      roundRect(ctx, x0, y0 + 3.5, w, h, h / 2);
      ctx.fill();
    }
    ctx.fillStyle = col;
    roundRect(ctx, x0, y0, w, h, h / 2);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = o.ink ?? c.bgDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.text, x0 + w / 2, y0 + h / 2 + 1);
  }
  ctx.restore();
  return { done: st.done, box };
}

// -- Canvas: slope triangle and area under a line (added 2026-11-09, motion-and-forces) ----------

const ptOf = (f, p) => (Array.isArray(p) ? { x: f.px(p[0]), y: f.py(p[1]) } : { x: f.px(p.x), y: f.py(p.y) });

// Text with a halo in the panel colour (26 px default: the motion-and-forces floor).
function haloText(ctx, c, text, x, y, o = {}) {
  const size = o.size ?? 26;
  ctx.save();
  ctx.font = `800 ${size}px ${c.fontDisplay || c.fontBody || 'sans-serif'}`;
  ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.strokeStyle = c.bgSurface; ctx.lineWidth = Math.max(5, size * 0.28); ctx.globalAlpha *= 0.92;
  ctx.strokeText(String(text), x, y);
  ctx.globalAlpha /= 0.92;
  ctx.fillStyle = o.col ?? c.label; ctx.fillText(String(text), x, y);
  const w = ctx.measureText(String(text)).width;
  ctx.restore();
  return { x0: x - w / 2, y0: y - size * 0.6, w, h: size * 1.2 };
}

/**
 * The book's slope triangle on a plotFrame f: A and B are data points ([t, v] or
 * { x, y }); C = (B.x, A.y) is the right angle. Legs: run A-C (horizontal), rise
 * C-B (vertical). o: { rise, run (leg texts), letters = true, col (c.annot),
 * ink (text colour, c.label), size = 26, fill = 0.14 (tint alpha) }.
 * Returns { A, B, C (px), rise: box, run: box }.
 */
export function slopeTriangle(ctx, c, f, A, B, o = {}) {
  const a = ptOf(f, A), b = ptOf(f, B), C = { x: b.x, y: a.y }, col = o.col ?? c.annot ?? c.accent, size = o.size ?? 26, ink = o.ink ?? c.label;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(C.x, C.y); ctx.lineTo(b.x, b.y); ctx.closePath();
  ctx.globalAlpha = o.fill ?? 0.14; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.setLineDash([9, 6]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(C.x, C.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  const s = Math.min(14, Math.abs(C.x - a.x) / 3, Math.abs(C.y - b.y) / 3), dx = Math.sign(a.x - C.x) || -1, dy = Math.sign(b.y - C.y) || -1;
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(C.x + dx * s, C.y); ctx.lineTo(C.x + dx * s, C.y + dy * s); ctx.lineTo(C.x, C.y + dy * s); ctx.stroke();
  ctx.restore();
  const below = b.y < a.y ? 1 : -1;                                       // the run label goes on the side away from B
  const run = o.run != null ? haloText(ctx, c, o.run, (a.x + C.x) / 2, C.y + below * (size * 0.75 + 6), { size, col: ink }) : null;
  let rise = null;
  if (o.rise != null) {
    ctx.save(); ctx.font = `800 ${size}px ${c.fontDisplay || c.fontBody || 'sans-serif'}`; const w = ctx.measureText(String(o.rise)).width; ctx.restore();
    let side = b.x >= a.x ? 1 : -1;
    const pr = f.plot, out = C.x + side * (w + 14);
    if (out > pr.x + pr.w + 12 || out < pr.x - 12) side = -side;                // no room outside the leg: put it inside the triangle
    rise = haloText(ctx, c, o.rise, C.x + side * (w / 2 + 12), (C.y + b.y) / 2, { size, col: ink });
  }
  if (o.letters !== false) {
    // A and B go on the far side of the line from C (never on the line); C goes out from the corner.
    const off = size * 0.8, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    if (nx * (C.x - a.x) + ny * (C.y - a.y) > 0) { nx = -nx; ny = -ny; }
    const gx = (a.x + b.x + C.x) / 3, gy = (a.y + b.y + C.y) / 3, gl = Math.hypot(C.x - gx, C.y - gy) || 1;
    haloText(ctx, c, 'A', a.x + nx * off, a.y + ny * off, { size, col });
    haloText(ctx, c, 'B', b.x + nx * off, b.y + ny * off, { size, col });
    haloText(ctx, c, 'C', C.x + ((C.x - gx) / gl) * off, C.y + ((C.y - gy) / gl) * off, { size, col });
  }
  return { A: a, B: b, C, rise, run };
}

/**
 * Fill the area between a line (data points [[t, v], ...] or { x, y }) and the
 * time axis: the line v = 0 of f (clamped into the plot), never the panel bottom
 * when the range has negatives. o: { col (c.s1), alpha = 0.32, split, tones
 * [rect, tri] (c.s1, c.s2) }. o.split: for a straight line from the first to the
 * last point, a rectangle up to the first value and a triangle above it (u t and
 * (v - u) t / 2). Returns { base (px y), label: { x, y } } or, split,
 * { base, rect: { box, label }, tri: { pts, label } }.
 */
export function areaUnder(ctx, c, f, pts, o = {}) {
  const p = f.plot, [d0, d1] = f.py.domain, zero = Math.min(Math.max(0, Math.min(d0, d1)), Math.max(d0, d1));
  const base = Math.max(p.y, Math.min(p.y + p.h, f.py(zero))), P = pts.map((q) => ptOf(f, q)), k = o.alpha ?? 0.32;
  const shape = (poly, col) => {
    ctx.save(); ctx.beginPath(); poly.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
    ctx.globalAlpha = k; ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  };
  if (!o.split || P.length < 2) {
    const poly = [{ x: P[0].x, y: base }, ...P, { x: P[P.length - 1].x, y: base }];
    shape(poly, o.col ?? c.s1);
    const cx = (P[0].x + P[P.length - 1].x) / 2, mid = P.reduce((s, q) => s + q.y, 0) / P.length;
    return { base, label: { x: cx, y: (mid + base) / 2 } };
  }
  const a = P[0], b = P[P.length - 1], [t1, t2] = o.tones ?? [c.s1, c.s2];
  const rect = [{ x: a.x, y: base }, { x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: base }];
  const tri = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: a.y }];
  shape(rect, t1); shape(tri, t2);
  return { base, rect: { box: { x0: a.x, y0: Math.min(a.y, base), w: b.x - a.x, h: Math.abs(base - a.y) }, label: { x: (a.x + b.x) / 2, y: (a.y + base) / 2 } },
    tri: { pts: tri, label: { x: (a.x + 2 * b.x) / 3, y: (2 * a.y + b.y) / 3 } } };
}
