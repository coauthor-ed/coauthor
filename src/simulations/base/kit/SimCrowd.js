/** SimCrowd.js
 * SimCrowd - people as dots. One dot = one person (or k people): a population that moves, sorts, splits
 * and fills. Pure layouts (a position per person id, stage px) + one painter that flies every dot to its
 * spot on the live layer (SimFlySvg springs, staggered) + the marks a crowd needs (labels with counts,
 * brackets, rules, an axis, a legend). Generic: epidemiology, statistics, probability, data. Works in an
 * SvgScene and in any withClock(DomSimulation). Original code.
 *
 * PERSON  { id, ill, exposed, group?, tone?, lit?, dim?, ghost?, mark? }   (id: string or number, unique)
 * DOT GRAMMAR (default; dotLook o overrides it)
 *   colour   ill = --sim-annot (the signature colour), well = --sim-label-muted; tone: n -> --sim-series-n
 *            (or a token name: 'good', 'label') overrides it for non-epidemiology uses.
 *   fill     exposed (or exposed missing) = FILLED disc; exposed === false = HOLLOW ring, same colour, same
 *            outer size, ring >= 2.6 design px (o.filled(p) overrides what is filled).
 *   lit      a little larger (x1.16); dim: opacity 0.22, thinner rim; ghost: dashed grey outline, not filled
 *            (not yet known, missing); mark: 'ring' (ink ring round it), 'tick' / 'cross' (good / bad glyph
 *            over it).
 *   Colour, fill, opacity and rim changes animate (CSS, 0.45 s); reduced motion and skip() jump.
 *
 * LAYOUTS (pure; same input, same output) -> lay = { kind, r, step, pos: Map(id -> {x, y}), boxOf: Map(id ->
 *   box key), boxes: [{ key, label, letter, index, n, x, y, w, h (the dot block), area: {x, y, w, h} }],
 *   rules: [{ x1, y1, x2, y2 }], axis? }. rect = { x, y, w, h } in stage px. Common o: r (force a radius),
 *   maxR (9), minR (5.5), gap (0.3 of the step), sort (comparator on people), align ('center' | 'top' |
 *   'start' | 'bottom': bottom fills upward from the bottom-left), padTop (room kept for a label in each area).
 *   gridLayout(people, rect, o)        one block; o.cols, o.key ('all'), o.label
 *   scatterLayout(people, rect, o)     a town: seeded, organic, never overlapping; o.seed, o.density (0.72)
 *   groupsLayout(people, rect, o)      side by side (o.dir 'row') or stacked ('col'); o.groups [key | {key,
 *                                      label}], o.groupOf (p => p.group), o.gutter (28); one radius and one
 *                                      column count for all groups, so blocks compare like bars
 *   cellsLayout(people, rect, o)       a rows x cols table: o.table ([2, 2]), o.row (p => exposed ? 0 : 1),
 *                                      o.col (p => ill ? 0 : 1), o.gutter (24), o.names
 *                                      [label per cell]; boxes keyed 'r0c0'.., letter a, b, c, d row-major
 *   stripsLayout(people, rect, o)      horizontal bands: o.bands (count or [labels]), o.band (p => p.group),
 *                                      o.x (p => 0..1: a swarm along the band, e.g. time of event; else
 *                                      a left-aligned block, its length reads like a bar), o.gutter (10)
 *   swarmLayout(people, rect, o)       beeswarm along x: o.value (p => number), o.min, o.max, o.side ('up' |
 *                                      'both'); no overlaps, radius shrinks to fit; lay.axis { x0, x1, y,
 *                                      min, max, toX(v) }
 *   fitDot(n, w, h, o) -> { r, step, cols, rows, w, h, small }   the largest dot for n in a w x h box
 *   perDot(n, w, h, o) -> k            the smallest k (1, 2, 5, 10, 20, 25, 50, ...) so ceil(n / k) dots fit
 *                                      at >= minR: "1 dot = k people"
 * MOTION
 *   crowdLive(live, key, people, lay, o) -> { moving, landed, total, inBox(boxKey) }   call on EVERY
 *       animate() pass the crowd shows (a pass that skips it drops it). Each person flies to lay.pos (springs,
 *       retargetable mid-flight); people not in lay.pos are not drawn. o: from (a layout, a Map, a point, or
 *       p => point: where a dot starts on its FIRST pass only; omit it and dots appear at rest, so a cold
 *       landing on a beat is right), order ('row' | 'group' | 'x' | 'random' | (p, to) => number): who moves
 *       first, spread (s, the whole stagger; default 0.25-0.85 by n), delay (s), preset ('smooth'), arc (px,
 *       8: a slight seeded lift so crossing paths do not merge), labels (true or { place: 'above' | 'below'
 *       | 'left', big, letter, count: 'landed' | 'final', text: box => html }): box labels whose count rises
 *       as the dots land; plus dotLook options. inBox(k) = people landed in box k this pass (a count-up hook).
 *       The picture at rest is a pure function of (lay, people): history never shows.
 *   crowdSvg(people, lay, o) -> svg    the same dots at rest, as markup for paint() (no motion)
 * MARKS
 *   labelsHtml(lay, o) -> html          the labels at rest (for paint()'s over); o as crowdLive's labels
 *   bracketSvg(box, o) -> svg           a bracket under (o.side 'below') or over a block; o.tone 'annot'
 *   rulesSvg(lay) -> svg                the dividers between cells, bands or groups
 *   axisParts(lay, o) -> { svg, over }  a swarm's base line with ticks: o.ticks [v], o.fmt, o.label
 *   legendHtml(o) -> html               one line: o.show ['ill', 'well', 'exposed', 'unexposed'], o.text {..}
 *                                       or o.items [{ label, color, filled, ghost }]
 *   dotLook(p, r, o) -> { r, color, fo, sw, op, dash }   the grammar, for a scene drawing its own dots
 *   countOf(people, pred) -> n
 * CSS: add SIM_CROWD_CSS to the scene's css(). Sizes: a dot >= 7 screen px across at 390 (minR 5.5 design px
 * on a portrait stage of about 348 design px shown at 274-354 px); labels 16 design px and up.
 * Performance: only moving dots write (one transform per frame), the look writes only on change. 600 dots in
 * flight: 60 fps desktop; portrait at 4x CPU throttle about 46 fps median (p95 frame 42 ms).
 */
