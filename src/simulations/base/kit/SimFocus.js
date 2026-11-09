/** SimFocus.js
 * SimFocus - show one part of a diagram (recipe R8; labelled-diagram practice).
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   Adapted from animate@7e5eb56 plugins/animate/skills/animate/styles/math/kit.js (MIT, (c) 2026 cth9191)
 *   Adapted from animate@7e5eb56 plugins/animate/skills/animate/styles/sketchbook/kit.js (MIT, (c) 2026 cth9191)
 *   Adapted from huashu-art-motion@64cb272 scripts/engine/lib/diagram.js (MIT, (c) 2026 alchaincyf)
 *   Adapted from huashu-art-motion@64cb272 scripts/engine/lib/render.js (MIT, (c) 2026 alchaincyf)
 *   Adapted from anatomy@e6600ff kit/iso-kit.mjs (MIT, (c) 2026 Ryan)
 *   Adapted from anatomy@e6600ff examples/raptor-engine/raptor.css (MIT, (c) 2026 Ryan)
 *   Original code: toneMix, focusK, tintOf, numberBadge, legendChips, chipHit, outline builders.
 *
 * What is here:
 *   focusTone     per-part { fill, shade, edge, ink, role } for a focus state: the focused
 *                 part = c.accent (the ONE focus colour), structure = c.label edge, every
 *                 other part one tone down (toward c.bgSurface). Build at enter() / on a
 *                 focus change, never per frame.
 *   toneMix       cross-fade two tone tables by k (only while a change is settling)
 *   focusK        0..1 focus transition (SimAnim settle over FOCUS_S); focusSettled(age)
 *   indicate      manim Indicate: { s, k } there-and-back scale 1 -> 1 + k -> 1 and tint amount
 *   tintOf        colour pushed toward c.accent (or another token) by k
 *   flashAt       manim Flash: 12 rays burst out and vanish. Reserved for THE answer.
 *   sparkle       four ticks that open and close over k 0..1
 *   outlineOf, rectOutline, ellipseOutline   precomputed closed outlines for outlineSweep
 *   outlineSweep  manim Circumscribe: a stroke runs round an outline and is taken away
 *   brace         a curly brace that grows from its middle out to both ends
 *   underline     a slightly bowed underline, drawn on from the left
 *   dimOutside    two-pass lit clip: drawLit runs once clipped to the path
 *   fadeAlong     a polyline whose ends fade out (smoothstep law, 1/20 alpha levels)
 *   fadeAlpha, fadePieces   the pure maths behind fadeAlong
 *   numberBadge   a numbered disc on the art (words stay out of the art)
 *   legendChips   numbered legend chips that map to parts; chipHit(boxes, p) -> index
 *
 * Geometry is in the 680x520 design space. Constants measured on the sources'
 * 1080-wide (animate) and 1920x1080 (huashu) frames are rescaled; each says so.
 * Every animated helper draws its end state under reduced motion. ASCII only.
 */
import { ease, settle, reducedMotion } from './SimAnim.js';
import { W, H, mix, darken, inkOn, font, chipColumn, chipRow } from './SimLook.js';

const TAU = Math.PI * 2;
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;

// -- Timings ------------------------------------------------------------------

/** Focus cross-fade (s). */
export const FOCUS_S = 0.25;
/** Indicate pulse (s). */
export const INDICATE_S = 0.6;
/** Flash run (s): manim Flash run time, about 0.4 s. */
export const FLASH_S = 0.4;
/** Sparkle open-and-close (s). */
export const SPARKLE_S = 0.5;
/** Circumscribe run (s). */
export const SWEEP_S = 1.0;

// -- Focus tones (anatomy raptor.css:138-149 mapping) ---------------------------

// One tone step down: toward the panel colour, so a dimmed part recedes without a
// grey scrim and without any new colour.
const STEP_DOWN = 0.55;

