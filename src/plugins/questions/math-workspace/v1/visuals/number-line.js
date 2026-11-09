/**
 * number-line - a chunky number line. The expected set (when the plugin
 * passes it) is a faint band; the student's set is drawn on top as bold
 * pieces with open (hollow) or closed (filled) end circles and arrows for
 * infinity. Union pieces grow in one after another. When wrong, every stretch
 * or end point where the two sets differ is marked in red - computed exactly
 * from the breakpoints, not sampled.
 *
 * params: { min, max }
 * state.expected.interval?, state.student.interval?: interval latex such as
 *   "(-\\infty,-2)\\cup[3,\\infty)", "\\left[1,4\\right)", "\\emptyset", "\\mathbb{R}", "\\{3\\}"
 *   (an array of { lo, hi, loClosed, hiClosed } is accepted too)
 */
import { el, at, chip, burst, fmt, isNum, clamp, niceStep, createStage, normState, stateKey } from './_shared.js';

const LE = '\u2264', GE = '\u2265';

const CSS = `
.mwv-number-line .track-lip { fill: color-mix(in oklab, var(--border-hover) 78%, var(--mw-deep)); }
.mwv-number-line .track { fill: var(--border-hover); }
.mwv-number-line .tick { fill: var(--text-muted); }
.mwv-number-line .tick-t { fill: var(--text-muted); font-size: 12px; font-weight: var(--fw-medium); }
.mwv-number-line .zero { fill: var(--text-main); font-weight: var(--fw-strong); }
.mwv-number-line .band { fill: var(--success-text); opacity: .24; }
.mwv-number-line .band-end { fill: none; stroke: var(--success-text); stroke-width: 2; opacity: .45; }
.mwv-number-line .piece { fill: var(--primary-color); }
.mwv-number-line .piece-hi { fill: var(--mw-shine); }
.mwv-number-line .dot-closed { fill: var(--primary-color); stroke: var(--bg-surface); stroke-width: 2.5; }
.mwv-number-line .dot-open { fill: var(--bg-surface); stroke: var(--primary-color); stroke-width: 3.5; }
.mwv-number-line .end-t { fill: var(--primary-text, var(--primary-color)); font-size: 13.5px; font-weight: var(--fw-strong); }
.mwv-number-line .diff { fill: var(--error-text); opacity: .85; }
.mwv-number-line .diff-ring { fill: none; stroke: var(--error-text); stroke-width: 3; }
.mwv-number-line .win { fill: var(--accent-gold); opacity: .35; }
`;

