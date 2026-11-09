/**
 * SimText - numbers, dates, money and small maths for canvas AND DOM scenes.
 *
 *   tx(v)                          string | { en } -> string
 *   fmtNum(n, { indian, dp })      9680000000 -> '9,68,00,00,000' (indian) | '9,680,000,000'
 *   fmtIndianWords(n, { dp })      '968 crore', '4.5 lakh', '12 thousand'
 *   fmtINR(n, { words, dp })       '\u20b930,000' | '\u20b94.5 lakh'
 *   fmtYear(y, { ce })             -2600 -> '2600 BCE'; 1950 -> '1950'; ce: 'auto' (CE below 1000) | true | false
 *   fmtSpan(a, b)                  -2600, 100 -> '2,699 years' (no year 0); 3e6 -> '3 million years'
 *   fracHtml(n, d) supHtml(b, e) subHtml(b, s) overbarHtml(pre, rep) rootHtml(x)   DOM (sim-frac etc. in SimUi)
 *   drawMath(ctx, c, parts, x, y, o) -> { w, h }   canvas: parts are strings and
 *       ['frac', n, d] ['sup', b, e] ['sub', b, s] ['root', x] ['bar', pre, rep]
 *   measureMath(ctx, c, parts, o) -> { w, h, asc, desc }
 *   wrapMath(ctx, c, parts, maxW, o) -> [[part, ...], ...]   break a run into lines at spaces; frac/sup/sub/root/bar stay whole
 *   drawMathWrapped(ctx, c, parts, x, y, maxW, o) -> { lines, w, h }   y is the TOP of the block; o: size, lineGap, align, col, maxLines
 *   drawMathCaption(ctx, c, parts, x, y, o) -> box   a captionBar that holds wrapped maths (the box sizes to the text)
 *   drawMathPill(ctx, c, parts, x, y, { bg, size }) -> box   a chip (SimLook pill look) holding maths
 * ASCII source: glyphs as \u escapes (rupee \u20b9, minus \u2212, times \u00d7).
 */
import { esc } from 'simulations/base/SimUi.js';
import { font, rr, darken, inkOn, MIN_PX } from './SimLook.js';

/** A learner-facing string: plain, or the content's { en: ... } form. */
export function tx(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.en ?? Object.values(v)[0] ?? '');
  return String(v);
}

const round = (n, dp) => { const k = 10 ** dp; return Math.round(n * k) / k; };

/** Grouped digits: Indian (2,2,3 from the right) or international (3s). dp: decimals kept. */
export function fmtNum(n, o = {}) {
  const neg = n < 0;
  const dp = o.dp ?? 0;
  const [int, frac] = Math.abs(round(n, dp)).toFixed(dp).split('.');
  let g;
  if (o.indian) {
    const last = int.slice(-3), rest = int.slice(0, -3);
    g = (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last;
  } else g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '\u2212' : '') + g + (frac ? '.' + frac : '');
}

/** Words the way Indian textbooks and news say big numbers: crore, lakh, thousand. */
export function fmtIndianWords(n, o = {}) {
  const a = Math.abs(n), dp = o.dp ?? 1, sign = n < 0 ? '\u2212' : '';
  const say = (v, w) => `${sign}${fmtNum(round(v, dp), { indian: true, dp: Number.isInteger(round(v, dp)) ? 0 : dp })} ${w}`;
  if (a >= 1e7) return say(a / 1e7, 'crore');
  if (a >= 1e5) return say(a / 1e5, 'lakh');
  if (a >= 1e3) return say(a / 1e3, 'thousand');
  return sign + fmtNum(a, { dp: Number.isInteger(a) ? 0 : dp });
}

/** Rupees: '\u20b930,000', or with words: '\u20b94.5 lakh'. */
export function fmtINR(n, o = {}) {
  if (o.words) return '\u20b9' + fmtIndianWords(n, o);
  return (n < 0 ? '\u2212' : '') + '\u20b9' + fmtNum(Math.abs(n), { indian: true, dp: o.dp ?? 0 });
}

/** A year: negative = BCE. ce: 'auto' adds CE below 1000, true always, false never. */
export function fmtYear(y, o = {}) {
  const ce = o.ce ?? 'auto';
  if (y < 0) return `${-y >= 10000 ? fmtNum(-y) : -y} BCE`;
  if (ce === true || (ce === 'auto' && y < 1000)) return `${y} CE`;
  return String(y);
}

/** Years from a to b (years as signed numbers; there is no year 0). */
export function fmtSpan(a, b) {
  let n = Math.abs(b - a);
  if ((a < 0) !== (b < 0) && a !== 0 && b !== 0) n -= 1;
  if (n >= 1e6) return `${round(n / 1e6, 1)} million years`;
  if (n >= 1e5 && n % 1000 === 0) return `${fmtNum(n / 1000)} thousand years`;
  return `${fmtNum(n)} ${n === 1 ? 'year' : 'years'}`;
}