function toneOf(c, base, role) {
  if (role === 'focus') {
    const fill = c.accent;
    return { fill, shade: darken(fill, 0.22), edge: darken(fill, 0.35), ink: inkOn(c, fill), role };
  }
  if (role === 'down') {
    const fill = mix(base, c.bgSurface, STEP_DOWN);
    return { fill, shade: mix(darken(base, 0.22), c.bgSurface, STEP_DOWN), edge: c.labelMuted, ink: c.labelMuted, role };
  }
  if (role === 'structure') {
    return { fill: base, shade: darken(base, 0.22), edge: c.label, ink: c.label, role };
  }
  return { fill: base, shade: darken(base, 0.22), edge: darken(base, 0.35), ink: inkOn(c, base), role: 'base' };
}

/**
 * Tone table for a focus state.
 *   parts: [{ id, base, structure? }]  base = a resolved colour (c.s3, mix(...) at enter())
 *   focusId: null = no focus (every part at its base), else that part's id
 *   o.lit: ids kept at base while the rest step down; passing lit (even []) turns
 *          on the step-down without an accent (a group view)
 * Returns { [id]: { fill, shade, edge, ink, role } }, role one of
 * 'focus' | 'base' | 'structure' | 'down'. Structure parts always keep a c.label edge.
 * At most one part gets c.accent.
 */
export function focusTone(c, parts, focusId = null, o = {}) {
  const lit = o.lit ? new Set(o.lit) : null;
  const focusing = focusId != null || lit != null;
  const out = {};
  let accentUsed = false;
  for (const p of parts) {
    if (out[p.id]) continue;   // a repeated id keeps its first entry
    let role = 'base';
    if (p.structure) role = 'structure';
    else if (focusing) {
      if (!accentUsed && p.id === focusId) { role = 'focus'; accentUsed = true; }
      else if (lit && lit.has(p.id)) role = 'base';
      else role = 'down';
    }
    out[p.id] = toneOf(c, p.base, role);
  }
  return out;
}

/** Cross-fade between two tone tables (same ids): k = 0 gives a, k = 1 gives b (the same objects). */
export function toneMix(a, b, k) {
  if (!a || k >= 1) return b;
  if (k <= 0) return a;
  const out = {};
  for (const id of Object.keys(b)) {
    const x = a[id], y = b[id];
    if (!x) { out[id] = y; continue; }
    out[id] = {
      fill: mix(x.fill, y.fill, k), shade: mix(x.shade, y.shade, k),
      edge: mix(x.edge, y.edge, k), ink: k < 0.5 ? x.ink : y.ink, role: y.role,
    };
  }
  return out;
}

/** Focus transition 0..1, age seconds since the focus changed (1 under reduced motion). */
export function focusK(age, d = FOCUS_S) {
  return settle(age, d);
}
/** True once a focus change has finished cross-fading (feed !focusSettled to busy()). */
export function focusSettled(age, d = FOCUS_S) {
  return reducedMotion() || age >= d;
}

// -- Indicate, flash, sparkle (animate math/kit.js:233-239, sketchbook/kit.js:319-322) --

/**
 * manim Indicate: s = 1 + k * thereBack(u) (scale about the part's centre), k =
 * thereBack(u) (tint amount, huashu diagram.js:152). u 0..1 over INDICATE_S.
 * indicate(0) = indicate(1) = { s: 1, k: 0 }; peak s = 1 + k at u = 0.5.
 */
export function indicate(u, k = 0.2) {
  if (reducedMotion()) return { s: 1, k: 0 };
  const tb = ease.thereBack(clamp01(u));
  return { s: 1 + k * tb, k: tb };
}

/** A colour pushed toward `to` (default c.accent) by k. Per frame only while k is moving. */
export function tintOf(c, col, k, to = c.accent) {
  if (k <= 0) return col;
  if (k >= 1) return to;
  return mix(col, to, k);
}

/**
 * manim Flash at (x, y): 12 short rays burst outward with alpha 1 - u. Nothing at
 * u <= 0 or u >= 1 (or under reduced motion: its end state is nothing).
 * r: 34 at 1080 wide in the source, so 21 at 680; w: 4 -> 2.5.
 * Reserved for THE answer (one per question, never decoration).
 */