export function mount(hostEl, params = {}, ctx = {}) {
  let state = normState(null);
  let prev = { key: '', status: null, stuKey: '' };
  const stage = createStage(hostEl, ctx, { css: CSS, kind: 'number-line', label: 'Number line showing the solution set', onResize: () => draw({}) });

  function draw(anim) {
    const W = stage.width;
    const narrow = W < 480;
    const exp = parseSet(state.expected.interval);
    const stu = parseSet(state.student.interval);
    const st = state.status;

    let lo = isNum(Number(params.min)) && params.min !== undefined ? Number(params.min) : -5;
    let hi = isNum(Number(params.max)) && params.max !== undefined ? Number(params.max) : 5;
    for (const p of [...(exp || []), ...(stu || [])]) for (const v of [p.lo, p.hi]) if (isNum(v)) { lo = Math.min(lo, Math.floor(v) - 1); hi = Math.max(hi, Math.ceil(v) + 1); }
    if (hi <= lo) hi = lo + 1;

    const showDiff = st === 'wrong' && exp && stu;
    const H = 196 + (showDiff ? 30 : 0);
    const svg = stage.reset(H);
    const L = 46, R = 46, yL = 118;
    const X = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
    const xEnd = (v) => (v === -Infinity ? L - 22 : v === Infinity ? W - R + 22 : X(v));

    // header
    let label = stu ? words(stu) : exp ? 'Your answer will appear on the line' : 'Number line';
    let fill = 'var(--bg-surface)', ink = 'var(--text-main)', icon = null;
    if (st === 'correct') { fill = 'var(--mw-gold-fill)'; ink = 'var(--mw-on-fill)'; icon = 'star'; }
    if (st === 'wrong') { fill = 'var(--error-bg)'; ink = 'var(--error-text)'; }
    chip(svg, 14, 12, label, { fill, ink, icon, size: narrow ? 13 : 14, cls: anim.header ? 'a-pop' : '' });
    if (W >= 520 && exp) {
      const g = el('g', null, svg);
      const xr = W - 16;
      el('rect', { x: xr - 168, y: 18, width: 22, height: 12, rx: 6, cls: 'band' }, g);
      el('text', { x: xr - 140, y: 28.5, text: 'answer', cls: 't-soft', css: 'font-size:12px' }, g);
      el('rect', { x: xr - 80, y: 20, width: 22, height: 8, rx: 4, cls: 'piece' }, g);
      el('text', { x: xr - 52, y: 28.5, text: 'yours', cls: 't-soft', css: 'font-size:12px' }, g);
    }

    // winning glow under the whole line
    if (st === 'correct') el('rect', { x: L - 30, y: yL - 22, width: W - L - R + 60, height: 44, rx: 22, cls: 'win' + (anim.win ? ' a-fade' : '') }, svg);

    // expected band
    if (exp) for (const p of exp) {
      const a = xEnd(p.lo), b = xEnd(p.hi);
      el('rect', { x: Math.min(a, b) - 13, y: yL - 13, width: Math.abs(b - a) + 26, height: 26, rx: 13, cls: 'band' }, svg);
    }

    // track + arrows
    el('rect', { x: L - 22, y: yL - 6 + 3, width: W - L - R + 44, height: 12, rx: 6, cls: 'track-lip' }, svg);
    el('rect', { x: L - 22, y: yL - 6, width: W - L - R + 44, height: 12, rx: 6, cls: 'track' }, svg);
    for (const s of [-1, 1]) {
      const ax = s < 0 ? L - 26 : W - R + 26;
      el('path', { d: `M${ax + s * 14} ${yL}L${ax - s * 2} ${yL - 11}Q${ax - s * 5} ${yL} ${ax - s * 2} ${yL + 11}Z`, cls: 'track' }, svg);
    }

    // ticks + labels (skip labels that collide with an end-point label)
    const ends = [];
    for (const p of stu || []) for (const v of [p.lo, p.hi]) if (isNum(v)) ends.push(v);
    const step = hi - lo <= (narrow ? 12 : 24) ? 1 : niceStep(hi - lo, narrow ? 8 : 14);
    const labelEvery = (X(lo + step) - X(lo)) < 18 ? Math.ceil(18 / (X(lo + step) - X(lo))) : 1;
    let k = 0;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step, k++) {
      const x = X(v);
      el('rect', { x: x - 1.5, y: yL - 13, width: 3, height: 26, rx: 1.5, cls: 'tick' }, svg);
      if (k % labelEvery) continue;
      if (ends.some((e) => Math.abs(X(e) - x) < 16)) continue;
      el('text', { x, y: yL + 34, 'text-anchor': 'middle', text: fmt(v), cls: 'tick-t' + (Math.abs(v) < 1e-9 ? ' zero' : '') }, svg);
    }

    // student pieces
    if (stu) stu.forEach((p, i) => {
      const a = xEnd(p.lo), b = xEnd(p.hi);
      const d = i * 260;
      const g = el('g', { cls: anim.grow ? 'a-grow-x' : (anim.win ? 'a-hop' : null), css: `--d:${d}ms` }, svg);
      if (b - a > 0.5) {
        el('rect', { x: a, y: yL - 7, width: b - a, height: 14, rx: 7, cls: 'piece' }, g);
        el('rect', { x: a + 8, y: yL - 4.5, width: Math.max(0, b - a - 16), height: 3, rx: 1.5, cls: 'piece-hi' }, g);
      }
      for (const sgn of [-1, 1]) {
        if ((sgn < 0 && p.lo !== -Infinity) || (sgn > 0 && p.hi !== Infinity)) continue;
        const ax = sgn < 0 ? L - 26 : W - R + 26;
        el('path', { d: `M${ax + sgn * 16} ${yL}L${ax - sgn * 3} ${yL - 13}Q${ax - sgn * 6} ${yL} ${ax - sgn * 3} ${yL + 13}Z`, cls: 'piece' }, g);
      }
      for (const [v, closed] of [[p.lo, p.loClosed], [p.hi, p.hiClosed]]) {
        if (!isNum(v)) continue;
        const eg = at(svg, X(v), yL, anim.grow ? 'a-pop' : null, `--d:${d + 300}ms`);
        el('circle', { cx: 0, cy: 0, r: 9, cls: closed ? 'dot-closed' : 'dot-open' }, eg);
        el('text', { x: 0, y: 34, 'text-anchor': 'middle', text: fmt(v), cls: 'end-t' }, eg);
      }
      if (anim.win) stage.later(() => burst(stage, svg, (Math.max(a, L) + Math.min(b, W - R)) / 2, yL - 10, { spread: 60, count: 14 }), d + 200);
    });

    // exact differences
    if (showDiff) {
      const pts = new Set();
      for (const p of [...exp, ...stu]) for (const v of [p.lo, p.hi]) if (isNum(v)) pts.add(v);
      const bps = [...pts].sort((x, y) => x - y);
      const cuts = [-Infinity, ...bps, Infinity];
      let n = 0;
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1];
        const mid = a === -Infinity ? (b === Infinity ? 0 : b - 1) : b === Infinity ? a + 1 : (a + b) / 2;
        if (inSet(exp, mid) !== inSet(stu, mid)) {
          const xa = a === -Infinity ? L - 22 : X(a), xb = b === Infinity ? W - R + 22 : X(b);
          el('rect', { x: xa + 3, y: yL + 46, width: Math.max(4, xb - xa - 6), height: 8, rx: 4, cls: 'diff' + (anim.grow ? ' a-grow-x' : ''), css: `--d:${600 + n * 120}ms` }, svg);
          n++;
        }
      }
      for (const v of bps) {
        if (inSet(exp, v) !== inSet(stu, v)) {
          el('circle', { cx: X(v), cy: yL, r: 15, cls: 'diff-ring' + (anim.grow ? ' a-pop' : ''), css: '--d:700ms' }, svg);
          el('rect', { x: X(v) - 4, y: yL + 46, width: 8, height: 8, rx: 4, cls: 'diff' }, svg);
          n++;
        }
      }
      el('text', { x: W / 2, y: yL + 76, 'text-anchor': 'middle', text: 'Red marks: where your set is different', css: 'font-size:12.5px;font-weight: var(--fw-strong);fill:var(--error-text)' }, svg);
    }
    stage.say(stu ? words(stu) : '');
  }

  function update(next) {
    state = normState(next);
    const key = stateKey(state);
    if (key === prev.key) return;
    const stuKey = stateKey(state.student.interval || null);
    const anim = {
      header: state.status !== prev.status,
      grow: stuKey !== prev.stuKey || (state.status === 'wrong' && prev.status !== 'wrong'),
      win: state.status === 'correct' && prev.status !== 'correct',
    };
    if (anim.win) anim.grow = stuKey !== prev.stuKey && prev.status == null;
    prev = { key, status: state.status, stuKey };
    draw(anim);
  }

  update(null);
  return { update, destroy: () => stage.destroy() };
}

