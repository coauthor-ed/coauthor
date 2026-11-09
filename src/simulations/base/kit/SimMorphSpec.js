/** SimMorphSpec.js
 * SimMorphSpec - the pure, renderer-free half of the morph recipes (R11): outlines, schedules and term
 * matching. SimMorph.js (canvas) re-exports all of it; SimMorphSvg.js (SVG/DOM) builds on it.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/kit/morph.js (MIT, (c) 2026 cth9191) - byAngle
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/math/kit.js (MIT, (c) 2026 cth9191) - termPlan, termAlpha (transformTex matching)
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/sketchbook/kit.js (MIT, (c) 2026 cth9191) - highlighterGeom (highlight)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/diagram.js (MIT, (c) 2026 alchaincyf) - rectPts, circlePts, morphPoints (DG.morph)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/typo.js (MIT, (c) 2026 alchaincyf) - countUp (TY.count), keywordPop (TY.keyword + TY.rise)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/motion.js (MIT, (c) 2026 alchaincyf) - springHz, expoOut
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/engine.js (MIT, (c) 2026 alchaincyf) - odometerP (U.odometer)
 *   Original code: morphPair, pointsToPath, termItems, the caches, reduced-motion end states.
 *
 * Shapes: byAngle(P, m), morphPair(A, B, m), rectPts, circlePts, morphPoints(A, B, p) (see SimMorph.js),
 *   pointsToPath(P, dp = 1) -> 'M..L..Z' (an SVG d for a closed outline).
 * Numbers: expoOut, countUp(a, b, t, dur, ease), odometerP(i, n, p, stagger).
 * Words: springHz, KEYWORD_RISE / _PIN / _SETTLE, keywordPop(t, tIn, tHit),
 *   highlighterGeom(x0, x1, y, h, part, scale) -> { xa, xe, y, hh, over, slant } or null (part <= 0).
 * Terms: termItems(parts) -> [{ id, key, part, col }] (default id: trimmed text or JSON + '#' + occurrence),
 *   termPlan(IA, IB) -> [{ id, kind: 'glide' | 'swap' | 'out' | 'in', a, b }] (a, b: items with that id),
 *   termAlpha(kind, side, s) -> alpha of an 'a' or 'b' item at eased progress s (the canvas schedule).
 */
import { ease, reducedMotion } from './SimAnim.js';
import { resample } from './SimDrawOn.js';

const TAU = Math.PI * 2;
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;

// -- Shapes ---------------------------------------------------------------------

const RESAMPLE_STEP = 2.5;
const BY_ANGLE = new WeakMap();

export function centroidOf(P) {
  return P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length], [0, 0]);
}

/** Resample a closed outline to m points by angle around its centroid. Returns { P, c }. Cached. */
export function byAngle(P, m = 96) {
  let per = BY_ANGLE.get(P);
  if (!per) { per = new Map(); BY_ANGLE.set(P, per); }
  const hit = per.get(m);
  if (hit) return hit;
  const c = centroidOf(P), Q = resample(P, true, RESAMPLE_STEP), out = [];
  for (let i = 0; i < m; i++) {
    const a = -Math.PI + i / m * TAU; let best = null, bd = 1e9;
    for (const q of Q) {
      let d = Math.atan2(q[1] - c[1], q[0] - c[0]) - a; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
      const r = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (d < bd - 1e-4 || (Math.abs(d - bd) < 1e-4 && r > best[2])) { bd = d; best = [q[0], q[1], r]; }
    }
    out.push([best[0], best[1]]);
  }
  const res = { P: out, c };
  per.set(m, res);
  return res;
}

/** Two outlines resampled by angle to the same m points: ready for morphPoints. */
export function morphPair(A, B, m = 96) {
  return [byAngle(A, m).P, byAngle(B, m).P];
}

