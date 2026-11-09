/**
 * SimFarm - fields of crop strips (subject-free): one spec, two renderers (SVG markup for an SvgScene,
 * canvas for a SimScene), the same look. Crops are rows of plants that read at phone size; soil tone
 * says the soil kind. Flat Quill look: flat fills, a darker rim, one soft lip, no gloss, no glow, no faces.
 *
 *   const spec = farmSpec({ strips: [{ crop: 'barley', soil: 'dry', tag: '25 kg' }, ...], orient: 'rows', w: 520, h: 320 });
 *   svg += farmSvg(spec, { x: 20, y: 40, lit: 0, dim: (i) => i > 1 });       // SvgScene paint()
 *   drawFarm(ctx, c, spec, { x: 20, y: 40, grow: this.g });                   // SimScene _draw, c = this.c
 *   const i = farmHit(spec, p.x, p.y, { x: 20, y: 40 });                      // which strip a pointer is on, or -1
 *
 * farmSpec(o) -> spec (pure, no DOM; throws on an unknown crop or soil, never draws a wrong field)
 *   o.strips   [{ crop, soil, label?, tag?, tagTone? }]
 *              crop  'wheat' (plump golden ears, upright, no whiskers) | 'barley' (slim paler straw ears that nod,
 *                    long whiskers: told apart from wheat by SHAPE and tone) | 'sugarcane' (tall jointed canes) |
 *                    'millet' (low leafy plants, one fat grey-brown spike) | 'pulse' (low round bushes, pods) |
 *                    'rice' (green leaves, drooping grain heads) | 'idle' (bare tilled ridges)
 *              soil  'dry' (pale) | 'sandy' | 'loam' (default) | 'rich' (dark) | 'wet' (dark, cool)
 *              label a short name drawn on the strip (plain pill);  tag  a reading pill ('25 kg'), 26+ design px
 *              tagTone  series number or token name for the tag rim (default label-muted)
 *   o.orient   'rows' (strips stacked, each o.w wide; default) | 'cols' (strips side by side, each o.h tall)
 *   o.w, o.h   the field in design px (default 560 x 72 per strip for rows, 560 x 220 for cols)
 *   o.gap      between strips (default 10);  o.border  false: no grassy bund round the field
 *   -> { orient, w, h, gap, border, strips: [{ ...strip, i, x, y, w, h }] }   rects relative to the field's top-left
 *   Keep a strip at least 60 design px thick at design width 560 (rows) so the plants read on a phone.
 *
 * farmSvg(spec, o) -> '<g>...</g>'   each strip is <g data-strip="i" data-crop="wheat"> (tap it: TapLight or own
 *   pointer code with farmHit). o.x, o.y  top-left; o.grow  0..1, array per strip or fn(i) (default 1: grown);
 *   o.lit  index, array or fn(i) -> bool: an accent rim (never a glow); o.dim  fn(i) -> bool: that strip at 0.3;
 *   o.animate  true: plants grow in by CSS (sv-grow, staggered o.lag s, default 0.12) and rest. Repaints replay CSS
 *   animations, so pass it only on the paint that brings the field. Static under prefers-reduced-motion (the
 *   SvgScene stage turns animations off). o.tags false hides tags; o.tagSize (default 26); o.cls on the root <g>.
 * drawFarm(ctx, c, spec, o) -> [{ i, x, y, w, h }]   the canvas twin (same o, no animate: drive o.grow yourself).
 * farmHit(spec, px, py, { x, y }) -> strip index or -1.
 * farmGrow(t, n, { dur, lag }) -> [g0..gn-1]   per-strip grow for clock seconds t (kit SimAnim lagged: all 1 under
 *   reduced motion); farmGrowSeconds(n, { dur, lag }) is how long it takes (for this.play / busy).
 *
 * Tag placement (added 2026-11-09; scenes should pass tagPlace: 'end' or 'outside' so tags never sit on the crops):
 *   o.tagPlace (farmSvg / drawFarm, or farmSpec o.tagPlace as the field's default)
 *     'inside' (default, the old look: tag on the strip's far end, over the plants; label on the near end)
 *     'end'     the strip keeps a bare headland lane for the tag (rows: at the right end; cols: a top band) and for
 *               the label (rows: left end; cols: bottom band); plants and furrows stop before the lanes
 *     'outside' tags in the margin beyond the field (rows: right of the bund; cols: above it), labels opposite
 *               (rows: left; cols: below). Leave room: farmBox(spec, o) -> { x, y, w, h } relative to the field's
 *               top-left, bund and outside tags included.
 * One strip growing while the rest stay grown: grow: farmGrowOne(i, g) (or any fn / array). To replay the CSS
 *   grow-in on one strip only: animate: i (or an array of indexes, or fn(i) -> bool); animate: true is all strips.
 * Tag in crop tone: tagSvg / drawTag tone: a crop name ('wheat', 'barley', ...) gives a crop-tone rim and a light
 *   crop tint; a strip's tagTone: 'crop' uses that strip's own crop.
 *
 * Optional parts:
 *   wellSvg({ x, y, w, depth, level, cls }) / drawWell(ctx, c, o)   a small stone well and the ground cut away under
 *     it: the shaft, the water in it and a dashed water line across the cut. (x, y) is the ground centre of the well
 *     mouth; w the well's width (default 90), depth the cut below ground (default 1.5 w); level 0..1 (default 0.6)
 *     where the water stands. No numbers: the water table is a picture. wellSize(o) -> { w, h, above }.
 *   tagSvg(text, x, y, o) / drawTag(ctx, c, text, x, y, o)   the strip tag on its own, centred on (x, y): o.size
 *     (default 26), o.tone (rim). Returns markup / the drawn box.
 *   cropTone(crop) -> CSS colour, cropColor(c, crop) -> canvas colour   the crop's ear tone, for a matching chip.
 *
 * Colours: tokens only (gold, series 2/3/8, waste, water, bg-surface, label), mixed the same way in both
 * renderers (color-mix in srgb and SimLook mix/darken/lighten). Wheat gold, barley series-2 toward straw, idle =
 * bare soil. Tag text: var(--sim-font) (SVG) and SimLook font() (canvas) only, never a family by hand. ASCII only.
 */
