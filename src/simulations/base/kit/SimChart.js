/**
 * SimChart - animated charts as SVG in the DOM (SimSvg stage). Bars grow in,
 * traces draw on, chips pop: all CSS, no frame loop. Lay out for the stage's
 * real width (portrait = its own layout); text is never scaled down. Static
 * charts with no interaction belong in the `graph` JSON field, not a scene.
 *
 *   const f = chartFrame({ rect, x: { min, max, ticks, label, cats, fmt }, y: { min, max, ticks, label, fmt } });
 *   f.px(v) f.py(v) f.vx(px) f.vy(py) f.band(i) -> { x, w }
 *   const T = timeAxis({ from, to, bin: 'day' | 'week', weekStart, want })   dates on x: chartFrame({ x: { ...T, label } })
 *   T.bins(dates) -> histogramSvg bins (empty bins kept); T.x(date) -> a trace point's x; dayNumber(d), dayText(n, { year, month })
 *   axesSvg(f, { grid, panel })                     -> { svg, over }  panel, grid, tick labels, axis titles
 *   barsSvg(f, bars, { grow, labels, width, fmt })  -> { svg, over }  bars [{ x (cat index | value), v | vs: [..], tone, tones, text }]
 *   traceSvg(f, pts, { tone, target, targetText, end, draw, width }) -> { svg, over }  pts [{ x, y }]
 *   histogramSvg(f, bins, { tone, grow })            bins [{ x0, x1, n, tone }]
 *   pieSvg(rect, parts, { donut, labels })           parts [{ v, tone, text }]
 *   hemicycleSeats(n, rect) -> [{ x, y, r }]         seat centres, left to right
 *   hemicycleSvg(rect, { seats, groups, majority, label })   groups [{ n, tone }]
 *   dotsSvg(rect, { n, hi, tone, hiTone, cols })    a population, first `hi` (or a Set) highlighted
 *   tallySvg(x, y, n, { size, tone })               tally marks in fives
 *   barsHtml(rows, { max, unit, fmt, rule }) -> html plain DOM bars for a board (rows [{ label, v, tone, key, text }]);
 *                                                    rule: thin editorial rows; tone may be a token name ('annot');
 *                                                    key -> data-bar for SimPanel setBar; text overrides the value;
 *                                                    base: bars from a baseline both ways (+ min, max, log, ticks,
 *                                                    baseLabel, ends); SimPanel setBaseBar moves one. barPos(v, o)
 *   CHART_CSS                                        overlay CSS (the hemicycle count)
 * Tones: series numbers 1..8 or 'accent' | 'good' | 'bad' | 'warning' | 'label'.
 */
import { esc } from 'simulations/base/SimUi.js';
import { fmtNum } from './SimText.js';
import { tone as T, chip, fill, stroke, shade, glossOf, cushionCircle, panelSvg } from './SimSvg.js';
import { lookOf } from './lookProfile.js';

const col = (t) => (typeof t === 'number' ? T(t) : `var(--sim-${t})`);

import { chartFrame, timeAxis, dayNumber, dayText } from './SimChartSpec.js';
export { chartFrame, timeAxis, dayNumber, dayText };

const num = (v) => fmtNum(v, { dp: Math.abs(v) < 1 && v !== 0 ? 2 : 0 });

