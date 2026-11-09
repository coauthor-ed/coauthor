/** SimPlotSvg.js
 * SimPlotSvg - the staged-plot beats of SimPlot (recipe R17) on the SVG live layer and the withClock clock:
 * axes that build, a line that draws itself by length or by x, bars that grow from zero, and the ONE
 * callout that fires exactly when the line head reaches its point. The canvas twin is SimPlot.js; the
 * timing and scale maths is its own (imported, not copied), so both renderers fire at the same instant.
 * Works in an SvgScene and in any withClock(DomSimulation). A repaint never replays a beat: every helper
 * shows exactly the state at clock t, a rested chart stays built, and skip() lands it.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE), through SimPlot.js:
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/chart.js (MIT, (c) 2026 alchaincyf) - grid lag, bar lag, callout stage windows
 *   Original code: the live-layer elements, plotHit, plotPanelSvg, toScreen.
 *
 * What SimChart.js already does (use it, not this): static axesSvg / barsSvg / traceSvg / pieSvg ...,
 * with one-shot CSS grow / draw / pop. This module adds what CSS cannot: beats on a shared clock, a
 * draw by x (lenAtX), and a callout synced to the data. Frames are SimChartSpec.chartFrame or
 * SimPlot.plotFrame (nice covering ticks); the rested look matches SimChart's axesSvg and bars.
 *
 * Re-exported from SimPlot.js (pure): linScale, niceStep, niceTicks, plotFrame, lenAtX, lineDur, eventTime,
 * CALLOUT, calloutState, PLOT, AXES, axesDone, barEnd, barsDone.
 *   plotHit(pts, at, o) -> s       clock time (o.delay included) at which plotLineSvg(pts, o) reaches pts[at]
 *                                  (index) or screen x (at = { x }): fire calloutSvg at t - plotHit(...)
 *   toScreen(f, data) -> [[x, y]]  data points ([x, y] or { x, y }) to screen px through frame f
 *   plotPanelSvg(f) -> markup      SimChart's panel card under f.rect (paint it statically)
 *   axesOnSvg(live, key, f, t, o) -> { done }   axis lines draw out, grid sweeps in bottom to top with its
 *                                  numbers, x numbers rise in, titles last (AXES windows). o = { grid = true,
 *                                  yAxis = true (a y axis bar; SimChart has none), fmtX, fmtY, size = 15 }
 *   plotLineSvg(live, key, pts, t, o) -> { head, done, d, p }   pts (screen px) drawing on. o = { dur
 *                                  (PLOT.line), delay, ease (ease.smooth), by ('len' | 'x'), tone (1: series
 *                                  n or a token name), col (a CSS colour; wins), width (6), lip (true),
 *                                  head (true), headR (8), area (baseline y: a soft fill under the drawn part),
 *                                  areaAlpha (0.16) }
 *   barsOnSvg(live, key, f, bars, t, o) -> { tops, done }   bars [{ x (cat index), v, tone }] growing from
 *                                  zero, lagged (PLOT.bars, PLOT.barLag). o = { dur, lag, tone, width (0.62) }
 *   calloutSvg(live, key, age, o) -> { done, chip }   fired `age` s ago: dot springs in, ring pulses, leader
 *                                  draws, chip fades up. o = { x, y (point), tx, ty (chip anchor), text, tone
 *                                  ('accent'), align ('center' | 'left' | 'right'), r (CALLOUT.r) }
 * Every helper calls live.more() while it moves, so the clock runs on to its end.
 * Chart honesty (SimPlot.js header): structure first, then data, then ONE annotation; bars from zero;
 * animation never overshoots a value.
 * Reduced motion: every helper shows its end state (no ring).
 */
import { esc } from 'simulations/base/SimUi.js';
import { ease, laggedP, reducedMotion } from './SimAnim.js';
import { cumOf, pointAt, subPath } from './SimDrawOn.js';
import { drawOnAttrs } from './SimDrawOnSvg.js';
import { liveChip, fill, shade, glossOf, panelSvg } from './SimSvg.js';
import { lookOf } from './lookProfile.js';
import {
  linScale, niceStep, niceTicks, plotFrame, lenAtX, lineDur, eventTime,
  CALLOUT, calloutState, PLOT, AXES, axesDone, barEnd, barsDone,
} from './SimPlot.js';