import { flyTo } from './SimFlySvg.js';
import { reducedMotion } from './SimAnim.js';

const DEF = { maxR: 9, minR: 5.5, gap: 0.3, ring: 2.6 };
const LETTERS = 'abcdefghijklmnop';
const escTxt = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function rng(seed) {
  let a = (seed | 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash01(id) {
  const s = String(id);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}
/** A tone: n -> var(--sim-series-n); 'annot' -> var(--sim-annot); a var(...) passes through. */
export function toneVar(t) {
  if (typeof t === 'number') return `var(--sim-series-${(((Math.round(t) - 1) % 8) + 8) % 8 + 1})`;
  const s = String(t);
  return s.startsWith('var(') ? s : `var(--sim-${s})`;
}

/** The largest dot for n people in a w x h box (see the header). */
export function fitDot(n, w, h, o = {}) {
  const maxR = o.maxR ?? DEF.maxR, minR = o.minR ?? DEF.minR, gf = o.gap ?? DEF.gap;
  n = Math.max(1, Math.round(n));
  let best = 0, bc = 1;
  for (let c = 1; c <= n; c++) {
    const s = Math.min(w / c, h / Math.ceil(n / c));
    if (s > best) { best = s; bc = c; }
  }
  const r = o.r ?? Math.min(maxR, (best * (1 - gf)) / 2);
  const step = (2 * r) / (1 - gf);
  const cols = o.cols ?? (r < maxR - 1e-6 && o.r == null ? bc : colsFor(n, w, h, step));
  const rows = Math.ceil(n / cols);
  return { r, step, cols, rows, w: cols * step, h: rows * step, small: r < minR - 1e-6 };
}
function colsFor(n, w, h, step) {
  const maxC = Math.max(1, Math.floor(w / step + 1e-6));
  let c = Math.min(maxC, Math.max(1, Math.ceil(Math.sqrt((n * w) / Math.max(1, h)))));
  while (c < maxC && Math.ceil(n / c) * step > h + 0.01) c++;
  return Math.max(1, Math.min(c, n));
}

/** "1 dot = k people": the smallest k so ceil(n / k) dots fit at >= minR. */
export function perDot(n, w, h, o = {}) {
  const minR = o.minR ?? DEF.minR;
  for (const k of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]) {
    if (fitDot(Math.ceil(n / k), w, h, o).r >= minR - 1e-6) return k;
  }
  return 10000;
}

function makeLay(kind, r, step) { return { kind, r, step, pos: new Map(), boxOf: new Map(), boxes: [], rules: [] }; }
const inset = (a, top) => ({ x: a.x, y: a.y + top, w: a.w, h: Math.max(1, a.h - top) });
const sorted = (list, o) => (o.sort ? [...list].sort(o.sort) : list);

// Place list as a block of cols in area; write lay.pos / boxOf; return the block bounds.
function placeGrid(list, area, step, cols, align, lay, key) {
  const n = list.length, c = Math.max(1, Math.min(cols, n || 1)), rows = Math.ceil(n / c);
  const bw = c * step, bh = rows * step;
  const left = align === 'start' ? area.x : area.x + (area.w - bw) / 2;
  const top = align === 'center' ? area.y + (area.h - bh) / 2 : align === 'bottom' ? area.y + area.h - bh : area.y;
  list.forEach((p, k) => {
    const cc = k % c, rr = Math.floor(k / c);
    const y = align === 'bottom' ? top + bh - (rr + 0.5) * step : top + (rr + 0.5) * step;
    lay.pos.set(p.id, { x: left + (cc + 0.5) * step, y });
    lay.boxOf.set(p.id, key);
  });
  return { x: left, y: top, w: n ? bw : 0, h: n ? bh : 0 };
}

/** One block in rect (see the header). */
export function gridLayout(people, rect, o = {}) {
  const a = inset(rect, o.padTop ?? 0), f = fitDot(people.length, a.w, a.h, o);
  const lay = makeLay('grid', f.r, f.step), key = o.key ?? 'all';
  const b = placeGrid(sorted(people, o), a, f.step, f.cols, o.align ?? 'center', lay, key);
  lay.boxes.push({ key, label: o.label ?? '', letter: '', index: 0, n: people.length, ...b, area: rect });
  lay.small = f.small;
  return lay;
}

/** A town: seeded, organic, never overlapping (see the header). */
export function scatterLayout(people, rect, o = {}) {
  const n = Math.max(1, people.length), rnd = rng(o.seed ?? 7), maxR = o.maxR ?? DEF.maxR;
  const density = o.density ?? 0.72;
  let s = Math.sqrt((rect.w * rect.h * density) / (0.866 * n)), pts = [], r = 0;
  for (let tries = 0; tries < 40; tries++) {
    r = o.r ?? Math.min(maxR, s * 0.3);
    r = Math.min(r, s * 0.42);
    const gap = Math.max(1.5, r * 0.45), j = Math.max(0, (s - 2 * r - gap) / 2);
    pts = [];
    const rowH = s * 0.866;
    for (let y = rect.y + r + j, row = 0; y <= rect.y + rect.h - r - j + 0.01; y += rowH, row++) {
      for (let x = rect.x + r + j + (row % 2 ? s / 2 : 0); x <= rect.x + rect.w - r - j + 0.01; x += s) {
        pts.push({ x: x + (rnd() * 2 - 1) * j, y: y + (rnd() * 2 - 1) * j });
      }
    }
    if (pts.length >= n) break;
    s *= 0.95;
  }
  for (let i = pts.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [pts[i], pts[k]] = [pts[k], pts[i]]; }
  const lay = makeLay('scatter', r, 2 * r);
  const key = o.key ?? 'all';
  sorted(people, o).forEach((p, i) => { if (pts[i]) { lay.pos.set(p.id, pts[i]); lay.boxOf.set(p.id, key); } });
  lay.boxes.push({ key, label: o.label ?? '', letter: '', index: 0, n: people.length, ...rect, area: rect });
  return lay;
}

// Several areas, one radius and one column count (the biggest group's), each a block.
function multiGrid(kind, people, areas, keyOfP, o, align) {
  const lists = areas.map(() => []);
  const idx = new Map(areas.map((a, i) => [a.key, i]));
  for (const p of sorted(people, o)) { const i = idx.get(keyOfP(p)); if (i != null) lists[i].push(p); }
  const pad = o.padTop ?? 0;
  let r = Infinity;
  areas.forEach((a, i) => { const ai = inset(a.area, pad); r = Math.min(r, fitDot(lists[i].length || 1, ai.w, ai.h, o).r); });
  if (o.r != null) r = o.r;
  const step = (2 * r) / (1 - (o.gap ?? DEF.gap));
  let cols = Infinity, maxN = 0, big = 0;
  areas.forEach((a, i) => { if (lists[i].length > maxN) { maxN = lists[i].length; big = i; } cols = Math.min(cols, Math.max(1, Math.floor(a.area.w / step + 1e-6))); });
  if (o.cols) cols = o.cols;
  else if (o.sameCols !== false && maxN) { const ab = inset(areas[big].area, pad); cols = Math.min(cols, colsFor(maxN, ab.w, ab.h, step)); }
  const lay = makeLay(kind, r, step);
  areas.forEach((a, i) => {
    const b = placeGrid(lists[i], inset(a.area, pad), step, cols, align, lay, a.key);
    lay.boxes.push({ key: a.key, label: a.label ?? '', letter: a.letter ?? '', index: i, n: lists[i].length, ...b, area: a.area });
  });
  lay.small = r < (o.minR ?? DEF.minR) - 1e-6;
  return lay;
}

/** Groups side by side or stacked (see the header). */
export function groupsLayout(people, rect, o = {}) {
  const groupOf = o.groupOf ?? ((p) => p.group);
  let gs = o.groups;
  if (!gs) { gs = []; for (const p of people) { const k = groupOf(p); if (!gs.includes(k)) gs.push(k); } }
  gs = gs.map((g) => (g && typeof g === 'object' ? g : { key: g, label: String(g) }));
  const m = gs.length, gut = o.gutter ?? 28, col = o.dir === 'col';
  const each = ((col ? rect.h : rect.w) - gut * (m - 1)) / m;
  const areas = gs.map((g, i) => ({
    key: g.key, label: g.label,
    area: col ? { x: rect.x, y: rect.y + i * (each + gut), w: rect.w, h: each } : { x: rect.x + i * (each + gut), y: rect.y, w: each, h: rect.h },
  }));
  const lay = multiGrid('groups', people, areas, groupOf, o, o.align ?? 'center');
  for (let i = 1; i < m; i++) {
    const a = areas[i].area;
    lay.rules.push(col ? { x1: rect.x, y1: a.y - gut / 2, x2: rect.x + rect.w, y2: a.y - gut / 2 } : { x1: a.x - gut / 2, y1: rect.y, x2: a.x - gut / 2, y2: rect.y + rect.h });
  }
  return lay;
}

/** A rows x cols table of cells (see the header). */
export function cellsLayout(people, rect, o = {}) {
  const [R, C] = o.table ?? [2, 2], gut = o.gutter ?? 24;
  const rowOf = o.row ?? ((p) => (p.exposed ? 0 : 1)), colOf = o.col ?? ((p) => (p.ill ? 0 : 1));
  const cw = (rect.w - gut * (C - 1)) / C, ch = (rect.h - gut * (R - 1)) / R, areas = [];
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    const k = i * C + j;
    areas.push({ key: `r${i}c${j}`, letter: LETTERS[k] ?? '', label: o.names?.[k] ?? '', area: { x: rect.x + j * (cw + gut), y: rect.y + i * (ch + gut), w: cw, h: ch } });
  }
  const lay = multiGrid('cells', people, areas, (p) => `r${rowOf(p)}c${colOf(p)}`, o, o.align ?? 'center');
  for (let j = 1; j < C; j++) { const x = rect.x + j * (cw + gut) - gut / 2; lay.rules.push({ x1: x, y1: rect.y, x2: x, y2: rect.y + rect.h }); }
  for (let i = 1; i < R; i++) { const y = rect.y + i * (ch + gut) - gut / 2; lay.rules.push({ x1: rect.x, y1: y, x2: rect.x + rect.w, y2: y }); }
  return lay;
}

