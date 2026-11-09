import { CellViewSimulation } from '../base/CellViewSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * PlasmolysisScene - microscope view of Rhoeo leaf epidermal cells.
 *
 * The cell wall remains fixed while the plasma membrane, cytoplasm and
 * vacuole contract as water leaves a cell in a hypertonic solution. The
 * scene is deliberately a teaching model: it uses a small row of cells so
 * the rigid wall, the detached protoplast and the solution-filled gap remain
 * easy to compare.
 */

const COLORS = {
  bgDeep: '#050a16',
  bgMid: '#102944',
  field: '#173e50',
  fieldLight: '#2a6670',
  wall: '#a3e635',
  wallLight: '#d9f99d',
  wallDark: '#3f6212',
  membrane: '#60a5fa',
  membraneLight: '#bfdbfe',
  cytoplasm: '#6d5ce7',
  cytoplasmLight: '#a78bfa',
  vacuole: '#22d3ee',
  vacuoleDark: '#0e7490',
  chloroplast: '#22c55e',
  chloroplastLight: '#86efac',
  nucleus: '#c084fc',
  nucleusDark: '#581c87',
  sugar: '#fbbf24',
  sugarDark: '#a16207',
  water: '#38bdf8',
  text: '#f8fafc',
  muted: '#a7b4ca',
  faint: '#68819d',
  alert: '#f59e0b',
  healthy: '#6ee7b7',
};

const WIDTH = 650;
const HEIGHT = 450;
const FIELD_CX = 325;
const FIELD_CY = 215;
const FIELD_R = 170;
const CELL_W = 62;
const CELL_H = 160;
const CELL_Y = FIELD_CY - CELL_H / 2;
const CELL_CENTERS = [198, 262, 326, 390, 454];

const GLOSSARY = [
  { term: 'Plasmolysis', desc: 'Water leaves a plant cell in a hypertonic solution.\nThe protoplast pulls away from the rigid cell wall.' },
  { term: 'Deplasmolysis', desc: 'The reverse of plasmolysis. Water enters again\nand the protoplast returns towards the cell wall.' },
  { term: 'Hypertonic solution', desc: 'The solution outside has more dissolved solute\nthan the cell, so water moves out by osmosis.' },
  { term: 'Cell wall', desc: 'A strong cellulose layer outside the membrane.\nIt keeps the plant cell shape while water is lost.' },
  { term: 'Plasma membrane', desc: 'A selectively permeable boundary around the cell.\nIt moves with the shrinking protoplast.' },
  { term: 'Central vacuole', desc: 'A water-filled compartment surrounded by the tonoplast.\nIts water helps maintain turgor pressure.' },
  { term: 'Chloroplast', desc: 'The green organelle that captures light energy.\nIn this model, chloroplasts cluster with the cytoplasm.' },
];

export class PlasmolysisScene extends CellViewSimulation {
  static WIDTH = WIDTH;
  static HEIGHT = HEIGHT;
  static ARIA_LABEL =
    'Microscope simulation of Rhoeo leaf epidermal cells. Apply sugar solution to '
    + 'see water leave, the protoplast pull away from the cell wall, and plasmolysis. '
    + 'Apply plain water to reverse the process.';

  static CONTROLS = [
    { type: 'button', id: 'sugar', label: 'Apply 20% Sugar Solution' },
    { type: 'button', id: 'water', label: 'Apply Plain Water' },
    { type: 'button', id: 'reset', label: 'Reset' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    this.plasmolysis = 0;
    this.targetPlasmolysis = 0;
    this.solution = 'plain';
    this.time = 0;
    this.glossaryTimer = 0;
    this._liveRegion = null;
    this._lastStatus = '';
    this._sugarParticles = Array.from({ length: 28 }, (_, index) => ({
      x: 145 + ((index * 83 + 19) % 360),
      y: 62 + ((index * 47 + 23) % 302),
      r: 2.2 + (index % 3) * 0.65,
      phase: index * 0.73,
    }));
    this._fieldSpecks = Array.from({ length: 46 }, (_, index) => ({
      x: 155 + ((index * 61 + 17) % 340),
      y: 55 + ((index * 37 + 29) % 320),
      r: 0.5 + (index % 3) * 0.35,
    }));
  }

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._buildLiveRegion();
    this._drawInitialFrame(this._ctx);
    this._announce('Healthy Rhoeo leaf cells loaded. Apply the sugar solution to begin plasmolysis.');
  }

