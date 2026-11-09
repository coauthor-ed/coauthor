/**
 * SimChartSpec - the render-agnostic half of the chart frame: plot rect, scale
 * maps (px, py, vx, vy, band) and tick lists. No DOM, no canvas. Drawn by
 * SimChart.js (SVG in the DOM stage) and SimChartCanvas.js (2D canvas).
 * timeAxis (dates on x, day or week bins), dayNumber, dayText: see timeAxis below.
 */
export function niceTicks(min, max, want = 5) {
  const span = max - min, raw = span / want, k = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * k).find((s) => span / s <= want + 0.5) ?? 10 * k;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Plot area inside rect, leaving room for tick labels and titles. @opts rect, x, y */
export function chartFrame(o = {}) {
  const r = o.rect ?? { x: 0, y: 0, w: 648, h: 360 };
  const X = o.x ?? {}, Y = o.y ?? {};
  if (!X.cats && !(X.max > X.min)) throw new Error('chartFrame: x needs min < max, or cats');
  if (!(Y.max > Y.min)) throw new Error('chartFrame: y needs min < max');
  const left = (Y.label ? 30 : 8) + 46, bottom = (X.label ? 30 : 6) + 32;
  const right = o.rightPad ?? 18;   // room for a right axis: pass rightPad (about 56)
  const plot = { x: r.x + left, y: r.y + 18, w: r.w - left - right, h: r.h - bottom - 18 };
  const n = X.cats?.length ?? 0;
  return {
    rect: r, plot, x: X, y: Y,
    px: (v) => (n ? plot.x + (v + 0.5) * (plot.w / n) : plot.x + ((v - X.min) / (X.max - X.min)) * plot.w),
    py: (v) => plot.y + plot.h - ((v - Y.min) / (Y.max - Y.min)) * plot.h,
    vx: (x) => X.min + ((x - plot.x) / plot.w) * (X.max - X.min),
    vy: (y) => Y.min + ((plot.y + plot.h - y) / plot.h) * (Y.max - Y.min),
    band: (i) => ({ x: plot.x + i * (plot.w / n), w: plot.w / n }),
    xticks: n ? [] : X.ticks ?? niceTicks(X.min, X.max, Math.max(3, Math.floor(plot.w / 90))),
    yticks: Y.ticks ?? niceTicks(Y.min, Y.max),
  };
}

// -- Time axis: dates on x ---------------------------------------------------------------
// x is a day number (whole days since 1970-01-01, by the calendar date, never the clock or
// time zone), so chartFrame, histogramSvg, traceSvg and the canvas twins need nothing new.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

/** A date as a day number: 'YYYY-MM-DD', a Date (its local calendar date) or a day number (returned as is). */
export function dayNumber(d) {
  if (typeof d === 'number') return Math.floor(d);
  if (d instanceof Date) return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(d));
  if (!m) throw new Error(`dayNumber: "${d}" is not YYYY-MM-DD`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

/** A day number as short, locale-free text: '3 Mar'; { year: true } '3 Mar 2024'; { month: true } 'Mar 2024'. */
export function dayText(n, o = {}) {
  const t = new Date(Math.floor(n) * DAY_MS), y = t.getUTCFullYear(), mo = MON[t.getUTCMonth()];
  if (o.month) return `${mo} ${y}`;
  return `${t.getUTCDate()} ${mo}${o.year ? ` ${y}` : ''}`;
}

const firstOfMonth = (n) => { const t = new Date(n * DAY_MS); return Math.round(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) / DAY_MS); };
const addMonths = (n, k) => { const t = new Date(n * DAY_MS); return Math.round(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + k, 1) / DAY_MS); };

/**
 * An x axis of dates, binned by day or week. Spread it into chartFrame's x:
 *   const T = timeAxis({ from: '2024-03-01', to: '2024-04-15', bin: 'week' });
 *   const f = chartFrame({ rect, x: { ...T, label: 'Week starting' }, y: { min: 0, max: 40, label: 'Count' } });
 *   histogramSvg(f, T.bins(dates)); traceSvg(f, rows.map((r) => ({ x: T.x(r.date), y: r.v })));
 * @opts from, to (dates as dayNumber takes), bin 'day' | 'week', weekStart (0 Sun .. 6 Sat, default 1 Mon), want (ticks, default 6)
 * Returns { min, max, ticks, fmt, bin, x(date), binOf(date), bins(dates, { tone }) }. x(date) puts a point mid-bin,
 * over its bar. Day ticks sit mid-day (under the day's bar), week ticks on the week's first day (the bar's left edge).
 * Ticks step 1, 2, 7 or 14 days (2, 4 weeks), else 1, 2, 3, 6 or 12 months on the 1st, the year on the first tick
 * and on January. Label the axis with what a tick means ('Date', 'Week starting').
 */
export function timeAxis(o = {}) {
  const span = o.bin === 'week' ? 7 : 1;
  const ws = o.weekStart ?? 1;
  // 1970-01-01 was a Thursday (weekday 4).
  const start = (n) => (span === 7 ? n - ((((n + 4 - ws) % 7) + 7) % 7) : n);
  const lo = start(dayNumber(o.from)), hi = start(dayNumber(o.to)) + span;
  if (!(hi > lo)) throw new Error('timeAxis: from must be on or before to');
  const want = o.want ?? 6, days = hi - lo;
  let ticks = [], fmt;
  const step = (span === 7 ? [7, 14, 28] : [1, 2, 7, 14]).find((s) => days / s <= want + 0.5);
  if (step) {
    // Day bins: a tick mid-day, under its bar; week bins: on each week's start, under its left edge (no tick at the
    // axis end: no week starts there).
    for (let v = lo; v < hi; v += step) ticks.push(span === 1 ? v + 0.5 : v);
    const y0 = new Date(lo * DAY_MS).getUTCFullYear();
    fmt = (v) => dayText(v, { year: new Date(Math.floor(v) * DAY_MS).getUTCFullYear() !== y0 && v === ticks.find((t) => new Date(t * DAY_MS).getUTCFullYear() !== y0) });
  } else {
    const ms = [1, 2, 3, 6, 12].find((k) => days / (30.44 * k) <= want + 0.5) ?? 12;
    let v = firstOfMonth(lo);
    if (v < lo) v = addMonths(v, 1);
    while (new Date(v * DAY_MS).getUTCMonth() % ms) v = addMonths(v, 1);
    for (; v <= hi; v = addMonths(v, ms)) ticks.push(v);
    fmt = (v) => (v === ticks[0] || new Date(Math.floor(v) * DAY_MS).getUTCMonth() === 0 ? dayText(v, { month: true }) : MON[new Date(Math.floor(v) * DAY_MS).getUTCMonth()]);
  }
  const binOf = (d) => Math.floor((start(dayNumber(d)) - lo) / span);
  return {
    min: lo, max: hi, ticks, fmt, bin: span === 7 ? 'week' : 'day', label: o.label,
    x: (d) => start(dayNumber(d)) + span / 2,
    binOf,
    /** Counts per bin, empty bins included: [{ x0, x1, n, tone }]; dates outside the axis are left out. */
    bins: (dates, b = {}) => {
      const out = Array.from({ length: days / span }, (_, i) => ({ x0: lo + i * span, x1: lo + (i + 1) * span, n: 0, ...(b.tone != null ? { tone: b.tone } : {}) }));
      for (const d of dates) { const i = binOf(d); if (i >= 0 && i < out.length) out[i].n++; }
      return out;
    },
  };
}
