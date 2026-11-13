/** SimPlaneSvg.js
 * SimPlaneSvg - the school coordinate plane (graph paper, NCERT style) for an SvgScene: a frame with EQUAL
 * UNITS, square grid, both axes with arrowheads both ways, x / y / O, tick numbers that never collide;
 * points with tags, lines y = ax + b clipped to the frame (static or drawing on), the "1 across, a up" step
 * triangle, the y-intercept ring, and a draggable point that snaps to the grid (pointer and arrow keys).
 * Maths look: flat fills, a darker rim, no gloss, no glow; tokens only (lines use --sim-series-1..8).
 * Every drawing helper returns SVG markup (a string) for the paint() svg, except lineDrawOn (live layer).
 * Units: data units in, design px out. All text is >= 18 design px by default (f.size). Minus signs are
 * the real minus (U+2212).
 *
 * Frame:
 *   planeFrame(rect, [x0, x1], [y0, y1], o) -> f      rect { x, y, w, h } in design px. One unit is the same
 *       px on both axes (f.unit): the frame shrinks the slack axis and centres it (o.fit 'shrink', default)
 *       or widens the slack data range to fill the rect, to whole units, never narrower than asked (o.fit
 *       'widen'). Never stretches.  o = { step (tick spacing, units, 1), grid (grid spacing, units, 1;
 *       doubled while a cell is under 8 px), major (a stronger grid line every `major` grid lines, 5),
 *       size (text px, 18), pad (px: a number or { l, r, t, b }; default room for arrows, x / y and the
 *       tick numbers outside the grid), alignX, alignY (0..1 where the slack goes, 0.5), labelEvery
 *       (show every k-th tick number; default: the smallest of 1, 2, 5, 10 that does not crowd) }.
 *     f.toPx(x, y) -> { x, y } px     f.toData(px, py) -> { x, y } data     f.px(x), f.py(y), f.vx(px), f.vy(py)
 *     f.x0 f.x1 f.y0 f.y1 (data range, maybe widened)   f.unit (px per unit, both axes)   f.plot { x, y, w, h }
 *     (the grid box, px)   f.rect   f.ox f.oy (px of the axes: the origin, clamped into the grid)   f.size
 *     f.step   f.labelEvery { x, y }   f.arrow (arrow length past the grid, px)
 *   planeHit(f, p, o) -> { x, y } | null     a stage point (px) to data, snapped (o.snap units: 1 whole,
 *       0.5 half; 0 none) and clamped into the frame; null when p is more than o.slop px (24) outside the grid.
 *
 * Drawing (markup strings):
 *   planeSvg(f, o)                  o = { panel (true: a surface card under the grid), dim (quiet grid),
 *       xLabel ('x'), yLabel ('y'), originLabel ('O'; null hides), ticks (true), numbers (true), arrows
 *       ('both' | 'positive') }. Tick numbers skip 0, the ones that would sit on the other axis, and thin
 *       to f.labelEvery.
 *   pointSvg(f, x, y, o)            a dot. o = { tone (1: series n or a token name), r (7), lit (bigger, a
 *       soft ring), dim, tag (text; true: "(x, y)"; o.name 'A' with no tag: "A(x, y)"), place ('auto' | 'n'
 *       | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'), guides (dashed lines to both axes), avoid, out }.
 *   lineSvg(f, a, b, o)             y = ax + b clipped to the grid ('' when it misses). o = { tone (1),
 *       width (5), dash (true or a dasharray), dim, label (equation text, placed near the line's labelAt
 *       end: 'end' (right, default) | 'start', inside the grid, clear of the axes, tick numbers and x / y),
 *       avoid, out }.
 *   lineThroughSvg(f, P, Q, o)      the line through P and Q ([x, y] or { x, y }), extended to the grid;
 *       vertical when P.x = Q.x. Same o as lineSvg.
 *   stepTriangleSvg(f, x0, a, b, o) the right triangle under y = ax + b from x0: o.run (1) across, a * run
 *       up (down when negative); legs in tone (o.tone, 3), a soft tint, a right-angle mark; the run leg
 *       labelled with the run (o.runLabel), the rise leg with the rise (o.riseLabel, real minus), each
 *       outside the triangle when there is room. o.labels false hides both. o.out receives { box (the
 *       triangle, px), boxes (its labels, px) } for a later tag's o.avoid.
 *   interceptSvg(f, b, o)           the point (0, b) as a ring on the y-axis with the tag "(0, b)" (o.tag
 *       overrides; false hides) placed off the axis. o = { tone ('accent'), r (11), place, avoid, out }.
 *   Placement: o.avoid is a list of things a tag must keep clear of: { a, b } (a line y = ax + b),
 *       { P, Q } (the line through two points), { x, y, w, h } (a px box). o.out (an object) receives
 *       { box } (px) of the placed tag, so the next tag can avoid it.
 *   placeTag(f, at, text, o) -> { x, y, box, place }   the placement itself (at: px anchor { x, y }, o.r:
 *       clearance radius). tickBoxes(f, o) -> [{ x, y, w, h }]: px boxes of the tick numbers and x / y / O.
 *   textWidth(text, size) -> px     a generous estimate of bold UI text width.   fmtCoord(v) -> text with
 *       the real minus.
 *
 * Live layer (SvgScene animate):
 *   lineDrawOn(live, key, f, a, b, t, o) -> { done, p }   y = ax + b (clipped) drawing itself by x at clock
 *       t through SimPlotSvg plotLineSvg. o = { from (a data x: grows outward both ways from there; default
 *       the left end), dur, delay, ease, tone (1), width (5), head (false) }. No dash while drawing.
 *
 * Interaction:
 *   dragPoint(f | () => f, o) -> d     a grid-snapped draggable point over SimDrag dragHandle. o = { x, y
 *       (start, data), snap (1; 0.5 half units), radius (grab px, 22), min { x, y }, max { x, y } (data
 *       clamp; default the frame), onMove (fn({ x, y })), onCommit (fn({ x, y })) }.
 *     d.pos() -> { x, y } data   d.set(x, y)   d.down(p) / d.move(p) / d.up(p) (stage px: return them from
 *     SvgScene pointerDown / pointerMove / pointerUp)   d.dragging   d.key(evt) -> true when an arrow key
 *     moved it one snap step (Shift: 5 steps)   d.bindKeys(el, onChange, { label }) -> unbind   makes el
 *     focusable and moves the point with the arrow keys (calls onChange(pos)). Draw it with pointSvg; wrap
 *     the dot in class sv-drag for the grab cursor (o.drag true on pointSvg does that).
 */
