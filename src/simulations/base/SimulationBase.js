import { InteractiveSceneBase } from './InteractiveSceneBase.js';
import { EventBus } from '../../core/EventBus.js';

/**
 * SimulationBase — abstract lifecycle for Canvas/WebGL/Matter.js simulations.
 *
 * Canonical location. The shim in src/core/components/SimulationBase.js
 * re-exports from here (backward compat).
 *
 * Subclasses override setup(), step(dtMs), destroy().
 * The rAF loop is managed here; subclasses never call requestAnimationFrame directly.
 * (HLD Appendix C.5, Appendix B.2)
 *
 * Theme reactivity: subclasses that want live light/dark repaint implement
 * `_reloadColors()` (re-populate `this.colors`) and `refreshTheme()` (repaint
 * only — see CanvasSimulation/PhysicsSimulation for default implementations).
 * Both are optional no-ops for scenes that haven't been migrated yet.
 *
 * ── The come-to-rest mechanism, and who actually uses it (docs/sprints/wip/
 * dom-simulations-md-prose-and-explanation-slides.md §5) ─────────────────────
 * The rAF loop CAN run only while something has asked it to, via a self-
 * clearing animation budget (`animateFor()`), parking (scheduling nothing)
 * once that budget expires — no "clear the flag" obligation, so no way to
 * forget one; a budget that is never extended simply expires on its own.
 * `onBeatChange`/`onControlChange` extend it automatically (`_wrapAnimateHooks()`
 * below), so a scene whose state changes ONLY in response to those two, with
 * no internal timer/animation longer than `DEFAULT_TRANSITION_MS`, needs zero
 * explicit `animateFor()` calls to benefit from it.
 *
 * `static CONTINUOUS` is `false` for every base class except `PhysicsSimulation`
 * and `ParticleSimulation` (Matter must keep stepping; Brownian motion never
 * settles), which declare `true`. POLICY (battery and CPU on low-end devices):
 * a scene comes to rest by default and declares `static CONTINUOUS = true`
 * only when its motion genuinely never ends (an orbit, an endless pulse, a
 * looping final beat), with a one-line reason. A `false` scene must:
 *   - implement `onBeatChange`/`onControlChange` - defining them is what wires
 *     the automatic `animateFor()`; a scene with neither draws one frame and
 *     then parks for good;
 *   - call `this.animateFor(ms)` itself from anything else that changes what
 *     is drawn: pointer/drag handlers, its own timers and dwell chains, and any
 *     run, easing or scripted sequence longer than `DEFAULT_TRANSITION_MS`
 *     (pass the real duration);
 *   - end every run/motion (time limit, settled threshold, exited flag);
 *   - never reuse this class's internal names for its own fields or methods
 *     (`_running`, `_rafId`, `_lastTs`, `_hasStarted`, `_animateUntil`,
 *     `_dwellTimerId`, `_visibilityHandler`, `_intersectionObserver`,
 *     `_themeHandler`) - doing so breaks parking/starting with no error.
 * Older scenes that relied on an always-running loop must declare
 * `static CONTINUOUS = true` or be fixed to follow the rules above; classify
 * them with tools/sim-test/audit-continuous.mjs.
 *
 * `CanvasSimulation.refreshTheme()`/`WebGLSimulation.refreshTheme()` repaint
 * by calling `_tick()` directly, never through the loop — a theme toggle on
 * a resting scene still repaints correctly, budget or no budget.
 */
