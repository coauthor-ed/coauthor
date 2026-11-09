/**
 * SimTable - an interactive data table as SVG in the DOM (SimSvg stage / SvgScene): a header row
 * and column, optional margins (row and column totals, summed by the spec), cell highlight, row or
 * column emphasis, hidden cells for a predict beat and the learner's guess in their place. Rules
 * are print-like (a heavy top and bottom rule, a hairline under the header and before the margin);
 * cell text is HTML on the overlay, plus a visually hidden real table for screen readers.
 * The geometry lives in SimTableSpec.js (re-exported here): build it for the stage size each paint.
 *
 *   const T = tableSpec({ rect, rows, cols, cells, rowTitle, colTitle, totals, totalLabel, fmt });
 *   tableSvg(T, o) -> { svg, over }
 *     o.hi       [{ r, c, tone = 2, ring }]  cells to mark: a tint and a rim (ring: rim only, no tint)
 *     o.band     [{ row | col, tone = 1 }]   a row or column emphasised: tint across data and margin, head in the tone
 *     o.dim      true: text outside hi and band fades (the eye goes to what is marked)
 *     o.hidden   Set of T.key(r, c) | [{ r, c }]   cells shown as '?' (a margin may be hidden too)
 *     o.guess    { [key]: text }   the learner's entry in a hidden cell (dashed, in the guess tone)
 *     o.fresh    Set of keys        cells that pop in this paint (a reveal)
 *     o.caption  a short line under the table (source, 'illustrative data')
 *     o.label    aria label for the hidden table (default: colTitle by rowTitle)
 *   TABLE_CSS  overlay CSS; add it to the scene CSS.
 * Tones: series numbers 1..8 or a token name ('accent', 'good', 'bad', 'warning', 'gold').
 * Corners, rims, lips come from lookOf(): a lip under a marked cell in Quill, flat under plain.
 */
import { esc } from 'simulations/base/SimUi.js';
import { tone as T, fill, cushionRect, panelSvg } from './SimSvg.js';
import { lookOf } from './lookProfile.js';
import { tableSpec } from './SimTableSpec.js';

export { tableSpec };

const col = (t) => (typeof t === 'number' ? T(t) : `var(--sim-${t})`);
const ink = (t) => (typeof t === 'number' ? `var(--sim-series-${t}-ink, ${T(t)})` : `var(--sim-${t})`);
const f1 = (v) => (Math.round(v * 10) / 10).toString();

export const TABLE_CSS = `
.tb-t { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; line-height: 1.15; color: var(--sim-label);
  font: var(--look-text-weight, 800) var(--sim-text-md, 17px)/1.15 var(--sim-font); font-variant-numeric: tabular-nums; transition: opacity 0.25s ease; }
.tb-h { font-family: var(--sim-font-display, var(--sim-font)); }
.tb-l { transform: translate(0, -50%); text-align: left; }
.tb-m { color: var(--sim-label-muted); }
.tb-s { font-size: var(--sim-text-sm, 15px); color: var(--sim-label-muted); }
.tb-q { color: var(--sim-label-muted); font-size: 22px; }
.tb-g { font-style: italic; }
.tb-dim { opacity: 0.4; }
.tb-pop { animation: tb-pop 0.45s var(--look-spring) both; }
@keyframes tb-pop { from { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } }
.tb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .tb-pop { animation: none; } }
`;