// Beeswarm: items [{ p, x }] sorted by x; y from a base line, no overlaps. Returns the worst offset.
function swarmPlace(items, area, r, gap, side, lay, key) {
  const d = 2 * r + gap, d2 = d * d, placed = [], inc = d * 0.3;
  const base = side === 'up' ? area.y + area.h - r : area.y + area.h / 2;
  let worst = 0;
  for (const it of items) {
    const x = Math.min(area.x + area.w - r, Math.max(area.x + r, it.x));
    let y = base;
    for (let k = 0; k < 400; k++) {
      const off = side === 'up' ? k * inc : Math.ceil(k / 2) * inc * (k % 2 ? -1 : 1);
      y = base - off;
      let hit = false;
      for (let q = placed.length - 1; q >= 0; q--) {
        const o = placed[q];
        if (x - o.x >= d) break;
        if ((x - o.x) ** 2 + (y - o.y) ** 2 < d2) { hit = true; break; }
      }
      if (!hit) { worst = Math.max(worst, Math.abs(off)); break; }
    }
    placed.push({ x, y });
    lay.pos.set(it.p.id, { x, y });
    lay.boxOf.set(it.p.id, key);
  }
  return worst;
}
function swarmFit(list, area, xOf, o, side, lay, key) {
  const items = list.map((p) => ({ p, x: xOf(p) })).sort((a, b) => a.x - b.x);
  let r = o.r ?? o.maxR ?? DEF.maxR;
  for (let t = 0; t < 14; t++) {
    const gap = Math.max(1.5, r * 0.5);
    const tmp = makeLay('tmp', r, 2 * r);
    const worst = swarmPlace(items, area, r, gap, side, tmp, key);
    const fits = side === 'up' ? worst <= area.h - 2 * r + 0.01 : worst <= area.h / 2 - r + 0.01;
    if (fits || o.r != null || t === 13) {
      for (const [id, v] of tmp.pos) { lay.pos.set(id, v); lay.boxOf.set(id, key); }
      return r;
    }
    r *= 0.92;
  }
  return r;
}

