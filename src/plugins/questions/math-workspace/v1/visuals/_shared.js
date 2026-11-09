/**
 * Shared plumbing for the math-workspace@1 topic visuals (sequence, gauss,
 * pascal, unit-circle, parabola, number-line). Not a visual itself.
 *
 * createStage(hostEl, ctx, { css, render }) builds a wrapper + <svg> inside the
 * plugin's host div, re-renders on width changes (ResizeObserver, one per
 * frame) and owns every timer/raf so destroy() leaves nothing running.
 *
 * Animation rule used by every visual: the drawn geometry IS the final state;
 * entrance motion is an extra class (a-pop, a-drop, ...) whose keyframes only
 * say "from". A resize re-render simply leaves the classes off, and reduced
 * motion (ctx.reducedMotion or the media query) puts .mwv-still on the root,
 * which switches every animation and transition off. Nothing is ever hidden
 * waiting for an animation to reveal it.
 *
 * ctx.look 'plain' (a look whose celebration is a tick) puts .mwv-calm on the
 * root: burst() draws nothing, a 'star' icon is drawn as a tick, a 'spark' not at all.
 *
 * Colours: only var(--token) from src/ui/theme.css (custom properties inherit
 * into the shadow root). No literal colour values in this folder.
 */

export const NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element. attrs: plain attributes, plus 'text', 'cls', 'css'. */
export function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = String(v);
      else if (k === 'cls') n.setAttribute('class', v);
      else if (k === 'css') n.setAttribute('style', v);
      else n.setAttribute(k, typeof v === 'number' ? r2(v) : v);
    }
  }
  if (parent) parent.appendChild(n);
  return n;
}

/** Round to 2 decimals for attribute output. */
export const r2 = (v) => String(Math.round(v * 100) / 100);

/** A positioned group: outer <g translate> + inner <g> that may animate freely. */
export function at(parent, x, y, innerCls, innerCss) {
  const o = el('g', { transform: `translate(${r2(x)} ${r2(y)})` }, parent);
  return el('g', { cls: innerCls || null, css: innerCss || null }, o);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Close-enough test used for "did the student's value land". */
export function near(a, b) {
  if (!isNum(a) || !isNum(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) + 1e-12;
}

/** Plain number label: integers as-is (Indian grouping from 1e5), else up to 3 decimals. */
export function fmt(v) {
  if (!isNum(v)) return '?';
  if (Math.abs(v - Math.round(v)) < 1e-9) {
    const n = Math.round(v);
    return Math.abs(n) >= 100000 ? n.toLocaleString('en-IN') : String(n);
  }
  const a = Math.abs(v);
  const d = a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return String(Number(v.toFixed(d)));
}

/** "Nice" tick step for a span so that roughly `want` ticks fit. */
export function niceStep(span, want) {
  const raw = span / Math.max(1, want);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function prefersReduced(ctx) {
  if (ctx && ctx.reducedMotion) return true;
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}

/** Normalise the update() state so every visual can read it without guards. */
export function normState(s) {
  const st = s || {};
  return {
    student: st.student || {},
    expected: st.expected || {},
    status: ['idle', 'partial', 'correct', 'wrong'].includes(st.status) ? st.status : 'idle',
  };
}

/** Stable string of a state, to tell whether an update changed anything. */
export const stateKey = (s) => { try { return JSON.stringify(s); } catch { return String(Math.random()); } };

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

export function createStage(hostEl, ctx, opts) {
  const still = prefersReduced(ctx);
  const wrap = document.createElement('div');
  const calm = ctx?.look === 'plain';
  wrap.className = 'mwv' + (still ? ' mwv-still' : '') + (calm ? ' mwv-calm' : '') + (opts.kind ? ' mwv-' + opts.kind : '');
  const style = document.createElement('style');
  style.textContent = BASE_CSS + (opts.css || '');
  wrap.appendChild(style);
  const svg = el('svg', { cls: 'mwv-svg', role: 'img', 'aria-label': opts.label || 'Maths picture' });
  wrap.appendChild(svg);
  const overlay = document.createElement('div');
  overlay.className = 'mwv-over';
  wrap.appendChild(overlay);
  const live = document.createElement('div');
  live.className = 'mwv-sr';
  live.setAttribute('aria-live', 'polite');
  wrap.appendChild(live);
  hostEl.appendChild(wrap);

  const timers = new Set();
  const rafs = new Set();
  let width = Math.round(wrap.getBoundingClientRect().width) || 0;
  let pending = 0;
  let dead = false;

  const stage = {
    wrap, svg, overlay, still, calm, ctx,
    get width() { return width || 600; },
    /** Clear the svg and size it; returns the svg for drawing. */
    reset(h) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const w = this.width;
      svg.setAttribute('viewBox', `0 0 ${w} ${r2(h)}`);
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', r2(h));
      return svg;
    },
    later(fn, ms) {
      if (dead) return 0;
      const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
      timers.add(id);
      return id;
    },
    frame(fn) {
      if (dead) return 0;
      const id = requestAnimationFrame((t) => { rafs.delete(id); if (!dead) fn(t); });
      rafs.add(id);
      return id;
    },
    cancelFrame(id) { cancelAnimationFrame(id); rafs.delete(id); },
    clearTimer(id) { clearTimeout(id); timers.delete(id); },
    say(text) { live.textContent = text || ''; },
    get dead() { return dead; },
    destroy() {
      dead = true;
      if (ro) ro.disconnect();
      timers.forEach(clearTimeout); timers.clear();
      rafs.forEach(cancelAnimationFrame); rafs.clear();
      if (pending) cancelAnimationFrame(pending);
      wrap.remove();
    },
  };

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (!w || w === width) return;
      width = w;
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => { pending = 0; if (!dead) opts.onResize(); });
    });
    ro.observe(wrap);
  }
  return stage;
}