/** The table as SVG + overlay text (see the header). */
export function tableSvg(Tb, o = {}) {
  const L = lookOf(), rim = L.rim;
  const hidden = o.hidden instanceof Set ? o.hidden : new Set((o.hidden ?? []).map((h) => Tb.key(h.r, h.c)));
  const guess = o.guess ?? {}, fresh = o.fresh ?? new Set();
  const hi = o.hi ?? [], bands = o.band ?? [];
  const marked = (r, c) => hi.some((h) => h.r === r && h.c === c) || bands.some((b) => (b.row != null ? b.row === r : b.col === c));
  const toneOfBand = (b) => (b ? b.tone ?? 1 : null);
  const x0 = Tb.rect.x, x1 = Tb.rect.x + Tb.headW + Tb.C * Tb.cellW;
  const yHead = Tb.cell(-1, 0).y, yBody = Tb.cell(0, 0).y, yEnd = Tb.cell(Tb.R - 1, 0).y + Tb.rowH;
  let svg = '', over = '';
  const hr = (y, w, xa = x0, xb = x1, c = 'var(--sim-label)') => `<rect x="${f1(xa)}" y="${f1(y - w / 2)}" width="${f1(xb - xa)}" height="${f1(w)}" ${fill(c)}/>`;
  const vr = (x, ya, yb, w) => `<rect x="${f1(x - w / 2)}" y="${f1(ya)}" width="${f1(w)}" height="${f1(yb - ya)}" ${fill('var(--sim-stroke)', 'opacity:0.7')}/>`;

  // The sheet: a card with the look's lip (Quill), the bare surface under a flat look; then the header band and margin tint.
  const sheet = { x: x0 - 10, y: yHead - Tb.titleH - 10, w: x1 - x0 + 20, h: yEnd - yHead + Tb.titleH + 20 + (o.caption ? 30 : 0) };
  svg += L.lip ? panelSvg(sheet, 12) : `<rect x="${f1(sheet.x)}" y="${f1(sheet.y)}" width="${f1(sheet.w)}" height="${f1(sheet.h)}" ${fill('var(--sim-bg-surface)')}/>`;
  svg += `<rect x="${f1(x0)}" y="${f1(yHead)}" width="${f1(x1 - x0)}" height="${f1(Tb.headH)}" ${fill('var(--sim-surface-raised)')}/>`;
  if (Tb.hasRowTotals) { const a = Tb.band({ col: Tb.nc }); svg += `<rect x="${f1(a.x)}" y="${f1(a.y)}" width="${f1(a.w)}" height="${f1(a.h)}" ${fill('color-mix(in oklab, var(--sim-surface-raised) 60%, transparent)')}/>`; }
  if (Tb.hasColTotals) { const a = Tb.band({ row: Tb.nr }); svg += `<rect x="${f1(a.x)}" y="${f1(a.y)}" width="${f1(a.w)}" height="${f1(a.h)}" ${fill('color-mix(in oklab, var(--sim-surface-raised) 60%, transparent)')}/>`; }

  // Row / column emphasis.
  for (const b of bands) {
    const a = Tb.band(b), c = col(b.tone ?? 1);
    svg += `<rect x="${f1(a.x)}" y="${f1(a.y)}" width="${f1(a.w)}" height="${f1(a.h)}" ${fill(`color-mix(in oklab, ${c} 14%, transparent)`)}/>`;
  }

  // Row rules (hairlines), then the print rules.
  for (let r = 1; r < Tb.R; r++) {
    const y = Tb.cell(r, 0).y;
    svg += Tb.hasColTotals && r === Tb.nr ? hr(y, 1.6 * rim) : hr(y, 1, x0, x1, 'color-mix(in oklab, var(--sim-stroke) 55%, transparent)');
  }
  svg += vr(x0 + Tb.headW, yHead, yEnd, 1.4 * rim);
  if (Tb.hasRowTotals) svg += vr(Tb.cell(0, Tb.nc).x, yHead, yEnd, 1.4 * rim);
  svg += hr(yHead, 3 * rim) + hr(yBody, 1.6 * rim) + hr(yEnd, 3 * rim);
  if (Tb.colTitle) {
    const a = Tb.cell(-1, 0), z = Tb.cell(-1, Tb.nc - 1);
    svg += hr(yHead - 6, 1.4 * rim, a.x + 8, z.x + z.w - 8, 'var(--sim-stroke)');
    over += `<span class="tb-t tb-h tb-s" style="left:${f1((a.x + z.x + z.w) / 2)}px;top:${f1(yHead - 22)}px">${esc(Tb.colTitle)}</span>`;
  }

  // Hidden cells and marked cells.
  const box = (r, c, pad = 5) => { const q = Tb.cell(r, c); return { x: q.x + pad, y: q.y + pad, w: q.w - 2 * pad, h: q.h - 2 * pad }; };
  for (const k of hidden) {
    const [r, c] = k.split(',').map(Number), b = box(r, c), g = guess[k] != null;
    const c2 = g ? col(o.guessTone ?? 'warning') : 'var(--sim-label-muted)';
    svg += `<rect x="${f1(b.x)}" y="${f1(b.y)}" width="${f1(b.w)}" height="${f1(b.h)}" rx="${f1(6 * L.radius)}" style="fill:color-mix(in oklab, var(--sim-bg-surface) 70%, transparent);stroke:${c2};stroke-width:${f1(2 * rim)};stroke-dasharray:6 5"/>`;
  }
  for (const h of hi) {
    const b = box(h.r, h.c), c = col(h.tone ?? 2);
    if (!h.ring) svg += cushionRect(+f1(b.x), +f1(b.y), +f1(b.w), +f1(b.h), 7, `color-mix(in oklab, ${c} 22%, var(--sim-bg-surface))`, { gloss: false, lift: 3 });
    svg += `<rect x="${f1(b.x)}" y="${f1(b.y)}" width="${f1(b.w)}" height="${f1(b.h)}" rx="${f1(7 * L.radius)}" style="fill:none;stroke:${c};stroke-width:${f1(3 * rim)}"/>`;
  }

  // Text.
  const dimOf = (r, c) => (o.dim && (hi.length || bands.length) && !marked(r, c) ? ' tb-dim' : '');
  const at = (q, cls, html, style = '') => `<span class="tb-t ${cls}" style="left:${f1(q.cx)}px;top:${f1(q.cy)}px;${style}">${html}</span>`;
  const corner = Tb.cell(-1, -1);
  if (Tb.rowTitle) over += `<span class="tb-t tb-h tb-s tb-l" style="left:${f1(corner.x + 12)}px;top:${f1(corner.cy)}px">${esc(Tb.rowTitle)}</span>`;
  for (let c = 0; c < Tb.C; c++) {
    const bt = toneOfBand(bands.find((b) => b.col === c)), q = Tb.cell(-1, c);
    over += at(q, `tb-h${c >= Tb.nc ? ' tb-m' : ''}`, esc(Tb.colLabel(c)), bt ? `color:${ink(bt)}` : '');
  }
  for (let r = 0; r < Tb.R; r++) {
    const bt = toneOfBand(bands.find((b) => b.row === r));
    const q = Tb.cell(r, -1);
    over += `<span class="tb-t tb-h tb-l${r >= Tb.nr ? ' tb-m' : ''}" style="left:${f1(q.x + 12)}px;top:${f1(q.cy)}px;${bt ? `color:${ink(bt)}` : ''}">${esc(Tb.rowLabel(r))}</span>`;
    for (let c = 0; c < Tb.C; c++) {
      const k = Tb.key(r, c), cq = Tb.cell(r, c), h = hi.find((x) => x.r === r && x.c === c);
      const pop = fresh.has(k) ? ' tb-pop' : '';
      if (hidden.has(k)) {
        over += guess[k] != null ? at(cq, `tb-g${pop}`, esc(String(guess[k])), `color:${ink(o.guessTone ?? 'warning')}`) : at(cq, 'tb-q', '?');
        continue;
      }
      over += at(cq, `${r >= Tb.nr || c >= Tb.nc ? 'tb-m' : ''}${dimOf(r, c)}${pop}`, esc(Tb.text(r, c)), h ? `color:${ink(h.tone ?? 2)}` : '');
    }
  }
  if (o.caption) over += `<span class="tb-t tb-s tb-l" style="left:${f1(x0)}px;top:${f1(yEnd + 22)}px">${esc(o.caption)}</span>`;

  // The same table for screen readers (hidden cells read as unknown).
  const cellText = (r, c) => (hidden.has(Tb.key(r, c)) ? (guess[Tb.key(r, c)] != null ? `guess ${guess[Tb.key(r, c)]}` : 'unknown') : Tb.text(r, c));
  over += `<table class="tb-sr"><caption>${esc(o.label ?? [Tb.colTitle, Tb.rowTitle].filter(Boolean).join(' by '))}</caption>`
    + `<tr><th>${esc(Tb.rowTitle)}</th>${Array.from({ length: Tb.C }, (_, c) => `<th scope="col">${esc(Tb.colLabel(c))}</th>`).join('')}</tr>`
    + Array.from({ length: Tb.R }, (_, r) => `<tr><th scope="row">${esc(Tb.rowLabel(r))}</th>${Array.from({ length: Tb.C }, (_, c) => `<td>${esc(cellText(r, c))}</td>`).join('')}</tr>`).join('')
    + '</table>';
  return { svg, over };
}