export function flashAt(ctx, x, y, u, col, r = 21, w = 2.5) {
  if (u <= 0 || u >= 1 || reducedMotion()) return;
  const r0 = r + r * 1.3 * ease.smoothM(u);
  const r1 = r + r * 2.5 * ease.smoothM(u * 1.4);
  ctx.save();
  ctx.globalAlpha *= 1 - u;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.moveTo(x + r0 * ca, y + r0 * sa);
    ctx.lineTo(x + r1 * ca, y + r1 * sa);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Four ticks that open and close over k 0..1 (size r * sin(pi k)); nothing at
 * k <= 0 or k >= 1 or under reduced motion. Source jitter dropped. w: 3.5 at
 * 1080 -> 2.2 at 680.
 */
export function sparkle(ctx, x, y, r, k, col, w = 2.2) {
  if (k <= 0 || k >= 1 || reducedMotion()) return;
  const rr = r * Math.sin(Math.PI * k);
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.moveTo(x + ca * rr * 0.25, y + sa * rr * 0.25);
    ctx.lineTo(x + ca * rr, y + sa * rr);
  }
  ctx.stroke();
  ctx.restore();
}

// -- Outlines and circumscribe (huashu diagram.js:154-159) -----------------------

/** Closed outline with its cumulative arc length, built once: { pts, cum, total }. */
export function outlineOf(pts) {
  const P = pts.slice();
  if (P.length && (P[0][0] !== P[P.length - 1][0] || P[0][1] !== P[P.length - 1][1])) P.push(P[0]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { pts: P, cum, total: cum[cum.length - 1] || 0 };
}

const OUTLINE_CACHE = new Map();
function cached(key, build) {
  let v = OUTLINE_CACHE.get(key);
  if (!v) {
    if (OUTLINE_CACHE.size > 256) OUTLINE_CACHE.clear();
    v = build();
    OUTLINE_CACHE.set(key, v);
  }
  return v;
}

/** Rounded-rect outline (cached by its numbers), starting top-left like huashu rectPts. */
export function rectOutline(x, y, w, h, r = 0) {
  return cached('r' + [x, y, w, h, r].join(','), () => {
    const R = Math.max(0, Math.min(r, w / 2, h / 2));
    const pts = [];
    const corner = (cx, cy, a0) => {
      if (R <= 0) { pts.push([cx, cy]); return; }
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
    };
    if (R > 0) {
      corner(x + R, y + R, Math.PI);
      corner(x + w - R, y + R, -Math.PI / 2);
      corner(x + w - R, y + h - R, 0);
      corner(x + R, y + h - R, Math.PI / 2);
    } else {
      pts.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
    }
    return outlineOf(pts);
  });
}

/** Ellipse outline (cached), starting at the top. */
export function ellipseOutline(cx, cy, rx, ry, n = 72) {
  return cached('e' + [cx, cy, rx, ry, n].join(','), () => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return outlineOf(pts);
  });
}

function pointOn(ol, s) {
  const { pts, cum } = ol;
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m] < s) lo = m + 1; else hi = m;
  }
  const i = Math.max(1, lo);
  const span = cum[i] - cum[i - 1] || 1;
  const t = clamp01((s - cum[i - 1]) / span);
  return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)];
}

// Adds the stretch [s0, s1] of a polyline (arc lengths) to the current path.
function addStretch(ctx, ol, s0, s1) {
  const a = pointOn(ol, s0);
  ctx.moveTo(a[0], a[1]);
  const { pts, cum } = ol;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > s0 && cum[i] < s1) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  const b = pointOn(ol, s1);
  ctx.lineTo(b[0], b[1]);
}

/**
 * manim Circumscribe on a precomputed outline (outlineOf / rectOutline /
 * ellipseOutline): the stroke runs round, then its tail catches up. Nothing at
 * p <= 0 or p >= 1. Tailoring: the last 15% fades out so it never pops off.
 * o: { col, lw = 3 (design units; the source's 4 is on a 1920 frame), tw = 0.3 }
 */
export function outlineSweep(ctx, ol, p, o = {}) {
  if (p <= 0 || p >= 1 || reducedMotion() || !ol || ol.total <= 0) return;
  const tw = o.tw ?? 0.3;
  const hi = clamp01(lerp(0, 1 + tw, p));
  const lo = clamp01(hi - tw - (1 - p) * 0.7);
  if (hi - lo <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, (1 - p) / 0.15);
  ctx.strokeStyle = o.col;
  ctx.lineWidth = o.lw ?? 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  addStretch(ctx, ol, lo * ol.total, hi * ol.total);
  ctx.stroke();
  ctx.restore();
}