export {
  linScale, niceStep, niceTicks, plotFrame, lenAtX, lineDur, eventTime,
  CALLOUT, calloutState, PLOT, AXES, axesDone, barEnd, barsDone,
};

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const quintOut = (u) => 1 - (1 - clamp01(u)) ** 5;
const f1 = (v) => (+v).toFixed(1);
const num = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
const colOf = (o, dflt = 1) => {
  if (o.col) return o.col;
  const t = o.tone ?? dflt;
  return typeof t === 'number' ? `var(--sim-series-${((Math.max(1, t | 0) - 1) % 8) + 1})` : `var(--sim-${t})`;
};

/** Clock time at which plotLineSvg(pts, o) reaches pts[at] or { x } (o.delay included). */
export function plotHit(pts, at, o = {}) {
  return (o.delay ?? 0) + eventTime(pts, at, lineDur(o), o.ease ?? ease.smooth, o.by ?? 'len');
}

/** Data points ([x, y] or { x, y }) to screen px through frame f. */
export function toScreen(f, data) {
  return data.map((p) => (Array.isArray(p) ? [f.px(p[0]), f.py(p[1])] : [f.px(p.x), f.py(p.y)]));
}

/** SimChart's panel card under f.rect, as static markup. */
export function plotPanelSvg(f) {
  return panelSvg(f.rect);
}

function text(live, key, s, x, y, a, o = {}) {
  const e = live.shape(key, 'text', { html: esc(s), parent: o.parent });
  live.attrs(e, { x: f1(x), y: f1(y), 'text-anchor': o.anchor ?? 'middle', transform: o.transform ?? null });
  live.css(e, { fill: o.col ?? 'var(--sim-label-muted)', 'font-size': `${o.size ?? 15}px`, 'font-family': 'var(--sim-font)', 'font-weight': '800', opacity: a < 1 ? a.toFixed(3) : null });
  return e;
}

function rect(live, key, x, y, w, h, col, o = {}) {
  const e = live.shape(key, 'rect', { parent: o.parent });
  live.attrs(e, { x: f1(x), y: f1(y), width: f1(Math.max(0, w)), height: f1(Math.max(0, h)), rx: o.rx ?? null });
  live.css(e, { fill: col, opacity: o.alpha != null && o.alpha < 1 ? o.alpha.toFixed(3) : null });
  return e;
}

/** Axes building at clock t (see the header). */
export function axesOnSvg(live, key, f, t, o = {}) {
  const T = reducedMotion() || live.skipping ? Infinity : t;
  const p = f.plot, r = f.rect, base = p.y + p.h, size = Math.max(14, o.size ?? 15);
  const fy = o.fmtY ?? f.y.fmt ?? num, fx = o.fmtX ?? f.x.fmt ?? num;
  const grid = o.grid !== false, line = 'var(--sim-stroke)';
  const G = live.shape(key, 'g'), P = { parent: G };

  // Grid lines with their y numbers, lagged bottom to top.
  const ys = f.yticks ?? [];
  const gp = seg(T, AXES.grid[0], AXES.grid[1]);
  ys.forEach((v, i) => {
    const q = gp >= 1 ? 1 : laggedP(gp, i, ys.length, AXES.gridLag);
    if (q <= 0) return;
    const y = f.py(v), a = seg(q, 0.3, 1);
    if (grid && Math.abs(y - base) > 2) rect(live, `${key}|gy${i}`, p.x, y - 1, p.w * quintOut(q), 2, line, { ...P, alpha: 0.35 });
    if (a > 0) text(live, `${key}|ly${i}`, fy(v), p.x - 10 - (1 - a) * 6, y + 5, a, { ...P, anchor: 'end', size });
  });

  // x numbers (or category names) rise in, with a faint vertical grid for a value axis.
  const cats = f.x.cats;
  const xs = cats ? cats.map((_, i) => i) : (f.xticks ?? []);
  const xp = seg(T, AXES.xlabels[0], AXES.xlabels[1]);
  xs.forEach((v, i) => {
    const q = xp >= 1 ? 1 : laggedP(xp, i, xs.length, 0.1);
    if (q <= 0) return;
    const x = f.px(v), e = quintOut(q);
    if (!cats && grid) rect(live, `${key}|gx${i}`, x - 1, base - p.h * e, 2, p.h * e, line, { ...P, alpha: 0.25 });
    text(live, `${key}|lx${i}`, cats ? String(cats[v]) : fx(v), x, base + 24 + (1 - e) * 6, e,
      { ...P, size, col: cats ? 'var(--sim-label)' : 'var(--sim-label-muted)' });
  });

  // Axis bars draw out: x left to right, y bottom to top (over the grid).
  const lp = quintOut(seg(T, AXES.lines[0], AXES.lines[1]));
  if (lp > 0) {
    const k = lookOf().rim;   // the bars' weight follows the look's rim (1 under Quill)
    rect(live, `${key}|ax`, p.x - 2, base - 2 * k, (p.w + 4) * lp, 5 * k, 'var(--sim-label)', { ...P, rx: 2.5 * k });
    if (o.yAxis !== false) rect(live, `${key}|ay`, p.x - 2.5 * k, base + 2 * k - (p.h + 4) * lp, 5 * k, (p.h + 4) * lp, 'var(--sim-label)', { ...P, rx: 2.5 * k });
  }

  // Titles last.
  const tp = seg(T, AXES.titles[0], AXES.titles[1]);
  if (tp > 0) {
    if (f.x.label) text(live, `${key}|tx`, f.x.label, p.x + p.w / 2, r.y + r.h - 10, tp, { ...P, col: 'var(--sim-label)', size });
    if (f.y.label) text(live, `${key}|ty`, f.y.label, 0, 0, tp, { ...P, col: 'var(--sim-label)', size, transform: `translate(${f1(r.x + 22)} ${f1(p.y + p.h / 2)}) rotate(-90)` });
  }
  const done = T >= AXES.end;
  if (!done) live.more();
  return { done };
}

