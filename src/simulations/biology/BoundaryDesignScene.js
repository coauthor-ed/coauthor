import { ParticleSimulation } from '../base/ParticleSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * BoundaryDesignScene — Part 2.2 "Design the Ultimate Boundary".
 *
 * A high-fidelity, pseudo-3D interactive simulation that lets a Class 9
 * student explore WHY a cell needs a *selectively permeable* boundary.
 *
 * A proto-cell sits in the centre of the canvas holding its essential
 * molecules (proteins + glucose). The student chooses one of three
 * boundary designs and watches two stressors play out:
 *
 *   🚫  CLOSED              — a solid rigid capsule. Nothing crosses.
 *                              Nutrients bounce off → the cell STARVES;
 *                              waste piles up inside → the cell turns TOXIC.
 *   🌊  OPEN (no boundary)    — everything drifts freely. Nutrients enter
 *                              but essentials also leak out → the cell
 *                              DISSOLVES away.
 *   🔀  SELECTIVELY PERMEABLE— a lipid bilayer studded with channel
 *                              proteins. Small nutrients & waste slip
 *                              through the pores; large essentials are
 *                              trapped inside → the cell THRIVES.
 *
 * Visual language follows the rest of the biology suite (OsmosisScene /
 * TurgorPressureScene / RibosomeScene): radial-gradient "3D" molecules,
 * glowing phospholipid bilayer, channel-protein barrels, ambient fluid
 * currents, a cycling glossary card and a live health readout.
 *
 * Per the project SKILL, no business logic leaks into the plugin shell —
 * the scene owns the physics & rendering. Matter.js is intentionally NOT
 * used here: the existing biology scenes (TurgorPressureScene, OsmosisScene)
 * prefer a custom Canvas-2D loop for far richer visuals than Matter's flat
 * renderer can offer, and this scene follows that established convention.
 */

const W = 620;
const H = 420;
const CX = 310;
const CY = 205;
const R  = 94;          // proto-cell membrane radius

const COLORS = {
  bgDeep:        '#050811',
  bgCell:        '#0d1f3c',
  cytoplasm:     'rgba(30, 58, 95, 0.35)',
  membrane:      '#4f9cf7',
  membraneGlow:  'rgba(79, 156, 247, 0.40)',
  lipidHead:     '#7dd3fc',
  lipidTail:     'rgba(79, 156, 247, 0.30)',
  channel:       '#34d399',
  channelGlow:   'rgba(52, 211, 153, 0.55)',
  wall:          '#94a3b8',
  wallGlow:      'rgba(148, 163, 184, 0.30)',
  protein:       '#f472b6',
  glucose:       '#fbbf24',
  nutrient:      '#a3e635',
  waste:         '#78716c',
  thrive:        '#34d399',
  toxic:         '#ef4444',
  dissolve:      '#60a5fa',
  textMain:      '#f8fafc',
  textMuted:     '#94a3b8',
};

const BOUNDARIES = {
  closed:    { label: '🚫 Completely Closed',    short: 'CLOSED',
               blurb: 'A solid rigid capsule — nothing can cross.' },
  open:      { label: '🌊 Completely Open',     short: 'OPEN',
               blurb: 'No boundary at all — everything drifts freely.' },
  selective: { label: '🔀 Selectively Permeable', short: 'SELECTIVE',
               blurb: 'A lipid bilayer with channel-protein pores.' },
};

const GLOSSARY = [
  { term: 'Selectively Permeable',
    desc: 'A property of the cell membrane: it lets some substances\nthrough freely while keeping others out. The key to cell survival.' },
  { term: 'Lipid Bilayer',
    desc: 'Two back-to-back sheets of phospholipids. The water-loving\nheads face outward; the water-fearing tails hide inside.' },
  { term: 'Phospholipid',
    desc: 'A molecule with a hydrophilic (water-loving) head and two\nhydrophobic (water-fearing) tails — the building block of membranes.' },
  { term: 'Channel Protein',
    desc: 'A pore-shaped protein embedded in the membrane. It forms a\ntunnel that lets specific small molecules (e.g. nutrients, waste) cross.' },
  { term: 'Diffusion',
    desc: 'Molecules naturally move from where they are crowded (high\nconcentration) to where they are sparse (low concentration).' },
  { term: 'Concentration Gradient',
    desc: 'The difference in concentration between two regions. Molecules\ndiffuse down this gradient until balance is reached.' },
  { term: 'Homeostasis',
    desc: 'The steady internal balance a living cell must keep — the\nright nutrients in, wastes out, essentials retained.' },
];