// -- Brace and underline (huashu diagram.js:161-169; animate sketchbook/kit.js:187-189) --

/**
 * Vertical curly brace at x from y0 to y1, growing from its middle out (p 0..1).
 * The tip points left (dir = 1, as in the source) or right (dir = -1).
 * o: { col, lw = 3, depth = 14, p = 1, dir = 1 }. depth 22 and the 40 px end
 * cap are on a 1080-high frame: 14 and 20 here.
 */
export function brace(ctx, x, y0, y1, o = {}) {
  let p = o.p ?? 1;
  if (p <= 0) return;
  if (reducedMotion()) p = 1;
  const dir = o.dir === -1 ? -1 : 1;
  const depth = (o.depth ?? 14) * dir;
  const cap = 20;
  const ym = (y0 + y1) / 2;
  const k = ease.smooth(p);
  const a0 = lerp(ym, y0, k), a1 = lerp(ym, y1, k);
  const e0 = Math.min(cap, Math.abs(ym - a0) * 0.3) * Math.sign(ym - a0 || 1);
  const e1 = Math.min(cap, Math.abs(a1 - ym) * 0.3) * Math.sign(a1 - ym || 1);
  const xm = x - depth * 0.5;
  ctx.save();
  ctx.strokeStyle = o.col;
  ctx.lineWidth = o.lw ?? 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha *= clamp01(p * 1.5);
  ctx.beginPath();
  ctx.moveTo(x, a0);
  ctx.quadraticCurveTo(xm, a0, xm, a0 + e0);
  ctx.lineTo(xm, ym - e0);
  ctx.quadraticCurveTo(xm, ym, x - depth, ym);
  ctx.quadraticCurveTo(xm, ym, xm, ym + e1);
  ctx.lineTo(xm, a1 - e1);
  ctx.quadraticCurveTo(xm, a1, x, a1);
  ctx.stroke();
  ctx.restore();
  return { a0, a1, tipX: x - depth, tipY: ym };
}

/**
 * A slightly bowed underline from x0 to x1 under y, drawn on from the left (p).
 * Wobble dropped. o: { col, w = 3, bow = 4, p = 1 } (source 5 px and 6 px bow
 * at 1080 wide).
 */
export function underline(ctx, x0, x1, y, o = {}) {
  let p = o.p ?? 1;
  if (p <= 0) return;
  if (reducedMotion()) p = 1;
  p = clamp01(p);
  const A = [x0 - 4, y], C = [x1 + 6, y - 3];
  const M = [lerp(x0, x1, 0.5), y + (o.bow ?? 4)];
  // Quadratic through A, M, C at t = 0.5.
  const Q = [2 * M[0] - (A[0] + C[0]) / 2, 2 * M[1] - (A[1] + C[1]) / 2];
  const n = 20;
  const m = Math.max(1, Math.ceil(n * p));
  ctx.save();
  ctx.strokeStyle = o.col;
  ctx.lineWidth = o.w ?? 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  for (let i = 1; i <= m; i++) {
    const t = Math.min(p, i / n);
    const u = 1 - t;
    ctx.lineTo(u * u * A[0] + 2 * u * t * Q[0] + t * t * C[0], u * u * A[1] + 2 * u * t * Q[1] + t * t * C[1]);
  }
  ctx.stroke();
  ctx.restore();
}

// -- Lit clip (huashu render.js:99 clipBeside, two-pass) ------------------------

function addPath(ctx, path) {
  if (typeof path === 'function') path(ctx);
}

/**
 * Two-pass lit clip. path: a Path2D, or a function(ctx) that ADDS subpaths to
 * the current path (no beginPath inside). drawLit(ctx) runs exactly once,
 * clipped to the path; o.drawDim(ctx) (optional) runs once first, clipped to
 * everything outside it, so nothing is drawn twice. Call it once per non-focus
 * group (never once per shape). o: { drawDim, w = W, h = H }.
 */
