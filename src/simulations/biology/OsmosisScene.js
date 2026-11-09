import { ParticleSimulation } from '../base/ParticleSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';
import { readSimColors } from '../base/SimTheme.js';

/**
 * OsmosisScene — Osmosis and Selective Permeability Particle Simulator.
 * 
 * High-fidelity, state-of-the-art interactive biological simulation demonstrating 
 * water flow across a selectively permeable lipid bilayer membrane under Hypotonic, 
 * Isotonic, and Hypertonic solution conditions.
 * 
 * Built for CBSE Class 9 Biology Curriculum (NCERT Standards).
 */

const MODE_THEMES = {
  hypotonic: {
    bgExtra:         '#031d38',
    bgExtraGrad:     ['rgba(2, 132, 199, 0.35)', 'rgba(3, 29, 56, 0.90)'],
    bgIntraGrad:     ['rgba(5, 150, 105, 0.40)', 'rgba(6, 78, 59, 0.85)'],
    extraFluidGlow:  'rgba(56, 189, 248, 0.25)',
    intraFluidGlow:  'rgba(52, 211, 153, 0.35)',
    cellMembrane:    '#34d399',
    cellMembraneGlow:'rgba(52, 211, 153, 0.45)',
    statusBg:        'rgba(12, 74, 110, 0.60)',
    statusBorder:    '#38bdf8',
    statusText:      '#7dd3fc',
    badgeTitle:      '💧 HYPOTONIC ENVIRONMENT',
    subtitle:        'Extracellular fluid has LOWER solute concentration (Higher free water potential).'
  },
  isotonic: {
    bgExtra:         '#0c142b',
    bgExtraGrad:     ['rgba(67, 56, 202, 0.25)', 'rgba(12, 20, 43, 0.90)'],
    bgIntraGrad:     ['rgba(99, 102, 241, 0.30)', 'rgba(30, 27, 75, 0.85)'],
    extraFluidGlow:  'rgba(129, 140, 248, 0.20)',
    intraFluidGlow:  'rgba(165, 180, 252, 0.25)',
    cellMembrane:    '#818cf8',
    cellMembraneGlow:'rgba(129, 140, 248, 0.35)',
    statusBg:        'rgba(30, 27, 75, 0.60)',
    statusBorder:    '#818cf8',
    statusText:      '#c7d2fe',
    badgeTitle:      '⚖️ ISOTONIC ENVIRONMENT',
    subtitle:        'Extracellular & intracellular fluids have EQUAL solute concentration.'
  },
  hypertonic: {
    bgExtra:         '#2a080c',
    bgExtraGrad:     ['rgba(185, 28, 28, 0.40)', 'rgba(42, 8, 12, 0.95)'],
    bgIntraGrad:     ['rgba(120, 53, 15, 0.35)', 'rgba(69, 26, 3, 0.90)'],
    extraFluidGlow:  'rgba(248, 113, 113, 0.30)',
    intraFluidGlow:  'rgba(245, 158, 11, 0.25)',
    cellMembrane:    '#ef4444',
    cellMembraneGlow:'rgba(239, 68, 68, 0.50)',
    statusBg:        'rgba(127, 29, 29, 0.60)',
    statusBorder:    '#f87171',
    statusText:      '#fca5a5',
    badgeTitle:      '⚠️ HYPERTONIC ENVIRONMENT',
    subtitle:        'Extracellular fluid has HIGHER solute concentration (Lower free water potential).'
  }
};

// Theme-aware structural palette (see this.colors, populated via readSimColors()
// in setup()/_reloadColors() — canvas can't resolve CSS var() directly).
// MODE_THEMES above is intentionally NOT themed here: those colors encode the
// osmotic condition being simulated (hypotonic/isotonic/hypertonic), not the
// app's light/dark appearance — an orthogonal concept.
//
// Maps onto sim-theme.css's closed palette (docs/sprints/wip/dom-simulations-
// md-prose-and-explanation-slides.md §4) rather than a private --sim-osmosis-*
// set: lipidHead is the one role with no ready-made generic token, so it
// borrows --sim-series-7 (cyan) to stay visually distinct from --sim-water/
// --sim-membrane elsewhere in this same scene. membraneGlow/aquaporinGlow/
// waterGlow are gone — nothing in this file actually read them; a translucent
// variant is now computed at the draw site via SimDraw.withAlpha() instead of
// a dedicated token.
const COLOR_TOKEN_MAP = {
  bgDeep:     ['--sim-bg-deep', '#0a0f1e'],
  membrane:   ['--sim-membrane', '#4f9cf7'],
  lipidHead:  ['--sim-series-7', '#22d3ee'],
  aquaporin:  ['--sim-success', '#34d399'],
  water:      ['--sim-water', '#38bdf8'],
  naSalt:     ['--sim-error', '#f87171'],
  clSalt:     ['--sim-success', '#34d399'],
  sugar:      ['--sim-warning', '#fbbf24'],
  graphIntra: ['--sim-water', '#38bdf8'],
  graphExtra: ['--sim-warning', '#fbbf24'],
  textMain:   ['--sim-label', '#e2e8f0'],
  textMuted:  ['--sim-label-muted', '#94a3b8'],
};

