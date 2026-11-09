import { CellViewSimulation } from '../base/CellViewSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * CytoplasmScene — Part 5.1 "The Cytoplasm: The Cell's Busy Workspace".
 *
 * Top-down cell cross-section. Organelles gently bob with sine-wave offsets.
 * "Show Activity" toggle reveals Brownian-motion nutrient + waste particles.
 * Clicking an organelle shows an explanatory callout bubble.
 */

// Hex values from sim-theme.css (canvas cannot resolve CSS var())
const C = {
  bgDeep:     '#0a0f1e',
  bgCell:     '#0d1f3c',
  cytoplasm:  'rgba(30,58,95,0.40)',
  membrane:   '#4f9cf7',
  memGlow:    'rgba(79,156,247,0.20)',
  nucleus:    '#6366f1',
  nucleusGlo: 'rgba(99,102,241,0.30)',
  mito:       '#f59e0b',
  er:         '#818cf8',
  golgi:      '#ec4899',
  lysosome:   '#ef4444',
  ribosome:   '#94a3b8',
  vacuole:    '#06b6d4',
  nutrient:   '#a3e635',
  waste:      '#78716c',
  label:      '#e2e8f0',
  labelBg:    'rgba(30,41,59,0.85)',
  tooltipBg:  'rgba(15,23,42,0.94)',
};

const W = 700, H = 500;
const CX = W / 2, CY = H / 2;
// Cell ellipse radii
const RX = 300, RY = 210;

// Organelle definitions: id, label, type, x, y, short description
const ORGANELLES = [
  {
    id: 'nucleus', label: 'Nucleus', x: CX, y: CY - 10, r: 52,
    color: C.nucleus, glowColor: C.nucleusGlo,
    desc: 'The control centre of the cell.\nContains DNA and directs all\ncellular activities.',
  },
  {
    id: 'mito1', label: 'Mitochondria', x: CX + 130, y: CY - 80, w: 54, h: 24,
    color: C.mito, phase: 0.4,
    desc: 'The powerhouse of the cell.\nConverts glucose + O₂ into ATP\n(cellular respiration).',
  },
  {
    id: 'mito2', label: '', x: CX - 160, y: CY + 60, w: 50, h: 22,
    color: C.mito, phase: 1.1,
    desc: 'The powerhouse of the cell.\nConverts glucose + O₂ into ATP\n(cellular respiration).',
  },
  {
    id: 'er', label: 'Endoplasmic\nReticulum', x: CX - 95, y: CY - 65, w: 70, h: 44,
    color: C.er, phase: 0.7,
    desc: 'A network of membranes.\nRough ER (with ribosomes) makes\nproteins; Smooth ER makes lipids.',
  },
  {
    id: 'golgi', label: 'Golgi Apparatus', x: CX + 110, y: CY + 60, w: 64, h: 32,
    color: C.golgi, phase: 1.8,
    desc: 'The cell\'s post office.\nReceives proteins from ER,\nmodifies and ships them out.',
  },
  {
    id: 'lyso', label: 'Lysosome', x: CX - 170, y: CY - 80, r: 20,
    color: C.lysosome, phase: 2.2,
    desc: 'The clean-up crew.\nContains digestive enzymes that\nbreak down waste and debris.',
  },
  {
    id: 'vacuole', label: 'Vacuole', x: CX + 60, y: CY - 100, r: 26,
    color: C.vacuole, phase: 0.9,
    desc: 'Storage compartment.\nStores water, nutrients and\nwaste products temporarily.',
  },
];

const CYTOPLASM_INFO = {
  id: 'cytoplasm',
  label: 'Cytoplasm',
  color: '#38bdf8', // sim-water blue
  desc: 'The jelly-like fluid filling the cell.\nIt transports materials and provides the\nmedium for thousands of chemical reactions.',
};

