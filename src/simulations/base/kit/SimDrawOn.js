/** SimDrawOn.js
 * SimDrawOn - canvas draw-on of paths and text (recipe R9; the canvas twin of the SVG .sv-draw).
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/diagram.js (MIT, (c) 2026 alchaincyf) - cum, pointAt, drawPartial, revealMask (revealPath), zigzag
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/kit.js (MIT, (c) 2026 alchaincyf) - densify, ribbon
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/kit/core.js (MIT, (c) 2026 cth9191) - resample, subPath, pathLen
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/math/kit.js (MIT, (c) 2026 cth9191) - writeGlyph, writeText timing
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/sketchbook/kit.js (MIT, (c) 2026 cth9191) - prefix-advance cache
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/riso/kit.js (MIT, (c) 2026 cth9191) - taper law (no pressure noise, no wobble)
 *   Original code: drawOn, drawDuration, withReveal, graphemes/units (Intl.Segmenter), writeOn, the 3b1b lag rule wiring.
 *
 * Conventions: a path P is an array of [x, y] points in design px (680x520).
 * Treat a path as IMMUTABLE once it has been drawn: cumOf/ribbon cache by array
 * identity (WeakMap), so build a new array instead of editing one in place.
 * Every "draw up to d" is by arc length d (px), as in huashu DG.
 *
 * Geometry (pure; SimMorph and SimPlot import these):
 *   cum(P)                  cumulative arc length per vertex, [0, ..., len] (fresh array)
 *   cumOf(P)                same, cached per path array
 *   pathLen(P)              total length; pathLen([[0,0],[3,4]]) === 5
 *   pointAt(P, d, C?)       point at arc length d (binary search; clamps d to [0, len])
 *   pointAtFrac(P, f)       point at fraction f of the length
 *   subPath(P, frac)        leading part of P up to fraction frac (subPath(P, 1) has P's points)
 *   resample(P, closed, s)  points every <= s px along each edge (closed: back to P[0])
 *   densify(P, per)         open Catmull-Rom: per points per edge, passes through every input
 *   taper(w, k)             default width law for ribbon: full width w, tapering over the
 *                           first and last k of the length, exponent 0.7 (riso law)
 *   ribbonPts(P, w)         closed polygon around P with width w (number or w(q, i), q = arc fraction)
 *   ribbon(P, w)            the same as one Path2D, cached per (path, w)
 *   zigzag(x, y, w, h, rows) boustrophedon path down a box (reveal scan for a diagram)
 *   revealPath(P, d, w, C?, into?) union of square-capped bars along P up to d (a clip mask)
 *
 * Drawing (ctx in, picture out; same t -> same pixels):
 *   drawPartial(ctx, P, d, C?)   strokes the first d px with the current stroke style; returns the tip
 *   drawDuration(P, o)           seconds a drawOn takes: o.dur, else min(o.cap = TIMING.tapCap, len / speed)
 *   drawOn(ctx, P, t, o)         stroke (or ribbon fill) drawing itself at time t; optional pen dot;
 *                                returns { tip, done, p }
 *   withReveal(ctx, P, d, w, fn) runs fn() clipped to revealPath; at rest (d >= len) no clip, no Path2D
 *
 * Text (Devanagari safe: never split inside a grapheme cluster):
 *   graphemes(str)               grapheme clusters (Intl.Segmenter, fallback Array.from), cached
 *   units(str, mode)             'grapheme' (default) or 'word' (split on spaces; for Devanagari and long strings)
 *   advances(ctx, font, str, mode) prefix advances per unit boundary, cached by font|mode|str
 *                                (the SAME array comes back on later calls; do not mutate it)
 *   writeLag(n)                  3b1b Write lag ratio min(4 / (n + 1), 0.2)
 *   writeGlyph(ctx, ch, x, y, size, col, p, a)  one unit mid-Write: outline dash over the first half,
 *                                fill fades in over the second; p >= 1 is a plain fillText
 *   writeText(ctx, str, x, y, size, p, o)  whole string at group progress p (0..1); returns its width
 *   writeOn(ctx, str, x, y, size, t, o)    time-based writeText: whole write within o.dur
 *                                (default TIMING.tapCap) after o.delay; returns { width, done, p }
 *
 * Reduced motion: drawOn, writeText and writeOn draw their end state.
 * Not here (deferred): StrokePlan; pen or hand drawing.
 */
import { TIMING, ease, laggedP, reducedMotion } from './SimAnim.js';

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a, b, t) => a + (b - a) * t;

// -- Arc length ----------------------------------------------------------------

/** Cumulative arc length per vertex: [0, |P1-P0|, ...]. Pure, fresh array. */
export function cum(P) {
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + dist(P[i - 1], P[i]));
  return L;
}