import { mix, darken, lighten, alpha, font } from './SimLook.js';
import { lagged, hash2 } from './SimAnim.js';

export const FARM_CROPS = ['wheat', 'barley', 'sugarcane', 'millet', 'pulse', 'rice', 'idle'];
export const FARM_SOILS = ['dry', 'sandy', 'loam', 'rich', 'wet'];

const VAR = {
  gold: '--sim-gold', water: '--sim-water', waste: '--sim-waste', label: '--sim-label', labelMuted: '--sim-label-muted',
  bgSurface: '--sim-bg-surface', accent: '--sim-accent', s2: '--sim-series-2', s3: '--sim-series-3', s8: '--sim-series-8',
};

// A paint is a token key and a chain of steps: ['m', key, t] mix t toward key, ['d', t] toward black, ['l', t] toward white.
const P = (k, ...ops) => ({ k, ops });
const tok = (k) => (VAR[k] ? k : (typeof k === 'number' ? `s${k}` : k));

function css(p) {
  let s = `var(${VAR[p.k] ?? `--sim-${p.k}`})`;
  for (const op of p.ops) {
    if (op[0] === 'm') s = `color-mix(in srgb, ${s} ${pc(1 - op[2])}%, var(${VAR[op[1]]}))`;
    else s = `color-mix(in srgb, ${s} ${pc(1 - op[1])}%, ${op[0] === 'd' ? 'black' : 'white'})`;
  }
  return s;
}
function col(c, p) {
  let v = c[p.k];
  for (const op of p.ops) v = op[0] === 'm' ? mix(v, c[op[1]], op[2]) : op[0] === 'd' ? darken(v, op[1]) : lighten(v, op[1]);
  return v;
}
const pc = (u) => Math.round(u * 1000) / 10;
const n1 = (v) => Math.round(v * 10) / 10;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

// Materials. The brown is series-8 dulled by waste, dimmed a little toward the surface (night in dark theme).
const BROWN = [['m', 'waste', 0.45], ['m', 'bgSurface', 0.18]];
const SOIL = {
  dry: P('s8', ...BROWN, ['m', 'gold', 0.2], ['l', 0.55]),
  sandy: P('gold', ['m', 'waste', 0.4], ['m', 'bgSurface', 0.2], ['l', 0.22]),
  loam: P('s8', ...BROWN, ['d', 0.12]),
  rich: P('s8', ...BROWN, ['d', 0.48]),
  wet: P('s8', ...BROWN, ['m', 'water', 0.16], ['d', 0.36]),
};
const soilRim = (s) => P(s.k, ...s.ops, ['d', 0.38]);
const soilLip = (s) => P(s.k, ...s.ops, ['d', 0.5]);
const soilFurrow = (s) => P(s.k, ...s.ops, ['d', 0.22]);
const soilLit = (s) => P(s.k, ...s.ops, ['l', 0.3]);

const LEAF = P('s3', ['m', 's8', 0.12], ['d', 0.18]);
const LEAF_RIM = P('s3', ['d', 0.5]);
const STRAW = P('gold', ['m', 's3', 0.3], ['d', 0.08]);
const WHEAT = P('gold');
const WHEAT_RIM = P('gold', ['d', 0.42]);
const BARLEY = P('s2', ['m', 's3', 0.28], ['l', 0.32]);
const BARLEY_RIM = P('s2', ['m', 's3', 0.28], ['d', 0.36]);
const AWN = P('s2', ['m', 's3', 0.28], ['d', 0.12]);
const CANE = P('s3', ['m', 'gold', 0.42]);
const CANE_NODE = P('s3', ['m', 'gold', 0.42], ['d', 0.38]);
const MILLET = P('waste', ['m', 'gold', 0.45], ['l', 0.1]);
const MILLET_RIM = P('waste', ['d', 0.4]);
const POD = P('s3', ['l', 0.35]);
const RICE = P('gold', ['m', 's3', 0.3], ['l', 0.1]);
const BUND = P('s3', ['m', 's8', 0.3], ['m', 'bgSurface', 0.42]);
const BUND_RIM = P('s3', ['m', 's8', 0.3], ['m', 'bgSurface', 0.42], ['d', 0.32]);
const STONE = P('waste', ['m', 'bgSurface', 0.35], ['l', 0.18]);
const STONE_RIM = P('waste', ['d', 0.42]);
const HOLE = P('waste', ['d', 0.5]);
const WATER = P('water', ['m', 'bgSurface', 0.15]);
const WATER_LINE = P('water', ['d', 0.25]);
const TAG_BG = P('bgSurface');
const TAG_INK = P('label');
const TAG_RIM = P('labelMuted');

const CROP_TONE = { wheat: WHEAT, barley: BARLEY, sugarcane: CANE, millet: MILLET, pulse: LEAF, rice: RICE, idle: SOIL.loam };
export const cropTone = (crop) => css(CROP_TONE[crop] ?? WHEAT);
export const cropColor = (c, crop) => col(c, CROP_TONE[crop] ?? WHEAT);

// Shapes in plant units: base at (0, 0), up is -y. { t: 'p' path | 'e' ellipse | 'r' rect, f fill, s stroke, lw, ear }
const path = (d, f, s, lw = 1.4, o = {}) => ({ t: 'p', d, f, s, lw, ...o });
const line = (d, s, lw = 2.6, o = {}) => ({ t: 'p', d, s, lw, ...o });
const oval = (x, y, rx, ry, f, s, rot = 0, o = {}) => ({ t: 'e', x, y, rx, ry, f, s, lw: 1.2, rot, ...o });
const box = (x, y, w, h, r, f, s, o = {}) => ({ t: 'r', x, y, w, h, r, f, s, lw: 1.2, ...o });