  destroy() {
    this._liveRegion?.remove();
    this._liveRegion = null;
    super.destroy();
  }

  onControlChange(id) {
    if (id === 'sugar') {
      this.solution = 'sugar';
      this.targetPlasmolysis = 1;
      this._announce('20% sugar solution applied. Water is leaving the cells by osmosis.');
    } else if (id === 'water') {
      this.solution = 'plain';
      this.targetPlasmolysis = 0;
      this._announce('Plain water applied. Water is moving back into the cells by osmosis.');
    } else if (id === 'reset') {
      this.solution = 'plain';
      this.plasmolysis = 0;
      this.targetPlasmolysis = 0;
      this.time = 0;
      this.glossaryTimer = 0;
      this._lastStatus = '';
      this._announce('Simulation reset. The cells are turgid and healthy.');
      if (this._ctx) this._drawInitialFrame(this._ctx);
    }
  }

  isControlDisabled(id) {
    if (id === 'sugar') return this.solution === 'sugar';
    if (id === 'water') return this.solution === 'plain';
    if (id === 'reset') return this.solution === 'plain' && this.plasmolysis === 0;
    return false;
  }

  _buildLiveRegion() {
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('role', 'status');
    this._liveRegion.setAttribute('aria-live', 'polite');
    this._liveRegion.setAttribute('aria-atomic', 'true');
    this._liveRegion.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
      'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    this.container.appendChild(this._liveRegion);
  }

  _announce(message) {
    if (this._liveRegion && message) this._liveRegion.textContent = message;
  }

  _tick(ctx, dt) {
    this.time += dt;
    this.glossaryTimer += dt;
    const difference = this.targetPlasmolysis - this.plasmolysis;
    this.plasmolysis += difference * Math.min(1, dt * 1.05);
    if (Math.abs(difference) < 0.001) this.plasmolysis = this.targetPlasmolysis;
    this._announceMilestones();
    this._drawScene(ctx);
  }

  _drawInitialFrame(ctx) {
    this._drawScene(ctx);
  }

  _announceMilestones() {
    let status = '';
    if (this.plasmolysis > 0.92 && this.solution === 'sugar') status = 'plasmolysed';
    else if (this.plasmolysis > 0.08 && this.solution === 'sugar') status = 'losing-water';
    else if (this.plasmolysis < 0.08 && this.solution === 'plain') status = 'turgid';
    else if (this.solution === 'plain') status = 'deplasmolysing';
    if (status === this._lastStatus) return;
    this._lastStatus = status;
    if (status === 'plasmolysed') {
      this._announce('Plasmolysis complete. The protoplast has pulled away from the cell wall.');
    } else if (status === 'turgid') {
      this._announce('The cells are turgid. The protoplast is pressed against the cell wall.');
    }
  }

  _drawScene(ctx) {
    this._drawBackground(ctx);
    this._drawMicroscopeField(ctx);
    this._drawHeader(ctx);
    this._drawStatusPanel(ctx);
    this._drawGlossary(ctx);
  }

