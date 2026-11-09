/**
 * SimNumberLine - number lines as SVG in the DOM (SimSvg stage): integers,
 * decimals, fractions, hops, spans, a zoom lens, the 0-1 chance line. Lay out
 * for the stage's real width (st.W): portrait gets a narrower line, labels thin
 * out by themselves, and text never shrinks.
 *
 *   const nl = numberLine({ rect, min, max, step, minor, labels, den, snap, at });
 *   nl.x(v) nl.v(px) nl.snap(px)          positions in stage px, snapping for drags
 *   numberLineSvg(nl, { tone, arrows })  -> { svg, over }  track, ticks, labels (fractions stacked, HTML)
 *   markerSvg(nl, v, { text, math, tone, grab, below, lift, pop }) -> { svg, over, hit }   a pin with a chip
 *   hopSvg(nl, a, b, { tone, text, lift, draw }) -> { svg, over }                            an arc with an arrowhead
 *   hopPath(nl, a, b, { lift }) -> 'M...'   the arc, for a token riding it (CSS offset-path)
 *   spanSvg(nl, a, b, { text, tone, drop }) -> { svg, over }                                 a bracket with a chip
 *   lensSvg(nl, a, b, sub, { tone }) -> { svg, over }                                        magnify a..b onto line `sub`
 *   probTrack({ rect }) -> nl with zone words (impossible .. certain)
 *   fracLabel(v, den) -> ['frac', n, d] | string
 *   join(...parts) -> { svg, over }      concatenate parts
 *   NUMBER_LINE_CSS                      overlay label CSS (add to the scene CSS)
 * Tones: series numbers 1..8 or 'accent' | 'good' | 'bad' | 'warning'.
 */
import { esc } from 'simulations/base/SimUi.js';
import { fmtNum, fracHtml } from './SimText.js';
import { tone as T, chip, fill, stroke, shade, glossOf, cushionCircle } from './SimSvg.js';

import { numberLine, probTrack, fracLabel } from './SimNumberLineSpec.js';
import { lookOf } from './lookProfile.js';
export { numberLine, probTrack, fracLabel };

const EPS = 1e-9;
const col = (t) => (typeof t === 'number' ? T(t) : `var(--sim-${t})`);

export function join(...parts) {
  return { svg: parts.map((p) => p?.svg ?? '').join(''), over: parts.map((p) => p?.over ?? '').join('') };
}

const labelHtml = (lab) => (Array.isArray(lab) ? fracHtml(lab[1], lab[2]) : esc(lab));

/** Track, arrowheads, ticks and labels. @opts tone, arrows, labelSize */
export function numberLineSvg(nl, o = {}) {
  const tr = o.tone ? col(o.tone) : 'color-mix(in oklab, var(--sim-track) 70%, var(--sim-label))';
  const y = nl.y, a0 = nl.x0 - 22, a1 = nl.x1 + 22, size = o.labelSize ?? 20;
  let svg = '', over = '';
  if (nl.zones) for (const z of nl.zones) if (z.to > z.from) {
    svg += `<rect x="${nl.x(z.from)}" y="${y - 16}" width="${nl.x(z.to) - nl.x(z.from)}" height="32" rx="16" ${fill(col(z.tone), 'opacity:0.2')}/>`;
  }
  const L = lookOf();
  svg += (L.lip ? `<rect x="${a0}" y="${y - 7 + 4 * L.lip}" width="${a1 - a0}" height="14" rx="7" ${fill(shade(tr, 55))}/>` : '')
    + (L.lip ? `<rect x="${a0}" y="${y - 7}" width="${a1 - a0}" height="14" rx="7" ${fill(tr)}/>` : `<rect x="${a0}" y="${y - 4}" width="${a1 - a0}" height="8" rx="4" ${fill(tr)}/>`)
    + (L.gloss ? `<rect x="${a0 + 10}" y="${y - 4.5}" width="${a1 - a0 - 20}" height="3.5" rx="1.75" ${fill(glossOf(tr, 50), `opacity:${0.6 * L.gloss}`)}/>` : '');
  if (o.arrows !== false) for (const s of [-1, 1]) {
    const ax = s < 0 ? a0 - 4 : a1 + 4;
    svg += `<path d="M${ax + s * 16} ${y}L${ax - s * 2} ${y - 13}Q${ax - s * 6} ${y} ${ax - s * 2} ${y + 13}Z" ${fill(tr)}/>`;
  }
  for (const tk of nl.ticks) {
    const x = nl.x(tk.v), th = tk.major ? 26 : 14, tw = tk.major ? 5 : 3.5;
    svg += `<rect x="${x - tw / 2}" y="${y - th / 2}" width="${tw}" height="${th}" rx="${tw / 2}" ${fill('var(--sim-label)', tk.major ? '' : 'opacity:0.55')}/>`;
    if (tk.label == null) continue;
    const zero = Math.abs(tk.v) < EPS && nl.min < 0;
    const colr = zero ? 'var(--sim-accent)' : tk.major ? 'var(--sim-label)' : 'var(--sim-label-muted)';
    if (Array.isArray(tk.label)) over += `<span class="nl-lab" style="left:${x}px;top:${y + 20}px;color:${colr};font-size:${tk.major ? size + 2 : size}px">${labelHtml(tk.label)}</span>`;
    else svg += `<text x="${x}" y="${y + 22 + size * 0.8}" text-anchor="middle" style="fill:${colr};font-size:${tk.major ? size : size - 2}px">${esc(tk.label)}</text>`;
  }
  if (nl.zones) {
    const tight = (nl.x1 - nl.x0) / 4 < 110;   // narrow line: stagger the words on two rows
    nl.zones.forEach((z, i) => { over += chip(z.word, nl.x((z.from + z.to) / 2), y + 88 + (tight && i % 2 ? 32 : 0), { tone: z.tone, size: 'sm' }); });
  }
  return { svg, over };
}

