/**
 * sequence - an AP as a staircase of stacked blocks (first term + one "d" block
 * per step), a GP as growing bars joined by "x r" hops. The student's formula
 * values drop in as markers: a match lands on the bar top (ring + tick), a
 * miss bounces and settles at its own height with the gap and both numbers.
 *
 * params: { kind: 'ap'|'gp', termLatex, count }
 * state.expected.values: number[] (the terms), state.student.values: number[]
 */
import {
  el, at, chip, burst, ring, drawIcon, fmt, isNum, near, clamp, textWidth, createStage, normState, stateKey,
} from './_shared.js';

const CSS = `
.mwv-sequence .bar { cursor: pointer; }
.mwv-sequence .bar-hi { fill: var(--mw-shine); }
.mwv-sequence .cushion { fill: var(--text-main); opacity: .08; }
.mwv-sequence .base { stroke: var(--text-muted); stroke-width: 2; stroke-linecap: round; opacity: .5; }
.mwv-sequence .seam { stroke: var(--bg-surface); stroke-width: 1.5; opacity: .55; }
.mwv-sequence .hop { fill: none; stroke: var(--content-series-2); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 2 5; }
.mwv-sequence .gap { stroke: var(--error-text); stroke-width: 2; stroke-dasharray: 3 4; }
.mwv-sequence .mk-ring { fill: var(--bg-surface); stroke: var(--primary-color); stroke-width: 3; }
.mwv-sequence .mk-good { fill: var(--mw-ok-fill); stroke: var(--bg-surface); stroke-width: 2.5; }
.mwv-sequence .mk-bad { fill: var(--mw-bad-fill); stroke: var(--bg-surface); stroke-width: 2.5; }
.mwv-sequence .mk-shadow { fill: var(--text-main); opacity: .12; }
.mwv-sequence .tops { fill: none; stroke: var(--accent-gold); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
`;