const ACTIVITY_ZONES = [
  {
    x: CX - 130, y: CY - 110, type: 'reaction',
    color: '#fcd34d', label: 'CHEMICAL REACTIONS',
    desc: 'Flashes represent vital metabolic reactions\n(e.g. glycolysis). Only possible due to\nthis conducive fluid medium.'
  },
  {
    x: CX + 160, y: CY - 30, type: 'structure',
    color: '#cbd5e1', label: 'CELL STRUCTURE',
    desc: 'Cytoskeleton filaments spread throughout the\ncytoplasm to maintain the cell\'s shape.'
  },
  {
    x: CX - 100, y: CY + 120, type: 'transport',
    color: '#a78bfa', label: 'INTRACELLULAR TRANSPORT',
    desc: 'Provides a medium for vesicles and materials\nto move smoothly between organelles.'
  },
  {
    x: CX + 130, y: CY + 110, type: 'storage',
    color: '#a3e635', label: 'NUTRIENT STORAGE',
    desc: 'Stores essential nutrients, enzymes, and\nbuilding blocks for the cell to use.'
  }
];

// Max particles in each mode
const MAX_NUTRIENT = 60;
const MAX_WASTE    = 40;

export class CytoplasmScene extends CellViewSimulation {
  static WIDTH  = W;
  static HEIGHT = H;
  static ARIA_LABEL =
    'Top-down cross-section of an animal cell showing organelles floating in the ' +
    'cytoplasm. Click any organelle to learn what it does. Use the toggle to see ' +
    'nutrient and waste particles moving through the cytoplasm.';

  static CONTROLS = [
    { type: 'select', id: 'activity_mode', label: 'Cytoplasm Mode', options: [
      { value: 'idle', label: 'Idle (Default view)' },
      { value: 'active', label: 'Active Workspace (Show Functions)' }
    ]},
    { type: 'button', id: 'reset', label: 'Reset' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume   = true;
    this._time         = 0;
    this._showActivity = false;
    this._particles    = [];   // Brownian nutrient + waste
    this._sparks       = [];   // Chemical reaction flashes
    this._tooltip      = null; // { organelle, t } — active callout
    this._bgCache      = null;
    this._onClick      = this._handleClick.bind(this);
  }

  async setup() {
    await super.setup();
    this._buildBgCache();
    // Wire click on canvas
    this._canvas.style.cursor = 'pointer';
    this._canvas.addEventListener('click', this._onClick);
    this._tick(this._ctx, 0);
  }

  destroy() {
    if (this._canvas) this._canvas.removeEventListener('click', this._onClick);
    this._bgCache = null;
    super.destroy();
  }

  onControlChange(id, value) {
    if (id === 'activity_mode') {
      this._showActivity = (value === 'active');
      if (this._showActivity) {
        this._seedParticles();
      } else {
        this._particles = [];
      }
    } else if (id === 'reset') {
      this._showActivity = false;
      this._particles    = [];
      this._tooltip      = null;
      // In a Lit app we'd need to reset the select element's value, 
      // but for canvas state this is sufficient.
    }
  }

  // ── Background offscreen cache ────────────────────────────────────────────

  _buildBgCache() {
    const oc  = new OffscreenCanvas(W, H);
    const ctx = oc.getContext('2d');
    // Deep gradient
    const rg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 340);
    rg.addColorStop(0, C.bgCell);
    rg.addColorStop(1, C.bgDeep);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    this._bgCache = oc;
  }

  // ── Particle system (Brownian motion) ────────────────────────────────────

  _seedParticles() {
    this._particles = [];
    const inside = () => {
      for (let i = 0; i < 200; i++) {
        const x = CX + (Math.random() - 0.5) * (RX * 1.8);
        const y = CY + (Math.random() - 0.5) * (RY * 1.8);
        if (_inCell(x, y)) return { x, y };
      }
      return { x: CX, y: CY };
    };
    for (let i = 0; i < MAX_NUTRIENT; i++) {
      const p = inside();
      this._particles.push({ ...p, type: 'nutrient', vx: 0, vy: 0 });
    }
    for (let i = 0; i < MAX_WASTE; i++) {
      const p = inside();
      this._particles.push({ ...p, type: 'waste', vx: 0, vy: 0 });
    }
  }