/** Rectangle outline: n points from the top-left corner, clockwise on screen. */
export function rectPts(cx, cy, w, h, n = 64) {
  const per = 2 * (w + h), out = [];
  for (let i = 0; i < n; i++) {
    let d = i / n * per; let x, y;
    if (d < w) { x = cx - w / 2 + d; y = cy - h / 2; }
    else if ((d -= w) < h) { x = cx + w / 2; y = cy - h / 2 + d; }
    else if ((d -= h) < w) { x = cx + w / 2 - d; y = cy + h / 2; }
    else { d -= w; x = cx - w / 2; y = cy + h / 2 - d; }
    out.push([x, y]);
  }
  return out;
}

/** Circle outline: n points from the top-left direction (-3PI/4, same start as rectPts), clockwise. */
export function circlePts(cx, cy, r, n = 64) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = -3 * Math.PI / 4 + i / n * TAU; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

/** Point-wise lerp of two outlines of equal length. */
export function morphPoints(A, B, p) {
  return A.map((a, i) => [lerp(a[0], B[i][0], p), lerp(a[1], B[i][1], p)]);
}

/** SVG path data for a closed outline. */
export function pointsToPath(P, dp = 1) {
  let d = '';
  P.forEach((q, i) => { d += (i ? 'L' : 'M') + q[0].toFixed(dp) + ' ' + q[1].toFixed(dp); });
  return d + 'Z';
}

// -- Numbers --------------------------------------------------------------------

/** Fast out, slow landing; exactly 1 at p >= 1. */
export function expoOut(p) {
  return p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.pow(2, -10 * p);
}

/** Count from a to b over dur seconds; t is seconds since the count began. Exactly b at t >= dur. */
export function countUp(a, b, t, dur, easeFn = expoOut) {
  if (reducedMotion() || !(dur > 0) || t >= dur) return b;
  if (t <= 0) return a;
  return lerp(a, b, easeFn(clamp01(t / dur)));
}

/** Roll progress of character i of n: the last (lowest) digit starts first, each later by stagger. */
export function odometerP(i, n, p, stagger = 0.12) {
  if (reducedMotion() || p >= 1) return 1;
  const order = n - 1 - i;
  return clamp01((p - order * stagger) / Math.max(0.0001, 1 - (n - 1) * stagger));
}

// -- Words ----------------------------------------------------------------------

/** huashu spring: 0 at t <= 0, rings round 1, settles. */
export function springHz(t, freq = 2.5, decay = 9) {
  return t <= 0 ? 0 : 1 - Math.exp(-decay * t) * Math.cos(TAU * freq * t);
}

export const KEYWORD_RISE = 0.35;
export const KEYWORD_PIN = 1.35;
export const KEYWORD_SETTLE = 0.8;   // e^(-9 x 0.8) < 0.001

/** Keyword schedule: rise from tIn, spring to 1.35x at tHit. -> { rise (0..1, null before tIn), scale, done }. */
export function keywordPop(t, tIn, tHit) {
  if (t < tIn) return { rise: null, scale: 1, done: false };
  if (reducedMotion()) return { rise: 1, scale: t >= tHit ? KEYWORD_PIN : 1, done: t >= tHit };
  if (t < tHit) return { rise: expoOut(clamp01((t - tIn) / KEYWORD_RISE)), scale: 1, done: false };
  const lt = t - tHit;
  if (lt >= KEYWORD_SETTLE) return { rise: 1, scale: KEYWORD_PIN, done: true };
  return { rise: 1, scale: lerp(1, KEYWORD_PIN, springHz(lt, 2.5, 9)), done: false };
}

/** Marker swipe geometry: a stroke hh thick from (xa - over, y + slant) to (xe + over, y - slant). null at part <= 0. */
export function highlighterGeom(x0, x1, y, h, part, scale = 1) {
  if (part <= 0) return null;
  const p = reducedMotion() ? 1 : clamp01(part);
  const hh = h * scale, xb = x0 + (x1 - x0) * scale;
  return { xa: x0, xe: lerp(x0, xb, ease.outCubic(p)), y, hh, over: 0.1 * hh, slant: 0.06 * hh };
}

// -- Terms ----------------------------------------------------------------------

