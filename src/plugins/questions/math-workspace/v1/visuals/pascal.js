/**
 * pascal - Pascal's triangle up to row n. Rows fade in, row n glows, the cell
 * for T_{r+1} (that is nCr) pops with its value, and its two parents above are
 * joined to it ("6 + 4 = 10"). "Trace the routes" rolls a ball down every
 * left/right route that reaches the cell - there are exactly nCr of them.
 *
 * params: { n, r }
 * state.student.values?: [studentCoefficient]   (shown beside the cell when wrong)
 */
import { el, at, chip, burst, drawIcon, fmt, isNum, near, clamp, createStage, normState, stateKey, ease } from './_shared.js';

const CSS = `
.mwv-pascal .cell-lip { fill: var(--border-hover); }
.mwv-pascal .cell { fill: var(--bg-surface); stroke: var(--border-color); stroke-width: 1.5; }
.mwv-pascal .cell-t { fill: var(--text-soft); font-weight: var(--fw-strong); }
.mwv-pascal .rown .cell { fill: color-mix(in oklab, var(--content-series-1) 18%, var(--bg-surface)); stroke: color-mix(in oklab, var(--content-series-1) 55%, var(--bg-surface)); }
.mwv-pascal .rown .cell-lip { fill: color-mix(in oklab, var(--content-series-1) 60%, var(--bg-surface)); }
.mwv-pascal .rown .cell-t { fill: var(--text-main); }
.mwv-pascal .par .cell { stroke: var(--content-series-3); stroke-width: 3; }
.mwv-pascal .target .cell { fill: var(--mw-gold-fill); stroke: none; }
.mwv-pascal .target .cell-lip { fill: var(--mw-gold-lip); }
.mwv-pascal .target .cell-t { fill: var(--mw-on-fill); }
.mwv-pascal .halo { fill: var(--accent-gold); opacity: .3; }
.mwv-pascal .plus { fill: var(--content-series-3); }
.mwv-pascal .rowglow { fill: var(--content-series-1); opacity: .09; }
.mwv-pascal .feed { stroke: var(--content-series-3); stroke-width: 3; stroke-linecap: round; fill: none; }
.mwv-pascal .trail { fill: none; stroke: var(--content-series-5); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; opacity: .35; }
.mwv-pascal .trail.now { opacity: .9; }
.mwv-pascal .ball { fill: var(--content-series-5); stroke: var(--bg-surface); stroke-width: 2.5; }
`;