export function dimOutside(ctx, path, drawLit, o = {}) {
  const fw = o.w ?? W, fh = o.h ?? H;
  if (o.drawDim) {
    ctx.save();
    if (typeof path === 'function') {
      ctx.beginPath();
      ctx.rect(-60, -60, fw + 120, fh + 120);
      addPath(ctx, path);
      ctx.clip('evenodd');
    } else {
      const m = new Path2D();
      m.rect(-60, -60, fw + 120, fh + 120);
      m.addPath(path);
      ctx.clip(m, 'evenodd');
    }
    o.drawDim(ctx);
    ctx.restore();
  }
  ctx.save();
  if (typeof path === 'function') {
    ctx.beginPath();
    addPath(ctx, path);
    ctx.clip();
  } else {
    ctx.clip(path);
  }
  drawLit(ctx);
  ctx.restore();
}

// -- Fading line ends (anatomy iso-kit.mjs:455-519) --------------------------------

/** Lowest alpha a fading piece may have; anything at or below is not drawn. */
export const FADE_MIN = 0.02;
const FADE_LEVELS = 20;
const sstep = (t) => t * t * (3 - 2 * t);

function fadeSpan(total, fade) {
  let [a, b] = Array.isArray(fade) ? fade : [fade, fade];
  a = Math.max(0, a || 0); b = Math.max(0, b || 0);
  if (a + b > total && a + b > 0) {
    const share = total / (a + b);
    a *= share; b *= share;
  }
  return [a, b];
}

/**
 * Alpha at arc length s on a line of length total whose start fades over a and
 * end over b (smoothstep law). fadeAlpha(0, L, a > 0, b) = 0.
 */
export function fadeAlpha(s, total, a, b = a) {
  const [fa, fb] = fadeSpan(total, [a, b]);
  let al = 1;
  if (fa > 0 && s < fa) al = sstep(clamp01(s / fa));
  if (fb > 0 && s > total - fb) al = Math.min(al, sstep(clamp01((total - s) / fb)));
  return al;
}

const FADE_CACHE = new WeakMap();

/**
 * The pure split behind fadeAlong: pieces grouped by alpha level (multiples of
 * 1/20), as [{ alpha, lines: [[[x, y], ...], ...] }]. No piece at or below
 * FADE_MIN. step: ramp piece length in design px. Cached per points array.
 */