export function partKey(part) {
  return Array.isArray(part) ? JSON.stringify(part) : String(part).trim();
}

/** Unwrap a term list: [{ id, key, part, col }]. */
export function termItems(parts) {
  const seen = {};
  return parts.map((raw) => {
    const wrapped = raw && typeof raw === 'object' && !Array.isArray(raw);
    const part = wrapped ? raw.p : raw;
    const key = partKey(part);
    const id = wrapped && raw.id != null ? raw.id : key + '#' + (seen[key] = (seen[key] ?? -1) + 1);
    return { id, key, part, col: wrapped ? raw.col : undefined };
  });
}

/** Match two item lists by id (A order first, then ids only in B). */
export function termPlan(IA, IB) {
  const groups = (L) => { const m = new Map(); for (const g of L) { if (!m.has(g.id)) m.set(g.id, []); m.get(g.id).push(g); } return m; };
  const GA = groups(IA), GB = groups(IB);
  const text = (gs) => gs.map((g) => g.key).join('\u0001');
  const out = [];
  for (const id of new Set([...GA.keys(), ...GB.keys()])) {
    const a = GA.get(id) ?? null, b = GB.get(id) ?? null;
    out.push({ id, a, b, kind: a && b ? (text(a) === text(b) ? 'glide' : 'swap') : a ? 'out' : 'in' });
  }
  return out;
}

/** Alpha of an item on side 'a' or 'b' at eased progress s. */
export function termAlpha(kind, side, s) {
  if (kind === 'glide') return 1;
  if (kind === 'swap') return side === 'a' ? 1 - clamp01(s * 1.6) : clamp01(s * 1.6 - 0.6);
  return kind === 'out' ? 1 - clamp01(s * 2) : clamp01(s * 2 - 1);
}

// -- Set notation term builders ---------------------------------------------------
// Pure builders for the term-line parts transformTerms / transformTermsSvg consume: each token is
// { p, id, col? } so a token that survives from one step to the next (same text, same occurrence)
// glides instead of fading. Ids: 'k:text#n' (n counts equal tokens in the line). Original code.
//   setTerms(expr, o)          'n(A) + n(B) - n(A&B)', "(A|B)'", 'A_1 ^ B^2' : & -> cap, | -> union, ' or ^c -> prime,
//                              - -> minus, _x / ^x -> sub / sup, 'in' -> element-of; o.cols = { A: color, ... }
//   rosterTerms(items, o)      '{ 2, 3, 5 }'; id per element (so removing or adding one morphs); o.name -> 'A = ',
//                              o.cols = fn(item, i) or map; o.ids = per-element ids
//   builderTerms(v, rule, o)   '{ x : x is an even number }'; the variable keeps one id per occurrence, rule words
//                              one id each; ' in ' -> element-of, '<=' '>=' '!=' -> proper glyphs

export const SET_GLYPH = {
  union: '\u222a', cap: '\u2229', prime: '\u2032', minus: '\u2212', elem: '\u2208', notElem: '\u2209',
  subset: '\u2286', empty: '\u2205', le: '\u2264', ge: '\u2265', ne: '\u2260', lbrace: '{', rbrace: '}',
};

const SET_OPS = { '&': SET_GLYPH.cap, '|': SET_GLYPH.union, '-': SET_GLYPH.minus, '+': '+', '=': '=', '<': '<', '>': '>', ',': ',' };
const SET_SPACED = new Set(['&', '|', '-', '+', '=', '<', '>']);

function idMaker() {
  const seen = {};
  return (k, text) => { const key = k + ':' + text; seen[key] = (seen[key] ?? -1) + 1; return key + '#' + seen[key]; };
}