/** pts (screen px) drawing on at clock t (see the header). */
export function plotLineSvg(live, key, pts, t, o = {}) {
  const col = colOf(o), w = o.width ?? 6;
  const D = lineDur(o);
  const u = reducedMotion() || live.skipping || D <= 0 ? 1 : clamp01((t - (o.delay ?? 0)) / D);
  const p = u >= 1 ? 1 : (o.ease ?? ease.smooth)(u);
  const done = u >= 1;
  if (!done) live.more();
  if (pts.length < 2) return { head: pts[0] ?? [0, 0], done, d: 0, p };
  const C = cumOf(pts), len = C[C.length - 1] || 0;
  let d = len * p;
  if (o.by === 'x' && p < 1) d = lenAtX(pts, lerp(pts[0][0], pts[pts.length - 1][0], p));
  if (p <= 0) { live.shape(key, 'g'); return { head: pts[0], done, d: 0, p }; }
  const q = len > 0 ? d / len : 1;
  const G = live.shape(key, 'g');

  if (o.area != null) {
    const S = q >= 1 ? pts : subPath(pts, q);
    const e = live.shape(`${key}|area`, 'path', { parent: G });
    live.attrs(e, { d: `M${f1(S[0][0])} ${f1(o.area)}` + S.map((s) => `L${f1(s[0])} ${f1(s[1])}`).join('') + `L${f1(S[S.length - 1][0])} ${f1(o.area)}Z` });
    live.css(e, { fill: col, opacity: (o.areaAlpha ?? 0.16).toFixed(3) });
  }
  const dAll = pts.map((s, i) => `${i ? 'L' : 'M'}${f1(s[0])} ${f1(s[1])}`).join('');
  const dash = drawOnAttrs(len, q);
  const stroke = (k, c, extra) => {
    const e = live.shape(`${key}|${k}`, 'path', { parent: G });
    live.attrs(e, { d: dAll, ...dash, ...extra });
    live.css(e, { fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  };
  const lip = lookOf().lip;
  if (o.lip !== false && lip) stroke('lip', shade(col, 60), { transform: `translate(0 ${3 * lip})` });
  stroke('line', col, {});
  const head = pointAt(pts, d, C);
  if (o.head !== false) {
    const r = o.headR ?? 8;
    const halo = live.shape(`${key}|halo`, 'circle', { parent: G });
    live.attrs(halo, { cx: f1(head[0]), cy: f1(head[1]), r: r + 6 });
    live.css(halo, { fill: col, opacity: '0.25' });
    const dot = live.shape(`${key}|head`, 'circle', { parent: G });
    live.attrs(dot, { cx: f1(head[0]), cy: f1(head[1]), r });
    live.css(dot, { fill: col, stroke: 'var(--sim-bg-surface)', 'stroke-width': 3 });
  }
  return { head, done, d, p };
}

// SimChart's bar: rounded top, a cushion down its right side, a gloss stripe (drawn at height h).
function barMarkup(x, y, w, h, c) {
  if (h <= 0.5) return '';
  const L = lookOf(), r = Math.min(10 * L.radius, w / 2, h);
  const d = `M${f1(x)} ${f1(y + h)}V${f1(y + r)}Q${f1(x)} ${f1(y)} ${f1(x + r)} ${f1(y)}H${f1(x + w - r)}Q${f1(x + w)} ${f1(y)} ${f1(x + w)} ${f1(y + r)}V${f1(y + h)}Z`;
  const cw = Math.max(4, w * 0.16);
  return (L.lip ? `<path d="${d}" ${fill(shade(c, 72))}/><path d="${d}" ${fill(c, `clip-path:inset(0 ${f1(cw)}px 0 0)`)}/>` : `<path d="${d}" ${fill(c)}/>`)
    + (h > 12 && L.gloss ? `<rect x="${f1(x + Math.max(3, w * 0.12))}" y="${f1(y + 4)}" width="${f1(Math.max(3, w * 0.12))}" height="${f1(h - 8)}" rx="2" ${fill(glossOf(c, 45), `opacity:${0.55 * L.gloss}`)}/>` : '');
}

/** Bars growing from zero at clock t (see the header). */
export function barsOnSvg(live, key, f, bars, t, o = {}) {
  const n = bars.length, D = o.dur ?? PLOT.bars, lag = o.lag ?? PLOT.barLag;
  const g = reducedMotion() || live.skipping ? 1 : clamp01(t / D);
  const p = f.plot, zero = Math.max(p.y, Math.min(p.y + p.h, f.py(0)));
  const tops = [], G = live.shape(key, 'g');
  bars.forEach((b, i) => {
    const band = f.x.cats ? f.band(b.x ?? i) : { x: f.px(b.x ?? i) - 20, w: 40 };
    const w = band.w * (o.width ?? 0.62), x = band.x + (band.w - w) / 2;
    const top = f.py(b.v);
    tops.push([x + w / 2, top]);
    const k = g >= 1 ? 1 : quintOut(laggedP(g, i, n, lag));
    const h = (zero - top) * k;
    if (h <= 0.5) return;
    live.shape(`${key}|b${i}`, 'g', { parent: G, html: barMarkup(x, zero - h, w, h, colOf(b.tone != null ? b : o)) });
  });
  if (g < 1) live.more();
  return { tops, done: g >= 1 };
}

/** One data-point callout, `age` s after it fires (see the header). */
export function calloutSvg(live, key, age, o) {
  const S = o.S ?? CALLOUT;
  const G = live.shape(key, 'g');
  const st = calloutState(live.skipping && age >= 0 ? S.done : age, S);
  if (!st) return { done: false, chip: null };
  if (!st.done) live.more();
  const col = colOf(o, 'accent'), r = o.r ?? S.r + 1;
  const { x, y, tx, ty } = o;
  if (st.ring) {
    const e = live.shape(`${key}|ring`, 'circle', { parent: G });
    live.attrs(e, { cx: f1(x), cy: f1(y), r: f1(r + st.ring.k * S.ringGrow) });
    live.css(e, { fill: 'none', stroke: col, 'stroke-width': 3, opacity: st.ring.alpha.toFixed(3) });
  }
  if (st.line > 0) {
    const e = live.shape(`${key}|lead`, 'line', { parent: G });
    live.attrs(e, { x1: f1(x), y1: f1(y), x2: f1(lerp(x, tx, st.line)), y2: f1(lerp(y, ty, st.line)) });
    live.css(e, { stroke: col, 'stroke-width': 3, 'stroke-linecap': 'round' });
  }
  if (st.dot > 0) {
    const e = live.shape(`${key}|dot`, 'circle', { parent: G });
    live.attrs(e, { cx: f1(x), cy: f1(y), r: f1(r * st.dot) });
    live.css(e, { fill: col, stroke: 'var(--sim-bg-surface)', 'stroke-width': 3 });
  }
  let el = null;
  if (st.text > 0 && o.text) {
    el = liveChip(live, `${key}|chip`, o.text, tx, ty + (1 - st.text) * S.rise,
      { tone: o.tone ?? 'accent', align: o.align === 'center' ? undefined : o.align, alpha: st.text, size: o.size, math: o.math });
  }
  return { done: st.done, chip: el };
}