const CUM = new WeakMap();
/** cum(P), cached per path array (paths are immutable once drawn). */
export function cumOf(P) {
  let C = CUM.get(P);
  if (!C) { C = cum(P); CUM.set(P, C); }
  return C;
}

/** Total length of a polyline. */
export function pathLen(P) {
  if (!P || P.length < 2) return 0;
  const C = cumOf(P);
  return C[C.length - 1];
}

/** Point at arc length d (clamped to the ends). Binary search over C. */
export function pointAt(P, d, C = cumOf(P)) {
  const n = P.length;
  if (n === 0) return [0, 0];
  if (!(d > 0)) return P[0];            // also catches NaN
  if (d >= C[n - 1]) return P[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m] < d) lo = m; else hi = m; }
  const q = (d - C[lo]) / (C[hi] - C[lo] || 1);
  return [lerp(P[lo][0], P[hi][0], q), lerp(P[lo][1], P[hi][1], q)];
}

/** Point at fraction f (0..1) of the length. */
export function pointAtFrac(P, f) {
  return pointAt(P, pathLen(P) * clamp01(f));
}

/** Leading part of P up to fraction frac of its length (a new array). */
export function subPath(P, frac) {
  if (!P || P.length === 0) return [];
  let want = pathLen(P) * clamp01(frac);
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const d = dist(P[i - 1], P[i]);
    if (want >= d) { out.push(P[i]); want -= d; }
    else { const k = want / (d || 1); out.push([lerp(P[i - 1][0], P[i][0], k), lerp(P[i - 1][1], P[i][1], k)]); break; }
  }
  return out;
}

/** Points every <= step px along each edge; closed paths come back round to P[0]. */
export function resample(P, closed, step) {
  const n = P.length;
  if (n === 0) return [];
  const s = step > 0 ? step : 1;
  const out = [], m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = P[i], b = P[(i + 1) % n], k = Math.max(1, Math.ceil(dist(a, b) / s));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  if (!closed) out.push(P[n - 1]);
  return out;
}

/** Open Catmull-Rom: per points per edge, passing through every input point. */
export function densify(P, per = 6) {
  const n = P.length;
  if (n < 2) return P.slice();
  const out = [], at = (i) => P[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(P[n - 1]);
  return out;
}

// -- Ribbon (variable-width stroke as a filled polygon) ---------------------------

/** riso taper law: width w, easing in over the first k and out over the last k of the length (k = 0: constant). */
export function taper(w = 6, k = 0.15) {
  if (!(k > 0)) return () => w;
  return (q) => w * Math.max(0, Math.min(1, q / k, (1 - q) / k)) ** 0.7;
}

const DEFAULT_W = taper(6, 0.15);

/** Closed polygon around P; w is a number or w(q, i) with q the arc-length fraction (0..1). */
export function ribbonPts(P, w = DEFAULT_W) {
  const n = P.length;
  if (n < 2) return [];
  const C = cumOf(P), total = C[n - 1] || 1, Lp = [], Rp = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const hw = (typeof w === 'function' ? w(C[i] / total, i) : w) / 2;
    Lp.push([P[i][0] - dy * hw, P[i][1] + dx * hw]);
    Rp.push([P[i][0] + dy * hw, P[i][1] - dx * hw]);
  }
  return Lp.concat(Rp.reverse());
}

function tracePoly(t, Q) {
  for (let i = 0; i < Q.length; i++) { if (i) t.lineTo(Q[i][0], Q[i][1]); else t.moveTo(Q[i][0], Q[i][1]); }
  t.closePath();
}

const RIB = new WeakMap();
/** ribbonPts as one Path2D, cached per (path array, w). Pass the same w (number or function object) to hit the cache. */
export function ribbon(P, w = DEFAULT_W) {
  let m = RIB.get(P);
  if (!m) { m = new Map(); RIB.set(P, m); }
  let p = m.get(w);
  if (!p) { p = new Path2D(); tracePoly(p, ribbonPts(P, w)); m.set(w, p); }
  return p;
}

// -- Draw-on ---------------------------------------------------------------------

/** Strokes the first d px of P with the current strokeStyle/lineWidth; returns the pen tip (= pointAt(P, d)). */
export function drawPartial(ctx, P, d, C = cumOf(P)) {
  const n = P.length;
  if (n === 0) return [0, 0];
  if (!(d > 0) || n < 2) return P[0];
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  let i = 1;
  for (; i < n && C[i] <= d; i++) ctx.lineTo(P[i][0], P[i][1]);
  let tip = P[n - 1];
  if (i < n) { tip = pointAt(P, d, C); ctx.lineTo(tip[0], tip[1]); }
  ctx.stroke();
  return tip;
}

