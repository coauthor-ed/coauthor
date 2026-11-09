/**
 * InteractiveSceneBase — Abstract base class for all simulations (rAF or DOM based).
 * 
 * Provides basic lifecycle hooks without dictating the render loop (unlike SimulationBase).
 */
export class InteractiveSceneBase {
  /**
   * @param {HTMLElement} container The stable DOM element to mount within
   * @param {object} config Opaque sim-specific configuration
   */
  constructor(container, config = {}) {
    this.container = container;
    this.config = config;
  }

  /** Override: create world/context/initial state once. */
  async setup() {}

  /** Override: release GPU/canvas/engine resources. Must be idempotent. */
  destroy() {}

  /** Override: pause any timers or loops. */
  pause() {}

  /** Override: resume any timers or loops. */
  resume() {}

  /**
   * Override (optional): the few values a test reads, as a plain object of numbers, strings and
   * booleans, e.g. { stage: this.stage, picked: this._sel, locked: !!this._done }. drive.mjs
   * exposes it as d.state(); probes read it instead of private fields.
   */
  testState() { return {}; }

  /**
   * Wire bounded ArrowRight/ArrowLeft navigation on `el` (typically the
   * scene's own canvas) without hand-rolling `addEventListener('keydown', ...)`
   * + `preventDefault()` yourself — a pattern that's easy to get wrong.
   * Calling `preventDefault()` unconditionally, even once a step sequence
   * is already clamped at its first/last position and the key didn't
   * actually move anything, permanently traps ArrowRight/Left inside the
   * simulation: the keydown never bubbles out to LessonSession, which
   * treats an *unconsumed* arrow key as "advance/retreat the slide". (This
   * exact bug shipped twice in the perimeter-and-area course before this
   * helper existed.)
   *
   * `stepFn(dir)` — `dir` is `+1` for ArrowRight, `-1` for ArrowLeft — must
   * return whether it actually changed anything. `preventDefault()` (and
   * therefore the swallowing of the key) only happens when it did; at a
   * boundary the key is left alone so it bubbles out normally.
   *
   * @param {HTMLElement} el
   * @param {(dir: 1 | -1) => boolean} stepFn
   * @returns {() => void} unbind — call from the scene's own destroy(), the
   *   same place any other manually-added listener already gets removed.
   */
  bindArrowNavigation(el, stepFn) {
    const handler = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (stepFn(e.key === 'ArrowRight' ? 1 : -1)) e.preventDefault();
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }
}
