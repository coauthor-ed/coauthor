/**
 * unit-circle - the unit circle with a radius at angle theta, its right
 * triangle, cos (horizontal, blue) and sin (vertical, red) legs. A valid
 * identity step grows a square on each leg (areas sin^2 and cos^2) and pours
 * them into a 1 x 1 square as two strips that fill it exactly: the picture of
 * sin^2 + cos^2 = 1. The point can be dragged (or arrow keys) to try any angle.
 *
 * params: { angleDeg }
 * state.status: idle -> triangle only; partial -> squares appear and pulse on
 * every new valid step; correct -> unit square filled + celebration; wrong ->
 * the triangle wobbles.
 */
import { el, at, chip, burst, ring, drawIcon, fmt, clamp, textWidth, createStage, normState, stateKey } from './_shared.js';

const TH = '\u03b8', DEG = '\u00b0', SQ = '\u00b2';
const SNAPS = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];

const CSS = `
.mwv-unit-circle .axis { stroke: var(--text-muted); stroke-width: 1.5; opacity: .55; }
.mwv-unit-circle .circ { fill: color-mix(in oklab, var(--primary-color) 7%, transparent); stroke: var(--primary-color); stroke-width: 3.5; }
.mwv-unit-circle .tri { fill: color-mix(in oklab, var(--accent-gold) 22%, transparent); }
.mwv-unit-circle .rad { stroke: var(--text-main); stroke-width: 3.5; stroke-linecap: round; }
.mwv-unit-circle .cosl { stroke: var(--content-series-1); stroke-width: 7; stroke-linecap: round; }
.mwv-unit-circle .sinl { stroke: var(--content-series-6); stroke-width: 7; stroke-linecap: round; }
.mwv-unit-circle .arc { fill: color-mix(in oklab, var(--accent-gold) 55%, transparent); stroke: var(--accent-amber); stroke-width: 2; }
.mwv-unit-circle .sq-cos { fill: color-mix(in oklab, var(--content-series-1) 26%, transparent); stroke: var(--content-series-1); stroke-width: 2; }
.mwv-unit-circle .sq-sin { fill: color-mix(in oklab, var(--content-series-6) 26%, transparent); stroke: var(--content-series-6); stroke-width: 2; }
.mwv-unit-circle .strip-cos { fill: var(--content-series-1); }
.mwv-unit-circle .strip-sin { fill: var(--content-series-6); }
.mwv-unit-circle .unit { fill: var(--bg-surface); stroke: var(--text-muted); stroke-width: 2; stroke-dasharray: 5 4; }
.mwv-unit-circle .unit.full { stroke: var(--accent-gold); stroke-width: 4; stroke-dasharray: none; fill: none; }
.mwv-unit-circle .pt { fill: var(--bg-surface); stroke: var(--text-main); stroke-width: 3.5; }
.mwv-unit-circle .pt-glow { fill: var(--accent-gold); opacity: .4; }
.mwv-unit-circle .hit { fill: transparent; cursor: grab; }
.mwv-unit-circle .mwv-svg { touch-action: none; }
.mwv-unit-circle .mwv-svg:focus-visible { outline: var(--focus-ring); outline-offset: -4px; border-radius: var(--radius-lg); }
.mwv-unit-circle .a-thick { animation: mwv-thick 800ms var(--ease-settle) both; }
.mwv-unit-circle .a-grow-y { transform-box: fill-box; transform-origin: 50% 100%; animation: mwv-grow-y 650ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
.mwv-unit-circle .a-grow-yt { transform-box: fill-box; transform-origin: 50% 0%; animation: mwv-grow-y 650ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
@keyframes mwv-thick { 30% { stroke-width: 13px; } }
@keyframes mwv-grow-y { from { transform: scaleY(0); } }
`;

