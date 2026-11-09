import { SimulationBase } from './SimulationBase.js';
import { SIM_UI_CSS } from './SimUi.js';
import { SIM_WORLD_CSS } from './kit/SimWorld.js';
import { guardGrabTargets } from './TouchGuard.js';
import { normalizeBeatMap } from './kit/beatMap.js';
import { paperKindOf, settingOf, resolveSetting } from './kit/paperKind.js';
import { useLook, lookOf, lookCss } from './kit/lookProfile.js';

/**
 * DomSimulation — abstract base for DOM/CSS/SVG-rendered simulations. A
 * sibling of CanvasSimulation, extending the same SimulationBase, so it
 * inherits the rAF loop (when used — see below), visibility/intersection
 * pausing and theme subscription unchanged.
 *
 * Pick this over CanvasSimulation for labelled panels, equation cards,
 * timelines, comparison layouts, flow diagrams — anything where the content
 * *is* boxes, arrows and text rather than continuous motion/geometry/
 * particles (see docs/simulation-authoring.md §3's pick-by-content-shape
 * table). The browser's own text layout produces markedly better results
 * than hand-computed `ctx.fillText` coordinates, and a scene driven by CSS
 * transitions has no animation loop at all — the compositor runs the
 * transition and stops on its own, off the main thread.
 *
 * Subclasses override:
 *   - async setup()          — call super.setup(), then `this.render({ html,
 *                               css })` (or build `this.root`'s tree and call
 *                               `injectStyle()`; order no longer matters).
 *   - _tick(dt)     [optional] — per-frame work, dt = seconds since last
 *                               frame, no `ctx` argument. Most DOM scenes
 *                               need this NOT AT ALL — a `data-step`
 *                               attribute on `this.root` plus CSS
 *                               transitions/animations keyed off it is
 *                               almost always the better mechanism (see
 *                               examples/simulations/ShiftSubtractScene.js
 *                               in the authoring kit). Defining `_tick` opts
 *                               the scene back into the rAF loop; leaving it
 *                               undefined means `start()` never touches
 *                               requestAnimationFrame at all.
 *
 * `this.root` (a `<div class="sim-dom-root">`, sized `WIDTH x HEIGHT` in the
 * scene's own design-space pixels) replaces `this._ctx` as the drawing
 * surface — build real DOM inside it. `setup()` scales it to the actual host
 * width via CSS `transform: scale()`, recomputed on a ResizeObserver, the
 * same "author at a fixed design size, render at any width" property a
 * canvas scene gets from `width:100%; height:auto` — a DOM scene never has
 * to reason about responsive breakpoints itself.
 *
 * Colors: use `var(--sim-label)` etc. directly in the CSS passed to
 * `injectStyle()`. No `readSimColors()`, no `COLOR_TOKEN_MAP`, no
 * `_reloadColors()` — theme switching happens for free through the CSS
 * cascade, and `refreshTheme()` is a no-op default (override only if a scene
 * tracks derived, non-CSS-cascade state from colors).
 *
 * Mixed canvas + DOM ("hybrid") falls out for free: a DomSimulation scene
 * may create a `<canvas>` and append it into `this.root` beneath
 * absolutely-positioned DOM labels — the same pattern WebGLSimulation-based
 * 3D scenes already use for crisp labels over a drawn/rendered surface (see
 * docs/simulation-authoring.md). Absolute positioning is legitimate for a
 * label pinned over such a canvas child — never for laying out the DOM
 * content itself (see examples/anti-patterns/ in the authoring kit for what
 * that failure looks like: reimplementing canvas coordinates in DOM, paying
 * canvas's costs with none of the benefit). If a DOM scene contains
 * per-element `left`/`top` pixel values outside that one case, it should
 * have been flex or grid.
 *
 * Dwell chains (a `BEAT_STEP_MAP`-style auto-advance after `dwellMs`) use
 * `SimulationBase.startDwellTimer()` — a real timer, not a per-frame
 * countdown — so a scene with no `_tick` at all can still use them.
 */