/** Beeswarm along x (see the header). */
export function swarmLayout(people, rect, o = {}) {
  const val = o.value ?? ((p) => p.value ?? 0);
  const vs = people.map(val);
  const min = o.min ?? Math.min(...vs), max = o.max ?? Math.max(...vs);
  const toX = (v) => rect.x + ((v - min) / ((max - min) || 1)) * rect.w;
  const lay = makeLay('swarm', 0, 0), key = o.key ?? 'all';
  const r = swarmFit(people, rect, (p) => toX(val(p)), o, o.side ?? 'up', lay, key);
  lay.r = r; lay.step = 2 * r;
  lay.boxes.push({ key, label: o.label ?? '', letter: '', index: 0, n: people.length, ...rect, area: rect });
  lay.axis = { x0: rect.x, x1: rect.x + rect.w, y: rect.y + rect.h + 4, min, max, toX };
  return lay;
}

/** Horizontal bands (see the header). */
export function stripsLayout(people, rect, o = {}) {
  const labels = Array.isArray(o.bands) ? o.bands : null, m = labels ? labels.length : (o.bands ?? 3);
  const bandOf = o.band ?? ((p) => p.group ?? 0), gut = o.gutter ?? 10;
  const bh = (rect.h - gut * (m - 1)) / m;
  const areas = [];
  for (let i = 0; i < m; i++) areas.push({ key: `b${i}`, label: labels?.[i] ?? '', area: { x: rect.x, y: rect.y + i * (bh + gut), w: rect.w, h: bh } });
  let lay;
  if (o.x) {
    lay = makeLay('strips', Infinity, 0);
    const lists = areas.map(() => []);
    for (const p of sorted(people, o)) { const i = bandOf(p); if (lists[i]) lists[i].push(p); }
    // one radius for every band: the smallest any band needs
    let r = o.r ?? Infinity;
    if (o.r == null) areas.forEach((a, i) => { const t = makeLay('tmp', 0, 0); r = Math.min(r, swarmFit(lists[i], a.area, (p) => a.area.x + o.x(p) * a.area.w, o, 'both', t, a.key)); });
    areas.forEach((a, i) => {
      swarmFit(lists[i], a.area, (p) => a.area.x + o.x(p) * a.area.w, { ...o, r }, 'both', lay, a.key);
      lay.boxes.push({ key: a.key, label: a.label, letter: '', index: i, n: lists[i].length, ...a.area, area: a.area });
    });
    lay.r = r; lay.step = 2 * r;
  } else {
    lay = multiGrid('strips', people, areas, (p) => `b${bandOf(p)}`, { ...o, sameCols: false, cols: o.cols ?? Math.max(1, Math.floor(rect.w / ((2 * fitBandR(people, areas, bandOf, o)) / (1 - (o.gap ?? DEF.gap))) + 1e-6)) }, o.align ?? 'start');
  }
  for (let i = 1; i < m; i++) { const y = rect.y + i * (bh + gut) - gut / 2; lay.rules.push({ x1: rect.x, y1: y, x2: rect.x + rect.w, y2: y }); }
  return lay;
}
function fitBandR(people, areas, bandOf, o) {
  if (o.r != null) return o.r;
  const counts = areas.map(() => 0);
  for (const p of people) { const i = bandOf(p); if (i in counts) counts[i]++; }
  return Math.min(...areas.map((a, i) => fitDot(counts[i] || 1, a.area.w, a.area.h, o).r));
}