import { esc } from 'simulations/base/SimUi.js';
import { shade } from './SimSvg.js';
import { plotLineSvg } from './SimPlotSvg.js';
import { dragHandle } from './SimDrag.js';
import { lookOf } from './lookProfile.js';

const MINUS = String.fromCharCode(0x2212);
const f1 = (v) => (+v).toFixed(1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ptOf = (P) => (Array.isArray(P) ? { x: P[0], y: P[1] } : { x: P.x, y: P.y });

/** Colour of a tone: a series number (1..8) or a token name ('accent', 'label', ...). */
const colOf = (t) => (typeof t === 'number' ? `var(--sim-series-${((Math.max(1, t | 0) - 1) % 8) + 1})` : `var(--sim-${t})`);
/** Readable text colour for a tone (the series ink, else the tone). */
const inkOf = (t) => (typeof t === 'number' ? `var(--sim-series-${((Math.max(1, t | 0) - 1) % 8) + 1}-ink, ${colOf(t)})` : colOf(t));

/** A number as text with the real minus; integers plain, else up to 2 decimals. */
export function fmtCoord(v) {
  const s = Number.isInteger(v) ? String(Math.abs(v)) : String(+Math.abs(v).toFixed(2));
  return (v < 0 && s !== '0' ? MINUS : '') + s;
}
// Hyphen-minus before a digit becomes the real minus (tags and labels written with '-').
const realMinus = (s) => String(s).replace(/-(?=[\d.])/g, MINUS);

const EM = (ch) => (/[0-9]/.test(ch) ? 0.62 : ch === MINUS || ch === '+' || ch === '=' ? 0.64 : /[A-Z]/.test(ch) ? 0.7
  : /[a-z]/.test(ch) ? 0.58 : /[ ]/.test(ch) ? 0.3 : /[(),.:;'|!]/.test(ch) ? 0.36 : 0.62);
/** Generous width estimate of bold UI text at `size` px. */
export function textWidth(text, size = 18) {
  return [...String(text)].reduce((s, ch) => s + EM(ch), 0) * size;
}

// -- Frame --------------------------------------------------------------------------------

/** The equal-unit frame (see the header). */
export function planeFrame(rect, xr, yr, o = {}) {
  const size = o.size ?? 18, step = o.step ?? 1;
  let [x0, x1] = xr, [y0, y1] = yr;
  if (!(x1 > x0)) x1 = x0 + 1;
  if (!(y1 > y0)) y1 = y0 + 1;
  const arrow = o.arrow ?? 16;
  const yLabW = Math.max(...ticksOf(y0, y1, step).map((v) => textWidth(fmtCoord(v), size)), textWidth('0', size));
  const dp = {
    l: Math.max(arrow + 8, x0 >= 0 ? yLabW + 14 : 0),
    r: arrow + 10 + textWidth(o.xLabel ?? 'x', size),
    t: arrow + 8 + size,
    b: Math.max(arrow + 8, y0 >= 0 ? size + 16 : 0),
  };
  const pad = typeof o.pad === 'number' ? { l: o.pad, r: o.pad, t: o.pad, b: o.pad } : { ...dp, ...(o.pad ?? {}) };
  const aw = Math.max(20, rect.w - pad.l - pad.r), ah = Math.max(20, rect.h - pad.t - pad.b);
  let unit = Math.min(aw / (x1 - x0), ah / (y1 - y0));
  if (o.fit === 'widen') {
    const ex = aw / unit - (x1 - x0), ey = ah / unit - (y1 - y0);
    const g = o.grid ?? 1;
    const wx0 = x0 - ex / 2, wx1 = x1 + ex / 2, wy0 = y0 - ey / 2, wy1 = y1 + ey / 2;
    x0 = Math.min(x0, Math.ceil(wx0 / g - 1e-9) * g); x1 = Math.max(x1, Math.floor(wx1 / g + 1e-9) * g);
    y0 = Math.min(y0, Math.ceil(wy0 / g - 1e-9) * g); y1 = Math.max(y1, Math.floor(wy1 / g + 1e-9) * g);
    unit = Math.min(aw / (x1 - x0), ah / (y1 - y0));
  }
  const pw = (x1 - x0) * unit, ph = (y1 - y0) * unit;
  const plot = {
    x: rect.x + pad.l + (aw - pw) * (o.alignX ?? 0.5),
    y: rect.y + pad.t + (ah - ph) * (o.alignY ?? 0.5),
    w: pw, h: ph,
  };
  const px = (x) => plot.x + (x - x0) * unit;
  const py = (y) => plot.y + (y1 - y) * unit;
  const vx = (X) => x0 + (X - plot.x) / unit;
  const vy = (Y) => y1 - (Y - plot.y) / unit;
  const f = {
    rect, plot, unit, size, step, arrow, x0, x1, y0, y1, px, py, vx, vy,
    grid: o.grid ?? 1, major: o.major ?? 5,
    toPx: (x, y) => ({ x: px(x), y: py(y) }),
    toData: (X, Y) => ({ x: vx(X), y: vy(Y) }),
    ox: px(clamp(0, x0, x1)), oy: py(clamp(0, y0, y1)),
  };
  // Tick numbers thin out when crowded: x needs the widest number plus a gap, y one line of text.
  const xLabW = Math.max(...ticksOf(x0, x1, step).map((v) => textWidth(fmtCoord(v), size)), textWidth('0', size));
  const pick = (need) => [1, 2, 5, 10, 20, 50].find((k) => k * step * unit >= need) ?? 100;
  f.labelEvery = o.labelEvery != null ? { x: o.labelEvery, y: o.labelEvery } : { x: pick(xLabW * 0.9 + 4), y: pick(size * 1.05 + 4) };
  return f;
}

function ticksOf(a, b, s) {
  const out = [];
  for (let k = Math.ceil(a / s - 1e-9); k * s <= b + 1e-9; k++) out.push(+(k * s).toFixed(10));
  return out;
}

/** A stage point to snapped, clamped data coords; null when well outside the grid. */
export function planeHit(f, p, o = {}) {
  const P = f.plot, slop = o.slop ?? 24;
  if (!p || p.x < P.x - slop || p.x > P.x + P.w + slop || p.y < P.y - slop || p.y > P.y + P.h + slop) return null;
  return snapClamp(f, f.toData(p.x, p.y), o.snap ?? 1, o.min, o.max);
}

// Round to the snap step, then clamp to the snapped range inside [min, max] (default the frame).
function snapClamp(f, q, snap, min, max) {
  const mn = min ?? { x: f.x0, y: f.y0 }, mx = max ?? { x: f.x1, y: f.y1 };
  const lo = (v) => (snap > 0 ? Math.ceil(v / snap - 1e-9) * snap : v), hi = (v) => (snap > 0 ? Math.floor(v / snap + 1e-9) * snap : v);
  const sn = (v) => (snap > 0 ? Math.round(v / snap) * snap : v);
  return { x: +clamp(sn(q.x), lo(mn.x), hi(mx.x)).toFixed(6), y: +clamp(sn(q.y), lo(mn.y), hi(mx.y)).toFixed(6) };
}

// -- Text ---------------------------------------------------------------------------------

function textSvg(s, x, y, o = {}) {
  const size = o.size ?? 18;
  const halo = o.halo === false ? '' : `;stroke:var(--sim-bg-surface);stroke-width:${o.haloW ?? 5};paint-order:stroke;stroke-linejoin:round`;
  return `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${o.anchor ?? 'middle'}" style="fill:${o.col ?? 'var(--sim-label)'};font-size:${size}px${o.italic ? ';font-style:italic' : ''}${halo}${o.alpha != null && o.alpha < 1 ? `;opacity:${o.alpha}` : ''}">${esc(s)}</text>`;
}
// Box of a text drawn by textSvg at (x, y) baseline with the given anchor.
function boxOf(s, x, y, size, anchor = 'middle') {
  const w = textWidth(s, size), h = size * 0.82;
  const L = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x: L, y: y - h, w, h: h + size * 0.12 };
}
const hits = (a, b, m = 0) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// Tick numbers and the x / y / O labels, with their px positions (shared by planeSvg and the placement).
function tickLabels(f, o = {}) {
  const size = f.size, out = [];
  const { ox, oy } = f;
  const ex = f.labelEvery.x * f.step, ey = f.labelEvery.y * f.step;
  const on = (v, e) => Math.abs(v / e - Math.round(v / e)) < 1e-6;
  // O first: a tick number that would touch it is left out (the next one along still reads).
  const ol = o.originLabel === undefined ? 'O' : o.originLabel;
  const oL = ol && f.x0 <= 0 && f.x1 >= 0 && f.y0 <= 0 && f.y1 >= 0
    ? { s: ol, x: ox - 5, y: oy + size + 3, anchor: 'end', kind: 'origin' } : null;
  if (oL) oL.box = boxOf(ol, oL.x, oL.y, size, 'end');
  const clearOfO = (b) => !oL || !hits(b, oL.box, 1);
  if (o.numbers !== false) {
    for (const v of ticksOf(f.x0, f.x1, f.step)) {
      if (Math.abs(v) < 1e-9 || !on(v, ex)) continue;
      const s = fmtCoord(v), x = f.px(v), y = oy + size + 6;
      const b = boxOf(s, x, y, size);
      if (Math.abs(x - ox) < textWidth(s, size) / 2 + 6 && f.x0 < 0) continue;   // would sit on the y-axis
      if (b.x < f.rect.x || b.x + b.w > f.rect.x + f.rect.w || !clearOfO(b)) continue;
      out.push({ s, x, y, anchor: 'middle', box: b, kind: 'tick' });
    }
    for (const v of ticksOf(f.y0, f.y1, f.step)) {
      if (Math.abs(v) < 1e-9 || !on(v, ey)) continue;
      const s = fmtCoord(v), x = ox - 9, y = f.py(v) + size * 0.36;
      const b = boxOf(s, x, y, size, 'end');
      if (Math.abs(f.py(v) - oy) < size * 0.5 + 5 && f.y0 < 0) continue;   // would sit on the x-axis
      if (v < 0 && f.y0 < 0 && f.py(v) - size * 0.5 < oy + size + 10 && f.x0 < 0) continue;   // in the band of the x numbers
      if (b.x < f.rect.x - 2 || !clearOfO(b)) continue;
      out.push({ s, x, y, anchor: 'end', box: b, kind: 'tick' });
    }
  }
  const xl = o.xLabel ?? 'x', yl = o.yLabel ?? 'y';
  if (xl) { const x = f.plot.x + f.plot.w + f.arrow + 7, y = oy + size * 0.34; out.push({ s: xl, x, y, anchor: 'start', box: boxOf(xl, x, y, size, 'start'), kind: 'axis' }); }
  if (yl) { const x = ox, y = f.plot.y - f.arrow - 7; out.push({ s: yl, x, y, anchor: 'middle', box: boxOf(yl, x, y, size), kind: 'axis' }); }
  if (oL) out.push(oL);
  return out;
}

/** px boxes of the tick numbers and x / y / O (what a tag must not cover). */
export function tickBoxes(f, o = {}) { return tickLabels(f, o).map((t) => t.box); }

// -- The plane ----------------------------------------------------------------------------

/** Graph paper, axes, arrowheads, x / y / O and tick numbers (see the header). */
export function planeSvg(f, o = {}) {
  const P = f.plot, U = f.unit, L = lookOf(), size = f.size;
  const dim = o.dim ? 0.55 : 1;
  let svg = '';
  if (o.panel !== false) {
    const m = 10;
    svg += `<rect x="${f1(P.x - m)}" y="${f1(P.y - m)}" width="${f1(P.w + 2 * m)}" height="${f1(P.h + 2 * m)}" rx="${f1(10 * L.radius)}" style="fill:var(--sim-bg-surface);stroke:var(--sim-stroke);stroke-width:${f1(2 * L.rim)};stroke-opacity:0.5"/>`;
  }
  // Square grid: a minor line per grid step (doubled while the cell is under 8 px), stronger every 'major'.
  let g = f.grid;
  while (g * U < 8) g *= 2;
  let minor = '', major = '';
  const isMajor = (v) => { const k = v / g; return Math.abs(k / f.major - Math.round(k / f.major)) < 1e-6; };
  for (const v of ticksOf(f.x0, f.x1, g)) { const x = f1(f.px(v)); const d = `M${x} ${f1(P.y)}V${f1(P.y + P.h)}`; if (isMajor(v)) major += d; else minor += d; }
  for (const v of ticksOf(f.y0, f.y1, g)) { const y = f1(f.py(v)); const d = `M${f1(P.x)} ${y}H${f1(P.x + P.w)}`; if (isMajor(v)) major += d; else minor += d; }
  // Close the grid box when the range ends between lines.
  const edge = `M${f1(P.x)} ${f1(P.y)}H${f1(P.x + P.w)}V${f1(P.y + P.h)}H${f1(P.x)}Z`;
  svg += `<path d="${minor}${edge}" style="fill:none;stroke:var(--sim-stroke);stroke-width:1.5;opacity:${f1(0.3 * dim)}"/>`;
  if (major) svg += `<path d="${major}" style="fill:none;stroke:var(--sim-stroke);stroke-width:2.5;opacity:${f1(0.55 * dim)}"/>`;

  // Axes past the grid by f.arrow, arrowheads both ways (or the positive ends only).
  const A = f.arrow, aw = 3 * L.rim, ah = 8, al = 14;
  const both = o.arrows !== 'positive';
  const xa = both ? P.x - A : f.ox, xb = P.x + P.w + A, ya = P.y - A, yb = both ? P.y + P.h + A : f.oy;
  const ink = 'var(--sim-label)';
  svg += `<path d="M${f1(xa + (both ? al - 2 : 0))} ${f1(f.oy)}H${f1(xb - al + 2)}M${f1(f.ox)} ${f1(ya + al - 2)}V${f1(yb - (both ? al - 2 : 0))}" style="fill:none;stroke:${ink};stroke-width:${f1(aw)};stroke-linecap:round"/>`;
  const head = (x, y, dx, dy) => {
    const bx = x - dx * al, by = y - dy * al, nx = -dy, ny = dx;
    return `M${f1(x)} ${f1(y)}L${f1(bx + nx * ah)} ${f1(by + ny * ah)}L${f1(bx - nx * ah)} ${f1(by - ny * ah)}Z`;
  };
  let heads = head(xb, f.oy, 1, 0) + head(f.ox, ya, 0, -1);
  if (both) heads += head(xa, f.oy, -1, 0) + head(f.ox, yb, 0, 1);
  svg += `<path d="${heads}" style="fill:${ink};stroke:${ink};stroke-width:2;stroke-linejoin:round"/>`;

  // Tick marks at each step on both axes.
  if (o.ticks !== false) {
    let d = '';
    for (const v of ticksOf(f.x0, f.x1, f.step)) if (Math.abs(v) > 1e-9) d += `M${f1(f.px(v))} ${f1(f.oy - 6)}v12`;
    for (const v of ticksOf(f.y0, f.y1, f.step)) if (Math.abs(v) > 1e-9) d += `M${f1(f.ox - 6)} ${f1(f.py(v))}h12`;
    if (d) svg += `<path d="${d}" style="fill:none;stroke:${ink};stroke-width:2.5;stroke-linecap:round"/>`;
  }
  for (const t of tickLabels(f, o)) {
    const axis = t.kind !== 'tick';
    svg += textSvg(t.s, t.x, t.y, { size, anchor: t.anchor, italic: t.kind === 'axis', col: axis ? 'var(--sim-label)' : 'var(--sim-label-muted)', alpha: o.dim && !axis ? 0.75 : null });
  }
  return svg;
}

// -- Placement ----------------------------------------------------------------------------

const DIRS = { n: [0, -1], ne: [0.75, -0.75], e: [1, 0], se: [0.75, 0.75], s: [0, 1], sw: [-0.75, 0.75], w: [-1, 0], nw: [-0.75, -0.75] };
const ORDER = ['ne', 'e', 'nw', 'se', 'w', 'sw', 'n', 's'];

// A line in px as { p: point, d: unit direction } for avoid entries { a, b } | { P, Q }.
function avoidLine(f, v) {
  if (v.a != null && v.b != null) { const p = f.toPx(0, v.b), q = f.toPx(1, v.a + v.b); return pxLine(p, q); }
  if (v.P && v.Q) { const P = ptOf(v.P), Q = ptOf(v.Q); return pxLine(f.toPx(P.x, P.y), f.toPx(Q.x, Q.y)); }
  return null;
}
function pxLine(p, q) { const L = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { p, d: { x: (q.x - p.x) / L, y: (q.y - p.y) / L } }; }
// Does px box b (grown by m) cross the infinite px line?
function boxCrossesLine(b, ln, m = 4) {
  const n = { x: -ln.d.y, y: ln.d.x };
  const cs = [[b.x - m, b.y - m], [b.x + b.w + m, b.y - m], [b.x - m, b.y + b.h + m], [b.x + b.w + m, b.y + b.h + m]];
  const s = cs.map(([x, y]) => (x - ln.p.x) * n.x + (y - ln.p.y) * n.y);
  return Math.min(...s) < 0 && Math.max(...s) > 0;
}

// Penalty of a tag box: outside the frame, on an axis, over a tick number or x / y / O, across a line or box to avoid.
function penalty(f, b, o) {
  let s = 0;
  const R = f.plot, m = 8;
  const inner = { x: R.x - m, y: R.y - m, w: R.w + 2 * m, h: R.h + 2 * m };
  const outside = Math.max(0, inner.x - b.x) + Math.max(0, b.x + b.w - inner.x - inner.w) + Math.max(0, inner.y - b.y) + Math.max(0, b.y + b.h - inner.y - inner.h);
  s += outside * 400;
  if (b.y - 3 < f.oy && b.y + b.h + 3 > f.oy && b.x < R.x + R.w + f.arrow && b.x + b.w > R.x - f.arrow) s += 5000;   // across the x-axis
  if (b.x - 3 < f.ox && b.x + b.w + 3 > f.ox && b.y < R.y + R.h + f.arrow && b.y + b.h > R.y - f.arrow) s += 5000;   // across the y-axis
  for (const t of o._ticks ?? []) if (hits(b, t, 3)) s += 1500 + overlap(b, t);
  for (const v of o.avoid ?? []) {
    if (v.w != null && v.h != null) { if (hits(b, v, 4)) s += 3000 + overlap(b, v); continue; }
    const ln = avoidLine(f, v);
    if (ln && boxCrossesLine(b, ln)) s += 4000;
  }
  return s;
}

/** Place a tag of `text` round px anchor `at` (see the header). @opts place, r, size, avoid, numbers */
export function placeTag(f, at, text, o = {}) {
  const size = o.size ?? f.size, w = textWidth(text, size), h = size * 0.94, r = (o.r ?? 7) + 7;
  const order = o.place && o.place !== 'auto' ? [o.place] : (o.order ?? ORDER);
  const opts = { ...o, _ticks: o._ticks ?? tickBoxes(f, o) };
  let best = null;
  order.forEach((k, i) => {
    const [dx, dy] = DIRS[k] ?? DIRS.ne;
    const cx = at.x + dx * (r + w / 2), cy = at.y + dy * (r + h / 2);
    const box = { x: cx - w / 2, y: cy - h / 2, w, h };
    const sc = (order.length > 1 ? penalty(f, box, opts) : 0) + i;
    if (!best || sc < best.sc) best = { sc, box, place: k, x: cx, y: cy + size * 0.36 };
  });
  return { x: best.x, y: best.y, box: best.box, place: best.place };
}

// -- Points, lines, marks -----------------------------------------------------------------

/** A point with an optional tag and guides (see the header). */
export function pointSvg(f, x, y, o = {}) {
  const t = o.tone ?? 1, c = colOf(t), p = f.toPx(x, y), L = lookOf();
  const r = (o.r ?? 7) * (o.lit ? 1.25 : 1), size = o.size ?? f.size;
  const alpha = o.dim ? 0.38 : 1;
  let svg = `<g style="opacity:${alpha}">`;
  if (o.guides) {
    svg += `<path d="M${f1(p.x)} ${f1(p.y)}V${f1(f.oy)}M${f1(p.x)} ${f1(p.y)}H${f1(f.ox)}" style="fill:none;stroke:${c};stroke-width:2.5;stroke-dasharray:7 6;stroke-linecap:round;opacity:0.8"/>`;
  }
  if (o.lit) svg += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r + 8)}" style="fill:${c};opacity:0.22"/>`;
  const dot = `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r)}" style="fill:${c};stroke:${shade(c, 58)};stroke-width:${f1(2.5 * L.rim)}"/>`;
  svg += o.drag ? `<g class="sv-drag"><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(Math.max(22, r + 12))}" style="fill:${c};opacity:0.16"/>${dot}</g>` : dot;
  let tag = o.tag === true ? `(${fmtCoord(x)}, ${fmtCoord(y)})` : o.tag;
  if (tag == null && o.name) tag = `${o.name}(${fmtCoord(x)}, ${fmtCoord(y)})`;
  if (tag) {
    tag = realMinus(tag);
    const at = placeTag(f, p, tag, { ...o, r, size });
    if (o.out) o.out.box = at.box;
    svg += textSvg(tag, at.x, at.y, { size, col: inkOf(t) });
  }
  return svg + '</g>';
}

