/** SimClock.js
 * SimClock - the frame clock and the keyed live layer, for SvgScene and for any DomSimulation. SimSvg.js
 * re-exports all of it (import from either). Original code.
 *   SIM_LIVE_CSS          the chip, term and live-layer look (withClock injects it into a plain DomSimulation)
 *   liveLayer(st)         keyed live elements on st.live() (see its doc)
 *   liveHost(host)        a live layer straight on a plain element (see its doc)
 *   withClock(Base)       play / wake / skip / busy / animate on any DomSimulation (see its doc)
 */
import { dur } from './SimAnim.js';
import { applyToneInks } from './SimLookDom.js';

/** The chip, term and live-layer look on its own: what withClock injects into a plain DomSimulation. */
export const SIM_LIVE_CSS = `
.sv-over { position: absolute; inset: 0; pointer-events: none; }
.sv-over .sv-hit { pointer-events: auto; }
.sv-stage > svg.sv-live { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
.sv-live-over > * { position: absolute; left: 0; top: 0; }
.sv-term { white-space: pre; line-height: 1.2; display: inline-block; font-family: var(--sim-font-display, var(--sim-font)); }
.sv-measure { visibility: hidden; }
.sv-base { display: inline-block; width: 0; height: 0; vertical-align: baseline; }
.sv-sr { width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.sv-chip { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; padding: 3px 12px; border-radius: var(--look-pill);
  font: 800 var(--sim-text-md)/1.25 var(--sim-font); background: var(--c); color: var(--ci);
  box-shadow: 0 calc(3px * var(--look-lip)) 0 color-mix(in oklab, var(--c) 62%, black); }
.sv-chip--static { position: static; transform: none; display: inline-block; white-space: normal; max-width: 100%; text-align: center; }
.sv-chip--left { transform: translate(0, -50%); } .sv-chip--right { transform: translate(-100%, -50%); }
.sv-chip--big { font-size: var(--sim-text-xl); padding: 4px 16px; font-family: var(--sim-font-display, var(--sim-font)); }
.sv-chip--sm { font-size: var(--sim-text-sm); padding: 2px 9px; }
.sv-chip--plain { --c: var(--sim-bg-surface); --ci: var(--sim-label); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); box-shadow: 0 calc(3px * var(--look-lip)) 0 var(--sim-stroke); }
.sv-chip .sim-frac { font-size: 0.9em; }
.sv-card { position: absolute; padding: 8px 12px 10px; border-radius: var(--sim-radius-md); background: var(--sim-bg-surface); border: calc(2.5px * var(--look-rim)) solid var(--c);
  box-shadow: 0 calc(5px * var(--look-lip)) 0 color-mix(in oklab, var(--c) 55%, var(--sim-bg-deep)); display: flex; flex-direction: column; gap: 4px; pointer-events: auto; }
.sv-card__title { align-self: flex-start; padding: 1px 10px; border-radius: var(--look-pill); background: var(--c); color: var(--ci); font-weight: 800; font-size: var(--sim-text-sm); }
.sv-card__row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: var(--sim-text-md); font-weight: 700; }
.sv-card__row b { font: 800 var(--sim-text-lg)/1.1 var(--sim-font-display, var(--sim-font)); }
.sv-pop { animation: sv-pop 0.42s var(--look-spring) both; animation-delay: var(--d, 0s); }
@keyframes sv-pop { from { opacity: 0; scale: 0.3; } to { opacity: 1; scale: 1; } }
.sim-dom-root > svg.sv-live--free { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.sim-dom-root > .sv-live-over { z-index: 1; }
@media (prefers-reduced-motion: reduce) { .sv-live-over * { animation: none !important; transition: none !important; } }
`;