/** The grammar for one person at radius r (see the header). */
export function dotLook(p, r, o = {}) {
  const ring = Math.max(o.ring ?? DEF.ring, r * 0.3);
  let color = p.tone != null ? toneVar(p.tone) : p.ill ? (o.ill ?? 'var(--sim-annot)') : (o.well ?? 'var(--sim-label-muted)');
  const filled = o.filled ? !!o.filled(p) : p.exposed !== false;
  const rr = r * (p.lit ? 1.16 : 1);
  let sw = Math.min(ring, rr * 0.62), fo = filled ? 1 : 0, op = 1, dash = null;
  if (p.dim) { op = o.dimOpacity ?? 0.22; sw = Math.max(1.2, sw * 0.6); }
  if (p.ghost) {
    color = 'var(--sim-label-muted)'; fo = 0; sw = Math.max(1.6, sw * 0.7);
    const c = 2 * Math.PI * (rr - sw / 2), k = Math.max(4, Math.round(c / (sw * 2.8)));
    dash = `${((c / k) * 0.55).toFixed(2)} ${((c / k) * 0.45).toFixed(2)}`;
  }
  return { r: rr - sw / 2, color, fo, sw, op, dash };
}
export const countOf = (people, pred) => people.reduce((n, p) => n + (pred(p) ? 1 : 0), 0);

function fromOf(from, p) {
  if (!from) return null;
  if (typeof from === 'function') return from(p) ?? null;
  if (from.pos instanceof Map) return from.pos.get(p.id) ?? null;
  if (from instanceof Map) return from.get(p.id) ?? null;
  return Number.isFinite(from.x) ? from : null;
}