const ESSENTIAL_LARGE_R = 7.5;   // proteins & glucose are "large" → blocked by selective membrane
const SMALL_PASS_R      = 4.5;   // nutrients & waste are "small" → cross the selective membrane

export class BoundaryDesignScene extends ParticleSimulation {
  static WIDTH  = W;
  static HEIGHT = H;
  static BOUNDARY = 'wrap';      // not used — we override enforceBoundary()

  static ARIA_LABEL =
    'Design the Ultimate Boundary. Choose a cell boundary — closed, open, or ' +
    'selectively permeable — and watch nutrients, waste and essential ' +
    'molecules decide whether the proto-cell survives.';

  static CONTROLS = [
    {
      type: 'select', id: 'boundaryType', label: 'Boundary design:',
      options: [
        { value: 'closed',    label: '🚫 Completely Closed (solid wall)' },
        { value: 'open',      label: '🌊 Completely Open (no boundary)' },
        { value: 'selective', label: '🔀 Selectively Permeable (lipid bilayer + pores)' }
      ],
    },
    { type: 'button', id: 'run',   label: '▶ Run Stress Test' },
    { type: 'button', id: 'reset', label: '↻ Reset' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.boundaryType   = 'closed';      // 'closed' | 'open' | 'selective'
    this._phase         = 'running';     // 'running' | 'dead' | 'survived'
    this._time          = 0;
    this._glossaryTimer = 0;
    this._nutrientTimer = 0;
    this._wasteTimer   = 0;
    this._sparkles     = [];
    this._dust         = [];

    this._health       = 100;            // 0..100
    this._escapedEss   = 0;
    this._verdictText  = '';
    this._verdictColor = COLORS.thrive;
    this._testClock    = 0;             // seconds since the active stress test began
    this._dim          = 1;             // brightness multiplier for essentials (starvation/dissolution)

    // channel-protein pores around the membrane (selective mode)
    this._pores = [];
    const poreCount = 7;
    for (let i = 0; i < poreCount; i++) {
      const a = (i / poreCount) * Math.PI * 2 + 0.3;
      this._pores.push({ a, pulse: 0 });
    }

    this._liveRegion = null;
    this._lastAnnouncement = '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._buildLiveRegion();
    this._initDust();
    this._spawnEssentials();
    this._drawInitialFrame(this._ctx);
    this._announce('Boundary design simulation loaded in SELECTIVE mode. Pick a boundary and run the stress test.');
  }

  destroy() {
    if (this._liveRegion) { this._liveRegion.remove(); this._liveRegion = null; }
    super.destroy();
  }

  onControlChange(id, value) {
    if (id === 'boundaryType') {
      this.boundaryType = value;
      this._resetStressTest(true);
      this._announce(`Boundary switched to ${BOUNDARIES[value].short}.`);
    } else if (id === 'run') {
      this._resetStressTest(true);
      this._announce(`Stress test running with ${BOUNDARIES[this.boundaryType].short} boundary.`);
    } else if (id === 'reset') {
      this._resetStressTest(false);
      this._announce('Simulation reset.');
    }
  }

  // ── Init helpers ──────────────────────────────────────────────────────────

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
    if (!this._liveRegion || !msg || msg === this._lastAnnouncement) return;
    this._lastAnnouncement = msg;
    this._liveRegion.textContent = msg;
  }

