/**
 * SimChance - probability apparatus as SVG in the DOM (SimSvg stage). All
 * randomness is the scene's and seeded (mulberry32 in SimLook): same seed,
 * same draws on every mount. Never crypto.*. Each part returns { svg, over }.
 *
 *   dieSvg(x, y, s, face, { tone, tilt })            a die centred at (x, y), side s
 *   coinSvg(x, y, r, 'H' | 'T')                        a coin (no real currency design)
 *   cardSvg(x, y, w, rank, suit, { back, hi })        a playing card (suit S H D C), drawn pips, no deck art;
 *                                                      the rank corner shows from w 50 (label a small grid instead)
 *   cardGrid(rect) -> { cell(rank, suit), ranks, suits }   13 x 4 layout
 *   outcomeGrid(rect, rows, cols) -> { cell(i, j), head(kind, n), each(fn) }
 *   outcomeGridSvg(g, { label(i, j), tone(i, j), heads: [rowHeads, colHeads] })   heads: text or (x, y, s) => svg
 *   spinnerSvg(x, y, r, sectors, angleDeg, { spin })   sectors [{ w, tone, text }]; spin: CSS-animate to angleDeg
 *   spinnerSector(sectors, angleDeg) -> index under the top pointer
 *   bagSvg(x, y, balls, { r, seed })                   a sack with balls [{ tone, n }] heaped in its mouth
 *   treeLayout(levels, { rect }) -> { nodes, edges, leaves }   levels [[{ text, p, pText }], ...] (repeat per parent)
 *   treeSvg(t, { path, probs, grow })                 path: branch indices to highlight
 *   lassoSvg(pts, { tone, pad, text })                 a loose loop round points (an event)
 *   CHANCE_CSS                                         spinner spin transition
 * Tones: series numbers 1..8 or 'good' | 'bad' | 'warning' | 'accent'.
 */
import { esc } from 'simulations/base/SimUi.js';
import { chip, fill, stroke, shade, glossOf, cushionRect, cushionCircle, tone as T } from './SimSvg.js';
import { lookOf } from './lookProfile.js';
import { mulberry32 } from './SimLook.js';

const col = (t) => (typeof t === 'number' ? T(t) : `var(--sim-${t})`);
const f1 = (v) => (+v).toFixed(1);
// Dice and cards are white in both themes, like the real things; ink is near-black or red.
const FACE = 'color-mix(in oklab, var(--sim-series-5) 6%, white)';
const PIP = 'color-mix(in oklab, var(--sim-series-5) 25%, black)';
const RED = 'color-mix(in oklab, var(--sim-series-6) 80%, black)';
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

/** A die showing face 1..6. @opts tone, tilt */
export function dieSvg(x, y, s, face, o = {}) {
  const body = o.tone ? col(o.tone) : FACE, ink = o.tone ? `var(--sim-ink-on-${o.tone}, var(--sim-bg-deep))` : PIP;
  let svg = `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${o.tilt ?? 0})">${cushionRect(-s / 2, -s / 2, s, s, s * 0.2, body, { lift: s * 0.08 })}`;
  for (const [px, py] of PIPS[Math.max(1, Math.min(6, face | 0))]) svg += `<circle cx="${f1(px * s * 0.26)}" cy="${f1(py * s * 0.26)}" r="${f1(s * 0.085)}" ${fill(face === 1 ? 'var(--sim-bad)' : ink)}/>`;
  return { svg: svg + '</g>', over: '' };
}

/** A coin with an embossed H or T. */
export function coinSvg(x, y, r, side) {
  const g = 'var(--sim-gold)';
  return { svg: cushionCircle(x, y, r, g) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.78)}" ${fill(glossOf(g, 88), `stroke:${shade(g, 82)};stroke-width:${f1(r * 0.08)}`)}/>`
    + `<text x="${f1(x)}" y="${f1(y + r * 0.34)}" text-anchor="middle" style="fill:${shade(g, 50)};font-size:${f1(r * 0.95)}px;font-family:var(--sim-font-display, var(--sim-font))">${side === 'T' ? 'T' : 'H'}</text>`, over: '' };
}