/** A pin at v with a chip (text, or math HTML with math: true). @opts text, math, tone, grab, below, lift, pop */
export function markerSvg(nl, v, o = {}) {
  const c = col(o.tone ?? 'accent'), x = nl.x(v), dir = o.below ? 1 : -1, lift = o.lift ?? 46, hy = nl.y + dir * lift, r = 13;
  let svg = `<g class="${o.grab ? 'sv-drag' : ''} ${o.pop != null ? 'sv-pop' : ''}" style="${o.pop != null ? `--d:${o.pop}s;` : ''}">`
    + `<line x1="${x}" y1="${nl.y}" x2="${x}" y2="${hy}" ${stroke(shade(c, 80), 5)}/>`
    + (o.grab ? `<circle cx="${x}" cy="${hy}" r="${r + 8}" class="sv-breathe" ${fill(c, 'opacity:0.22')}/>` : '')
    + cushionCircle(x, hy, r, c)
    + `<circle cx="${x}" cy="${nl.y}" r="7" ${fill(c, 'stroke:var(--sim-bg-deep);stroke-width:3')}/>`;
  svg += '</g>';
  const cy = hy + dir * (r + 24);
  const cx = Math.max(nl.rect.x + 70, Math.min(nl.rect.x + nl.rect.w - 70, x));
  const over = o.text != null ? chip(o.text, cx, cy, { tone: o.tone ?? 'accent', math: o.math, delay: o.pop, cls: o.pop != null ? 'sv-pop' : '' }) : '';
  return { svg, over, hit: { x, y: hy, r: r + 16 } };
}

/** The arc from a to b (for drawing and for a token's offset-path). @opts lift, below */
export function hopPath(nl, a, b, o = {}) {
  const xa = nl.x(a), xb = nl.x(b), dir = o.below ? 1 : -1;
  const lift = o.lift ?? Math.min(120, 30 + Math.abs(xb - xa) * 0.4);
  const y = nl.y - 8 * (o.below ? -1 : 1);
  return `M${xa.toFixed(1)} ${y}Q${((xa + xb) / 2).toFixed(1)} ${(y + dir * lift * 2).toFixed(1)} ${xb.toFixed(1)} ${y}`;
}

/** A hop arc with an arrowhead and a chip at the top; draw: animate it on. @opts tone, text, lift, below, draw */
export function hopSvg(nl, a, b, o = {}) {
  const c = col(o.tone ?? 2), d = hopPath(nl, a, b, o), xa = nl.x(a), xb = nl.x(b), dir = Math.sign(b - a) || 1;
  const lift = o.lift ?? Math.min(120, 30 + Math.abs(xb - xa) * 0.4);
  const y = nl.y - 8;
  const svg = `<path d="${d}" pathLength="1" class="${o.draw ? 'sv-draw' : ''}" ${stroke(c, 5, o.draw ? '--len:1;--dur:0.6s' : 'stroke-dasharray:0.012 0.028')}/>`
    + `<path d="M${xb - dir * 2} ${y + 2}l${-dir * 12} -9l${dir * 1} 13z" class="${o.draw ? 'sv-pop' : ''}" style="fill:${c};--d:0.55s"/>`;
  const over = o.text != null ? chip(o.text, (xa + xb) / 2, y - lift - 16, { tone: o.tone ?? 2, size: 'sm', delay: o.draw ? 0.35 : undefined, cls: o.draw ? 'sv-pop' : '' }) : '';
  return { svg, over };
}

/** A bracket under the labels from a to b, with a chip. @opts text, tone, drop */
export function spanSvg(nl, a, b, o = {}) {
  const c = col(o.tone ?? 'accent'), xa = nl.x(a), xb = nl.x(b), y = nl.y + (o.drop ?? 62);
  const svg = `<path d="M${xa} ${y - 10}Q${xa} ${y} ${xa + 10} ${y}L${xb - 10} ${y}Q${xb} ${y} ${xb} ${y - 10}" ${stroke(c, 4)}/>`;
  return { svg, over: o.text != null ? chip(o.text, (xa + xb) / 2, y + 18, { tone: o.tone ?? 'accent', size: 'sm' }) : '' };
}

/** Magnifier: a window round a..b on nl and a funnel to the child line `sub`. @opts tone */
export function lensSvg(nl, a, b, sub, o = {}) {
  const c = col(o.tone ?? 5), xa = nl.x(a), xb = nl.x(b), down = sub.y > nl.y;
  const top = nl.y - 22, bot = nl.y + 22, sy = sub.y + (down ? -26 : 26);
  const svg = `<path d="M${xa} ${down ? bot : top}L${xb} ${down ? bot : top}L${sub.x1 + 22} ${sy}L${sub.x0 - 22} ${sy}Z" ${fill(c, 'opacity:0.14')}/>`
    + `<path d="M${xa} ${down ? bot : top}L${sub.x0 - 22} ${sy}M${xb} ${down ? bot : top}L${sub.x1 + 22} ${sy}" ${stroke(c, 2, 'stroke-dasharray:6 6;opacity:0.6')}/>`
    + `<rect x="${xa - 6}" y="${top}" width="${xb - xa + 12}" height="${bot - top}" rx="12" ${stroke(c, 4)}/>`;
  return { svg, over: '' };
}

/** Overlay label CSS (fraction labels). Add it to the scene CSS. */
export const NUMBER_LINE_CSS = `
.nl-lab { position: absolute; transform: translateX(-50%); font-weight: 800; line-height: 1; }
`;