/**
 * liveLayer(st) - keyed elements on the stage's live layer (st.live()), moved by attribute and style
 * per frame instead of re-rendering. SvgScene builds one as this.live and sweeps it round every
 * animate() pass: an element not named in a pass is removed, so animate() just says what is on screen.
 *   el(key, { tag = 'span', cls, html, label, parent }) -> HTML element on the live overlay (html/cls set when
 *                                changed; parent: a live element to nest in)
 *   shape(key, tag = 'path', { cls, parent, html }) -> SVG element in the live svg (parent: a live 'g'; html:
 *                                markup inside it, set when it changes); created in call order
 *   attrs(el, { name: v }) / css(el, { prop: v })   write only what changed; null removes
 *   measure(html, { size, weight, cls }) -> { w, h, asc }   laid-out size of a .sv-term run in stage px
 *                                (asc: top to baseline); cached until reset()
 *   get(key), begin(t) / end() (the sweep), clear(), reset() (drops the measure cache)
 *   state(key, make) -> object     per-key recipe state (a flight, a draw), made once by make(), swept like
 *                                elements: a pass that does not ask for it drops it
 *   states(prefix) -> iterator      the live states whose key starts with prefix
 *   t                            the clock time of the current pass (begin(t) sets it)
 *   more()                       a recipe still moving says so: the clock runs another frame (withClock)
 *   skipping                     true on the pass skip() runs: recipes jump to their end
 */
export function liveLayer(st) {
  const L = st.live(), els = new Map(), seen = new Set(), sizes = new Map(), memo = new WeakMap();
  const states = new Map(), seenState = new Set();
  let sweeping = false, probe = null;
  const keep = (key, e) => { if (sweeping) seen.add(key); return e; };
  const setCls = (e, m, cls) => {
    if (cls == null || m.cls === cls) return;
    m.cls = cls;
    if (e.namespaceURI === 'http://www.w3.org/2000/svg' || typeof e.className !== 'string') e.setAttribute('class', cls);
    else e.className = cls;
  };
  const api = {
    el(key, o = {}) {
      let e = els.get(key);
      if (!e) { e = document.createElement(o.tag ?? 'span'); memo.set(e, { a: {}, s: {} }); els.set(key, e); (o.parent ?? L.over).appendChild(e); }
      const m = memo.get(e);
      setCls(e, m, o.cls);
      if (o.html != null && m.html !== o.html) { m.html = o.html; e.innerHTML = o.html; }
      if (o.label !== undefined) api.attrs(e, { 'aria-label': o.label });
      return keep(key, e);
    },
    shape(key, tag = 'path', o = {}) {
      let e = els.get(key);
      if (!e) {
        e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        memo.set(e, { a: {}, s: {} }); els.set(key, e);
        (o.parent ?? L.svg).appendChild(e);
      }
      const m = memo.get(e);
      setCls(e, m, o.cls);
      if (o.html != null && m.html !== o.html) { m.html = o.html; e.innerHTML = o.html; }
      return keep(key, e);
    },
    get: (key) => els.get(key) ?? null,
    t: 0, wantsMore: false, skipping: false,
    more() { api.wantsMore = true; },
    *states(prefix = '') { for (const [k, v] of states) if (k.startsWith(prefix)) yield v; },
    state(key, make) {
      let v = states.get(key);
      if (!v) { v = make(); states.set(key, v); }
      if (sweeping) seenState.add(key);
      return v;
    },
    attrs(e, a) {
      const m = memo.get(e) ?? { a: {}, s: {} };
      for (const k in a) {
        const v = a[k] == null ? null : String(a[k]);
        if (m.a[k] === v) continue;
        m.a[k] = v;
        if (v == null) e.removeAttribute(k); else e.setAttribute(k, v);
      }
      return e;
    },
    css(e, p) {
      const m = memo.get(e) ?? { a: {}, s: {} };
      for (const k in p) {
        const v = p[k] == null ? null : String(p[k]);
        if (m.s[k] === v) continue;
        m.s[k] = v;
        if (v == null) e.style.removeProperty?.(k); else e.style.setProperty(k, v);
      }
      return e;
    },
    measure(html, o = {}) {
      const size = o.size ?? 32, weight = o.weight ?? 800, cls = o.cls ?? '';
      const key = `${size}|${weight}|${cls}|${html}`;
      let m = sizes.get(key);
      if (m) return m;
      if (!probe) { probe = document.createElement('span'); probe.setAttribute('aria-hidden', 'true'); L.over.appendChild(probe); }
      probe.className = `sv-term sv-measure ${cls}`;
      probe.style.setProperty('font-size', `${size}px`);
      probe.style.setProperty('font-weight', String(weight));
      probe.innerHTML = `${html}<i class="sv-base"></i>`;
      const r = probe.getBoundingClientRect?.(), b = probe.querySelector?.('.sv-base')?.getBoundingClientRect?.();
      const ow = L.over.offsetWidth, k = ow > 0 && L.over.getBoundingClientRect ? L.over.getBoundingClientRect().width / ow || 1 : 1;
      if (r && r.width > 0) m = { w: r.width / k, h: r.height / k, asc: b ? (b.top - r.top) / k : size * 0.96 };
      else m = { w: String(html).replace(/<[^>]*>/g, '').length * size * 0.56, h: size * 1.2, asc: size * 0.96 };
      sizes.set(key, m);
      return m;
    },
    begin(t) { sweeping = true; seen.clear(); seenState.clear(); api.wantsMore = false; if (t != null) api.t = t; },
    end() {
      sweeping = false;
      for (const [k, e] of els) if (!seen.has(k)) { e.remove(); els.delete(k); }
      for (const k of states.keys()) if (!seenState.has(k)) states.delete(k);
    },
    clear() { for (const e of els.values()) e.remove(); els.clear(); sizes.clear(); states.clear(); api.wantsMore = false; },
    reset() { sizes.clear(); },
  };
  return api;
}

