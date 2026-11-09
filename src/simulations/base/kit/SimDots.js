/**
 * SimDots - dot and tile patterns on graph paper, as SVG markup for an SvgScene (subject-free).
 * A pattern is a list of cells { c, r, part, tone }: column c and row r in cell units (row 0 on top),
 * an optional part name the scene lights or dims, an optional tone. Shape helpers build cell lists;
 * patternSvg draws one. The scene decides tones and what is lit, dimmed or ghosted. Maths look: flat
 * fill and a darker rim, no gloss, no glow; dim is opacity plus a thinner rim.
 *
 * Cell lists (pure, no DOM):
 *   triangleRows(n, { align, part })  row r has r + 1 cells (r = 0..n-1); align 'left' (a staircase, default) | 'center'
 *   rect(w, h, { part })              a w x h grid
 *   lLayer(n, { part })               the L-shaped layer that grows an (n-1) square into an n square: 2n - 1 cells
 *   bar(n, { dir, part })             n cells in a row (dir 'row', default) or a column ('col', top down)
 *   stack(n, { height, part })        n cells stacked from the bottom of a column `height` high (default n)
 *   mirror(cells, how)                'v' upside down, 'h' left-right, 'rot' half turn (the second copy of a staircase)
 *   shift(cells, dc, dr)              move a list; also: retag(cells, part) and join(...lists) (plain concat)
 *   zigzagSplit(n)                    (n + 1) wide x n high: part 'top' (above the zigzag, n(n+1)/2 cells) and part
 *                                     'bottom' (the staircase triangleRows(n) below it); the same count each side
 *   sierpinski(stage, { holes })      stage 0..4 as up-triangle tiles (shape 'tri'), part 'kept' (3^stage tiles); holes:
 *                                     also the cut-out tiles, part 'hole' (ghost them)
 *   gridSize(cells) -> { cols, rows } count(cells, part?) -> number
 *
 * Drawing:
 *   patternSvg(cells, o) -> { svg, over, box: { x, y, w, h }, at(c, r) -> { x, y } }
 *     o.x, o.y        top-left of the pattern (design px);  o.cell  cell size, at least 14 (default 24, the graph-paper square)
 *     o.shape         'dot' (default) | 'tile' | 'tri' (sierpinski cells)
 *     o.tone          series number or token name ('accent', 'good', ...), default 1; o.tones { part: tone } per part;
 *                     a cell's own tone wins
 *     o.lit           parts, 'c,r' keys or cell indices (array or Set), or fn(cell, i) -> bool. When anything is lit,
 *                     the rest draws dim (o.dim: opacity, default 0.25); lit cells get a heavier rim
 *     o.dimTone       tone for the dimmed cells instead of their own (e.g. 'muted')
 *     o.ghost         true, parts, keys or fn: draw those cells as dashed outlines (missing, still to come, cut out)
 *     o.label         text under the pattern (a chip, tone o.labelTone ?? o.tone); o.labelAbove puts it on top
 *     o.arrive        true: cells pop in staggered o.lag s apart (default 0.04) in list order; o.arriveFrom k pops only
 *                     cells k.. (earlier cells rest). Repaints replay CSS animations, so pass arrive only on the paint
 *                     that brings them; arriveSeconds(n, lag) is how long it takes (for this.after / busy). Static
 *                     under prefers-reduced-motion (the SvgScene stage turns animations off).
 *     o.outline       shape 'tri': draw the stage-0 triangle's rim behind (the holes then read as cut out)
 *     o.part          a data-part attribute per cell is always written; o.cls adds a class to every cell
 *   zigzagSvg(n, o) -> { svg }        the staircase line between zigzagSplit(n)'s halves; same o.x, o.y, o.cell; o.tone
 *                                     (default 'label'); o.draw: draws itself on (sv-draw), o.drawSeconds (default 0.8)
 *   patternBox(cells, o) -> { w, h, dx, dy }  size before drawing (dx, dy: the first cell's offset from o.x, o.y);  fitCell(cells, w, h, { min, max }) -> cell size that fits
 *   arriveSeconds(n, lag) -> seconds
 *
 *   const T = triangleRows(6);
 *   const p = patternSvg(T, { x: 40, y: 40, cell: 26, tone: 1, label: 'stage 6: 21 dots', arrive: this.first });
 *   const Z = zigzagSplit(6);
 *   patternSvg(Z, { x, y, tones: { top: 3, bottom: 4 }, lit: ['top'] }); zigzagSvg(6, { x, y, draw: true });
 * Colours are tokens only. ASCII only.
 */
import { chip, tone as T, fill, shade } from './SimSvg.js';

const MIN_CELL = 14;
const TRI_H = Math.sqrt(3) / 2;
const col = (t) => (typeof t === 'number' ? T(t) : `var(--sim-${t})`);

// ---- cell lists ------------------------------------------------------------------------------

