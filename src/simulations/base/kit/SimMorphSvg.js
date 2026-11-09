/** SimMorphSvg.js
 * SimMorphSvg - the morph recipes (R11) for SvgScene: shape morphs as SVG paths, equation terms as real
 * HTML text that glides, counters, an odometer, keyword pops and a highlighter, all on the live layer
 * (SimSvg liveLayer: keyed elements moved per frame by attribute and style, never re-rendered).
 * Ported from the canvas SimMorph.js; its schedules are shared through SimMorphSpec.js.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE):
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/math/kit.js (MIT, (c) 2026 cth9191) - transformTermsSvg (transformTex algorithm)
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/sketchbook/kit.js (MIT, (c) 2026 cth9191) - highlighterSvg (highlight, no wobble)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/diagram.js (MIT, (c) 2026 alchaincyf) - morphPath (DG.morph, DG.shape)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/typo.js (MIT, (c) 2026 alchaincyf) - countSvg (TY.count), keywordSvg (TY.keyword + TY.rise)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/engine.js (MIT, (c) 2026 alchaincyf) - odometerSvg (U.odometer)
 *   Original code: the DOM layout (measured spans, baseline placement), partHtml, partText, the CSS.
 *
 * Every function takes the scene's live layer (this.live in SvgScene.animate) and a key; call it on every
 * animate() pass the element should show (a pass that skips it removes it). x, y are stage px; y is a
 * text BASELINE, as on canvas. Colours are CSS (var(--sim-*), tone(n), color-mix); add MORPH_SVG_CSS to css().
 *
 *   morphPath(live, key, A, B, p, o) -> path   the outline morphPoints(A, B, p) (A, B from morphPair);
 *                                  o = { fill, stroke, lw = 2, dx, dy, transform, opacity, cls, parent }.
 *                                  Draw the resting shape with it too (p = 0 or 1), so the first frame never jumps.
 *   partHtml(part) / partText(part) / termsText(parts)   SimText parts as HTML (fracHtml, supHtml, subHtml,
 *                                  rootHtml, overbarHtml) or as words for a screen reader
 *   termsSvg(live, key, parts, x, y, o) -> { w }      a still term line (transformTermsSvg at 1)
 *   transformTermsSvg(live, key, A, B, x, y, u, o) -> { w, done }   TransformMatchingTex in DOM: the canvas
 *                                  rules (glide, cross-fade swap, fade out, fade in; s = o.ease(u)). One span per
 *                                  part, keyed by id, so the next step's matching terms carry on from where
 *                                  they rest. o = { size = 32, weight = 800, align = 'center', col, mix, ease,
 *                                  alpha = 1, label (read out; default the B line), cls }.
 *   tabularSvg(live, key, str, x, y, o) -> el         fixed-width digits (tabular-nums); o = { size, weight, col, align = 'left' }
 *   countSvg(live, key, a, b, t, dur, x, y, o) -> value   countUp into tabularSvg; o.fmt(v) (default Math.round), o.ease
 *   odometerSvg(live, key, fromStr, toStr, x, y, p, o) -> { done }   digit columns roll (the lowest first, o.stagger
 *                                  = 0.12); one CSS var per column; o as tabularSvg plus align = 'right'
 *   keywordSvg(live, key, text, x, y, kp, o) -> width  kp = keywordPop(t, tIn, tHit): rises out of a clipped slot,
 *                                  then springs to 1.35x about its left baseline; o = { size, weight, col }
 *   highlighterSvg(live, key, x0, x1, y, h, part, o) -> line | null   a marker swipe in the live svg (UNDER the
 *                                  overlay text, so no blend mode is needed); o = { col = var(--sim-gold), a = 0.8, scale }.
 *                                  Ink the word over it with color-mix toward var(--sim-ink-on-gold).
 * Reduced motion: the shared schedules land on their end states (countUp, odometerP, keywordPop,
 * highlighterGeom); transformTermsSvg shows B.
 */
import { esc } from 'simulations/base/SimUi.js';
import { ease, reducedMotion } from './SimAnim.js';
import { fracHtml, supHtml, subHtml, rootHtml, overbarHtml } from './SimText.js';
import {
  morphPoints, pointsToPath, countUp, odometerP, highlighterGeom, termItems, termPlan, termAlpha,
} from './SimMorphSpec.js';

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;
const px = (v) => `${v.toFixed(2)}px`;

export const MORPH_SVG_CSS = `
.sv-num { font-variant-numeric: tabular-nums; }
.sv-odo { display: inline-flex; }
.sv-odo-cell { display: inline-block; width: 1ch; height: 1.2em; overflow: hidden; text-align: center; }
.sv-odo-cell > b { display: block; height: 1.2em; font-weight: inherit; transform: translateY(calc(var(--e, 1) * -1.2em)); }
.sv-odo-cell > b:first-child { opacity: calc(1 - var(--e, 1) * 0.6); }
.sv-odo-cell > b:last-child { opacity: calc(0.4 + var(--e, 1) * 0.6); }
.sv-kw--rise { overflow: hidden; }
.sv-kw > span { display: inline-block; }
`;