function suitPath(s, x, y, r) {
  if (s === 'H') return `M${f1(x)} ${f1(y + r)}C${f1(x - r * 1.4)} ${f1(y - r * 0.1)} ${f1(x - r * 0.6)} ${f1(y - r * 1.2)} ${f1(x)} ${f1(y - r * 0.45)}C${f1(x + r * 0.6)} ${f1(y - r * 1.2)} ${f1(x + r * 1.4)} ${f1(y - r * 0.1)} ${f1(x)} ${f1(y + r)}Z`;
  if (s === 'D') return `M${f1(x)} ${f1(y - r)}Q${f1(x + r * 0.3)} ${f1(y - r * 0.3)} ${f1(x + r * 0.8)} ${f1(y)}Q${f1(x + r * 0.3)} ${f1(y + r * 0.3)} ${f1(x)} ${f1(y + r)}Q${f1(x - r * 0.3)} ${f1(y + r * 0.3)} ${f1(x - r * 0.8)} ${f1(y)}Q${f1(x - r * 0.3)} ${f1(y - r * 0.3)} ${f1(x)} ${f1(y - r)}Z`;
  if (s === 'S') return `M${f1(x)} ${f1(y - r)}C${f1(x + r * 1.4)} ${f1(y + r * 0.1)} ${f1(x + r * 0.6)} ${f1(y + r)} ${f1(x)} ${f1(y + r * 0.4)}C${f1(x - r * 0.6)} ${f1(y + r)} ${f1(x - r * 1.4)} ${f1(y + r * 0.1)} ${f1(x)} ${f1(y - r)}ZM${f1(x)} ${f1(y + r * 0.2)}L${f1(x + r * 0.35)} ${f1(y + r)}L${f1(x - r * 0.35)} ${f1(y + r)}Z`;
  const c = (dx, dy) => { const cx = x + dx * r, cy = y + dy * r, q = r * 0.42; return `M${f1(cx - q)} ${f1(cy)}a${f1(q)} ${f1(q)} 0 1 0 ${f1(2 * q)} 0a${f1(q)} ${f1(q)} 0 1 0 ${f1(-2 * q)} 0Z`; };
  return c(0, -0.45) + c(-0.48, 0.15) + c(0.48, 0.15) + `M${f1(x)} ${f1(y)}L${f1(x + r * 0.35)} ${f1(y + r)}L${f1(x - r * 0.35)} ${f1(y + r)}Z`;
}

/** A playing card w wide, 1.4 w tall, centred at (x, y). @opts back, hi */
export function cardSvg(x, y, w, rank, suit, o = {}) {
  const h = w * 1.4, x0 = x - w / 2, y0 = y - h / 2, r = w * 0.12;
  let svg = o.hi ? `<rect x="${f1(x0 - 4)}" y="${f1(y0 - 4)}" width="${f1(w + 8)}" height="${f1(h + 8)}" rx="${f1(r + 4)}" ${fill(col(o.hi))}/>` : '';
  svg += cushionRect(+f1(x0), +f1(y0), +f1(w), +f1(h), +f1(r), o.back ? T(5) : FACE, { lift: w * 0.05, gloss: !!o.back });
  if (o.back) return { svg, over: '' };
  const red = suit === 'H' || suit === 'D', c = red ? RED : PIP;
  if (w * 0.28 >= 14) svg += `<text x="${f1(x0 + w * 0.1)}" y="${f1(y0 + w * 0.34)}" style="fill:${c};font-size:${f1(w * 0.28)}px">${esc(rank)}</text>`;
  svg += `<path d="${suitPath(suit, x, y + w * 0.08, w * 0.26)}" ${fill(c)}/>`;
  return { svg, over: '' };
}

/** 13 ranks x 4 suits in rect. */
export function cardGrid(rect) {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], suits = ['S', 'H', 'D', 'C'];
  const cw = rect.w / 13, ch = rect.h / 4;
  return { ranks, suits, cell: (rank, suit) => ({ x: rect.x + ranks.indexOf(String(rank)) * cw, y: rect.y + suits.indexOf(suit) * ch, w: cw, h: ch }) };
}