// An x tick label centred under its tick, unless that would push it past the panel edge:
// then it is anchored to the edge instead (end ticks with wide labels, e.g. dates or 1,000).
// Width is estimated at 15px bold text (generous); the anchor keeps the outer edge exact whatever the font.
const emOf = (ch) => (/[0-9]/.test(ch) ? 0.58 : /[A-Z]/.test(ch) ? 0.68 : /[a-z]/.test(ch) ? 0.54 : /[ .,:;'|!]/.test(ch) ? 0.3 : 0.6);
function xLabelAt(x, text, r, pad = 6) {
  const hw = [...text].reduce((s, ch) => s + emOf(ch), 0) * 15 / 2;
  if (x + hw > r.x + r.w - pad) return (y) => `x="${Math.min(x + hw, r.x + r.w - pad)}" y="${y}" text-anchor="end"`;
  if (x - hw < r.x + pad) return (y) => `x="${Math.max(x - hw, r.x + pad)}" y="${y}" text-anchor="start"`;
  return (y) => `x="${x}" y="${y}" text-anchor="middle"`;
}

/** Panel card, grid, tick labels, baseline and axis titles. @opts grid, panel */
export function axesSvg(f, o = {}) {
  const p = f.plot, r = f.rect, L = lookOf();
  let svg = '';
  if (o.panel !== false) svg += panelSvg(r);
  const fy = f.y.fmt ?? num, fx = f.x.fmt ?? num;
  for (const v of f.yticks) {
    const y = f.py(v);
    if (o.grid !== false) svg += `<rect x="${p.x}" y="${y - 1}" width="${p.w}" height="2" ${fill('var(--sim-stroke)', 'opacity:0.35')}/>`;
    svg += `<text x="${p.x - 10}" y="${y + 5}" text-anchor="end" style="fill:var(--sim-label-muted);font-size:15px">${esc(fy(v))}</text>`;
  }
  if (f.x.cats) f.x.cats.forEach((cat, i) => { svg += `<text ${xLabelAt(f.px(i), String(cat), r)(p.y + p.h + 24)} style="fill:var(--sim-label);font-size:15px">${esc(cat)}</text>`; });
  else for (const v of f.xticks) {
    const x = f.px(v);
    if (o.grid !== false) svg += `<rect x="${x - 1}" y="${p.y}" width="2" height="${p.h}" ${fill('var(--sim-stroke)', 'opacity:0.25')}/>`;
    svg += `<text ${xLabelAt(x, String(fx(v)), r)(p.y + p.h + 24)} style="fill:var(--sim-label-muted);font-size:15px">${esc(fx(v))}</text>`;
  }
  svg += `<rect x="${p.x - 2}" y="${p.y + p.h - 2 * L.rim}" width="${p.w + 4}" height="${5 * L.rim}" rx="${2.5 * L.rim}" ${fill('var(--sim-label)')}/>`;
  if (f.x.label) svg += `<text x="${p.x + p.w / 2}" y="${r.y + r.h - 10}" text-anchor="middle" style="fill:var(--sim-label);font-size:15px">${esc(f.x.label)}</text>`;
  if (f.y.label) svg += `<text transform="translate(${r.x + 22} ${p.y + p.h / 2}) rotate(-90)" text-anchor="middle" style="fill:var(--sim-label);font-size:15px">${esc(f.y.label)}</text>`;
  return { svg, over: '' };
}

// A bar: rounded top, a cushion down its right side (look lip; flat at 0), a gloss stripe (look gloss).
function bar(x, y, w, h, c, cls = '', style = '') {
  if (h <= 0.5) return '';
  const L = lookOf();
  const r = Math.min(10 * L.radius, w / 2, h), d = `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
  const cw = Math.max(4, w * 0.16);
  return `<g class="${cls}" style="${style}">`
    + (L.lip ? `<path d="${d}" ${fill(shade(c, 72))}/><path d="${d}" ${fill(c, `clip-path:inset(0 ${cw}px 0 0)`)}/>` : `<path d="${d}" ${fill(c)}/>`)
    + (L.gloss ? `<rect x="${x + Math.max(3, w * 0.12)}" y="${y + 4}" width="${Math.max(3, w * 0.12)}" height="${Math.max(0, h - 8)}" rx="2" ${fill(glossOf(c, 45), `opacity:${0.55 * L.gloss}`)}/>` : '') + '</g>';
}

/** Bars from 0; grow: animate in (staggered). @opts grow, labels, width, fmt */
export function barsSvg(f, bars, o = {}) {
  const fmt = o.fmt ?? ((v) => fmtNum(v));
  const base = f.py(Math.max(f.y.min, 0));
  let svg = '', over = '';
  bars.forEach((b, i) => {
    const band = f.x.cats ? f.band(b.x) : { x: f.px(b.x) - 20, w: 40 };
    const w = band.w * (o.width ?? 0.62), x = band.x + (band.w - w) / 2;
    let top = base;
    (b.vs ?? [b.v]).forEach((v, j) => {
      const h = base - f.py(v);
      svg += bar(x, top - h, w, h, col(b.tones?.[j] ?? b.tone ?? 1), o.grow ? 'sv-grow' : '', `--d:${(i * 0.08 + j * 0.2).toFixed(2)}s`);
      top -= h;
    });
    const total = (b.vs ?? [b.v]).reduce((s, v) => s + v, 0);
    if (o.labels !== false) over += chip(b.text ?? fmt(total), x + w / 2, top - 18, { tone: b.tone ?? 1, size: 'sm', cls: o.grow ? 'sv-pop' : '', delay: o.grow ? 0.45 + i * 0.08 : undefined });
  });
  return { svg, over };
}

/** A line through pts (draw: animate on), end dot, optional target line + chip. @opts tone, target, targetText, end, draw, width */
export function traceSvg(f, pts, o = {}) {
  const c = col(o.tone ?? 1);
  let svg = '', over = '';
  if (o.target != null) {
    const y = f.py(o.target);
    svg += `<line x1="${f.plot.x}" y1="${y}" x2="${f.plot.x + f.plot.w}" y2="${y}" ${stroke('var(--sim-warning)', 3, 'stroke-dasharray:8 7')}/>`;
    if (o.targetText) over += chip(o.targetText, f.plot.x + f.plot.w - 8, y - 18, { tone: 'warning', size: 'sm', align: 'right' });
  }
  if (!pts.length) return { svg, over };
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f.px(p.x).toFixed(1)} ${f.py(p.y).toFixed(1)}`).join('');
  const w = o.width ?? 6, lip = lookOf().lip;
  if (lip) svg += `<path d="${d}" transform="translate(0 ${3 * lip})" pathLength="1" class="${o.draw ? 'sv-draw' : ''}" ${stroke(shade(c, 60), w, o.draw ? '--len:1' : '')}/>`;
  svg += `<path d="${d}" pathLength="1" class="${o.draw ? 'sv-draw' : ''}" ${stroke(c, w, o.draw ? '--len:1' : '')}/>`;
  if (o.end !== false) {
    const e = pts[pts.length - 1], x = f.px(e.x), y = f.py(e.y);
    svg += `<g class="${o.draw ? 'sv-pop' : ''}" style="--d:0.7s"><circle cx="${x}" cy="${y}" r="13" ${fill(c, 'opacity:0.25')}/><circle cx="${x}" cy="${y}" r="8" ${fill(c, 'stroke:var(--sim-bg-surface);stroke-width:3')}/></g>`;
  }
  return { svg, over };
}

/** Contiguous bars for bins. @opts tone, grow */
export function histogramSvg(f, bins, o = {}) {
  const base = f.py(0);
  return { svg: bins.map((b, i) => { const x0 = f.px(b.x0) + 1.5, x1 = f.px(b.x1) - 1.5, y = f.py(b.n); return bar(x0, y, x1 - x0, base - y, col(b.tone ?? o.tone ?? lookOf().seriesDefault?.[0] ?? 5), o.grow ? 'sv-grow' : '', `--d:${i * 0.06}s`); }).join(''), over: '' };
}

/** Pie or donut from 12 o'clock; labels as chips outside. @opts donut, labels */
export function pieSvg(rect, parts, o = {}) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, R = Math.min(rect.w, rect.h) / 2 - (o.labels === false ? 4 : 42);
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  const lip = lookOf().lip;
  let a = -Math.PI / 2, svg = lip ? `<circle cx="${cx}" cy="${cy + 6 * lip}" r="${R}" ${fill(shade('var(--sim-bg-deep)', 50), 'opacity:0.35')}/>` : '', over = '';
  const pt = (ang, r) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`;
  parts.forEach((p) => {
    const da = (p.v / total) * Math.PI * 2, a1 = a + da, big = da > Math.PI ? 1 : 0;
    svg += da >= Math.PI * 2 - 1e-6 ? `<circle cx="${cx}" cy="${cy}" r="${R}" ${fill(col(p.tone ?? 1))}/>`
      : `<path d="M${cx} ${cy}L${pt(a, R)}A${R} ${R} 0 ${big} 1 ${pt(a1, R)}Z" ${fill(col(p.tone ?? 1), 'stroke:var(--sim-bg-surface);stroke-width:3')}/>`;
    if (o.labels !== false && p.text && da > 0.12) over += chip(p.text, cx + Math.cos(a + da / 2) * (R + 22), cy + Math.sin(a + da / 2) * (R + 16), { tone: p.tone ?? 1, size: 'sm' });
    a = a1;
  });
  if (o.donut) svg += `<circle cx="${cx}" cy="${cy}" r="${R * 0.55}" ${fill('var(--sim-bg-surface)')}/>`;
  return { svg, over };
}

/** Seat centres of a parliament hemicycle in rect, left to right. */
export function hemicycleSeats(n, rect) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h - 6;
  const R = Math.min(rect.w / 2, rect.h - 12), r0 = R * 0.48;
  let rows = 1, spacing = 0;
  for (; rows < 40; rows++) {
    const dr = (R - r0) / rows;
    const cap = Array.from({ length: rows }, (_, i) => Math.floor((Math.PI * (r0 + dr * (i + 0.5))) / dr));
    if (cap.reduce((s, v) => s + v, 0) >= n) { spacing = dr; break; }
  }
  const radii = Array.from({ length: rows }, (_, i) => r0 + spacing * (i + 0.5));
  const tot = radii.reduce((s, v) => s + v, 0);
  const per = radii.map((r) => Math.round((n * r) / tot));
  per[rows - 1] += n - per.reduce((s, v) => s + v, 0);
  const out = [];
  radii.forEach((r, i) => {
    for (let j = 0; j < per[i]; j++) {
      const a = Math.PI - (per[i] === 1 ? Math.PI / 2 : (j / (per[i] - 1)) * Math.PI);
      out.push({ x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r, a, r: spacing * 0.4 });
    }
  });
  return out.sort((p, q) => q.a - p.a);
}

/** Seats coloured by group, in order; majority tick and chip; the count as HTML. @opts seats, groups, majority, label */
export function hemicycleSvg(rect, o = {}) {
  const n = o.seats ?? o.groups.reduce((s, g) => s + g.n, 0);
  const seats = hemicycleSeats(n, rect), cols = [];
  for (const g of o.groups ?? []) for (let i = 0; i < g.n; i++) cols.push(col(g.tone ?? 1));
  const empty = 'color-mix(in oklab, var(--sim-stroke) 60%, var(--sim-bg-deep))';
  let svg = seats.map((s, i) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(2)}" ${fill(cols[i] ?? empty)}/>`).join(''), over = '';
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h - 6, R = Math.min(rect.w / 2, rect.h - 12);
  if (o.majority) {
    const s = seats[Math.min(n - 1, o.majority - 1)], ang = Math.atan2(cy - s.y, s.x - cx);
    svg += `<line x1="${cx + Math.cos(ang) * R * 0.44}" y1="${cy - Math.sin(ang) * R * 0.44}" x2="${cx + Math.cos(ang) * (R + 10)}" y2="${cy - Math.sin(ang) * (R + 10)}" ${stroke('var(--sim-label)', 3, 'stroke-dasharray:5 5')}/>`;
    over += chip(`${fmtNum(o.majority)} for a majority`, cx + Math.cos(ang) * (R + 26), cy - Math.sin(ang) * (R + 26), { tone: 'plain', size: 'sm' });
  }
  if (o.label !== false) over += `<span class="ch-count" style="left:${cx}px;top:${cy - R * 0.24}px;font-size:${Math.max(16, Math.min(34, R * 0.26)).toFixed(0)}px">${esc(fmtNum(n))}${o.label ? `<small>${esc(o.label)}</small>` : ''}</span>`;
  return { svg, over };
}

