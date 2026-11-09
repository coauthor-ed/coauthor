/** SimDrawOnSvg.js
 * SimDrawOnSvg - draw-on for SVG paths and a write-on for text, driven by the frame clock (recipe R9 on
 * the live layer; the canvas twin is SimDrawOn.js). Unlike the CSS .sv-draw one-shot, a repaint never
 * replays it: the stroke shows exactly progress p, so a rested stroke stays drawn and skip() lands it.
 * Works in an SvgScene and in any withClock(DomSimulation). Original code; the Write timing (writeLag,
 * grapheme units) is SimDrawOn's (attributed there).
 *
 *   drawP(t, o) -> 0..1        progress at clock t: o = { delay = 0, dur, len, speed = TIMING.drawSpeed,
 *                              cap = TIMING.tapCap, ease = ease.smooth }; dur defaults to min(cap, len / speed).
 *                              1 under reduced motion.
 *   drawOnAttrs(len, p) -> { 'stroke-dasharray', 'stroke-dashoffset', visibility }   pure: the dash pair that
 *                              shows the first p of a stroke len long (hidden at p <= 0: no round-cap dot)
 *   pathLen(live, d) -> px     arc length of a path d, measured once (a hidden probe path) and cached
 *   circleD(cx, cy, r) / circleLen(r)   a circle as a path d starting at the top, clockwise; its length
 *   drawOnPath(live, key, d, p, o) -> path   a live path drawn to p. o = { stroke, lw = 3, len (skip the
 *                              measure), fill (fades in over the last 30%: DrawBorderThenFill), fillAlpha = 1,
 *                              opacity, dash ('6 8': the resting pattern once p = 1), cls, parent,
 *                              pen (a colour: a dot rides the tip while drawing), penR }
 *   drawOnCircle(live, key, cx, cy, r, p, o)   the same for a circle (length known, no measure)
 *   writeOnSvg(live, key, str, x, y, t, o) -> { w, done, p }   text written on at its baseline (x, y): each
 *                              grapheme (o.mode 'word': each word) outlines in, then fills, staggered by
 *                              writeLag. o = { size = 32, weight = 800, col, dur = TIMING.tapCap, delay = 0,
 *                              align = 'left' | 'center' | 'right', mode, lag, label (read out; default str) }
 * Reduced motion: every recipe shows its end state.
 */
import { esc } from 'simulations/base/SimUi.js';
import { TIMING, ease, laggedP, reducedMotion } from './SimAnim.js';
import { units, writeLag } from './SimDrawOn.js';

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const px = (v) => `${v.toFixed(2)}px`;

/** Progress 0..1 of a draw at clock t (see the header). */
export function drawP(t, o = {}) {
  if (reducedMotion()) return 1;
  const speed = o.speed ?? TIMING.drawSpeed;
  const D = o.dur ?? Math.min(o.cap ?? TIMING.tapCap, (o.len ?? 0) / (speed > 0 ? speed : 1));
  const u = D > 0 ? clamp01((t - (o.delay ?? 0)) / D) : (t >= (o.delay ?? 0) ? 1 : 0);
  return (o.ease ?? ease.smooth)(u);
}

/** The dash pair showing the first p of a stroke len long. */
export function drawOnAttrs(len, p) {
  const L = Math.max(0.01, len), q = clamp01(p);
  if (q >= 1) return { 'stroke-dasharray': null, 'stroke-dashoffset': null, visibility: null };
  return { 'stroke-dasharray': `${L.toFixed(2)} ${(L + 2).toFixed(2)}`, 'stroke-dashoffset': (L * (1 - q)).toFixed(2), visibility: q <= 0 ? 'hidden' : null };
}

const LENS = new Map();

// Crude fallback when the host cannot measure (a headless fake DOM): the polyline through the numbers.
function roughLen(d) {
  const n = String(d).match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
  let s = 0;
  for (let i = 2; i + 1 < n.length; i += 2) s += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]);
  return s;
}

function probe(live, d) {
  const e = live.shape('|draw-probe', 'path');
  live.attrs(e, { d, visibility: 'hidden' });
  return e;
}

/** Arc length of path d (measured once, cached). */
export function pathLen(live, d) {
  let L = LENS.get(d);
  if (L != null) return L;
  const e = probe(live, d);
  try { L = typeof e.getTotalLength === 'function' ? e.getTotalLength() : NaN; } catch (_) { L = NaN; }
  if (!(L > 0)) L = roughLen(d);
  if (LENS.size > 512) LENS.clear();
  LENS.set(d, L);
  return L;
}

const f2 = (v) => +v.toFixed(2);