/**
 * liveHost(host) - a live layer straight on a plain element (a DomSimulation's root): an SVG and an overlay
 * div over everything in it, in its own px (no viewBox: one SVG unit = one design px). Same shape as an
 * svgStage for liveLayer: { W, H, portrait, live(), point(evt), anchor(el, ax, ay) }. anchor: a point of a
 * DOM element (ax, ay 0..1 across its box) in host px, so a token can fly from one card to another. live()
 * puts the two nodes back if the host's innerHTML was replaced, so a scene may re-render under them.
 */
export function liveHost(host) {
  let L = null;
  const st = {
    get W() { return host.offsetWidth || 0; },
    get H() { return host.offsetHeight || 0; },
    get portrait() { return !!host.classList?.contains('sim-dom-root--portrait'); },
    live() {
      if (!L) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'sv-live sv-live--free');
        svg.setAttribute('aria-hidden', 'true');
        const over = document.createElement('div');
        over.className = 'sv-over sv-live-over';
        L = { svg, over };
      }
      if (L.svg.parentNode !== host) host.appendChild(L.svg);
      if (L.over.parentNode !== host) host.appendChild(L.over);
      return L;
    },
    point(e) {
      const r = host.getBoundingClientRect(), k = host.offsetWidth ? r.width / host.offsetWidth : 1;
      return { x: (e.clientX - r.left) / (k || 1), y: (e.clientY - r.top) / (k || 1) };
    },
    anchor(el, ax = 0.5, ay = 0.5) {
      const b = el?.getBoundingClientRect?.();
      if (!b) return { x: 0, y: 0 };
      const r = host.getBoundingClientRect(), k = (host.offsetWidth ? r.width / host.offsetWidth : 1) || 1;
      return { x: (b.left - r.left + b.width * ax) / k, y: (b.top - r.top + b.height * ay) / k };
    },
  };
  return st;
}

// A play() or wake() never runs longer than this past its own length, even if a recipe keeps asking.
const CLOCK_CAP = 20;

/**
 * withClock(Base) - the frame clock and the keyed live layer as a mixin, for any DomSimulation:
 *   class Board extends withClock(DomSimulation) { animate(st, t) { ...this.live... } }
 * SvgScene is withClock(DomSimulation) with its stage as the clock stage. On a plain DomSimulation the live
 * layer is liveHost(this.root) (an SVG and an overlay over the whole root, design px) and SIM_LIVE_CSS is
 * injected on first use, so liveChip and kit/SimMorphSvg, SimFlySvg, SimFocusSvg, SimDrawOnSvg work there.
 *   animate(st, t)       per-frame hook: say what is on the live layer at clock time t (st: the clock stage)
 *   play(seconds)        frames for dur(seconds) from clock 0 (reduced motion: one frame at the end), then
 *                        on while a recipe calls live.more(); then it stops (no idle loop)
 *   wake()               frames from the CURRENT clock while a recipe calls live.more() (a retarget after a
 *                        tap); liveFrame() wakes by itself when a pass asks for more
 *   skip() -> bool       jump a running clock to its end (recipes see live.skipping and land)
 *   isPlaying(), busy()  true while frames run
 *   liveFrame()          one pass at the current clock (after the scene re-renders its own DOM)
 *   clockReset()         stop, clock 0, empty the live layer (call it on a step change; SvgScene does)
 *   clockStage()         the stage passed to animate (override to supply one; default liveHost(this.root))
 * Reserved fields: clock, _clockRaf, _clockLen, _clockHost, _live, _waking.
 */