const GLOSSARY = [
  { term: 'Osmosis', desc: 'Net diffusion of water molecules across a selectively permeable\nmembrane from high water concentration to low water concentration.' },
  { term: 'Selective Permeability', desc: 'Property of cell membranes allowing small molecules (water)\nto pass freely through aquaporins while blocking larger solutes.' },
  { term: 'Hypotonic Solution', desc: 'Surrounding solution has FEWER solutes than cell cytoplasm.\nWater enters the cell, causing it to swell or burst (turgor/lysis).' },
  { term: 'Isotonic Solution', desc: 'Surrounding solution has EQUAL solute concentration.\nWater moves in and out at equal rates (dynamic equilibrium).' },
  { term: 'Hypertonic Solution', desc: 'Surrounding solution has MORE solutes than cell cytoplasm.\nWater exits the cell, causing it to shrink (plasmolysis).' },
  { term: 'Aquaporin Pores', desc: 'Specialized channel proteins in the lipid bilayer that facilitate\nrapid passage of water molecules across the membrane.' },
  { term: 'Turgor Pressure', desc: 'Outward pressure exerted by cell fluid against the rigid cell wall,\nproviding structural firmness in plant tissues.' }
];

const W = 700;
const H = 450;
const MEMBRANE_X = 350;
const SIM_TOP = 15;
const SIM_BOTTOM = 350;