export class DomSimulation extends SimulationBase {
  /** Override in subclass — the scene's design-space size in CSS pixels.
   *  `setup()` builds `this.root` at exactly this size and scales it to fit
   *  the actual host width. */
  static WIDTH  = 900;
  static HEIGHT = 600;

  /** Optional. A subclass with a genuinely different portrait layout sets
   *  these; unset (the default) means today's exact behavior — the plain
   *  WIDTH/HEIGHT design renders at any orientation. */
  static PORTRAIT_WIDTH  = null;
  static PORTRAIT_HEIGHT = null;

  /** The host-width threshold _rescale() swaps WIDTH/HEIGHT for
   *  PORTRAIT_WIDTH/PORTRAIT_HEIGHT at, live, on every resize — not just at
   *  mount. Matches the app's existing "narrow viewport" convention
   *  (content-block.js/LessonSession.js's own 600px matchMedia breakpoint).
   *  Override only if a specific portrait design's crossover point genuinely
   *  differs. No effect unless PORTRAIT_WIDTH/PORTRAIT_HEIGHT are also set.
   *  Applies only to hosts that do not size the scene from the viewport
   *  orientation; under content-block.js the live viewport orientation
   *  decides instead (see _liveViewportPortrait()). */
  static PORTRAIT_BREAKPOINT_PX = 600;

  /** Optional readability floor for a side-by-side panel, as a fraction of the
   *  design size (e.g. 0.7). The host normally shrinks a side panel until its
   *  aspect-locked height fits the viewport; for a tall board that can mean
   *  rendering at half size, where the text is unreadable. A scene that sets
   *  this is placed below the text at full width instead of being shrunk past
   *  the floor. null (the default) keeps today's shrink-to-fit exactly. */
  static MIN_SCALE = null;

  /** Set true only once the scene's own root/_scaleWrap paints
   *  `background: transparent` instead of an opaque --sim-bg-* fill — lets
   *  content-block.js drop the surrounding card chrome for a scene designed
   *  to sit directly on the page. Two-part contract: flipping this without
   *  also making that paint change reintroduces the exact seam this exists
   *  to avoid (see docs/sprints/wip/dom-simulation-auto-layout.md §10.2). */
  static FRAMELESS = false;

  /** Optional declarative beats. Same shape scenes already wrote by hand:
   *  one entry per lesson beat, `[{ idx: <step>, dwellMs: null }]` (only the
   *  first entry is used). When set and the subclass defines no
   *  `onBeatChange` of its own, the base class clamps the beat, stores the
   *  step as `this.stepIndex`, mirrors it to `root.dataset.step` (the CSS
   *  `[data-step="N"]` hook) and then calls `this.onStep(step, beat)` if the
   *  scene defines it. A scene that needs more still defines onBeatChange. */
  static BEAT_STEP_MAP = null;

  /** Opt-in: size the design rectangle to the content that is showing, per
   *  beat and per orientation, instead of a hand-measured worst case. The
   *  declared HEIGHT/PORTRAIT_HEIGHT stay the initial hint before content
   *  mounts (host layout budget). Calls refit() after every onBeatChange,
   *  render() and orientation change. Not for boards whose content grows
   *  under the learner's hands unless they also call refit() when it does. */
  static FIT = false;

  /** Opt-in layout, so a scene never hand-sets HEIGHT from measurements:
   *    'fit'   - same as FIT = true (read-only beats: the frame is the content).
   *    'frame' - landscape: a FIXED WIDTH x HEIGHT frame (root gets .sim-frame,
   *              a flex column); put the part that grows in a .sim-scroll child,
   *              which scrolls, so header and footer stay pinned and the worst
   *              case never sets HEIGHT. Portrait: the measured content height
   *              (the page scrolls). Works with FILL_HEIGHT. */
  static LAYOUT = null;