export function withClock(Base) {
  return class ClockScene extends Base {
    clockStage() {
      if (!this._clockHost && this.root) {
        this.injectStyle?.(SIM_LIVE_CSS);
        applyToneInks(this.root);
        this._clockHost = liveHost(this.root);
      }
      return this._clockHost;
    }

    /** The keyed live layer (created on first use). */
    get live() {
      if (!this._live) { const st = this.clockStage(); if (st) this._live = liveLayer(st); }
      return this._live;
    }

    play(seconds) {
      this._stopClock();
      this._clockLen = seconds;
      const end = dur(seconds);
      if (!(end > 0) || typeof requestAnimationFrame !== 'function') { this.clock = seconds; this._liveFrame(); return; }
      this.clock = 0;
      this._runClock(end);
    }

    wake() {
      if (this._clockRaf) return;
      if (this.clock == null) this.clock = 0;
      if (!dur(1) || typeof requestAnimationFrame !== 'function') { this._liveFrame(); return; }
      this._runClock(this.clock);
    }

    _runClock(end) {
      const t0 = performance.now() - this.clock * 1000;
      this._liveFrame(false);
      const tick = (now) => {
        this._clockRaf = 0;
        if (!this.root || !this.clockStage()) return;
        const real = Math.max(0, (now - t0) / 1000);
        if (real < end) {
          this.clock = real;
          this._liveFrame(false);
          this._clockRaf = requestAnimationFrame(tick);
          return;
        }
        // Past the end: land exactly on it, then run on in real time only while a recipe asks for more.
        this.clock = this._liveMore() ? real : Math.max(end, this.clock);
        const more = this._liveFrame(false);
        if (more && real < end + CLOCK_CAP) this._clockRaf = requestAnimationFrame(tick);
        else this.requestUiUpdate?.();
      };
      this._clockRaf = requestAnimationFrame(tick);
    }

    _liveMore() { return !!this._live?.wantsMore; }

    skip() {
      if (!this._clockRaf) return false;
      this._stopClock();
      this.clock = Math.max(this.clock ?? 0, this._clockLen ?? 0);
      const lv = this.live;
      if (lv) lv.skipping = true;
      try { this._liveFrame(false); } finally { if (lv) lv.skipping = false; }
      this.requestUiUpdate?.();
      return true;
    }

    isPlaying() { return !!this._clockRaf; }
    busy() { return this.isPlaying(); }

    liveFrame() { this._liveFrame(); }

    clockReset() {
      this._stopClock();
      this.clock = 0;
      this._live?.clear();
    }

    _stopClock() {
      if (this._clockRaf) cancelAnimationFrame(this._clockRaf);
      this._clockRaf = 0;
    }

    /** One pass; true if a recipe asked for more. autoWake: start the clock if it is idle and one did. */
    _liveFrame(autoWake = true) {
      if (typeof this.animate !== 'function') return false;
      const st = this.clockStage();
      if (!st) return false;
      st.live();
      const lv = this.live;
      lv.begin(this.clock ?? 0);
      try { this.animate(st, this.clock ?? 0); } finally { lv.end(); }
      const more = lv.wantsMore;
      if (more && autoWake && !this._clockRaf && !this._waking) {
        this._waking = true;
        try { this.wake(); } finally { this._waking = false; }
      }
      return more;
    }

    destroy() {
      this._stopClock();
      this._live?.clear();
      this._live = null;
      this._clockHost = null;
      super.destroy();
    }
  };
}