export class SimulationBase extends InteractiveSceneBase {
  /** Milliseconds an unparameterized `animateFor()` call keeps the loop
   *  running for — long enough for a scene's own CSS/JS transition triggered
   *  by a beat or control change to finish before the loop parks again.
   *  Deliberately generous: a scene's own entrance/settle animation (e.g. a
   *  globe-to-map fly-in, a mitosis stage transition) can legitimately run
   *  several seconds — real examples measured across shipped scenes include
   *  a 3.4s globe intro, a 2.2s flip transition, and a 4.5s mitosis stage —
   *  and this is the ONLY thing standing between "the transition finishes"
   *  and "the scene freezes mid-animation, silently, with no error" for any
   *  scene that doesn't explicitly call `animateFor()` itself (i.e. every
   *  scene written before this mechanism existed). Getting this wrong in
   *  the too-short direction is a correctness bug a student sees; getting
   *  it wrong in the too-long direction only costs a few extra seconds of
   *  battery on an already-idle scene — the asymmetry that sets this
   *  default high rather than tight. A scene with a still-longer known
   *  entrance sequence should call `this.animateFor(ms)` itself with its
   *  own real duration rather than everyone relying on this number growing
   *  to fit the slowest scene that exists. */
  static DEFAULT_TRANSITION_MS = 8000;

  /** Opt-in for genuinely perpetual motion - see the class doc comment.
   *  Default false: a scene comes to rest once nothing is animating it. */
  static CONTINUOUS = false;

  /**
   * Narrated lessons (NarrationPacer.js, content-block narration contract).
   * All optional and feature-detected; a scene that defines none of them
   * keeps working through onBeatChange alone.
   *   onCue(id)            fired at a narration cue's word time, and by the
   *                        text mode's CUE anchors: once per beat either way.
   *   static SEEKABLE      true for a time-pure scene, which then also gets
   *   seek(beat, ms)       the beat (0-based) and ms into its narration at
   *                        each beat start, resume, scrub and ~8 times a second.
   *   getState()/setState(s)  plain JSON of the learner's control values;
   *                        narrated, saved on leaving a slide and handed back
   *                        after setup() when the learner returns.
   *   freeRect()           where captions may sit without covering the
   *                        picture: { x, y, w, h } in 0..1 of the scene's
   *                        host, or null (the default) for "nowhere special".
   */
  static SEEKABLE = false;

  freeRect() { return null; }

  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {object} config  Opaque sim-specific config
   */
  constructor(container, config) {
    super(container, config);
    this._rafId = null;
    this._lastTs = null;
    this._running = false;
    this._hasStarted = false;
    this._visibilityHandler = this._onVisibilityChange.bind(this);
    this._intersectionObserver = null;
    this._themeHandler = null;
    this._animateUntil = 0;   // performance.now() timestamp; loop parks once past this
    this._dwellTimerId = null;
    this._wrapAnimateHooks();
  }

  /**
   * Extends the running budget: the loop keeps scheduling itself until
   * `performance.now()` passes `now + ms`, then parks. Restarts the loop if
   * it was already parked. Idempotent to call redundantly — the budget only
   * ever grows within one call (`Math.max`), never shrinks.
   * @param {number} [ms] defaults to `static DEFAULT_TRANSITION_MS`
   */
  animateFor(ms = this.constructor.DEFAULT_TRANSITION_MS) {
    const now = performance.now();
    this._animateUntil = Math.max(this._animateUntil, now + ms);
    if (this._running && this._rafId == null) {
      this._rafId = requestAnimationFrame(this._loop.bind(this));
    }
  }

  /**
   * Wraps `onBeatChange`/`onControlChange`, if the subclass defines either,
   * so simply defining them is enough to get `animateFor()` for free — the
   * engine's own call sites (content-block.js, simulationHost.js) are
   * unchanged, they still just call `scene.onBeatChange?.(...)`. Safe to run
   * in this constructor: every subclass reaches it via `super()` before its
   * own constructor body can read or call either method, and both are
   * conventionally plain prototype methods — already resolvable through
   * `this` the moment the instance exists, not instance fields assigned
   * later in a subclass constructor. An instance-property wrap (not
   * prototype editing), so it only ever affects this one instance.
   */
  _wrapAnimateHooks() {
    for (const name of ['onBeatChange', 'onControlChange', 'onCue']) {
      const orig = this[name];
      if (typeof orig !== 'function') continue;
      this[name] = (...args) => {
        const result = orig.apply(this, args);
        this.animateFor();
        return result;
      };
    }
  }

