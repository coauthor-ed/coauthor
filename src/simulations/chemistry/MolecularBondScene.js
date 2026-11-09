import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * MolecularBondScene — Canvas2D visualisation of covalent bonding.
 *
 * Demonstrates the standard pattern for adding a new CanvasSimulation subclass:
 *   1. Override static WIDTH/HEIGHT.
 *   2. Override setup() — call super.setup() then initialise scene state.
 *   3. Override _tick(ctx, dt) to draw each frame.
 *   4. Override _drawInitialFrame(ctx) for the paused preview state.
 *
 * Scene: Two atoms (e.g. H₂O) with animated electron probability clouds
 * orbiting and a shared electron pair in the bonding region.
 *
 * NOTE: This is a conceptual placeholder. A full implementation would import
 * a chemistry data model, bond-angle data from content JSON, and use
 * VSEPR geometry to position atoms in 2D/3D projection.
 */
export class MolecularBondScene extends CanvasSimulation {
  static WIDTH  = 600;
  static HEIGHT = 360;

  /** Atom definitions for the scene — populated from content data in a real impl */
  static DEFAULT_ATOMS = [
    { label: 'O', x: 300, y: 180, r: 28, color: '#ef4444', electrons: 6 },
    { label: 'H', x: 190, y: 240, r: 16, color: '#94a3b8', electrons: 1 },
    { label: 'H', x: 410, y: 240, r: 16, color: '#94a3b8', electrons: 1 },
  ];

  constructor(container) {
    super(container);
    this._atoms = MolecularBondScene.DEFAULT_ATOMS;
    this._time  = 0;
  }

  async setup() {
    await super.setup();
    this._drawInitialFrame(this._ctx);
  }

  _drawInitialFrame(ctx) {
    this._drawScene(ctx, 0);
  }

  _tick(ctx, dt) {
    this._time += dt;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._drawScene(ctx, this._time);
  }

  _drawScene(ctx, t) {
    const W = this._canvas.width;
    const H = this._canvas.height;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Bond lines
    const [O, H1, H2] = this._atoms;
    this._drawBond(ctx, O, H1, t);
    this._drawBond(ctx, O, H2, t);

    // Atoms
    this._atoms.forEach(a => this._drawAtom(ctx, a));

    // Scene label
    ctx.font = 'bold 14px system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('Water molecule (H₂O) — covalent bonding', W / 2, 30);
  }

  _drawAtom(ctx, atom) {
    // Electron cloud glow
    const grd = ctx.createRadialGradient(atom.x, atom.y, atom.r * 0.3, atom.x, atom.y, atom.r * 2);
    grd.addColorStop(0, atom.color + '44');
    grd.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(atom.x, atom.y, atom.r * 2, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Atom body
    ctx.beginPath();
    ctx.arc(atom.x, atom.y, atom.r, 0, Math.PI * 2);
    ctx.fillStyle = atom.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    ctx.font = `bold ${Math.max(10, atom.r * 0.7)}px system-ui`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(atom.label, atom.x, atom.y);
  }

  _drawBond(ctx, a1, a2, t) {
    // Animated shared electron pair travelling along the bond
    const cx = (a1.x + a2.x) / 2;
    const cy = (a1.y + a2.y) / 2;
    const dx = a2.x - a1.x, dy = a2.y - a1.y;
    const len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len; // unit normal

    // Bond line
    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Two electron dots oscillating along bond
    [-1, 1].forEach((sign, i) => {
      const phase  = t * 2 + i * Math.PI;
      const offset = Math.sin(phase) * 18;
      const ex = cx + nx * offset + ny * sign * 5;
      const ey = cy + ny * offset - nx * sign * 5;
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
    });
  }
}