const leaves = (h = 1) => [
  path(`M0 -2 Q-9 ${-10 * h} -17 ${-22 * h} Q-6 ${-16 * h} 1 -6 Z`, LEAF),
  path(`M0 -5 Q9 ${-13 * h} 16 ${-26 * h} Q5 ${-18 * h} -1 -9 Z`, LEAF),
];

// Each crop: nominal height (design px at scale 1), spacing in a row, and its shapes.
const CROP = {
  wheat: { h: 62, sp: 18, pad: 17, shapes: () => {
    const out = [...leaves(), line('M0 0 Q1.5 -18 0 -34', STRAW, 2.6)];
    for (let i = 0; i < 5; i++) {
      const y = -37 - i * 4.4;
      out.push(oval(-3, y, 3.3, 4.4, WHEAT, WHEAT_RIM, -14, { ear: 1 }), oval(3, y, 3.3, 4.4, WHEAT, WHEAT_RIM, 14, { ear: 1 }));
    }
    out.push(oval(0, -59, 3.2, 4.4, WHEAT, WHEAT_RIM, 0, { ear: 1 }));
    return out;
  } },
  barley: { h: 66, sp: 19, pad: 22, shapes: () => {
    // The ear leans and nods; every grain carries a long whisker (awn) past the tip.
    const out = [...leaves(), line('M0 0 Q2 -20 5 -31', STRAW, 2.4)];
    const ax = 5, ay = -31, ux = 0.42, uy = -0.91, n = 6;
    const awns = [];
    for (let i = 0; i < n; i++) {
      const d = 3 + i * 3.6, side = i % 2 ? 1 : -1;
      const gx = ax + ux * d + side * 1.9 * -uy, gy = ay + uy * d + side * 1.9 * ux;
      const L = 30 - i * 2.2, sp = side * 0.12;
      awns.push(`M${n1(gx)} ${n1(gy - 3)} L${n1(gx + (ux + sp) * L)} ${n1(gy + (uy + sp * 0.4) * L - 3)}`);
      out.push(oval(gx, gy, 2.1, 3.9, BARLEY, BARLEY_RIM, 25, { ear: 1 }));
    }
    out.push(line(awns.join(''), AWN, 1.5, { ear: 1 }));
    return out;
  } },
  sugarcane: { h: 124, sp: 28, pad: 32, shapes: () => {
    const out = [];
    for (const [x, top] of [[-8, -100], [0, -114], [8, -94]]) {
      out.push(box(x - 3.2, top, 6.4, -top, 2.6, CANE, CANE_NODE));
      let d = '';
      for (let y = -14; y > top + 6; y -= 15) d += `M${n1(x - 3.4)} ${y}H${n1(x + 3.4)}`;
      out.push(line(d, CANE_NODE, 2.2));
      out.push(path(`M${x} ${top + 2} Q${x - 16} ${top - 10} ${x - 28} ${top + 14} Q${x - 14} ${top} ${x} ${top + 7} Z`, LEAF, LEAF_RIM, 1));
      out.push(path(`M${x} ${top + 4} Q${x + 18} ${top - 8} ${x + 28} ${top + 16} Q${x + 14} ${top + 3} ${x} ${top + 9} Z`, LEAF, LEAF_RIM, 1));
      out.push(path(`M${x} ${top + 30} Q${x + 14} ${top + 22} ${x + 22} ${top + 40} Q${x + 10} ${top + 30} ${x} ${top + 35} Z`, LEAF, null));
    }
    return out;
  } },
  millet: { h: 52, sp: 24, pad: 22, shapes: () => [
    path('M0 -1 Q-12 -8 -22 -24 Q-8 -14 1 -7 Z', LEAF),
    path('M0 -4 Q12 -10 22 -26 Q9 -16 -1 -10 Z', LEAF),
    path('M0 -12 Q-8 -20 -12 -34 Q-3 -24 1 -17 Z', LEAF),
    line('M0 0 V-32', STRAW, 2.4),
    box(-4.4, -52, 8.8, 22, 4.4, MILLET, MILLET_RIM, { ear: 1 }),
    line('M-3 -46H3M-3 -41H3M-3 -36H3', MILLET_RIM, 1.2, { ear: 1 }),
  ] },
  pulse: { h: 34, sp: 26, pad: 19, shapes: () => [
    oval(-8, -11, 9, 8, LEAF, LEAF_RIM), oval(8, -11, 9, 8, LEAF, LEAF_RIM),
    oval(0, -22, 10, 9, LEAF, LEAF_RIM), oval(0, -8, 10, 7.5, LEAF, LEAF_RIM),
    oval(-6, -16, 2.2, 5, POD, LEAF_RIM, 30, { ear: 1 }), oval(7, -9, 2.2, 5, POD, LEAF_RIM, -30, { ear: 1 }), oval(3, -27, 2, 4.5, POD, LEAF_RIM, 20, { ear: 1 }),
  ] },
  rice: { h: 54, sp: 18, pad: 20, shapes: () => {
    const out = [...leaves(1.3), line('M0 0 Q1 -32 9 -44 Q15 -48 17 -36', STRAW, 2.2)];
    for (let i = 0; i < 6; i++) out.push(oval(10 + i * 1.6, -44 + i * 3.4, 2, 3.2, RICE, WHEAT_RIM, -25, { ear: 1 }));
    return out;
  } },
};
const SHAPES = Object.fromEntries(Object.entries(CROP).map(([k, v]) => [k, v.shapes()]));