const RANKS = new WeakMap();
function ranksFor(lay, people, order) {
  const named = typeof order === 'string';
  if (named) { const c = RANKS.get(lay)?.[order]; if (c && c.size === lay.pos.size) return c; }
  const list = [];
  for (const p of people) { const to = lay.pos.get(p.id); if (to) list.push({ p, to }); }
  const bi = new Map(lay.boxes.map((b) => [b.key, b.index]));
  const keyOf = typeof order === 'function' ? (e) => order(e.p, e.to)
    : order === 'x' ? (e) => e.to.x * 1e4 + e.to.y
      : order === 'random' ? (e) => hash01(e.p.id)
        : order === 'group' ? (e) => (bi.get(lay.boxOf.get(e.p.id)) ?? 0) * 1e8 + Math.round(e.to.y) * 1e4 + e.to.x
          : (e) => Math.round(e.to.y / Math.max(1, lay.step * 0.5)) * 1e5 + e.to.x;
  list.sort((a, b) => keyOf(a) - keyOf(b));
  const m = new Map(), n = list.length;
  list.forEach((e, i) => m.set(e.p.id, n > 1 ? i / (n - 1) : 0));
  if (named) { const all = RANKS.get(lay) ?? {}; all[order] = m; RANKS.set(lay, all); }
  return m;
}

const SIG = new WeakMap(), HASH = new Map();
const hashOf = (id) => { let h = HASH.get(id); if (h == null) { h = hash01(id); if (HASH.size > 20000) HASH.clear(); HASH.set(id, h); } return h; };
const TICK_D = 'M-4 0.5 L-1.2 3.4 L4.5 -3.6', CROSS_D = 'M-3.6 -3.6 L3.6 3.6 M3.6 -3.6 L-3.6 3.6';

/** Fly the crowd to lay on the live layer (see the header). Call on every animate() pass it shows. */
export function crowdLive(live, key, people, lay, o = {}) {
  const jump = !!live.skipping || reducedMotion();
  const g = live.shape(key, 'g', { cls: jump ? 'scw scw--jump' : 'scw' });
  const mg = live.shape(`${key}|marks`, 'g', { cls: 'scw-marks' });
  const n = lay.pos.size;
  const spread = o.spread ?? Math.min(0.85, Math.max(0.25, 0.2 + n * 0.0035));
  const ranks = ranksFor(lay, people, o.order ?? 'row');
  const d0 = o.delay ?? 0, arc = o.arc ?? 8, preset = o.preset ?? 'smooth', scale = o.scale ?? 1;
  const landed = new Map();
  let moving = false, nLanded = 0;
  for (const p of people) {
    const to = lay.pos.get(p.id);
    if (!to) continue;
    const k = `${key}|${p.id}`;
    const f = flyTo(live, k, fromOf(o.from, p), to, { preset, delay: d0 + spread * (ranks.get(p.id) ?? 0), arc: arc * (hashOf(p.id) * 2 - 1) });
    if (f.moving) moving = true;
    // Landed = within a pixel of its spot (a spring's last sub-pixel creep does not hold the count back).
    if (!f.moving || (Math.abs(f.x - to.x) < 1 && Math.abs(f.y - to.y) < 1)) { nLanded++; const b = lay.boxOf.get(p.id); landed.set(b, (landed.get(b) ?? 0) + 1); }
    const filled = o.filled ? !!o.filled(p) : p.exposed !== false;
    const sig = `${p.tone ?? ''}|${p.ill ? 1 : 0}${filled ? 1 : 0}${p.lit ? 1 : 0}${p.dim ? 1 : 0}${p.ghost ? 1 : 0}|${lay.r * scale}`;
    const c = live.shape(k, 'circle', { parent: g, cls: 'scw-dot' });
    let s = SIG.get(c);
    if (!s || s.sig !== sig) {
      // The look changes rarely: write r and the style only then (fill, ring, opacity animate in CSS).
      s = dotLook(p, lay.r * scale, o);
      s.sig = sig;
      SIG.set(c, s);
      live.attrs(c, { cx: 0, cy: 0, r: s.r.toFixed(2) });
      live.css(c, { fill: s.color, stroke: s.color, 'fill-opacity': s.fo, 'stroke-width': s.sw.toFixed(2), opacity: s.op, 'stroke-dasharray': s.dash });
    }
    // One transform write per moving dot per frame (memo skips a dot at rest).
    const tx = f.x.toFixed(1), ty = f.y.toFixed(1);
    live.attrs(c, { transform: `translate(${tx} ${ty})` });
    if (p.mark) {
      const m = live.shape(`${k}|m`, p.mark === 'ring' ? 'circle' : 'path', { parent: mg, cls: `scw-mark scw-mark--${p.mark}` });
      if (p.mark === 'ring') live.attrs(m, { cx: tx, cy: ty, r: (s.r + s.sw / 2 + 3.2).toFixed(2) });
      else live.attrs(m, { d: p.mark === 'cross' ? CROSS_D : TICK_D, transform: `translate(${tx} ${(f.y - s.r - s.sw / 2 - 7).toFixed(1)})` });
    }
  }
  const inBox = (b) => landed.get(b) ?? 0;
  if (o.labels) {
    const lo = o.labels === true ? {} : o.labels;
    for (const b of lay.boxes) {
      const cnt = lo.count === 'final' ? b.n : inBox(b.key);
      const pl = labelPlace(b, lo);
      const e = live.el(`${key}|lab|${b.key}`, { cls: `scw-lab scw-lab--${lo.place ?? 'above'}`, html: labelInner(b, cnt, lo) });
      live.css(e, { left: `${pl.x.toFixed(1)}px`, top: `${pl.y.toFixed(1)}px` });
    }
  }
  return { moving, landed: nLanded, total: n, inBox };
}