/** rows x cols cells in rect, with a 40 px head row and column. */
export function outcomeGrid(rect, rows, cols) {
  const hw = 40, cw = (rect.w - hw) / cols, ch = (rect.h - hw) / rows;
  return {
    rect, rows, cols,
    cell: (i, j) => ({ x: rect.x + hw + j * cw, y: rect.y + hw + i * ch, w: cw, h: ch }),
    head: (kind, n) => (kind === 'row' ? { x: rect.x, y: rect.y + hw + n * ch, w: hw, h: ch } : { x: rect.x + hw + n * cw, y: rect.y, w: cw, h: hw }),
    each(fn) { for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) fn(i, j, this.cell(i, j)); },
  };
}

/** Tiles popping in diagonally; tone(i, j) lights a cell (null = plain). @opts label, tone, heads */
export function outcomeGridSvg(g, o = {}) {
  const plain = 'color-mix(in oklab, var(--sim-bg-surface) 70%, var(--sim-stroke))';
  let svg = '';
  g.each((i, j, r) => {
    const t = o.tone?.(i, j), c = t != null ? col(t) : plain, pad = 2.5;
    svg += cushionRect(+f1(r.x + pad), +f1(r.y + pad), +f1(r.w - 2 * pad), +f1(r.h - 2 * pad), 8, c, { lift: 3, gloss: false, cls: 'sv-pop', style: `--d:${((i + j) * 0.03).toFixed(2)}s` });
    const lab = o.label?.(i, j);
    if (lab != null) svg += `<text x="${f1(r.x + r.w / 2)}" y="${f1(r.y + r.h / 2 + 6)}" text-anchor="middle" class="sv-pop" style="--d:${((i + j) * 0.03).toFixed(2)}s;fill:${t != null ? (typeof t === 'number' ? `var(--sim-ink-on-${t}, var(--sim-bg-deep))` : `var(--sim-ink-on-${t}, var(--sim-bg-deep))`) : 'var(--sim-label)'};font-size:${f1(Math.min(18, r.h * 0.42))}px">${esc(lab)}</text>`;
  });
  const [rows, cols] = o.heads ?? [];
  const head = (h, r) => (typeof h === 'function' ? h(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.62)
    : `<text x="${f1(r.x + r.w / 2)}" y="${f1(r.y + r.h / 2 + 6)}" text-anchor="middle" style="fill:var(--sim-label);font-size:17px">${esc(h)}</text>`);
  rows?.forEach((h, n) => { svg += head(h, g.head('row', n)); });
  cols?.forEach((h, n) => { svg += head(h, g.head('col', n)); });
  return { svg, over: '' };
}

function sectorAngles(sectors) {
  const tot = sectors.reduce((s, q) => s + q.w, 0);
  if (!(tot > 0)) throw new Error('spinnerSvg: sector weights must add up to more than 0');
  let a = 0;
  return sectors.map((q) => { const a0 = a; a += (q.w / tot) * 360; return [a0, a]; });
}

/** Index of the sector under the top pointer when the disc is turned by angleDeg (clockwise). */
export function spinnerSector(sectors, angleDeg) {
  const at = ((270 - angleDeg) % 360 + 720) % 360;
  return sectorAngles(sectors).findIndex(([a0, a1]) => at >= a0 && at < a1);
}