export function mount(hostEl, params = {}, ctx = {}) {
  const home = Number.isFinite(Number(params.angleDeg)) ? Number(params.angleDeg) : 60;
  let deg = home;
  let state = normState(null);
  let prev = { key: '', status: null };
  let pend = 0;

  const stage = createStage(hostEl, ctx, { css: CSS, kind: 'unit-circle', label: 'Unit circle with sine and cosine', onResize: () => draw({}) });
  const svgEl = stage.svg;
  svgEl.setAttribute('tabindex', '0');
  const back = document.createElement('button');
  back.className = 'mwv-btn';
  back.type = 'button';
  back.addEventListener('click', () => { deg = home; draw({}); });
  stage.overlay.appendChild(back);

  let geo = null;

  function phase() {
    return state.status === 'correct' ? 2 : state.status === 'partial' ? 1 : 0;
  }

  function draw(anim) {
    const W = stage.width;
    const wide = W >= 640;
    const ph = phase();
    const areaW = wide ? W * 0.6 : W;
    const R = clamp(Math.min(areaW / 2.95, wide ? 125 : 108), 70, 125);
    const head = 58;
    const cx = areaW / 2 + (wide ? 8 : 0);
    const cy = head + R * 1.32;
    const Q = wide ? Math.min(150, W * 0.18) : Math.min(124, W * 0.34);
    const legendY = cy + R * 1.32 + 6;
    const panelY = wide ? cy - Q / 2 - 6 : legendY + 66;
    const H = wide ? legendY + 44 : panelY + Q + 54;
    const svg = stage.reset(H);
    back.style.display = Math.abs(deg - home) > 0.01 ? '' : 'none';
    back.textContent = `Back to ${fmt(home)}${DEG}`;

    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const cc = Math.abs(c) < 1e-12 ? 0 : c, ss = Math.abs(s) < 1e-12 ? 0 : s;
    const X = (x) => cx + x * R, Y = (y) => cy - y * R;
    geo = { cx, cy, R };

    // header
    let label = `${TH} = ${fmt(deg)}${DEG}   (drag the point)`, fill = 'var(--bg-surface)', ink = 'var(--text-main)', icon = null;
    if (ph === 1) label = `A square on each leg: sin${SQ}${TH} and cos${SQ}${TH}`;
    if (ph === 2) { label = `sin${SQ}${TH} + cos${SQ}${TH} = 1`; fill = 'var(--mw-gold-fill)'; ink = 'var(--mw-on-fill)'; icon = 'star'; }
    if (state.status === 'wrong') { label = `Look again at that step`; fill = 'var(--error-bg)'; ink = 'var(--error-text)'; }
    if (!wide && ph === 1) label = `Squares on the legs`;
    chip(svg, 14, 12, label, { fill, ink, icon, size: W < 420 ? 13 : 14, cls: anim.header ? 'a-pop' : '' });

    // axes + ticks
    el('line', { x1: cx - R * 1.22, x2: cx + R * 1.22, y1: cy, y2: cy, cls: 'axis' }, svg);
    el('line', { x1: cx, x2: cx, y1: cy - R * 1.22, y2: cy + R * 1.22, cls: 'axis' }, svg);
    for (const [x, y, tx] of [[1, 0, '1'], [-1, 0, '-1'], [0, 1, '1'], [0, -1, '-1']]) {
      el('text', { x: X(x) + (y ? -7 : (x > 0 ? 6 : -6)), y: Y(y) + (y ? (y > 0 ? -6 : 16) : 15), 'text-anchor': y ? 'end' : (x > 0 ? 'start' : 'end'), text: tx, cls: 't-soft', css: 'font-size:11px' }, svg);
    }
    el('circle', { cx, cy, r: R, cls: 'circ' + (anim.first ? ' a-pop' : '') }, svg);

    // squares on the legs (math coords, then mapped)
    const sqG = el('g', null, svg);
    if (ph >= 1) {
      const sy = ss >= 0 ? -1 : 1; // cos square goes away from the triangle
      const cxs = cc >= 0 ? 1 : -1; // sin square goes away from the origin
      const ca = Math.abs(cc), sa = Math.abs(ss);
      const cosSq = { x: Math.min(0, cc), y: sy > 0 ? ca : 0, w: ca, h: ca };
      const sinSq = { x: cxs > 0 ? cc : cc - sa, y: Math.max(0, ss), w: sa, h: sa };
      const draw1 = (q, cls, txt, d) => {
        if (q.w < 1e-6) return;
        const g = el('g', { cls: anim.squares ? 'a-pop' : (anim.pulse ? 'a-pulse' : null), css: `--d:${d}ms` }, sqG);
        el('rect', { x: X(q.x), y: Y(q.y), width: q.w * R, height: q.h * R, rx: 3, cls }, g);
        if (q.w * R >= 38) el('text', { x: X(q.x + q.w / 2), y: Y(q.y - q.h / 2) + 5, 'text-anchor': 'middle', text: txt, css: `font-size:${q.w * R >= 60 ? 14 : 12}px;font-weight: var(--fw-strong)` }, g);
      };
      draw1(cosSq, 'sq-cos', `cos${SQ}`, 0);
      draw1(sinSq, 'sq-sin', `sin${SQ}`, 140);
    }

    // triangle, arc, legs
    const triG = el('g', { cls: anim.shake ? 'a-shake' : null }, svg);
    el('path', { d: `M${X(0)} ${Y(0)}L${X(cc)} ${Y(0)}L${X(cc)} ${Y(ss)}Z`, cls: 'tri' }, triG);
    const ar = R * 0.24;
    const large = ((deg % 360) + 360) % 360 > 180 ? 1 : 0;
    if (Math.abs(deg % 360) > 0.5) el('path', { d: `M${cx} ${cy}L${cx + ar} ${cy}A${ar} ${ar} 0 ${large} 0 ${cx + ar * c} ${cy - ar * s}Z`, cls: 'arc' }, triG);
    const ha = t / 2 + (large ? Math.PI : 0) * 0;
    el('text', { x: cx + ar * 1.55 * Math.cos(ha), y: cy - ar * 1.55 * Math.sin(ha) + 5, 'text-anchor': 'middle', text: TH, css: 'font-size:14px;font-weight: var(--fw-strong);fill:var(--accent-amber)' }, triG);
    // right-angle mark
    if (Math.abs(cc) * R > 16 && Math.abs(ss) * R > 16) {
      const m = 9, dx = cc > 0 ? -m : m, dy = ss > 0 ? m : -m;
      el('path', { d: `M${X(cc) + dx} ${Y(0)}L${X(cc) + dx} ${Y(0) - dy}L${X(cc)} ${Y(0) - dy}`, css: 'fill:none;stroke:var(--text-muted);stroke-width:1.5' }, triG);
    }
    const pulse = anim.pulse || anim.squares ? ' a-thick' : '';
    el('line', { x1: X(0), y1: Y(0), x2: X(cc), y2: Y(0), cls: 'cosl' + pulse }, triG);
    el('line', { x1: X(cc), y1: Y(0), x2: X(cc), y2: Y(ss), cls: 'sinl' + pulse }, triG);
    el('line', { x1: X(0), y1: Y(0), x2: X(cc), y2: Y(ss), cls: 'rad' }, triG);
    // short tags on the legs
    if (ph === 0 && Math.abs(cc) * R > 34) el('text', { x: X(cc / 2), y: Y(0) + (ss >= 0 ? 18 : -9), 'text-anchor': 'middle', text: 'cos', css: 'font-size:12px;font-weight: var(--fw-strong);fill:var(--content-series-1)' }, triG);
    if (ph === 0 && Math.abs(ss) * R > 26) el('text', { x: X(cc) + (cc >= 0 ? -8 : 8), y: Y(ss / 2) + 4, 'text-anchor': cc >= 0 ? 'end' : 'start', text: 'sin', css: 'font-size:12px;font-weight: var(--fw-strong);fill:var(--content-series-6)' }, triG);
    const nx = -ss, ny = cc; // normal to the radius, toward the triangle's outside
    el('text', { x: X(cc / 2 + nx * 0.1), y: Y(ss / 2 + ny * 0.1) + 4, 'text-anchor': 'middle', text: '1', css: 'font-size:13px;font-weight: var(--fw-strong)' }, triG);

    // the draggable point
    const pg = at(svg, X(cc), Y(ss), null);
    el('circle', { cx: 0, cy: 0, r: 16, cls: 'pt-glow glow' }, pg);
    el('circle', { cx: 0, cy: 0, r: 8, cls: 'pt' }, pg);
    el('circle', { cx: 0, cy: 0, r: 24, cls: 'hit' }, pg);
    if (anim.pulse || anim.squares) stage.later(() => ring(stage, svg, X(cc), Y(ss), 10, 'var(--accent-gold)'), 60);

    // legend chips: the two leg lengths
    const lg = el('g', null, svg);
    const thTxt = `${TH} = ${fmt(deg)}${DEG}`;
    const c1 = chip(lg, 0, 0, `cos ${TH} = ${fmt(cc)}`, { size: 13, fill: 'var(--content-series-1)', ink: 'var(--on-primary)' });
    const c2 = chip(lg, c1.w + 10, 0, `sin ${TH} = ${fmt(ss)}`, { size: 13, fill: 'var(--content-series-6)', ink: 'var(--on-primary)' });
    let tot = c1.w + c2.w + 10;
    const thW = Math.round(textWidth(thTxt, 13) + 20);
    if (tot + thW + 10 <= (wide ? areaW : W) - 20) {
      chip(lg, tot + 10, 0, thTxt, { size: 13, fill: 'var(--mw-gold-fill)', lip: 'var(--mw-gold-lip)', ink: 'var(--mw-on-fill)' });
      tot += thW + 10;
    }
    lg.setAttribute('transform', `translate(${clamp(cx - tot / 2, 10, W - tot - 10)} ${legendY})`);

    // the 1 x 1 square and the two strips that fill it
    const px = wide ? areaW + (W - areaW - Q) / 2 - 40 : clamp(W / 2 - Q - 10, 14, W);
    const pTitle = el('text', { x: px + Q / 2, y: panelY - 10, 'text-anchor': 'middle', text: `1 \u00d7 1 square`, cls: 't-soft', css: 'font-size:12.5px;font-weight: var(--fw-strong)' }, svg);
    void pTitle;
    el('rect', { x: px, y: panelY, width: Q, height: Q, rx: 4, cls: 'unit' }, svg);
    const s2 = ss * ss, c2v = cc * cc;
    const labX = px + Q + 12;
    if (ph >= 1) {
      const hs = s2 * Q, hc = c2v * Q;
      const gS = el('g', { cls: anim.squares ? 'a-grow-y' : null, css: '--d:350ms' }, svg);
      if (hs > 0.2) el('rect', { x: px, y: panelY + Q - hs, width: Q, height: hs, rx: 3, cls: 'strip-sin' }, gS);
      const gC = el('g', { cls: anim.squares ? 'a-grow-yt' : null, css: '--d:600ms' }, svg);
      if (hc > 0.2) el('rect', { x: px, y: panelY, width: Q, height: hc, rx: 3, cls: 'strip-cos' }, gC);
      const lab = (y, txt, tone, d) => el('text', { x: labX, y, text: txt, cls: anim.squares ? 'a-fade' : null, css: `--d:${d}ms;font-size:12.5px;font-weight: var(--fw-strong);fill:${tone}` }, svg);
      const ys = panelY + Q - hs / 2 + 4, yc = panelY + hc / 2 + 4;
      const sep = Math.max(0, 16 - Math.abs(ys - yc));
      lab(yc - sep / 2, `cos${SQ}${TH} = ${fmt(c2v)}`, 'var(--content-series-1)', 700);
      lab(ys + sep / 2, `sin${SQ}${TH} = ${fmt(s2)}`, 'var(--content-series-6)', 450);
    } else {
      el('text', { x: px + Q / 2, y: panelY + Q / 2 + 8, 'text-anchor': 'middle', text: '?', cls: 't-soft', css: 'font-size:26px;font-weight: var(--fw-strong)' }, svg);
    }
    if (ph === 2) {
      el('rect', { x: px, y: panelY, width: Q, height: Q, rx: 4, cls: 'unit full' + (anim.win ? ' a-fade' : ''), css: '--d:900ms' }, svg);
      const bd = at(svg, px + Q, panelY, anim.win ? 'a-pop' : null, '--d:1000ms');
      el('circle', { cx: 0, cy: 0, r: 13, css: 'fill:var(--mw-ok-fill)' }, bd);
      drawIcon(bd, 'tick', 0, 0, 6.5, 'var(--mw-on-fill)');
      el('text', { x: labX, y: panelY + Q + 24, 'text-anchor': 'start', text: 'together: exactly 1', cls: anim.win ? 'a-fade' : null, css: '--d:1000ms;font-size:12.5px;font-weight: var(--fw-strong);fill:var(--success-text)' }, svg);
      if (anim.win) stage.later(() => burst(stage, svg, px + Q / 2, panelY + Q / 2, { spread: 85, count: 22 }), 1000);
    }
    stage.say(`theta ${fmt(deg)} degrees, cos ${fmt(cc)}, sin ${fmt(ss)}.`);
  }

  /* ---------- dragging + keys ---------- */
  let dragging = false;
  function angleFrom(ev) {
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const k = vb.width / rect.width;
    const x = (ev.clientX - rect.left) * k - geo.cx;
    const y = geo.cy - (ev.clientY - rect.top) * k;
    let d = (Math.atan2(y, x) * 180) / Math.PI;
    if (d < 0) d += 360;
    for (const sn of SNAPS) if (Math.abs(d - sn) < 3) d = sn;
    return Math.round(d) % 360;
  }
  function redrawSoon() {
    if (pend) return;
    pend = stage.frame(() => { pend = 0; draw({}); });
  }
  svgEl.addEventListener('pointerdown', (ev) => {
    if (!geo) return;
    const rect = svgEl.getBoundingClientRect();
    const k = svgEl.viewBox.baseVal.width / rect.width;
    const dx = (ev.clientX - rect.left) * k - geo.cx, dy = (ev.clientY - rect.top) * k - geo.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < geo.R * 0.35 || dist > geo.R * 1.4) return;
    dragging = true;
    try { svgEl.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    deg = angleFrom(ev);
    redrawSoon();
  });
  svgEl.addEventListener('pointermove', (ev) => { if (dragging) { deg = angleFrom(ev); redrawSoon(); } });
  const end = () => { dragging = false; };
  svgEl.addEventListener('pointerup', end);
  svgEl.addEventListener('pointercancel', end);
  svgEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') deg = (deg + 5) % 360;
    else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') deg = (deg + 355) % 360;
    else return;
    ev.preventDefault();
    redrawSoon();
  });

  function update(next) {
    state = normState(next);
    const key = stateKey(state);
    if (key === prev.key) return;
    const ph = phase();
    const before = prev.status === 'correct' ? 2 : prev.status === 'partial' ? 1 : 0;
    const anim = {
      first: prev.status == null,
      header: state.status !== prev.status,
      squares: ph >= 1 && before < 1,
      pulse: ph >= 1 && before >= 1,
      win: ph === 2 && before !== 2,
      shake: state.status === 'wrong',
    };
    prev = { key, status: state.status };
    draw(anim);
  }

  update(null);
  return { update, destroy: () => stage.destroy() };
}