  /** Opt-in: in a side-by-side panel, let the frame grow TALLER than HEIGHT to
   *  use the vertical room the viewport really has. The design WIDTH stays
   *  fixed (so text scales with the panel exactly as before) and HEIGHT becomes
   *  the minimum: the host still lays the panel out from WIDTH x HEIGHT, and
   *  this scene only adds design px below that. Needs the host to pass
   *  `config.fillHeight` (a function returning the panel's height budget in
   *  screen px, or null when the panel is not a side panel); any other host
   *  keeps the plain WIDTH x HEIGHT frame. The scene must lay itself out for
   *  any height >= HEIGHT (a flex column with a scrolling region does). */
  static FILL_HEIGHT = false;
  /** Tallest a filled frame may get, as a multiple of the minimum frame. */
  static FILL_MAX = 1.5;

  constructor(container, config) {
    super(container, config);
    this.root = null;
    this._scaleWrap = null;
    this._resizeObserver = null;
    this._injectedStyles = new Map();
    this._fillPx = null;
    this._onWindowSize = null;
    if (this.constructor.BEAT_STEP_MAP) this.stepIndex = 0;
    if (this.constructor.BEAT_STEP_MAP && typeof this.onBeatChange !== 'function') {
      // requestUiUpdate: a scene that gates CONTROLS by step (isControlHidden)
      // needs the host to re-render its control bar after the step changes.
      this.onBeatChange = (beatIndex) => { this._stepBeat(beatIndex); this.animateFor?.(); this.requestUiUpdate?.(); };
    }
    // Remember what the host sent, so the default getControlValue() below can show it: a host
    // re-renders its control bar (requestUiUpdate) and would otherwise snap a slider back to
    // its declared value - mid-drag, too.
    this._ctlSent = {};
    if (typeof this.onControlChange === 'function') {
      const own = this.onControlChange;
      this.onControlChange = (id, value, ...rest) => { this._ctlSent[id] = value; return own.call(this, id, value, ...rest); };
    }
    if (this._layoutKind() && typeof this.onBeatChange === 'function') {
      const inner = this.onBeatChange;
      this.onBeatChange = (...args) => { const r = inner.apply(this, args); this.relayout(); return r; };
    }
  }

  /** Last value the host sent for this control (undefined: the host shows the declared
   *  value). A scene that holds the value itself overrides this. */
  getControlValue(id) { return this._ctlSent?.[id]; }

  /** The declarative-beats default (see BEAT_STEP_MAP). */
  _stepBeat(beatIndex) {
    const map = normalizeBeatMap(this.constructor.BEAT_STEP_MAP, this.constructor.name);
    if (!Array.isArray(map) || !map.length) return;
    const n = Number.isFinite(beatIndex) ? Math.trunc(beatIndex) : 0;
    const beat = Math.max(0, Math.min(n, map.length - 1));
    const step = map[beat][0].idx;
    this.stepIndex = step;
    if (this.root) this.root.dataset.step = String(step);
    this.onStep?.(step, beat);
    this._paintRanges();
  }

  /** Keeps --sim-range-p (the SimUi slider skin's fill) on every range input under root, or on the one input given. */
  _paintRanges(only) {
    const list = only ? [only] : (this.root?.querySelectorAll('input[type="range"]') || []);
    for (const r of list) {
      const min = Number(r.min || 0);
      const max = Number(r.max || 100);
      const p = max > min ? ((Number(r.value) - min) / (max - min)) * 100 : 0;
      r.style.setProperty('--sim-range-p', `${Math.max(0, Math.min(100, p)).toFixed(1)}%`);
    }
  }

  /** Sizes the design rectangle to the visible content (measure, do not
   *  guess). Automatic when `static FIT = true`; a scene may also call it
   *  itself after content changes. Leaves root height auto, as the old
   *  shared fitToContent did. */
  refit() {
    if (!this.root || !this._scaleWrap) return;
    this.root.style.height = 'auto';
    const height = Math.ceil(this.root.offsetHeight);
    if (!height) return;
    this._designH = height;
    this._scaleWrap.style.aspectRatio = `${this._designW} / ${height}`;
  }