function labelPlace(b, lo) {
  const place = lo.place ?? 'above', gap = lo.gap ?? 6;
  if (place === 'below') return { x: b.x + b.w / 2, y: b.y + b.h + gap };
  if (place === 'left') return { x: b.x - (lo.gap ?? 12), y: b.y + b.h / 2 };
  return { x: b.x + b.w / 2, y: b.y - gap };
}
function labelInner(b, cnt, lo) {
  if (lo.text) return lo.text(b, cnt);
  const let_ = lo.letter && b.letter ? `<i class="scw-letter">${escTxt(b.letter)}</i>` : '';
  const lab = b.label ? `<b>${escTxt(b.label)}</b>` : '';
  const num = lo.big ? `<span class="sim-numeral scw-n scw-n--big">${cnt}</span>` : `<span class="scw-n">${cnt}</span>`;
  return let_ + lab + (lo.count === 'none' ? '' : num);
}

/** The labels at rest, for paint()'s over (see the header). */
export function labelsHtml(lay, o = {}) {
  return lay.boxes.map((b) => {
    const pl = labelPlace(b, o);
    return `<span class="scw-lab scw-lab--${o.place ?? 'above'}" style="left:${pl.x.toFixed(1)}px;top:${pl.y.toFixed(1)}px">${labelInner(b, b.n, o)}</span>`;
  }).join('');
}

/** The crowd at rest as markup (see the header). */
export function crowdSvg(people, lay, o = {}) {
  let out = '<g class="scw">', marks = '';
  for (const p of people) {
    const to = lay.pos.get(p.id);
    if (!to) continue;
    const s = dotLook(p, lay.r * (o.scale ?? 1), o);
    out += `<circle class="scw-dot" cx="${to.x.toFixed(1)}" cy="${to.y.toFixed(1)}" r="${s.r.toFixed(2)}" style="fill:${s.color};stroke:${s.color};fill-opacity:${s.fo};stroke-width:${s.sw.toFixed(2)};opacity:${s.op}${s.dash ? `;stroke-dasharray:${s.dash}` : ''}"/>`;
    if (p.mark === 'ring') marks += `<circle class="scw-mark scw-mark--ring" cx="${to.x.toFixed(1)}" cy="${to.y.toFixed(1)}" r="${(s.r + s.sw / 2 + 3.2).toFixed(2)}"/>`;
    else if (p.mark) marks += `<path class="scw-mark scw-mark--${p.mark}" d="${p.mark === 'cross' ? CROSS_D : TICK_D}" transform="translate(${to.x.toFixed(1)} ${(to.y - s.r - s.sw / 2 - 7).toFixed(1)})"/>`;
  }
  return `${out}</g><g class="scw-marks">${marks}</g>`;
}

/** A bracket under (or over) a block (see the header). */
export function bracketSvg(box, o = {}) {
  const side = o.side ?? 'below', gap = o.gap ?? 8, tick = o.tick ?? 7;
  const x0 = box.x, x1 = box.x + box.w;
  const y = side === 'below' ? box.y + box.h + gap : box.y - gap, t = side === 'below' ? -tick : tick;
  return `<path class="scw-bracket${o.tone === 'annot' ? ' scw-bracket--annot' : ''}" d="M${x0.toFixed(1)} ${(y + t).toFixed(1)} V${y.toFixed(1)} H${x1.toFixed(1)} V${(y + t).toFixed(1)}"/>`;
}

/** The dividers between cells, bands or groups. */
export function rulesSvg(lay) {
  return lay.rules.map((l) => `<line class="scw-rule" x1="${l.x1.toFixed(1)}" y1="${l.y1.toFixed(1)}" x2="${l.x2.toFixed(1)}" y2="${l.y2.toFixed(1)}"/>`).join('');
}

/** A swarm's base line with ticks (see the header). */
export function axisParts(lay, o = {}) {
  const a = lay.axis;
  if (!a) return { svg: '', over: '' };
  const fmt = o.fmt ?? ((v) => String(v));
  let svg = `<line class="scw-axis" x1="${a.x0}" y1="${a.y}" x2="${a.x1}" y2="${a.y}"/>`, over = '';
  for (const v of o.ticks ?? [a.min, a.max]) {
    const x = a.toX(v).toFixed(1);
    svg += `<line class="scw-axis" x1="${x}" y1="${a.y}" x2="${x}" y2="${a.y + 6}"/>`;
    over += `<span class="scw-tk" style="left:${x}px;top:${a.y + 9}px">${escTxt(fmt(v))}</span>`;
  }
  if (o.label) over += `<span class="scw-tk scw-tk--label" style="left:${a.x1}px;top:${a.y + 9}px">${escTxt(o.label)}</span>`;
  return { svg, over };
}