/** Pure layout: each strip's rect inside the field. Throws on an unknown crop or soil. */
export function farmSpec(o = {}) {
  const list = o.strips ?? [];
  if (!list.length) throw new Error('SimFarm: farmSpec needs at least one strip');
  for (const s of list) {
    if (!FARM_CROPS.includes(s.crop)) throw new Error(`SimFarm: unknown crop "${s.crop}" (${FARM_CROPS.join(', ')})`);
    if (s.soil != null && !FARM_SOILS.includes(s.soil)) throw new Error(`SimFarm: unknown soil "${s.soil}" (${FARM_SOILS.join(', ')})`);
  }
  const n = list.length, orient = o.orient === 'cols' ? 'cols' : 'rows', gap = o.gap ?? 10;
  const w = o.w ?? 560, h = o.h ?? (orient === 'rows' ? n * 72 + (n - 1) * gap : 220);
  const sw = orient === 'cols' ? (w - gap * (n - 1)) / n : w, sh = orient === 'rows' ? (h - gap * (n - 1)) / n : h;
  const strips = list.map((s, i) => ({ soil: 'loam', ...s, i,
    x: orient === 'cols' ? i * (sw + gap) : 0, y: orient === 'rows' ? i * (sh + gap) : 0, w: sw, h: sh }));
  const spec = { orient, w, h, gap, border: o.border !== false, strips };
  if (o.tagPlace) spec.tagPlace = o.tagPlace;
  return spec;
}

/** Which strip (index) a point in stage px falls on, or -1. o: the farm's { x, y }. */
export function farmHit(spec, px, py, o = {}) {
  const x = px - (o.x ?? 0), y = py - (o.y ?? 0);
  for (const s of spec.strips) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s.i;
  return -1;
}

/** Per-strip grow for clock seconds t: strips come up one after another (all 1 under reduced motion). */
export function farmGrow(t, n, o = {}) {
  return Array.from({ length: n }, (_, i) => lagged(t, i, n, { dur: o.dur ?? 0.9, lag: o.lag ?? 0.18 }));
}
export const farmGrowSeconds = (n, o = {}) => (o.dur ?? 0.9) + Math.max(0, n - 1) * (o.lag ?? 0.18);

/** grow for one strip: strip i at g (0..1), every other strip at rest (default 1: grown). Pass as o.grow. */
export const farmGrowOne = (i, g, rest = 1) => (j) => (j === i ? g : rest);

const pick = (v, i, dflt) => (typeof v === 'function' ? v(i) : Array.isArray(v) ? (v[i] ?? dflt) : v ?? dflt);
const isLit = (lit, i) => (lit == null ? false : typeof lit === 'function' ? !!lit(i) : Array.isArray(lit) ? lit.includes(i) : lit === i);

// Plants for one strip: [{ x, y, s, g, sx, sy }] far rows first, plus the furrow lines.
function plantsOf(s, g) {
  const isIdle = s.crop === 'idle', C = isIdle ? { h: 22, sp: 30 } : CROP[s.crop];
  const room = s.h - 13, sc = Math.min(1, room / C.h), ph = C.h * sc;
  const yTop = s.y + ph + 6, yBot = s.y + s.h - 7, pitch = Math.max(ph * 0.36, 16);
  const nr = yBot > yTop ? 1 + Math.floor((yBot - yTop) / pitch) : 1;
  const rowsY = nr === 1 ? [yBot] : Array.from({ length: nr }, (_, r) => yTop + ((yBot - yTop) * r) / (nr - 1));
  const sp = Math.max(9, C.sp * sc), padX = Math.max(8, (C.pad ?? 10) * sc), plants = [];
  rowsY.forEach((by, r) => {
    const off = r % 2 ? sp / 2 : 0, nc = Math.max(1, Math.floor((s.w - 2 * padX - off) / sp) + 1);
    const span = (nc - 1) * sp, x0 = s.x + (s.w - span) / 2 + off / 2;
    for (let j = 0; j < nc; j++) {
      const h = hash2(s.i * 97 + r, j), gp = clamp01((g - 0.14 * h) / (1 - 0.14 * h));
      const k = sc * (0.93 + 0.1 * hash2(j, s.i * 31 + r));
      plants.push({ x: n1(x0 + j * sp + (h - 0.5) * 2.4), y: n1(by), sx: k * (0.55 + 0.45 * gp), sy: k * Math.max(0.04, gp), ear: clamp01((gp - 0.55) / 0.35) });
    }
  });
  return { rowsY, plants, idle: isIdle };
}

// Tag size: width by character count (Nunito extra-bold is about 0.56 em a character).
function tagBox(text, x, y, size) {
  const h = Math.round(size * 1.5), w = Math.round(String(text).length * size * 0.56 + size * 1.1);
  return { x: x - w / 2, y: y - h / 2, w, h };
}
function tagAt(s, size, spec, text) {
  const b = tagBox(text, 0, 0, size);
  return spec.orient === 'rows' ? [s.x + s.w - b.w / 2 - 12, s.y + s.h / 2] : [s.x + s.w / 2, s.y + b.h / 2 + 10];
}
function labelAt(s, size, spec, text) {
  const b = tagBox(text, 0, 0, size);
  return spec.orient === 'rows' ? [s.x + b.w / 2 + 12, s.y + s.h / 2] : [s.x + s.w / 2, s.y + s.h - b.h / 2 - 10];
}