/* ------------------------------------------------------------------ */
/* Little drawing helpers shared by the visuals                         */
/* ------------------------------------------------------------------ */

/**
 * The look's chip: flat fill + solid lip, bold label. tone is a CSS colour
 * expression (var(--...)). Returns { g, w, h }. anchor: 'start'|'middle'|'end'.
 */
export function chip(parent, x, y, text, o = {}) {
  const fs = o.size || 13;
  const padX = o.padX || 10;
  const h = Math.round(fs * 1.9);
  const w = Math.round(textWidth(text, fs) + padX * 2 + (o.icon ? fs * 1.2 : 0));
  const ax = o.anchor === 'middle' ? x - w / 2 : o.anchor === 'end' ? x - w : x;
  const g = at(parent, ax, y, 'mwv-chip ' + (o.cls || ''), o.css || null);
  const fill = o.fill || 'var(--bg-surface)';
  const lip = o.lip || `color-mix(in oklab, ${fill} 74%, var(--mw-deep))`;
  el('rect', { x: 0, y: 3, width: w, height: h, rx: h / 2, css: `fill:${lip}` }, g);
  el('rect', { x: 0, y: 0, width: w, height: h, rx: h / 2, css: `fill:${fill}` }, g);
  let tx = padX;
  if (o.icon) {
    drawIcon(g, o.icon, padX + fs * 0.45, h / 2, fs * 0.5, o.ink || 'var(--text-main)');
    tx += fs * 1.2;
  }
  el('text', { x: tx, y: h / 2 + fs * 0.36, text, css: `font-size:${fs}px;fill:${o.ink || 'var(--text-main)'};font-weight: var(--fw-strong)` }, g);
  return { g, w, h };
}

/** Tiny vector icons: 'tick', 'cross', 'star', 'spark'. */
export function drawIcon(parent, kind, cx, cy, r, colour) {
  if ((kind === 'star' || kind === 'spark') && parent?.closest?.('.mwv-calm')) {
    if (kind === 'spark') return;
    kind = 'tick';
  }
  if (kind === 'tick') {
    el('path', { d: `M${cx - r} ${cy}L${cx - r * 0.25} ${cy + r * 0.75}L${cx + r} ${cy - r * 0.7}`,
      css: `fill:none;stroke:${colour};stroke-width:${Math.max(2, r * 0.45)};stroke-linecap:round;stroke-linejoin:round` }, parent);
  } else if (kind === 'cross') {
    el('path', { d: `M${cx - r * 0.7} ${cy - r * 0.7}L${cx + r * 0.7} ${cy + r * 0.7}M${cx + r * 0.7} ${cy - r * 0.7}L${cx - r * 0.7} ${cy + r * 0.7}`,
      css: `fill:none;stroke:${colour};stroke-width:${Math.max(2, r * 0.45)};stroke-linecap:round` }, parent);
  } else if (kind === 'star' || kind === 'spark') {
    const pts = [];
    const n = kind === 'star' ? 5 : 4;
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const rr = i % 2 ? r * (kind === 'star' ? 0.45 : 0.3) : r;
      pts.push(`${r2(cx + rr * Math.cos(a))} ${r2(cy + rr * Math.sin(a))}`);
    }
    el('path', { d: 'M' + pts.join('L') + 'Z', css: `fill:${colour};stroke:${colour};stroke-width:1;stroke-linejoin:round` }, parent);
  }
}