// -- Shapes ---------------------------------------------------------------------

/** A closed outline at morph progress p, as a live path. */
export function morphPath(live, key, A, B, p, o = {}) {
  const e = live.shape(key, 'path', { cls: o.cls, parent: o.parent });
  const P = p <= 0 ? A : p >= 1 ? B : morphPoints(A, B, p);
  const lw = o.lw ?? 2;
  live.attrs(e, {
    d: pointsToPath(P),
    transform: o.transform ?? (o.dx || o.dy ? `translate(${(o.dx ?? 0).toFixed(2)} ${(o.dy ?? 0).toFixed(2)})` : null),
  });
  live.css(e, {
    fill: o.fill ?? 'none',
    stroke: o.stroke && lw > 0 ? o.stroke : null,
    'stroke-width': o.stroke && lw > 0 ? lw : null,
    'stroke-linejoin': o.stroke ? 'round' : null,
    opacity: o.opacity != null ? o.opacity.toFixed(3) : null,
  });
  return e;
}

// -- Parts ----------------------------------------------------------------------

/** A SimText part as HTML (spaces kept: .sv-term is white-space: pre). */
export function partHtml(part) {
  if (!Array.isArray(part)) return esc(String(part));
  const [k, a, b] = part;
  if (k === 'frac') return fracHtml(a, b);
  if (k === 'sup') return supHtml(a, b);
  if (k === 'sub') return subHtml(a, b);
  if (k === 'root') return rootHtml(a);
  if (k === 'bar') return overbarHtml(a, b);
  return esc(part.slice(1).join(''));
}

/** A SimText part as words. */
export function partText(part) {
  if (!Array.isArray(part)) return String(part);
  const [k, a, b] = part;
  if (k === 'frac') return ` ${a} over ${b} `;
  if (k === 'sup') return `${a} to the power ${b}`;
  if (k === 'root') return `square root of ${a}`;
  if (k === 'bar') return `${a}${b} recurring`;
  return `${a}${b ?? ''}`;
}

/** A term list as one plain line. */
export function termsText(parts) {
  return termItems(parts).map((g) => partText(g.part)).join('').replace(/\s+/g, ' ').trim();
}

// -- Equations ------------------------------------------------------------------

function lineLayout(live, items, o) {
  let x = 0;
  const out = items.map((g) => {
    const html = partHtml(g.part);
    const m = live.measure(html, { size: o.size, weight: o.weight, cls: o.cls });
    const it = { ...g, html, x, w: m.w, asc: m.asc };
    x += m.w;
    return it;
  });
  return { items: out, w: x };
}

const startX = (L, x, align) => (align === 'left' ? x : align === 'right' ? x - L.w : x - L.w / 2);

function cssMix(a, b, s) {
  return a === b ? a : `color-mix(in oklab, ${b} ${(s * 100).toFixed(1)}%, ${a})`;
}

/** Morph term list A into B at u (0..1), matched by id. Baseline at y. */
export function transformTermsSvg(live, key, A, B, x, y, u, o = {}) {
  const lo = { size: o.size ?? 32, weight: o.weight ?? 800, cls: o.cls ?? '' };
  const LA = lineLayout(live, termItems(A), lo), LB = A === B ? LA : lineLayout(live, termItems(B), lo);
  const align = o.align ?? 'center', mixFn = o.mix ?? cssMix, easeFn = o.ease ?? ease.smoothM;
  const xa = startX(LA, x, align), xb = startX(LB, x, align);
  const s = reducedMotion() ? 1 : easeFn(clamp01(u));
  const base = o.alpha ?? 1, defCol = o.col ?? 'var(--sim-label)';
  const colOf = (g) => g.col ?? defCol;
  const ctr = (gs) => gs.reduce((sum, g) => sum + g.x + g.w / 2, 0) / gs.length;
  const put = (k, g, gx, col, a) => {
    if (a * base <= 0.003) return;
    const e = live.el(`${key}|${k}`, { cls: `sv-term ${lo.cls}`.trim(), html: g.html });
    live.attrs(e, { 'aria-hidden': 'true' });
    live.css(e, {
      transform: `translate(${px(gx)}, ${px(y - g.asc)})`, color: col, opacity: (a * base).toFixed(3),
      'font-size': `${lo.size}px`, 'font-weight': String(lo.weight),
    });
  };
  for (const { id, kind, a, b } of termPlan(LA.items, LB.items)) {
    if (kind === 'glide') {
      a.forEach((g, i) => {
        const col = s <= 0 ? colOf(g) : s >= 1 ? colOf(b[i]) : mixFn(colOf(g), colOf(b[i]), s);
        put(`${id}|${i}`, s >= 1 ? b[i] : g, lerp(xa + g.x, xb + b[i].x, s), col, 1);
      });
    } else if (kind === 'swap') {
      const dx = (xb + ctr(b)) - (xa + ctr(a));
      a.forEach((g, i) => put(`${id}|${i}|a`, g, xa + g.x + dx * s, colOf(g), termAlpha(kind, 'a', s)));
      b.forEach((g, i) => put(`${id}|${i}`, g, xb + g.x - dx * (1 - s), colOf(g), termAlpha(kind, 'b', s)));
    } else if (a) a.forEach((g, i) => put(`${id}|${i}`, g, xa + g.x, colOf(g), termAlpha(kind, 'a', s)));
    else b.forEach((g, i) => put(`${id}|${i}`, g, xb + g.x, colOf(g), termAlpha(kind, 'b', s)));
  }
  if (o.label !== false) live.el(`${key}|sr`, { cls: 'sv-sr', html: esc(o.label ?? termsText(B)) });
  return { w: lerp(LA.w, LB.w, s), done: s >= 1 };
}