/** A circle as a path d: from the top, clockwise. */
export function circleD(cx, cy, r) {
  return `M${f2(cx)} ${f2(cy - r)}A${f2(r)} ${f2(r)} 0 1 1 ${f2(cx)} ${f2(cy + r)}A${f2(r)} ${f2(r)} 0 1 1 ${f2(cx)} ${f2(cy - r)}Z`;
}
export const circleLen = (r) => 2 * Math.PI * r;

/** A live path drawn to p (see the header). */
export function drawOnPath(live, key, d, p, o = {}) {
  const q = reducedMotion() ? 1 : clamp01(p);
  const len = o.len ?? pathLen(live, d);
  const e = live.shape(key, 'path', { cls: o.cls, parent: o.parent });
  const dash = drawOnAttrs(len, q);
  if (q >= 1 && o.dash) dash['stroke-dasharray'] = o.dash;
  live.attrs(e, { d, ...dash });
  const fa = o.fill ? clamp01((q - 0.7) / 0.3) * (o.fillAlpha ?? 1) : 0;
  live.css(e, {
    fill: o.fill && fa > 0 ? o.fill : 'none', 'fill-opacity': o.fill && fa > 0 && fa < 1 ? fa.toFixed(3) : null,
    stroke: o.stroke ?? 'var(--sim-label)', 'stroke-width': o.lw ?? 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    opacity: o.opacity != null ? o.opacity.toFixed(3) : null,
  });
  if (o.pen && q > 0 && q < 1) {
    let tip = null;
    try { tip = typeof e.getPointAtLength === 'function' ? e.getPointAtLength(len * q) : null; } catch (_) { tip = null; }
    if (tip) {
      const dot = live.shape(`${key}|pen`, 'circle', { parent: o.parent });
      live.attrs(dot, { cx: tip.x.toFixed(2), cy: tip.y.toFixed(2), r: o.penR ?? Math.max(4, 1.3 * (o.lw ?? 3)) });
      live.css(dot, { fill: o.pen });
    }
  }
  return e;
}

/** drawOnPath for a circle (its length is known). */
export function drawOnCircle(live, key, cx, cy, r, p, o = {}) {
  return drawOnPath(live, key, circleD(cx, cy, r), p, { len: circleLen(r), ...o });
}

/** Text written on at its baseline (see the header). */
export function writeOnSvg(live, key, str, x, y, t, o = {}) {
  const size = o.size ?? 32, weight = o.weight ?? 800, col = o.col ?? 'var(--sim-label)';
  const D = reducedMotion() ? 0 : (o.dur ?? TIMING.tapCap);
  const u = D <= 0 ? 1 : clamp01((t - (o.delay ?? 0)) / D);
  const m = live.measure(esc(str), { size, weight });
  const al = o.align ?? 'left';
  const x0 = al === 'center' ? x - m.w / 2 : al === 'right' ? x - m.w : x;
  const box = live.el(key, { cls: 'sv-term sv-write' });
  // Read out whole (role img + label), not letter by letter; label false hides it from a screen reader.
  live.attrs(box, o.label === false ? { 'aria-hidden': 'true', role: null, 'aria-label': null } : { 'aria-hidden': null, role: 'img', 'aria-label': o.label ?? str });
  live.css(box, { transform: `translate(${px(x0)}, ${px(y - m.asc)})`, 'font-size': `${size}px`, 'font-weight': String(weight), color: col });
  const U = units(str, o.mode ?? 'grapheme');
  const vis = U.filter((s) => s.trim()).length, r = o.lag ?? writeLag(vis);
  let j = 0;
  U.forEach((s, i) => {
    const g = live.el(`${key}|${i}`, { parent: box, html: esc(s) });
    if (!s.trim()) return;
    const q = u >= 1 ? 1 : laggedP(u, j++, vis, r);
    // First half: the outline draws in; second half: the fill comes up under it (SimDrawOn writeGlyph).
    const line = clamp01(q * 2), fillK = clamp01(q * 2 - 1);
    live.css(g, {
      display: 'inline-block', 'white-space': 'pre',
      opacity: q <= 0 ? '0' : null,
      color: fillK >= 1 ? null : `color-mix(in oklab, ${col} ${(fillK * 100).toFixed(1)}%, transparent)`,
      '-webkit-text-stroke': q > 0 && fillK < 1 ? `${(0.035 * line).toFixed(4)}em ${col}` : null,
      transform: q < 1 ? `translateY(${(0.12 * (1 - line)).toFixed(3)}em)` : null,
    });
  });
  if (u > 0 && u < 1) live.more();
  return { w: m.w, done: u >= 1, p: u };
}
