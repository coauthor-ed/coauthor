import { PhysicsSimulation } from '../base/PhysicsSimulation.js';
import { readSimColors } from '../base/SimTheme.js';

// Maps onto sim-theme.css's closed palette (docs/sprints/wip/dom-simulations-
// md-prose-and-explanation-slides.md §4) rather than a private
// --sim-pendulum-* set — bob is the scene's own "state" accent, pivot/string
// are structural chrome.
const TOKEN_MAP = {
  background:   ['--sim-bg-surface', '#111827'],
  bobFill:      ['--sim-accent', '#818cf8'],
  bobStroke:    ['--sim-accent-hover', '#6366f1'],
  pivotFill:    ['--sim-label-muted', '#94a3b8'],
  pivotStroke:  ['--sim-stroke', '#475569'],
  stringStroke: ['--sim-label-muted', '#94a3b8'],
};

/**
 * PendulumScene — Simple pendulum rigid-body simulation.
 *
 * Demonstrates the standard pattern for adding a new PhysicsSimulation subclass:
 *   1. Override static WIDTH/HEIGHT for scene dimensions.
 *   2. Override setup() — call super.setup() first, then add Matter.js bodies.
 *   3. No pause/resume/destroy overrides needed unless adding overlay canvases.
 *
 * Physics: a bob (circle) connected to a fixed pivot via a Constraint.
 * The bob swings under gravity demonstrating simple harmonic motion.
 *
 * Theme reactivity: colors are read once via readSimColors() in setup(), then
 * re-read in _reloadColors() (called by SimulationBase on every theme change).
 * Matter reads render.options.background and each body's render.fillStyle/
 * strokeStyle fresh every frame, so reapplying them here is enough — no need
 * to recreate the bodies or the Render.
 *
 * @example
 *   const scene = new PendulumScene(containerEl);
 *   scene.allowResume = false;   // hold paused until student predicts
 *   await scene.setup();
 *   scene.renderFrame();         // paint initial state
 */
export class PendulumScene extends PhysicsSimulation {
  static WIDTH  = 500;
  static HEIGHT = 400;

  constructor(container, config) {
    super(container, config);
    this.colors = null;
    this._pivot = null;
    this._bob = null;
    this._string = null;
  }

  async setup() {
    await super.setup();
    const M = this.Matter;
    const { WIDTH: W, HEIGHT: H } = PendulumScene;

    this._reloadColors();
    this.render.options.background = this.colors.background;

    // Fixed pivot point (invisible)
    const pivotX = W / 2, pivotY = 60;
    const pivot = M.Bodies.circle(pivotX, pivotY, 6, {
      isStatic: true, label: 'pivot',
      render: { fillStyle: this.colors.pivotFill, strokeStyle: this.colors.pivotStroke, lineWidth: 1 },
    });

    // Pendulum bob — offset to the right for initial displacement
    const bobX = pivotX + 120, bobY = pivotY + 220;
    const bob = M.Bodies.circle(bobX, bobY, 22, {
      label: 'bob', restitution: 0.1, frictionAir: 0.008,
      render: { fillStyle: this.colors.bobFill, strokeStyle: this.colors.bobStroke, lineWidth: 2 },
    });

    // Inextensible string (stiff constraint)
    const string = M.Constraint.create({
      bodyA: bob, pointB: { x: pivotX, y: pivotY },
      stiffness: 1, length: Math.hypot(bobX - pivotX, bobY - pivotY),
      render: { strokeStyle: this.colors.stringStroke, lineWidth: 2 },
    });

    this._pivot = pivot;
    this._bob = bob;
    this._string = string;

    const world = this.engine.world;
    if (M.Composite) M.Composite.add(world, [pivot, bob, string]);
    else             M.World.add(world, [pivot, bob, string]);
  }

  /** Re-reads tokens and reapplies live body render colors (see class doc). */
  _reloadColors() {
    this.colors = readSimColors(this.container, TOKEN_MAP);
    if (this._pivot) {
      this._pivot.render.fillStyle = this.colors.pivotFill;
      this._pivot.render.strokeStyle = this.colors.pivotStroke;
    }
    if (this._bob) {
      this._bob.render.fillStyle = this.colors.bobFill;
      this._bob.render.strokeStyle = this.colors.bobStroke;
    }
    if (this._string) {
      this._string.render.strokeStyle = this.colors.stringStroke;
    }
  }
}