export function triangleRows(n, o = {}) {
  const out = [], center = o.align === 'center';
  for (let r = 0; r < n; r++) for (let i = 0; i <= r; i++) out.push({ c: center ? (n - 1 - r) / 2 + i : i, r, part: o.part ?? `row${r + 1}` });
  return out;
}

export function rect(w, h, o = {}) {
  const out = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push({ c, r, part: o.part ?? 'rect' });
  return out;
}

export function lLayer(n, o = {}) {
  const out = [];
  for (let r = 0; r < n; r++) out.push({ c: n - 1, r, part: o.part ?? 'layer' });
  for (let c = n - 2; c >= 0; c--) out.push({ c, r: n - 1, part: o.part ?? 'layer' });
  return out;
}

export function bar(n, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(o.dir === 'col' ? { c: 0, r: i, part: o.part ?? 'bar' } : { c: i, r: 0, part: o.part ?? 'bar' });
  return out;
}

export function stack(n, o = {}) {
  const h = Math.max(n, o.height ?? n), out = [];
  for (let i = 0; i < n; i++) out.push({ c: 0, r: h - 1 - i, part: o.part ?? 'stack' });
  return out;
}

export function gridSize(cells) {
  let cols = 0, rows = 0;
  for (const k of cells) { cols = Math.max(cols, k.c + 1); rows = Math.max(rows, k.r + 1); }
  return { cols, rows };
}

export function mirror(cells, how = 'v') {
  const { cols, rows } = gridSize(cells);
  return cells.map((k) => ({ ...k, c: how === 'h' || how === 'rot' ? cols - 1 - k.c : k.c, r: how === 'v' || how === 'rot' ? rows - 1 - k.r : k.r }));
}

export const shift = (cells, dc = 0, dr = 0) => cells.map((k) => ({ ...k, c: k.c + dc, r: k.r + dr }));
export const retag = (cells, part) => cells.map((k) => ({ ...k, part }));
export const join = (...lists) => [].concat(...lists);
export const count = (cells, part) => (part == null ? cells.length : cells.filter((k) => k.part === part).length);

export function zigzagSplit(n) {
  const bottom = retag(triangleRows(n), 'bottom');
  const top = retag(shift(mirror(triangleRows(n), 'rot'), 1, 0), 'top');
  return [...top, ...bottom].sort((a, b) => a.r - b.r || a.c - b.c);
}

export function sierpinski(stage, o = {}) {
  const k = Math.max(0, Math.min(4, stage | 0)), N = 2 ** k, out = [];
  for (let r = 0; r < N; r++) for (let i = 0; i <= r; i++) {
    const kept = (i & r) === i;      // Pascal's triangle mod 2
    if (kept || o.holes) out.push({ c: i, r, tri: N, part: kept ? 'kept' : 'hole' });
  }
  return out;
}

// ---- drawing ---------------------------------------------------------------------------------

const keyOf = (k) => `${k.c},${k.r}`;

function matcher(sel) {
  if (sel == null || sel === false) return () => false;
  if (sel === true) return () => true;
  if (typeof sel === 'function') return sel;
  const s = sel instanceof Set ? sel : new Set(Array.isArray(sel) ? sel : [sel]);
  return (k, i) => s.has(k.part) || s.has(keyOf(k)) || s.has(i);
}

const triN = (cells) => cells.reduce((m, k) => Math.max(m, k.tri ?? k.r + 1), 1);

export function patternBox(cells, o = {}) {
  const cell = Math.max(MIN_CELL, o.cell ?? 24);
  if (o.shape === 'tri') { const N = triN(cells); return { w: N * cell, h: N * cell * TRI_H }; }
  const b = bounds(cells);
  return { w: (b.c1 - b.c0 + 1) * cell, h: (b.r1 - b.r0 + 1) * cell, dx: b.c0 * cell, dy: b.r0 * cell };
}

function bounds(cells) {
  const b = { c0: Infinity, r0: Infinity, c1: 0, r1: 0 };
  for (const k of cells) { b.c0 = Math.min(b.c0, k.c); b.r0 = Math.min(b.r0, k.r); b.c1 = Math.max(b.c1, k.c); b.r1 = Math.max(b.r1, k.r); }
  if (!cells.length) { b.c0 = 0; b.r0 = 0; }
  return b;
}

export function fitCell(cells, w, h, o = {}) {
  const one = patternBox(cells, { ...o, cell: 100 });
  const c = Math.floor(Math.min(w / (one.w / 100), h / (one.h / 100)));
  return Math.max(o.min ?? MIN_CELL, Math.min(o.max ?? 48, c));
}

export const arriveSeconds = (n, lag = 0.04) => (n > 0 ? 0.42 + (n - 1) * lag : 0);