/** A still term line (same keys as transformTermsSvg, so a later transform carries on from it). */
export function termsSvg(live, key, parts, x, y, o = {}) {
  return { w: transformTermsSvg(live, key, parts, parts, x, y, 1, o).w };
}

// -- Numbers --------------------------------------------------------------------

function numEl(live, key, html, x, y, o, cls) {
  const size = o.size ?? 32, weight = o.weight ?? 800;
  const m = live.measure('0', { size, weight, cls: 'sv-num' });
  const e = live.el(key, { cls: `sv-term sv-num ${cls}`.trim(), html });
  const al = o.align ?? 'left';
  live.css(e, {
    transform: `translate(${px(x)}, ${px(y - m.asc)})${al === 'right' ? ' translateX(-100%)' : al === 'center' ? ' translateX(-50%)' : ''}`,
    color: o.col ?? 'var(--sim-label)', 'font-size': `${size}px`, 'font-weight': String(weight),
  });
  return e;
}

/** str in fixed-width digits at baseline (x, y). */
export function tabularSvg(live, key, str, x, y, o = {}) {
  return numEl(live, key, esc(String(str)), x, y, o, '');
}

/** countUp(a, b, t, dur) written into a tabular element; returns the value. */
export function countSvg(live, key, a, b, t, d, x, y, o = {}) {
  const v = countUp(a, b, t, d, o.ease);
  tabularSvg(live, key, (o.fmt ?? Math.round)(v), x, y, o);
  return v;
}

/** Odometer roll from fromStr to toStr at progress p (digits; one column each). */
export function odometerSvg(live, key, fromStr, toStr, x, y, p, o = {}) {
  const stagger = o.stagger ?? 0.12;
  const n = Math.max(String(fromStr).length, String(toStr).length);
  const a = String(fromStr).padStart(n, ' '), b = String(toStr).padStart(n, ' ');
  const pp = reducedMotion() ? 1 : clamp01(p);
  const box = numEl(live, key, '', x, y, { align: 'right', ...o }, 'sv-odo');
  for (let i = 0; i < n; i++) {
    const cell = live.el(`${key}|${i}`, { cls: 'sv-odo-cell', parent: box, html: `<b>${esc(a[i] === ' ' ? '\u00a0' : a[i])}</b><b>${esc(b[i] === ' ' ? '\u00a0' : b[i])}</b>` });
    const e = a[i] === b[i] ? 1 : ease.inOutCubic(odometerP(i, n, pp, stagger));
    live.css(cell, { '--e': e.toFixed(4) });
  }
  return { done: pp >= 1 };
}

// -- Words ----------------------------------------------------------------------

/** A keyword at its left baseline (x, y), driven by keywordPop. Returns its width (scaled). */
export function keywordSvg(live, key, text, x, y, kp, o = {}) {
  if (!kp || kp.rise == null) return 0;
  const size = o.size ?? 32, weight = o.weight ?? 800, html = esc(text);
  const m = live.measure(html, { size, weight });
  const rising = kp.rise < 1;
  const outer = live.el(key, { cls: `sv-term sv-kw${rising ? ' sv-kw--rise' : ''}` });
  live.css(outer, { transform: `translate(${px(x)}, ${px(y - m.asc)})`, color: o.col ?? 'var(--sim-label)', 'font-size': `${size}px`, 'font-weight': String(weight) });
  const inner = live.el(`${key}|w`, { parent: outer, html });
  live.css(inner, {
    transform: rising ? `translateY(${(1.2 * (1 - kp.rise)).toFixed(3)}em)` : `scale(${kp.scale.toFixed(4)})`,
    'transform-origin': `0 ${px(m.asc)}`,
  });
  return m.w * (rising ? 1 : kp.scale);
}

/** A marker swipe behind a word (live svg, under the overlay text), growing left to right over part 0..1. */
export function highlighterSvg(live, key, x0, x1, y, h, part, o = {}) {
  const g = highlighterGeom(x0, x1, y, h, part, o.scale ?? 1);
  if (!g) return null;
  const e = live.shape(key, 'line', { parent: o.parent });
  live.attrs(e, { x1: (g.xa - g.over).toFixed(2), y1: (g.y + g.slant).toFixed(2), x2: (g.xe + g.over).toFixed(2), y2: (g.y - g.slant).toFixed(2) });
  live.css(e, { stroke: o.col ?? 'var(--sim-gold)', 'stroke-width': g.hh.toFixed(2), 'stroke-linecap': 'butt', opacity: String(o.a ?? 0.8) });
  return e;
}
