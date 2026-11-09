/** SimFocusSvg.js
 * SimFocusSvg - show one part of an SVG/DOM picture (recipe R8 on the live layer; the canvas twin is
 * SimFocus.js, whose timings and Indicate/Flash/Circumscribe maths it shares). Colours are CSS: tones are
 * color-mix strings, so they work in style= and live.css, and follow the theme by themselves.
 * Adapted from (MIT; full notices in THIRD_PARTY.md beside the kit LICENSE), through SimFocus.js:
 *   cth9191/animate@7e5eb56 plugins/animate/skills/animate/styles/math/kit.js (MIT, (c) 2026 cth9191) - flashSvg rays, indicate
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/diagram.js (MIT, (c) 2026 alchaincyf) - sweepSvg (circumscribe)
 *   alchaincyf/huashu-art-motion@64cb272 scripts/engine/lib/render.js (MIT, (c) 2026 alchaincyf) - spotlight (clipBeside, as an even-odd veil)
 *   wheresryan22/anatomy@e6600ff examples/raptor-engine/raptor.css (MIT, (c) 2026 Ryan) - focusStyle tone mapping
 *   Original code: the CSS tone strings, focusMix, indicateSvg, the live-layer elements, spotlight inside().
 *
 *   focusStyle(parts, focusId, o) -> { [id]: { fill, shade, edge, ink, role } }   parts [{ id, base, structure }],
 *                   base a CSS colour (tone(n), var(--sim-*)). The focused part = var(--sim-accent) (the ONE focus
 *                   colour); o.lit ids stay at base; every other part steps down toward var(--sim-bg-surface);
 *                   structure parts keep a var(--sim-label) edge. Build on a focus change, not per frame.
 *   focusMix(a, b, k) -> table     cross-fade two tables (color-mix), only while a change settles
 *   focusK(age), focusSettled(age), indicate(u, k), FOCUS_S, INDICATE_S, FLASH_S, SWEEP_S   (from SimFocus)
 *   indicateSvg(u, cx, cy, k = 0.2) -> { transform, s, k }   manim Indicate about (cx, cy): an SVG transform
 *                   attribute; k is the tint amount for tintCss
 *   tintCss(col, k, to = 'var(--sim-accent)') -> CSS colour   col pushed toward `to`
 *   flashSvg(live, key, x, y, u, o) -> path | null   manim Flash: 12 rays burst out, u 0..1 over FLASH_S;
 *                   o = { col = var(--sim-gold), r = 21, w = 2.5 }. Reserved for THE answer.
 *   sweepSvg(live, key, d, len, p, o) -> path | null   manim Circumscribe round path d (len: its length,
 *                   SimDrawOnSvg pathLen / circleLen); o = { col = var(--sim-accent), lw = 3, tw = 0.3 }
 *   spotlight(live, key, d, k, o) -> { el, inside(x, y) }   dims everything on the stage outside path d
 *                   (read even-odd, so a Venn region path from SimVennSpec works as it is) by k 0..1, and rims
 *                   the lit region. Lives in the live svg: over the painted SVG, under the chips; dim a
 *                   chip yourself with inside(x, y). o = { box: { x, y, w, h } (default the stage: the live
 *                   svg's viewBox), dim = 0.62, col = var(--sim-bg-deep), edge = var(--sim-accent), edgeW = 3 }
 * Reduced motion: indicate is still, flash and sweep draw nothing, focusK is 1 (as SimFocus).
 */
import { ease, reducedMotion } from './SimAnim.js';
import { focusK, focusSettled, indicate, FOCUS_S, INDICATE_S, FLASH_S, SWEEP_S } from './SimFocus.js';

export { focusK, focusSettled, indicate, FOCUS_S, INDICATE_S, FLASH_S, SWEEP_S };

const TAU = Math.PI * 2;
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const lerp = (a, b, t) => a + (b - a) * t;
const f2 = (v) => v.toFixed(2);
const mixCss = (a, b, k) => `color-mix(in oklab, ${b} ${(k * 100).toFixed(1)}%, ${a})`;
const darkCss = (col, k) => `color-mix(in oklab, ${col} ${((1 - k) * 100).toFixed(0)}%, black)`;

// One tone step down: toward the panel colour (SimFocus STEP_DOWN), no grey scrim, no new colour.
const STEP_DOWN = 0.55;

function toneOf(base, role) {
  if (role === 'focus') {
    const fill = 'var(--sim-accent)';
    return { fill, shade: darkCss(fill, 0.22), edge: darkCss(fill, 0.35), ink: 'var(--sim-ink-on-accent, var(--sim-bg-deep))', role };
  }
  if (role === 'down') {
    return { fill: mixCss(base, 'var(--sim-bg-surface)', STEP_DOWN), shade: mixCss(darkCss(base, 0.22), 'var(--sim-bg-surface)', STEP_DOWN), edge: 'var(--sim-label-muted)', ink: 'var(--sim-label-muted)', role };
  }
  if (role === 'structure') return { fill: base, shade: darkCss(base, 0.22), edge: 'var(--sim-label)', ink: 'var(--sim-label)', role };
  return { fill: base, shade: darkCss(base, 0.22), edge: darkCss(base, 0.35), ink: 'var(--sim-label)', role: 'base' };
}