  _layoutKind() {
    const C = this.constructor;
    return C.LAYOUT === 'frame' ? 'frame' : (C.LAYOUT === 'fit' || C.FIT) ? 'fit' : null;
  }

  /** Re-apply LAYOUT (or FIT) after content changed: call it when the scene
   *  re-renders something under the learner's hands. No-op without either. */
  relayout() {
    const kind = this._layoutKind();
    if (kind === 'fit') this.refit();
    else if (kind === 'frame') this._frameFit();
  }

  _frameFit() {
    if (!this.root || !this._scaleWrap) return;
    const fixed = !this._isPortrait;
    this.root.classList.toggle('sim-frame', fixed);
    this._scaleWrap.style.height = '';
    if (fixed) {
      const height = this.constructor.HEIGHT;
      this._designH = height;
      this.root.style.height = `${height}px`;
      this._scaleWrap.style.aspectRatio = `${this._designW} / ${height}`;
      this.fillFrame();
      return;
    }
    this._fillPx = null;
    this.root.style.height = 'auto';
    const height = Math.ceil(this.root.offsetHeight);
    if (!height) return;
    this._designH = height;
    this._scaleWrap.style.aspectRatio = `${this._designW} / ${height}`;
  }

  /** FILL_HEIGHT: size the frame to min(host height budget, FILL_MAX x minimum),
   *  never below the minimum. Idempotent; returns true while a fill is applied.
   *  Only the design HEIGHT changes (the scale comes from the width), so it
   *  cannot feed back into the host's width decision. */
  fillFrame() {
    const C = this.constructor;
    if (!C.FILL_HEIGHT || !this.root || !this._scaleWrap) return false;
    const width = this._scaleWrap.clientWidth;
    const budget = this._isPortrait ? null : this.config?.fillHeight?.();
    if (!width || !(budget > 0)) {
      if (this._fillPx !== null) this._clearFill();
      return false;
    }
    const scale = width / this._designW;
    const minPx = C.HEIGHT * scale;
    const framePx = Math.round(Math.min(Math.max(minPx, budget), minPx * C.FILL_MAX));
    this._fillPx = framePx;
    this._designH = framePx / scale;
    this.root.style.height = `${this._designH}px`;
    this._scaleWrap.style.aspectRatio = 'auto';
    this._scaleWrap.style.height = `${framePx}px`;
    return true;
  }

  _clearFill() {
    this._fillPx = null;
    if (!this._scaleWrap || !this.root) return;
    const H = this._isPortrait ? this.constructor.PORTRAIT_HEIGHT : this.constructor.HEIGHT;
    this._designH = H;
    this.root.style.height = `${H}px`;
    this._scaleWrap.style.height = '';
    this._scaleWrap.style.aspectRatio = `${this._designW} / ${H}`;
  }