  _updateParticles(dt) {
    for (const p of this._particles) {
      // Brownian jitter
      p.vx += (Math.random() - 0.5) * 120 * dt;
      p.vy += (Math.random() - 0.5) * 120 * dt;
      // Dampen
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      // Reflect off cell membrane
      if (!_inCell(p.x, p.y)) {
        const nx = (p.x - CX) / RX;
        const ny = (p.y - CY) / RY;
        const len = Math.hypot(nx, ny) || 1;
        p.x -= nx / len * 6;
        p.y -= ny / len * 6;
        p.vx *= -0.5;
        p.vy *= -0.5;
      }
    }
  }

  // ── Click interaction ─────────────────────────────────────────────────────

  _handleClick(e) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = W / (rect.width  || W);
    const scaleY = H / (rect.height || H);
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    const bob = t => Math.sin(t) * 5;

    for (const og of ORGANELLES) {
      const oy = og.y + bob(this._time * 0.6 + (og.phase || 0));
      const hit = og.r
        ? Math.hypot(mx - og.x, my - oy) < og.r + 8
        : Math.abs(mx - og.x) < (og.w / 2 + 8) && Math.abs(my - oy) < (og.h / 2 + 8);
      if (hit) {
        this._tooltip = this._tooltip?.organelle.id === og.id ? null : { organelle: og, t: 0 };
        return;
      }
    }

    // If we didn't hit a specific organelle, but hit the cytoplasm
    if (_inCell(mx, my)) {
      this._tooltip = this._tooltip?.organelle.id === 'cytoplasm' ? null : { organelle: CYTOPLASM_INFO, t: 0 };
      // Anchor tooltip to click position
      CYTOPLASM_INFO.x = mx;
      CYTOPLASM_INFO.y = my;
      return;
    }

