import { CanvasSimulation } from '../base/CanvasSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * TurgorPressureScene — Part 1.4 "Turgor Pressure: The Plant Cell Wall in Action".
 * 
 * Side-by-side comparative simulation comparing an Animal Cell (membrane only) 
 * vs. a Plant Cell (rigid cell wall + central vacuole) under varying water intake levels.
 * 
 * Demonstrates why plant cells become TURGID & healthy under high water intake 
 * (due to rigid cell wall resistance), whereas animal cells undergo LYSIS (bursting).
 * 
 * Tailored for CBSE Class 9 Biology Curriculum (NCERT Standards).
 */

const COLORS = {
  bgDeep:          '#050811',
  bgAnimal:        'rgba(30, 27, 75, 0.40)',
  bgPlant:         'rgba(6, 78, 59, 0.40)',
  animalMembrane:  '#f87171',
  animalGlow:      'rgba(248, 113, 113, 0.35)',
  plantWall:       '#34d399',
  plantWallGlow:   'rgba(52, 211, 153, 0.45)',
  plantMembrane:   '#818cf8',
  vacuole:         '#06b6d4',
  vacuoleGlow:     'rgba(6, 182, 212, 0.40)',
  water:           '#38bdf8',
  waterGlow:       'rgba(56, 189, 248, 0.40)',
  textMain:        '#f8fafc',
  textMuted:       '#94a3b8'
};

const GLOSSARY = [
  { term: 'Turgor Pressure', desc: 'Outward hydrostatic pressure exerted by the fluid-filled vacuole\nagainst the rigid plant cell wall, keeping plant tissues firm.' },
  { term: 'Cell Wall', desc: 'A rigid outer layer composed of cellulose in plant cells that prevents\nthem from bursting under high water intake.' },
  { term: 'Lysis', desc: 'The rupture or bursting of an animal cell membrane when placed in\na hypotonic environment due to lack of a rigid cell wall.' },
  { term: 'Central Vacuole', desc: 'Large membrane-bound organelle in plant cells that stores water\nand maintains cell turgidity.' },
  { term: 'Turgid Cell', desc: 'A plant cell swollen with water, firm and upright, providing\nstructural support to plant stems and leaves.' },
  { term: 'Flaccid / Plasmolysed', desc: 'A plant cell that has lost water; vacuole shrinks and the cell\nloses turgor pressure, causing plants to wilt.' }
];

const W = 700;
const H = 450;
const HALF_W = W / 2;
const SIM_TOP = 15;
const SIM_BOTTOM = 360;

