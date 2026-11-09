/**
 * gauss - why S_n = n(a + l)/2. The n terms stand as columns (a staircase); a
 * copy flips over and slots on top, making an n x (a + l) rectangle: n pairs
 * of (a + l). Halve it and you have the sum. Exact: column k of the copy is
 * term n-1-k, so every column is a + l tall.
 *
 * params: { a, d, n }
 * state.student.values?: [studentSum]   state.status drives the stage:
 *   idle -> staircase only ("Show the trick" button plays the flip)
 *   partial / wrong -> rectangle formed      correct -> halved, sum shown
 */
import { el, at, chip, burst, fmt, isNum, near, clamp, createStage, normState, stateKey } from './_shared.js';

const CSS = `
.mwv-gauss .cushion { fill: var(--text-main); opacity: .08; }
.mwv-gauss .shine { fill: var(--mw-shine); }
.mwv-gauss .brace { fill: none; stroke: var(--text-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.mwv-gauss .outline { fill: none; stroke: var(--content-series-4); stroke-width: 2; stroke-dasharray: 5 4; }
.mwv-gauss .copy.dim { opacity: .22; }
.mwv-gauss .a-flip { transform-box: view-box; animation: mwv-flip 1300ms cubic-bezier(.55,0,.25,1) both; animation-delay: var(--d, 0ms); }
.mwv-gauss .a-dim { animation: mwv-dim 700ms ease both; animation-delay: var(--d, 0ms); }
.mwv-gauss .half { stroke: var(--accent-gold); stroke-width: 3; stroke-dasharray: 7 6; stroke-linecap: round; }
@keyframes mwv-flip {
  0% { transform: rotate(180deg); opacity: 0; }
  12% { transform: rotate(180deg); opacity: 1; }
  28% { transform: translateY(-14px) rotate(180deg); }
  100% { transform: none; }
}
@keyframes mwv-dim { from { opacity: 1; } }
`;

