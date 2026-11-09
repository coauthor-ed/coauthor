import { ParticleSimulation } from '../base/ParticleSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * ProtoEvolutionScene — The "Proto" Evolutionary Challenge Simulation.
 * 
 * Demonstrates how a lipid membrane boundary protects primitive organic molecules 
 * (amino acids, lipids, sugars, phosphates) from ocean currents, allowing stable 
 * organic complexes and primitive protocells to form.
 * 
 * Tailored for Class 9 Biology Curriculum (NCERT/CBSE standards).
 */

const COLORS = {
  bgDeep:         '#070b14',
  bgOceanBottom:  '#0b1d3a',
  membrane:       '#4f9cf7',
  membraneGlow:   'rgba(79, 156, 247, 0.35)',
  membraneInner:  'rgba(14, 165, 233, 0.15)',
  cytosolPulse:   'rgba(52, 211, 153, 0.22)',
  
  amino:          '#f472b6', // Pink / Amino Acids
  lipid:          '#fbbf24', // Amber / Lipids
  sugar:          '#a3e635', // Lime / Sugars
  phosphate:      '#38bdf8', // Cyan / Organic Phosphates
  
  bondGlow:       '#34d399', // Emerald green bond connection
  currentLine:    'rgba(56, 189, 248, 0.18)',
  textMain:       '#e2e8f0',
  textMuted:      '#94a3b8'
};

const GLOSSARY = [
  { term: 'Primordial Soup', desc: 'The nutrient-rich ocean water on early Earth\ncontaining life’s initial organic building blocks.' },
  { term: 'Protocell', desc: 'A primitive lipid membrane enclosing organic\nbuilding blocks—the ancestor of modern cells.' },
  { term: 'Lipid Bilayer', desc: 'A double layer of fat molecules that automatically\nforms sealed spheres in water.' },
  { term: 'Amino Acid', desc: 'Simple organic building blocks that link together\ninside protocells to form essential proteins.' },
  { term: 'Organic Building Blocks', desc: 'Carbon-rich compounds (like sugars & lipids)\nnecessary for building living cell structures.' },
  { term: 'Hydrothermal Vent', desc: 'Underwater volcanoes providing heat & chemical energy\nneeded to jumpstart early Earth chemistry.' }
];

export class ProtoEvolutionScene extends ParticleSimulation {
  static WIDTH  = 700;
  static HEIGHT = 400;
  static ARIA_LABEL = 
    'Proto-Evolution simulation showing prebiotic soup scattering under ocean currents, ' +
    'and membrane encapsulation protecting organic molecules to form stable protocells.';

  static CONTROLS = [
    { type: 'button', id: 'nextStep', label: 'Next Step ▶' },
    { type: 'button', id: 'reset',    label: 'Reset Simulation' }
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    // Phases: 1 ('primordial_soup'), 2 ('enclosing_membrane'), 3 ('protocell_thriving')
    this.phase = 1;
    this.phaseTimer = 0;

    // Membrane properties (centered at CX, CY)
    this.membraneCenter = { x: 350, y: 215 };
    this.membraneTargetRadius = 105;
    this.membraneCurrentRadius = 0;
    this.membraneActive = false;
    this.membraneFullyFormed = false;

    // Statistics / Counters
    this.usefulGroupsOutside = 0;
    this.usefulGroupsInside = 0;
    this.smoothedOutsideCount = 0;

    // Background underwater particles & light rays
    this.bgRays = [];
    this.bgCurrents = [];
    this.bgBubbles = [];
    this.bonds = []; // Active persistent bonds between particles

    this.glossaryTimer = 0;
  }

  async setup() {
    await super.setup();
    this._initOceanEnvironment();
    this._initMolecules();
    this._drawInitialFrame(this._ctx);
    setTimeout(() => this._updateControlButtons(), 50);
  }

  onControlChange(id) {
    if (id === 'nextStep') {
      if (this.phase === 1) {
        this._setPhase(2);
      } else if (this.phase === 2) {
        if (!this.membraneFullyFormed) {
          this.membraneCurrentRadius = this.membraneTargetRadius;
          this.membraneFullyFormed = true;
        }
        this._setPhase(3);
      }
      // Phase 3 disables Next Step; student must use Reset to restart.
    } else if (id === 'reset') {
      this._resetSim();
    }
  }