/* ------------------------------------------------------------------ */
/* Interval parsing (plain, no compute-engine)                          */
/* ------------------------------------------------------------------ */

function inSet(set, v) {
  return set.some((p) => (v > p.lo && v < p.hi) || (v === p.lo && p.loClosed) || (v === p.hi && p.hiClosed));
}

export function parseSet(src) {
  if (src == null || src === '') return null;
  if (Array.isArray(src)) {
    return src.map((p) => ({ lo: num(p.lo), hi: num(p.hi), loClosed: !!p.loClosed, hiClosed: !!p.hiClosed }))
      .filter((p) => !Number.isNaN(p.lo) && !Number.isNaN(p.hi));
  }
  let s = String(src).replace(/\\left|\\right|\\[,;:!]|\\displaystyle|\s+/g, '');
  s = s.replace(/^x\\in/, '');
  if (/^(\\emptyset|\\varnothing|\\\{\\\}|\{\})$/.test(s)) return [];
  if (/^(\\mathbb\{R\}|\\R|\\mathbb R|\(-\\infty,\\infty\))$/.test(s)) return [{ lo: -Infinity, hi: Infinity, loClosed: false, hiClosed: false }];
  const out = [];
  for (const part of s.split(/\\cup|\u222a/)) {
    const pt = part.match(/^\\\{(.+)\\\}$/);
    if (pt) { for (const q of splitTop(pt[1])) { const v = num(q); if (isNum(v)) out.push({ lo: v, hi: v, loClosed: true, hiClosed: true }); } continue; }
    const m = part.match(/^([[(\]])(.*)([)\][])$/);
    if (!m) return null;
    const bits = splitTop(m[2]);
    if (bits.length !== 2) return null;
    const lo = num(bits[0]), hi = num(bits[1]);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
    out.push({ lo, hi, loClosed: m[1] === '[' && isNum(lo), hiClosed: m[3] === ']' && isNum(hi) });
  }
  return out.sort((p, q) => p.lo - q.lo);
}