/** A population of n dots; the first `hi` (or a Set of indices) highlighted. @opts n, hi, tone, hiTone, cols */
export function dotsSvg(rect, o = {}) {
  const n = o.n ?? 100, cols = o.cols ?? Math.ceil(Math.sqrt((n * rect.w) / rect.h)), rows = Math.ceil(n / cols);
  const cw = rect.w / cols, ch = rect.h / rows, r = Math.min(cw, ch) * 0.36, set = o.hi instanceof Set ? o.hi : null;
  const rest = lookOf().rest === 'paper' ? 'color-mix(in oklab, var(--sim-stroke) 55%, var(--sim-bg-surface))' : 'color-mix(in oklab, var(--sim-stroke) 70%, var(--sim-label))';
  let svg = '';
  for (let i = 0; i < n; i++) {
    const x = rect.x + (i % cols + 0.5) * cw, y = rect.y + (Math.floor(i / cols) + 0.5) * ch;
    const on = set ? set.has(i) : i < (o.hi ?? 0);
    svg += cushionCircle(+x.toFixed(1), +y.toFixed(1), r, on ? col(o.hiTone ?? 2) : (o.tone ? col(o.tone) : rest), { gloss: on });
  }
  return { svg, over: '' };
}

/** Tally marks in fives from (x, y). @opts size, tone */
export function tallySvg(x, y, n, o = {}) {
  const s = o.size ?? 28, c = col(o.tone ?? 'label'), gap = s * 0.22, w = Math.max(3, s * 0.13);
  let svg = '', cx = x;
  for (let g = 0; g * 5 < n; g++) {
    const m = Math.min(5, n - g * 5);
    for (let i = 0; i < Math.min(4, m); i++) svg += `<line x1="${cx + i * gap}" y1="${y}" x2="${cx + i * gap}" y2="${y + s}" ${stroke(c, w)}/>`;
    if (m === 5) svg += `<line x1="${cx - gap * 0.6}" y1="${y + s * 0.8}" x2="${cx + gap * 3.6}" y2="${y + s * 0.15}" ${stroke(c, w)}/>`;
    cx += gap * 4 + s * 0.45;
  }
  return { svg, over: '' };
}