export function mount(hostEl, params = {}, ctx = {}) {
  const n = clamp(Math.round(Number(params.n) || 0), 0, 30);
  const r = clamp(Math.round(Number(params.r) || 0), 0, n);
  const rows = [[1]];
  for (let i = 1; i <= n; i++) {
    const p = rows[i - 1], row = [1];
    for (let j = 1; j < i; j++) row.push(p[j - 1] + p[j]);
    row.push(1);
    rows.push(row);
  }
  const value = rows[n][r];
  const r0 = n > 12 ? n - 6 : 0; // first row drawn
  const canTrace = r0 === 0 && n >= 1;

  let state = normState(null);
  let prev = { key: '', status: null };
  let tracing = false;
  let run = null; // { raf, timer }

  const stage = createStage(hostEl, ctx, { css: CSS, kind: 'pascal', label: "Pascal's triangle", onResize: () => draw({}) });
  const btn = document.createElement('button');
  btn.className = 'mwv-btn';
  btn.type = 'button';
  btn.textContent = 'Trace the routes';
  if (canTrace) stage.overlay.appendChild(btn);
  btn.addEventListener('click', () => {
    tracing = !tracing;
    btn.classList.toggle('on', tracing);
    btn.textContent = tracing ? 'Stop' : 'Trace the routes';
    draw({});
  });

  let geo = null;

  function draw(anim) {
    stopRun();
    const W = stage.width;
    const narrow = W < 480;
    const shown = n - r0 + 1;
    const sx = Math.min((W - 24) / (n + 1), 58);
    const cs = sx * 0.84;
    const sy = Math.min(sx * 0.9, 50);
    const top = 64, bot = 52 + (canTrace ? 40 : 0);
    const H = top + (shown - 1) * sy + cs + bot;
    const svg = stage.reset(H);
    const cx0 = W / 2;
    const pos = (i, j) => [cx0 + (j - i / 2) * sx, top + cs / 2 + (i - r0) * sy];
    geo = { pos, svg, cs, sx };

    const st = state.status;
    const stu = (state.student.values || [])[0];
    // header
    let label = `Row ${n} of Pascal's triangle`, fill = 'var(--bg-surface)', ink = 'var(--text-main)', icon = null;
    if (st === 'correct') { label = `Term ${r + 1}: ${n}C${r} = ${fmt(value)}`; fill = 'var(--mw-gold-fill)'; ink = 'var(--mw-on-fill)'; icon = 'star'; }
    chip(svg, 14, 12, label, { fill, ink, icon, size: narrow ? 13 : 14, cls: anim.header ? 'a-pop' : '' });

    // glow band behind row n
    const [, yn] = pos(n, 0);
    el('rect', { x: 8, y: yn - cs / 2 - 6, width: W - 16, height: cs + 12, rx: (cs + 12) / 2, cls: 'rowglow' + (anim.rows ? ' a-fade' : ''), css: `--d:${shown * 70}ms` }, svg);
    {
      const [xl] = pos(n, 0);
      if (xl - cs / 2 > 64) el('text', { x: xl - cs / 2 - 12, y: yn + 4.5, 'text-anchor': 'end', text: `row ${n}`, css: 'font-size:13px;font-weight: var(--fw-strong);fill:var(--content-series-1)' }, svg);
    }

    const digits = String(Math.max(...rows[n])).length;
    const fs = Math.min(15, (cs * 0.86) / (digits * 0.62), cs * 0.5);
    const cells = el('g', null, svg);
    const feeds = el('g', null, svg);
    const trails = el('g', null, svg);
    geo.trails = trails;
    for (let i = r0; i <= n; i++) {
      const rg = el('g', { cls: (i === n ? 'rown ' : '') + (anim.rows ? 'a-fade' : ''), css: `--d:${(i - r0) * 70}ms` }, cells);
      for (let j = 0; j <= i; j++) {
        const [x, y] = pos(i, j);
        const isT = i === n && j === r;
        const isPar = i === n - 1 && (j === r - 1 || j === r) && n >= 1;
        if (isT) continue;
        const hop = anim.hop && i === n ? 'a-hop' : null;
        const g = at(rg, x, y, (isPar ? 'par ' : '') + (hop || ''), hop ? `--d:${j * 60}ms` : null);
        cell(g, cs, rows[i][j], fs);
      }
    }
    // target
    {
      const [x, y] = pos(n, r);
      const tg = at(svg, x, y, 'target ' + (anim.pop ? 'a-pop' : anim.shake ? 'a-shake' : ''), `--d:${anim.pop ? shown * 70 + 250 : 0}ms`);
      el('circle', { cx: 0, cy: 0, r: cs * 0.62, cls: 'halo glow' }, tg);
      cell(tg, cs * 1.08, value, fs * 1.08);
      drawIcon(tg, 'spark', cs * 0.5, -cs * 0.5, Math.max(4, cs * 0.16), 'var(--accent-gold)');
      if (st === 'correct' && anim.hop) stage.later(() => burst(stage, svg, x, y, { spread: 70 }), 250);
    }

    // parents feeding the target: two arrows and a plus badge
    if (n >= 1) {
      const [tx, ty] = pos(n, r);
      const fd = anim.rows ? 'a-fade' : '';
      const dl = `--d:${shown * 70 + 150}ms`;
      for (const j of [r - 1, r]) {
        if (j < 0 || j > n - 1) continue;
        const [px, py] = pos(n - 1, j);
        const sx0 = px + (tx - px) * 0.15, sy0 = py + cs * 0.42;
        const ex = tx + (px - tx) * 0.32, ey = ty - cs * 0.5;
        el('path', { d: `M${sx0} ${sy0}L${ex} ${ey}`, cls: 'feed ' + fd, css: dl }, feeds);
      }
      if (r >= 1 && r <= n - 1) {
        const [px, py] = pos(n - 1, r - 1);
        const bg = at(svg, px + sx / 2, py, fd, dl);
        el('circle', { cx: 0, cy: 0, r: Math.max(7, cs * 0.2), cls: 'plus' }, bg);
        el('text', { x: 0, y: Math.max(7, cs * 0.2) * 0.45, 'text-anchor': 'middle', text: '+', css: `font-size:${Math.max(12, cs * 0.34)}px;font-weight: var(--fw-strong);fill:var(--on-primary)` }, bg);
      }
    }
    // caption under the triangle
    const cfs = narrow ? 13 : 14;
    const cap = el('text', { x: W / 2, y: H - 18 - (canTrace ? 40 : 0), 'text-anchor': 'middle', css: `font-size:${cfs}px;font-weight: var(--fw-strong)` }, svg);
    const parts = n >= 1 && r >= 1 && r <= n - 1 ? `   (${fmt(rows[n - 1][r - 1])} + ${fmt(rows[n - 1][r])})` : '';
    cap.appendChild(document.createTextNode(`Term ${r + 1} uses `));
    ncr(cap, n, r, cfs);
    el('tspan', { dy: -cfs * 0.25, text: ` = ${fmt(value)}${narrow ? '' : parts}` }, cap);

    if (isNum(stu) && st === 'wrong' && !near(stu, value)) {
      const hfs = narrow ? 13 : 14;
      chip(svg, 14, 12 + hfs * 1.9 + 8, `yours: ${fmt(stu)}`, { size: 12, fill: 'var(--error-bg)', ink: 'var(--error-text)', cls: anim.shake ? 'a-pop' : '' });
    }
    stage.say(`${n}C${r} is ${fmt(value)}.`);
    if (tracing && canTrace) startRun();
  }

  // n C r with n raised and r lowered, the way Indian textbooks print it
  function ncr(t, nn, rr, fs) {
    el('tspan', { dy: -fs * 0.35, css: `font-size:${fs * 0.72}px`, text: String(nn) }, t);
    el('tspan', { dy: fs * 0.35, text: 'C' }, t);
    el('tspan', { dy: fs * 0.25, css: `font-size:${fs * 0.72}px`, text: String(rr) }, t);
  }

  function cell(g, cs, v, fs) {
    const h = cs * 0.86, w = cs;
    el('rect', { x: -w / 2, y: -h / 2 + 3, width: w, height: h, rx: h * 0.36, cls: 'cell-lip' }, g);
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: h * 0.36, cls: 'cell' }, g);
    el('text', { x: 0, y: fs * 0.36, 'text-anchor': 'middle', text: fmt(v), cls: 'cell-t t-num', css: `font-size:${fs}px` }, g);
  }

  /* ---------- route tracing ---------- */
  function allRoutes() {
    const out = [];
    const rec = (k, rights, path) => {
      if (out.length >= 924) return;
      if (k === n) { if (rights === r) out.push(path.slice()); return; }
      if (rights < r) { path.push(1); rec(k + 1, rights + 1, path); path.pop(); }
      if (k - rights < n - r) { path.push(0); rec(k + 1, rights, path); path.pop(); }
    };
    rec(0, 0, []);
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function routePts(route) {
    const pts = [geo.pos(0, 0)];
    let j = 0;
    route.forEach((s, k) => { j += s; pts.push(geo.pos(k + 1, j)); });
    return pts;
  }
  function stopRun() {
    if (!run) return;
    if (run.raf) stage.cancelFrame(run.raf);
    if (run.timer) stage.clearTimer(run.timer);
    run = null;
  }
  function startRun() {
    const routes = allRoutes();
    const total = routes.length;
    const limit = Math.min(total, 12);
    const { svg, trails, cs } = geo;
    const counter = chip(svg, stage.width - 14, 12, `${total} routes reach ${fmt(value)}`, { anchor: 'end', size: 12, fill: 'var(--content-series-5)', ink: 'var(--on-primary)' });
    void counter;
    if (stage.still) {
      routes.slice(0, limit).forEach((rt) => el('polyline', { points: routePts(rt).map((p) => p.join(',')).join(' '), cls: 'trail' }, trails));
      return;
    }
    const ball = el('circle', { cx: 0, cy: 0, r: Math.max(5, cs * 0.17), cls: 'ball' }, svg);
    run = { raf: 0, timer: 0 };
    let idx = 0;
    const stepMs = 240;
    const one = () => {
      if (!run) return;
      if (idx >= limit) { ball.remove(); return; }
      const pts = routePts(routes[idx]);
      const line = el('polyline', { points: '', cls: 'trail now' }, trails);
      const t0 = performance.now();
      const tick = (t) => {
        if (!run) return;
        const e = (t - t0) / stepMs;
        const k = Math.min(Math.floor(e), pts.length - 1);
        const f = k >= pts.length - 1 ? 1 : ease.inOut(e - k);
        const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
        const x = a[0] + (b[0] - a[0]) * f;
        const y = a[1] + (b[1] - a[1]) * f - Math.sin(f * Math.PI) * cs * 0.3;
        ball.setAttribute('cx', x.toFixed(1));
        ball.setAttribute('cy', (y - cs * 0.48).toFixed(1));
        line.setAttribute('points', pts.slice(0, k + 1).concat([[x, a[1] + (b[1] - a[1]) * f]]).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
        if (k >= pts.length - 1) {
          line.setAttribute('class', 'trail');
          idx++;
          run.timer = stage.later(one, 260);
          return;
        }
        run.raf = stage.frame(tick);
      };
      run.raf = stage.frame(tick);
    };
    one();
  }

  function update(next) {
    state = normState(next);
    const key = stateKey(state);
    if (key === prev.key) return;
    const anim = {
      rows: prev.status == null,
      pop: prev.status == null || (state.status === 'correct' && prev.status !== 'correct'),
      header: state.status !== prev.status,
      hop: state.status === 'correct' && prev.status !== 'correct',
      shake: state.status === 'wrong' && key !== prev.key,
    };
    prev = { key, status: state.status };
    draw(anim);
  }

  update(null);
  return { update, destroy: () => { stopRun(); stage.destroy(); } };
}