  _setPhase(targetPhase) {
    this.phase = targetPhase;
    this.phaseTimer = 0;

    if (targetPhase === 1) {
      this.membraneActive = false;
      this.membraneFullyFormed = false;
      this.membraneCurrentRadius = 0;
      this._announce('Step 1: Primordial Soup. Observing uncontained building blocks scattering in ocean currents.');
    } else if (targetPhase === 2) {
      this.membraneActive = true;
      this.membraneFullyFormed = false;
      this.membraneCurrentRadius = 5;
      this._announce('Step 2: Enclosing Lipid Membrane. Bilayer sphere seals around building blocks.');
    } else if (targetPhase === 3) {
      this.membraneActive = true;
      this.membraneFullyFormed = true;
      this.membraneCurrentRadius = this.membraneTargetRadius;
      this._announce('Step 3: Protocell Thriving! Building blocks inside bond into complex organic structures.');
    }

    this._updateControlButtons();
  }

  _resetSim() {
    this.phase = 1;
    this.phaseTimer = 0;
    this.membraneActive = false;
    this.membraneFullyFormed = false;
    this.membraneCurrentRadius = 0;
    this.usefulGroupsOutside = 0;
    this.usefulGroupsInside = 0;
    this.smoothedOutsideCount = 0;
    this.bonds = [];
    this._initMolecules();
    this._updateControlButtons();
    this._announce('Simulation reset to primordial soup.');
  }