    this._tooltip = null;
  }

  // ── Main render loop ──────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;
    if (this._tooltip) this._tooltip.t += dt;
    if (this._showActivity) this._updateParticles(dt);

    ctx.clearRect(0, 0, W, H);

    // Background
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);

    // Cytoplasm fill
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.cytoplasm;
    ctx.fill();

    // Activity particles and zones (behind organelles)
    if (this._showActivity) {
      this._drawParticles(ctx);
      this._drawActiveFunctionVisuals(ctx);
    }

    // Organelles
    const bob = (phase) => Math.sin(this._time * 0.6 + (phase || 0)) * 5;
    for (const og of ORGANELLES) {
      if (og.id === 'nucleus') continue; // drawn last
      this._drawOrganelle(ctx, og, bob(og.phase));
    }
    // Nucleus on top of other organelles but below tooltip
    this._drawNucleus(ctx, bob(0));

    // Cell membrane (outermost)
    this._drawMembrane(ctx);

    // Organelle labels
    for (const og of ORGANELLES) {
      if (!og.label) continue;
      const dy = bob(og.phase);
      const lx = og.r ? og.x : og.x;
      const ly = og.r ? og.y + dy - og.r - 8 : og.y + dy - og.h / 2 - 8;
      this._drawLabel(ctx, og.label, lx, ly);
    }

    // Active Function Tooltip (on top of organelle labels)
    if (this._showActivity) {
      this._drawActiveFunctionTooltip(ctx);
    }

    // Tooltip callout from clicks (drawn on top of everything)
    if (this._tooltip) this._drawTooltip(ctx, this._tooltip);

    // Hints
    if (this._time < 6 && !this._tooltip && !this._showActivity) {
      this._drawHint(ctx, '👆 Click any organelle to learn what it does');
    } else if (this._showActivity) {
      this._drawHint(ctx, 'Without cytoplasm, organelles could not work together as a single living system!');
    }
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  _drawMembrane(ctx) {
    // Outer glow
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = C.memGlow;
    ctx.lineWidth   = 14;
    ctx.stroke();
    // Inner crisp line
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX - 4, RY - 4, 0, 0, Math.PI * 2);
    ctx.strokeStyle = C.membrane;
    ctx.lineWidth   = 3;
    ctx.stroke();
    // Tiny phospholipid bumps every ~24px around the perimeter
    ctx.fillStyle = C.membrane;
    for (let a = 0; a < Math.PI * 2; a += 0.28) {
      const nx = Math.cos(a), ny = Math.sin(a);
      const bx = CX + nx * (RX - 1);
      const by = CY + ny * (RY - 1);
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawNucleus(ctx, dy) {
    const { x, y, r } = ORGANELLES[0];
    const cy = y + dy;
    // Glow
    SimDraw.drawGlow(ctx, x, cy, r + 8, C.nucleusGlo, 0.55);
    // Body
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    const gr = ctx.createRadialGradient(x - 12, cy - 12, 4, x, cy, r);
    gr.addColorStop(0, '#818cf8');
    gr.addColorStop(1, C.nucleus);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth   = 2;
    ctx.stroke();
    // Nuclear envelope (dashed inner ring)
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, cy, r - 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(165,180,252,0.4)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
    // Nucleolus
    ctx.beginPath();
    ctx.arc(x + 8, cy - 8, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#4f46e5';
    ctx.fill();
  }

  _drawOrganelle(ctx, og, dy) {
    const x = og.x, y = og.y + dy;
    const active = this._tooltip?.organelle.id === og.id;
    if (active) SimDraw.drawGlow(ctx, x, y, (og.r || Math.max(og.w, og.h) / 2) + 6, og.color, 0.5);

    if (og.id.startsWith('mito')) {
      // Capsule (rod-shaped mitochondrion)
      const hw = og.w / 2, hh = og.h / 2;
      ctx.beginPath();
      ctx.moveTo(x - hw + hh, y - hh);
      ctx.lineTo(x + hw - hh, y - hh);
      ctx.arc(x + hw - hh, y, hh, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x - hw + hh, y + hh);
      ctx.arc(x - hw + hh, y, hh, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
      const gr = ctx.createLinearGradient(x - hw, y - hh, x + hw, y + hh);
      gr.addColorStop(0, '#fcd34d');
      gr.addColorStop(1, og.color);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = 'rgba(251,191,36,0.6)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      // Inner membrane hint
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(x, y, hw - 6, hh - 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.restore();

    } else if (og.id === 'er') {
      // Wavy ER sheets
      ctx.save();
      ctx.strokeStyle = og.color;
      ctx.lineWidth   = 2;
      for (let row = -1; row <= 1; row++) {
        ctx.beginPath();
        const ys = y + row * 14;
        for (let dx = -og.w / 2; dx <= og.w / 2; dx += 4) {
          const wx = x + dx;
          const wy = ys + Math.sin(dx * 0.18 + this._time * 1.2) * 5;
          dx === -og.w / 2 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
      ctx.restore();
      // Ribosome dots on rough ER
      ctx.fillStyle = C.ribosome;
      for (let dx = -og.w / 2 + 6; dx < og.w / 2; dx += 10) {
        ctx.beginPath();
        ctx.arc(x + dx, y - 14 + Math.sin(dx * 0.18 + this._time * 1.2) * 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (og.id === 'golgi') {
      // Stacked curved Golgi sacs
      ctx.save();
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(x, y + i * 6, og.w / 2 - Math.abs(i) * 4, 4, 0, 0, Math.PI * 2);
        const alpha = 1 - Math.abs(i) * 0.15;
        ctx.strokeStyle = og.color;
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
      ctx.restore();

    } else if (og.r) {
      // Generic circle (lysosome, vacuole)
      ctx.beginPath();
      ctx.arc(x, y, og.r, 0, Math.PI * 2);
      ctx.fillStyle = og.color + '40';
      ctx.fill();
      ctx.strokeStyle = og.color;
      ctx.lineWidth   = 2;
      ctx.stroke();
      // Inner dot for lysosome
      if (og.id === 'lyso') {
        ctx.fillStyle = og.color;
        ctx.beginPath();
        ctx.arc(x, y, og.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawParticles(ctx) {
    for (const p of this._particles) {
      const color = p.type === 'nutrient' ? C.nutrient : C.waste;
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }

  _drawActiveFunctionVisuals(ctx) {
    // Cycle through the zones every 5 seconds
    const zoneIndex = Math.floor(this._time / 5) % ACTIVITY_ZONES.length;
    const zone = ACTIVITY_ZONES[zoneIndex];

    if (zone.type === 'reaction') {
       for(let i=0; i<3; i++) {
         const t = (this._time + i * 1.6) % 2; 
         if (t > 1) continue;
         const alpha = Math.sin(t * Math.PI);
         const sx = zone.x + Math.sin(i*7) * 50;
         const sy = zone.y + Math.cos(i*3) * 35 + 20;
         
         ctx.save();
         ctx.globalAlpha = alpha;
         ctx.beginPath();
         for (let j=0; j<8; j++) {
            const angle = j * Math.PI/4 + this._time*3;
            const r = (j%2===0) ? 6 : 16;
            const px = sx + Math.cos(angle) * r;
            const py = sy + Math.sin(angle) * r;
            if (j===0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
         }
         ctx.closePath();
         ctx.fillStyle = '#ffffff';
         ctx.fill();
         SimDraw.drawGlow(ctx, sx, sy, 25, zone.color, alpha * 0.9);
         ctx.restore();
       }
    } else if (zone.type === 'structure') {
       ctx.save();
       ctx.strokeStyle = 'rgba(148,163,184,0.5)'; // faint gray
       ctx.lineWidth = 3;
       for(let i=0; i<5; i++) {
         ctx.beginPath();
         ctx.moveTo(zone.x - 70 + i*25, zone.y - 30);
         ctx.lineTo(zone.x + 50 - i*15, zone.y + 80);
         ctx.stroke();
         ctx.beginPath();
         ctx.moveTo(zone.x - 60, zone.y + 60 - i*20);
         ctx.lineTo(zone.x + 70, zone.y - 10 + i*30);
         ctx.stroke();
       }
       ctx.restore();
    } else if (zone.type === 'transport') {
       ctx.save();
       ctx.strokeStyle = 'rgba(167,139,250,0.6)';
       ctx.lineWidth = 4;
       ctx.setLineDash([6, 6]);
       ctx.beginPath();
       ctx.moveTo(zone.x - 70, zone.y + 10);
       ctx.lineTo(zone.x + 70, zone.y + 50);
       ctx.stroke();
       
       const prog = (this._time % 3) / 3; // 0 to 1
       const vx = zone.x - 70 + prog * 140;
       const vy = zone.y + 10 + prog * 40;
       ctx.beginPath();
       ctx.arc(vx, vy, 10, 0, Math.PI*2);
       ctx.fillStyle = zone.color;
       ctx.fill();
       SimDraw.drawGlow(ctx, vx, vy, 15, zone.color, 0.8);
       ctx.restore();
    } else if (zone.type === 'storage') {
       ctx.save();
       for(let i=0; i<15; i++) {
         const nx = zone.x + Math.sin(i*4.5) * 40;
         const ny = zone.y + 30 + Math.cos(i*8.2) * 25;
         ctx.beginPath();
         ctx.arc(nx, ny, 5, 0, Math.PI*2);
         ctx.fillStyle = i%2===0 ? zone.color : '#38bdf8';
         ctx.fill();
         SimDraw.drawGlow(ctx, nx, ny, 10, i%2===0 ? zone.color : '#38bdf8', 0.6);
       }
       ctx.restore();
    }
  }

  _drawActiveFunctionTooltip(ctx) {
    const zoneIndex = Math.floor(this._time / 5) % ACTIVITY_ZONES.length;
    const zone = ACTIVITY_ZONES[zoneIndex];
    const tCycle = this._time % 5;

    // Reuse the premium tooltip styling for the active function bubbles
    this._drawTooltip(ctx, { 
      organelle: {
        x: zone.x,
        y: zone.y + 30, // shift down slightly so tail points at the animation
        r: 0,
        h: 0,
        phase: 0,
        color: zone.color,
        label: zone.label,
        desc: zone.desc
      }, 
      t: tCycle 
    });
  }

  _drawLabel(ctx, text, x, y) {
    ctx.save();
    ctx.font         = '600 10px Inter,system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    const lines = text.split('\n');
    const lineH = 13;
    const maxW  = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
    const bw = maxW + 14, bh = lines.length * lineH + 6;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh, bw, bh, 5);
    ctx.fillStyle = C.labelBg;
    ctx.fill();
    ctx.fillStyle = C.label;
    lines.forEach((l, i) => ctx.fillText(l, x, y - bh + lineH * (i + 1)));
    ctx.restore();
  }

  _drawTooltip(ctx, { organelle: og, t }) {
    const bob = Math.sin(this._time * 0.6 + (og.phase || 0)) * 5;
    const tx  = og.x;
    const ty  = (og.r ? og.y + bob - og.r : og.y + bob - og.h / 2) - 14;
    const lines = og.desc.split('\n');
    const lineH = 16, padX = 14, padY = 10, tailH = 10;

    ctx.save();
    ctx.font = '500 12px Inter,system-ui';
    const maxTW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
    const bw = Math.min(maxTW + padX * 2, 280);
    const bh = lines.length * lineH + padY * 2;
    const bx = Math.max(6, Math.min(W - bw - 6, tx - bw / 2));
    const by = ty - bh - tailH;

    // Fade in
    ctx.globalAlpha = Math.min(1, t * 4);

    // Header stripe
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, lineH + padY, [8, 8, 0, 0]);
    ctx.fillStyle = og.color + '33';
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fillStyle = C.tooltipBg;
    ctx.fill();
    ctx.strokeStyle = og.color + '88';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Tail
    const tailX = Math.max(bx + 14, Math.min(bx + bw - 14, tx));
    ctx.beginPath();
    ctx.moveTo(tailX - 8, by + bh);
    ctx.lineTo(tailX + 8, by + bh);
    ctx.lineTo(tailX, by + bh + tailH);
    ctx.closePath();
    ctx.fillStyle = C.tooltipBg;
    ctx.fill();

    // Title
    ctx.fillStyle    = og.color;
    ctx.font         = '700 12px Inter,system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(og.label || og.id, bx + bw / 2, by + padY, bw - padX * 2);

    // Body lines
    ctx.fillStyle = C.label;
    ctx.font      = '500 11px Inter,system-ui';
    lines.slice(1).forEach((l, i) =>
      ctx.fillText(l, bx + bw / 2, by + padY + lineH + i * lineH, bw - padX * 2));

    ctx.restore();
  }

  _drawHint(ctx, text) {
    const alpha = Math.min(1, (6 - this._time) / 2);
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = '500 12px Inter,system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.beginPath();
    ctx.roundRect(CX - tw / 2 - 12, H - 36, tw + 24, 26, 6);
    ctx.fillStyle = 'rgba(15,23,42,0.80)';
    ctx.fill();
    ctx.fillStyle = C.label;
    ctx.fillText(text, CX, H - 23);
    ctx.restore();
  }
}

// Helpers
function _inCell(x, y) {
  return ((x - CX) / RX) ** 2 + ((y - CY) / RY) ** 2 <= 1;
}