  async setup() {
    const looking = useLook(this.container);   // the look's --look-* properties, before any kit CSS is shown
    if (looking) await looking;
    const isPortrait = this._resolveIsPortrait();
    const usePortrait = isPortrait && this.constructor.PORTRAIT_WIDTH && this.constructor.PORTRAIT_HEIGHT;
    const W = usePortrait ? this.constructor.PORTRAIT_WIDTH  : this.constructor.WIDTH;
    const H = usePortrait ? this.constructor.PORTRAIT_HEIGHT : this.constructor.HEIGHT;
    this._designW = W;
    this._designH = H;
    this._isPortrait = usePortrait;

    this._scaleWrap = document.createElement('div');
    this._scaleWrap.className = 'sim-dom-scale-wrap';
    this._scaleWrap.style.cssText = `position:relative; width:100%; aspect-ratio:${W}/${H}; overflow:hidden;`;
    // The kit paper under .sl-backdrop: maths courses get graph paper (static PAPER overrides; kit/paperKind.js).
    this._scaleWrap.dataset.simPaper = paperKindOf(this.container, this.constructor.PAPER);
    this._scaleWrap.dataset.simBackdrop = lookOf().backdrop;
    // The look's id, for kit CSS that only one look wears (SimPanel's plain ruled table).
    this._scaleWrap.dataset.simLook = lookOf().id || 'quill';
    // The world behind the scene (kit/paperKind.js SETTINGS, SimLookDom's [data-sim-setting] rules): static SETTING, else the manifest's simSetting, else sky.
    this._scaleWrap.dataset.simSetting = resolveSetting(settingOf(this.container, this.constructor.SETTING), lookOf(), this._scaleWrap.dataset.simPaper);
    // How the casefile setting is drawn (LookProfile casefile: 'desk' | 'quiet'; kit/SimWorld.js).
    this._scaleWrap.dataset.simCasefile = lookOf().casefile || 'desk';

    // The shared component layer (SimUi.js) goes in first so a scene's own
    // injectStyle() CSS, appended later, wins at equal specificity.
    this.injectStyle(SIM_UI_CSS);
    // The world behind the scene (kit/SimWorld.js): a layer under the root, in the course's setting. A root that
    // paints its own opaque background covers it; a root left transparent stands in the world.
    this.injectStyle(SIM_WORLD_CSS);
    const world = document.createElement('div');
    world.className = 'sl-world';
    world.setAttribute('aria-hidden', 'true');
    this._scaleWrap.appendChild(world);

    this.root = document.createElement('div');
    this.root.className = 'sim-dom-root' + (usePortrait ? ' sim-dom-root--portrait' : '');
    this.root.style.cssText = `position:absolute; top:0; left:0; width:${W}px; height:${H}px; transform-origin:top left;`;

    this._scaleWrap.appendChild(this.root);
    this.container.appendChild(this._scaleWrap);
    // A touch that starts on a grab/move-cursor element drags it instead of scrolling the page.
    this._unguardGrab = guardGrabTargets(this._scaleWrap);

    this._resizeObserver = new ResizeObserver(() => this._rescale());
    this._resizeObserver.observe(this.container);
    // The wrapper can also resize on its own (a host capping its height in vh).
    this._resizeObserver.observe(this._scaleWrap);
    if (this.constructor.FILL_HEIGHT && typeof window !== 'undefined') {
      // The budget moves with the window height and the sticky chrome height,
      // neither of which resizes the wrapper's WIDTH (all the observer sees).
      this._onWindowSize = () => {
        if (this._windowRaf) return;
        this._windowRaf = requestAnimationFrame(() => { this._windowRaf = 0; this._rescale(); });
      };
      window.addEventListener('resize', this._onWindowSize);
      window.addEventListener('appbar-offset-changed', this._onWindowSize);
    }
    this._rescale();

    // Base class wires the theme:changed subscription.
    super.setup();
  }

  /** Viewport orientation (config.isPortrait, threaded from
   *  content-block.js's own matchMedia signal — see
   *  docs/sprints/wip/dom-simulation-auto-layout.md §4.2) takes precedence
   *  when supplied, since it's the same signal that already drove the
   *  surrounding text-placement decision and the two must never disagree.
   *  Falls back to measuring the host's own slot shape for a mount with no
   *  such config — simulationHost.js's question-companion panel,
   *  poe-observe-sim@1, or the authoring kit's own preview harness, none of
   *  which has a content-block.js column beside them to derive a viewport
   *  signal from. */
  _resolveIsPortrait() {
    if (typeof this.config?.isPortrait === 'boolean') return this.config.isPortrait;
    const w = this.container.clientWidth || 0;
    const h = this.container.clientHeight || 0;
    if (!w || !h) return false;
    return h > w;
  }

