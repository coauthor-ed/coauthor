/**
 * SimTableSpec - the render-agnostic half of a data table: cell rects, margins (totals), hit test.
 * No DOM, no canvas. SimTable.js draws it on an SVG stage. Build it for the current stage size on
 * every paint, so portrait gets its own layout; text is never scaled down.
 *
 *   const T = tableSpec({ rect, rows: ['yes', 'no'], cols: ['passed', 'failed'], cells: [[38, 12], [21, 29]],
 *                         rowTitle, colTitle, totals: true | 'rows' | 'cols' | false, totalLabel, fmt })
 *   T.nr, T.nc            data rows and columns;  T.hasRowTotals (a total column), T.hasColTotals (a total row)
 *   T.value(r, c)         a data cell, or a margin: c === T.nc is a row total, r === T.nr a column total, both the grand total
 *   T.text(r, c)          the value as printed (fmt; text cells as they are)
 *   T.cell(r, c)          { x, y, w, h, cx, cy }; r -1 is the header row, c -1 the header column
 *   T.band({ row } | { col })   one row or column across data and margin, header excluded
 *   T.cellAt(p)           { r, c, kind: 'cell' | 'total' | 'grand' | 'rowHead' | 'colHead' | 'corner' } or null
 *   T.key(r, c)           'r,c' (for Sets of hidden or highlighted cells)
 * Totals are summed from numeric cells, never typed. ASCII only.
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A table laid out in rect. @opts rect, rows, cols, cells, rowTitle, colTitle, totals, totalLabel, fmt, headW, rowH */
export function tableSpec(o = {}) {
  const rect = o.rect ?? { x: 0, y: 0, w: 600, h: 300 };
  const rows = o.rows ?? [], cols = o.cols ?? [], cells = o.cells ?? [];
  const nr = rows.length, nc = cols.length;
  if (!nr || !nc) throw new Error('tableSpec: rows and cols are required');
  for (let r = 0; r < nr; r++) if (!Array.isArray(cells[r]) || cells[r].length !== nc) throw new Error(`tableSpec: cells row ${r} needs ${nc} values`);
  const tot = o.totals ?? false;
  const hasRowTotals = tot === true || tot === 'rows', hasColTotals = tot === true || tot === 'cols';
  const totalLabel = o.totalLabel ?? 'Total';
  const fmt = o.fmt ?? ((v) => (typeof v === 'number' ? v.toLocaleString('en-IN') : String(v ?? '')));

  const sum = (vals) => vals.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  const value = (r, c) => {
    if (r < nr && c < nc) return cells[r][c];
    if (r < nr && c === nc) return sum(cells[r]);
    if (r === nr && c < nc) return sum(cells.map((row) => row[c]));
    if (r === nr && c === nc) return sum(cells.map((row) => sum(row)));
    return null;
  };

  const C = nc + (hasRowTotals ? 1 : 0), R = nr + (hasColTotals ? 1 : 0);
  const titleH = o.colTitle ? 34 : 0;
  const headW = o.headW ?? clamp(Math.round(rect.w * 0.3), 96, 220);
  const headH = 46;
  const cellW = (rect.w - headW) / C;
  const rowH = o.rowH ?? clamp((rect.h - titleH - headH) / R, 40, 72);
  const top = rect.y + titleH, left = rect.x;
  const h = titleH + headH + R * rowH;

  const cell = (r, c) => {
    const x = c < 0 ? left : left + headW + c * cellW, w = c < 0 ? headW : cellW;
    const y = r < 0 ? top : top + headH + r * rowH, hh = r < 0 ? headH : rowH;
    return { x, y, w, h: hh, cx: x + w / 2, cy: y + hh / 2 };
  };
  const band = (b) => {
    if (b.row != null) { const a = cell(b.row, 0), z = cell(b.row, C - 1); return { x: a.x, y: a.y, w: z.x + z.w - a.x, h: a.h }; }
    const a = cell(0, b.col), z = cell(R - 1, b.col);
    return { x: a.x, y: a.y, w: a.w, h: z.y + z.h - a.y };
  };
  const cellAt = (p) => {
    if (!p || p.x < left || p.x > left + headW + C * cellW || p.y < top || p.y > top + headH + R * rowH) return null;
    const c = p.x < left + headW ? -1 : Math.min(C - 1, Math.floor((p.x - left - headW) / cellW));
    const r = p.y < top + headH ? -1 : Math.min(R - 1, Math.floor((p.y - top - headH) / rowH));
    const kind = r < 0 && c < 0 ? 'corner' : r < 0 ? 'colHead' : c < 0 ? 'rowHead'
      : r === nr && c === nc ? 'grand' : r >= nr || c >= nc ? 'total' : 'cell';
    return { r, c, kind };
  };
  const text = (r, c) => fmt(value(r, c), r, c);

  return {
    rect: { x: rect.x, y: rect.y, w: rect.w, h }, nr, nc, R, C, rows, cols, hasRowTotals, hasColTotals,
    rowTitle: o.rowTitle ?? '', colTitle: o.colTitle ?? '', totalLabel, titleH, headW, headH, cellW, rowH,
    value, text, cell, band, cellAt, key: (r, c) => `${r},${c}`,
    rowLabel: (r) => (r < nr ? rows[r] : totalLabel), colLabel: (c) => (c < nc ? cols[c] : totalLabel),
  };
}