/** Overlay CSS (the hemicycle count). Add it to the scene CSS. */
export const CHART_CSS = `
.ch-count { position: absolute; transform: translate(-50%, -50%); text-align: center; font-weight: 800; font-family: var(--sim-font-display, var(--sim-font)); line-height: 1; }
.ch-count small { display: block; margin-top: 4px; font: 700 var(--sim-text-sm)/1 var(--sim-font); color: var(--sim-label-muted); }
`;

/**
 * Where a value sits on a baseline bar scale, 0..1: linear over [min, max], or log (o.log, all values > 0).
 * Shared by barsHtml (o.base) and SimPanel setBaseBar.
 */
export function barPos(v, o) {
  const f = o.log ? (x) => Math.log(Math.max(1e-9, x)) : (x) => x;
  const a = f(o.min), b = f(o.max);
  return b > a ? Math.max(0, Math.min(1, (f(v) - a) / (b - a))) : 0;
}

// Bars from a baseline value (o.base, e.g. 1 for an odds or risk ratio): each bar runs from the base to its
// value, left (under) or right (over). Scale row: ticks (o.ticks values, the base bold), o.baseLabel under the
// second line centred under the base, o.ends [lo, hi] direction words at the two ends of that line.
function baseBarsHtml(rows, o) {
  const vals = rows.map((r) => r.v).filter(Number.isFinite);
  const sc = { log: !!o.log, min: o.min ?? Math.min(o.base, ...vals), max: o.max ?? Math.max(o.base, ...vals) };
  const fmt = o.fmt ?? ((v) => fmtNum(v, { dp: 2 }));
  const toneOf = (t) => (typeof t === 'string' ? `var(--sim-${t})` : `var(--sim-series-${t ?? 1})`);
  const b = barPos(o.base, sc);
  const geo = (v) => { const p = barPos(v, sc); return `--a:${Math.min(p, b).toFixed(4)};--w:${Math.abs(p - b).toFixed(4)}`; };
  const ticks = (o.ticks ?? [o.min ?? sc.min, o.base, o.max ?? sc.max]).map((t) => `<span class="${t === o.base ? 'is-base' : ''}" style="left:${(barPos(t, sc) * 100).toFixed(2)}%">${esc(o.tickFmt ? o.tickFmt(t) : fmt(t))}</span>`).join('');
  const ends = (o.ends ? `<span class="sim-bars__dir sim-bars__dir--lo">${esc(o.ends[0] ?? '')}</span><span class="sim-bars__dir sim-bars__dir--hi">${esc(o.ends[1] ?? '')}</span>` : '')
    + (o.baseLabel ? `<span class="sim-bars__dir sim-bars__dir--base">${esc(o.baseLabel)}</span>` : '');
  return `<div class="sim-bars sim-bars--base${o.rule ? ' sim-bars--rule' : ''}" role="list" data-bar-min="${sc.min}" data-bar-max="${sc.max}" data-bar-base="${o.base}"${sc.log ? ' data-bar-log' : ''} style="--b:${b.toFixed(4)}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>`
    + rows.map((r) => `<div class="sim-bars__row" role="listitem"${r.key ? ` data-bar="${esc(r.key)}"` : ''}><span class="sim-bars__label">${esc(r.label)}</span>`
      + `<span class="sim-bars__track"><span class="sim-bars__fill" style="${geo(r.v)};--tone:${toneOf(r.tone)}"></span><span class="sim-bars__zero" aria-hidden="true"></span></span>`
      + `<span class="sim-bars__value">${esc(r.text ?? fmt(r.v))}</span></div>`).join('')
    + `<div class="sim-bars__row sim-bars__scale" aria-hidden="true"><span></span><span class="sim-bars__axis">${ticks}${ends}</span><span></span></div></div>`;
}