function splitTop(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '{' || ch === '(') depth++;
    if (ch === '}' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Number from a small latex fragment: integers, decimals, \frac, \sqrt, +-*, \infty. */
function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (/^[+]?\\infty$|^\+?inf(inity)?$/i.test(s)) return Infinity;
  if (/^-\\infty$|^-inf(inity)?$/i.test(s)) return -Infinity;
  s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
    .replace(/\\sqrt\{([^{}]*)\}/g, 'S($1)').replace(/\\sqrt(\d+)/g, 'S($1)')
    .replace(/\\cdot|\\times/g, '*').replace(/[{}]/g, '');
  let i = 0;
  const peek = () => s[i];
  const expr = () => { let a = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const b = term(); a = op === '+' ? a + b : a - b; } return a; };
  const term = () => { let a = unary(); while (peek() === '*' || peek() === '/' || peek() === '(' || peek() === 'S') { const op = peek() === '*' || peek() === '/' ? s[i++] : '*'; const b = unary(); a = op === '*' ? a * b : a / b; } return a; };
  const unary = () => { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return atom(); };
  const atom = () => {
    if (peek() === '(') { i++; const a = expr(); if (peek() === ')') i++; return a; }
    if (peek() === 'S') { i++; return Math.sqrt(atom()); }
    const m = s.slice(i).match(/^\d*\.?\d+/);
    if (!m) throw new Error('bad');
    i += m[0].length;
    return Number(m[0]);
  };
  try { const r = expr(); return i === s.length && Number.isFinite(r) ? r : NaN; } catch { return NaN; }
}

/** The set in words: "x < -2 or x >= 3". */
function words(set) {
  if (!set.length) return 'No numbers at all (empty set)';
  return set.map((p) => {
    const a = p.lo, b = p.hi;
    if (a === -Infinity && b === Infinity) return 'every number';
    if (a === b) return `x = ${fmt(a)}`;
    if (a === -Infinity) return `x ${p.hiClosed ? LE : '<'} ${fmt(b)}`;
    if (b === Infinity) return `x ${p.loClosed ? GE : '>'} ${fmt(a)}`;
    return `${fmt(a)} ${p.loClosed ? LE : '<'} x ${p.hiClosed ? LE : '<'} ${fmt(b)}`;
  }).join('  or  ');
}