/** Approximate rendered width of a label (Fredoka/Nunito average). */
export function textWidth(text, fs) {
  let w = 0;
  for (const ch of String(text)) w += /[0-9]/.test(ch) ? 0.58 : /[ .,:;'()]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.66 : 0.54;
  return w * fs;
}

/** Confetti/sparkle burst at (x, y). Skipped under reduced motion. */
export function burst(stage, parent, x, y, o = {}) {
  if (stage.still || stage.calm) return;
  const n = o.count || 18;
  const spread = o.spread || 70;
  const g = el('g', { cls: 'mwv-burst', transform: `translate(${r2(x)} ${r2(y)})` }, parent);
  const tones = ['var(--content-series-1)', 'var(--content-series-2)', 'var(--content-series-3)',
    'var(--content-series-4)', 'var(--content-series-5)', 'var(--accent-gold)'];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
    const d = spread * (0.55 + ((i * 37) % 10) / 22);
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d - spread * 0.25;
    const tone = tones[i % tones.length];
    const css = `--dx:${r2(dx)}px;--dy:${r2(dy)}px;--rot:${(i * 67) % 360}deg;fill:${tone};animation-delay:${(i % 4) * 25}ms`;
    if (i % 3 === 0) drawIcon(el('g', { cls: 'mwv-conf', css }, g), 'spark', 0, 0, 5, tone);
    else if (i % 3 === 1) el('circle', { cx: 0, cy: 0, r: 3.2, cls: 'mwv-conf', css }, g);
    else el('rect', { x: -2, y: -4.5, width: 4, height: 9, rx: 1.5, cls: 'mwv-conf', css }, g);
  }
  stage.later(() => g.remove(), 1500);
}

/** An expanding ring (for "landed" moments). */
export function ring(stage, parent, x, y, r, colour) {
  if (stage.still) return;
  const c = el('circle', { cx: x, cy: y, r, cls: 'mwv-ring', css: `stroke:${colour}` }, parent);
  stage.later(() => c.remove(), 900);
}

/** Restart a CSS animation class on an element (for pulses on repeated updates). */
export function replay(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.getBoundingClientRect();
  node.classList.add(cls);
}

/** Ease helpers for JS tweens. */
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/* ------------------------------------------------------------------ */
/* Base CSS (shared by all visuals, injected once per mount)            */
/* ------------------------------------------------------------------ */