/**
 * Plain DOM bars for a board: rows [{ label, v, tone 1..8 }]. @opts max, unit, fmt, rule
 * o.base (a number): bars from that baseline both ways (odds / risk ratios from 1); with min, max, log, ticks,
 * tickFmt, baseLabel (under the base tick: 'no link'), ends ['lower', 'higher'] (words either side of the base), label.
 */
export function barsHtml(rows, o = {}) {
  if (o.base != null) return baseBarsHtml(rows, o);
  const max = o.max ?? Math.max(...rows.map((r) => r.v), 1);
  const fmt = o.fmt ?? ((v) => fmtNum(v));
  // o.rule: the editorial variant (thin square tracks, muted labels; SimPanel.js setBar patches a row by r.key).
  // r.tone: a series number, or a token name ('annot', 'accent', 'label-muted').
  const toneOf = (t) => (typeof t === 'string' ? `var(--sim-${t})` : `var(--sim-series-${t ?? 1})`);
  return `<div class="sim-bars${o.rule ? ' sim-bars--rule' : ''}" role="list">${rows.map((r) => `<div class="sim-bars__row" role="listitem"${r.key ? ` data-bar="${esc(r.key)}"` : ''}><span class="sim-bars__label">${esc(r.label)}</span>`
    + `<span class="sim-bars__track"><span class="sim-bars__fill" style="--v:${Math.max(0, Math.min(1, r.v / max))};--tone:${toneOf(r.tone)}"></span></span>`
    + `<span class="sim-bars__value">${esc(r.text ?? fmt(r.v))}${o.unit && r.text == null ? ` ${esc(o.unit)}` : ''}</span></div>`).join('')}</div>`;
}