  _rescale() {
    if (!this.root || !this._scaleWrap) return;
    // Orientation follows the HOST's width, not the wrapper's: a host may cap
    // the wrapper (see --sim-aspect below), which must not flip the design.
    const hostWidth = this.container.clientWidth || this._scaleWrap.clientWidth;
    if (!hostWidth) return;
    this._reconcileOrientation(hostWidth);
    const kind = this._layoutKind();
    if (kind === 'fit' && this.root.childElementCount) this.refit();
    if (kind === 'frame' && this.root.childElementCount) this._frameFit();
    // Recomputed on every pass: a fill depends on the live budget, not just the width.
    else this.fillFrame();
    // --sim-aspect (design w / h) lets a host that caps the panel HEIGHT cap
    // the wrapper WIDTH instead (max-width: calc(cap * var(--sim-aspect))), so
    // the scene is scaled down to fit rather than cropped by the cap. A filled
    // frame publishes its MINIMUM aspect, so the value never depends on the
    // height it was just given.
    const aspectH = this._fillPx !== null ? this.constructor.HEIGHT : this._designH;
    this._scaleWrap.style.setProperty('--sim-aspect', String(this._designW / aspectH));
    const width = this._scaleWrap.clientWidth || hostWidth;
    this.root.style.transform = `scale(${width / this._designW})`;
  }

  /** The live viewport-orientation signal, but ONLY for a host that sized this
   *  scene from it (config.orientationFollowsViewport - content-block.js sets
   *  it). Otherwise null, meaning "decide from the host's own width".
   *
   *  Why it exists: content-block sizes a side-by-side panel from the design
   *  dimensions that match the VIEWPORT's orientation (its _activeSimDesignDims),
   *  and a side panel is only ~365-480px wide even on a wide desktop. Deciding
   *  by host width here would flip that scene to its (taller) portrait design
   *  AFTER the host had budgeted the panel for the landscape one, so the panel
   *  silently overflowed the viewport (measured 1180-1640px tall in a 720-900px
   *  viewport). Both sides must read the same signal. Hosts that do not size
   *  from the viewport (question-companion panels, poe-observe-sim, the
   *  authoring preview) keep the host-width rule unchanged. */
  _liveViewportPortrait() {
    if (!this.config?.orientationFollowsViewport) return null;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia('(orientation: portrait)').matches;
  }

  /** Live counterpart to setup()'s one-time portrait choice — runs on every
   *  ResizeObserver tick (window resize, column reflow, device rotation),
   *  not just at mount. `_resolveIsPortrait()`/`config.isPortrait` decide
   *  the FIRST paint (avoiding a flash of the wrong design before the host
   *  has real layout); this is what makes a scene actually respond to
   *  shrinking the browser window afterward, the same way any CSS
   *  `max-width` breakpoint would - the one thing setup()'s one-shot
   *  decision could never do on its own.
   *
   *  `hostWidth` (this._scaleWrap's own clientWidth) is the right live
   *  signal, not this.container's clientHeight or a matchMedia orientation
   *  re-check: _scaleWrap is `width:100%`, so its width comes straight from
   *  whatever the parent column/host actually gives it, independent of
   *  whichever aspect-ratio is currently active - unlike height, which
   *  *is* a function of the currently-chosen aspect-ratio and would just be
   *  measuring its own prior decision back at itself. */
  _reconcileOrientation(hostWidth) {
    const PW = this.constructor.PORTRAIT_WIDTH;
    const PH = this.constructor.PORTRAIT_HEIGHT;
    if (!PW || !PH) return; // nothing to switch to
    const shouldBePortrait = this._liveViewportPortrait() ?? (hostWidth < this.constructor.PORTRAIT_BREAKPOINT_PX);
    if (shouldBePortrait === this._isPortrait) return;
    this._isPortrait = shouldBePortrait;
    this._designW = shouldBePortrait ? PW : this.constructor.WIDTH;
    this._designH = shouldBePortrait ? PH : this.constructor.HEIGHT;
    this.root.classList.toggle('sim-dom-root--portrait', shouldBePortrait);
    this.root.style.width = `${this._designW}px`;
    this.root.style.height = `${this._designH}px`;
    this._scaleWrap.style.aspectRatio = `${this._designW}/${this._designH}`;
  }

