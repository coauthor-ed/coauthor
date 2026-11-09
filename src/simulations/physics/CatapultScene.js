import { PhysicsSimulation } from '../base/PhysicsSimulation.js';

/**
 * CatapultScene — Matter.js rigid-body scene for the catapult/lever POE simulation.
 *
 * Extends PhysicsSimulation (which handles engine/runner/render lifecycle).
 * This class is responsible only for:
 *   - Defining the scene bodies (arm, fulcrum, ball, weight, boundaries)
 *   - Drawing the overlay label canvas (body names + force arrows)
 *
 * Used by: src/plugins/blocks/poe-observe-sim/v1/index.js
 */
export class CatapultScene extends PhysicsSimulation {
  static WIDTH  = 700;
  static HEIGHT = 420;

  /** Scene-specific physics body colours */
  static COLORS = {
    ground:  { fill: '#1e3a5f', stroke: '#264f78' },
    fulcrum: { fill: '#e07b39', stroke: '#c0612a' },
    arm:     { fill: '#2563eb', stroke: '#1d4ed8' },
    ball:    { fill: '#10b981', stroke: '#059669' },
    weight:  { fill: '#f59e0b', stroke: '#d97706' },
  };

  /** Label definitions for the overlay canvas */
  static LABELS = {
    ball:    { text: 'Ball',      color: '#6ee7b7' },
    weight:  { text: 'Weight',    color: '#fde68a' },
    arm:     { text: 'Lever Arm', color: '#93c5fd' },
    fulcrum: { text: 'Fulcrum',   color: '#fdba74' },
  };

  constructor(container) {
    super(container);
    this._labelCanvas = null;
    this._labelCtx    = null;
    this._overlayRaf  = null;
  }

  // ── Scene setup ───────────────────────────────────────────────────────────

  async setup() {
    // PhysicsSimulation.setup() lazy-loads Matter.js and creates engine/runner/render
    await super.setup();

    const M = this.Matter;
    const { WIDTH: W, HEIGHT: H, COLORS: C } = CatapultScene;

    // Canvas background
    this.render.options.background = '#0d1b2a';

    // Collision group — arm and fulcrum ignore each other
    const group = M.Body.nextGroup(true);

    const ground = M.Bodies.rectangle(W / 2, H - 10, W, 20, {
      isStatic: true, label: 'ground',
      render: { fillStyle: C.ground.fill, strokeStyle: C.ground.stroke, lineWidth: 1 },
    });
    const fulcrum = M.Bodies.rectangle(W / 2, H - 55, 18, 50, {
      isStatic: true, label: 'fulcrum',
      chamfer: { radius: [0, 0, 4, 4] },
      collisionFilter: { group },
      render: { fillStyle: C.fulcrum.fill, strokeStyle: C.fulcrum.stroke, lineWidth: 1 },
    });
    const armY     = H - 82;
    const catapult = M.Bodies.rectangle(W / 2, armY, 440, 16, {
      label: 'arm', collisionFilter: { group }, frictionAir: 0.01,
      render: { fillStyle: C.arm.fill, strokeStyle: C.arm.stroke, lineWidth: 1 },
    });
    const pivot = M.Constraint.create({
      bodyA: catapult, pointB: { x: W / 2, y: armY },
      stiffness: 1, length: 0, render: { visible: false },
    });
    const ball = M.Bodies.circle(W / 2 - 185, armY - 22, 18, {
      label: 'ball', restitution: 0.55, friction: 0.1, density: 0.003,
      render: { fillStyle: C.ball.fill, strokeStyle: C.ball.stroke, lineWidth: 2 },
    });
    const weight = M.Bodies.rectangle(W / 2 + 165, 60, 46, 46, {
      label: 'weight', restitution: 0.05, density: 0.15,
      render: { fillStyle: C.weight.fill, strokeStyle: C.weight.stroke, lineWidth: 2 },
    });
    // Invisible boundary stops
    const wallL   = M.Bodies.rectangle(W / 2 - 185, H - 35, 12, 35, { isStatic: true, render: { visible: false } });
    const wallR   = M.Bodies.rectangle(W / 2 + 185, H - 35, 12, 35, { isStatic: true, render: { visible: false } });
    const ceiling = M.Bodies.rectangle(W / 2, -10, W, 20,           { isStatic: true, render: { visible: false } });

    const bodies = [ground, fulcrum, catapult, pivot, ball, weight, wallL, wallR, ceiling];
    if (M.Composite) M.Composite.add(this.engine.world, bodies);
    else             M.World.add(this.engine.world, bodies);

    this._setupOverlay(W, H);
  }

  // ── Overlay label canvas ──────────────────────────────────────────────────

  _setupOverlay(W, H) {
    const oc = document.createElement('canvas');
    oc.width  = W;
    oc.height = H;
    oc.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;width:100%;height:100%';
    this.container.style.position = 'relative';
    this.container.appendChild(oc);
    this._labelCanvas = oc;
    this._labelCtx    = oc.getContext('2d');
  }

  _drawLabels() {
    const ctx = this._labelCtx;
    const M   = this.Matter;
    if (!ctx || !M) return;

    const W = this._labelCanvas.width;
    const H = this._labelCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const bodies = M.Composite
      ? M.Composite.allBodies(this.engine.world)
      : M.World.allBodies(this.engine.world);

    const LABELS = CatapultScene.LABELS;
    ctx.font      = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';

    bodies.forEach(body => {
      const info = LABELS[body.label];
      if (!info) return;
      const bx = body.position.x;
      const by = body.position.y - (body.circleRadius || 18) - 8;
      if (by < 0) return;
      ctx.fillStyle = info.color + 'cc';
      ctx.fillText(info.text, bx, by);
    });

    // Gravity arrow on the falling weight
    const wb = bodies.find(b => b.label === 'weight');
    if (wb && wb.position.y < H - 80) {
      const x = wb.position.x, y = wb.position.y + 30;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y + 28);
      ctx.lineTo(x - 5, y + 20); ctx.moveTo(x, y + 28);
      ctx.lineTo(x + 5, y + 20);
      ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fde68a99';
      ctx.fillText('F gravity', x + 28, y + 18);
    }
  }

  // ── Overlay rAF loop (separate from physics runner) ───────────────────────

  resume() {
    super.resume();
    this._startOverlayLoop();
  }

  pause() {
    super.pause();
    this._stopOverlayLoop();
  }

  _startOverlayLoop() {
    const tick = () => {
      this._drawLabels();
      this._overlayRaf = requestAnimationFrame(tick);
    };
    this._stopOverlayLoop();
    this._overlayRaf = requestAnimationFrame(tick);
  }

  _stopOverlayLoop() {
    if (this._overlayRaf) { cancelAnimationFrame(this._overlayRaf); this._overlayRaf = null; }
  }

  destroy() {
    this._stopOverlayLoop();
    if (this._labelCanvas) this._labelCanvas.remove();
    super.destroy();
  }
}
