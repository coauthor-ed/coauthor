/**
 * parabola - y = ax^2 + bx + c on squared paper, with its turning point and
 * line of symmetry. The curve's x-intercepts carry empty target rings. The
 * student's roots drop in as pins: a right one snaps into its ring (burst +
 * tick); a wrong one hovers above the axis, with a dashed gap down to where
 * the curve really is at that x ("y = 3.75, not 0").
 *
 * params: { a, b, c }
 * state.expected.set?: number[] (roots; computed from a, b, c when absent)
 * state.student.set?: number[]
 */
import { el, at, chip, burst, ring, drawIcon, fmt, isNum, near, clamp, niceStep, createStage, normState, stateKey } from './_shared.js';

const CSS = `
.mwv-parabola .grid { stroke: var(--text-main); stroke-width: 1; opacity: .07; }
.mwv-parabola .ax { stroke: var(--text-muted); stroke-width: 2; stroke-linecap: round; }
.mwv-parabola .tick { fill: var(--text-muted); font-size: 11px; font-weight: var(--fw-medium); }
.mwv-parabola .curve-under { fill: none; stroke: var(--content-series-5); stroke-width: 12; opacity: .14; stroke-linecap: round; }
.mwv-parabola .curve { fill: none; stroke: var(--content-series-5); stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; }
.mwv-parabola .sym { stroke: var(--content-series-5); stroke-width: 2; stroke-dasharray: 4 6; opacity: .6; }
.mwv-parabola .vx { fill: var(--content-series-5); stroke: var(--bg-surface); stroke-width: 3; }
.mwv-parabola .target { fill: none; stroke: var(--text-muted); stroke-width: 2.5; stroke-dasharray: 4 3.5; }
.mwv-parabola .target.hit { stroke: var(--success-text); stroke-dasharray: none; }
.mwv-parabola .pin-good { fill: var(--mw-ok-fill); stroke: var(--bg-surface); stroke-width: 2.5; }
.mwv-parabola .pin-bad { fill: var(--mw-bad-fill); stroke: var(--bg-surface); stroke-width: 2.5; }
.mwv-parabola .pin-shadow { fill: var(--text-main); opacity: .14; }
.mwv-parabola .gap { stroke: var(--error-text); stroke-width: 2; stroke-dasharray: 3 4; }
.mwv-parabola .on-curve { fill: var(--bg-surface); stroke: var(--error-text); stroke-width: 2.5; }
.mwv-parabola .a-thick { animation: mwv-thick 900ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
@keyframes mwv-thick { 35% { stroke-width: 9px; } }
`;

let uid = 0;