/** Tone table for a focus state (see the header). */
export function focusStyle(parts, focusId = null, o = {}) {
  const lit = o.lit ? new Set(o.lit) : null;
  const focusing = focusId != null || lit != null;
  const out = {};
  let accentUsed = false;
  for (const p of parts) {
    if (out[p.id]) continue;
    let role = 'base';
    if (p.structure) role = 'structure';
    else if (focusing) {
      if (!accentUsed && p.id === focusId) { role = 'focus'; accentUsed = true; }
      else if (lit && lit.has(p.id)) role = 'base';
      else role = 'down';
    }
    out[p.id] = toneOf(p.base, role);
  }
  return out;
}

/** Cross-fade two tone tables (same ids) by k. */
export function focusMix(a, b, k) {
  if (!a || k >= 1) return b;
  if (k <= 0) return a;
  const out = {};
  for (const id of Object.keys(b)) {
    const x = a[id], y = b[id];
    out[id] = !x ? y : {
      fill: mixCss(x.fill, y.fill, k), shade: mixCss(x.shade, y.shade, k),
      edge: mixCss(x.edge, y.edge, k), ink: k < 0.5 ? x.ink : y.ink, role: y.role,
    };
  }
  return out;
}

/** manim Indicate about (cx, cy) as an SVG transform. */
export function indicateSvg(u, cx, cy, k = 0.2) {
  const r = indicate(u, k);
  return { transform: r.s === 1 ? null : `translate(${f2(cx)} ${f2(cy)}) scale(${r.s.toFixed(4)}) translate(${f2(-cx)} ${f2(-cy)})`, s: r.s, k: r.k };
}

/** col pushed toward `to` by k. */
export function tintCss(col, k, to = 'var(--sim-accent)') {
  if (k <= 0) return col;
  if (k >= 1) return to;
  return mixCss(col, to, k);
}

/** manim Flash at (x, y): rays burst out and vanish (u 0..1). */
export function flashSvg(live, key, x, y, u, o = {}) {
  if (u <= 0 || u >= 1 || reducedMotion()) return null;
  const r = o.r ?? 21;
  const r0 = r + r * 1.3 * ease.smoothM(u), r1 = r + r * 2.5 * ease.smoothM(Math.min(1, u * 1.4));
  let d = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    d += `M${f2(x + r0 * ca)} ${f2(y + r0 * sa)}L${f2(x + r1 * ca)} ${f2(y + r1 * sa)}`;
  }
  const e = live.shape(key, 'path', { parent: o.parent });
  live.attrs(e, { d });
  live.css(e, { fill: 'none', stroke: o.col ?? 'var(--sim-gold)', 'stroke-width': o.w ?? 2.5, 'stroke-linecap': 'round', opacity: (1 - u).toFixed(3) });
  live.more();
  return e;
}

/** manim Circumscribe round path d (length len): the stroke runs round and its tail catches up. */
export function sweepSvg(live, key, d, len, p, o = {}) {
  if (p <= 0 || p >= 1 || reducedMotion() || !(len > 0)) return null;
  const tw = o.tw ?? 0.3;
  const hi = clamp01(lerp(0, 1 + tw, p));
  const lo = clamp01(hi - tw - (1 - p) * 0.7);
  if (hi - lo <= 0) return null;
  const e = live.shape(key, 'path', { parent: o.parent });
  live.attrs(e, { d, 'stroke-dasharray': `${f2((hi - lo) * len)} ${f2(len * 2)}`, 'stroke-dashoffset': f2(-lo * len) });
  live.css(e, { fill: 'none', stroke: o.col ?? 'var(--sim-accent)', 'stroke-width': o.lw ?? 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: Math.min(1, (1 - p) / 0.15).toFixed(3) });
  live.more();
  return e;
}

// The live svg's own frame (an SvgScene stage has a viewBox; its svg shows overflow, so a huge veil
// would dim the title row too); a free live layer (liveHost) is clipped by the scene frame instead.
function stageBox(el) {
  const vb = el.ownerSVGElement?.viewBox?.baseVal;
  if (vb && vb.width > 0) return { x: vb.x - 2, y: vb.y - 2, w: vb.width + 4, h: vb.height + 4 };
  return { x: -2000, y: -2000, w: 6000, h: 6000 };
}

/** Dim everything outside path d by k, rim the lit region; inside(x, y) tests a point (see the header). */
export function spotlight(live, key, d, k, o = {}) {
  const kk = clamp01(k);
  const veil = live.shape(key, 'path', { parent: o.parent });
  const b = o.box ?? stageBox(veil);
  live.attrs(veil, { d: `M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z${d}`, 'fill-rule': 'evenodd' });
  live.css(veil, { fill: o.col ?? 'var(--sim-bg-deep)', opacity: (kk * (o.dim ?? 0.62)).toFixed(3) });
  if (kk > 0 && o.edge !== false) {
    const rim = live.shape(`${key}|rim`, 'path', { parent: o.parent });
    live.attrs(rim, { d, 'fill-rule': 'evenodd' });
    live.css(rim, { fill: 'none', stroke: o.edge ?? 'var(--sim-accent)', 'stroke-width': o.edgeW ?? 3, 'stroke-linejoin': 'round', opacity: kk.toFixed(3) });
  }
  const inside = (x, y) => {
    try {
      if (typeof veil.isPointInFill === 'function') {
        const pt = typeof DOMPoint === 'function' ? new DOMPoint(x, y) : { x, y };
        return !veil.isPointInFill(pt);
      }
    } catch (_) { /* fall through */ }
    return false;
  };
  return { el: veil, inside };
}
