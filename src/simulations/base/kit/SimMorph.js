/** SimMorph.js
 * SimMorph - shape morphs, equation term morphs, counters, keyword pops and a highlighter (recipe R11).
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/kit/morph.js (MIT, (c) 2026 cth9191) - byAngle, coverScale (maskK)
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/math/kit.js (MIT, (c) 2026 cth9191) - transformTerms (transformTex algorithm), texBox (termBox)
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/sketchbook/kit.js (MIT, (c) 2026 cth9191) - highlighterSweep (highlight, no wobble)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/diagram.js (MIT, (c) 2026 alchaincyf) - rectPts, circlePts, morphPoints (DG.morph), drawShape (DG.shape)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/typo.js (MIT, (c) 2026 alchaincyf) - countUp (TY.count), tabular, keywordPop (TY.keyword + TY.rise)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/motion.js (MIT, (c) 2026 alchaincyf) - springHz, expoOut
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/engine.js (MIT, (c) 2026 alchaincyf) - odometer (U.odometer)
 *   Original code: morphPair, drawMorph, termLayout (on SimText measureMath), the caches, reduced-motion end states.
 *   The pure parts (outlines, schedules, term matching) live in SimMorphSpec.js and are re-exported here;
 *   SimMorphSvg.js is the SVG/DOM renderer of the same recipes.
 *
 * Shapes (pure; compute once per pair at setup, never per frame):
 *   byAngle(P, m = 96)             closed outline resampled to m points by angle round its centroid
 *                                  -> { P, c }; cached per (P array, m). Starts at angle -PI (west), goes clockwise on screen.
 *   coverScale(P, w = W, h = H)    -> { c, kmax }: how far P must scale about its centroid to cover the frame
 *   morphPair(A, B, m = 96)        -> [byAngle(A).P, byAngle(B).P]: two outlines ready for morphPoints
 *   rectPts(cx, cy, w, h, n = 64)  rectangle outline from the top-left corner, clockwise
 *   circlePts(cx, cy, r, n = 64)   circle outline from the same top-left direction (-3PI/4), clockwise
 *   morphPoints(A, B, p)           point-wise lerp (A and B must have the same length)
 *   drawShape(ctx, P, o)           fill/stroke a closed outline: o = { fill, stroke, lw = 2 }
 *   drawMorph(ctx, A, B, p, o)     drawShape(morphPoints(A, B, p)). Draw the RESTING shape with drawMorph too
 *                                  (p = 0 or 1), never with a different primitive (rect/arc): huashu t1_s1 rule,
 *                                  so the first morph frame does not jump.
 *   Concave input: byAngle takes, per ray from the centroid, the boundary point nearest in angle (ties: the
 *   farther one). For a STAR-SHAPED outline (every boundary point visible from the centroid: convex shapes,
 *   stars, blobs) the result is in angle order and does not self-cross. For a shape that is not star-shaped
 *   (a U, a C, a crescent) a ray crosses the boundary more than once and the choice is NOT clean: the tie
 *   rule only fires on equal angles, so between near-equal candidates the result saw-tooths between the
 *   notch wall and the outer edge. Measured (unit test): a 120 px U whose vertex centroid falls in its
 *   notch comes back with no self-crossings but 26 radius reversals and +7% area - visibly jagged.
 *   Morph such shapes by your own correspondence (e.g. both from rectPts-style arc-length sampling).
 *
 * Numbers:
 *   expoOut(p)                     1 - 2^(-10p), exactly 1 at p >= 1 (huashu MO.expoOut)
 *   countUp(a, b, t, dur, ease)    value at t seconds of a count from a to b over dur (default expoOut); exactly b at t >= dur
 *   tabularWidths(ctx)             cached { digit, of(ch) } for ctx.font: every digit is as wide as '0'
 *   tabularLayout(ctx, str, x, align) -> { xs, ws, w }: per-character centres and widths (cached widths)
 *   tabular(ctx, str, x, y, o)     fillText each character in a fixed digit cell (canvas has no tnum); returns total width
 *   odometerP(i, n, p, stagger)    roll progress of character i of n (the last, lowest digit starts first)
 *   odometer(ctx, fromStr, toStr, x, y, p, o)  each character rolls up from old to new, clipped to its cell;
 *                                  o = { size, align = 'right', stagger = 0.12 }; ctx.font/fillStyle set by caller.
 *                                  Returns { w, done }.
 *
 * Words:
 *   springHz(t, freq = 2.5, decay = 9)  1 - e^(-decay t) cos(2 PI freq t) (huashu MO.springHz)
 *   KEYWORD_RISE = 0.35, KEYWORD_PIN = 1.35, KEYWORD_SETTLE = 0.8
 *   keywordPop(t, tIn, tHit)       -> { rise, scale, done }: rises out of a slot over 0.35 s from tIn (expoOut),
 *                                  then from tHit springs to 1.35x and pins (overshoot to about 1.41).
 *                                  scale is the number a highlighter/underline follows.
 *   drawKeyword(ctx, text, x, y, size, kp)  draws it (left/baseline anchor; ctx.font + fillStyle set by caller)
 *   highlighterSweep(ctx, c, x0, x1, y, h, part, o)  a marker swipe behind a word: outCubic growth, butt cap,
 *                                  overshoot 0.1 h each end, a 0.06 h slant, no wobble. Default colour c.gold.
 *                                  o = { col, a = 0.8, scale = 1 (grows about the left end, follows keywordPop),
 *                                  blend }. blend defaults to 'multiply' on a light backdrop and to 'source-over'
 *                                  on a dark one (multiply of gold on a dark card is invisible): draw the swipe
 *                                  BEFORE the word, and ink the word with inkOn(c, c.gold) on a dark theme.
 *
 * Equations (built on SimText measureMath/drawMath parts):
 *   A term list is an array of SimText parts ('2x', ' + ', ['sub', 'H', '2'], ['frac', 1, 2], ...), where any
 *   part may be wrapped as { p: part, id, col }. Default id: the part's text (trimmed; JSON for array parts)
 *   + '#' + occurrence, so the first ' = ' in A matches the first ' = ' in B.
 *   termLayout(ctx, c, parts, o)   -> { items: [{ id, key, part, x, w, col }], w, asc, desc } (x from the run's left);
 *                                  positions equal drawMath's for the same parts. Cached by (parts, size, weight, fonts).
 *   termBox(ctx, c, parts, id, x, y, o)  screen box { x0, x1, y0, y1, cx, cy } of the parts with that id
 *   transformTerms(ctx, c, A, B, x, y, u, o)  manim TransformMatchingTex. Per id:
 *                                  same text in A and B -> glide, colour lerped with o.mix (default SimLook mix);
 *                                  different text -> cross-fade while translating between group centroids
 *                                  (A alpha 1 - clamp(1.6 s), B alpha clamp(1.6 s - 0.6));
 *                                  only in A -> fade out (1 - clamp(2 s)); only in B -> fade in (clamp(2 s - 1)).
 *                                  s = o.ease(u) (default smoothM). o = { size = 32, weight = 800, display = true,
 *                                  align = 'center', col, mix, ease, alpha = 1 }. Returns { w, done }.
 *
 * Reduced motion: countUp -> b, odometer -> toStr, keywordPop -> rise 1 / scale 1.35 from tHit,
 * highlighterSweep -> full swipe, transformTerms -> B. Shape morph helpers take p; a scene drives p
 * from SimAnim.dur() so it lands on the end shape.
 * Design space 680x520; the byAngle resample step is 2.5 px (animate's 4 px at 1080 wide, x 680/1080).
 */
