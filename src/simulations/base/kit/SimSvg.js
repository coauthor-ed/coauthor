/**
 * SimSvg - the SVG-in-DOM surface for data shapes (number lines, charts,
 * geometry, chance). An SVG whose viewBox is its host's width in design px, so
 * text is never scaled down and portrait gets its own layout (the scene reads
 * stage.W and lays out for it). Chips and maths are HTML on an overlay (real
 * text, readable by screen readers); shapes and tick numbers are SVG.
 *
 *   const st = svgStage(hostEl, { height: 400, portraitHeight: 520 });
 *   st.W, st.H, st.portrait               the current design size
 *   st.render(svgMarkup, overlayHtml, backMarkup)   replace the drawing (back: a clipped decoration layer)
 *   st.point(evt) -> { x, y }             a pointer event in stage coords (for drags)
 *   st.onResize(fn)                       fn() when the width or orientation changes (re-lay out, re-render)
 *   st.live() -> { svg, over }            lazily mount the live layer: an SVG over the drawing and an overlay
 *                                         div over the chips, both kept across render() (see liveLayer)
 *   st.destroy()
 *   chip(text | html, x, y, { tone, align, cls, math, size }) -> overlay HTML   a pill chip centred on (x, y)
 *   liveChip(live, key, text, x, y, { ...chip, alpha, scale }) -> element   the same chip on the live layer
 *   cardHtml(x, y, w, title, rows, { tone }) -> overlay HTML   a reading card (rows [{ label, value, tone }])
 *   SIM_SVG_CSS                           the shared look: chips, cushions, draw/grow/pop animations
 *   SvgScene                              DomSimulation base with one stage (see its doc)
 *   backdropSvg(st, { seed, floorY })     the floor band (the paper is the .sl-backdrop CSS)
 *   liveLayer(st)                         keyed elements on st.live() for per-frame motion (SimClock.js)
 *   liveHost(host), withClock(Base)       the live layer and the frame clock on any DomSimulation (SimClock.js)
 * Markup helpers: tone(n) -> 'var(--sim-series-n)', fill(col), stroke(col, w), shade(col),
 * glossOf(col), cushionRect, cushionCircle, panelSvg(rect) (style= fills: attributes cannot take var()). Colours are CSS
 * tokens only; call applyToneInks (SimLookDom) on the host for chip inks (svgStage does).
 */
import { esc } from 'simulations/base/SimUi.js';
import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { touchGuard } from 'simulations/base/TouchGuard.js';
import { SIM_LOOK_DOM_CSS, burst, applyToneInks } from './SimLookDom.js';
import { SIM_LIVE_CSS, liveLayer, liveHost, withClock } from './SimClock.js';
import { normalizeBeatMap } from './beatMap.js';
import { lookOf, lookSvg } from './lookProfile.js';
import { stagePoint } from './SimFind.js';

export { SIM_LIVE_CSS, liveLayer, liveHost, withClock };