  /**
   * Starts (or restarts) a single dwell timer: after `ms`, extends the
   * animation budget and calls `onFire()` — the mechanism a `BEAT_STEP_MAP`-
   * style auto-advance chain should use instead of walking a per-frame
   * countdown inside `_tick`/`step` (the `_tickBeatChain(dt)` pattern several
   * scenes have hand-rolled). Clears any previously pending dwell timer
   * first, so restarting a chain (e.g. from `onBeatChange`) never leaves two
   * overlapping. Also let's a `DomSimulation` (no `_tick`/frame loop at all)
   * use dwell chains without defining one just for this.
   */
  startDwellTimer(ms, onFire) {
    this.clearDwellTimer();
    this._dwellTimerId = setTimeout(() => {
      this._dwellTimerId = null;
      this.animateFor();
      onFire();
    }, ms);
  }

  /** Cancels a pending dwell timer, if any. Called automatically from
   *  pause()/stop() — a scene only needs to call this itself to abandon a
   *  chain early (e.g. the student navigated away from it by hand). */
  clearDwellTimer() {
    if (this._dwellTimerId != null) {
      clearTimeout(this._dwellTimerId);
      this._dwellTimerId = null;
    }
  }

  /** Override: create world/context/initial state once. Subclasses must call super.setup(). */
  setup() {
    // Subscribe once — theme changes must be caught even before start() (e.g.
    // a paused initial frame shown pre-play), so this happens in setup(), not start().
    if (!this._themeHandler) {
      this._themeHandler = () => {
        this._reloadColors?.();
        this.refreshTheme?.();
      };
      EventBus.on('theme:changed', this._themeHandler);
    }
  }

  /** Override: advance simulation by dtMs milliseconds. */
  step(dtMs) {} // eslint-disable-line no-unused-vars

  /** Override: release GPU/canvas/engine resources. Must be idempotent. */
  destroy() {}

  /** Start the rAF-driven loop. Call from plugin's connectedCallback. */
  start() {
    if (this._running) return;
    this._running = true;
    this._hasStarted = true;
    this._lastTs = performance.now();
    this._rafId = requestAnimationFrame(this._loop.bind(this));

    // Pause when tab is backgrounded (battery saving on low-end, HLD §18)
    document.addEventListener('visibilitychange', this._visibilityHandler);

    // Pause when scrolled out of view (IntersectionObserver, HLD §18)
    if (this.container) {
      this._intersectionObserver = new IntersectionObserver(entries => {
        const visible = entries[0].isIntersecting;
        if (visible) this.resume(); else this.pause();
      }, { threshold: 0.1 });
      this._intersectionObserver.observe(this.container);
    }
  }

  /** Stop the loop and release all resources. Call from plugin's disconnectedCallback. */
  stop() {
    if (this._themeHandler) {
      EventBus.off('theme:changed', this._themeHandler);
      this._themeHandler = null;
    }
    this.clearDwellTimer();
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this._running = false;
    document.removeEventListener('visibilitychange', this._visibilityHandler);
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }
    this.destroy();
  }

  _loop(ts) {
    if (!this._running) return;
    const dt = ts - (this._lastTs ?? ts);
    this._lastTs = ts;
    this.step(Math.min(dt, 100)); // cap at 100ms to avoid spiral-of-death on tab-resume
    // Keep scheduling only while something is still animating — see the
    // class doc comment. The very first frame after start() always runs
    // (drawing the initial pose); after that, an unextended budget parks.
    if (this.constructor.CONTINUOUS || ts < this._animateUntil) {
      this._rafId = requestAnimationFrame(this._loop.bind(this));
    } else {
      this._rafId = null;
    }
  }

  pause() {
    this.clearDwellTimer();
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  resume() {
    if (!this._running || this._rafId) return;
    this._lastTs = performance.now();
    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }

  _onVisibilityChange() {
    if (document.hidden) this.pause(); else this.resume();
  }
}