export function setTerms(expr, o = {}) {
  const mk = idMaker(), cols = o.cols ?? {}, out = [];
  const push = (kind, text, p, col) => out.push({ p: p ?? text, id: mk(kind, text), ...(col ? { col } : {}) });
  const s = String(expr);
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '^' && s[i + 1] === 'c' && !/[A-Za-z0-9]/.test(s[i + 2] ?? '')) { push('pr', 'c', SET_GLYPH.prime); i += 2; continue; }
    if (ch === "'") { push('pr', "'", SET_GLYPH.prime); i++; continue; }
    if (s.startsWith('<=', i) || s.startsWith('>=', i) || s.startsWith('!=', i)) {
      const t = s.slice(i, i + 2); push('op', t, ' ' + (t === '<=' ? SET_GLYPH.le : t === '>=' ? SET_GLYPH.ge : SET_GLYPH.ne) + ' '); i += 2; continue;
    }
    if (ch === '\\') { push('op', ch, ' ' + SET_GLYPH.minus + ' '); i++; continue; }
    if (SET_OPS[ch]) {
      push('op', ch, SET_SPACED.has(ch) ? ' ' + SET_OPS[ch] + ' ' : ch === ',' ? ', ' : ch); i++; continue;
    }
    if (/[A-Za-z0-9]/.test(ch)) {
      let j = i; while (j < s.length && /[A-Za-z0-9]/.test(s[j])) j++;
      let w = s.slice(i, j);
      if (w === 'in' || w === 'notin') { push('op', w, ' ' + (w === 'in' ? SET_GLYPH.elem : SET_GLYPH.notElem) + ' '); i = j; continue; }
      if (w === 'empty') { push('nm', w, SET_GLYPH.empty); i = j; continue; }
      i = j;
      const m = s[i] === '_' || s[i] === '^' ? s[i] : '';
      if (m && /[A-Za-z0-9]/.test(s[i + 1] ?? '')) {
        let k = i + 1; while (k < s.length && /[A-Za-z0-9]/.test(s[k])) k++;
        const sub = s.slice(i + 1, k); i = k;
        push('nm', w + m + sub, [m === '_' ? 'sub' : 'sup', w, sub], cols[w]);
      } else push('nm', w, w, cols[w]);
      continue;
    }
    push('ch', ch, ch); i++;
  }
  return out;
}

export function rosterTerms(items, o = {}) {
  const out = [];
  const colOf = (it, i) => (typeof o.cols === 'function' ? o.cols(it, i) : o.cols?.[it]);
  if (o.name != null) out.push({ p: o.name + ' = ', id: 'name:' + o.name });
  out.push({ p: SET_GLYPH.lbrace + ' ', id: 'lb' });
  items.forEach((it, i) => {
    const col = colOf(it, i);
    out.push({ p: String(it), id: o.ids?.[i] ?? 'el:' + it, ...(col ? { col } : {}) });
    if (i < items.length - 1) out.push({ p: ', ', id: 'sep:' + (o.ids?.[i] ?? it) });
  });
  if (!items.length) out.push({ p: SET_GLYPH.empty, id: 'empty' });
  out.push({ p: ' ' + SET_GLYPH.rbrace, id: 'rb' });
  return out;
}

export function builderTerms(varName, ruleText, o = {}) {
  const mk = idMaker(), out = [];
  if (o.name != null) out.push({ p: o.name + ' = ', id: 'name:' + o.name });
  out.push({ p: SET_GLYPH.lbrace + ' ', id: 'lb' });
  out.push({ p: String(varName), id: mk('v', varName) });
  out.push({ p: ' : ', id: 'colon' });
  const rule = String(ruleText).trim().split(/\s+/).filter(Boolean);
  rule.forEach((w, i) => {
    const sym = { in: SET_GLYPH.elem, notin: SET_GLYPH.notElem, '<=': SET_GLYPH.le, '>=': SET_GLYPH.ge, '!=': SET_GLYPH.ne }[w];
    const isVar = w === varName;
    out.push({ p: (i ? ' ' : '') + (sym ?? w), id: isVar ? mk('v', w) : mk(sym ? 'op' : 'w', w), ...(isVar && o.col ? { col: o.col } : {}) });
  });
  out.push({ p: ' ' + SET_GLYPH.rbrace, id: 'rb' });
  return out;
}