/** A spinner turned by angleDeg; spin: true animates from its last angle (CSS). @opts spin */
export function spinnerSvg(x, y, r, sectors, angleDeg = 0, o = {}) {
  const ang = sectorAngles(sectors);
  const pt = (a, rr) => `${f1(x + Math.cos((a * Math.PI) / 180) * rr)} ${f1(y + Math.sin((a * Math.PI) / 180) * rr)}`;
  let disc = '';
  sectors.forEach((q, i) => {
    const [a0, a1] = ang[i], c = col(q.tone ?? i + 1), big = a1 - a0 > 180 ? 1 : 0;
    disc += `<path d="M${f1(x)} ${f1(y)}L${pt(a0, r)}A${r} ${r} 0 ${big} 1 ${pt(a1, r)}Z" ${fill(c, 'stroke:var(--sim-bg-surface);stroke-width:3')}/>`;
    if (q.text != null) {
      const m = (a0 + a1) / 2, p = pt(m, r * 0.64).split(' ');
      disc += `<text x="${p[0]}" y="${+p[1] + 7}" text-anchor="middle" style="fill:var(--sim-ink-on-${typeof q.tone === 'number' ? q.tone : i + 1}, var(--sim-bg-deep));font-size:${f1(Math.max(16, r * 0.17))}px">${esc(q.text)}</text>`;
    }
  });
  const lip = lookOf().lip;
  const svg = (lip ? `<circle cx="${f1(x)}" cy="${f1(y + r * 0.07 * lip)}" r="${r + 7}" ${fill(shade('var(--sim-stroke)', 55))}/>` : '') + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 7}" ${fill('color-mix(in oklab, var(--sim-stroke) 80%, var(--sim-label))')}/>`
    + `<g class="ch-disc${o.spin ? ' ch-disc--spin' : ''}" style="transform-origin:${f1(x)}px ${f1(y)}px;transform:rotate(${f1(angleDeg)}deg)">${disc}</g>`
    + cushionCircle(x, y, r * 0.14, 'var(--sim-label)')
    + `<path d="M${f1(x)} ${f1(y - r + 16)}L${f1(x - 14)} ${f1(y - r - 16)}L${f1(x + 14)} ${f1(y - r - 16)}Z" ${fill('var(--sim-bad)', `stroke:${shade('var(--sim-bad)', 60)};stroke-width:3;stroke-linejoin:round`)}/>`;
  return { svg, over: '' };
}

/** A cloth sack, open at the top, balls heaped in its mouth. @opts r, seed */
export function bagSvg(x, y, balls, o = {}) {
  const r = o.r ?? 80, rnd = mulberry32(o.seed ?? 5), c = 'color-mix(in oklab, var(--sim-gold) 75%, var(--sim-series-8))';
  const top = y - r * 0.5, mw = r * 0.72;
  const body = `M${f1(x - mw)} ${f1(top)}C${f1(x - r * 1.3)} ${f1(y + r * 0.3)} ${f1(x - r * 0.95)} ${f1(y + r)} ${f1(x)} ${f1(y + r)}C${f1(x + r * 0.95)} ${f1(y + r)} ${f1(x + r * 1.3)} ${f1(y + r * 0.3)} ${f1(x + mw)} ${f1(top)}Z`;
  const L = lookOf();
  let svg = (L.lip ? `<ellipse cx="${f1(x)}" cy="${f1(y + r + 4)}" rx="${f1(r * 0.85)}" ry="10" ${fill(shade('var(--sim-bg-deep)', 50), 'opacity:0.35')}/>` : '')
    + `<ellipse cx="${f1(x)}" cy="${f1(top)}" rx="${f1(mw)}" ry="${f1(r * 0.2)}" ${fill(shade(c, 45))}/>`;
  // Balls heaped in the mouth, back row first; the front lip covers their lower halves.
  const all = balls.flatMap((b) => Array.from({ length: b.n }, () => col(b.tone)));
  const br = Math.min(r * 0.16, (mw * 2) / Math.max(3, Math.ceil(all.length / 2) + 1) / 2);
  all.forEach((bc, i) => {
    const row = i % 2, k = Math.floor(i / 2), per = Math.ceil(all.length / 2);
    const bx = x - mw + br * 1.3 + ((k + 0.5 * row) / Math.max(1, per - 0.5)) * (mw * 2 - br * 2.6) + (rnd() - 0.5) * 3;
    svg += cushionCircle(+f1(bx), +f1(top - br * (row ? 0.2 : 0.75)), br, bc, { lift: 0 });
  });
  svg += `<path d="${body}" ${fill(shade(c, 78))}/><path d="${body}" transform="translate(${f1(-r * 0.07)} ${f1(-r * 0.04)})" ${fill(c)}/>`
    + `<path d="M${f1(x - mw)} ${f1(top)}Q${f1(x)} ${f1(top + r * 0.28)} ${f1(x + mw)} ${f1(top)}" ${stroke(shade(c, 55), 6)}/>`
    + (L.gloss ? `<path d="M${f1(x - r * 0.4)} ${f1(y + r * 0.2)}q${f1(r * 0.1)} ${f1(r * 0.3)} ${f1(r * 0.05)} ${f1(r * 0.55)}" ${stroke(glossOf(c, 50), 4, `opacity:${0.6 * L.gloss}`)}/>` : '');
  return { svg, over: '' };
}