export class TurgorPressureScene extends CanvasSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static ARIA_LABEL = 
    'Turgor Pressure simulator comparing animal cell lysis and plant cell turgidity under varying water intake levels.';

  static CONTROLS = [
    {
      type: 'range',
      id: 'waterIntake',
      label: 'Water Intake Level:',
      min: 0,
      max: 100,
      step: 1,
      value: 50
    },
    { type: 'button', id: 'reset', label: 'Reset Simulation' }
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    // Simulation state parameters
    this.waterIntake = 50; // 0% to 100%
    this.time = 0;
    this.glossaryTimer = 0;
    this.announceTimer = 0;

    // Cell animation states
    this.animalRadius = 75;
    this.targetAnimalRadius = 75;
    this.animalRuptured = false;
    this.ruptureTimer = 0;

    this.vacuoleRadius = 45;
    this.targetVacuoleRadius = 45;
    this.plantMembraneMargin = 22; // Distance from outer cell wall
    this.targetPlantMargin = 22;

    // Water particles inside cells
    this.animalParticles = [];
    this.plantParticles = [];

    // Interactive ripples
    this.ripples = [];

    this._liveRegion = null;
    this._isDraggingSlider = false;

    this._onClick = this._handleClick.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
  }

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    
    this._canvas.addEventListener('click', this._onClick);
    this._canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);

    this._canvas.addEventListener('touchstart', this._onMouseDown, { passive: false });
    window.addEventListener('touchmove', this._onMouseMove, { passive: false });
    window.addEventListener('touchend', this._onMouseUp);
    
    this._buildLiveRegion();
    this._initParticles();
    this._drawInitialFrame(this._ctx);

    this._announce('Turgor Pressure simulation loaded. Adjust water intake slider from 0% to 100%.');
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
      this._canvas.removeEventListener('mousedown', this._onMouseDown);
      this._canvas.removeEventListener('touchstart', this._onMouseDown);
    }
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('touchmove', this._onMouseMove);
    window.removeEventListener('touchend', this._onMouseUp);

    if (this._liveRegion) {
      this._liveRegion.remove();
      this._liveRegion = null;
    }
    super.destroy();
  }

  onControlChange(id, value) {
    if (id === 'waterIntake') {
      this.waterIntake = Number(value);
      this._updateCellTargets();
      this._announce(`Water intake set to ${this.waterIntake}%.`);
    } else if (id === 'reset') {
      this.waterIntake = 50;
      this.animalRuptured = false;
      this.ruptureTimer = 0;
      this._initParticles();

      // Locate HTML slider DOM element across light DOM, shadowRoot, and document
      const rootNode = this.container ? (this.container.getRootNode ? this.container.getRootNode() : this.container) : document;
      const sliderEl = (rootNode && rootNode.querySelector) ? rootNode.querySelector('#waterIntake') : document.getElementById('waterIntake');
      if (sliderEl) {
        sliderEl.value = 50;
        sliderEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      this._announce('Simulation reset to 50% water intake.');
    }
  }

  // ── Initialization Helpers ────────────────────────────────────────────────

  _buildLiveRegion() {
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('role', 'status');
    this._liveRegion.setAttribute('aria-live', 'polite');
    this._liveRegion.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
      'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    this.container.appendChild(this._liveRegion);
  }

  _announce(msg) {
    if (!this._liveRegion || !msg) return;
    this._liveRegion.textContent = msg;
  }

  _initParticles() {
    this.animalParticles = [];
    this.plantParticles = [];
    this._updateCellTargets();

    const count = Math.floor(12 + (this.waterIntake / 100) * 35);
    const animalCx = HALF_W / 2;
    const animalCy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;

    const plantCx = HALF_W + HALF_W / 2;
    const plantCy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;

    // Spawn Animal Cell Water Particles
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (this.targetAnimalRadius - 15);
      this.animalParticles.push({
        x: animalCx + Math.cos(angle) * dist,
        y: animalCy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 35,
        vy: (Math.random() - 0.5) * 35,
        r: 3.5
      });
    }

    // Spawn Plant Cell Water Particles
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (this.targetVacuoleRadius - 10);
      this.plantParticles.push({
        x: plantCx + Math.cos(angle) * dist,
        y: plantCy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 35,
        vy: (Math.random() - 0.5) * 35,
        r: 3.5
      });
    }
  }

  _updateCellTargets() {
    const intakeRatio = this.waterIntake / 100; // 0 to 1

    // Animal Cell target radius & state
    if (this.waterIntake > 78) {
      this.targetAnimalRadius = 112; // Stretch past elastic limit
      if (!this.animalRuptured) {
        this.animalRuptured = true;
        this.ruptureTimer = 0;
        this._announce('CELL LYSIS! Animal cell membrane burst under high water intake.');
      }
    } else {
      // Low intake = Crenated/shriveled (36px), Normal = 70px, High = 92px
      this.targetAnimalRadius = 36 + intakeRatio * 56;
      if (this.animalRuptured && this.waterIntake <= 75) {
        this.animalRuptured = false;
      }
    }

    // Plant Cell Plasmolysis vs Turgidity Mechanics
    // At low water intake (0-30%): Plasmolysis occurs! Membrane detaches from wall (margin up to 52px).
    // At high water intake (70-100%): Turgor pressure presses membrane flat against rigid wall (margin down to 3px).
    if (this.waterIntake <= 35) {
      const lowRatio = this.waterIntake / 35; // 0 to 1
      this.targetPlantMargin = 54 - lowRatio * 28; // 54px gap (Plasmolysis) down to 26px
      this.targetVacuoleRadius = 14 + lowRatio * 20; // 14px shriveled vacuole up to 34px
    } else {
      const highRatio = (this.waterIntake - 35) / 65; // 0 to 1
      this.targetPlantMargin = 26 - highRatio * 23; // 26px down to 3px (Pressed flat against wall)
      this.targetVacuoleRadius = 34 + highRatio * 44; // 34px up to 78px
    }
  }

  // ── Physics & Simulation Loop ────────────────────────────────────────────

  _tick(ctx, dt) {
    this.time += dt;
    this.glossaryTimer += dt;
    this.announceTimer += dt;
    if (this.animalRuptured) this.ruptureTimer += dt;

    // Interpolate cell dimensions smoothly
    this.animalRadius += (this.targetAnimalRadius - this.animalRadius) * (2.0 * dt);
    this.vacuoleRadius += (this.targetVacuoleRadius - this.vacuoleRadius) * (2.0 * dt);
    this.plantMembraneMargin += (this.targetPlantMargin - this.plantMembraneMargin) * (2.0 * dt);

    // Update ripples
    for (const r of this.ripples) {
      r.radius += dt * 80;
      r.alpha -= dt * 1.5;
    }
    this.ripples = this.ripples.filter(r => r.alpha > 0);

    // Update water particles inside Animal Cell
    const animalCx = HALF_W / 2;
    const animalCy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;

    for (const p of this.animalParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Brownian jitter
      p.vx += (Math.random() - 0.5) * 15;
      p.vy += (Math.random() - 0.5) * 15;

      const dist = Math.hypot(p.x - animalCx, p.y - animalCy);

      if (this.animalRuptured) {
        // Particles spill outward when burst
        if (dist < 140) {
          const angle = Math.atan2(p.y - animalCy, p.x - animalCx);
          p.x += Math.cos(angle) * 45 * dt;
          p.y += Math.sin(angle) * 45 * dt;
        }
      } else {
        // Contain inside membrane radius
        if (dist > this.animalRadius - p.r) {
          const angle = Math.atan2(p.y - animalCy, p.x - animalCx);
          p.x = animalCx + Math.cos(angle) * (this.animalRadius - p.r);
          p.vx *= -0.8;
          p.vy *= -0.8;
        }
      }
    }

    // Update water particles inside Plant Cell Vacuole
    const plantCx = HALF_W + HALF_W / 2;
    const plantCy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;

    for (const p of this.plantParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.vx += (Math.random() - 0.5) * 15;
      p.vy += (Math.random() - 0.5) * 15;

      const dist = Math.hypot(p.x - plantCx, p.y - plantCy);
      if (dist > this.vacuoleRadius - p.r) {
        const angle = Math.atan2(p.y - plantCy, p.x - plantCx);
        p.x = plantCx + Math.cos(angle) * (this.vacuoleRadius - p.r);
        p.vx *= -0.8;
        p.vy *= -0.8;
      }
    }

    // Adjust particle count to match water intake slider smoothly
    const targetParticleCount = Math.floor(12 + (this.waterIntake / 100) * 35);
    if (this.animalParticles.length < targetParticleCount && !this.animalRuptured) {
      this.animalParticles.push({
        x: animalCx + (Math.random() - 0.5) * 30,
        y: animalCy + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        r: 3.5
      });
    } else if (this.animalParticles.length > targetParticleCount) {
      this.animalParticles.pop();
    }

    if (this.plantParticles.length < targetParticleCount) {
      this.plantParticles.push({
        x: plantCx + (Math.random() - 0.5) * 20,
        y: plantCy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        r: 3.5
      });
    } else if (this.plantParticles.length > targetParticleCount) {
      this.plantParticles.pop();
    }

    // Periodic accessibility announcements
    if (this.announceTimer >= 10.0) {
      this.announceTimer = 0;
      const statusMsg = this.animalRuptured
        ? 'Animal cell has burst (lysis). Plant cell is firm and turgid.'
        : `Water intake is ${this.waterIntake}%. Animal cell intact, plant cell vacuole stable.`;
      this._announce(statusMsg);
    }

    // Master Render Pipeline
    this._drawBackground(ctx);
    this._drawAnimalCellView(ctx);
    this._drawPlantCellView(ctx);
    this._drawClickRipples(ctx);
    this._drawOverlayUI(ctx);
  }

  _drawInitialFrame(ctx) {
    this._tick(ctx, 0);
  }

  // ── Render Passes ────────────────────────────────────────────────────────

  _drawBackground(ctx) {
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, W, H);

    // Left Half (Animal Cell background)
    const animalGrad = ctx.createRadialGradient(
      HALF_W / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 20,
      HALF_W / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 200
    );
    animalGrad.addColorStop(0, 'rgba(49, 46, 129, 0.35)');
    animalGrad.addColorStop(1, 'rgba(15, 23, 42, 0.90)');
    ctx.fillStyle = animalGrad;
    ctx.fillRect(15, SIM_TOP, HALF_W - 20, SIM_BOTTOM - SIM_TOP);

    // Right Half (Plant Cell background)
    const plantGrad = ctx.createRadialGradient(
      HALF_W + HALF_W / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 20,
      HALF_W + HALF_W / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 200
    );
    plantGrad.addColorStop(0, 'rgba(6, 95, 70, 0.35)');
    plantGrad.addColorStop(1, 'rgba(6, 30, 22, 0.90)');
    ctx.fillStyle = plantGrad;
    ctx.fillRect(HALF_W + 5, SIM_TOP, HALF_W - 20, SIM_BOTTOM - SIM_TOP);

    // Split Divider Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(HALF_W, SIM_TOP);
    ctx.lineTo(HALF_W, SIM_BOTTOM);
    ctx.stroke();
    ctx.setLineDash([]);

    // Water Inflow Pipes & Falling Droplet Streams into Both Cells
    this._drawWaterInlets(ctx);
  }

  _drawWaterInlets(ctx) {
    const animalCx = HALF_W / 2;
    const plantCx = HALF_W + HALF_W / 2;
    const pipeY = SIM_TOP;

    // Pipe Nozzles
    [animalCx, plantCx].forEach(pipeX => {
      ctx.beginPath();
      ctx.roundRect(pipeX - 16, pipeY, 32, 12, 4);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Flowing Water Stream when Water Intake > 0
      if (this.waterIntake > 2) {
        const streamW = 2 + (this.waterIntake / 100) * 10;
        const streamGrad = ctx.createLinearGradient(pipeX, pipeY + 12, pipeX, pipeY + 70);
        streamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
        streamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.05)');

        ctx.fillStyle = streamGrad;
        ctx.fillRect(pipeX - streamW / 2, pipeY + 12, streamW, 58);

        // Falling Water Droplets
        const numDrops = Math.floor(1 + (this.waterIntake / 100) * 5);
        for (let i = 0; i < numDrops; i++) {
          const dropY = pipeY + 14 + ((this.time * 90 + i * 20) % 52);
          ctx.beginPath();
          ctx.arc(pipeX + (Math.sin(i * 17) * 2), dropY, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#7dd3fc';
          ctx.fill();
        }
      }
    });
  }

  _drawAnimalCellView(ctx) {
    const cx = HALF_W / 2;
    const cy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;
    const r = this.animalRadius;

    ctx.save();

    // Animal Cell Header Label
    SimDraw.drawPanel(ctx, 25, SIM_TOP + 8, 200, 46, {
      bg: 'rgba(15, 23, 42, 0.55)',
      stroke: COLORS.animalMembrane,
      radius: 8
    });

    ctx.font = '700 11.5px Inter, system-ui';
    ctx.fillStyle = COLORS.animalMembrane;
    ctx.fillText('ANIMAL CELL (Membrane Only)', 35, SIM_TOP + 24);

    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('No Rigid Cell Wall Structure', 35, SIM_TOP + 41);

    // Live Molecule Counter Badge
    SimDraw.drawLabel(ctx, `💧 Water: ${this.animalParticles.length} H₂O Molecules`, cx, SIM_TOP + 64, {
      bg: 'rgba(15, 23, 42, 0.55)',
      color: COLORS.water
    });

    if (this.animalRuptured) {
      // 💥 LYSIS STATE (Cell Ruptured / Burst)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0.2, Math.PI * 1.6);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r + 12, 1.8, Math.PI * 1.95);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r + 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.20)';
      ctx.fill();

      SimDraw.drawLabel(ctx, '💥 LYSIS! (Cell Burst / Ruptured)', cx, cy, {
        bg: 'rgba(127, 29, 29, 0.75)',
        color: '#fca5a5'
      });

      SimDraw.drawLabel(ctx, 'Lacks rigid wall to withstand osmotic pressure', cx, cy + 24, {
        bg: 'rgba(15, 23, 42, 0.65)',
        color: COLORS.textMuted
      });

    } else if (this.waterIntake <= 30) {
      // 🥀 CRENATED STATE (Shriveled Animal Cell due to low water intake)
      SimDraw.drawGlow(ctx, cx, cy, r * 1.2, '#f59e0b', 0.35);

      ctx.beginPath();
      const numSpikes = 16;
      for (let i = 0; i < numSpikes; i++) {
        const angle = (i / numSpikes) * Math.PI * 2;
        const spk = (i % 2 === 0) ? r : r * 0.72;
        const px = cx + Math.cos(angle) * spk;
        const py = cy + Math.sin(angle) * spk;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.20)';
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Nucleus
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.40)';
      ctx.fill();
      ctx.stroke();

      SimDraw.drawLabel(ctx, '🥀 CRENATED (Shriveled Cell)', cx, cy + r + 22, {
        bg: 'rgba(120, 53, 15, 0.65)',
        color: '#fde68a'
      });

    } else {
      // Normal / Swollen Intact Animal Cell
      SimDraw.drawGlow(ctx, cx, cy, r * 1.3, COLORS.animalMembrane, 0.35);

      ctx.beginPath();
      const numNodes = 24;
      for (let i = 0; i < numNodes; i++) {
        const angle = (i / numNodes) * Math.PI * 2;
        const wobble = Math.sin(angle * 3 + this.time * 3) * 2.5;
        const px = cx + Math.cos(angle) * (r + wobble);
        const py = cy + Math.sin(angle) * (r + wobble);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.fill();
      ctx.strokeStyle = COLORS.animalMembrane;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Nucleus
      ctx.beginPath();
      ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(165, 180, 252, 0.45)';
      ctx.fill();
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const statusText = (this.waterIntake > 65) ? '⚠️ Stretched Membrane (High Pressure)' : 'Healthy Animal Cell';
      SimDraw.drawLabel(ctx, statusText, cx, cy + r + 20, {
        bg: (this.waterIntake > 65) ? 'rgba(127, 29, 29, 0.60)' : 'rgba(30, 27, 75, 0.60)',
        color: (this.waterIntake > 65) ? '#fca5a5' : '#c7d2fe'
      });
    }

    // Render Animal Water Particles
    for (const p of this.animalParticles) {
      SimDraw.drawGlow(ctx, p.x, p.y, p.r * 1.5, COLORS.water, 0.35);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.water;
      ctx.fill();
    }

    ctx.restore();
  }

  _drawPlantCellView(ctx) {
    const cx = HALF_W + HALF_W / 2;
    const cy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;

    ctx.save();

    // Plant Cell Header Label
    SimDraw.drawPanel(ctx, W - 225, SIM_TOP + 8, 200, 46, {
      bg: 'rgba(15, 23, 42, 0.55)',
      stroke: COLORS.plantWall,
      radius: 8
    });

    ctx.font = '700 11.5px Inter, system-ui';
    ctx.fillStyle = COLORS.plantWall;
    ctx.fillText('PLANT CELL (Rigid Cell Wall)', W - 215, SIM_TOP + 24);

    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Cellulose Wall Holds Firm', W - 215, SIM_TOP + 41);

    // Real-Time Hydrostatic Turgor Pressure (P_T) Gauge Display
    const turgorKpa = Math.round(Math.max(0, (this.waterIntake - 15) * 9.2));
    SimDraw.drawPanel(ctx, W - 225, SIM_TOP + 58, 200, 22, {
      bg: 'rgba(15, 23, 42, 0.70)',
      stroke: (turgorKpa > 400 ? '#34d399' : (turgorKpa > 100 ? '#38bdf8' : '#f59e0b')),
      radius: 6
    });

    ctx.font = '700 10.5px Inter, system-ui';
    ctx.fillStyle = (turgorKpa > 400 ? '#6ee7b7' : (turgorKpa > 100 ? '#7dd3fc' : '#fde68a'));
    ctx.textAlign = 'center';
    ctx.fillText(`TURGOR PRESSURE (P_T): ${turgorKpa} kPa`, W - 125, SIM_TOP + 73);

    // 1. Rigid Rectangular Outer Cell Wall Frame
    const wallW = 210;
    const wallH = 210;
    const wallX = cx - wallW / 2;
    const wallY = cy - wallH / 2 + 10;

    // Outer Wall Glow (intensity increases with turgor pressure)
    const wallGlowAlpha = 0.08 + (turgorKpa / 800) * 0.25;
    ctx.beginPath();
    ctx.roundRect(wallX, wallY, wallW, wallH, 16);
    ctx.fillStyle = `rgba(52, 211, 153, ${wallGlowAlpha})`;
    ctx.fill();

    // Thick Double-Line Cell Wall (Cellulose)
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.40)';
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.strokeStyle = COLORS.plantWall;
    ctx.lineWidth = (turgorKpa > 400) ? 4.5 : 3;
    ctx.stroke();

    // 2. Inner Flexible Cell Membrane
    const margin = this.plantMembraneMargin;
    const memX = wallX + margin;
    const memY = wallY + margin;
    const memW = wallW - margin * 2;
    const memH = wallH - margin * 2;

    ctx.beginPath();
    ctx.roundRect(memX, memY, memW, memH, 10);
    ctx.fillStyle = (this.waterIntake <= 30) ? 'rgba(120, 53, 15, 0.25)' : 'rgba(6, 95, 70, 0.35)';
    ctx.fill();
    ctx.strokeStyle = (this.waterIntake <= 30) ? '#f59e0b' : COLORS.plantMembrane;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Plasmolysis Detachment Gap Visualizer (Low Water Intake)
    if (this.waterIntake <= 30) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.60)';
      ctx.strokeRect(memX - 3, memY - 3, memW + 6, memH + 6);
      ctx.setLineDash([]);

      SimDraw.drawLabel(ctx, '⚠️ Plasmolysed Gap (Membrane Detached)', cx, wallY + 22, {
        bg: 'rgba(120, 53, 15, 0.75)',
        color: '#fde68a'
      });
    }

    // 3. Central Vacuole (Expanding Fluid Organelle)
    const vacR = this.vacuoleRadius;
    SimDraw.drawGlow(ctx, cx, cy + 10, vacR * 1.3, COLORS.vacuole, 0.40);

    const vacGrad = ctx.createRadialGradient(
      cx - vacR * 0.3, cy + 10 - vacR * 0.3, vacR * 0.1,
      cx, cy + 10, vacR
    );
    vacGrad.addColorStop(0, '#67e8f9');
    vacGrad.addColorStop(0.5, COLORS.vacuole);
    vacGrad.addColorStop(1, '#0e7490');

    ctx.beginPath();
    ctx.arc(cx, cy + 10, vacR, 0, Math.PI * 2);
    ctx.fillStyle = vacGrad;
    ctx.fill();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vacuole Center Label
    ctx.font = 'bold 10px Inter, system-ui';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Central Vacuole', cx, cy + 10);

    // 4. Outward Hydrostatic Turgor Pressure Vectors (P_T Push)
    if (this.waterIntake > 30) {
      const numVectors = 8;
      const pulse = 0.88 + 0.12 * Math.sin(this.time * 4.5);
      const vecLen = (this.waterIntake / 100) * 1.0;

      for (let i = 0; i < numVectors; i++) {
        const angle = (i / numVectors) * Math.PI * 2;
        const innerDist = vacR + 4;
        const outerDist = Math.min(wallW / 2 - 14, (vacR + 28 * vecLen) * pulse);

        const x1 = cx + Math.cos(angle) * innerDist;
        const y1 = (cy + 10) + Math.sin(angle) * innerDist;
        const x2 = cx + Math.cos(angle) * outerDist;
        const y2 = (cy + 10) + Math.sin(angle) * outerDist;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = (turgorKpa > 400) ? '#34d399' : 'rgba(56, 189, 248, 0.80)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const headLen = 6;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = (turgorKpa > 400) ? '#34d399' : '#38bdf8';
        ctx.fill();
      }
    }

    // 5. Rigid Cell Wall Resistance Counter-Force (P_W Counter Pressure)
    if (turgorKpa > 300) {
      ctx.font = 'bold 9.5px Inter, system-ui';
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('P_W Cell Wall Resistance (Resists Bursting)', cx, wallY + wallH - 12);
    }

    // Render Plant Water Particles
    for (const p of this.plantParticles) {
      SimDraw.drawGlow(ctx, p.x, p.y, p.r * 1.5, COLORS.water, 0.35);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.water;
      ctx.fill();
    }

    // Plant Cell Turgor Status Badge
    let plantStatus = '⚖️ Normal Turgor Pressure';
    let statusBg = 'rgba(30, 27, 75, 0.60)';
    let statusColor = '#c7d2fe';

    if (this.waterIntake >= 65) {
      plantStatus = '💪 TURGID — Firm, Turgid & Healthy!';
      statusBg = 'rgba(6, 78, 59, 0.65)';
      statusColor = '#6ee7b7';
    } else if (this.waterIntake <= 30) {
      plantStatus = '🥀 PLASMOLYSED (Zero Turgor / Wilting)';
      statusBg = 'rgba(120, 53, 15, 0.70)';
      statusColor = '#fde68a';
    }

    SimDraw.drawLabel(ctx, plantStatus, cx, cy + wallH / 2 + 18, {
      bg: statusBg,
      color: statusColor
    });

    ctx.restore();
  }

  _drawClickRipples(ctx) {
    ctx.save();
    for (const r of this.ripples) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${r.alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawOverlayUI(ctx) {
    // Water Intake HUD Status Indicator (Top Center between headers)
    const cx = W / 2;
    const cy = SIM_TOP + 18;

    ctx.save();

    SimDraw.drawPanel(ctx, cx - 110, cy - 10, 220, 32, {
      bg: 'rgba(15, 23, 42, 0.65)',
      stroke: 'rgba(56, 189, 248, 0.40)',
      radius: 6
    });

    ctx.font = '700 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.water;
    ctx.textAlign = 'center';
    ctx.fillText(`WATER INTAKE LEVEL: ${this.waterIntake}%`, cx, cy + 1);

    // Compact Progress Bar
    const barW = 160;
    const barH = 5;
    const barX = cx - barW / 2;
    const barY = cy + 9;

    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();

    const fillW = (this.waterIntake / 100) * barW;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, 3);
    ctx.fillStyle = (this.waterIntake > 78) ? '#f87171' : COLORS.water;
    ctx.fill();

    ctx.restore();

    // Bottom Left: Cycling Glossary Card (Non-obstructive positioning)
    let gIdx = Math.floor(this.glossaryTimer / 7) % GLOSSARY.length;
    if (isNaN(gIdx) || gIdx < 0) gIdx = 0;
    this._drawGlossaryCard(ctx, 22, SIM_BOTTOM - 2, GLOSSARY[gIdx]);
  }

  _drawGlossaryCard(ctx, x, y, termItem) {
    ctx.save();
    ctx.font = 'bold 11px Inter, system-ui';
    const termW = ctx.measureText(`📖 ${termItem.term}`).width;

    ctx.font = '500 10.5px Inter, system-ui';
    const lines = termItem.desc.split('\n');
    let maxW = termW;
    lines.forEach(l => maxW = Math.max(maxW, ctx.measureText(l.trim()).width));

    const padX = 12, padY = 10;
    const lineH = 15;
    const w = maxW + padX * 2;
    const h = 18 + lines.length * lineH + padY;

    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = COLORS.plantWall;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10.5px Inter, system-ui';
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), x + padX, y - h + padY + 18 + i * lineH);
    });

    // Progress bar for term cycle
    const progress = (this.glossaryTimer % 7) / 7;
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 3, (w - 4) * progress, 2, 1);
    ctx.fillStyle = COLORS.plantWall;
    ctx.fill();

    ctx.restore();
  }

  // ── Drag & Click Interaction ──────────────────────────────────────────────

  _getCanvasCoords(e) {
    const rect = this._canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = W / (rect.width || W);
    const scaleY = H / (rect.height || H);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  _handleMouseDown(e) {
    const { x, y } = this._getCanvasCoords(e);
    const cx = W / 2;
    const cy = SIM_TOP + 86;
    const barW = 220;
    const barX = cx - barW / 2;

    // Check if clicked near the slider track / thumb
    if (y >= cy - 25 && y <= cy + 25 && x >= barX - 15 && x <= barX + barW + 15) {
      if (e.preventDefault && e.cancelable) e.preventDefault();
      this._isDraggingSlider = true;
      this._updateSliderFromX(x);
    }
  }

  _handleMouseMove(e) {
    if (!this._isDraggingSlider) return;
    if (e.preventDefault && e.cancelable) e.preventDefault();
    const { x } = this._getCanvasCoords(e);
    this._updateSliderFromX(x);
  }

  _handleMouseUp() {
    this._isDraggingSlider = false;
  }

  _updateSliderFromX(x) {
    const cx = W / 2;
    const barW = 220;
    const barX = cx - barW / 2;

    const clampedX = Math.max(barX, Math.min(barX + barW, x));
    const intake = Math.round(((clampedX - barX) / barW) * 100);

    this.waterIntake = intake;
    this._updateCellTargets();

    // Sync with HTML slider control if present in DOM
    const htmlSlider = this.container.querySelector('#waterIntake');
    if (htmlSlider) htmlSlider.value = intake;
  }

  _handleClick(e) {
    if (this._isDraggingSlider) return;
    const { x, y } = this._getCanvasCoords(e);

    if (y >= SIM_TOP && y <= SIM_BOTTOM && x >= 15 && x <= W - 15) {
      this.ripples.push({
        x: x,
        y: y,
        radius: 4,
        alpha: 1.0
      });
    }
  }
}