  _initDust() {
    this._dust = [];
    for (let i = 0; i < 38; i++) {
      this._dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.6 + Math.random() * 1.4,
        a: 0.10 + Math.random() * 0.25,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
      });
    }
  }

  _spawnEssentials() {
    // 5 proteins + 4 glucose inside the proto-cell
    for (let i = 0; i < 5; i++) this._addParticleInside('protein', COLORS.protein, 'P');
    for (let i = 0; i < 4; i++) this._addParticleInside('glucose', COLORS.glucose, 'G');
  }

  _addParticleInside(type, color, label) {
    const ang = Math.random() * Math.PI * 2;
    const rr  = Math.random() * (R - 16);
    const x = CX + Math.cos(ang) * rr;
    const y = CY + Math.sin(ang) * rr;
    const sp = 18 + Math.random() * 16;
    const dir = Math.random() * Math.PI * 2;
    this.addParticle({
      x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
      r: ESSENTIAL_LARGE_R, color, type, label,
      mass: ESSENTIAL_LARGE_R, trail: [],
    });
  }

  _spawnNutrientOutside() {
    if (this._countByType('nutrient') >= 16) return;
    // spawn at a random canvas edge, drifting toward the cell
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0)      { x = Math.random() * W; y = 6; }
    else if (edge === 1) { x = W - 6;            y = Math.random() * H; }
    else if (edge === 2) { x = Math.random() * W; y = H - 6; }
    else                 { x = 6;                y = Math.random() * H; }
    const ang = Math.atan2(CY - y, CX - x) + (Math.random() - 0.5) * 0.5;
    const sp = 26 + Math.random() * 14;
    this.addParticle({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      r: SMALL_PASS_R, color: COLORS.nutrient, type: 'nutrient', label: 'n',
      mass: SMALL_PASS_R, trail: [],
    });
  }

  _spawnWasteInside() {
    if (this._countByType('waste') >= 20) return;
    const ang = Math.random() * Math.PI * 2;
    const rr  = Math.random() * (R - 14);
    const x = CX + Math.cos(ang) * rr;
    const y = CY + Math.sin(ang) * rr;
    const dir = Math.random() * Math.PI * 2;
    const sp = 14 + Math.random() * 12;
    this.addParticle({
      x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
      r: SMALL_PASS_R, color: COLORS.waste, type: 'waste', label: 'w',
      mass: SMALL_PASS_R, trail: [],
    });
  }

  _countByType(type) {
    let n = 0;
    for (const p of this.particles) if (p.type === type) n++;
    return n;
  }

  _resetStressTest(keepBoundary) {
    this.particles = [];
    this._sparkles = [];
    this._health = 100;
    this._escapedEss = 0;
    this._testClock = 0;
    this._nutrientTimer = 0;
    this._wasteTimer = 0;
    this._phase = 'running';
    this._verdictText = '';
    this._dim = 1;
    if (!keepBoundary) this.boundaryType = 'selective';
    this._spawnEssentials();
  }

  // ── Physics: circular selective / closed / open boundary ──────────────────

  /** A particle is "large" (essential) → blocked by the selective membrane. */
  _isLarge(p) { return p.r >= ESSENTIAL_LARGE_R - 0.1; }

  enforceBoundary() {
    for (const p of this.particles) {
      // 1. Canvas-edge bounce (keeps the sim populated)
      //    Essentials in OPEN mode that reach an edge are removed (escaped).
      if (p.x < p.r) {
        if (this.boundaryType === 'open' && this._isLarge(p)) { p._dead = true; continue; }
        p.x = p.r; p.vx = Math.abs(p.vx);
      }
      if (p.x > W - p.r) {
        if (this.boundaryType === 'open' && this._isLarge(p)) { p._dead = true; continue; }
        p.x = W - p.r; p.vx = -Math.abs(p.vx);
      }
      if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy); }
      if (p.y > H - p.r) { p.y = H - p.r; p.vy = -Math.abs(p.vy); }

      // 2. Membrane crossing logic (circular boundary at radius R)
      const dx = p.x - CX, dy = p.y - CY;
      const d = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / d, ny = dy / d;
      const inside = d < R;

      if (this.boundaryType === 'open') {
        // No membrane at all — particles drift wherever Brownian motion takes them.
        continue;
      }

      const blocked =
        this.boundaryType === 'closed' || (this.boundaryType === 'selective' && this._isLarge(p));

      if (blocked) {
        if (inside && d + p.r >= R) {
          // hit membrane from inside → reflect back inward
          p.x = CX + nx * (R - p.r - 1);
          p.y = CY + ny * (R - p.r - 1);
          const vRad = p.vx * nx + p.vy * ny;
          p.vx -= 2 * vRad * nx;
          p.vy -= 2 * vRad * ny;
          p.vx *= 0.92; p.vy *= 0.92;
        } else if (!inside && d - p.r <= R) {
          // hit membrane from outside → reflect back outward (can't enter)
          p.x = CX + nx * (R + p.r + 1);
          p.y = CY + ny * (R + p.r + 1);
          const vRad = p.vx * nx + p.vy * ny;
          p.vx -= 2 * vRad * nx;
          p.vy -= 2 * vRad * ny;
          p.vx *= 0.92; p.vy *= 0.92;
        }
      } else {
        // selective membrane + SMALL particle → may cross. Reward crossing near
        // a channel protein with a sparkle + tiny pore pulse.
        const crossing = (inside && d + p.r >= R) || (!inside && d - p.r <= R);
        if (crossing) {
          const ang = Math.atan2(dy, dx);
          let near = null, best = Infinity;
          for (const pore of this._pores) {
            let da = Math.abs(ang - pore.a);
            if (da > Math.PI) da = Math.PI * 2 - da;
            if (da < best) { best = da; near = pore; }
          }
          if (near && best < 0.55) {
            near.pulse = 1.0;
            if (Math.random() < 0.35) {
              this._sparkles.push({
                x: CX + nx * R, y: CY + ny * R,
                r: 1.4 + Math.random() * 1.8, alpha: 1.0,
              });
            }
          }
        }
      }
    }

    // cull escaped essentials
    if (this.particles.some(p => p._dead)) {
      let escaped = 0;
      this.particles = this.particles.filter(p => {
        if (p._dead) { if (this._isLarge(p)) escaped++; return false; }
        return true;
      });
      this._escapedEss += escaped;
    }
  }

  // ── Simulation update / outcome model ────────────────────────────────────

  _update(dt) {
    this._time += dt;
    this._glossaryTimer += dt;

    if (this._phase !== 'running') {
      // keep particles drifting gently after a verdict, decay sparkles/pulses
      this._decayEffects(dt);
      return;
    }

    this._testClock += dt;

    // Stressor spawning
    this._nutrientTimer += dt;
    if (this._nutrientTimer > 1.0) { this._nutrientTimer = 0; this._spawnNutrientOutside(); }
    this._wasteTimer += dt;
    if (this._wasteTimer > 1.4) { this._wasteTimer = 0; this._spawnWasteInside(); }

    // Counts
    const essentials = this._countByType('protein') + this._countByType('glucose');
    const waste      = this._countByType('waste');
    const nutrients  = this._countByType('nutrient');

    // Health model per boundary
    let dimTarget = 1;
    if (this.boundaryType === 'closed') {
      // starvation: no nourishment → essentials slowly dim
      dimTarget = 0.45;
      // waste builds up → toxic
      this._health -= dt * (2.4 + waste * 0.6);
    } else if (this.boundaryType === 'open') {
      // essentials leak out → cell dissolves. Give essentials a gentle
      // outward drift so the dissolve is visible (no barrier holds them).
      for (const p of this.particles) {
        if (!this._isLarge(p)) continue;
        const dx = p.x - CX, dy = p.y - CY;
        const d = Math.hypot(dx, dy) || 0.001;
        p.vx += (dx / d) * 14 * dt;
        p.vy += (dy / d) * 14 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 55) { p.vx *= 55 / sp; p.vy *= 55 / sp; }
      }
      this._health -= this._escapedEss * 9 + dt * 3;
      dimTarget = essentials <= 2 ? 0.3 : 0.7;
    } else { // selective
      // nutrients in, waste out, essentials retained → thriving
      const bal = (nutrients > 0 ? 1 : 0) - (waste > 8 ? 0.6 : 0);
      this._health += dt * (3 + bal * 3);
      dimTarget = 1;
    }
    this._health = Math.max(0, Math.min(100, this._health));
    this._dim += (dimTarget - this._dim) * Math.min(1, dt * 1.5);

    // Verdict triggers
    if (this._health <= 0) {
      this._phase = 'dead';
      if (this.boundaryType === 'closed') {
        this._verdictText = '☠️ THE CELL DIED — Starved & Poisoned';
        this._verdictColor = COLORS.toxic;
      } else if (this.boundaryType === 'open') {
        this._verdictText = '☠️ THE CELL DIED — It Dissolved Away';
        this._verdictColor = COLORS.dissolve;
      } else {
        this._verdictText = '☠️ THE CELL DIED';
        this._verdictColor = COLORS.toxic;
      }
      this._announce(this._verdictText + '. ' + BOUNDARIES[this.boundaryType].short + ' boundary failed.');
    } else if (this._testClock > 22) {
      this._phase = 'survived';
      this._verdictText = '✅ THE CELL SURVIVED — A Healthy Boundary!';
      this._verdictColor = COLORS.thrive;
      this._announce('The cell survived with a selectively permeable boundary.');
    }

    this._decayEffects(dt);
  }

  _decayEffects(dt) {
    for (const pore of this._pores) if (pore.pulse > 0) pore.pulse = Math.max(0, pore.pulse - dt * 2.6);
    for (const s of this._sparkles) { s.alpha -= dt * 2.2; }
    this._sparkles = this._sparkles.filter(s => s.alpha > 0);
    for (const d of this._dust) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 0) d.x += W; if (d.x > W) d.x -= W;
      if (d.y < 0) d.y += H; if (d.y > H) d.y -= H;
    }
    // particle trails (water-style motion blur)
    for (const p of this.particles) {
      if (!p.trail) p.trail = [];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 5) p.trail.shift();
    }
  }

  // ── Main render loop ──────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._update(dt);

    // physics
    this.applyBrownianMotion(dt);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; }
    this.resolveCollisions();
    this.enforceBoundary();

    // render
    this._drawAtmosphere(ctx);
    this._drawProtoCell(ctx);
    this._drawMembrane(ctx);
    this._drawSparkles(ctx);
    this._drawParticles(ctx);
    this._drawHUD(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  // ── Render passes ─────────────────────────────────────────────────────────

  _drawAtmosphere(ctx) {
    // deep radial background
    const bg = ctx.createRadialGradient(CX, CY, 20, CX, CY, 360);
    bg.addColorStop(0, '#0d1f3c');
    bg.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ambient fluid currents
    ctx.save();
    ctx.lineWidth = 1.1;
    ctx.setLineDash([12, 16]);
    ctx.strokeStyle = 'rgba(79, 156, 247, 0.10)';
    for (let y = 30; y < H - 10; y += 70) {
      ctx.beginPath();
      for (let x = 10; x < W - 10; x += 14) {
        const py = y + Math.sin(x * 0.02 + this._time * 1.6) * 6;
        if (x === 10) ctx.moveTo(x, py); else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // floating dust motes
    for (const d of this._dust) {
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = '#7dd3fc';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawProtoCell(ctx) {
    // cytoplasm disc — tinted by health/verdict
    let cyto;
    if (this._phase === 'dead' && this.boundaryType === 'closed') {
      cyto = ['rgba(127, 29, 29, 0.45)', 'rgba(69, 10, 10, 0.85)'];
    } else if (this._phase === 'dead' && this.boundaryType === 'open') {
      cyto = ['rgba(30, 58, 138, 0.30)', 'rgba(12, 20, 43, 0.65)'];
    } else if (this._health > 60) {
      cyto = ['rgba(16, 95, 70, 0.40)', 'rgba(6, 78, 59, 0.55)'];
    } else {
      cyto = ['rgba(120, 53, 15, 0.40)', 'rgba(69, 26, 3, 0.55)'];
    }
    const cg = ctx.createRadialGradient(CX - 18, CY - 20, 8, CX, CY, R);
    cg.addColorStop(0, cyto[0]);
    cg.addColorStop(1, cyto[1]);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fill();

    // soft outer aura
    const ag = ctx.createRadialGradient(CX, CY, R, CX, CY, R + 26);
    ag.addColorStop(0, COLORS.membraneGlow);
    ag.addColorStop(1, 'rgba(79,156,247,0)');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(CX, CY, R + 26, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMembrane(ctx) {
    ctx.save();

    if (this.boundaryType === 'open') {
      // ghost outline — visually communicates "no barrier"
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.30)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    if (this.boundaryType === 'closed') {
      // solid rigid capsule wall — double ring with metallic gradient
      ctx.beginPath();
      ctx.arc(CX, CY, R + 7, 0, Math.PI * 2);
      ctx.lineWidth = 14;
      const wg = ctx.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
      wg.addColorStop(0, '#cbd5e1');
      wg.addColorStop(0.5, COLORS.wall);
      wg.addColorStop(1, '#475569');
      ctx.strokeStyle = wg;
      ctx.stroke();

      // inner seal highlight
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      return;
    }

    // SELECTIVE — phospholipid bilayer + channel-protein pores
    // bilayer core band
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.stroke();

    // two rows of phospholipid heads (outer + inner leaflet)
    const headR = 3.2;
    const step = 11;
    for (let a = 0; a < Math.PI * 2; a += step / R) {
      // skip heads covered by a channel pore
      let inPore = false;
      for (const pore of this._pores) {
        let da = Math.abs(a - pore.a);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 0.45) { inPore = true; break; }
      }
      if (inPore) continue;

      const ox = CX + Math.cos(a) * (R + 3.5);
      const oy = CY + Math.sin(a) * (R + 3.5);
      const ix = CX + Math.cos(a) * (R - 3.5);
      const iy = CY + Math.sin(a) * (R - 3.5);

      // hydrophobic tail
      ctx.strokeStyle = COLORS.lipidTail;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ix, iy); ctx.lineTo(ox, oy);
      ctx.stroke();

      // heads (3D spheres)
      this._drawLipidHead(ctx, ox, oy, headR);
      this._drawLipidHead(ctx, ix, iy, headR);
    }

    // channel proteins (barrel-shaped pores)
    for (const pore of this._pores) {
      const px = CX + Math.cos(pore.a) * R;
      const py = CY + Math.sin(pore.a) * R;

      // glow when a particle just crossed
      if (pore.pulse > 0) {
        ctx.beginPath();
        ctx.arc(px, py, 9 + 6 * pore.pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 211, 153, ${pore.pulse * 0.6})`;
        ctx.fill();
      }

      // barrel body
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(pore.a + Math.PI / 2);
      ctx.beginPath();
      ctx.roundRect(-8, -6, 16, 12, 4);
      const bg = ctx.createLinearGradient(-8, -6, 8, 6);
      bg.addColorStop(0, '#064e3b');
      bg.addColorStop(0.5, '#0f172a');
      bg.addColorStop(1, '#064e3b');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = pore.pulse > 0 ? COLORS.channel : '#0e7490';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // central pore opening
      ctx.beginPath();
      ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = pore.pulse > 0 ? '#6ee7b7' : '#0284c7';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawLipidHead(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#e0f2fe');
    g.addColorStop(0.5, COLORS.lipidHead);
    g.addColorStop(1, '#0369a1');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  _drawSparkles(ctx) {
    ctx.save();
    for (const s of this._sparkles) {
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.channel;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      // motion trail
      if (p.trail && p.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.strokeStyle = this._withAlpha(p.color, 0.22);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      // glow halo
      SimDraw.drawGlow(ctx, p.x, p.y, p.r * 1.6, p.color, this._isLarge(p) ? 0.40 * this._dim : 0.45);

      // 3D sphere body
      const grad = ctx.createRadialGradient(
        p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, p.color);
      grad.addColorStop(1, '#0f172a');
      ctx.globalAlpha = this._isLarge(p) ? this._dim : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.globalAlpha = 1;

      // labels
      if (p.label) {
        ctx.font = 'bold 8px Inter, system-ui';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y + 0.5);
      }
    }
    ctx.restore();
  }

  _withAlpha(hex, a) {
    // accept #rrggbb; return rgba()
    if (!hex || hex[0] !== '#') return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ── HUD / overlay ─────────────────────────────────────────────────────────

  _drawHUD(ctx) {
    // Top-left: boundary badge
    const b = BOUNDARIES[this.boundaryType];
    SimDraw.drawPanel(ctx, 14, 12, 268, 44, {
      bg: 'rgba(15, 23, 42, 0.62)', stroke: COLORS.membrane, radius: 8,
    });
    ctx.save();
    ctx.font = '700 12px Inter, system-ui';
    ctx.fillStyle = COLORS.membrane;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(b.label, 26, 20);
    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(b.blurb, 26, 37);
    ctx.restore();

    // Top-right: live health & counts
    this._drawHealthPanel(ctx);

    // Verdict banner (centre-top) when resolved
    if (this._phase !== 'running') this._drawVerdict(ctx);

    // Glossary card (bottom-left)
    let gi = Math.floor(this._glossaryTimer / 7) % GLOSSARY.length;
    if (isNaN(gi) || gi < 0) gi = 0;
    this._drawGlossaryCard(ctx, 14, H - 14, GLOSSARY[gi]);

    // Footer hint (bottom-right)
    ctx.save();
    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('Pick a boundary design, then Run Stress Test.', W - 14, H - 14);
    ctx.restore();
  }

  _drawHealthPanel(ctx) {
    const x = W - 14 - 230, y = 12, w = 230, h = 44;
    SimDraw.drawPanel(ctx, x, y, w, h, {
      bg: 'rgba(15, 23, 42, 0.62)', stroke: 'rgba(79,156,247,0.35)', radius: 8,
    });
    ctx.save();
    ctx.font = '700 11px Inter, system-ui';
    ctx.fillStyle = COLORS.textMain;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('PROTO-CELL HEALTH', x + 12, y + 8);

    // health bar
    const bx = x + 12, by = y + 24, bw = w - 70, bh = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();
    let barColor = COLORS.thrive;
    if (this._health < 35) barColor = COLORS.toxic;
    else if (this._health < 65) barColor = COLORS.glucose;
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw * (this._health / 100), bh, 4);
    ctx.fill();

    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = barColor;
    ctx.fillText(`${Math.round(this._health)}%`, x + w - 50, y + 22);

    // micro-counts
    const ess = this._countByType('protein') + this._countByType('glucose');
    const nut = this._countByType('nutrient');
    const wst = this._countByType('waste');
    ctx.font = '500 9.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`Essentials ${ess}  ·  Nutrients ${nut}  ·  Waste ${wst}`, x + 12, y + 35);
    ctx.restore();
  }

  _drawVerdict(ctx) {
    const cx = W / 2, cy = 38;
    ctx.save();
    ctx.font = '800 15px Inter, system-ui';
    const w = ctx.measureText(this._verdictText).width + 36;
    const h = 30;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.strokeStyle = this._verdictColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = this._verdictColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this._verdictText, cx, cy);
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

    const padX = 12, padY = 10, lineH = 15;
    const w = maxW + padX * 2;
    const h = 18 + lines.length * lineH + padY;

    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.60)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(79, 156, 247, 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = COLORS.membrane;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10.5px Inter, system-ui';
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), x + padX, y - h + padY + 18 + i * lineH);
    });

    const progress = (this._glossaryTimer % 7) / 7;
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 3, (w - 4) * progress, 2, 1);
    ctx.fillStyle = COLORS.membrane;
    ctx.fill();
    ctx.restore();
  }
}