const BASE_CSS = `
.mwv {
  position: relative;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 1.5px 1.5px, var(--mw-board-dot) 1.4px, transparent 2px) 0 0 / 20px 20px,
    linear-gradient(170deg, var(--mw-board-bg) 0%, color-mix(in oklab, var(--mw-board-bg) 55%, var(--bg-surface)) 70%, color-mix(in oklab, var(--accent-gold) 8%, var(--bg-surface)) 100%);
  border: var(--rule-w, 2px) solid var(--border-color);
  box-shadow: var(--lip, 0 3px 0) var(--border-color);
  overflow: hidden;
  font-family: var(--font-heading);
  color: var(--text-main);
  -webkit-tap-highlight-color: transparent;
}
.mwv-svg { display: block; width: 100%; height: auto; overflow: visible; user-select: none; -webkit-user-select: none; }
.mwv text { font-family: var(--font-heading); fill: var(--text-main); font-weight: var(--fw-medium); }
.mwv .t-soft { fill: var(--text-muted); }
.mwv .t-num { font-variant-numeric: tabular-nums; }
.mwv-over { position: absolute; inset: auto 10px 10px auto; display: flex; gap: 8px; }
.mwv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.mwv-btn {
  font-family: var(--font-heading);
  font-weight: var(--fw-strong);
  font-size: 13px;
  border: none;
  border-radius: var(--radius-pill);
  padding: 7px 14px 6px;
  cursor: pointer;
  background: var(--bg-surface);
  color: var(--text-main);
  box-shadow: var(--press-1) var(--border-hover), 0 0 0 2px var(--border-color) inset;
  transition: transform var(--motion-fast);
  display: inline-flex; align-items: center; gap: 6px;
}
.mwv-btn:active { transform: translateY(var(--press-travel)); box-shadow: 0 0 0 2px var(--border-color) inset; }
.mwv-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
.mwv-btn.on { background: var(--primary-color); color: var(--on-primary); box-shadow: var(--press-1) var(--primary-hover); }
.mwv-btn svg { width: 14px; height: 14px; }

/* entrance + feedback motion; final state is always the un-animated state */
.mwv .a-pop   { transform-box: fill-box; transform-origin: center; animation: mwv-pop var(--motion-slow) var(--ease-spring) both; animation-delay: var(--d, 0ms); }
.mwv .a-fade  { animation: mwv-fade var(--motion-slow) var(--ease-settle) both; animation-delay: var(--d, 0ms); }
.mwv .a-rise  { transform-box: fill-box; transform-origin: 50% 100%; animation: mwv-rise 520ms var(--ease-spring) both; animation-delay: var(--d, 0ms); }
.mwv .a-drop  { animation: mwv-drop 620ms cubic-bezier(.3,1.35,.55,1) both; animation-delay: var(--d, 0ms); }
.mwv .a-miss  { animation: mwv-miss 900ms linear both; animation-delay: var(--d, 0ms); }
.mwv .a-shake { transform-box: fill-box; transform-origin: center; animation: mwv-shake 420ms ease both; animation-delay: var(--d, 0ms); }
.mwv .a-hop   { animation: mwv-hop 520ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
.mwv .a-pulse { transform-box: fill-box; transform-origin: center; animation: mwv-pulse 700ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
.mwv .a-draw  { stroke-dasharray: var(--len) var(--len); animation: mwv-draw 900ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
.mwv .a-grow-x { transform-box: fill-box; transform-origin: center; animation: mwv-grow-x 560ms var(--ease-settle) both; animation-delay: var(--d, 0ms); }
.mwv .bob     { animation: mwv-bob 2.4s ease-in-out infinite; animation-delay: var(--d, 0ms); }
.mwv .glow    { transform-box: fill-box; transform-origin: center; animation: mwv-glow 2.2s ease-in-out infinite; }

.mwv-conf { animation: mwv-conf 1.1s cubic-bezier(.15,.7,.35,1) both; transform-box: fill-box; transform-origin: center; }
.mwv-ring { fill: none; stroke-width: 3; transform-box: fill-box; transform-origin: center; animation: mwv-ring 800ms var(--ease-settle) both; }

@keyframes mwv-pop   { from { transform: scale(0); opacity: 0; } }
@keyframes mwv-fade  { from { opacity: 0; } }
@keyframes mwv-rise  { from { transform: scaleY(0); } }
@keyframes mwv-drop  { from { transform: translateY(var(--from, -160px)); opacity: 0; } 20% { opacity: 1; } }
@keyframes mwv-miss  {
  0% { transform: translateY(var(--from, -160px)); opacity: 0; }
  10% { opacity: 1; }
  38% { transform: translateY(var(--hit, 0px)); animation-timing-function: cubic-bezier(.2,.8,.4,1); }
  62% { transform: translateY(calc(var(--hit, 0px) - 26px)); animation-timing-function: cubic-bezier(.6,0,.8,.4); }
  100% { transform: translateY(0); }
}
@keyframes mwv-shake { 20% { transform: translateX(-6px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
@keyframes mwv-hop   { 35% { transform: translateY(-9px); } 70% { transform: translateY(1px); } }
@keyframes mwv-pulse { 40% { transform: scale(1.18); } }
@keyframes mwv-draw  { from { stroke-dashoffset: var(--len); } }
@keyframes mwv-grow-x { from { transform: scaleX(0); } }
@keyframes mwv-bob   { 50% { transform: translateY(-5px); } }
@keyframes mwv-glow  { 50% { opacity: .45; transform: scale(1.25); } }
@keyframes mwv-conf  { 0% { transform: translate(0,0) scale(.4) rotate(0); opacity: 1; } 70% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1) rotate(var(--rot)); opacity: 0; } }
@keyframes mwv-ring  { from { transform: scale(.4); opacity: 1; } to { transform: scale(2.4); opacity: 0; } }

.mwv-still *, .mwv-still *::before, .mwv-still *::after { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .mwv *, .mwv *::before, .mwv *::after { animation: none !important; transition: none !important; }
}
`;
