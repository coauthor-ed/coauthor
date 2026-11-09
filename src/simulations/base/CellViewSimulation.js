import { CanvasSimulation } from './CanvasSimulation.js';
import { SimDraw } from './SimDrawUtils.js';
import { readSimColors } from './SimTheme.js';

const TOKEN_MAP = {
  membrane:      ['--sim-membrane', '#4f9cf7'],
  membraneGlow:  ['--sim-membrane-glow', '#4f9cf733'],
  cellWall:      ['--sim-cell-wall', '#a3e635'],
  cytoplasm:     ['--sim-cytoplasm', '#1e3a5f40'],
  nucleus:       ['--sim-nucleus', '#6366f1'],
  nucleusGlow:   ['--sim-nucleus-glow', '#6366f133'],
  nucleusStroke: ['--sim-nucleus-stroke', '#4f46e5'],
};

export class CellViewSimulation extends CanvasSimulation {
  static WIDTH = 700;
  static HEIGHT = 500;

  constructor(container, config) {
    super(container, config);
    this.organelles = [];
    this.colors = null;
  }

  async setup() {
    await super.setup();
    this._reloadColors();
  }

  _reloadColors() {
    this.colors = readSimColors(this.container, TOKEN_MAP);
  }

  drawCellMembrane(ctx) {
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;

    // Draw outer double-layer oval boundary
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, W/2 - 40, H/2 - 40, 0, 0, Math.PI * 2);
    ctx.strokeStyle = this.colors.membrane;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(W/2, H/2, W/2 - 45, H/2 - 45, 0, 0, Math.PI * 2);
    ctx.strokeStyle = this.colors.membraneGlow;
    ctx.lineWidth = 10;
    ctx.stroke();
  }

  drawCellWall(ctx, opts = {}) {
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;
    ctx.beginPath();
    ctx.roundRect(20, 20, W - 40, H - 40, 15);
    ctx.strokeStyle = this.colors.cellWall;
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  drawCytoplasm(ctx) {
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, W/2 - 40, H/2 - 40, 0, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.cytoplasm;
    ctx.fill();
  }

  drawOrganelle(ctx, organelle) {
    if (typeof organelle.draw === 'function') {
      organelle.draw(ctx);
    }
  }

  drawNucleus(ctx, x, y, r) {
    SimDraw.drawGlow(ctx, x, y, r, this.colors.nucleusGlow, 0.4);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.nucleus;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.colors.nucleusStroke;
    ctx.stroke();
  }

  _tick(ctx, dt) {
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawCytoplasm(ctx);
    this.drawCellMembrane(ctx);
    
    for (const organelle of this.organelles) {
      this.drawOrganelle(ctx, organelle);
    }
    
    this._drawActivity(ctx, dt);
  }

  _drawActivity(ctx, dt) {}
  _onOrganelleClick(id) {}
}