// Placement: 'inside' (old default), 'end' (lanes inside the strip), 'outside' (margin beyond the bund).
const PLACES = ['inside', 'end', 'outside'];
const fieldPad = (spec) => Math.max(6, spec.gap / 2 + 4);
function placeOf(spec, o) {
  const place = o.tagPlace ?? spec.tagPlace ?? 'inside';
  if (!PLACES.includes(place)) throw new Error(`SimFarm: unknown tagPlace "${place}" (${PLACES.join(', ')})`);
  const size = o.tagSize ?? 26, show = o.tags !== false, rows = spec.orient === 'rows';
  let tagW = 0, tagH = 0, labW = 0, labH = 0;
  for (const s of spec.strips) {
    if (show && s.tag != null) { const b = tagBox(s.tag, 0, 0, size); tagW = Math.max(tagW, b.w); tagH = Math.max(tagH, b.h); }
    if (show && s.label != null) { const b = tagBox(s.label, 0, 0, size * 0.8); labW = Math.max(labW, b.w); labH = Math.max(labH, b.h); }
  }
  return { place, size, rows, tagW, tagH, labW, labH };
}
// The plant area of a strip: the whole strip, less the lanes under 'end'.
function areaOf(s, PL) {
  if (PL.place !== 'end') return s;
  if (PL.rows) {
    const l = PL.labW ? PL.labW + 16 : 0, r = PL.tagW ? PL.tagW + 16 : 0;
    return { ...s, x: s.x + l, w: Math.max(24, s.w - l - r) };
  }
  const t = PL.tagH ? PL.tagH + 12 : 0, b = PL.labH ? PL.labH + 12 : 0;
  return { ...s, y: s.y + t, h: Math.max(24, s.h - t - b) };
}
function tagPos(s, spec, PL, text) {
  if (PL.place === 'inside') return tagAt(s, PL.size, spec, text);
  const b = tagBox(text, 0, 0, PL.size);
  if (PL.place === 'end') return PL.rows ? [s.x + s.w - 8 - PL.tagW / 2, s.y + s.h / 2] : [s.x + s.w / 2, s.y + 6 + PL.tagH / 2];
  const pad = fieldPad(spec);
  return PL.rows ? [spec.w + pad + 10 + b.w / 2, s.y + s.h / 2] : [s.x + s.w / 2, -pad - 8 - b.h / 2];
}
function labelPos(s, spec, PL, text) {
  if (PL.place === 'inside') return labelAt(s, PL.size * 0.8, spec, text);
  const b = tagBox(text, 0, 0, PL.size * 0.8);
  if (PL.place === 'end') return PL.rows ? [s.x + 8 + PL.labW / 2, s.y + s.h / 2] : [s.x + s.w / 2, s.y + s.h - 6 - PL.labH / 2];
  const pad = fieldPad(spec);
  return PL.rows ? [-pad - 10 - b.w / 2, s.y + s.h / 2] : [s.x + s.w / 2, spec.h + pad + 4 + 8 + b.h / 2];
}

/** The box the field draws in, relative to its top-left: bund, and tags/labels when tagPlace is 'outside'. */
export function farmBox(spec, o = {}) {
  const PL = placeOf(spec, o), pad = spec.border ? fieldPad(spec) : 0;
  let x = -pad, y = -pad, x1 = spec.w + pad, y1 = spec.h + pad + (spec.border ? 4 : 0);
  if (PL.place === 'outside') {
    const p = fieldPad(spec);
    if (PL.rows) { if (PL.tagW) x1 = Math.max(x1, spec.w + p + 10 + PL.tagW + 2); if (PL.labW) x = Math.min(x, -p - 10 - PL.labW - 2); }
    else { if (PL.tagH) y = Math.min(y, -p - 8 - PL.tagH - 2); if (PL.labH) y1 = Math.max(y1, spec.h + p + 12 + PL.labH + 4); }
  }
  return { x, y, w: x1 - x, h: y1 - y };
}

// Tag rim and fill for a tone: a crop name (crop tone rim, light crop tint), a series number or a token name.
const isCrop = (t) => typeof t === 'string' && FARM_CROPS.includes(t);
const cropRim = (crop) => { const p = CROP_TONE[crop]; return P(p.k, ...p.ops, ['d', 0.18]); };
const cropTint = (crop) => { const p = CROP_TONE[crop]; return P(p.k, ...p.ops, ['m', 'bgSurface', 0.66]); };
const stripTone = (s) => (s.tagTone === 'crop' ? s.crop : s.tagTone);

// ---------- SVG ----------
const fs = (p) => (p ? css(p) : 'none');
function shapeSvg(sh, earA) {
  const st = [`fill:${fs(sh.f)}`];
  if (sh.s) st.push(`stroke:${css(sh.s)};stroke-width:${sh.lw};stroke-linecap:round;stroke-linejoin:round`);
  if (sh.ear && earA < 1) st.push(`opacity:${earA.toFixed(2)}`);
  const style = `style="${st.join(';')}"`;
  if (sh.t === 'p') return `<path d="${sh.d}" ${style}/>`;
  if (sh.t === 'r') return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" rx="${sh.r}" ${style}/>`;
  return `<ellipse cx="${sh.x}" cy="${sh.y}" rx="${sh.rx}" ry="${sh.ry}"${sh.rot ? ` transform="rotate(${sh.rot} ${sh.x} ${sh.y})"` : ''} ${style}/>`;
}

/** The strip tag (a reading pill) centred on (x, y), as SVG. o: size (26), tone (rim: series number or token). */
export function tagSvg(text, x, y, o = {}) {
  const size = Math.max(14, o.size ?? 26), b = tagBox(text, x, y, size), plain = o.plain;
  const crop = isCrop(o.tone);
  const rim = crop ? css(cropRim(o.tone)) : o.tone != null ? `var(--sim-${typeof o.tone === 'number' ? `series-${o.tone}` : o.tone})` : css(TAG_RIM);
  return `<g class="sf-tag">`
    + (plain ? '' : `<rect x="${n1(b.x)}" y="${n1(b.y + 3)}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" style="fill:${css(soilLip(SOIL.loam))};opacity:0.45"/>`)
    + `<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" style="fill:${css(crop && !plain ? cropTint(o.tone) : TAG_BG)};${plain ? 'opacity:0.88' : `stroke:${rim};stroke-width:${crop ? 3 : 2.5}`}"/>`
    + `<text x="${n1(x)}" y="${n1(y)}" text-anchor="middle" dominant-baseline="central" style="fill:${css(TAG_INK)};font-family:var(--sim-font);font-weight:800;font-size:${size}px">${escText(text)}</text></g>`;
}
const escText = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function animOf(a, i) {
  if (a === true) return { on: true, d: i };
  if (a == null || a === false) return { on: false, d: 0 };
  if (Array.isArray(a)) { const k = a.indexOf(i); return { on: k >= 0, d: Math.max(0, k) }; }
  return { on: typeof a === 'function' ? !!a(i) : a === i, d: 0 };
}