import { ease, reducedMotion } from './SimAnim.js';
import { W, H, mix as lookMix, luma, font } from './SimLook.js';
import { measureMath, drawMath } from './SimText.js';
import {
  centroidOf, byAngle, morphPoints, odometerP, highlighterGeom, termItems, termPlan, termAlpha,
} from './SimMorphSpec.js';

export {
  byAngle, morphPair, rectPts, circlePts, morphPoints, expoOut, countUp, odometerP,
  springHz, KEYWORD_RISE, KEYWORD_PIN, KEYWORD_SETTLE, keywordPop,
} from './SimMorphSpec.js';

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;

// -- Shapes ---------------------------------------------------------------------

/** How far P must scale about its centroid to cover a w x h frame (the window-grow bridge). */
export function coverScale(P, w = W, h = H) {
  const c = centroidOf(P);
  const rmin = Math.max(8, Math.min(...byAngle(P, 48).P.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))));
  const far = Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
  return { c, kmax: far / rmin * 1.1 };
}

/** Fill and/or stroke a closed outline. o = { fill, stroke, lw = 2 }. */
export function drawShape(ctx, P, o = {}) {
  const { fill, stroke, lw = 2 } = o;
  ctx.beginPath();
  P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}

/** The morph at p (0 = A, 1 = B). Use it for the resting shapes too. */
export function drawMorph(ctx, A, B, p, o = {}) {
  drawShape(ctx, p <= 0 ? A : p >= 1 ? B : morphPoints(A, B, p), o);
}

// -- Numbers --------------------------------------------------------------------