export function patternSvg(cells, o = {}) {
  const cell = Math.max(MIN_CELL, o.cell ?? 24), x0 = o.x ?? 0, y0 = o.y ?? 0, shape = o.shape ?? 'dot';
  const isLit = matcher(o.lit), isGhost = matcher(o.ghost);
  const anyLit = cells.some((k, i) => isLit(k, i));
  const pb = patternBox(cells, { ...o, cell });
  const box = { x: x0 + (pb.dx ?? 0), y: y0 + (pb.dy ?? 0), w: pb.w, h: pb.h };
  const N = shape === 'tri' ? triN(cells) : 0, th = cell * TRI_H;
  const at = (c, r) => (shape === 'tri'
    ? { x: x0 + (N * cell) / 2 + (c - r / 2) * cell, y: y0 + r * th + th * 0.62 }
    : { x: x0 + (c + 0.5) * cell, y: y0 + (r + 0.5) * cell });
  const rim = Math.min(3, Math.max(1.5, cell * 0.08)), lag = o.lag ?? 0.04, from = o.arriveFrom ?? 0;
  let svg = '';
  if (shape === 'tri' && o.outline) {
    svg += `<path d="M${x0 + (N * cell) / 2} ${y0}L${x0 + N * cell} ${y0 + N * th}L${x0} ${y0 + N * th}Z" ${fill('none', `stroke:${col(o.outlineTone ?? 'label')};stroke-width:${rim};stroke-linejoin:round;opacity:0.55`)}/>`;
  }
  cells.forEach((k, i) => {
    const t = k.tone ?? o.tones?.[k.part] ?? o.tone ?? 1;
    const lit = anyLit && isLit(k, i), dim = anyLit && !lit, ghost = isGhost(k, i);
    const c = col(dim && o.dimTone ? o.dimTone : t);
    const st = ghost
      ? `fill:none;stroke:${col('label')};stroke-width:${Math.max(1.5, rim * 0.8)};stroke-dasharray:4 4;opacity:${dim ? 0.3 : 0.5}`
      : `fill:${c};stroke:${shade(c, 58)};stroke-width:${lit ? rim * 1.9 : dim ? rim * 0.6 : rim}${dim ? `;opacity:${o.dim ?? 0.25}` : ''}`;
    const pop = o.arrive && i >= from ? ` class="sv-pop${o.cls ? ' ' + o.cls : ''}"` : o.cls ? ` class="${o.cls}"` : '';
    const d = o.arrive && i >= from ? `;--d:${((i - from) * lag).toFixed(2)}s` : '';
    const attr = `${pop} data-part="${k.part ?? ''}" style="${st}${d}"`;
    const p = at(k.c, k.r);
    if (shape === 'tile') {
      const g = Math.max(2, cell * 0.08), s = cell - 2 * g;
      svg += `<rect x="${(p.x - s / 2).toFixed(1)}" y="${(p.y - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${Math.min(5, cell * 0.16).toFixed(1)}"${attr}/>`;
    } else if (shape === 'tri') {
      const ax = x0 + (N * cell) / 2 + (k.c - k.r / 2) * cell, ay = y0 + k.r * th, g = Math.max(1, cell * 0.05);
      svg += `<path d="M${ax.toFixed(1)} ${(ay + g * 1.6).toFixed(1)}L${(ax + cell / 2 - g * 1.4).toFixed(1)} ${(ay + th - g).toFixed(1)}L${(ax - cell / 2 + g * 1.4).toFixed(1)} ${(ay + th - g).toFixed(1)}Z"${attr.replace('style="', 'style="stroke-linejoin:round;')}/>`;
    } else {
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(cell * 0.36).toFixed(1)}"${attr}/>`;
    }
  });
  let over = '';
  if (o.label) {
    const ly = o.labelAbove ? box.y - 18 : box.y + box.h + 20;
    over = chip(o.label, box.x + box.w / 2, ly, { tone: o.labelTone ?? o.tone ?? 1, size: 'sm' });
  }
  return { svg, over, box, at };
}

export function zigzagSvg(n, o = {}) {
  const cell = Math.max(MIN_CELL, o.cell ?? 24), x0 = o.x ?? 0, y0 = o.y ?? 0;
  // Between row r's staircase (columns 0..r) and the top half (columns r+1..n): x = (r + 1) cells, down one row each step.
  let d = `M${x0 + cell} ${y0}`;
  for (let r = 0; r < n; r++) {
    d += `V${y0 + (r + 1) * cell}`;
    if (r < n - 1) d += `H${x0 + (r + 2) * cell}`;
  }
  const len = Math.round(cell * (2 * n));
  const w = Math.max(2.5, cell * 0.12);
  const cls = o.draw ? ` class="sv-draw"` : '';
  return { svg: `<path d="${d}"${cls} style="fill:none;stroke:${col(o.tone ?? 'label')};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round;--len:${len};--dur:${o.drawSeconds ?? 0.8}s"/>` };
}