function swatch(color, filled, ghost) {
  const s = dotLook({ ill: false, exposed: filled, ghost }, 6, { well: color });
  return `<svg viewBox="-7 -7 14 14" aria-hidden="true"><circle r="${s.r.toFixed(2)}" style="fill:${s.color};stroke:${s.color};fill-opacity:${s.fo};stroke-width:${s.sw.toFixed(2)}${s.dash ? `;stroke-dasharray:${s.dash}` : ''}"/></svg>`;
}

/** One legend line for the dot grammar (see the header). */
export function legendHtml(o = {}) {
  const T = { ill: 'ill', well: 'well', exposed: 'exposed', unexposed: 'not exposed', ghost: 'not known', ...(o.text ?? {}) };
  const ill = o.ill ?? 'var(--sim-annot)', well = o.well ?? 'var(--sim-label-muted)';
  const items = o.items ?? (o.show ?? ['ill', 'well', 'exposed', 'unexposed']).map((k) => ({
    label: T[k], color: k === 'ill' ? ill : well, filled: k !== 'unexposed' && k !== 'ghost', ghost: k === 'ghost',
  }));
  // A thin rule between the colour pair and the fill pair, so "well" and "exposed" do not read as one thing.
  return `<span class="scw-legend">${items.map((it, i) => {
    const sep = !o.items && i > 0 && ['exposed', 'unexposed', 'ghost'].includes((o.show ?? ['ill', 'well', 'exposed', 'unexposed'])[i])
      && ['ill', 'well'].includes((o.show ?? ['ill', 'well', 'exposed', 'unexposed'])[i - 1]) ? '<i class="scw-sep" aria-hidden="true"></i>' : '';
    return `${sep}<span>${swatch(it.color ?? well, it.filled !== false, !!it.ghost)}${escTxt(it.label)}</span>`;
  }).join('')}</span>`;
}

export const SIM_CROWD_CSS = `
.scw-dot { transition: fill 0.45s ease, stroke 0.45s ease, fill-opacity 0.45s ease, opacity 0.4s ease, stroke-width 0.3s ease; }
.scw--jump .scw-dot { transition: none; }
.scw-mark { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.scw-mark--ring { stroke: var(--sim-label); stroke-width: 2; }
.scw-mark--tick { stroke: var(--sim-good); stroke-width: 2.4; }
.scw-mark--cross { stroke: var(--sim-bad); stroke-width: 2.4; }
.scw-rule { stroke: var(--sim-label-muted); stroke-width: 1.5; opacity: 0.45; }
.scw-axis { stroke: var(--sim-label-muted); stroke-width: 1.5; }
.scw-bracket { fill: none; stroke: var(--sim-label-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.scw-bracket--annot { stroke: var(--sim-annot); }
.scw-lab { position: absolute; transform: translate(-50%, -100%); display: flex; align-items: baseline; gap: 8px; white-space: nowrap;
  font: 600 var(--sim-text-md)/1.15 var(--sim-font); color: var(--sim-label); pointer-events: none; }
.scw-lab--below { transform: translate(-50%, 0); }
.scw-lab--left { transform: translate(-100%, -50%); flex-direction: column; align-items: flex-end; gap: 0; }
.scw-lab b { font-weight: 700; }
.scw-n { font-weight: 600; color: var(--sim-label-muted); font-variant-numeric: tabular-nums; }
.scw-n--big { font-size: calc(var(--sim-text-xl) * 1.5); line-height: 1; color: var(--sim-label); }
.scw-letter { font: italic 700 var(--sim-text-xl)/1 var(--sim-font-numeral, var(--sim-font)); color: var(--sim-annot); }
.scw-tk { position: absolute; transform: translate(-50%, 0); white-space: nowrap; font: 500 var(--sim-text-sm)/1.1 var(--sim-font); color: var(--sim-label-muted); font-variant-numeric: tabular-nums; }
.scw-tk--label { transform: translate(-100%, 18px); font-weight: 600; }
.scw-legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; font: 500 var(--sim-text-md)/1.2 var(--sim-font); color: var(--sim-label-muted); }
.scw-legend > span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.scw-legend .scw-sep { width: 1.5px; height: 16px; background: var(--sim-label-muted); opacity: 0.5; }
.scw-legend svg { width: 14px; height: 14px; flex: none; overflow: visible; }
@media (prefers-reduced-motion: reduce) { .scw-dot { transition: none; } }
`;