function stripSvg(spec, s, o, g, PL) {
  const soil = SOIL[s.soil] ?? SOIL.loam, lit = isLit(o.lit, s.i), dim = o.dim && o.dim(s.i);
  const A = areaOf(s, PL), an = animOf(o.animate, s.i);
  const { rowsY, plants, idle } = plantsOf(A, g);
  let out = `<g data-strip="${s.i}" data-crop="${s.crop}"${dim ? ' style="opacity:0.3"' : ''}>`
    + `<rect x="${n1(s.x)}" y="${n1(s.y + 4)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="9" style="fill:${css(soilLip(soil))}"/>`
    + `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="9" style="fill:${css(soil)};stroke:${lit ? 'var(--sim-accent)' : css(soilRim(soil))};stroke-width:${lit ? 4.5 : 2}"/>`
    + `<rect x="${n1(s.x + 8)}" y="${n1(s.y + 3)}" width="${n1(Math.max(0, s.w - 16))}" height="3" rx="1.5" style="fill:${css(soilLit(soil))};opacity:0.7"/>`;
  for (const by of rowsY) {
    out += idle
      ? `<path d="${ridgePath(A, by)}" style="fill:none;stroke:${css(soilRim(soil))};stroke-width:3.2;stroke-linecap:round"/><path d="${ridgePath(A, by - 3)}" style="fill:none;stroke:${css(soilLit(soil))};stroke-width:2;stroke-linecap:round;opacity:0.8"/>`
      : `<rect x="${n1(A.x + 7)}" y="${n1(by - 2)}" width="${n1(A.w - 14)}" height="4" rx="2" style="fill:${css(soilFurrow(soil))}"/>`;
  }
  if (!idle) {
    const shapes = SHAPES[s.crop];
    out += `<g class="sf-plants${an.on ? ' sv-grow' : ''}"${an.on ? ` style="--d:${(an.d * (o.lag ?? 0.12)).toFixed(2)}s"` : ''}>`;
    for (const p of plants) {
      out += `<g transform="translate(${p.x} ${p.y}) scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})">`;
      for (const sh of shapes) if (!sh.ear || p.ear > 0) out += shapeSvg(sh, p.ear);
      out += '</g>';
    }
    out += '</g>';
  }
  const size = PL.size;
  if (s.label && o.tags !== false) { const [lx, ly] = labelPos(s, spec, PL, s.label); out += tagSvg(s.label, lx, ly, { size: size * 0.8, plain: true }); }
  if (s.tag && o.tags !== false) { const [tx, ty] = tagPos(s, spec, PL, s.tag); out += tagSvg(s.tag, tx, ty, { size, tone: stripTone(s) }); }
  return out + '</g>';
}

function ridgePath(s, y) {
  let d = '';
  const x0 = s.x + 12, x1 = s.x + s.w - 12, step = 22;
  for (let x = x0; x < x1 - 4; x += step) d += `M${n1(x)} ${n1(y)}Q${n1(x + step / 2 - 2)} ${n1(y - 5)} ${n1(Math.min(x1, x + step - 4))} ${n1(y)}`;
  return d;
}

/** The field as one <g> string for an SvgScene. See the header for o. */
export function farmSvg(spec, o = {}) {
  const x = o.x ?? 0, y = o.y ?? 0, pad = Math.max(6, spec.gap / 2 + 4);
  let out = `<g class="sf-farm${o.cls ? ` ${o.cls}` : ''}" transform="translate(${n1(x)} ${n1(y)})">`;
  if (spec.border) out += `<rect x="${-pad}" y="${-pad}" width="${n1(spec.w + 2 * pad)}" height="${n1(spec.h + 2 * pad + 4)}" rx="${12 + pad / 2}" style="fill:${css(BUND)};stroke:${css(BUND_RIM)};stroke-width:2"/>`;
  const PL = placeOf(spec, o);
  for (const s of spec.strips) out += stripSvg(spec, s, o, clamp01(pick(o.grow, s.i, 1)), PL);
  return out + '</g>';
}

/** Size of a well drawing: { w, h, above } (above: the part over the ground line). */
export function wellSize(o = {}) {
  const w = o.w ?? 90, depth = o.depth ?? w * 1.5, above = Math.round(w * 0.52);
  return { w: Math.round(w * 1.5), h: above + depth, above };
}

function wellParts(o) {
  const w = o.w ?? 90, depth = o.depth ?? w * 1.5, lv = clamp01(o.level ?? 0.6), x = o.x ?? 0, y = o.y ?? 0;
  const cw = w * 1.5, cut = { x: x - cw / 2, y, w: cw, h: depth };
  const sw = w * 0.42, shaft = { x: x - sw / 2, y: y + 2, w: sw, h: depth - 10 };
  const wh = (shaft.h - 8) * lv, wy = shaft.y + shaft.h - wh;
  const head = { x: x - w / 2, y: y - w * 0.36, w, h: w * 0.36 };
  return { w, depth, cut, shaft, wy, wh, head, x, y, lv };
}

