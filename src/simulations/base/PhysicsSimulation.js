import { SimulationBase } from './SimulationBase.js';

// Module-level singleton so Matter.js is loaded exactly once per page,
// regardless of how many physics simulations are mounted.
let _matterModule = null;

/**
 * PhysicsSimulation — Abstract base for rigid-body physics scenes.
 *
 * Adds Matter.js engine/runner/render wiring on top of SimulationBase lifecycle.
 * Matter.js is loaded lazily on first call to setup() — never eager.
 *
 * Subclasses override setup() to add bodies to the world:
 *
 *   async setup() {
 *     await super.setup();           // loads Matter, creates engine/runner/render
 *     const M = this.Matter;
 *     const ball = M.Bodies.circle(200, 100, 20, { restitution: 0.8 });
 *     M.Composite.add(this.engine.world, [ball]);
 *   }
 *
 * Subclasses may override pause()/resume() to add overlay animation hooks,
 * but MUST call super.pause()/super.resume() to stop/start the runner.
 *
 * Default canvas dimensions can be overridden via static WIDTH/HEIGHT.
 */
export class PhysicsSimulation extends SimulationBase {
  /** Override in subclass to set scene dimensions. */
  static WIDTH  = 600;
  static HEIGHT = 400;
  /** Matter's own Runner/Render loop (M.Runner.run/M.Render.run, started in
   *  resume() below) is separate from SimulationBase's rAF loop and isn't
   *  gated by its animation budget either way — but a subclass that overrides
   *  step()/_tick() to sync an overlay canvas to the physics world (see the
   *  class doc's "overlay animation hooks") needs SimulationBase's own loop
   *  to keep scheduling for as long as Matter itself is stepping, i.e.
   *  always. See docs/sprints/wip/dom-simulations-md-prose-and-explanation-
   *  slides.md §5. */
  static CONTINUOUS = true;

  constructor(container) {
    super(container);
    this.Matter = null;   // set after initMatter()
    this.engine = null;
    this.render = null;
    this.runner = null;
  }

  // ── Matter.js lazy load ───────────────────────────────────────────────────

  async _initMatter() {
    if (!_matterModule) {
      const mod  = await import('vendor/matter.js');
      _matterModule = mod.default || mod;
    }
    this.Matter = _matterModule;
    return _matterModule;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Creates engine, renderer, and runner. Subclasses call super.setup() first,
   * then add their specific bodies.
   */
  async setup() {
    await this._initMatter();
    const M = this.Matter;
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;

    this.engine = M.Engine.create();
    this.render = M.Render.create({
      element: this.container,
      engine:  this.engine,
      options: { width: W, height: H, wireframes: false },
    });
    this.runner = M.Runner.create();

    // Base class wires IntersectionObserver + visibilitychange
    await super.setup();
  }

  pause() {
    super.pause();
    if (this.Matter && this.runner) this.Matter.Runner.stop(this.runner);
  }

  resume() {
    if (!this.allowResume) return;
    super.resume();
    if (this.Matter && this.runner && !this.runner.enabled) {
      this.Matter.Runner.run(this.runner, this.engine);
      this.Matter.Render.run(this.render);
    }
  }

  /**
   * Renders a single static frame (useful for showing the initial paused state).
   */
  renderFrame() {
    if (this.Matter && this.render) this.Matter.Render.world(this.render);
  }

  /**
   * Default theme-change repaint. Matter's own render loop (Matter.Render.run,
   * separate from SimulationBase's rAF loop) reads render.options.background
   * and each body's render.fillStyle/strokeStyle fresh every frame, so once
   * this.colors and any body render props are updated (in the subclass's
   * `_reloadColors()`), a *running* sim picks the change up on its next
   * internal frame automatically. A paused/never-started sim needs one
   * explicit repaint — via renderFrame(), never resume()/start().
   */
  refreshTheme() {
    if (this.render && this.colors?.background) {
      this.render.options.background = this.colors.background;
    }
    if (!this._running) this.renderFrame();
  }

  destroy() {
    if (this.render?.canvas) this.render.canvas.remove();
    super.destroy();   // calls pause(), disconnects observer
  }
}