/** Seconds a drawOn takes: o.dur, else min(o.cap (TIMING.tapCap), len / o.speed (TIMING.drawSpeed)). 0 under reduced motion. */
export function drawDuration(P, o = {}) {
  if (reducedMotion()) return 0;
  if (o.dur != null) return Math.max(0, o.dur);
  const speed = o.speed ?? TIMING.drawSpeed;
  return Math.min(o.cap ?? TIMING.tapCap, pathLen(P) / (speed > 0 ? speed : 1));
}

/**
 * P drawing itself at time t (seconds since its start).
 * o: speed, dur, cap, delay (s), ease (default ease.smooth),
 *    w      ribbon mode: fill a ribbon of width w (number or w(q, i)) with the current fillStyle
 *           (the cached ribbon(P, w) once done) instead of stroking,
 *    pen    a colour: pen dot on the tip while drawing; penR its radius (default max(4, 1.3 x lineWidth)).
 * Returns { tip, done, p }. Nothing is drawn before delay.
 */
export function drawOn(ctx, P, t, o = {}) {
  const D = drawDuration(P, o), C = cumOf(P), len = C[C.length - 1] || 0;
  const u = reducedMotion() || D <= 0 ? 1 : clamp01((t - (o.delay ?? 0)) / D);
  const p = u >= 1 ? 1 : (o.ease ?? ease.smooth)(u);
  const done = u >= 1;
  if (p <= 0 || P.length < 2) return { tip: P[0] || [0, 0], done, p };
  let tip;
  if (o.w != null) {
    if (done) { ctx.fill(ribbon(P, o.w)); tip = P[P.length - 1]; }
    else {
      const S = subPath(P, p);
      tip = S[S.length - 1];
      ctx.beginPath(); tracePoly(ctx, ribbonPts(S, o.w)); ctx.fill();
    }
  } else {
    tip = drawPartial(ctx, P, len * p, C);
  }
  if (o.pen && !done) {
    ctx.save();
    ctx.fillStyle = o.pen;
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], o.penR ?? Math.max(4, (ctx.lineWidth || 2) * 1.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return { tip, done, p };
}

// -- Reveal mask (diagram strokes only, never glyphs) ----------------------------------

/**
 * Union of square-capped bars of width w along P up to arc length d, traced into
 * `into` (default a new Path2D) for ctx.clip(). VideoScribe-style reveal: pair it with
 * zigzag() to uncover a finished drawing row by row. Every bar is wound the same way
 * so that, under the nonzero rule, overlapping bars never cancel each other out.
 * Use for Latin/diagram strokes only; text uses writeText.
 */
export function revealPath(P, d, w, C = cumOf(P), into = null) {
  const p = into || new Path2D(), h = w / 2;
  for (let i = 1; i < P.length && C[i - 1] < d; i++) {
    const a = P[i - 1], b0 = P[i], L = C[i] - C[i - 1];
    if (L <= 0) continue;
    const q = Math.min(1, (d - C[i - 1]) / L), b = [a[0] + (b0[0] - a[0]) * q, a[1] + (b0[1] - a[1]) * q];
    const ux = (b0[0] - a[0]) / L, uy = (b0[1] - a[1]) / L, nx = -uy * h, ny = ux * h;
    const A = [a[0] - ux * h, a[1] - uy * h], B = [b[0] + ux * h, b[1] + uy * h];
    p.moveTo(A[0] + nx, A[1] + ny); p.lineTo(B[0] + nx, B[1] + ny); p.lineTo(B[0] - nx, B[1] - ny); p.lineTo(A[0] - nx, A[1] - ny); p.closePath();
  }
  return p;
}

/** Boustrophedon scan: rows + 1 points down the box (x, y, w, h), left-right-left. */
export function zigzag(x, y, w, h, rows) {
  const o = [];
  for (let r = 0; r <= rows; r++) { const yy = y + h * r / rows; o.push(r % 2 ? [x + w, yy] : [x, yy]); }
  return o;
}

/** Runs fn() clipped to revealPath(P, d, w); nothing before d > 0; no clip at rest (d >= len). */
export function withReveal(ctx, P, d, w, fn) {
  if (!(d > 0)) return;
  if (d >= pathLen(P)) { fn(); return; }
  ctx.save();
  ctx.clip(revealPath(P, d, w));
  fn();
  ctx.restore();
}

// -- Text ----------------------------------------------------------------------------

let SEG = null;
const GRAPH = new Map();
/** Grapheme clusters of str (Intl.Segmenter 'grapheme', fallback Array.from). Cached. */
export function graphemes(str) {
  const s = String(str);
  let g = GRAPH.get(s);
  if (g) return g;
  if (SEG === null) {
    SEG = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : false;
  }
  g = SEG ? Array.from(SEG.segment(s), (x) => x.segment) : Array.from(s);
  GRAPH.set(s, g);
  return g;
}

/** Write units: 'grapheme' (default) or 'word' (each space run is its own unit). */
export function units(str, mode = 'grapheme') {
  if (mode === 'word') return String(str).split(/( +)/).filter((x) => x.length > 0);
  return graphemes(str);
}

const ADV = new Map();
/**
 * Prefix advances for str's units in font: [0, w(u0), w(u0 u1), ..., total]
 * (measured on prefixes, so kerning and shaping are kept). Cached by font|mode|str;
 * a second call returns the identical array. Measure once, never per frame.
 */
export function advances(ctx, font, str, mode = 'grapheme') {
  const k = font + '|' + mode + '|' + str;
  let v = ADV.get(k);
  if (v) return v;
  const U = units(str, mode);
  ctx.save();
  ctx.font = font;
  v = [0];
  let pre = '';
  for (const u of U) { pre += u; v.push(ctx.measureText(pre).width); }
  ctx.restore();
  ADV.set(k, v);
  return v;
}

/** 3b1b Write lag ratio for n units: min(4 / (n + 1), 0.2). */
export function writeLag(n) {
  return Math.min(4 / (n + 1), 0.2);
}

/**
 * One unit mid-Write at x, y (textAlign left, baseline as set by the caller).
 * p 0..1: the outline dash draws on over the first half, the fill fades in over the second.
 * p >= 1 is exactly a plain fillText. The outline alpha also ramps with the dash, so a
 * browser that ignores line dashes on strokeText still fades in rather than popping.
 */
export function writeGlyph(ctx, ch, x, y, size, col, p, a = 1) {
  if (p <= 0 || a <= 0) return;
  if (p >= 1) {
    ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillText(ch, x, y); ctx.globalAlpha = 1;
    return;
  }
  const sm = ease.smoothM;
  const dashP = sm(clamp01(p * 2)), fillA = sm(clamp01(p * 2 - 1));
  if (fillA < 1) {
    ctx.globalAlpha = a * (1 - fillA * 0.85) * Math.min(1, dashP * 3);
    ctx.setLineDash([dashP * size * 4, 99999]);
    ctx.lineWidth = Math.max(1.2, size * 0.035);
    ctx.strokeStyle = col;
    ctx.strokeText(ch, x, y);
    ctx.setLineDash([]);
  }
  if (fillA > 0) { ctx.globalAlpha = a * fillA; ctx.fillStyle = col; ctx.fillText(ch, x, y); }
  ctx.globalAlpha = 1;
}

/**
 * Write str at group progress p (0..1); unit i runs on laggedP with the 3b1b ratio, so the
 * last unit ends exactly at p = 1. At p >= 1 the whole string is one fillText (full shaping).
 * o: font (CSS font string; default 700 size px sans-serif), col (required colour token),
 *    align 'left' | 'center' (default) | 'right', alpha, mode 'grapheme' | 'word', lag.
 * Returns the string's width.
 */
export function writeText(ctx, str, x, y, size, p, o = {}) {
  const f = o.font || ('700 ' + size + 'px sans-serif');
  const mode = o.mode || 'grapheme';
  const adv = advances(ctx, f, str, mode), tw = adv[adv.length - 1];
  const x0 = o.align === 'left' ? x : o.align === 'right' ? x - tw : x - tw / 2;
  const a = o.alpha ?? 1;
  const pp = reducedMotion() ? 1 : p;
  if (pp <= 0 || a <= 0) return tw;
  ctx.save();
  ctx.font = f;
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (pp >= 1) {
    writeGlyph(ctx, str, x0, y, size, o.col, 1, a);
  } else {
    const U = units(str, mode), vis = [];
    for (let i = 0; i < U.length; i++) if (U[i].trim()) vis.push(i);
    const n = vis.length, r = o.lag ?? writeLag(n);
    for (let j = 0; j < n; j++) {
      const i = vis[j];
      writeGlyph(ctx, U[i], x0 + adv[i], y, size, o.col, laggedP(pp, j, n, r), a);
    }
  }
  ctx.restore();
  return tw;
}

/** Time-based writeText: the whole write takes o.dur (default TIMING.tapCap) after o.delay. Returns { width, done, p }. */
export function writeOn(ctx, str, x, y, size, t, o = {}) {
  const D = reducedMotion() ? 0 : (o.dur ?? TIMING.tapCap);
  const u = D <= 0 ? 1 : clamp01((t - (o.delay ?? 0)) / D);
  const width = writeText(ctx, str, x, y, size, u, o);
  return { width, done: u >= 1, p: u };
}