/** A small stone well and the ground cut away under it (see the header). */
export function wellSvg(o = {}) {
  const q = wellParts(o), soil = SOIL[o.soil ?? 'loam'];
  const r = (b, rx, p, extra = '') => `<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" rx="${rx}" style="fill:${css(p)};${extra}"/>`;
  let out = `<g class="sf-well${o.cls ? ` ${o.cls}` : ''}">`;
  out += r({ ...q.cut, y: q.cut.y + 4 }, 10, soilLip(soil)) + r(q.cut, 10, soil, `stroke:${css(soilRim(soil))};stroke-width:2`);
  for (let k = 1; k <= 3; k++) {
    const yy = q.cut.y + (q.cut.h * k) / 4;
    out += `<path d="M${n1(q.cut.x + 8)} ${n1(yy)}Q${n1(q.x - q.w * 0.4)} ${n1(yy - 5)} ${n1(q.x)} ${n1(yy)}T${n1(q.cut.x + q.cut.w - 8)} ${n1(yy)}" style="fill:none;stroke:${css(soilFurrow(soil))};stroke-width:2.4;stroke-linecap:round"/>`;
  }
  out += r(q.shaft, 4, HOLE);
  if (q.wh > 0.5) {
    out += r({ x: q.shaft.x, y: q.wy, w: q.shaft.w, h: q.wh }, 4, WATER);
    out += `<path d="M${n1(q.cut.x + 6)} ${n1(q.wy)}H${n1(q.cut.x + q.cut.w - 6)}" style="fill:none;stroke:${css(WATER_LINE)};stroke-width:3;stroke-dasharray:9 7;stroke-linecap:round"/>`;
  }
  const hd = q.head, ry = q.w * 0.13;
  out += r({ ...hd, y: hd.y + 4 }, 6, STONE_RIM) + r(hd, 6, STONE, `stroke:${css(STONE_RIM)};stroke-width:2`);
  out += `<path d="M${n1(hd.x + 4)} ${n1(hd.y + hd.h * 0.55)}H${n1(hd.x + hd.w - 4)}M${n1(q.x - hd.w * 0.18)} ${n1(hd.y + 2)}V${n1(hd.y + hd.h * 0.55)}M${n1(q.x + hd.w * 0.22)} ${n1(hd.y + hd.h * 0.55)}V${n1(hd.y + hd.h - 2)}" style="fill:none;stroke:${css(STONE_RIM)};stroke-width:1.6"/>`;
  out += `<ellipse cx="${n1(q.x)}" cy="${n1(hd.y)}" rx="${n1(hd.w / 2)}" ry="${n1(ry)}" style="fill:${css(STONE)};stroke:${css(STONE_RIM)};stroke-width:2"/>`;
  out += `<ellipse cx="${n1(q.x)}" cy="${n1(hd.y + 1)}" rx="${n1(hd.w * 0.36)}" ry="${n1(ry * 0.62)}" style="fill:${css(HOLE)}"/>`;
  return out + '</g>';
}

// ---------- canvas ----------
const canPath = () => typeof Path2D !== 'undefined';

function shapeCanvas(ctx, c, sh, earA) {
  ctx.save();
  if (sh.ear) ctx.globalAlpha *= earA;
  if (sh.t === 'p') {
    const p = canPath() ? new Path2D(sh.d) : null;
    if (p) {
      if (sh.f) { ctx.fillStyle = col(c, sh.f); ctx.fill(p); }
      if (sh.s) { ctx.strokeStyle = col(c, sh.s); ctx.lineWidth = sh.lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); }
    }
  } else {
    ctx.beginPath();
    if (sh.t === 'r') roundRect(ctx, sh.x, sh.y, sh.w, sh.h, sh.r);
    else ctx.ellipse(sh.x, sh.y, sh.rx, sh.ry, (sh.rot * Math.PI) / 180, 0, Math.PI * 2);
    if (sh.f) { ctx.fillStyle = col(c, sh.f); ctx.fill(); }
    if (sh.s) { ctx.strokeStyle = col(c, sh.s); ctx.lineWidth = sh.lw; ctx.stroke(); }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function fillRR(ctx, x, y, w, h, r, fillCol, strokeCol, lw) {
  ctx.beginPath(); roundRect(ctx, x, y, w, h, r);
  if (fillCol) { ctx.fillStyle = fillCol; ctx.fill(); }
  if (strokeCol) { ctx.strokeStyle = strokeCol; ctx.lineWidth = lw; ctx.stroke(); }
}

/** The strip tag on canvas, centred on (x, y). Returns its box. o: size, tone (a colour key or series number), plain. */
export function drawTag(ctx, c, text, x, y, o = {}) {
  const size = Math.max(14, o.size ?? 26);
  ctx.save();
  ctx.font = font(c, 800, size);
  const tw = ctx.measureText ? ctx.measureText(String(text)).width : String(text).length * size * 0.56;
  const h = Math.round(size * 1.5), w = Math.round((tw || String(text).length * size * 0.56) + size * 1.1);
  const bx = x - w / 2, by = y - h / 2;
  const crop = isCrop(o.tone);
  const rim = crop ? col(c, cropRim(o.tone)) : o.tone != null ? c[tok(o.tone)] ?? col(c, TAG_RIM) : col(c, TAG_RIM);
  if (!o.plain) fillRR(ctx, bx, by + 3, w, h, h / 2, alpha(col(c, soilLip(SOIL.loam)), 0.45));
  if (o.plain) ctx.globalAlpha *= 0.88;
  fillRR(ctx, bx, by, w, h, h / 2, col(c, crop && !o.plain ? cropTint(o.tone) : TAG_BG), o.plain ? null : rim, crop ? 3 : 2.5);
  ctx.globalAlpha = 1;
  ctx.fillStyle = col(c, TAG_INK); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x, y + 1);
  ctx.restore();
  return { x: bx, y: by, w, h };
}

function ridgeCanvas(ctx, s, y) {
  const x0 = s.x + 12, x1 = s.x + s.w - 12, step = 22;
  ctx.beginPath();
  for (let x = x0; x < x1 - 4; x += step) { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + step / 2 - 2, y - 5, Math.min(x1, x + step - 4), y); }
}