const TAB = new Map();
/** Cached width table for ctx.font: every digit takes the width of '0'. */
export function tabularWidths(ctx) {
  const key = ctx.font;
  let tw = TAB.get(key);
  if (!tw) {
    if (TAB.size > 32) TAB.clear();
    const other = new Map();
    const digit = ctx.measureText('0').width;
    tw = {
      digit,
      of(ch) {
        if (ch >= '0' && ch <= '9') return digit;
        let w = other.get(ch);
        if (w === undefined) { w = ctx.measureText(ch).width; other.set(ch, w); }
        return w;
      },
    };
    TAB.set(key, tw);
  }
  return tw;
}

/** Per-character centres and widths for tabular placement at x with align. */
export function tabularLayout(ctx, str, x, align = 'left') {
  const tw = tabularWidths(ctx);
  const chars = Array.from(String(str));
  const ws = chars.map((ch) => tw.of(ch));
  const w = ws.reduce((s, v) => s + v, 0);
  let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  const xs = [];
  for (const cw of ws) { xs.push(cx + cw / 2); cx += cw; }
  return { chars, xs, ws, w };
}

/** Draw str with every digit in a fixed-width cell (no jitter while it counts). ctx.font/fillStyle from the caller. */
export function tabular(ctx, str, x, y, o = {}) {
  const L = tabularLayout(ctx, str, x, o.align ?? 'left');
  const ta = ctx.textAlign;
  ctx.textAlign = 'center';
  L.chars.forEach((ch, i) => ctx.fillText(ch, L.xs[i], y));
  ctx.textAlign = ta;
  return L.w;
}

/** Odometer roll from fromStr to toStr at progress p; each character clipped to its cell. */
export function odometer(ctx, fromStr, toStr, x, y, p, o = {}) {
  const size = o.size ?? 32, stagger = o.stagger ?? 0.12;
  const n = Math.max(fromStr.length, toStr.length);
  const a = String(fromStr).padStart(n, ' '), b = String(toStr).padStart(n, ' ');
  const L = tabularLayout(ctx, b.replace(/ /g, '0'), x, o.align ?? 'right');
  const pp = reducedMotion() ? 1 : clamp01(p);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  const base = ctx.globalAlpha;
  for (let i = 0; i < n; i++) {
    const e = ease.inOutCubic(odometerP(i, n, pp, stagger));
    const cx = L.xs[i], w = L.ws[i];
    if (a[i] === b[i] || e >= 1) {
      if (b[i] !== ' ') ctx.fillText(b[i], cx, y);
      continue;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2 - 2, y - size * 1.05, w + 4, size * 1.35); ctx.clip();
    const dy = size * 1.1 * e;
    ctx.globalAlpha = base * (1 - e * 0.6); if (a[i] !== ' ') ctx.fillText(a[i], cx, y - dy);
    ctx.globalAlpha = base * (0.4 + e * 0.6); if (b[i] !== ' ') ctx.fillText(b[i], cx, y + size * 1.1 - dy);
    ctx.restore();
  }
  ctx.restore();
  return { w: L.w, done: pp >= 1 };
}

// -- Words ----------------------------------------------------------------------