// Clip the segment p..q (data) to the frame box (Liang-Barsky); null when it misses.
function clipSeg(f, p, q) {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const edges = [[-dx, p.x - f.x0], [dx, f.x1 - p.x], [-dy, p.y - f.y0], [dy, f.y1 - p.y]];
  for (const [pp, qq] of edges) {
    if (Math.abs(pp) < 1e-12) { if (qq < 0) return null; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t1 - t0 < 1e-9) return null;
  return [{ x: p.x + t0 * dx, y: p.y + t0 * dy }, { x: p.x + t1 * dx, y: p.y + t1 * dy }];
}

/** y = ax + b clipped to the frame: data endpoints [left, right] (or null). Vertical: a = Infinity, b = x. */
export function clipLine(f, a, b) {
  if (!Number.isFinite(a)) return b >= f.x0 && b <= f.x1 ? [{ x: b, y: f.y0 }, { x: b, y: f.y1 }] : null;
  return clipSeg(f, { x: f.x0, y: a * f.x0 + b }, { x: f.x1, y: a * f.x1 + b });
}

function lineMarkup(f, ends, o, avoidSelf) {
  if (!ends) return '';
  const t = o.tone ?? 1, c = colOf(t), w = o.width ?? 5;
  const p = f.toPx(ends[0].x, ends[0].y), q = f.toPx(ends[1].x, ends[1].y);
  const dash = o.dash ? `;stroke-dasharray:${o.dash === true ? '13 10' : o.dash}` : '';
  let svg = `<g style="opacity:${o.dim ? 0.38 : 1}"><path d="M${f1(p.x)} ${f1(p.y)}L${f1(q.x)} ${f1(q.y)}" style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round${dash}"/>`;
  if (o.label) {
    const text = realMinus(o.label), size = o.size ?? f.size;
    const tw = textWidth(text, size), th = size * 0.94;
    // From the labelAt end inwards, both sides of the line: the first clear spot wins.
    const [s, e] = o.labelAt === 'start' ? [q, p] : [p, q];
    const L = Math.hypot(e.x - s.x, e.y - s.y) || 1, dx = (e.x - s.x) / L, dy = (e.y - s.y) / L;
    const ticks = tickBoxes(f, o), avoid = [...(o.avoid ?? []), avoidSelf];
    let best = null, i = 0;
    for (const u of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
      for (const sg of [-1, 1]) {
        const nx = -dy * sg, ny = dx * sg;
        const d = Math.abs(nx) * tw / 2 + Math.abs(ny) * th / 2 + w / 2 + 8;
        const cx = s.x + dx * L * u + nx * d, cy = s.y + dy * L * u + ny * d;
        const box = { x: cx - tw / 2, y: cy - th / 2, w: tw, h: th };
        const sc = penalty(f, box, { avoid, _ticks: ticks }) + i++ * 2;
        if (!best || sc < best.sc) best = { sc, box, x: cx, y: cy + size * 0.36 };
      }
    }
    if (o.out) o.out.box = best.box;
    svg += textSvg(text, best.x, best.y, { size, col: inkOf(t) });
  }
  return svg + '</g>';
}

/** The line y = ax + b clipped to the frame (see the header). */
export function lineSvg(f, a, b, o = {}) {
  return lineMarkup(f, clipLine(f, a, b), o, { a, b });
}

/** The line through P and Q, extended to the frame (see the header). */
export function lineThroughSvg(f, P, Q, o = {}) {
  const p = ptOf(P), q = ptOf(Q);
  if (Math.abs(q.x - p.x) < 1e-12) return lineMarkup(f, clipLine(f, Infinity, p.x), o, { P: p, Q: { x: p.x, y: p.y + 1 } });
  const a = (q.y - p.y) / (q.x - p.x);
  return lineMarkup(f, clipLine(f, a, p.y - a * p.x), o, { P: p, Q: q });
}

/** y = ax + b drawing itself by x on the live layer (see the header). */
export function lineDrawOn(live, key, f, a, b, t, o = {}) {
  const ends = clipLine(f, a, b);
  if (!ends) { live.shape(key, 'g'); return { done: true, p: 1 }; }
  const P = ends.map((e) => [f.px(e.x), f.py(e.y)]);
  const base = { dur: o.dur, delay: o.delay, ease: o.ease, tone: o.tone ?? 1, col: o.col, width: o.width ?? 5, head: o.head ?? false, lip: false, by: 'len' };   // a straight line: by length is by x, in either direction
  if (o.from == null || o.from <= ends[0].x || o.from >= ends[1].x) {
    const r = plotLineSvg(live, key, P, t, base);
    return { done: r.done, p: r.p };
  }
  // Outward from x = from: two halves on one clock, so they reach their ends together in time.
  const m = [f.px(o.from), f.py(a * o.from + b)];
  live.shape(key, 'g');
  const r1 = plotLineSvg(live, `${key}|r`, [m, P[1]], t, base);
  const r2 = plotLineSvg(live, `${key}|l`, [m, P[0]], t, base);
  return { done: r1.done && r2.done, p: Math.min(r1.p, r2.p) };
}

/** The "1 across, a up" step triangle under y = ax + b from x0 (see the header). */
export function stepTriangleSvg(f, x0, a, b, o = {}) {
  const run = o.run ?? 1, rise = a * run, t = o.tone ?? 3, c = colOf(t), size = o.size ?? f.size;
  const P0 = f.toPx(x0, a * x0 + b), C = f.toPx(x0 + run, a * x0 + b), P1 = f.toPx(x0 + run, a * (x0 + run) + b);
  let svg = `<g style="opacity:${o.dim ? 0.38 : 1}">`;
  svg += `<path d="M${f1(P0.x)} ${f1(P0.y)}L${f1(C.x)} ${f1(C.y)}L${f1(P1.x)} ${f1(P1.y)}Z" style="fill:${c};opacity:0.16"/>`;
  svg += `<path d="M${f1(P0.x)} ${f1(P0.y)}L${f1(C.x)} ${f1(C.y)}L${f1(P1.x)} ${f1(P1.y)}" style="fill:none;stroke:${c};stroke-width:${o.width ?? 4.5};stroke-linecap:round;stroke-linejoin:round"/>`;
  const sx = Math.sign(P0.x - C.x) || -1, sy = Math.sign(P1.y - C.y) || -1;
  const k = Math.min(12, Math.abs(C.x - P0.x) / 3, Math.abs(C.y - P1.y) / 3);
  if (k > 3) svg += `<path d="M${f1(C.x + sx * k)} ${f1(C.y)}V${f1(C.y + sy * k)}H${f1(C.x)}" style="fill:none;stroke:${c};stroke-width:2.5;stroke-linejoin:round"/>`;
  if (o.out) { o.out.box = { x: Math.min(P0.x, C.x), y: Math.min(C.y, P1.y), w: Math.abs(C.x - P0.x), h: Math.abs(P1.y - C.y) }; o.out.boxes = []; }
  if (o.labels !== false) {
    const ink = inkOf(t), R = f.plot;
    const rl = realMinus(o.runLabel ?? fmtCoord(run)), ul = realMinus(o.riseLabel ?? fmtCoord(rise));
    // Run label: on the side of the run leg away from the rise.
    const away = rise >= 0 ? 1 : -1;     // rise up (screen y smaller): label below the leg
    let ry = C.y + away * (size * 0.5 + 10) + size * 0.36;
    if (ry > R.y + R.h + 4 || ry - size < R.y - 4) ry = C.y - away * (size * 0.5 + 10) + size * 0.36;
    svg += textSvg(rl, (P0.x + C.x) / 2, ry, { size, col: ink });
    if (o.out) o.out.boxes = [boxOf(rl, (P0.x + C.x) / 2, ry, size)];
    // Rise label: outside the triangle, past the rise leg (or inside it when the grid ends there).
    const uw = textWidth(ul, size), side = P1.x >= P0.x ? 1 : -1;
    let ux = C.x + side * (uw / 2 + 10);
    if (ux + uw / 2 > R.x + R.w + 6 || ux - uw / 2 < R.x - 6) ux = C.x - side * (uw / 2 + 10);
    svg += textSvg(ul, ux, (C.y + P1.y) / 2 + size * 0.36, { size, col: ink });
    if (o.out) o.out.boxes.push(boxOf(ul, ux, (C.y + P1.y) / 2 + size * 0.36, size));
  }
  return svg + '</g>';
}

/** The y-intercept (0, b) as a ring on the y-axis with its tag (see the header). */
export function interceptSvg(f, b, o = {}) {
  const t = o.tone ?? 'accent', c = colOf(t), p = f.toPx(0, b), r = o.r ?? 11, L = lookOf();
  let svg = `<g style="opacity:${o.dim ? 0.38 : 1}">`;
  svg += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r)}" style="fill:none;stroke:${shade(c, 70)};stroke-width:${f1(6 * L.rim)}"/>`;
  svg += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r)}" style="fill:none;stroke:${c};stroke-width:${f1(4 * L.rim)}"/>`;
  const tag = o.tag === false ? null : realMinus(o.tag ?? `(0, ${fmtCoord(b)})`);
  if (tag) {
    const at = placeTag(f, p, tag, { ...o, r: r + 2, order: o.order ?? ['w', 'nw', 'sw', 'e', 'ne', 'se'] });
    if (o.out) o.out.box = at.box;
    svg += textSvg(tag, at.x, at.y, { size: o.size ?? f.size, col: inkOf(t) });
  }
  return svg + '</g>';
}