export function mount(hostEl, params = {}, ctx = {}) {
  const a = Number(params.a) || 0, d = Number(params.d) || 0;
  const n = clamp(Math.round(Number(params.n) || 1), 1, 60);
  const terms = Array.from({ length: n }, (_, k) => a + k * d);
  const l = terms[n - 1];
  const pair = a + l;
  const sum = (n * pair) / 2;
  const geometric = terms.every((t) => t >= 0) && pair > 0;

  let state = normState(null);
  let prev = { key: '', status: null };
  let localFlip = false;

  const stage = createStage(hostEl, ctx, { css: CSS, kind: 'gauss', label: 'Pairing the terms to find the sum', onResize: () => draw({}) });
  const btn = document.createElement('button');
  btn.className = 'mwv-btn';
  btn.type = 'button';
  stage.overlay.appendChild(btn);
  btn.addEventListener('click', () => {
    localFlip = true;
    draw({ flip: true, pairs: true });
  });

  function phase() {
    if (state.status === 'correct') return 2;
    if (state.status === 'partial' || state.status === 'wrong' || localFlip) return 1;
    return 0;
  }

  function draw(anim) {
    const W = stage.width;
    const narrow = W < 480;
    const H = clamp(Math.round(W * 0.58), 300, 390) + (geometric ? 40 : 0);
    const svg = stage.reset(H);
    const ph = phase();
    btn.textContent = ph === 0 ? 'Show the trick' : 'Play it again';
    btn.style.display = geometric ? '' : 'none';

    // header
    const listed = n <= 5 ? terms.map(fmt).join(' + ') : `${fmt(terms[0])} + ${fmt(terms[1])} + ... + ${fmt(l)}`;
    let label, fill = 'var(--bg-surface)', ink = 'var(--text-main)', icon = null;
    if (ph === 0) label = `Add ${listed}`;
    else if (ph === 1) label = `${n} pairs of (a + l) = ${n} \u00d7 ${fmt(pair)}`;
    else { label = `Halve it: ${n} \u00d7 ${fmt(pair)} \u00f7 2 = ${fmt(sum)}`; fill = 'var(--mw-gold-fill)'; ink = 'var(--mw-on-fill)'; icon = 'star'; }
    const fs = narrow ? 13 : 14;
    chip(svg, 14, 12, label, { fill, ink, icon, size: fs, cls: anim.header ? 'a-pop' : '' });
    const stu = (state.student.values || [])[0];
    if (isNum(stu) && state.status === 'wrong' && !near(stu, sum)) {
      chip(svg, 14, 12 + fs * 1.9 + 8, `yours: ${fmt(stu)}`, { size: 12, fill: 'var(--error-bg)', ink: 'var(--error-text)', cls: anim.header ? 'a-pop' : '', css: '--d:120ms' });
    }

    if (!geometric) { rows(svg, W, H, ph); return; }

    // geometry
    const top = 92, bot = 46 + (geometric ? 40 : 0);
    const rightRoom = narrow ? 78 : 112;
    const left = 18;
    const plotW = W - left - rightRoom;
    const plotH = H - top - bot;
    const colW = Math.min(plotW / n, 64);
    const u = plotH / pair;
    const rectW = colW * n;
    const x0 = left + (plotW - rectW) / 2;
    const yb = top + plotH;
    const yt = top;
    const gap = colW > 14 ? 2 : 0.6;

    el('ellipse', { cx: x0 + rectW / 2, cy: yb + 5, rx: rectW / 2 + 6, ry: 5, cls: 'cushion' }, svg);

    // the copy (drawn first so the flip passes behind the labels)
    if (ph >= 1) {
      const cg = el('g', {
        cls: 'copy' + (ph === 2 ? ' dim' : '') + (anim.flip ? ' a-flip' : '') + (anim.dim ? ' a-dim' : ''),
        css: `transform-origin:${x0 + rectW / 2}px ${(yt + yb) / 2}px;--d:${anim.dim ? 200 : 0}ms`,
      }, svg);
      for (let k = 0; k < n; k++) {
        const h = terms[n - 1 - k] * u;
        col(cg, x0 + k * colW + gap / 2, yt, colW - gap, h, 'var(--content-series-4)', 'down', terms[n - 1 - k]);
      }
      if (ph === 2) el('rect', { x: x0, y: yt, width: rectW, height: plotH, rx: 6, cls: 'outline' + (anim.dim ? ' a-fade' : '') }, svg);
    }
    if (ph === 0) {
      el('rect', { x: x0, y: yt, width: rectW, height: plotH, rx: 6, cls: 'outline', css: 'opacity:.45' }, svg);
      el('text', { x: x0 + rectW * 0.25, y: yt + plotH * 0.3, 'text-anchor': 'middle', text: '?', css: 'font-size:28px;font-weight: var(--fw-strong);fill:var(--content-series-4);opacity:.6' }, svg);
    }
    // the original staircase
    const og = el('g', null, svg);
    for (let k = 0; k < n; k++) {
      const h = terms[k] * u;
      const g = el('g', { cls: anim.rise ? 'a-rise' : (anim.pairs ? 'a-hop' : null), css: `--d:${k * (anim.pairs ? 90 : 70) + (anim.pairs ? 1300 : 0)}ms` }, og);
      col(g, x0 + k * colW + gap / 2, yb - h, colW - gap, h, 'var(--content-series-1)', 'up', terms[k]);
    }

    // braces + labels
    if (ph >= 1) {
      const bx = x0 + rectW + 10;
      const bc = anim.flip ? 'a-fade' : '';
      el('path', { d: braceV(bx, yt, yb, 9), cls: 'brace ' + bc, css: '--d:1100ms' }, svg);
      const lab = at(svg, bx + 16, (yt + yb) / 2, bc, '--d:1200ms');
      el('text', { x: 0, y: -6, text: 'a + l', cls: 't-soft', css: `font-size:${narrow ? 12 : 13}px;font-weight: var(--fw-strong)` }, lab);
      el('text', { x: 0, y: 14, text: `= ${fmt(pair)}`, cls: 't-num', css: `font-size:${narrow ? 15 : 17}px;font-weight: var(--fw-strong)` }, lab);
      el('path', { d: braceH(x0, x0 + rectW, yb + 12, 8), cls: 'brace ' + bc, css: '--d:1100ms' }, svg);
      el('text', { x: x0 + rectW / 2, y: yb + 38, 'text-anchor': 'middle', text: `${n} pairs`, cls: bc, css: `--d:1200ms;font-size:13px;font-weight: var(--fw-strong)` }, svg);
    } else {
      el('text', { x: x0 + rectW + 12, y: yb - terms[n - 1] * u + 14, text: `l = ${fmt(l)}`, cls: 't-soft', css: 'font-size:13px;font-weight: var(--fw-strong)' }, svg);
      el('text', { x: x0 + rectW / 2, y: yb + 26, 'text-anchor': 'middle', text: `${n} terms, a = ${fmt(a)}, d = ${fmt(d)}`, cls: 't-soft', css: 'font-size:13px;font-weight: var(--fw-strong)' }, svg);
    }
    if (ph === 2) {
      const ym = (yt + yb) / 2;
      el('line', { x1: x0 - 6, x2: x0 + rectW + 6, y1: ym, y2: ym, cls: 'half' + (anim.dim ? ' a-grow-x' : ''), css: '--d:500ms' }, svg);
      chip(svg, x0 + rectW / 2, ym - 15, `\u00f7 2`, { anchor: 'middle', size: 14, fill: 'var(--mw-gold-fill)', lip: 'var(--mw-gold-lip)', ink: 'var(--mw-on-fill)', cls: anim.dim ? 'a-pop' : '', css: '--d:800ms' });
      if (anim.dim) stage.later(() => burst(stage, svg, x0 + rectW / 2, top - 10, { spread: 90, count: 22 }), 900);
    }
    stage.say(ph === 2 ? `Sum is ${fmt(sum)}.` : ph === 1 ? `${n} pairs, each adding to ${fmt(pair)}.` : '');
  }

  function col(g, x, y, w, h, tone, dir, value) {
    if (h <= 0.3) return;
    const rr = Math.min(6, w / 4, h / 2);
    el('rect', { x, y, width: w, height: h, rx: rr, css: `fill:${tone}` }, g);
    const sw = Math.max(1.5, w * 0.2);
    el('rect', { x: x + w - sw, y, width: sw, height: h, rx: Math.min(rr, sw / 2), css: `fill:color-mix(in oklab, ${tone} 76%, var(--mw-deep))` }, g);
    if (w > 12 && h > 16) el('rect', { x: x + Math.max(3, w * 0.12), y: dir === 'up' ? y + 4 : y + 4, width: Math.max(2.5, w * 0.1), height: Math.min(h - 8, 34), rx: 2, cls: 'shine' }, g);
    if (w >= 22 && h >= 22) {
      el('text', { x: x + w * 0.45, y: dir === 'up' ? y + 17 : y + h - 7, 'text-anchor': 'middle', text: fmt(value),
        css: `font-size:${w >= 34 ? 13 : 11}px;font-weight: var(--fw-strong);fill:var(--on-primary)` }, g);
    }
  }

  // fallback when terms go negative: the pairing as two rows of numbers
  function rows(svg, W, H, ph) {
    const show = Math.min(n, 10);
    const cw = (W - 40) / show;
    const y1 = 120, y2 = 170, y3 = 230;
    for (let k = 0; k < show; k++) {
      const x = 20 + cw * (k + 0.5);
      el('text', { x, y: y1, 'text-anchor': 'middle', text: fmt(terms[k]), css: 'font-size:15px;font-weight: var(--fw-strong);fill:var(--content-series-1)' }, svg);
      if (ph >= 1) {
        el('text', { x, y: y2, 'text-anchor': 'middle', text: fmt(terms[n - 1 - k]), cls: 'a-fade', css: 'font-size:15px;font-weight: var(--fw-strong);fill:var(--content-series-4)' }, svg);
        el('text', { x, y: y3, 'text-anchor': 'middle', text: fmt(pair), css: 'font-size:15px;font-weight: var(--fw-strong)' }, svg);
      }
    }
    if (n > show) el('text', { x: W - 16, y: y1, 'text-anchor': 'end', text: '...', cls: 't-soft' }, svg);
  }

  function update(next) {
    state = normState(next);
    const key = stateKey(state);
    if (key === prev.key) return;
    const before = prev.status == null ? -1 : (prev.status === 'correct' ? 2 : (prev.status === 'idle' && !localFlip) ? 0 : 1);
    if (state.status === 'idle') localFlip = false;
    const now = phase();
    const anim = {
      rise: prev.status == null,
      header: state.status !== prev.status,
      flip: now >= 1 && before < 1,
      pairs: now === 1 && before < 1,
      dim: now === 2 && before !== 2,
    };
    prev = { key, status: state.status };
    draw(anim);
  }

  update(null);
  return { update, destroy: () => stage.destroy() };
}

function braceV(x, y1, y2, w) {
  const m = (y1 + y2) / 2;
  return `M${x} ${y1}Q${x + w} ${y1} ${x + w} ${y1 + w}L${x + w} ${m - w}Q${x + w} ${m} ${x + w * 1.8} ${m}Q${x + w} ${m} ${x + w} ${m + w}L${x + w} ${y2 - w}Q${x + w} ${y2} ${x} ${y2}`;
}
function braceH(x1, x2, y, h) {
  const m = (x1 + x2) / 2;
  return `M${x1} ${y}Q${x1} ${y + h} ${x1 + h} ${y + h}L${m - h} ${y + h}Q${m} ${y + h} ${m} ${y + h * 1.8}Q${m} ${y + h} ${m + h} ${y + h}L${x2 - h} ${y + h}Q${x2} ${y + h} ${x2} ${y}`;
}