  /** Adds one `<style>` for this scene - required, because the host lives
   *  inside the mounting plugin's Shadow DOM and no page stylesheet
   *  (including sim-theme.css's own tokens, which ARE still inherited
   *  through the shadow boundary as custom properties) reaches an ordinary
   *  `<link>`/global `<style>` rule.
   *
   *  The element is a child of the scale wrapper, a SIBLING of `this.root`,
   *  on purpose: a scene that later does `this.root.innerHTML = ...` (or
   *  `replaceChildren()`) replaces every child of root, and a style kept
   *  inside root silently vanished with it - the scene then mounted
   *  unstyled, with no error. A `<style>` applies wherever it sits in the
   *  shadow tree, so nothing else changes. Injecting the same text twice
   *  returns the existing element, so a scene may call this from a re-render
   *  path without piling up duplicates. Call order relative to the DOM
   *  build no longer matters. */
  injectStyle(cssText) {
    const known = this._injectedStyles.get(cssText);
    if (known) return known;
    const style = document.createElement('style');
    style.textContent = lookCss(cssText);
    this._scaleWrap.appendChild(style);
    this._injectedStyles.set(cssText, style);
    return style;
  }

  /** One-call mount for a scene: styles, root classes, the accessible group
   *  role, then the markup. Replaces the ~10 lines every scene repeated.
   *    html      - the scene's markup string (written into this.root); omit
   *                it to set the root up and fill it yourself afterwards
   *    css       - the scene's own CSS (optional; sim-ui CSS is already in)
   *    rootClass - extra class(es) for this.root; 'sim-ui' is always added
   *                unless `ui: false`
   *  The accessible name comes from `static ARIA_LABEL` on the subclass. */
  render({ html, css = '', rootClass = '', ui = true } = {}) {
    if (css) this.injectStyle(css);
    if (ui) this.root.classList.add('sim-ui');
    for (const c of String(rootClass).split(/\s+/).filter(Boolean)) this.root.classList.add(c);
    const label = this.constructor.ARIA_LABEL;
    if (label) {
      this.root.setAttribute('role', 'group');
      this.root.setAttribute('aria-label', label);
    }
    if (typeof html === 'string') this.root.innerHTML = html;
    if (!this._rangeHook) {
      this._rangeHook = (e) => { if (e.target?.type === 'range') this._paintRanges(e.target); };
      this.root.addEventListener('input', this._rangeHook);
    }
    this._paintRanges();
    this.relayout();
    return this.root;
  }

  /** Only starts the rAF loop if the subclass actually defines `_tick` —
   *  otherwise this is a no-op loop-wise (matches InteractiveSceneBase's
   *  contract for a scene with no frame loop): no requestAnimationFrame, no
   *  visibilitychange/IntersectionObserver wiring, since none of it has
   *  anything to pause/resume when CSS transitions are doing the animating. */
  start() {
    if (typeof this._tick !== 'function') {
      this._running = true;
      this._hasStarted = true;
      return;
    }
    super.start();
  }

  resume() {
    if (typeof this._tick !== 'function') return;
    super.resume();
  }

  step(dtMs) {
    if (!this.allowResume) return;
    this._tick?.(dtMs / 1000);
  }

  /** No-op by default — theme switching happens for free via the CSS
   *  cascade (var(--sim-*) tokens resolved live by the browser). Override
   *  only if a scene derives non-CSS-cascade state from `this.colors`. */
  refreshTheme() {}

  destroy() {
    if (this._onWindowSize) {
      window.removeEventListener('resize', this._onWindowSize);
      window.removeEventListener('appbar-offset-changed', this._onWindowSize);
      this._onWindowSize = null;
    }
    if (this._windowRaf) { cancelAnimationFrame(this._windowRaf); this._windowRaf = 0; }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this._unguardGrab?.();
    this._unguardGrab = null;
    if (this._scaleWrap) {
      this._scaleWrap.remove();
      this._scaleWrap = null;
    }
    this.root = null;
    this._injectedStyles = null;
    super.destroy();
  }
}