// -- DOM (classes live in SIM_UI_CSS) ------------------------------------------------

export function fracHtml(n, d) {
  return `<span class="sim-frac" role="math" aria-label="${esc(n)} over ${esc(d)}"><span class="sim-frac__n">${esc(n)}</span><span class="sim-frac__d">${esc(d)}</span></span>`;
}
export function supHtml(b, e) { return `${esc(b)}<sup class="sim-sup">${esc(e)}</sup>`; }
export function subHtml(b, s) { return `${esc(b)}<sub class="sim-sub">${esc(s)}</sub>`; }
export function overbarHtml(pre, rep) { return `${esc(pre)}<span class="sim-overbar">${esc(rep)}</span>`; }
export function rootHtml(x) { return `<span class="sim-root" role="math" aria-label="square root of ${esc(x)}">\u221a<span class="sim-root__x">${esc(x)}</span></span>`; }

// -- Canvas ----------------------------------------------------------------------------

// Lay out parts left to right; draw when `paint` is true. Baseline at y.
function layout(ctx, c, parts, x, y, o, paint) {
  const size = o.size ?? 20, weight = o.weight ?? 800, col = o.col ?? c.label;
  const small = Math.max(MIN_PX, Math.round(size * 0.72));
  const set = (px) => { ctx.font = font(c, weight, px, o.display ?? true); };
  const text = (s, px, dx, dy) => {
    set(px);
    const w = ctx.measureText(String(s)).width;
    if (paint) ctx.fillText(String(s), x + dx, y + dy);
    return w;
  };
  let dx = 0, asc = size * 0.75, desc = size * 0.25;
  if (paint) { ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  for (const p of parts) {
    if (!Array.isArray(p)) { dx += text(p, size, dx, 0); continue; }
    const [k, a, b] = p;
    if (k === 'frac') {
      set(small);
      const wn = ctx.measureText(String(a)).width, wd = ctx.measureText(String(b)).width;
      const w = Math.max(wn, wd) + size * 0.3;
      const mid = -size * 0.3;
      if (paint) {
        ctx.fillText(String(a), x + dx + (w - wn) / 2, y + mid - size * 0.14);
        ctx.fillText(String(b), x + dx + (w - wd) / 2, y + mid + small * 0.84);
        ctx.fillRect(x + dx, y + mid - Math.max(1, size * 0.04), w, Math.max(2, size * 0.08));
      }
      asc = Math.max(asc, -mid + small * 0.9);
      desc = Math.max(desc, mid + small * 1.1);
      dx += w + size * 0.08;
    } else if (k === 'sup' || k === 'sub') {
      dx += text(a, size, dx, 0);
      const up = k === 'sup' ? -size * 0.42 : size * 0.22;
      dx += text(b, small, dx + 1, up) + 2;
      if (k === 'sup') asc = Math.max(asc, size * 0.42 + small * 0.75); else desc = Math.max(desc, size * 0.22 + small * 0.25);
    } else if (k === 'root') {
      const wr = text('\u221a', size, dx, 0);
      set(size);
      const wx = ctx.measureText(String(a)).width;
      if (paint) {
        ctx.fillText(String(a), x + dx + wr + 1, y);
        ctx.fillRect(x + dx + wr * 0.8, y - size * 0.86, wx + wr * 0.2 + 3, Math.max(1.5, size * 0.07));
      }
      asc = Math.max(asc, size * 0.9);
      dx += wr + wx + 4;
    } else if (k === 'bar') {
      dx += text(a, size, dx, 0);
      set(size);
      const wr = ctx.measureText(String(b)).width;
      if (paint) {
        ctx.fillText(String(b), x + dx, y);
        ctx.fillRect(x + dx, y - size * 0.86, wr, Math.max(1.5, size * 0.07));
      }
      asc = Math.max(asc, size * 0.9);
      dx += wr;
    }
  }
  return { w: dx, h: asc + desc, asc, desc };
}

/** Size of a math run (see drawMath). */
export function measureMath(ctx, c, parts, o = {}) {
  ctx.save();
  const m = layout(ctx, c, parts, 0, 0, o, false);
  ctx.restore();
  return m;
}

/**
 * Inline maths on canvas, baseline at y. align: 'left' | 'center' | 'right' on x.
 * @opts size, weight, col, align, display
 */
export function drawMath(ctx, c, parts, x, y, o = {}) {
  const m = measureMath(ctx, c, parts, o);
  const x0 = o.align === 'center' ? x - m.w / 2 : o.align === 'right' ? x - m.w : x;
  ctx.save();
  layout(ctx, c, parts, x0, y, o, true);
  ctx.restore();
  return m;
}

/**
 * A chip holding maths (a fraction reads as a fraction), centred on (x, y),
 * in the pill() look: lift, flat fill, readable ink. @opts bg, size, align
 */
export function drawMathPill(ctx, c, parts, x, y, o = {}) {
  const size = o.size ?? 18, bg = o.bg ?? c.accent;
  const m = measureMath(ctx, c, parts, { size });
  const w = m.w + 26, h = Math.max(size + 15, m.h + 12);
  const x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2, y0 = y - h / 2;
  rr(ctx, x0, y0 + 3.5, w, h, Math.min(h / 2, 16)); ctx.fillStyle = darken(bg, 0.38); ctx.fill();
  rr(ctx, x0, y0, w, h, Math.min(h / 2, 16)); ctx.fillStyle = bg; ctx.fill();
  drawMath(ctx, c, parts, x0 + w / 2, y0 + (h - m.h) / 2 + m.asc + 1, { size, align: 'center', col: inkOn(c, bg) });
  return { x0, y0, w, h };
}

/** Break a run of parts into lines no wider than maxW. Words break at spaces; array parts (frac, sup, ...) never split. */
export function wrapMath(ctx, c, parts, maxW, o = {}) {
  const atoms = [];
  for (const p of parts) {
    if (Array.isArray(p)) { atoms.push({ p, glue: true }); continue; }
    String(p).split(/( )/).forEach((w) => { if (w !== '') atoms.push({ p: w, glue: w !== ' ' }); });
  }
  // group atoms into words: consecutive non-space atoms stick together (so "x" + sup stays one unit)
  const words = [];
  let cur = [];
  for (const a of atoms) {
    if (a.p === ' ') { if (cur.length) words.push(cur); words.push([' ']); cur = []; } else cur.push(a.p);
  }
  if (cur.length) words.push(cur);
  const lines = [];
  let line = [], w = 0;
  const width = (ws) => measureMath(ctx, c, ws, o).w;
  for (const word of words) {
    const ww = width(word);
    if (word[0] === ' ' && !line.length) continue;
    if (line.length && w + ww > maxW && word[0] !== ' ') { while (line.length && line[line.length - 1][0] === ' ') line.pop(); lines.push(line); line = []; w = 0; }
    line.push(word); w += ww;
  }
  while (line.length && line[line.length - 1][0] === ' ') line.pop();
  if (line.length) lines.push(line);
  let out = lines.map((l) => l.flat());
  if (o.maxLines && out.length > o.maxLines) { out = out.slice(0, o.maxLines); out[o.maxLines - 1] = [...out[o.maxLines - 1], '...']; }
  return out;
}

/** Wrapped maths drawn from the top of the block at y. Returns { lines, w, h }. */
export function drawMathWrapped(ctx, c, parts, x, y, maxW, o = {}) {
  const lines = wrapMath(ctx, c, parts, maxW, o);
  const gap = o.lineGap ?? 6;
  let top = y, w = 0;
  for (const ln of lines) {
    const m = measureMath(ctx, c, ln, o);
    const bx = o.align === 'center' ? x + maxW / 2 : o.align === 'right' ? x + maxW : x;
    drawMath(ctx, c, ln, bx, top + m.asc, o);
    w = Math.max(w, m.w);
    top += m.h + gap;
  }
  return { lines, w, h: lines.length ? top - y - gap : 0 };
}

/** A caption strip holding wrapped maths, centred on x, top edge at y. o: size, maxW, padX, padY, bg, ink, edge, maxLines. Returns { x0, y0, w, h }. */
export function drawMathCaption(ctx, c, parts, x, y, o = {}) {
  const size = Math.max(MIN_PX, o.size ?? 15), maxW = o.maxW ?? 600, padX = o.padX ?? 14, padY = o.padY ?? 9;
  const mo = { size, weight: o.weight ?? 700, col: o.ink ?? c.label, display: false };
  const lines = wrapMath(ctx, c, parts, maxW - padX * 2, { ...mo, maxLines: o.maxLines ?? 3 });
  const gap = 6;
  const ms = lines.map((ln) => measureMath(ctx, c, ln, mo));
  const tw = Math.max(0, ...ms.map((m) => m.w));
  const w = tw + padX * 2, h = ms.reduce((s, m) => s + m.h, 0) + gap * Math.max(0, ms.length - 1) + padY * 2;
  const x0 = x - w / 2;
  rr(ctx, x0, y, w, h, 12); ctx.fillStyle = o.bg ?? c.bgSurface; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = o.edge ?? c.stroke; ctx.stroke();
  let top = y + padY;
  lines.forEach((ln, i) => { drawMath(ctx, c, ln, x, top + ms[i].asc, { ...mo, align: 'center' }); top += ms[i].h + gap; });
  return { x0, y0: y, w, h };
}