  _updateControlButtons() {
    const isPhase3 = (this.phase === 3);

    const applyStateToButtons = (root) => {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      const buttons = root.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent || '';
        if (text.includes('Next Step') || text.includes('Next')) {
          btn.disabled = isPhase3;
          btn.style.opacity = isPhase3 ? '0.4' : '1.0';
          btn.style.cursor = isPhase3 ? 'not-allowed' : 'pointer';
          btn.style.pointerEvents = isPhase3 ? 'none' : 'auto';
        }
      });
    };

    // Search document, container root, and parent hierarchy
    applyStateToButtons(document);
    if (this.container) {
      applyStateToButtons(this.container.getRootNode());
      let curr = this.container.parentElement;
      while (curr) {
        applyStateToButtons(curr);
        if (curr.shadowRoot) applyStateToButtons(curr.shadowRoot);
        curr = curr.parentElement;
      }
    }
  }

  // ── Initialization Helpers ──────────────────────────────────────────────

  _initOceanEnvironment() {
    const W = ProtoEvolutionScene.WIDTH;
    const H = ProtoEvolutionScene.HEIGHT;

    // Light rays
    this.bgRays = [];
    for (let i = 0; i < 5; i++) {
      this.bgRays.push({
        x: 90 + i * 130 + (Math.random() - 0.5) * 30,
        width: 35 + Math.random() * 45,
        alpha: 0.04 + Math.random() * 0.06,
        speed: 0.2 + Math.random() * 0.3
      });
    }

    // Underwater currents (sine wave streams)
    this.bgCurrents = [];
    for (let i = 0; i < 4; i++) {
      this.bgCurrents.push({
        y: 65 + i * 85,
        amplitude: 12 + Math.random() * 16,
        frequency: 0.007 + Math.random() * 0.003,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 0.5
      });
    }

    // Floating ambient micro-bubbles
    this.bgBubbles = [];
    for (let i = 0; i < 22; i++) {
      this.bgBubbles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 2,
        vy: -8 - Math.random() * 12,
        alpha: 0.15 + Math.random() * 0.35
      });
    }
  }

  _initMolecules() {
    this.particles = [];
    const W = ProtoEvolutionScene.WIDTH;
    const H = ProtoEvolutionScene.HEIGHT;
    const CX = this.membraneCenter.x;
    const CY = this.membraneCenter.y;

    // Class 9 appropriate building blocks (No unintroduced RNA/DNA terms)
    const types = [
      { type: 'amino', color: COLORS.amino, label: 'AA', r: 7 },
      { type: 'lipid', color: COLORS.lipid, label: 'L', r: 8 },
      { type: 'sugar', color: COLORS.sugar, label: 'S', r: 6.5 },
      { type: 'phosphate', color: COLORS.phosphate, label: 'P', r: 6 }
    ];

    // Create 40 organic building blocks dispersed around the scene
    for (let i = 0; i < 40; i++) {
      const t = types[i % types.length];
      let x, y;
      
      // Place a balanced group near center for protocell containment
      if (i < 18) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 75;
        x = CX + Math.cos(angle) * dist;
        y = CY + Math.sin(angle) * dist;
      } else {
        x = Math.random() * (W - 50) + 25;
        y = Math.random() * (H - 50) + 25;
      }

      this.addParticle({
        x, y,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        r: t.r,
        color: t.color,
        type: t.type,
        label: t.label,
        mass: t.r
      });
    }
  }

  // ── Custom Brownian Motion Override ─────────────────────────────────────

  applyBrownianMotion(dt) {
    const CX = this.membraneCenter.x;
    const CY = this.membraneCenter.y;
    const R = this.membraneCurrentRadius;

    for (const p of this.particles) {
      const isInside = this.membraneActive && Math.hypot(p.x - CX, p.y - CY) < R - p.r;
      
      // Gentle floating motion inside protocell so molecules move calmly
      const jitterScale = isInside ? 10 : 35;
      p.vx += (Math.random() - 0.5) * jitterScale * dt;
      p.vy += (Math.random() - 0.5) * jitterScale * dt;
    }
  }

  // ── Physics & Logic Update ──────────────────────────────────────────────

  _tick(ctx, dt) {
    this.phaseTimer += dt;
    this.glossaryTimer += dt;

    // Continuously sync control button state
    this._updateControlButtons();

    // 1. Update background ocean effects
    this._updateOceanEnvironment(dt);

    // 2. Animate membrane emergence smoothly in Phase 2
    if (this.phase === 2 && this.membraneActive) {
      if (this.membraneCurrentRadius < this.membraneTargetRadius) {
        this.membraneCurrentRadius += dt * 32; // Smooth 3.2 second expansion pace
        if (this.membraneCurrentRadius >= this.membraneTargetRadius) {
          this.membraneCurrentRadius = this.membraneTargetRadius;
          this.membraneFullyFormed = true;
        }
      }
    }

    // 3. Ocean current forces on particles
    this._applyOceanCurrents(dt);

    // 4. Base particle motion & elastic collisions
    this.applyBrownianMotion(dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.resolveCollisions();

    // 5. Enforce boundaries (Ocean edges + Membrane)
    this._enforceMembraneAndOceanBoundaries();

    // 6. Detect bonding / organic clustering (Distinct for Step 3)
    this._updateMolecularBonds(dt);

    // 7. Render entire visual scene
    this._drawOceanBackground(ctx);
    this._drawCurrentLines(ctx);
    this._drawMembraneBoundary(ctx);
    this._drawMolecularBonds(ctx);
    this._drawParticles(ctx);
    this._drawUIAndOverlay(ctx, dt);
  }

  _updateOceanEnvironment(dt) {
    const W = ProtoEvolutionScene.WIDTH;
    const H = ProtoEvolutionScene.HEIGHT;

    // Update bubbles
    for (const b of this.bgBubbles) {
      b.y += b.vy * dt;
      b.x += Math.sin(this.phaseTimer * 2 + b.y * 0.05) * 0.25;
      if (b.y < -10) {
        b.y = H + 10;
        b.x = Math.random() * W;
      }
    }

    // Update current wave phases
    for (const c of this.bgCurrents) {
      c.phase += c.speed * dt;
    }
  }

  _applyOceanCurrents(dt) {
    const CX = this.membraneCenter.x;
    const CY = this.membraneCenter.y;
    const R = this.membraneCurrentRadius;

    for (const p of this.particles) {
      const dx = p.x - CX;
      const dy = p.y - CY;
      const dist = Math.hypot(dx, dy);
      const isInsideMembrane = this.membraneActive && dist < (R - p.r);

      if (!isInsideMembrane) {
        // Outside molecules are continuously pushed by ocean currents
        const currentForceX = Math.sin(this.phaseTimer * 1.2 + p.y * 0.015) * 30 * dt;
        const currentForceY = Math.cos(this.phaseTimer * 1.0 + p.x * 0.015) * 15 * dt;
        p.vx += currentForceX;
        p.vy += currentForceY;

        // Dampen velocity outside
        p.vx *= 0.97;
        p.vy *= 0.97;
      } else {
        // Inside protocell: calm, gentle viscous motion so molecules float peacefully
        p.vx *= 0.88;
        p.vy *= 0.88;
      }
    }
  }

  _enforceMembraneAndOceanBoundaries() {
    const W = ProtoEvolutionScene.WIDTH;
    const H = ProtoEvolutionScene.HEIGHT;
    const CX = this.membraneCenter.x;
    const CY = this.membraneCenter.y;
    const R = this.membraneCurrentRadius;

    for (const p of this.particles) {
      // Ocean Canvas Bounding Box
      if (p.x < p.r + 10) { p.x = p.r + 10; p.vx *= -0.6; }
      if (p.x > W - p.r - 10) { p.x = W - p.r - 10; p.vx *= -0.6; }
      if (p.y < p.r + 10) { p.y = p.r + 10; p.vy *= -0.6; }
      if (p.y > H - p.r - 10) { p.y = H - p.r - 10; p.vy *= -0.6; }

      // Membrane Constraint
      if (this.membraneActive && R > 15) {
        const dx = p.x - CX;
        const dy = p.y - CY;
        const dist = Math.hypot(dx, dy);

        // Keep internal particles securely contained inside the lipid boundary
        if (dist > R - p.r - 2 && dist < R + p.r + 40) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          p.x = CX + nx * (R - p.r - 3);
          
          const dot = p.vx * nx + p.vy * ny;
          if (dot > 0) {
            p.vx -= 1.6 * dot * nx;
            p.vy -= 1.6 * dot * ny;
          }
        }
      }
    }
  }

  _updateMolecularBonds(dt) {
    this.bonds = [];
    let rawInside = 0;
    let rawOutside = 0;

    const CX = this.membraneCenter.x;
    const CY = this.membraneCenter.y;
    const R = this.membraneCurrentRadius;

    const len = this.particles.length;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);

        // Check if both molecules are inside protocell
        const in1 = this.membraneActive && Math.hypot(p1.x - CX, p1.y - CY) < R - 8;
        const in2 = this.membraneActive && Math.hypot(p2.x - CX, p2.y - CY) < R - 8;

        // DISTINCT VISUAL BEHAVIOR FOR STEP 3:
        // In Step 2, molecules are trapped in membrane but do NOT form complex bonds yet.
        // In Step 3, active chemical bonding turns ON inside the protocell!
        if (in1 && in2 && this.phase === 3) {
          if (dist < 44) {
            rawInside++;
            this.bonds.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, strong: true });

            // Cohesion force linking building blocks into stable complex chains
            const pull = 7 * dt;
            p1.vx += (dx / dist) * pull;
            p1.vy += (dy / dist) * pull;
            p2.vx -= (dx / dist) * pull;
            p2.vy -= (dy / dist) * pull;
          }
        } else if (!in1 && !in2) {
          // Outside protocell: temporary contact only if very close (<24px)
          if (dist < 24) {
            rawOutside++;
            this.bonds.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, strong: false });
          }
        }
      }
    }

    this.usefulGroupsInside = (this.phase === 3) ? Math.min(12, Math.floor(rawInside * 0.8)) : 0;
    
    // Smooth outside counter over time
    const targetOutside = Math.floor(rawOutside * 0.4);
    this.smoothedOutsideCount += (targetOutside - this.smoothedOutsideCount) * (5 * dt);
    this.usefulGroupsOutside = Math.round(this.smoothedOutsideCount);
  }

  // ── Render Pass Functions ───────────────────────────────────────────────

  _drawOceanBackground(ctx) {
    const W = ProtoEvolutionScene.WIDTH;
    const H = ProtoEvolutionScene.HEIGHT;

    // Deep ocean radial gradient background
    const bgGrad = ctx.createRadialGradient(W / 2, H / 3, 50, W / 2, H / 2, 450);
    bgGrad.addColorStop(0, '#0d2446');
    bgGrad.addColorStop(0.6, COLORS.bgOceanBottom);
    bgGrad.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Render shimmering light rays from ocean surface
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const ray of this.bgRays) {
      const rayGrad = ctx.createLinearGradient(ray.x, 0, ray.x + 50, H);
      rayGrad.addColorStop(0, `rgba(56, 189, 248, ${ray.alpha * 1.5})`);
      rayGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.beginPath();
      ctx.moveTo(ray.x, 0);
      ctx.lineTo(ray.x + ray.width, 0);
      ctx.lineTo(ray.x + ray.width + 70, H);
      ctx.lineTo(ray.x + 70, H);
      ctx.closePath();
      ctx.fillStyle = rayGrad;
      ctx.fill();
    }
    ctx.restore();

    // Render ambient micro-bubbles
    ctx.save();
    for (const b of this.bgBubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(186, 230, 253, ${b.alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCurrentLines(ctx) {
    const W = ProtoEvolutionScene.WIDTH;

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.currentLine;
    ctx.setLineDash([8, 12]);

    for (const c of this.bgCurrents) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 15) {
        const y = c.y + Math.sin(x * c.frequency + c.phase) * c.amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMembraneBoundary(ctx) {
    if (!this.membraneActive || this.membraneCurrentRadius <= 2) return;

    const CX = this.membraneCenter.x;
    const CY = this.membraneCenter.y;
    const R = this.membraneCurrentRadius;

    ctx.save();

    // 1. Cytosol background glow (Vibrant Emerald Glow in Step 3 for active reactions)
    const innerGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    if (this.phase === 3) {
      const pulseAlpha = 0.20 + Math.sin(this.phaseTimer * 2.5) * 0.05;
      innerGrad.addColorStop(0, `rgba(52, 211, 153, ${pulseAlpha})`);
      innerGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.12)');
      innerGrad.addColorStop(1, 'rgba(79, 156, 247, 0.0)');
    } else {
      innerGrad.addColorStop(0, 'rgba(14, 165, 233, 0.18)');
      innerGrad.addColorStop(0.85, 'rgba(56, 189, 248, 0.08)');
      innerGrad.addColorStop(1, 'rgba(79, 156, 247, 0.0)');
    }

    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // 2. Double-layer lipid membrane wall with pulsing lipid heads
    ctx.shadowColor = (this.phase === 3) ? COLORS.bondGlow : COLORS.membrane;
    ctx.shadowBlur = (this.phase === 3) ? 16 : 10;

    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = (this.phase === 3) ? '#38bdf8' : COLORS.membrane;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]); // Lipid head pores texture
    ctx.stroke();

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(CX, CY, R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.membraneGlow;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // Label on top of membrane
    if (R > 50) {
      const labelText = (this.phase === 3) ? 'Living Protocell Membrane' : 'Enclosing Lipid Membrane';
      const labelColor = (this.phase === 3) ? '#6ee7b7' : '#93c5fd';
      SimDraw.drawLabel(ctx, labelText, CX, CY - R - 8, {
        bg: 'rgba(15, 23, 42, 0.90)',
        color: labelColor
      });
    }

    // Step 3 Floating Badge inside protocell
    if (this.phase === 3 && this.usefulGroupsInside > 0) {
      SimDraw.drawLabel(ctx, '✨ Organic Complex Formed', CX, CY + R * 0.45, {
        bg: 'rgba(6, 95, 70, 0.88)',
        color: '#34d399',
        fontSize: '10px'
      });
    }

    ctx.restore();
  }

  _drawMolecularBonds(ctx) {
    ctx.save();
    for (const b of this.bonds) {
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);

      if (b.strong) {
        ctx.strokeStyle = COLORS.bondGlow;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = COLORS.bondGlow;
        ctx.shadowBlur = 6;
      } else {
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.30)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      // Glow under each particle
      SimDraw.drawGlow(ctx, p.x, p.y, p.r * 1.4, p.color, 0.3);

      // Particle body
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      // Highlight sheen
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fill();

      // Small molecular code label
      if (p.label) {
        ctx.font = '700 9px Inter, system-ui';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y);
      }
    }
    ctx.restore();
  }

  _drawUIAndOverlay(ctx, dt) {
    const W = ProtoEvolutionScene.WIDTH;
    const H = ProtoEvolutionScene.HEIGHT;

    // Top Header Panel (Step Title)
    SimDraw.drawPanel(ctx, 15, 12, 380, 52, {
      bg: 'rgba(15, 23, 42, 0.88)',
      stroke: 'rgba(56, 189, 248, 0.3)',
      radius: 10
    });

    ctx.save();
    ctx.font = '700 13px Inter, system-ui';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`STEP ${this.phase}: ${this._getPhaseTitle()}`, 28, 30);

    ctx.font = '500 11px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(this._getPhaseSubtitle(), 28, 48);
    ctx.restore();

    // Organic Clusters Counter Panel (Top Right)
    SimDraw.drawPanel(ctx, W - 230, 12, 215, 65, {
      bg: 'rgba(15, 23, 42, 0.88)',
      stroke: 'rgba(52, 211, 153, 0.4)',
      radius: 10
    });

    ctx.save();
    ctx.font = '600 11px Inter, system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('ORGANIC CLUSTERS FORMED', W - 215, 28);

    ctx.font = '700 14px Inter, system-ui';
    if (this.phase === 3) {
      ctx.fillStyle = '#34d399';
      ctx.fillText(`Inside Protocell: ${this.usefulGroupsInside}`, W - 215, 48);
      ctx.fillStyle = '#f87171';
      ctx.font = '500 11px Inter, system-ui';
      ctx.fillText(`Open Ocean: ${this.usefulGroupsOutside} (scattered)`, W - 215, 65);
    } else if (this.phase === 2) {
      ctx.fillStyle = '#60a5fa';
      ctx.fillText('Membrane Enclosed', W - 215, 48);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 10px Inter, system-ui';
      ctx.fillText('Click Next to trigger bonding!', W - 215, 64);
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`Uncontained: ${this.usefulGroupsOutside}`, W - 215, 48);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 10px Inter, system-ui';
      ctx.fillText('Currents tear molecules apart!', W - 215, 64);
    }
    ctx.restore();

    // Instructional Callout Box (Top Center - below header)
    this._drawPhaseCallout(ctx);

    // Cycling Glossary Card (Bottom Left - x:15, y: H-12)
    let glosIdx = Math.floor(this.glossaryTimer / 7) % GLOSSARY.length;
    if (isNaN(glosIdx) || glosIdx < 0) glosIdx = 0;
    this._drawGlossaryCard(ctx, 15, H - 12, GLOSSARY[glosIdx]);
  }

  _getPhaseTitle() {
    if (this.phase === 1) return 'PRIMORDIAL SOUP (UNCONTAINED)';
    if (this.phase === 2) return 'MEMBRANE ENCLOSURE';
    return 'PROTOCELL THRIVING & BONDING';
  }

  _getPhaseSubtitle() {
    if (this.phase === 1) return 'Building blocks drift freely & scatter in ocean currents.';
    if (this.phase === 2) return 'Lipids form a protective sphere, trapping molecules inside.';
    return 'Trapped building blocks collide & bond into stable organic complexes!';
  }

  _drawPhaseCallout(ctx) {
    const W = ProtoEvolutionScene.WIDTH;
    const CX = W / 2;
    const CY = 95;

    let text = '';
    let bg = 'rgba(15, 23, 42, 0.92)';
    let color = '#e2e8f0';

    if (this.phase === 1) {
      text = 'Step 1: Without a protective membrane, organic building blocks (amino acids & sugars)\n' +
             'are washed away by ocean currents before they can interact or form cell structures.';
      bg = 'rgba(30, 41, 59, 0.92)';
    } else if (this.phase === 2) {
      if (!this.membraneFullyFormed) {
        text = 'Step 2: Lipids naturally self-assemble in water to form a protective bilayer membrane!\n' +
               'Watch the boundary grow and shield inner molecules from turbulent ocean currents...';
      } else {
        text = 'Step 2 Complete: Lipid membrane sealed!\n' +
               'Click "Next Step ▶" to trigger active molecular bonding inside the protocell.';
      }
      bg = 'rgba(14, 116, 144, 0.92)';
      color = '#7dd3fc';
    } else {
      text = 'Step 3: Inside the protected protocell, concentrated building blocks collide and bond!\n' +
             'Watch glowing organic complexes form—the foundation of early cellular life.';
      bg = 'rgba(6, 95, 70, 0.92)';
      color = '#6ee7b7';
    }

    const lines = text.split('\n');
    ctx.save();
    ctx.font = '500 11px Inter, system-ui';

    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);

    const padX = 14, padY = 8;
    const bw = maxW + padX * 2;
    const bh = lines.length * 16 + padY * 2;
    const bx = CX - bw / 2;
    const by = CY - bh / 2;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, CX, by + padY + i * 16);
    });

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

    // Card background
    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Term Title
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);

    // Description lines
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10.5px Inter, system-ui';
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), x + padX, y - h + padY + 18 + i * lineH);
    });

    // Timer Progress bar
    const progress = (this.glossaryTimer % 7) / 7;
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 4, (w - 4) * progress, 2, 1);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    ctx.restore();
  }
}