export function fadePieces(pts, fade = [0, 0], step = 3) {
  if (!pts || pts.length < 2) return [];
  const key = String(fade) + '|' + step;
  let per = FADE_CACHE.get(pts);
  if (per && per.has(key)) return per.get(key);
  const ol = { pts, cum: [0], total: 0 };
  for (let i = 1; i < pts.length; i++) ol.cum.push(ol.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = ol.cum[ol.cum.length - 1];
  const groups = new Map();
  const put = (alpha, s0, s1) => {
    const level = Math.min(1, Math.round(alpha * FADE_LEVELS) / FADE_LEVELS);
    if (!(alpha > FADE_MIN) || !(level > FADE_MIN)) return;
    const line = [pointOn(ol, s0)];
    for (let i = 0; i < pts.length; i++) if (ol.cum[i] > s0 + 1e-6 && ol.cum[i] < s1 - 1e-6) line.push(pts[i]);
    line.push(pointOn(ol, s1));
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(line);
  };
  if (total > 1e-6) {
    const [a, b] = fadeSpan(total, fade);
    const ramp = (s0, s1) => {
      const n = Math.max(1, Math.ceil((s1 - s0) / step));
      for (let i = 0; i < n; i++) {
        const u0 = s0 + ((s1 - s0) * i) / n, u1 = s0 + ((s1 - s0) * (i + 1)) / n;
        put(fadeAlpha((u0 + u1) / 2, total, a, b), u0, u1);
      }
    };
    if (a > 0.05) ramp(0, a);
    if (total - a - b > 0.05) put(1, a, total - b);
    if (b > 0.05) ramp(total - b, total);
  }
  const out = [...groups].map(([alpha, lines]) => ({ alpha, lines })).sort((x, y) => x.alpha - y.alpha);
  if (!per) { per = new Map(); FADE_CACHE.set(pts, per); }
  per.set(key, out);
  return out;
}

/**
 * Stroke a polyline whose ends fade out: "a texture ends by fading, never by
 * stopping". One stroke per alpha level. Pass the SAME pts array every frame
 * (the split is cached on it).
 * o: { fade = [a, b] (px; a number fades both ends), col, w = 2, step = 3 }
 * Returns the pieces drawn (fadePieces).
 */
export function fadeAlong(ctx, pts, o = {}) {
  const pieces = fadePieces(pts, o.fade ?? [0, 0], o.step ?? 3);
  if (!pieces.length) return pieces;
  ctx.save();
  const a0 = ctx.globalAlpha ?? 1;
  ctx.strokeStyle = o.col;
  ctx.lineWidth = o.w ?? 2;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  for (const g of pieces) {
    ctx.globalAlpha = a0 * g.alpha;
    ctx.beginPath();
    for (const line of g.lines) {
      ctx.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
    }
    ctx.stroke();
  }
  ctx.restore();
  return pieces;
}

// -- Numbers on the art, words in the legend (original) ------------------------------

/**
 * A numbered disc on the art with a darker lip (the flat chip look).
 * o: { bg = c.bgSurface, ink, r = 13, scale = 1, alpha = 1 }
 */
export function numberBadge(ctx, c, n, x, y, o = {}) {
  const s = o.scale ?? 1;
  const a = o.alpha ?? 1;
  if (s <= 0.02 || a <= 0) return;
  const r = (o.r ?? 13) * s;
  const bg = o.bg ?? c.bgSurface;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.beginPath();
  ctx.arc(x, y + 2.5 * s, r, 0, TAU);
  ctx.fillStyle = darken(bg, 0.38);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = font(c, 800, Math.max(14, Math.round(r * 1.15)), true);
  ctx.fillStyle = o.ink ?? inkOn(c, bg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + s);
  ctx.restore();
}

function numberIcon(c, n, bg) {
  return (ctx, x, y, r) => {
    const ink = inkOn(c, bg);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r * 1.1, 9.5), 0, TAU);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.font = font(c, 800, Math.max(14, Math.round(r * 1.3)), true);   // 14 px kit type floor
    ctx.fillStyle = bg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5);
  };
}

/**
 * Numbered legend chips (SimLook pill look) that map to parts, so the art
 * carries only numbers and the words live here.
 *   items: [{ n, text, bg?, scale?, alpha?, pop? | age? + at? }]
 *          bg: the part's tone fill (focusTone) so a chip matches its part
 *   o: { focus = -1 (index: c.accent chip, others step down when no bg given),
 *        layout: 'column' (default) | 'row', gap, size, align, wrapAt }
 * Returns { boxes, hit(p) } where hit(p) is the chip index under p, or -1.
 */
export function legendChips(ctx, c, items, x, y, o = {}) {
  const focus = o.focus ?? -1;
  const chips = items.map((it, i) => {
    const bg = it.bg ?? (i === focus ? c.accent : focus >= 0 ? mix(c.raised ?? c.bgSurface, c.bgSurface, 0.3) : (c.raised ?? c.bgSurface));
    return {
      text: it.text, bg, scale: it.scale, alpha: it.alpha, pop: it.pop, age: it.age, at: it.at,
      icon: numberIcon(c, it.n ?? i + 1, bg),
    };
  });
  const lay = { gap: o.gap ?? 10, size: o.size ?? 16, align: o.align, wrapAt: o.wrapAt };
  const boxes = o.layout === 'row' ? chipRow(ctx, c, chips, x, y, lay) : chipColumn(ctx, c, chips, x, y, lay);
  return { boxes, hit: (p) => chipHit(boxes, p) };
}

/** Index of the box under p (pad px of slack for a finger), else -1. */
export function chipHit(boxes, p, pad = 4) {
  if (!p) return -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b) continue;
    if (p.x >= b.x0 - pad && p.x <= b.x0 + b.w + pad && p.y >= b.y0 - pad && p.y <= b.y0 + b.h + pad) return i;
  }
  return -1;
}