/** Append a <tag class=cls> to parent (skeletons built with createElement work in every host, even one with no HTML parser). */
export function mountEl(parent, cls, tag = 'div') {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

export const tone = (n) => (typeof n === 'number' ? `var(--sim-series-${((Math.max(1, n | 0) - 1) % 8) + 1})` : n);
export const inkVar = (n) => (typeof n === 'number' ? `var(--sim-ink-on-${((Math.max(1, n | 0) - 1) % 8) + 1}, var(--sim-bg-deep))` : 'var(--sim-label)');

export const SIM_SVG_CSS = `
.sv-stage { position: relative; width: 100%; }
.sv-stage > svg { display: block; width: 100%; height: auto; overflow: visible; position: relative; }
.sv-stage > .sv-back { position: absolute; inset: -12px -16px; width: calc(100% + 32px); height: calc(100% + 24px); overflow: hidden; pointer-events: none; }
` + SIM_LIVE_CSS + `svg .sv-pop, svg .sv-grow { transform-box: fill-box; transform-origin: center; }
svg .sv-grow { transform-origin: bottom; animation: sv-grow 0.7s var(--look-spring-soft) both; animation-delay: var(--d, 0s); }
@keyframes sv-grow { from { transform: scaleY(0); } to { transform: none; } }
svg .sv-draw { stroke-dasharray: var(--len, 2000); stroke-dashoffset: var(--len, 2000); animation: sv-draw var(--dur, 0.8s) ease forwards; animation-delay: var(--d, 0s); }
@keyframes sv-draw { to { stroke-dashoffset: 0; } }
svg .sv-breathe { transform-box: fill-box; transform-origin: center; animation: sv-breathe 1.6s ease-in-out infinite; }
@keyframes sv-breathe { 50% { transform: scale(1.12); } }
svg text { font-family: var(--sim-font); font-weight: var(--look-text-weight, 800); }
.sv-drag { cursor: grab; touch-action: none; }
.sv-drag:active { cursor: grabbing; }
@media (prefers-reduced-motion: reduce) { .sv-stage * { animation: none !important; transition: none !important; } }
`;

/** A pill chip on the overlay, centred on (x, y) in stage px (static: in the flow, e.g. the title row). @opts tone, align, cls, math, size, static, delay */
export function chip(text, x, y, o = {}) {
  const { c, ci, cls } = chipLook(o);
  const body = o.math ? text : esc(text);
  return `<span class="${cls}" style="${o.static ? '' : `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;`}${c ? `--c:${c};--ci:${ci};` : ''}${o.delay != null ? `--d:${o.delay}s` : ''}">${body}</span>`;
}

function chipLook(o) {
  const t = o.tone ?? 'accent';
  const c = typeof t === 'number' ? tone(t) : t === 'plain' ? '' : `var(--sim-${t})`;
  const ci = typeof t === 'number' ? inkVar(t) : `var(--sim-ink-on-${t}, var(--sim-bg-deep))`;
  const cls = ['sv-chip', o.static ? 'sv-chip--static' : '', o.align ? `sv-chip--${o.align}` : '', o.size ? `sv-chip--${o.size}` : '', t === 'plain' ? 'sv-chip--plain' : '', o.cls ?? ''].filter(Boolean).join(' ');
  return { c, ci, cls };
}

/**
 * chip() on the live layer (liveLayer), keyed: same look and options (not static), plus per-frame
 * o.alpha and o.scale. Created with cls 'sv-pop' it pops in once, when it first appears.
 */
export function liveChip(live, key, text, x, y, o = {}) {
  const { c, ci, cls } = chipLook(o);
  const e = live.el(key, { cls, html: o.math ? text : esc(text) });
  return live.css(e, { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px`, '--c': c || null, '--ci': c ? ci : null,
    '--d': o.delay != null ? `${o.delay}s` : null, opacity: o.alpha != null ? o.alpha.toFixed(3) : null, scale: o.scale != null ? o.scale.toFixed(3) : null });
}

/** Mount an SVG stage in host (see the header). @opts height, portraitHeight, label */
export function svgStage(host, o = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sv-stage';
  host.appendChild(wrap);
  const listeners = [];
  let live = null;
  const st = {
    W: 0, H: 0, portrait: false, wrap,
    measure() {
      st.portrait = !!host.closest?.('.sim-dom-root--portrait');
      st.W = Math.max(200, Math.round(host.clientWidth || (st.portrait ? 348 : 648)));
      st.H = typeof o.height === 'function' ? o.height(st) : st.portrait ? (o.portraitHeight ?? o.height ?? 360) : (o.height ?? 360);
    },
    render(svg, over = '', back = '') {
      const pic = (back ? `<svg class="sv-back" viewBox="0 0 ${st.W} ${st.H}" aria-hidden="true">${back}</svg>` : '')
        + `<svg class="sv-main" viewBox="0 0 ${st.W} ${st.H}" width="${st.W}" height="${st.H}" role="img"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${lookSvg(svg)}</svg>`;
      const ov = `<div class="sv-over">${over}</div>`;
      if (!live) { wrap.innerHTML = pic + ov; return; }
      // The live layer survives: swap only the painted nodes round it (back, main, live svg, over, live over).
      for (const n of [...wrap.children]) if (n !== live.svg && n !== live.over) n.remove();
      live.svg.setAttribute('viewBox', `0 0 ${st.W} ${st.H}`);
      live.svg.insertAdjacentHTML('beforebegin', pic);
      live.svg.insertAdjacentHTML('afterend', ov);
    },
    live() {
      if (live) return live;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'sv-live');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('viewBox', `0 0 ${st.W} ${st.H}`);
      const over = document.createElement('div');
      over.className = 'sv-over sv-live-over';
      wrap.appendChild(svg);
      wrap.appendChild(over);
      live = { svg, over };
      return live;
    },
    point(e) {
      const svg = wrap.querySelector('.sv-main');
      const r = svg.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * st.W, y: ((e.clientY - r.top) / r.height) * st.H };
    },
    onResize(fn) { listeners.push(fn); },
    destroy() { ro.disconnect(); wrap.remove(); },
  };
  let last = '';
  const ro = new ResizeObserver(() => {
    const before = last;
    st.measure();
    last = `${st.W}x${st.H}:${st.portrait}`;
    if (last !== before) { applyToneInks(host); for (const fn of listeners) fn(); }
  });
  ro.observe(host);
  st.measure();
  last = `${st.W}x${st.H}:${st.portrait}`;
  applyToneInks(host);
  return st;
}

/**
 * A reading card on the overlay at (x, y), w wide: a title chip, then label /
 * value rows. rows: [{ label, value, tone }] (value may be HTML with html: true). @opts tone
 */
export function cardHtml(x, y, w, title, rows, o = {}) {
  const t = o.tone ?? 'accent';
  const c = typeof t === 'number' ? tone(t) : `var(--sim-${t})`;
  const ci = typeof t === 'number' ? inkVar(t) : `var(--sim-ink-on-${t}, var(--sim-bg-deep))`;
  return `<div class="sv-card" style="left:${x}px;top:${y}px;width:${w}px;--c:${c};--ci:${ci}">`
    + (title ? `<span class="sv-card__title">${esc(title)}</span>` : '')
    + rows.map((r) => `<div class="sv-card__row"><span>${esc(r.label)}</span><b style="color:${r.tone != null ? (typeof r.tone === 'number' ? `var(--sim-series-${r.tone}-ink, ${tone(r.tone)})` : `var(--sim-${r.tone})`) : 'var(--sim-label)'}">${r.html ? r.value : esc(r.value)}</b></div>`).join('')
    + '</div>';
}

/** style="fill:..." (SVG fill attributes cannot take var() or color-mix; style can). */
export const fill = (col, extra = '') => `style="fill:${col}${extra ? ';' + extra : ''}"`;
export const stroke = (col, w, extra = '') => `style="fill:none;stroke:${col};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round${extra ? ';' + extra : ''}"`;
export const shade = (col, k = 62) => `color-mix(in oklab, ${col} ${k}%, black)`;
export const glossOf = (col, k = 45) => `color-mix(in oklab, ${col} ${k}%, white)`;

/** A chart's panel card at rect r: a lip under it (look lip; none at 0), a rim (look rim). SimChart and SimPlotSvg. */
export function panelSvg(r, rx = 14) {
  const L = lookOf();
  return (L.lip ? `<rect x="${r.x}" y="${r.y + 5 * L.lip}" width="${r.w}" height="${r.h}" rx="${rx}" ${fill(shade('var(--sim-bg-surface)', 65))}/>` : '')
    + `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}" ${fill('var(--sim-bg-surface)', `stroke:var(--sim-stroke);stroke-width:${2.5 * L.rim}`)}/>`;
}

/** Cushioned rounded rect: a darker lift under a fill, and a gloss strip. @opts lift, gloss, cls */
export function cushionRect(x, y, w, h, r, col, o = {}) {
  const L = lookOf(), lift = (o.lift ?? 4) * L.lip, rx = r * L.radius, gr = Math.min(rx, w * 0.2);
  return `<g${o.cls ? ` class="${o.cls}"` : ''}${o.style ? ` style="${o.style}"` : ''}>${L.lip ? `<rect x="${x}" y="${y + lift}" width="${w}" height="${h}" rx="${rx}" ${fill(shade(col))}/>` : ''}`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${fill(col)}/>`
    + (o.gloss === false || !L.gloss || w < 20 || h < 12 ? '' : `<rect x="${x + gr}" y="${y + 3}" width="${Math.max(0, w - 2 * gr)}" height="${Math.max(2, Math.min(5, h * 0.12))}" rx="2" ${fill(glossOf(col), `opacity:${0.7 * L.gloss}`)}/>`) + '</g>';
}

/** Cushioned circle. @opts lift, gloss */
export function cushionCircle(x, y, r, col, o = {}) {
  const L = lookOf();
  return (L.lip ? `<circle cx="${x}" cy="${y + (o.lift ?? r * 0.16) * L.lip}" r="${r}" ${fill(shade(col))}/>` : '') + `<circle cx="${x}" cy="${y}" r="${r}" ${fill(col)}/>`
    + (o.gloss === false || !L.gloss || r < 6 ? '' : `<circle cx="${x - r * 0.32}" cy="${y - r * 0.36}" r="${r * 0.28}" ${fill(glossOf(col, 35), `opacity:${0.75 * L.gloss}`)}/>`);
}

/**
 * The floor behind a stage (the paper itself is the root's .sl-backdrop CSS, so it runs on unbroken
 * under the title row): from floorY, paper tinted 15% series-4 laid as a TRANSLUCENT tint so the
 * paper grain shows through, a soft contact shade above the seam, faint perspective seams and a lit
 * lip. Mirrors SimLook drawFloor. SvgScene paints it on every repaint. @opts floorY (seed, n: ignored)
 */
export function backdropSvg(st, o = {}) {
  if (o.floorY == null) return '';
  const fy = o.floorY, X = -40, WW = st.W + 80, fh = st.H - fy + 40;
  if (lookOf().backdrop === 'flat') {
    return `<rect x="${X}" y="${fy}" width="${WW}" height="${fh}" ${fill('color-mix(in srgb, var(--sim-label) 5%, transparent)')}/>`
      + `<rect x="${X}" y="${fy - 0.5}" width="${WW}" height="1" ${fill('color-mix(in srgb, var(--sim-label) 28%, transparent)')}/>`;
  }
  // The floor tone of the setting (SimLookDom sets --sl-floor on the world backdrops); on the paper, paper tinted 15% series-4.
  const tint = 'var(--sl-floor, color-mix(in srgb, var(--sim-series-4) 15%, transparent))';
  const sh = (pct) => `color-mix(in srgb, ${shade('color-mix(in srgb, var(--sim-bg-surface) 80%, var(--sim-series-5))', 55)} ${pct}%, transparent)`;
  let out = `<rect x="${X}" y="${fy}" width="${WW}" height="${fh}" ${fill(tint)}/>`
    + `<rect x="${X}" y="${fy - 12}" width="${WW}" height="12" ${fill(sh(5))}/>`
    + `<rect x="${X}" y="${fy}" width="${WW}" height="${Math.min(fh, 18)}" ${fill(sh(7))}/>`
    + `<rect x="${X}" y="${fy}" width="${WW}" height="${Math.min(fh, 8)}" ${fill(sh(6))}/>`;
  if (st.H - fy > 24) {
    const cx = st.W / 2, gap = 92, nSide = Math.ceil(cx / gap) + 1;
    let d = '';
    for (let i = -nSide; i <= nSide; i++) { const x = cx + i * gap; d += `M${x.toFixed(1)} ${fy + 12}L${(x + (x - cx) * 0.45).toFixed(1)} ${st.H + 40}`; }
    out += `<path d="${d}" ${stroke(sh(16), 1.5)}/>`;
  }
  return out + `<rect x="${X}" y="${fy - 1}" width="${WW}" height="1.5" ${fill(sh(28))}/>`
    + `<rect x="${X}" y="${fy + 0.5}" width="${WW}" height="3" ${fill('color-mix(in srgb, var(--sim-bg-surface) 45%, transparent)')}/>`;
}

/**
 * SvgScene - a DomSimulation whose picture is one SVG stage (plus a title row).
 * Subclass hooks (all optional except paint):
 *   stageHeight(st) -> px      height for the stage at st.W / st.portrait (default 430 landscape, 520 portrait)
 *   enter(step)                reset what this step owns (called on every step change, then paint)
 *   paint(st) -> { svg, over, head, floor }   the whole picture for the current state (head: title-row
 *                              HTML; floor: y of a floor band; backdropSvg is painted under it)
 *   pointerDown/Move/Up(p)     stage coords; return true from Move to repaint
 *   css()                      extra CSS
 *   animate(st, t)             optional per-frame hook: update keyed this.live elements (liveLayer) for
 *                              clock time t. Runs after paint on every repaint, and on every frame of play().
 * this.stepIndex, this.repaint(), this.after(seconds, fn) (dropped on a step change), this.celebrate().
 * Frame clock (withClock): this.play(seconds) runs frames for dur(seconds), then stops (no idle loop);
 * this.clock is seconds since play() (the end at once under reduced motion). this.skip() jumps a running
 * play to its end (true if it was running); this.isPlaying() and busy() say whether it runs; wake() keeps
 * frames going from the current clock while a recipe (flyTo) still moves. A step change or destroy cancels
 * it and empties the live layer.
 * LAYOUT 'fit': the frame is the content, in both orientations.
 */

export class SvgScene extends withClock(DomSimulation) {
  static WIDTH = 680;
  static HEIGHT = 520;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 720;
  static LAYOUT = 'fit';

  refreshTheme() { this.repaint(); }

  clockStage() { return this.sv ?? null; }

  async setup() {
    await super.setup();
    this.stepIndex = 0;
    this.clock = 0;
    this._timers = [];
    this.render({ css: SIM_LOOK_DOM_CSS + SIM_SVG_CSS + SVG_SCENE_CSS + (this.css?.() ?? ''), rootClass: 'sl-backdrop svs' });
    this._head = mountEl(this.root, 'svs-head');
    const host = mountEl(this.root, 'svs-host');
    this.sv = svgStage(host, { height: (st) => this.stageHeight(st), label: this.constructor.ARIA_LABEL });
    this.sv.onResize(() => this.repaint());
    const wrap = this.sv.wrap;
    this._pd = (e) => { if (typeof this.pointerDown === 'function' && this.pointerDown(this.sv.point(e)) !== false) { this._drag = true; try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } } };
    this._pm = (e) => { if (this._drag && this.pointerMove?.(this.sv.point(e))) this.repaint(); };
    this._pu = (e) => { if (!this._drag) return; this._drag = false; this.pointerUp?.(this.sv.point(e)); this.repaint(); };
    wrap.addEventListener('pointerdown', this._pd);
    wrap.addEventListener('pointermove', this._pm);
    wrap.addEventListener('pointerup', this._pu);
    wrap.addEventListener('pointercancel', this._pu);
    // Chrome ignores touch-action on SVG children, so .sv-drag alone lets the page scroll under a handle drag.
    this._unguard = touchGuard(wrap, () => this._drag);
    this.enter?.(0);
    this.repaint();
  }

  stageHeight(st) { return st.portrait ? 520 : 430; }

  onBeatChange(beat, count) {
    const C = this.constructor;
    const map = normalizeBeatMap(C.BEAT_MAPS?.[count] ?? C.BEAT_STEP_MAP ?? [[{ idx: 0 }]], C.name);
    const b = Math.max(0, Math.min(map.length - 1, Math.trunc(Number.isFinite(beat) ? beat : 0)));
    const step = map[b][0].idx;
    this.root.dataset.step = String(step);
    if (step !== this.stepIndex) {
      this.stepIndex = step;
      for (const t of this._timers) clearTimeout(t);
      this._timers = [];
      this.clockReset();
      this.enter?.(step);
    }
    this.repaint();
    this.requestUiUpdate?.();
  }

  repaint() {
    if (!this.sv) return;
    this.sv.measure();
    const out = this.paint(this.sv) ?? {};
    this._head.innerHTML = out.head ?? '';
    this.sv.render(out.svg ?? '', out.over ?? '', backdropSvg(this.sv, { seed: 3 + this.stepIndex, floorY: out.floor }));
    applyToneInks(this.root);
    if (typeof this.animate === 'function') { this.live.reset(); this._liveFrame(); }
    this.relayout();
  }

  /** fn after `seconds`, unless the step changes first. */
  after(seconds, fn) {
    const step = this.stepIndex;
    const id = setTimeout(() => { this._timers = this._timers.filter((t) => t !== id); if (this.stepIndex === step && this.sv) fn(); }, seconds * 1000);
    this._timers.push(id);
    return () => clearTimeout(id);
  }

  /** The find (SimFind.js): at stage point (x, y), else the middle of the stage. o: burst's `at` options
   *  (o.stamp: the word the casefile setting stamps, default CONFIRMED). */
  celebrate(x, y, o = {}) {
    if (x && typeof x === 'object') { o = x; x = undefined; y = undefined; }   // celebrate({ stamp })
    const sv = this.sv;
    if (!sv) return;
    const at = Number.isFinite(x) && Number.isFinite(y) ? { ...o, ...stagePoint(sv.wrap, x, y, sv.W, sv.H) } : o;
    burst(sv.wrap.parentNode, 0, at);
  }

  destroy() {
    for (const t of this._timers ?? []) clearTimeout(t);
    const w = this.sv?.wrap;
    if (w) { w.removeEventListener('pointerdown', this._pd); w.removeEventListener('pointermove', this._pm); w.removeEventListener('pointerup', this._pu); w.removeEventListener('pointercancel', this._pu); }
    this._unguard?.();
    super.destroy();
    this.sv?.destroy();
  }
}

const SVG_SCENE_CSS = `
.svs { padding: var(--sim-space-3) var(--sim-space-4); }
.svs-head { display: flex; align-items: center; justify-content: center; gap: var(--sim-space-2); flex-wrap: wrap; min-height: 34px; }
.svs-head:empty { display: none; }
[data-sim-setting="casefile"] .svs-head { margin: 34px 0 2px; }
.svs-host { position: relative; }
`;