/** The canvas twin of farmSvg. c: the scene's resolved colours. Returns each strip's rect in stage px. */
export function drawFarm(ctx, c, spec, o = {}) {
  const x = o.x ?? 0, y = o.y ?? 0, pad = Math.max(6, spec.gap / 2 + 4), PL = placeOf(spec, o), size = PL.size;
  ctx.save();
  ctx.translate(x, y);
  if (spec.border) fillRR(ctx, -pad, -pad, spec.w + 2 * pad, spec.h + 2 * pad + 4, 12 + pad / 2, col(c, BUND), col(c, BUND_RIM), 2);
  for (const s of spec.strips) {
    const soil = SOIL[s.soil] ?? SOIL.loam, lit = isLit(o.lit, s.i), g = clamp01(pick(o.grow, s.i, 1));
    const A = areaOf(s, PL), { rowsY, plants, idle } = plantsOf(A, g);
    ctx.save();
    if (o.dim && o.dim(s.i)) ctx.globalAlpha *= 0.3;
    fillRR(ctx, s.x, s.y + 4, s.w, s.h, 9, col(c, soilLip(soil)));
    fillRR(ctx, s.x, s.y, s.w, s.h, 9, col(c, soil), lit ? c.accent : col(c, soilRim(soil)), lit ? 4.5 : 2);
    fillRR(ctx, s.x + 8, s.y + 3, Math.max(0, s.w - 16), 3, 1.5, alpha(col(c, soilLit(soil)), 0.7));
    for (const by of rowsY) {
      if (idle) {
        ctx.lineCap = 'round';
        ridgeCanvas(ctx, A, by); ctx.strokeStyle = col(c, soilRim(soil)); ctx.lineWidth = 3.2; ctx.stroke();
        ridgeCanvas(ctx, A, by - 3); ctx.strokeStyle = alpha(col(c, soilLit(soil)), 0.8); ctx.lineWidth = 2; ctx.stroke();
      } else fillRR(ctx, A.x + 7, by - 2, A.w - 14, 4, 2, col(c, soilFurrow(soil)));
    }
    if (!idle) {
      const shapes = SHAPES[s.crop];
      for (const p of plants) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.sx, p.sy);
        for (const sh of shapes) if (!sh.ear || p.ear > 0) shapeCanvas(ctx, c, sh, p.ear);
        ctx.restore();
      }
    }
    if (s.label && o.tags !== false) { const [lx, ly] = labelPos(s, spec, PL, s.label); drawTag(ctx, c, s.label, lx, ly, { size: size * 0.8, plain: true }); }
    if (s.tag && o.tags !== false) { const [tx, ty] = tagPos(s, spec, PL, s.tag); drawTag(ctx, c, s.tag, tx, ty, { size, tone: stripTone(s) }); }
    ctx.restore();
  }
  ctx.restore();
  return spec.strips.map((s) => ({ i: s.i, x: s.x + x, y: s.y + y, w: s.w, h: s.h }));
}

/** The canvas twin of wellSvg. */
export function drawWell(ctx, c, o = {}) {
  const q = wellParts(o), soil = SOIL[o.soil ?? 'loam'];
  ctx.save();
  fillRR(ctx, q.cut.x, q.cut.y + 4, q.cut.w, q.cut.h, 10, col(c, soilLip(soil)));
  fillRR(ctx, q.cut.x, q.cut.y, q.cut.w, q.cut.h, 10, col(c, soil), col(c, soilRim(soil)), 2);
  ctx.strokeStyle = col(c, soilFurrow(soil)); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (let k = 1; k <= 3; k++) {
    const yy = q.cut.y + (q.cut.h * k) / 4, xa = q.cut.x + 8, xb = q.cut.x + q.cut.w - 8, xm = q.x;
    ctx.beginPath(); ctx.moveTo(xa, yy); ctx.quadraticCurveTo(q.x - q.w * 0.4, yy - 5, xm, yy); ctx.quadraticCurveTo(2 * xm - (q.x - q.w * 0.4), yy + 5, xb, yy); ctx.stroke();
  }
  fillRR(ctx, q.shaft.x, q.shaft.y, q.shaft.w, q.shaft.h, 4, col(c, HOLE));
  if (q.wh > 0.5) {
    fillRR(ctx, q.shaft.x, q.wy, q.shaft.w, q.wh, 4, col(c, WATER));
    ctx.save(); ctx.setLineDash?.([9, 7]); ctx.strokeStyle = col(c, WATER_LINE); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(q.cut.x + 6, q.wy); ctx.lineTo(q.cut.x + q.cut.w - 6, q.wy); ctx.stroke(); ctx.restore();
  }
  const hd = q.head, ry = q.w * 0.13;
  fillRR(ctx, hd.x, hd.y + 4, hd.w, hd.h, 6, col(c, STONE_RIM));
  fillRR(ctx, hd.x, hd.y, hd.w, hd.h, 6, col(c, STONE), col(c, STONE_RIM), 2);
  ctx.strokeStyle = col(c, STONE_RIM); ctx.lineWidth = 1.6; ctx.beginPath();
  ctx.moveTo(hd.x + 4, hd.y + hd.h * 0.55); ctx.lineTo(hd.x + hd.w - 4, hd.y + hd.h * 0.55);
  ctx.moveTo(q.x - hd.w * 0.18, hd.y + 2); ctx.lineTo(q.x - hd.w * 0.18, hd.y + hd.h * 0.55);
  ctx.moveTo(q.x + hd.w * 0.22, hd.y + hd.h * 0.55); ctx.lineTo(q.x + hd.w * 0.22, hd.y + hd.h - 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(q.x, hd.y, hd.w / 2, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = col(c, STONE); ctx.fill(); ctx.strokeStyle = col(c, STONE_RIM); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(q.x, hd.y + 1, hd.w * 0.36, ry * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = col(c, HOLE); ctx.fill();
  ctx.restore();
  return { x: q.cut.x, y: q.head.y - ry, w: q.cut.w, h: q.cut.h + q.head.h + ry, waterY: q.wy };
}