// -- Drag ---------------------------------------------------------------------------------

/** A grid-snapped draggable point (see the header). */
export function dragPoint(frame, o = {}) {
  const F = typeof frame === 'function' ? frame : () => frame;
  const snap = o.snap ?? 1;
  let pos = { x: o.x ?? 0, y: o.y ?? 0 };
  const clampData = (q) => snapClamp(F(), q, snap, o.min, o.max);
  const h = dragHandle({
    radius: o.radius ?? 22,
    at: () => F().toPx(pos.x, pos.y),
    snap: (q) => { const f = F(), d = clampData(f.toData(q.x, q.y)); return f.toPx(d.x, d.y); },
    onMove: (q) => { const d = clampData(F().toData(q.x, q.y)); if (d.x !== pos.x || d.y !== pos.y) { pos = d; o.onMove?.({ ...pos }); } },
    onCommit: () => o.onCommit?.({ ...pos }),
    onStart: o.onStart,
  });
  const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const d = {
    get dragging() { return h.dragging; },
    pos: () => ({ ...pos }),
    set(x, y) { pos = clampData({ x, y }); },
    hover: (p) => h.hover(p),
    down: (p) => h.down(p),
    move: (p) => h.move(p),
    up: (p) => h.up(p),
    key(e) {
      const k = KEYS[e?.key];
      if (!k) return false;
      const s = (snap > 0 ? snap : 1) * (e.shiftKey ? 5 : 1);
      const next = clampData({ x: pos.x + k[0] * s, y: pos.y + k[1] * s });
      if (next.x === pos.x && next.y === pos.y) return false;
      pos = next;
      o.onMove?.({ ...pos });
      return true;
    },
    bindKeys(el, onChange, bo = {}) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (bo.label) el.setAttribute('aria-label', bo.label);
      const fn = (e) => { if (d.key(e)) { e.preventDefault(); onChange?.({ ...pos }); o.onCommit?.({ ...pos }); } };
      el.addEventListener('keydown', fn);
      return () => el.removeEventListener('keydown', fn);
    },
  };
  return d;
}