export function mount(hostEl, params = {}, ctx = {}) {
  const P = { kind: params.kind === 'gp' ? 'gp' : 'ap', count: params.count | 0 };
  let state = normState(null);
  let prev = { key: '', studentKey: '', status: 'idle', mounted: false };

  const stage = createStage(hostEl, ctx, { css: CSS, kind: 'sequence', label: 'Terms of the sequence as bars', onResize: () => draw({}) });
  let sel = null;
  stage.svg.addEventListener('click', (ev) => {
    const g = ev.target.closest && ev.target.closest('[data-i]');
    const i = g ? Number(g.getAttribute('data-i')) : null;
    sel = i === sel ? null : i;
    draw({ sel: true });
  });

  function draw(anim) {
    const W = stage.width;
    const H = clamp(Math.round(W * 0.56), 240, 340);
    const svg = stage.reset(H);
    const exp = (state.expected.values || []).filter(isNum);
    const stu = Array.isArray(state.student.values) ? state.student.values : [];
    const N = clamp(P.count || exp.length || stu.length || 8, 1, 30);
    const ex = exp.slice(0, N);
    if (!ex.length) {
      el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', cls: 't-soft', text: 'The terms will appear here', css: 'font-size:15px' }, svg);
      return;
    }
    const top = W >= 460 ? 76 : 64, bot = 34, padX = W < 420 ? 14 : 24;
    const plotH = H - top - bot;
    let vmax = Math.max(0, ...ex), vmin = Math.min(0, ...ex);
    const span0 = vmax - vmin || 1;
    for (const s of stu.slice(0, N)) if (isNum(s)) { vmax = Math.max(vmax, Math.min(s, vmax + span0 * 0.3)); vmin = Math.min(vmin, Math.max(s, vmin - span0 * 0.3)); }
    const span = vmax - vmin || 1;
    const Y = (v) => top + ((vmax - v) / span) * plotH;
    const y0 = Y(0);
    const slot = (W - padX * 2) / N;
    const isAP = P.kind === 'ap';
    const a = ex[0], d = ex.length > 1 ? ex[1] - ex[0] : 0;
    const r = ex.length > 1 && ex[0] !== 0 ? ex[1] / ex[0] : 1;
    const stacked = isAP && a >= 0 && d >= 0;
    const barW = isAP ? slot - 3 : Math.min(slot * 0.64, 64);
    const showVals = slot >= 30;

    // header chip
    let good = 0, tried = 0;
    stu.slice(0, N).forEach((s, i) => { if (isNum(s)) { tried++; if (near(s, ex[i])) good++; } });
    const st = state.status;
    let label, fill = 'var(--bg-surface)', ink = 'var(--text-main)', icon = null;
    if (st === 'correct' || (tried && good === N)) { label = `All ${N} terms match!`; fill = 'var(--mw-gold-fill)'; ink = 'var(--mw-on-fill)'; icon = 'star'; }
    else if (tried) { label = `${good} of ${N} terms match`; if (st === 'wrong') { fill = 'var(--error-bg)'; ink = 'var(--error-text)'; } }
    else if (isAP) label = d === 0 ? 'Every term is the same' : `Each step ${d > 0 ? 'adds' : 'takes away'} ${fmt(Math.abs(d))}`;
    else label = `Each bar is ${fmt(r)} times the one before`;
    chip(svg, padX, 12, label, { fill, ink, icon, size: 14, cls: anim.header ? 'a-pop' : '' });
    if (W >= 460) legend(svg, W - padX, 22, isAP);

    // baseline + bars
    el('line', { x1: padX - 6, x2: W - padX + 6, y1: y0, y2: y0, cls: 'base' }, svg);
    const bars = el('g', null, svg);
    const tops = [];
    for (let i = 0; i < ex.length; i++) {
      const cx = padX + slot * (i + 0.5);
      const x = cx - barW / 2;
      const v = ex[i];
      const yt = Y(v);
      tops.push([cx, yt]);
      const g = el('g', { 'data-i': i, cls: ['bar', anim.rise ? 'a-rise' : '', anim.hop ? 'a-hop' : ''].join(' ').trim(), css: `--d:${i * (anim.hop ? 70 : 85)}ms` }, bars);
      el('rect', { x: cx - slot / 2, y: top - 10, width: slot, height: H - top - bot + 10, css: 'fill:transparent' }, g);
      el('ellipse', { cx, cy: y0 + 4, rx: barW * 0.5, ry: 4, cls: 'cushion' }, g);
      if (stacked) {
        // first-term block, then i blocks of d
        const yA = Y(a);
        block(g, x, yA, barW, y0 - yA, 'var(--content-series-1)', i === 0 || d === 0);
        for (let k = 1; k <= i; k++) {
          const y1 = Y(a + k * d), y2 = Y(a + (k - 1) * d);
          const tone = k % 2 ? 'var(--content-series-3)' : 'color-mix(in oklab, var(--content-series-3) 72%, var(--bg-surface))';
          block(g, x, y1, barW, y2 - y1, tone, k === i);
          if (k === i && i > 0 && barW >= 26 && y2 - y1 >= 15 && i <= 2) {
            el('text', { x: cx, y: (y1 + y2) / 2 + 4.5, 'text-anchor': 'middle', text: '+' + fmt(d), css: 'font-size:12px;font-weight: var(--fw-strong);fill:var(--on-primary)' }, g);
          }
        }
      } else {
        const tone = isAP ? 'var(--content-series-1)' : 'var(--content-series-5)';
        block(g, x, Math.min(yt, y0), barW, Math.abs(y0 - yt), tone, true);
      }
      shine(g, x, Math.min(yt, y0), barW, Math.abs(y0 - yt));
      const hasMk = isNum(stu[i]) && near(stu[i], v);
      const lift = hasMk ? clamp(slot * 0.26, 5, 9) * 2 + 4 : 0;
      if (showVals || i === 0 || i === ex.length - 1) {
        el('text', { x: cx, y: v >= 0 ? yt - 7 - lift : yt + 16 + lift, 'text-anchor': 'middle', cls: 't-num', text: fmt(v), css: 'font-size:12.5px;font-weight: var(--fw-strong);fill:var(--text-soft)' }, g);
      }
      // T_n label under the axis
      if (slot >= 22 || i === 0 || i === ex.length - 1) {
        const t = el('text', { x: cx, y: H - 12, 'text-anchor': 'middle', cls: 't-soft', css: 'font-size:12px;font-weight: var(--fw-strong)' }, svg);
        t.textContent = 'T';
        el('tspan', { 'baseline-shift': 'sub', css: 'font-size:9px', text: String(i + 1) }, t);
      }
    }
    // GP: "x r" hops between bar tops
    if (!isAP && ex.length > 1 && slot >= 56) {
      for (let i = 0; i < Math.min(ex.length - 1, 4); i++) {
        const [x1, ya] = tops[i], [x2, yb] = tops[i + 1];
        const lift = 22;
        const ym = Math.min(ya, yb) - lift;
        el('path', { d: `M${x1} ${ya - 16}Q${(x1 + x2) / 2} ${ym - 8} ${x2} ${yb - 18}`, cls: 'hop' + (anim.rise ? ' a-fade' : ''), css: `--d:${400 + i * 120}ms` }, svg);
        if (i === 0) el('text', { x: (x1 + x2) / 2, y: ym - 10, 'text-anchor': 'middle', text: '\u00d7 ' + fmt(r), css: 'font-size:12px;font-weight: var(--fw-strong);fill:var(--accent-amber)' }, svg);
      }
    }

    // celebratory line along the tops
    if (st === 'correct') {
      const pts = tops.map(([x, y]) => `${x} ${y}`).join('L');
      const len = tops.length * slot * 1.6 + 200;
      el('path', { d: 'M' + pts, cls: 'tops' + (anim.hop ? ' a-draw' : ''), css: `--len:${Math.round(len)};opacity:.85` }, svg);
    }

    // student markers
    const mr = clamp(slot * 0.26, 5, 9);
    let firstMiss = -1;
    const mk = el('g', null, svg);
    for (let i = 0; i < ex.length; i++) {
      const s = stu[i];
      if (!isNum(s)) continue;
      const cx = padX + slot * (i + 0.5);
      const ok = near(s, ex[i]);
      const off = s > vmax || s < vmin;
      const ys = clamp(Y(s), top - 6, H - bot);
      const delay = i * 110;
      if (!ok) {
        if (firstMiss < 0) firstMiss = i;
        el('line', { x1: cx, x2: cx, y1: ys, y2: Y(ex[i]), cls: 'gap' + (anim.drop ? ' a-fade' : ''), css: `--d:${delay + 600}ms` }, mk);
      }
      const g = at(mk, cx, ys, anim.drop ? (ok ? 'a-drop' : 'a-miss') : null, `--d:${delay}ms;--from:${-(ys + 20)}px`);
      el('ellipse', { cx: 0, cy: mr + 3, rx: mr * 0.9, ry: 2.4, cls: 'mk-shadow' }, g);
      el('circle', { cx: 0, cy: 0, r: mr, cls: ok ? 'mk-good' : 'mk-bad' }, g);
      drawIcon(g, ok ? 'tick' : 'cross', 0, 0, mr * 0.55, 'var(--mw-on-fill)');
      if (off) el('text', { x: 0, y: s > vmax ? -mr - 4 : mr + 14, 'text-anchor': 'middle', text: s > vmax ? '\u2191' : '\u2193', css: 'font-size:12px;fill:var(--error-text)' }, g);
      if (anim.drop && ok) stage.later(() => ring(stage, svg, cx, ys, mr, 'var(--success-text)'), delay + 560);
    }
    if (firstMiss >= 0) {
      const i = firstMiss, cx = padX + slot * (i + 0.5);
      const s = stu[i];
      const ys = clamp(Y(s), top - 6, H - bot);
      const ye = Y(ex[i]);
      const right = cx < W * 0.6;
      const lx = right ? cx + mr + 8 : cx - mr - 8;
      const anchor = right ? 'start' : 'end';
      const d0 = anim.drop ? 'a-pop' : '';
      const below = Math.abs(ys - ye) < 34;
      chip(svg, lx, ys - 12 + (below && ys > ye ? 10 : below ? -10 : 0), `yours: ${fmt(s)}`, { anchor, size: 12, fill: 'var(--error-bg)', ink: 'var(--error-text)', cls: d0, css: `--d:${i * 110 + 700}ms` });
      chip(svg, lx, ye - 12 + (below && ys > ye ? -16 : below ? 16 : 0), `T${i + 1} is ${fmt(ex[i])}`, { anchor, size: 12, fill: 'var(--success-bg)', ink: 'var(--success-text)', cls: d0, css: `--d:${i * 110 + 800}ms` });
    }
    if (anim.hop && st === 'correct') {
      const [lx, ly] = tops[tops.length - 1];
      stage.later(() => burst(stage, svg, lx, ly - 10, { spread: 80 }), ex.length * 70 + 200);
    }
    if (sel != null && sel < ex.length) {
      const i = sel, cx = padX + slot * (i + 0.5);
      const v = ex[i];
      const how = isAP
        ? (i === 0 ? `T1 = a = ${fmt(a)}` : `T${i + 1} = ${fmt(a)} + ${i} \u00d7 ${fmt(d)} = ${fmt(v)}`)
        : (i === 0 ? `T1 = a = ${fmt(a)}` : `T${i + 1} = ${fmt(a)} \u00d7 ${fmt(r)}${sup(i)} = ${fmt(v)}`);
      const w = textWidth(how, 13) + 20;
      const yy = Math.max(top - 30, Y(Math.max(v, 0)) - 52);
      el('rect', { x: cx - barW / 2 - 3, y: Math.min(Y(v), y0) - 3, width: barW + 6, height: Math.abs(y0 - Y(v)) + 6, rx: 8, css: 'fill:none;stroke:var(--mw-gold-fill);stroke-width:3' }, svg);
      chip(svg, clamp(cx, w / 2 + 8, W - w / 2 - 8), yy, how, { anchor: 'middle', size: 13, fill: 'var(--mw-gold-fill)', lip: 'var(--mw-gold-lip)', ink: 'var(--mw-on-fill)', cls: anim.sel ? 'a-pop' : '' });
    }
    stage.say(tried ? `${good} of ${N} terms match.` : '');
  }

  function block(g, x, y, w, h, tone, capTop) {
    if (h <= 0.5) return;
    const rr = Math.min(6, w / 4, h / 2);
    el('rect', { x, y, width: w, height: h, rx: capTop ? rr : 1.5, css: `fill:${tone}` }, g);
    // flat side shade: the right fifth one step darker reads as a solid block
    const sw = Math.max(2, w * 0.2);
    el('rect', { x: x + w - sw, y, width: sw, height: h, rx: capTop ? Math.min(rr, sw / 2) : 1, css: `fill:color-mix(in oklab, ${tone} 76%, var(--mw-deep))` }, g);
    if (!capTop) el('line', { x1: x + 1, x2: x + w - 1, y1: y + 0.5, y2: y + 0.5, cls: 'seam' }, g);
  }
  function shine(g, x, y, w, h) {
    if (h > 14 && w > 10) el('rect', { x: x + Math.max(3, w * 0.1), y: y + 4, width: Math.max(2.5, w * 0.1), height: Math.max(2, Math.min(h - 8, 40)), rx: 2, cls: 'bar-hi' }, g);
  }

  function legend(svg, xr, y, isAP) {
    const g = el('g', null, svg);
    el('circle', { cx: xr - 98, cy: y, r: 6, cls: 'mk-ring' }, g);
    el('text', { x: xr - 88, y: y + 4.5, text: 'your formula', cls: 't-soft', css: 'font-size:12px' }, g);
    el('rect', { x: xr - 180, y: y - 7, width: 12, height: 14, rx: 3, css: `fill:${isAP ? 'var(--content-series-3)' : 'var(--content-series-5)'}` }, g);
    el('text', { x: xr - 164, y: y + 4.5, text: 'terms', cls: 't-soft', css: 'font-size:12px' }, g);
  }

  function update(next) {
    state = normState(next);
    const key = stateKey(state);
    if (key === prev.key && prev.mounted) return;
    const studentKey = stateKey(state.student.values || null);
    const has = (state.expected.values || []).length > 0;
    const anim = {
      rise: has && !prev.had,
      header: !prev.mounted || state.status !== prev.status,
      drop: studentKey !== prev.studentKey && Array.isArray(state.student.values),
      hop: state.status === 'correct' && prev.status !== 'correct',
    };
    prev = { key, studentKey, status: state.status, mounted: true, had: has };
    draw(anim);
  }

  update({ student: {}, expected: {}, status: 'idle' });
  return { update, destroy: () => stage.destroy() };
}

const SUP = ['\u2070', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
function sup(k) { return String(k).split('').map((ch) => SUP[Number(ch)]).join(''); }
