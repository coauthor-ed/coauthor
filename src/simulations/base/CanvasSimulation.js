import { SimulationBase } from './SimulationBase.js';
import { guardInteractiveCanvas } from './TouchGuard.js';
import { useLook, capCorners } from './kit/lookProfile.js';

// ── Type floor ────────────────────────────────────────────────────────────
// Scenes that set `ctx.font = '600 11px Inter'` in code bypass the kit's 14 px floor (366 canvas scenes did, 2026-10-04
// audit). With TYPE_FLOOR on, the scene's own context raises any px size under 14 to 14. It raises the text; it cannot make
// it fit: a label that no longer fits is a layout fix in the scene (migration runbook, WAVE-2). Keep MIN_PX equal to
// the kit's (kit/SimLook.js MIN_PX); the engine does not import the kit.
const FLOOR_PX = 14;
export function floorFontString(v) {
  return String(v).replace(/(\d+(?:\.\d+)?)px/, (m, n) => (parseFloat(n) < FLOOR_PX ? `${FLOOR_PX}px` : m));
}
/** Wrap the context's `font` setter. `desc` is the prototype's descriptor for 'font' (injected by tests); no accessor, no change. */
export function installFontFloor(ctx, desc = (typeof CanvasRenderingContext2D !== 'undefined'
  ? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font') : null)) {
  if (!ctx || !desc || !desc.set || !desc.get) return false;
  Object.defineProperty(ctx, 'font', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, floorFontString(v)); },
  });
  return true;
}


/**
 * CanvasSimulation — Abstract base for canvas-drawn simulations.
 *
 * Used for chemistry (molecular bonds, reactions), biology (cell division,
 * diffusion), and any simulation that needs a custom 2D drawing loop rather
 * than a rigid-body physics engine.
 *
 * Subclasses override:
 *   - async setup()             — call super.setup() then initialise scene data.
 *   - _tick(ctx, dt)            — draw one frame. Called at ~60fps while running.
 *   - _drawInitialFrame(ctx)    — optional: draw the static paused-state frame.
 *
 * Example subclass:
 *
 *   class PendulumCanvasScene extends CanvasSimulation {
 *     static WIDTH = 500; static HEIGHT = 400;
 *
 *     async setup() {
 *       await super.setup();
 *       this.angle = Math.PI / 4;  // initialise scene state
 *       this._drawInitialFrame(this._ctx);
 *     }
 *
 *     _tick(ctx, dt) {
 *       ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
 *       // ... draw pendulum
 *     }
 *   }
 */
export class CanvasSimulation extends SimulationBase {
  /** Controls are all visible and enabled unless a subclass says otherwise
   *  (SimControls calls these); a scene need not re-implement them. */
  isControlHidden() { return false; }
  isControlDisabled() { return false; }

  /** Override in subclass to set scene dimensions. */
  static WIDTH  = 600;
  static HEIGHT = 400;

  /** Comes to rest by default (inherited `false`, restated here so nobody
   *  "fixes" it): the loop parks once the animation budget runs out. Declare
   *  `static CONTINUOUS = true` in a subclass only for motion that never
   *  ends. A subclass keeps itself alive with `onBeatChange`/`onControlChange`
   *  (automatic) and `this.animateFor(ms)` from pointer handlers, timers and
   *  any run longer than DEFAULT_TRANSITION_MS - see SimulationBase's class
   *  doc for the full rules. */
  static CONTINUOUS = false;

  /** OPT-IN (measured 2026-10-05: removes about 75 percent of text issues but 15 percent of scenes then overflow, so it is not default-on).
   `static TYPE_FLOOR = true` in a scene raises canvas text set in code under 14 px to 14 (see installFontFloor); fix what overflows. */
  static TYPE_FLOOR = false;

  constructor(container) {
    super(container);
    this._canvas   = null;
    this._ctx      = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    const looking = useLook(this.container);   // the look drawing code reads with lookOf()
    if (looking) await looking;
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;

    this._canvas = document.createElement('canvas');
    this._canvas.width  = W;
    this._canvas.height = H;
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;';
    this.container.appendChild(this._canvas);
    // A canvas the scene wires a pointerdown on gets touch-action: none, so a finger drag
    // on it is not also a page scroll. (TOUCH_AUTO = false: the scene sets it itself.)
    if (this.constructor.TOUCH_AUTO !== false) guardInteractiveCanvas(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    capCorners(this._ctx);
    if (this.constructor.TYPE_FLOOR) installFontFloor(this._ctx);

    // Base class wires IntersectionObserver + visibilitychange
    await super.setup();
  }

  step(dtMs) {
    if (!this.allowResume || !this._ctx) return;
    this._tick(this._ctx, dtMs / 1000);
  }

  destroy() {
    if (this._canvas) this._canvas.remove();
    super.destroy();   // calls pause(), disconnects observer
  }

  /**
   * Default theme-change repaint: subclasses implementing `_reloadColors()`
   * get a live repaint for free. Never routes through resume()/start() — this
   * only repaints, it never begins/resumes advancing the simulation.
   */
  refreshTheme() {
    if (!this._ctx) return;
    if (this._hasStarted) {
      // Idempotent repaint of current state — advances nothing (dt=0), just
      // redraws with the freshly-reloaded this.colors. Requires _tick() to
      // fully clear+redraw each call (true for the standard pattern used here).
      this._tick(this._ctx, 0);
    } else {
      // Never started yet (e.g. a paused initial frame shown pre-play) — show
      // the initial pose, which is the correct state to be re-themed anyway.
      this._drawInitialFrame(this._ctx);
    }
  }

  // ── Abstract hooks ────────────────────────────────────────────────────────

  /**
   * Draw one animation frame. dt = seconds elapsed since last frame.
   * Must be overridden by subclass.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  _tick(_ctx, _dt) {
    throw new Error('CanvasSimulation._tick() must be overridden by the subclass.');
  }

  /**
   * Optional: draw the static initial scene shown before play is triggered.
   * Default is a no-op; subclasses may override for a meaningful first frame.
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawInitialFrame(_ctx) { /* no-op by default */ }

  get canvas() { return this._canvas; }
  get ctx()    { return this._ctx; }
}