/** Draw a keyword at its left baseline (x, y): rising out of a clipped slot, scaled about (x, y). Returns its width. */
export function drawKeyword(ctx, text, x, y, size, kp) {
  if (!kp || kp.rise == null) return 0;
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (kp.rise < 1) {
    ctx.beginPath(); ctx.rect(x - 6, y - size * 1.05, w + 12, size * 1.32); ctx.clip();
    ctx.fillText(text, x, y + size * 1.2 * (1 - kp.rise));
  } else {
    ctx.translate(x, y); ctx.scale(kp.scale, kp.scale);
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
  return w * (kp.rise < 1 ? 1 : kp.scale);
}

/** A marker swipe behind a word, growing left to right over part 0..1. */
export function highlighterSweep(ctx, c, x0, x1, y, h, part, o = {}) {
  const g = highlighterGeom(x0, x1, y, h, part, o.scale ?? 1);
  if (!g) return;
  const blend = o.blend ?? (luma(c.bgDeep) > 0.5 ? 'multiply' : 'source-over');
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha *= o.a ?? 0.8;
  ctx.strokeStyle = o.col ?? c.gold;
  ctx.lineCap = 'butt';
  ctx.lineWidth = g.hh;
  ctx.beginPath();
  ctx.moveTo(g.xa - g.over, g.y + g.slant);
  ctx.lineTo(g.xe + g.over, g.y - g.slant);
  ctx.stroke();
  ctx.restore();
}

// -- Equations ------------------------------------------------------------------

const LAYOUTS = new Map();

/** Lay out a term list (SimText parts, optionally { p, id, col }). Cached. */
export function termLayout(ctx, c, parts, o = {}) {
  const size = o.size ?? 32, weight = o.weight ?? 800, display = o.display ?? true;
  const key = JSON.stringify([parts, size, weight, display, c.fontBody, c.fontDisplay]);
  const hit = LAYOUTS.get(key);
  if (hit) return hit;
  if (LAYOUTS.size > 64) LAYOUTS.clear();
  const items = [];
  let x = 0, asc = size * 0.75, desc = size * 0.25;
  for (const it of termItems(parts)) {
    const m = measureMath(ctx, c, [it.part], { size, weight, display });
    items.push({ ...it, x, w: m.w });
    asc = Math.max(asc, m.asc); desc = Math.max(desc, m.desc);
    x += m.w;
  }
  const L = { items, w: x, asc, desc };
  LAYOUTS.set(key, L);
  return L;
}

function startX(L, x, align) {
  return align === 'left' ? x : align === 'right' ? x - L.w : x - L.w / 2;
}

/** Screen box of the parts with id in a term list drawn at (x, y). */
export function termBox(ctx, c, parts, id, x, y, o = {}) {
  const L = termLayout(ctx, c, parts, o), x0 = startX(L, x, o.align ?? 'center');
  const its = L.items.filter((g) => g.id === id);
  if (!its.length) return null;
  const bx0 = x0 + Math.min(...its.map((g) => g.x)), bx1 = x0 + Math.max(...its.map((g) => g.x + g.w));
  const y0 = y - L.asc, y1 = y + L.desc;
  return { x0: bx0, x1: bx1, y0, y1, cx: (bx0 + bx1) / 2, cy: (y0 + y1) / 2 };
}

function drawPart(ctx, c, g, x, y, col, a, o) {
  if (a <= 0.003) return;
  ctx.save();
  ctx.globalAlpha *= a;
  if (Array.isArray(g.part)) {
    drawMath(ctx, c, [g.part], x, y, { size: o.size, weight: o.weight, display: o.display, col });
  } else {
    ctx.font = font(c, o.weight, o.size, o.display);
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(g.part), x, y);
  }
  ctx.restore();
}

/** Morph term list A into B at u (0..1), matched by id. Baseline at y. */
export function transformTerms(ctx, c, A, B, x, y, u, o = {}) {
  const lo = { size: o.size ?? 32, weight: o.weight ?? 800, display: o.display ?? true };
  const LA = termLayout(ctx, c, A, lo), LB = termLayout(ctx, c, B, lo);
  const align = o.align ?? 'center', mixFn = o.mix ?? lookMix, easeFn = o.ease ?? ease.smoothM;
  const xa = startX(LA, x, align), xb = startX(LB, x, align);
  const s = reducedMotion() ? 1 : easeFn(clamp01(u));
  const base = o.alpha ?? 1, defCol = o.col ?? c.label;
  const colOf = (g) => g.col ?? defCol;
  const ctr = (gs) => gs.reduce((sum, g) => sum + g.x + g.w / 2, 0) / gs.length;
  ctx.save();
  if (base !== 1) ctx.globalAlpha *= base;
  for (const { kind, a, b } of termPlan(LA.items, LB.items)) {
    if (kind === 'glide') {
      a.forEach((g, i) => {
        const col = s <= 0 ? colOf(g) : s >= 1 ? colOf(b[i]) : (colOf(g) === colOf(b[i]) ? colOf(g) : mixFn(colOf(g), colOf(b[i]), s));
        drawPart(ctx, c, g, lerp(xa + g.x, xb + b[i].x, s), y, col, 1, lo);
      });
    } else if (kind === 'swap') {
      const dx = (xb + ctr(b)) - (xa + ctr(a));
      a.forEach((g) => drawPart(ctx, c, g, xa + g.x + dx * s, y, colOf(g), termAlpha(kind, 'a', s), lo));
      b.forEach((g) => drawPart(ctx, c, g, xb + g.x - dx * (1 - s), y, colOf(g), termAlpha(kind, 'b', s), lo));
    } else if (a) a.forEach((g) => drawPart(ctx, c, g, xa + g.x, y, colOf(g), termAlpha(kind, 'a', s), lo));
    else b.forEach((g) => drawPart(ctx, c, g, xb + g.x, y, colOf(g), termAlpha(kind, 'b', s), lo));
  }
  ctx.restore();
  return { w: lerp(LA.w, LB.w, s), done: s >= 1 };
}