export function mount(hostEl, params = {}, ctx = {}) {
  const A = Number(params.a) || 0, B = Number(params.b) || 0, C = Number(params.c) || 0;
  const f = (x) => A * x * x + B * x + C;
  const quad = A !== 0;
  const xv = quad ? -B / (2 * A) : 0;
  const yv = f(xv);
  const roots = (() => {
    if (!quad) return B !== 0 ? [-C / B] : [];
    const D = B * B - 4 * A * C;
    if (D < -1e-12) return [];
    if (Math.abs(D) <= 1e-12) return [xv];
    const s = Math.sqrt(D);
    return [(-B - s) / (2 * A), (-B + s) / (2 * A)].sort((p, q) => p - q);
  })();
  const clipId = 'mwv-pc-' + (++uid);

  let state = normState(null);
  let prev = { key: '', status: null, stuKey: '' };
  const stage = createStage(hostEl, ctx, { css: CSS, kind: 'parabola', label: 'Graph of the quadratic', onResize: () => draw({}) });

  function draw(anim) {
    const W = stage.width;
    const narrow = W < 480;
    const H = clamp(Math.round(W * 0.56), 290, 380);
    const svg = stage.reset(H);
    const exp = Array.isArray(state.expected.set) && state.expected.set.some(isNum) ? state.expected.set.filter(isNum) : roots;
    const stu = (Array.isArray(state.student.set) ? state.student.set : []).filter(isNum);
    const st = state.status;

    // view window
    const pts = [xv, ...exp, ...stu];
    let half = Math.max(...pts.map((p) => Math.abs(p - xv)), 0.5) * 1.45;
    half = Math.max(half, 2.5);
    const x0 = xv - half, x1 = xv + half;
    let ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i <= 80; i++) { const y = f(x0 + ((x1 - x0) * i) / 80); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0);
    // keep the interesting part (vertex + axis) generous, cap runaway arms
    const core = Math.max(Math.abs(yv), 1) * 2.6;
    if (A > 0) ymax = Math.min(ymax, Math.max(core, 2)); else if (A < 0) ymin = Math.max(ymin, -Math.max(core, 2));
    for (const s of stu) { const fy = f(s); ymin = Math.min(ymin, fy); ymax = Math.max(ymax, fy); }
    const pad = (ymax - ymin) * 0.12 || 1;
    ymin -= pad; ymax += pad;
    const L = 14, R = 14, T = 58, Bm = quad ? 58 : 30;
    const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
    const Y = (y) => T + ((ymax - y) / (ymax - ymin)) * (H - T - Bm);

    // header
    let label = `y = ${poly()}`, fill = 'var(--bg-surface)', ink = 'var(--text-main)', icon = null;
    const hits = stu.filter((s) => exp.some((e) => near(s, e))).length;
    if (st === 'correct') { label = exp.length ? `Roots: x = ${exp.map(fmt).join(' and x = ')}` : 'No real roots'; fill = 'var(--mw-gold-fill)'; ink = 'var(--mw-on-fill)'; icon = 'star'; }
    else if (stu.length) { label = `${hits} of ${exp.length} roots on target`; if (st === 'wrong') { fill = 'var(--error-bg)'; ink = 'var(--error-text)'; } }
    chip(svg, 14, 12, label, { fill, ink, icon, size: narrow ? 13 : 14, cls: anim.header ? 'a-pop' : '' });

    // grid
    const gx = niceStep(x1 - x0, narrow ? 5 : 9), gy = niceStep(ymax - ymin, 5);
    const grid = el('g', null, svg);
    for (let x = Math.ceil(x0 / gx) * gx; x <= x1; x += gx) {
      el('line', { x1: X(x), x2: X(x), y1: T - 6, y2: H - Bm, cls: 'grid' }, grid);
      const busy = [...exp, ...stu].some((v) => Math.abs(X(v) - X(x)) < 16);
      if (!busy && Math.abs(x) > 1e-9 && Y(0) > T && Y(0) < H - Bm) el('text', { x: X(x), y: Math.min(Y(0) + 16, H - Bm + 14), 'text-anchor': 'middle', text: fmt(x), cls: 'tick' }, grid);
    }
    for (let y = Math.ceil(ymin / gy) * gy; y <= ymax; y += gy) {
      el('line', { x1: L, x2: W - R, y1: Y(y), y2: Y(y), cls: 'grid' }, grid);
      if (Math.abs(y) > 1e-9 && X(0) > L && X(0) < W - R) el('text', { x: X(0) - 6, y: Y(y) + 4, 'text-anchor': 'end', text: fmt(y), cls: 'tick' }, grid);
    }
    if (Y(0) >= T - 6 && Y(0) <= H - Bm) el('line', { x1: L - 4, x2: W - R + 4, y1: Y(0), y2: Y(0), cls: 'ax' }, svg);
    if (X(0) >= L && X(0) <= W - R) el('line', { x1: X(0), x2: X(0), y1: T - 6, y2: H - Bm, cls: 'ax' }, svg);

    // curve
    const defs = el('defs', null, svg);
    const cp = el('clipPath', { id: clipId }, defs);
    el('rect', { x: 0, y: T - 8, width: W, height: H - T - Bm + 8 }, cp);
    let d = '';
    const N = 140;
    for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + clamp(Y(f(x)), -2000, 4000).toFixed(1); }
    const cg = el('g', { 'clip-path': `url(#${clipId})` }, svg);
    if (quad) el('line', { x1: X(xv), x2: X(xv), y1: T - 6, y2: H - Bm, cls: 'sym' + (anim.first ? ' a-fade' : ''), css: '--d:700ms' }, cg);
    el('path', { d, cls: 'curve-under' }, cg);
    el('path', { d, cls: 'curve' + (anim.first ? ' a-draw' : anim.win ? ' a-thick' : ''), css: '--len:3000' }, cg);

    // vertex
    if (quad && Y(yv) > T - 4 && Y(yv) < H - Bm) {
      const vg = at(svg, X(xv), Y(yv), anim.first ? 'a-pop' : null, '--d:800ms');
      el('circle', { cx: 0, cy: 0, r: 7, cls: 'vx' }, vg);
    }
    if (quad) {
      // legend row: turning point + line of symmetry
      const lg = at(svg, 16, H - 22, anim.first ? 'a-fade' : null, '--d:900ms');
      el('circle', { cx: 6, cy: 0, r: 6, cls: 'vx' }, lg);
      el('text', { x: 18, y: 4.5, text: `turning point (${fmt(xv)}, ${fmt(yv)})`, css: 'font-size:12.5px;font-weight: var(--fw-strong)' }, lg);
      if (W >= 440) {
        el('line', { x1: 220, x2: 240, y1: 0, y2: 0, cls: 'sym', css: 'opacity:1' }, lg);
        el('text', { x: 248, y: 4.5, text: `mirror line x = ${fmt(xv)}`, cls: 't-soft', css: 'font-size:12.5px;font-weight: var(--fw-strong)' }, lg);
      }
    }

    // target rings at the real x-intercepts
    const y0 = Y(0);
    for (const e of exp) {
      const hit = stu.some((s) => near(s, e));
      el('circle', { cx: X(e), cy: y0, r: 11, cls: 'target' + (hit ? ' hit' : '') }, svg);
      if (st === 'correct') chip(svg, X(e), y0 + 14, `x = ${fmt(e)}`, { anchor: 'middle', size: 12, fill: 'var(--success-bg)', ink: 'var(--success-text)', cls: anim.win ? 'a-pop' : '' });
    }

    // student pins
    let firstMiss = true;
    stu.forEach((s, i) => {
      const ok = exp.some((e) => near(s, e));
      const delay = i * 160;
      const xs = X(clamp(s, x0, x1));
      if (ok) {
        const g = at(svg, xs, y0, anim.drop ? 'a-drop' : null, `--d:${delay}ms;--from:${-(y0 + 30)}px`);
        pin(g, 'pin-good', 'tick');
        if (anim.drop) stage.later(() => ring(stage, svg, xs, y0, 10, 'var(--success-text)'), delay + 560);
        if (anim.win || (anim.drop && st === 'correct')) stage.later(() => burst(stage, svg, xs, y0, { spread: 60, count: 14 }), delay + 650);
      } else {
        const fy = f(s);
        const hover = y0 - 50;
        const yc = clamp(Y(fy), T - 6, H - Bm);
        el('line', { x1: xs, x2: xs, y1: hover + 12, y2: yc, cls: 'gap' + (anim.drop ? ' a-fade' : ''), css: `--d:${delay + 500}ms` }, svg);
        el('circle', { cx: xs, cy: yc, r: 5, cls: 'on-curve' + (anim.drop ? ' a-pop' : ''), css: `--d:${delay + 600}ms` }, svg);
        const g = at(svg, xs, hover, anim.drop ? 'a-drop' : null, `--d:${delay}ms;--from:${-(hover + 30)}px`);
        const bob = el('g', { cls: 'bob', css: `--d:${i * 300}ms` }, g);
        pin(bob, 'pin-bad', 'cross');
        if (firstMiss) {
          firstMiss = false;
          const right = xs < W * 0.55;
          const txt = `at x = ${fmt(s)}, y = ${fmt(fy)}, not 0`;
          chip(svg, xs + (right ? 16 : -16), hover - 28, txt, { anchor: right ? 'start' : 'end', size: 12, fill: 'var(--error-bg)', ink: 'var(--error-text)', cls: anim.drop ? 'a-pop' : '', css: `--d:${delay + 700}ms` });
        }
      }
    });
    if (!exp.length && st === 'correct') {
      chip(svg, W / 2, y0 + 14, 'The curve never meets the x-axis', { anchor: 'middle', size: 12, fill: 'var(--success-bg)', ink: 'var(--success-text)' });
    }
    stage.say(stu.length ? `${hits} of ${exp.length} roots on target.` : '');
  }

  function pin(g, cls, icon) {
    el('ellipse', { cx: 0, cy: 12, rx: 7, ry: 2.5, cls: 'pin-shadow' }, g);
    el('path', { d: 'M0 0C-3 -6 -10 -10 -10 -18A10 10 0 1 1 10 -18C10 -10 3 -6 0 0Z', cls }, g);
    drawIcon(g, icon, 0, -18, 5, 'var(--mw-on-fill)');
  }

  function poly() {
    const term = (k, s, first) => {
      if (k === 0) return '';
      const sign = k < 0 ? (first ? '-' : ' - ') : (first ? '' : ' + ');
      const m = Math.abs(k);
      return sign + (m === 1 && s ? '' : fmt(m)) + s;
    };
    let out = term(A, 'x\u00b2', true);
    out += term(B, 'x', !out);
    out += term(C, '', !out) || (!out ? '0' : '');
    return out;
  }

  function update(next) {
    state = normState(next);
    const key = stateKey(state);
    if (key === prev.key) return;
    const stuKey = stateKey(state.student.set || null);
    const anim = {
      first: prev.status == null,
      header: state.status !== prev.status,
      drop: stuKey !== prev.stuKey && Array.isArray(state.student.set),
      win: state.status === 'correct' && prev.status !== 'correct',
    };
    prev = { key, status: state.status, stuKey };
    draw(anim);
  }

  update(null);
  return { update, destroy: () => stage.destroy() };
}