/** Tree layout, left to right; nodes carry path, text and product probability. @opts rect */
export function treeLayout(levels, o = {}) {
  const r = o.rect ?? { x: 20, y: 20, w: 600, h: 360 };
  const root = { id: 'root', depth: 0, x: r.x + 16, y: r.y + r.h / 2, text: '', p: 1, path: [] };
  const nodes = [root], edges = [];
  let frontier = [root];
  const dx = (r.w - 40) / levels.length;
  levels.forEach((branches, d) => {
    const next = [];
    frontier.forEach((parent) => branches.forEach((b, i) => {
      const n = { id: `${parent.id}.${i}`, depth: d + 1, text: b.text, p: parent.p * (b.p ?? 1 / branches.length), path: [...parent.path, i] };
      next.push(n);
      edges.push({ from: parent, to: n, text: b.pText ?? (b.p != null ? String(b.p) : '') });
    }));
    const gap = r.h / next.length;
    next.forEach((n, i) => { n.x = r.x + 16 + dx * (d + 1); n.y = r.y + gap * (i + 0.5); });
    nodes.push(...next);
    frontier = next;
  });
  return { nodes, edges, leaves: frontier };
}

/** A tree: branches draw on level by level (grow), `path` highlights one route. @opts path, probs, grow */
export function treeSvg(t, o = {}) {
  const hot = (n) => o.path && n.path.every((v, i) => o.path[i] === v);
  let svg = '', over = '';
  for (const e of t.edges) {
    const h = hot(e.to), d = (e.to.depth - 1) * 0.45;
    svg += `<line x1="${f1(e.from.x + 14)}" y1="${f1(e.from.y)}" x2="${f1(e.to.x - 20)}" y2="${f1(e.to.y)}" pathLength="1" class="${o.grow ? 'sv-draw' : ''}" ${stroke(h ? 'var(--sim-series-2)' : 'color-mix(in oklab, var(--sim-label) 55%, transparent)', h ? 6 : 3.5, `--len:1;--d:${d}s;--dur:0.4s`)}/>`;
    if (o.probs !== false && e.text) over += chip(e.text, (e.from.x + e.to.x) / 2, (e.from.y + e.to.y) / 2 - 2, { tone: h ? 2 : 'plain', size: 'sm', cls: o.grow ? 'sv-pop' : '', delay: o.grow ? d + 0.35 : undefined });
  }
  for (const n of t.nodes) {
    if (!n.depth) { svg += `<circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="9" ${fill('var(--sim-label)')}/>`; continue; }
    const tn = hot(n) ? 2 : 1, d = (n.depth - 1) * 0.45 + 0.3;
    svg += `<g class="${o.grow ? 'sv-pop' : ''}" style="--d:${d}s">${cushionCircle(+f1(n.x), +f1(n.y), 19, T(tn))}<text x="${f1(n.x)}" y="${f1(n.y + 6)}" text-anchor="middle" style="fill:var(--sim-ink-on-${tn}, var(--sim-bg-deep));font-size:17px">${esc(n.text)}</text></g>`;
  }
  return { svg, over };
}

/** A loose dashed loop round points. @opts tone, pad, text */
export function lassoSvg(pts, o = {}) {
  if (!pts.length) return { svg: '', over: '' };
  const c = col(o.tone ?? 4), pad = o.pad ?? 26;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rx = Math.max(...pts.map((p) => Math.abs(p.x - cx))) + pad, ry = Math.max(...pts.map((p) => Math.abs(p.y - cy))) + pad;
  return { svg: `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" ${fill(c, `opacity:0.14`)}/><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" ${stroke(c, 4, 'stroke-dasharray:10 7')}/>`,
    over: o.text ? chip(o.text, cx, cy - ry - 4, { tone: o.tone ?? 4, size: 'sm' }) : '' };
}

/** The spinner's spin (a CSS transition on the disc's rotation). Add it to the scene CSS. */
export const CHANCE_CSS = `
.ch-disc--spin { transition: transform 2.4s cubic-bezier(0.15, 0.6, 0.2, 1); }
`;