  _drawBackground(ctx) {
    const gradient = ctx.createRadialGradient(WIDTH / 2, 160, 20, WIDTH / 2, 220, 520);
    gradient.addColorStop(0, COLORS.bgMid);
    gradient.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let index = 0; index < 18; index += 1) {
      const x = 20 + ((index * 79) % 610);
      const y = 58 + ((index * 43) % 320);
      ctx.fillStyle = index % 2 ? '#60a5fa' : '#34d399';
      ctx.beginPath();
      ctx.arc(x, y, 1 + (index % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawHeader(ctx) {
    const accent = this.solution === 'sugar' ? COLORS.alert : COLORS.healthy;
    SimDraw.drawPanel(ctx, 14, 11, 622, 39, {
      bg: 'rgba(8, 16, 32, 0.9)',
      stroke: 'rgba(148, 163, 184, 0.22)',
      lineWidth: 1,
      radius: 11,
    });
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 16px Inter, system-ui';
    ctx.fillText('Plasmolysis Lab', 29, 29);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillText('Rhoeo leaf epidermis | microscope view', 185, 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = '800 10px Inter, system-ui';
    ctx.fillText(this.solution === 'sugar' ? '20% SUCROSE' : 'PLAIN WATER', 621, 25);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 9px Inter, system-ui';
    ctx.fillText(this._getStateLabel(), 621, 39);
    ctx.restore();
  }

  _drawMicroscopeField(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(FIELD_CX, FIELD_CY, FIELD_R + 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(FIELD_CX, FIELD_CY, FIELD_R, 0, Math.PI * 2);
    const field = ctx.createRadialGradient(FIELD_CX - 45, FIELD_CY - 58, 10, FIELD_CX, FIELD_CY, FIELD_R);
    field.addColorStop(0, COLORS.fieldLight);
    field.addColorStop(0.55, COLORS.field);
    field.addColorStop(1, '#0c2538');
    ctx.fillStyle = field;
    ctx.fill();
    ctx.clip();

    this._drawFieldTexture(ctx);
    this._drawSugarSolution(ctx);
    for (let index = 0; index < CELL_CENTERS.length; index += 1) {
      this._drawPlantCell(ctx, { cx: CELL_CENTERS[index], cy: FIELD_CY, index });
    }
    this._drawWaterFlow(ctx);
    ctx.restore();

    this._drawMicroscopeRim(ctx);
    this._drawStructureLabels(ctx);
  }

  _drawFieldTexture(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (const speck of this._fieldSpecks) {
      ctx.fillStyle = speck.r > 1 ? '#8ed5cf' : '#b7e3d5';
      ctx.globalAlpha = 0.18 + (Math.sin(this.time * 0.35 + speck.x) + 1) * 0.04;
      ctx.beginPath();
      ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawMicroscopeRim(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(FIELD_CX, FIELD_CY, FIELD_R + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(191, 219, 254, 0.68)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(FIELD_CX, FIELD_CY, FIELD_R + 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(FIELD_CX, FIELD_CY, FIELD_R - 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
    ctx.font = '700 9px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('10x', FIELD_CX - FIELD_R + 17, FIELD_CY + FIELD_R - 17);
    ctx.restore();
  }

  _drawSugarSolution(ctx) {
    const alpha = this.solution === 'sugar' ? 0.45 + this.plasmolysis * 0.55 : 0;
    if (alpha <= 0.01) return;
    ctx.save();
    for (const particle of this._sugarParticles) {
      const bob = Math.sin(this.time * 0.9 + particle.phase) * 2.5;
      ctx.globalAlpha = alpha * (0.35 + 0.35 * Math.sin(this.time * 0.6 + particle.phase) ** 2);
      SimDraw.drawGlow(ctx, particle.x, particle.y + bob, particle.r * 1.8, COLORS.sugar, 0.32);
      ctx.fillStyle = COLORS.sugar;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y + bob, particle.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.sugarDark;
      ctx.font = '700 6px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', particle.x, particle.y + bob + 0.5);
    }
    ctx.restore();
  }

  _drawPlantCell(ctx, cell) {
    const wallX = cell.cx - CELL_W / 2;
    const wallY = cell.cy - CELL_H / 2;
    const geometry = this._getProtoplastGeometry(cell);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    const wallFill = ctx.createLinearGradient(wallX, wallY, wallX + CELL_W, wallY + CELL_H);
    wallFill.addColorStop(0, '#537a40');
    wallFill.addColorStop(0.48, '#315e4a');
    wallFill.addColorStop(1, '#183b3d');
    ctx.beginPath();
    ctx.roundRect(wallX, wallY, CELL_W, CELL_H, 7);
    ctx.fillStyle = wallFill;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = 'rgba(163, 230, 53, 0.3)';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(wallX + 5, wallY + 5, CELL_W - 10, CELL_H - 10, 4);
    ctx.strokeStyle = 'rgba(217, 249, 157, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    this._drawWallBevel(ctx, wallX, wallY);
    this._drawPlasmodesmata(ctx, wallX, wallY);

    if (this.plasmolysis > 0.08) {
      ctx.beginPath();
      ctx.roundRect(wallX + 7, wallY + 7, CELL_W - 14, CELL_H - 14, 5);
      ctx.fillStyle = `rgba(245, 158, 11, ${0.035 + this.plasmolysis * 0.10})`;
      ctx.fill();
    }

    this._drawProtoplast(ctx, geometry);
    ctx.restore();
  }

  _drawWallBevel(ctx, wallX, wallY) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(239, 255, 200, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wallX + 10, wallY + 4);
    ctx.lineTo(wallX + CELL_W - 11, wallY + 4);
    ctx.moveTo(wallX + 4, wallY + 10);
    ctx.lineTo(wallX + 4, wallY + CELL_H - 11);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20, 55, 31, 0.75)';
    ctx.beginPath();
    ctx.moveTo(wallX + 11, wallY + CELL_H - 4);
    ctx.lineTo(wallX + CELL_W - 10, wallY + CELL_H - 4);
    ctx.moveTo(wallX + CELL_W - 4, wallY + 11);
    ctx.lineTo(wallX + CELL_W - 4, wallY + CELL_H - 10);
    ctx.stroke();
    ctx.restore();
  }

  _drawPlasmodesmata(ctx, wallX, wallY) {
    ctx.save();
    for (let index = 0; index < 5; index += 1) {
      const y = wallY + 20 + index * 30;
      ctx.fillStyle = 'rgba(234, 255, 188, 0.75)';
      ctx.beginPath();
      ctx.arc(wallX + 4, y, 1.5, 0, Math.PI * 2);
      ctx.arc(wallX + CELL_W - 4, y + 7, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _getProtoplastGeometry(cell) {
    const state = this.plasmolysis;
    const innerW = CELL_W - 16;
    const innerH = CELL_H - 16;
    const width = innerW * (1 - 0.43 * state);
    const height = innerH * (1 - 0.20 * state);
    const offsetX = (cell.index % 2 ? -1 : 1) * state * 2.1;
    return {
      cx: cell.cx + offsetX,
      cy: cell.cy,
      width,
      height,
      radius: 8 + state * 18,
      vacuoleRX: width * 0.34 * (1 - 0.25 * state),
      vacuoleRY: height * 0.31 * (1 - 0.18 * state),
      state,
    };
  }

  _drawProtoplast(ctx, geometry) {
    const { cx, cy, width, height, radius, state } = geometry;
    const path = this._protoplastPath(ctx, cx, cy, width / 2, height / 2, radius, state);
    ctx.save();
    ctx.shadowColor = 'rgba(8, 15, 45, 0.75)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    const protoplast = ctx.createRadialGradient(cx - width * 0.2, cy - height * 0.3, 4, cx, cy, width * 0.8);
    protoplast.addColorStop(0, COLORS.cytoplasmLight);
    protoplast.addColorStop(0.42, COLORS.cytoplasm);
    protoplast.addColorStop(1, '#302080');
    ctx.fillStyle = protoplast;
    ctx.fill(path);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = COLORS.membrane;
    ctx.lineWidth = 2.2;
    ctx.stroke(path);

    this._drawVacuole(ctx, geometry);
    this._drawChloroplasts(ctx, geometry);
    this._drawNucleus(ctx, geometry);
    this._drawCytoplasmGranules(ctx, geometry);
    ctx.restore();
  }

  _protoplastPath(ctx, cx, cy, rx, ry, radius, state) {
    const path = new Path2D();
    const curve = 0.5522848;
    const xRadius = Math.max(8, rx);
    const yRadius = Math.max(12, ry);
    const wobble = state * 1.6;
    path.moveTo(cx, cy - yRadius);
    path.bezierCurveTo(cx + xRadius * curve, cy - yRadius, cx + xRadius, cy - yRadius * curve, cx + xRadius, cy);
    path.bezierCurveTo(cx + xRadius, cy + yRadius * curve, cx + xRadius * curve, cy + yRadius, cx, cy + yRadius);
    path.bezierCurveTo(cx - xRadius * curve, cy + yRadius, cx - xRadius, cy + yRadius * curve, cx - xRadius, cy + wobble);
    path.bezierCurveTo(cx - xRadius, cy - yRadius * curve, cx - xRadius * curve, cy - yRadius, cx, cy - yRadius);
    path.closePath();
    return path;
  }

  _drawVacuole(ctx, geometry) {
    const { cx, cy, vacuoleRX, vacuoleRY, state } = geometry;
    const gradient = ctx.createRadialGradient(cx - vacuoleRX * 0.3, cy - vacuoleRY * 0.35, 3, cx, cy, vacuoleRX * 1.2);
    gradient.addColorStop(0, '#a5f3fc');
    gradient.addColorStop(0.42, COLORS.vacuole);
    gradient.addColorStop(1, COLORS.vacuoleDark);
    ctx.save();
    ctx.globalAlpha = 0.86 - state * 0.08;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 2, vacuoleRX, vacuoleRY, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.72)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  _drawChloroplasts(ctx, geometry) {
    const { cx, cy, width, height, state } = geometry;
    const count = 8;
    const ringX = width * (0.36 - state * 0.04);
    const ringY = height * (0.34 - state * 0.025);
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count + 0.12;
      const wobble = Math.sin(this.time * 0.45 + index) * 1.2;
      const x = cx + Math.cos(angle) * (ringX + wobble);
      const y = cy + Math.sin(angle) * (ringY + wobble);
      this._drawChloroplast(ctx, x, y, 5.7, angle + Math.PI / 2, index);
    }
  }

  _drawChloroplast(ctx, x, y, radius, angle, index) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(34, 197, 94, 0.45)';
    ctx.shadowBlur = 5;
    const gradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
    gradient.addColorStop(0, COLORS.chloroplastLight);
    gradient.addColorStop(0.45, COLORS.chloroplast);
    gradient.addColorStop(1, '#166534');
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.62, radius, 0, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(220, 252, 231, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = index % 2 ? 'rgba(6, 78, 59, 0.85)' : 'rgba(21, 128, 61, 0.85)';
    ctx.lineWidth = 1;
    for (let line = -1; line <= 1; line += 1) {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.25, line * 2);
      ctx.lineTo(radius * 0.25, line * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawNucleus(ctx, geometry) {
    const { cx, cy, width, height, state } = geometry;
    const x = cx - width * 0.19;
    const y = cy + height * 0.06;
    const radius = Math.max(5, Math.min(8, width * 0.14));
    const gradient = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, radius);
    gradient.addColorStop(0, '#f3e8ff');
    gradient.addColorStop(0.38, COLORS.nucleus);
    gradient.addColorStop(1, COLORS.nucleusDark);
    ctx.save();
    ctx.globalAlpha = 0.86 - state * 0.12;
    ctx.shadowColor = 'rgba(192, 132, 252, 0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(243, 232, 255, 0.65)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  _drawCytoplasmGranules(ctx, geometry) {
    const { cx, cy, width, height, state } = geometry;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#e0e7ff';
    for (let index = 0; index < 7; index += 1) {
      const angle = index * 2.2 + 0.4;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(angle) * width * 0.25,
        cy + Math.sin(angle) * height * 0.26,
        1.1 + (index % 2) * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWaterFlow(ctx) {
    // Both directions are animated only while the protoplast is changing.
    // A healthy cell still has water moving microscopically, but no net-flow
    // arrows should suggest that it is actively plasmolysing or recovering.
    const movement = this.plasmolysis;
    if (movement < 0.07) return;
    const outward = this.solution === 'sugar';
    const intensity = Math.min(1, movement * 1.35);
    const angles = [-0.34, 0.34, Math.PI - 0.34, Math.PI + 0.34];
    ctx.save();
    for (const cell of CELL_CENTERS.map((cx, index) => ({ cx, cy: FIELD_CY, index }))) {
      const geometry = this._getProtoplastGeometry(cell);
      for (let index = 0; index < angles.length; index += 1) {
        const angle = angles[index];
        const innerRadius = outward ? geometry.width * 0.22 : CELL_W * 0.47;
        const outerRadius = outward ? CELL_W * 0.62 : geometry.width * 0.25;
        const startRadius = outward ? innerRadius : outerRadius;
        const endRadius = outward ? outerRadius : innerRadius;
        const x1 = geometry.cx + Math.cos(angle) * startRadius;
        const y1 = geometry.cy + Math.sin(angle) * startRadius * 1.4;
        const x2 = geometry.cx + Math.cos(angle) * endRadius;
        const y2 = geometry.cy + Math.sin(angle) * endRadius * 1.4;
        ctx.globalAlpha = intensity * (index < 2 ? 0.85 : 0.48);
        SimDraw.drawArrow(ctx, x1, y1, x2, y2, { color: COLORS.water, lineWidth: 1.2 });
        const travel = (this.time * 0.42 + cell.index * 0.21 + index * 0.17) % 1;
        const dropX = x1 + (x2 - x1) * travel;
        const dropY = y1 + (y2 - y1) * travel;
        SimDraw.drawGlow(ctx, dropX, dropY, 2.3, COLORS.water, 0.35);
        ctx.fillStyle = COLORS.water;
        ctx.beginPath();
        ctx.arc(dropX, dropY, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawStructureLabels(ctx) {
    if (this.plasmolysis < 0.2) {
      SimDraw.drawLabel(ctx, 'Cell wall', 198, 112, { bg: '#365314dd', color: COLORS.wallLight });
      return;
    }
    const centre = this._getProtoplastGeometry({ cx: FIELD_CX, cy: FIELD_CY, index: 2 });
    const wallRight = FIELD_CX + CELL_W / 2;
    const membraneRight = centre.cx + centre.width / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.plasmolysis * 1.6);
    SimDraw.drawArrow(ctx, 462, 113, wallRight + 1, CELL_Y + 12, { color: COLORS.wallLight, lineWidth: 1.2 });
    SimDraw.drawLabel(ctx, 'Cell wall', 490, 111, { bg: '#365314ee', color: COLORS.wallLight });
    SimDraw.drawArrow(ctx, 463, 247, membraneRight + 1, FIELD_CY - 5, { color: COLORS.membraneLight, lineWidth: 1.2 });
    SimDraw.drawLabel(ctx, 'Plasmolysed membrane', 465, 247, { bg: '#1e3a8eee', color: COLORS.membraneLight });
    SimDraw.drawArrow(ctx, FIELD_CX, 337, FIELD_CX + (CELL_W / 2 - centre.width / 2) * 0.6, FIELD_CY + 48, { color: COLORS.alert, lineWidth: 1.2 });
    SimDraw.drawLabel(ctx, 'Gap filled with solution', 325, 352, { bg: '#78350fee', color: '#fde68a' });
    ctx.restore();
  }

  _drawStatusPanel(ctx) {
    const status = this._getStateLabel();
    const accent = this.plasmolysis > 0.55 ? COLORS.alert : COLORS.healthy;
    SimDraw.drawPanel(ctx, 340, 397, 295, 38, {
      bg: 'rgba(8, 16, 32, 0.9)',
      stroke: `${accent}66`,
      lineWidth: 1,
      radius: 9,
    });
    ctx.save();
    ctx.fillStyle = accent;
    ctx.font = '800 10px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(status, 354, 412);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 9px Inter, system-ui';
    ctx.fillText(this._getFlowLabel(), 354, 425);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(520, 408, 98, 4, 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(520, 408, 98 * this.plasmolysis, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  _drawGlossary(ctx) {
    const safeTime = (Number.isNaN(this.glossaryTimer) || this.glossaryTimer < 0) ? 0 : this.glossaryTimer;
    const item = GLOSSARY[Math.floor(safeTime / 7) % GLOSSARY.length];
    const x = 16;
    const y = 440;
    const width = 304;
    const lines = item.desc.split('\n');
    const height = 20 + lines.length * 14 + 13;
    ctx.save();
    SimDraw.drawPanel(ctx, x, y - height, width, height, {
      bg: 'rgba(8, 16, 32, 0.93)',
      stroke: 'rgba(163, 230, 53, 0.4)',
      lineWidth: 1,
      radius: 8,
    });
    ctx.fillStyle = COLORS.wallLight;
    ctx.font = '700 10.5px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Glossary: ${item.term}`, x + 11, y - height + 9);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 9.5px Inter, system-ui';
    lines.forEach((line, index) => ctx.fillText(line, x + 11, y - height + 27 + index * 14));
    ctx.fillStyle = 'rgba(163, 230, 53, 0.25)';
    ctx.roundRect(x + 2, y - 4, (width - 4) * ((this.glossaryTimer % 7) / 7), 2, 1);
    ctx.fill();
    ctx.restore();
  }

  _getStateLabel() {
    if (this.plasmolysis > 0.92) return 'PLASMOLYSED';
    if (this.plasmolysis > 0.08 && this.solution === 'sugar') return 'WATER LEAVING';
    if (this.plasmolysis > 0.08 && this.solution === 'plain') return 'DEPLASMOLYSING';
    return 'TURGID / HEALTHY';
  }

  _getFlowLabel() {
    if (this.plasmolysis > 0.08 && this.solution === 'sugar') return 'Net water flow: OUT of the cells';
    if (this.plasmolysis > 0.08 && this.solution === 'plain') return 'Net water flow: INTO the cells';
    return 'Water pressure keeps the membrane near the wall';
  }
}