export class OsmosisScene extends ParticleSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static ARIA_LABEL = 
    'Osmosis and Selective Permeability Particle Simulator. High-fidelity visualization of ' +
    'water movement across a lipid bilayer membrane under Hypotonic, Isotonic, and Hypertonic conditions.';

  static CONTROLS = [
    {
      type: 'select',
      id: 'solutionType',
      label: 'Extracellular Environment Solution Type:',
      options: [
        { value: 'hypotonic', label: 'Hypotonic (Low Solute Outside → Water Enters Cell)' },
        { value: 'isotonic',  label: 'Isotonic (Equal Solute Concentration → Equilibrium)' },
        { value: 'hypertonic', label: 'Hypertonic (High Solute Outside → Water Exits Cell)' }
      ]
    },
    { type: 'button', id: 'reset', label: 'Reset Particles' }
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    // Simulation state
    this.solutionType = 'hypotonic'; // 'hypotonic' | 'isotonic' | 'hypertonic'
    this.time = 0;
    this.glossaryTimer = 0;
    this.announceTimer = 0;

    // Membrane Aquaporin Channels
    this.aquaporins = [];
    this._initAquaporins();

    // Visual Sparkle Particles (spawned when water crosses aquaporins)
    this.sparkles = [];

    // Interactive Fluid Click Ripples
    this.ripples = [];

    // Cell swelling / shrinking factor (1.0 = normal, 1.25 = swollen, 0.76 = shrunken)
    this.cellVolume = 1.0;
    this.targetCellVolume = 1.25;

    // Real-time Graph Data History
    this.graphHistory = [];
    this.maxGraphSamples = 180;

    // Molecule Statistics
    this.intraWaterCount = 0;
    this.extraWaterCount = 0;
    this.intraSoluteCount = 0;
    this.extraSoluteCount = 0;

    this._liveRegion = null;
    this._onClick = this._handleClick.bind(this);
  }

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._canvas.addEventListener('click', this._onClick);

    this._reloadColors();
    this._buildLiveRegion();
    this._initParticlesForMode(this.solutionType);
    this._drawInitialFrame(this._ctx);

    this._announce(`Osmosis simulation loaded in ${this.solutionType.toUpperCase()} mode.`);
  }

  _reloadColors() {
    this.colors = readSimColors(this.container, COLOR_TOKEN_MAP);
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
    }
    if (this._liveRegion) {
      this._liveRegion.remove();
      this._liveRegion = null;
    }
    super.destroy();
  }

  onControlChange(id, value) {
    if (id === 'solutionType') {
      this.solutionType = value;
      this._initParticlesForMode(value);
      this._announce(`Switched solution environment to ${value.toUpperCase()}.`);
    } else if (id === 'reset') {
      this._initParticlesForMode(this.solutionType);
      this._announce('Particles reset.');
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

  _initAquaporins() {
    this.aquaporins = [];
    const numPores = 9;
    const startY = SIM_TOP + 32;
    const endY = SIM_BOTTOM - 32;
    const step = (endY - startY) / (numPores - 1);

    for (let i = 0; i < numPores; i++) {
      this.aquaporins.push({
        x: MEMBRANE_X,
        y: startY + i * step,
        r: 7.5,
        pulse: 0
      });
    }
  }

  _initParticlesForMode(mode) {
    this.particles = [];
    this.graphHistory = [];
    this.sparkles = [];
    this.ripples = [];
    this.time = 0;

    let intraWater = 36;
    let extraWater = 36;
    let intraSolutes = 6;
    let extraSolutes = 6;

    if (mode === 'hypotonic') {
      intraSolutes = 14;
      extraSolutes = 2;
      intraWater = 28;
      extraWater = 48;
      this.targetCellVolume = 1.38;
    } else if (mode === 'isotonic') {
      intraSolutes = 8;
      extraSolutes = 8;
      intraWater = 36;
      extraWater = 36;
      this.targetCellVolume = 1.0;
    } else if (mode === 'hypertonic') {
      intraSolutes = 2;
      extraSolutes = 18;
      intraWater = 48;
      extraWater = 28;
      this.targetCellVolume = 0.66;
    }

    // Spawn Intracellular (Left) Particles
    this._spawnParticleBatch(15 + 30, MEMBRANE_X - 35, SIM_TOP + 25, SIM_BOTTOM - 25, intraWater, 'water');
    this._spawnParticleBatch(15 + 40, MEMBRANE_X - 50, SIM_TOP + 35, SIM_BOTTOM - 35, intraSolutes / 2, 'salt');
    this._spawnParticleBatch(15 + 40, MEMBRANE_X - 50, SIM_TOP + 35, SIM_BOTTOM - 35, intraSolutes / 2, 'sugar');

    // Spawn Extracellular (Right) Particles
    this._spawnParticleBatch(MEMBRANE_X + 35, W - 40, SIM_TOP + 25, SIM_BOTTOM - 25, extraWater, 'water');
    this._spawnParticleBatch(MEMBRANE_X + 50, W - 50, SIM_TOP + 35, SIM_BOTTOM - 35, extraSolutes / 2, 'salt');
    this._spawnParticleBatch(MEMBRANE_X + 50, W - 50, SIM_TOP + 35, SIM_BOTTOM - 35, extraSolutes / 2, 'sugar');
  }

  _spawnParticleBatch(minX, maxX, minY, maxY, count, type) {
    for (let i = 0; i < Math.floor(count); i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      const angle = Math.random() * Math.PI * 2;
      const speed = (type === 'water') ? 42 + Math.random() * 28 : 18 + Math.random() * 18;

      let r = 3.5;
      let color = this.colors.water;
      let label = '';

      if (type === 'salt') {
        r = 7.2;
        color = (i % 2 === 0) ? this.colors.naSalt : this.colors.clSalt;
        label = (i % 2 === 0) ? 'Na⁺' : 'Cl⁻';
      } else if (type === 'sugar') {
        r = 8.8;
        color = this.colors.sugar;
        label = 'S';
      }

      this.addParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
        color,
        type,
        label,
        mass: r,
        trail: []
      });
    }
  }

  _classifyParticle(p) {
    return p.r < 5 ? 'pass' : 'block';
  }

  // ── Physics & Selective Permeability Enforcement ───────────────────────

  enforceBoundary() {
    const W_eff = W - 15;
    const H_eff = SIM_BOTTOM;
    const minX = 15;
    const minY = SIM_TOP;

    const extraSolutes = this.particles.filter(p => p.x > MEMBRANE_X && p.type !== 'water').length;
    const intraSolutes = this.particles.filter(p => p.x < MEMBRANE_X && p.type !== 'water').length;
    const soluteDiff = extraSolutes - intraSolutes;
    const osmoticPullFactor = soluteDiff * 0.50;

    for (const p of this.particles) {
      // Top / Bottom Box Boundaries
      if (p.y < minY + p.r) { p.y = minY + p.r; p.vy *= -1; }
      if (p.y > H_eff - p.r) { p.y = H_eff - p.r; p.vy *= -1; }

      // Left / Right Box Boundaries
      if (p.x < minX + p.r) { p.x = minX + p.r; p.vx *= -1; }
      if (p.x > W_eff - p.r) { p.x = W_eff - p.r; p.vx *= -1; }

      // Membrane Crossing & Permeability Logic
      const isSolute = p.type !== 'water';
      const nearMembrane = Math.abs(p.x - MEMBRANE_X) < p.r + 5;

      if (isSolute) {
        // Solutes cannot pass aquaporins due to size!
        if (p.x < MEMBRANE_X && p.x + p.r >= MEMBRANE_X) {
          p.x = MEMBRANE_X - p.r - 1.5;
          p.vx *= -1;
        } else if (p.x > MEMBRANE_X && p.x - p.r <= MEMBRANE_X) {
          p.x = MEMBRANE_X + p.r + 1.5;
          p.vx *= -1;
        }
      } else {
        // Water molecules: Can pass through Aquaporin channels
        if (nearMembrane) {
          let alignedPore = null;
          for (const pore of this.aquaporins) {
            if (Math.abs(p.y - pore.y) <= pore.r * 1.35) {
              alignedPore = pore;
              break;
            }
          }

          if (alignedPore) {
            // Water passes through aquaporin channel!
            p.vx += osmoticPullFactor * 0.18;
            alignedPore.pulse = 1.0;

            // Spawn passage sparkle effect occasionally
            if (Math.random() < 0.15) {
              this.sparkles.push({
                x: MEMBRANE_X + (Math.random() - 0.5) * 6,
                y: alignedPore.y + (Math.random() - 0.5) * 6,
                r: 1.5 + Math.random() * 2.0,
                alpha: 1.0,
                vy: (Math.random() - 0.5) * 15
              });
            }
          } else {
            // Hits solid phospholipid heads between pores → gentle bounce
            if (p.x < MEMBRANE_X && p.x + p.r >= MEMBRANE_X - 1) {
              p.x = MEMBRANE_X - p.r - 1;
              p.vx *= -0.85;
            } else if (p.x > MEMBRANE_X && p.x - p.r <= MEMBRANE_X + 1) {
              p.x = MEMBRANE_X + p.r + 1;
              p.vx *= -0.85;
            }
          }
        }
      }
    }
  }

  // ── Main Update & Render Loop ────────────────────────────────────────────

  _tick(ctx, dt) {
    this.time += dt;
    this.glossaryTimer += dt;
    this.announceTimer += dt;

    // Decay aquaporin pulses
    for (const pore of this.aquaporins) {
      if (pore.pulse > 0) pore.pulse = Math.max(0, pore.pulse - dt * 2.8);
    }

    // Update sparkles
    for (const s of this.sparkles) {
      s.y += s.vy * dt;
      s.alpha -= dt * 2.2;
    }
    this.sparkles = this.sparkles.filter(s => s.alpha > 0);

    // Update click ripples
    for (const r of this.ripples) {
      r.radius += dt * 75;
      r.alpha -= dt * 1.5;
    }
    this.ripples = this.ripples.filter(r => r.alpha > 0);

    // Smoothly update cell volume to target (swelling or shrinking)
    this.cellVolume += (this.targetCellVolume - this.cellVolume) * (1.1 * dt);

    // Run particle physics & trails
    this.applyBrownianMotion(dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Particle position trail for water
      if (p.type === 'water') {
        if (!p.trail) p.trail = [];
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 4) p.trail.shift();
      }
    }
    this.resolveCollisions();
    this.enforceBoundary();

    // Count water and solute distribution
    let intraW = 0, extraW = 0, intraS = 0, extraS = 0;
    for (const p of this.particles) {
      if (p.x < MEMBRANE_X) {
        if (p.type === 'water') intraW++; else intraS++;
      } else {
        if (p.type === 'water') extraW++; else extraS++;
      }
    }
    this.intraWaterCount = intraW;
    this.extraWaterCount = extraW;
    this.intraSoluteCount = intraS;
    this.extraSoluteCount = extraS;

    // Update real-time graph history
    if (this.graphHistory.length === 0 || this.time - (this.graphHistory[this.graphHistory.length - 1].time || 0) > 0.08) {
      const totalW = Math.max(1, intraW + extraW);
      this.graphHistory.push({
        time: this.time,
        intraPct: Math.round((intraW / totalW) * 100),
        extraPct: Math.round((extraW / totalW) * 100),
        intraCount: intraW,
        extraCount: extraW
      });
      if (this.graphHistory.length > this.maxGraphSamples) {
        this.graphHistory.shift();
      }
    }

    // Periodic accessibility announcements
    if (this.announceTimer >= 10.0) {
      this.announceTimer = 0;
      const totalW = Math.max(1, intraW + extraW);
      const intraPct = Math.round((intraW / totalW) * 100);
      this._announce(
        `Osmosis state: ${this.solutionType.toUpperCase()}. Intracellular water: ${intraPct}%, ` +
        `Extracellular water: ${100 - intraPct}%.`
      );
    }

    // Master Render Pipeline
    this._drawDynamicAtmosphere(ctx);
    this._drawCellMembraneBoundary(ctx);
    this._drawLipidBilayerMembrane(ctx);
    this._drawClickRipples(ctx);
    this._drawParticles(ctx);
    this._drawSparkles(ctx);
    this._drawRealtimeGraph(ctx);
    this._drawOverlayUI(ctx);
  }

  _drawInitialFrame(ctx) {
    this._tick(ctx, 0);
  }

  // ── Render Passes ────────────────────────────────────────────────────────

  _drawDynamicAtmosphere(ctx) {
    const theme = MODE_THEMES[this.solutionType];

    // Deep Canvas Base
    ctx.fillStyle = this.colors.bgDeep;
    ctx.fillRect(0, 0, W, H);

    // Intracellular Gradient Background (Left Side)
    const intraGrad = ctx.createRadialGradient(
      MEMBRANE_X / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 20,
      MEMBRANE_X / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 220
    );
    intraGrad.addColorStop(0, theme.bgIntraGrad[0]);
    intraGrad.addColorStop(1, theme.bgIntraGrad[1]);
    ctx.fillStyle = intraGrad;
    ctx.fillRect(15, SIM_TOP, MEMBRANE_X - 15, SIM_BOTTOM - SIM_TOP);

    // Extracellular Gradient Background (Right Side - Visually Distinct per Solution Mode)
    const extraGrad = ctx.createRadialGradient(
      MEMBRANE_X + (W - MEMBRANE_X) / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 20,
      MEMBRANE_X + (W - MEMBRANE_X) / 2, SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2, 220
    );
    extraGrad.addColorStop(0, theme.bgExtraGrad[0]);
    extraGrad.addColorStop(1, theme.bgExtraGrad[1]);
    ctx.fillStyle = extraGrad;
    ctx.fillRect(MEMBRANE_X, SIM_TOP, W - 30 - (MEMBRANE_X - 15), SIM_BOTTOM - SIM_TOP);

    // Animated Ambient Fluid Currents / Wave Lines
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.setLineDash([12, 16]);

    // Left Fluid Wave Lines
    ctx.strokeStyle = theme.intraFluidGlow;
    for (let y = SIM_TOP + 40; y < SIM_BOTTOM - 20; y += 75) {
      ctx.beginPath();
      for (let x = 20; x < MEMBRANE_X - 10; x += 15) {
        const py = y + Math.sin(x * 0.02 + this.time * 2.0) * 6;
        if (x === 20) ctx.moveTo(x, py); else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }

    // Right Fluid Wave Lines
    ctx.strokeStyle = theme.extraFluidGlow;
    for (let y = SIM_TOP + 45; y < SIM_BOTTOM - 20; y += 75) {
      ctx.beginPath();
      for (let x = MEMBRANE_X + 15; x < W - 20; x += 15) {
        const py = y + Math.cos(x * 0.02 + this.time * 2.0) * 6;
        if (x === MEMBRANE_X + 15) ctx.moveTo(x, py); else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }

    // Hypertonic Solute Haze Speckles (Visible when Hypertonic)
    if (this.solutionType === 'hypertonic') {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
      for (let i = 0; i < 25; i++) {
        const sx = MEMBRANE_X + 20 + Math.sin(i * 37 + this.time) * 150;
        const sy = SIM_TOP + 20 + Math.cos(i * 19 + this.time * 0.8) * 140;
        if (sx > MEMBRANE_X + 10 && sx < W - 20 && sy > SIM_TOP + 10 && sy < SIM_BOTTOM - 10) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  _drawCellMembraneBoundary(ctx) {
    const theme = MODE_THEMES[this.solutionType];
    const cx = 15 + (MEMBRANE_X - 15) / 2;
    const cy = SIM_TOP + (SIM_BOTTOM - SIM_TOP) / 2;

    // Base dimensions for Isotonic state (cellVolume = 1.0)
    const baseRx = 110;
    const baseRy = 100;

    // Scaled dimensions (Hypotonic swells to ~148px, Isotonic ~110px, Hypertonic shrinks to ~75px)
    const rx = baseRx * this.cellVolume;
    const ry = baseRy * this.cellVolume;

    ctx.save();

    // 1. Draw Rigid Outer Cell Wall Boundary (Outer plant cell wall reference)
    ctx.beginPath();
    ctx.roundRect(22, SIM_TOP + 12, MEMBRANE_X - 44, SIM_BOTTOM - SIM_TOP - 24, 16);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.20)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Cell Cytoplasm Fluid Aura Glow Overlay
    ctx.beginPath();
    ctx.ellipse(cx - 10, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = theme.cellMembraneGlow;
    ctx.fill();

    // 3. Render Outward Turgor Pressure Vectors in Hypotonic Mode
    if (this.solutionType === 'hypotonic') {
      const numVectors = 8;
      const pulse = 0.88 + 0.12 * Math.sin(this.time * 4.0);
      for (let i = 0; i < numVectors; i++) {
        const angle = (i / numVectors) * Math.PI * 2;
        const innerDist = rx * 0.45;
        const outerDist = rx * 0.92 * pulse;

        const x1 = (cx - 10) + Math.cos(angle) * innerDist;
        const y1 = cy + Math.sin(angle) * (ry * (innerDist / rx));
        const x2 = (cx - 10) + Math.cos(angle) * outerDist;
        const y2 = cy + Math.sin(angle) * (ry * (outerDist / rx));

        // Arrow Shaft
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Arrow Head
        const headLen = 6;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = '#34d399';
        ctx.fill();
      }

      // Turgor Pressure Tag at top of cell
      SimDraw.drawLabel(ctx, '💪 HIGH TURGOR PRESSURE (Outward Hydro-Force)', cx - 10, cy - ry - 14, {
        bg: 'rgba(6, 78, 59, 0.90)',
        color: '#6ee7b7'
      });
    } else if (this.solutionType === 'isotonic') {
      SimDraw.drawLabel(ctx, '⚖️ NORMAL TURGOR PRESSURE (Balanced)', cx - 10, cy - ry - 14, {
        bg: 'rgba(30, 27, 75, 0.90)',
        color: '#c7d2fe'
      });
    } else if (this.solutionType === 'hypertonic') {
      SimDraw.drawLabel(ctx, '🥀 ZERO TURGOR (Plasmolysis / Wilting)', cx - 10, cy - ry - 14, {
        bg: 'rgba(127, 29, 29, 0.90)',
        color: '#fca5a5'
      });
    }

    // 4. Elastic Flexible Cell Membrane Boundary
    ctx.strokeStyle = theme.cellMembrane;
    ctx.lineWidth = (this.solutionType === 'hypotonic') ? 3.5 : 2.5;
    ctx.setLineDash((this.solutionType === 'hypertonic') ? [6, 4] : []);
    ctx.stroke();

    // 5. State-specific Cell State Badges (Turgid vs Normal vs Plasmolysed)
    if (this.solutionType === 'hypotonic' && this.cellVolume > 1.15) {
      SimDraw.drawLabel(ctx, '💧 Turgid Cell (Swollen & Firm)', cx - 10, cy + ry + 16, {
        bg: 'rgba(12, 74, 110, 0.95)',
        color: '#7dd3fc'
      });
    } else if (this.solutionType === 'isotonic') {
      SimDraw.drawLabel(ctx, '⚖️ Normal Cell (Homeostasis)', cx - 10, cy + ry + 16, {
        bg: 'rgba(30, 27, 75, 0.95)',
        color: '#c7d2fe'
      });
    } else if (this.solutionType === 'hypertonic' && this.cellVolume < 0.85) {
      SimDraw.drawLabel(ctx, '⚠️ Plasmolysed Cell (Shrunken)', cx - 10, cy + ry + 16, {
        bg: 'rgba(127, 29, 29, 0.95)',
        color: '#fca5a5'
      });
    }

    ctx.restore();
  }

  _drawLipidBilayerMembrane(ctx) {
    ctx.save();

    // Membrane Core Bilayer Shading
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fillRect(MEMBRANE_X - 10, SIM_TOP, 20, SIM_BOTTOM - SIM_TOP);

    // Render Dual Phospholipid Head Rows
    const headSpacing = 11;
    const startY = SIM_TOP + 10;
    const endY = SIM_BOTTOM - 10;

    for (let y = startY; y <= endY; y += headSpacing) {
      // Skip heads where Aquaporin channel proteins are located
      let insideAquaporin = false;
      for (const pore of this.aquaporins) {
        if (Math.abs(y - pore.y) < 11) {
          insideAquaporin = true;
          break;
        }
      }

      if (!insideAquaporin) {
        // Left Phospholipid Head & Hydrophobic Tail
        ctx.beginPath();
        ctx.arc(MEMBRANE_X - 6, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.colors.lipidHead;
        ctx.fill();

        ctx.strokeStyle = SimDraw.withAlpha(this.colors.lipidHead, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MEMBRANE_X - 3, y);
        ctx.lineTo(MEMBRANE_X, y);
        ctx.stroke();

        // Right Phospholipid Head & Hydrophobic Tail
        ctx.beginPath();
        ctx.arc(MEMBRANE_X + 6, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.colors.lipidHead;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(MEMBRANE_X + 3, y);
        ctx.lineTo(MEMBRANE_X, y);
        ctx.stroke();
      }
    }

    // Render 3D Aquaporin Channel Proteins
    for (const pore of this.aquaporins) {
      // Glow pulse when water passes through channel
      if (pore.pulse > 0) {
        ctx.beginPath();
        ctx.arc(pore.x, pore.y, pore.r + 6 * pore.pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 211, 153, ${pore.pulse * 0.65})`;
        ctx.fill();
      }

      // Channel Protein Barrel Structure
      ctx.beginPath();
      ctx.roundRect(pore.x - 9, pore.y - 8, 18, 16, 4);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = (pore.pulse > 0) ? '#34d399' : this.colors.membrane;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pore Central Opening
      ctx.beginPath();
      ctx.arc(pore.x, pore.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = (pore.pulse > 0) ? '#6ee7b7' : '#0284c7';
      ctx.fill();
    }

    // Membrane Header Label
    SimDraw.drawLabel(ctx, 'SELECTIVELY PERMEABLE MEMBRANE', MEMBRANE_X, SIM_TOP + 12, {
      bg: 'rgba(15, 23, 42, 0.55)',
      color: this.colors.membrane
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

  _drawSparkles(ctx) {
    ctx.save();
    for (const s of this.sparkles) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(52, 211, 153, ${s.alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      // Draw water velocity trails
      if (p.type === 'water' && p.trail && p.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) {
          ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Outer glow halo
      SimDraw.drawGlow(ctx, p.x, p.y, p.r * 1.5, p.color, (p.type === 'water') ? 0.35 : 0.45);

      // Particle 3D Sphere Body
      const sphereGrad = ctx.createRadialGradient(
        p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1,
        p.x, p.y, p.r
      );
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.3, p.color);
      sphereGrad.addColorStop(1, '#0f172a');

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrad;
      ctx.fill();

      // Solute Chemical Labels (Na⁺, Cl⁻, S)
      if (p.label) {
        ctx.font = 'bold 9px Inter, system-ui';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y);
      }
    }
    ctx.restore();
  }

  _drawRealtimeGraph(ctx) {
    const graphX = 15;
    const graphY = 362;
    const graphW = W - 30;
    const graphH = 78;

    // Glassmorphic Panel Background
    SimDraw.drawPanel(ctx, graphX, graphY, graphW, graphH, {
      bg: 'rgba(15, 23, 42, 0.60)',
      stroke: 'rgba(56, 189, 248, 0.30)',
      radius: 8
    });

    ctx.save();

    // Title & Net Water Flow Arrow Direction Badge
    ctx.font = '700 11px Inter, system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('NET WATER MOVEMENT OVER TIME', graphX + 12, graphY + 16);

    // Direction Banner
    let flowMsg = '⚖️ NET FLOW: EQUILIBRIUM (NO CHANGE)';
    let flowColor = '#a5b4fc';
    if (this.solutionType === 'hypotonic') {
      flowMsg = '➔ NET FLOW: INWARD (CELL SWELLING)';
      flowColor = '#7dd3fc';
    } else if (this.solutionType === 'hypertonic') {
      flowMsg = '⬅ NET FLOW: OUTWARD (CELL SHRINKING)';
      flowColor = '#fca5a5';
    }

    ctx.font = '700 10.5px Inter, system-ui';
    ctx.fillStyle = flowColor;
    ctx.fillText(flowMsg, graphX + 220, graphY + 16);

    // Legend
    ctx.font = '600 10px Inter, system-ui';
    ctx.fillStyle = this.colors.graphIntra;
    ctx.fillText('● Cell Water %', graphX + 485, graphY + 16);
    ctx.fillStyle = this.colors.graphExtra;
    ctx.fillText('● Outer Water %', graphX + 575, graphY + 16);

    // Plot Grid Area
    const plotX = graphX + 40;
    const plotY = graphY + 26;
    const plotW = graphW - 65;
    const plotH = graphH - 34;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plotX, plotY + plotH / 2);
    ctx.lineTo(plotX + plotW, plotY + plotH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Render Real-time Graph Lines with Gradient Fills
    if (this.graphHistory.length > 1) {
      const samples = this.graphHistory;
      const len = samples.length;
      const stepX = plotW / (this.maxGraphSamples - 1);

      // 1. Fill & Line Intracellular (Cyan)
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = plotX + i * stepX;
        const pct = samples[i].intraPct;
        const y = plotY + plotH - (pct / 100) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.colors.graphIntra;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // 2. Line Extracellular (Amber)
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = plotX + i * stepX;
        const pct = samples[i].extraPct;
        const y = plotY + plotH - (pct / 100) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.colors.graphExtra;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Readout Badges
      const last = samples[len - 1];
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.fillStyle = this.colors.graphIntra;
      ctx.fillText(`${last.intraPct}%`, plotX + plotW + 4, plotY + plotH - (last.intraPct / 100) * plotH + 4);
    }

    ctx.restore();
  }

  _drawOverlayUI(ctx) {
    const theme = MODE_THEMES[this.solutionType];

    // Left Panel: Intracellular Fluid Stats (Increased transparency)
    SimDraw.drawPanel(ctx, 22, SIM_TOP + 8, 205, 50, {
      bg: 'rgba(15, 23, 42, 0.55)',
      stroke: 'rgba(56, 189, 248, 0.35)',
      radius: 8
    });

    ctx.save();
    ctx.font = '700 11.5px Inter, system-ui';
    ctx.fillStyle = this.colors.graphIntra;
    ctx.fillText('INTRACELLULAR (Cell Cytoplasm)', 32, SIM_TOP + 24);

    ctx.font = '500 11px Inter, system-ui';
    ctx.fillStyle = this.colors.textMuted;
    ctx.fillText(`Water: ${this.intraWaterCount}  |  Solutes: ${this.intraSoluteCount}`, 32, SIM_TOP + 43);
    ctx.restore();

    // Right Panel: Extracellular Fluid Stats (Increased transparency)
    SimDraw.drawPanel(ctx, W - 227, SIM_TOP + 8, 205, 50, {
      bg: 'rgba(15, 23, 42, 0.55)',
      stroke: theme.statusBorder,
      radius: 8
    });

    ctx.save();
    ctx.font = '700 11.5px Inter, system-ui';
    ctx.fillStyle = theme.statusText;
    ctx.fillText('EXTRACELLULAR (Outer Solution)', W - 217, SIM_TOP + 24);

    ctx.font = '500 11px Inter, system-ui';
    ctx.fillStyle = this.colors.textMuted;
    ctx.fillText(`Water: ${this.extraWaterCount}  |  Solutes: ${this.extraSoluteCount}`, W - 217, SIM_TOP + 43);
    ctx.restore();

    // Center Top: Environment Status Banner
    this._drawEnvironmentBanner(ctx);

    // Bottom Left: Cycling Glossary Card
    let gIdx = Math.floor(this.glossaryTimer / 7) % GLOSSARY.length;
    if (isNaN(gIdx) || gIdx < 0) gIdx = 0;
    this._drawGlossaryCard(ctx, 22, SIM_BOTTOM - 10, GLOSSARY[gIdx]);
  }

  _drawEnvironmentBanner(ctx) {
    const theme = MODE_THEMES[this.solutionType];
    const cx = W / 2;
    const cy = SIM_TOP + 84;

    const lines = [theme.badgeTitle, theme.subtitle];
    ctx.save();

    ctx.font = '700 11.5px Inter, system-ui';
    let maxW = ctx.measureText(lines[0]).width;
    ctx.font = '500 10.5px Inter, system-ui';
    maxW = Math.max(maxW, ctx.measureText(lines[1]).width);

    const padX = 16, padY = 8;
    const bw = maxW + padX * 2;
    const bh = 44;
    const bx = cx - bw / 2;
    const by = cy - bh / 2;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fillStyle = theme.statusBg;
    ctx.fill();
    ctx.strokeStyle = theme.statusBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '700 11.5px Inter, system-ui';
    ctx.fillStyle = theme.statusText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(lines[0], cx, by + padY);

    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = this.colors.textMain;
    ctx.fillText(lines[1], cx, by + padY + 18);

    ctx.restore();
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
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = this.colors.membrane;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);

    ctx.fillStyle = this.colors.textMuted;
    ctx.font = '500 10.5px Inter, system-ui';
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), x + padX, y - h + padY + 18 + i * lineH);
    });

    // Progress bar for term cycle
    const progress = (this.glossaryTimer % 7) / 7;
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 3, (w - 4) * progress, 2, 1);
    ctx.fillStyle = this.colors.membrane;
    ctx.fill();

    ctx.restore();
  }

  // ── Click Interaction ───────────────────────────────────────────────────

  _handleClick(e) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = W / (rect.width || W);
    const scaleY = H / (rect.height || H);
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    if (clickY >= SIM_TOP && clickY <= SIM_BOTTOM && clickX >= 15 && clickX <= W - 15) {
      // Spawn expanding click ripple
      this.ripples.push({
        x: clickX,
        y: clickY,
        radius: 4,
        alpha: 1.0
      });

      // Spawn 3 water molecules at click location
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 20;
        this.addParticle({
          x: clickX + (Math.random() - 0.5) * 15,
          y: clickY + (Math.random() - 0.5) * 15,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 3.5,
          color: this.colors.water,
          type: 'water',
          mass: 3.5,
          trail: []
        });
      }
      this._announce('Added water molecules at click position.');
    }
  }
}
