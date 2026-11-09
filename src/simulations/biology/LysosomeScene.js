import { CellViewSimulation } from '../base/CellViewSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * LysosomeScene — Part 5.5 "Lysosomes: The Clean-Up and Recycling System".
 *
 * High-fidelity, interactive view of lysosome structure and function for CBSE
 * Grade 9 students. A worn-out mitochondrion floats in the cytoplasm; the
 * learner selects a lysosome, sends it to the damaged organelle, and watches
 * membrane fusion, enzyme digestion, and nutrient recycling.
 *
 * Structural accuracy (from current cell-biology references):
 *  - Spherical, membrane-bound organelle (single lipid bilayer).
 *  - Interior is acidic (pH ~4.5–5.0), kept that way by proton pumps.
 *  - Filled with hydrolytic enzymes (proteases, lipases, nucleases, etc.).
 *  - Lysosomes digest worn organelles (autophagy) and recycle the building blocks.
 */
const COLORS = {
  bgDeep:        '#0a0f1e',
  bgCell:        '#0d1f3c',
  lysosome:      '#ef4444',
  lysosomeLight: '#f87171',
  lysosomeDark:  '#991b1b',
  enzyme:        '#facc15',
  nutrient:      '#a3e635',
  mitoDim:       '#b45309',
  mitoDark:      '#78350f',
  waste:         '#78716c',
  membrane:      '#4f9cf7',
  label:         '#e2e8f0',
  labelMuted:    '#94a3b8',
};

const GLOSSARY = [
  { term: 'Lysosome', desc: 'A tiny, membrane-bound organelle that acts like the\ncell\'s recycling centre. It contains powerful digestive enzymes.' },
  { term: 'Hydrolytic Enzyme', desc: 'Special proteins inside lysosomes that use water\nto break large molecules into smaller building blocks.' },
  { term: 'Acidic pH', desc: 'The lysosome interior is very acidic (pH ~4.5–5.0).\nThis makes the enzymes active and keeps the cell safe.' },
  { term: 'Autophagy', desc: '"Self-eating": the cell wraps up worn-out parts and\nsends them to lysosomes for recycling.' },
  { term: 'Autolysosome', desc: 'The combined structure formed when a lysosome fuses\nwith a waste compartment. Digestion happens here.' },
  { term: 'Membrane', desc: 'A phospholipid bilayer that surrounds the lysosome\nand keeps its enzymes separate from the cytoplasm.' },
  { term: 'Recycling', desc: 'After digestion, lysosomes release small useful\nmolecules back into the cytoplasm to build new cell parts.' },
];

const W = 650, H = 450;
const CX = W / 2, CY = H / 2;

const MOVE_SECONDS    = 2.0;
const ENGULF_SECONDS  = 2.0;
const DIGEST_SECONDS  = 4.0;
const RECYCLE_SECONDS = 3.0;

export class LysosomeScene extends CellViewSimulation {
  static WIDTH  = W;
  static HEIGHT = H;
  static ARIA_LABEL =
    'Lysosome clean-up simulation. Select a lysosome, send it to a worn-out ' +
    'mitochondrion, and watch the lysosome engulf, digest, and recycle the waste.';

  static CONTROLS = [
    { type: 'button', id: 'reset', label: 'Reset' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    // Simulation phase
    this._phase    = 'idle';   // idle | selected | moving | engulfing | digesting | recycling | done
    this._reactT   = 0;
    this._time     = 0;
    this._bubbleTimer = 0;

    // The cell's waste target — a flickering, worn-out mitochondrion
    this._target = {
      cx: 230, cy: 245,
      w: 120, h: 52,
      alive: true,
    };

    // Debris particles clustered near the target
    this._debris = [
      { cx: -55, cy: -22, r: 10, pts: 5, angle: 0.2 },
      { cx:  58, cy:  18, r:  8, pts: 4, angle: 1.1 },
      { cx:  36, cy: -30, r:  7, pts: 6, angle: 2.4 },
    ];

    // Floating lysosomes (spherical, 3D-looking)
    this._lysosomes = [
      { id: 0, x: 460, y: 170, r: 28, baseR: 28, baseX: 460, baseY: 170, selected: false },
      { id: 1, x: 515, y: 265, r: 25, baseR: 25, baseX: 515, baseY: 265, selected: false },
      { id: 2, x: 420, y: 335, r: 23, baseR: 23, baseX: 420, baseY: 335, selected: false },
    ];
    this._selectedId = -1;

    // Enzymes and recycled nutrients
    this._enzymes   = [];
    this._nutrients = [];
    this._recycledCount = 0;

    this._startPos = { x: 0, y: 0 };
    this._bgCache  = null;
    this._liveRegion = null;

    this._onClick = this._handleClick.bind(this);
  }

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._canvas.addEventListener('click', this._onClick);
    this._buildLiveRegion();
    this._buildBgCache();
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
    }
    if (this._liveRegion) { this._liveRegion.remove(); this._liveRegion = null; }
    this._bgCache = null;
    super.destroy();
  }

  onControlChange(id) {
    if (id === 'reset') this._reset();
  }

  // ── Lifecycle helpers ───────────────────────────────────────────────────────

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

  _buildBgCache() {
    const oc  = new OffscreenCanvas(W, H);
    const ctx = oc.getContext('2d');
    const rg  = ctx.createRadialGradient(CX, CY, 0, CX, CY, 360);
    rg.addColorStop(0, COLORS.bgCell);
    rg.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    this._bgCache = oc;
  }

  _reset() {
    this._phase = 'idle';
    this._reactT = 0;
    this._selectedId = -1;
    this._recycledCount = 0;
    this._enzymes = [];
    this._nutrients = [];

    this._target.cx = 230;
    this._target.cy = 245;
    this._target.alive = true;

    const bases = [
      { x: 460, y: 170, r: 28 },
      { x: 515, y: 265, r: 25 },
      { x: 420, y: 335, r: 23 },
    ];
    this._lysosomes.forEach((l, i) => {
      l.baseX = bases[i].x;
      l.baseY = bases[i].y;
      l.baseR = bases[i].r;
      l.r = bases[i].r;
      l.x = bases[i].x;
      l.y = bases[i].y;
      l.selected = false;
    });

    this._announce('Simulation reset.');
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  _toCanvasCoords(e) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = W / (rect.width || W);
    const scaleY = H / (rect.height || H);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  _handleClick(e) {
    const { x, y } = this._toCanvasCoords(e);

    if (this._phase === 'idle') {
      const idx = this._hitLysosome(x, y);
      if (idx >= 0) this._selectLysosome(idx);
    } else if (this._phase === 'selected') {
      if (this._hitTarget(x, y)) {
        this._phase = 'moving';
        this._reactT = 0;
        const l = this._selectedLysosome();
        this._startPos = { x: l.x, y: l.y };
        this._announce('Lysosome travelling to the worn-out mitochondrion to begin autophagy.');
      } else {
        const idx = this._hitLysosome(x, y);
        if (idx >= 0 && this._lysosomes[idx].id !== this._selectedId) {
          this._selectLysosome(idx);
        }
      }
    }
  }

  _hitLysosome(x, y) {
    let best = -1;
    let bestD = Infinity;
    this._lysosomes.forEach((l, i) => {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < l.r + 8 && d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  _hitTarget(x, y) {
    // Treat target as a rounded capsule for hit-testing
    const hw = this._target.w / 2, hh = this._target.h / 2;
    const dx = Math.abs(x - this._target.cx);
    const dy = Math.abs(y - this._target.cy);
    if (dx > hw + hh) return false;
    if (dy > hh) return false;
    if (dx <= hw) return true;
    const corner = Math.hypot(dx - hw, dy - (hh * 0.5));
    return corner <= hh;
  }

  _selectLysosome(idx) {
    this._lysosomes.forEach(l => { l.selected = false; });
    const l = this._lysosomes[idx];
    l.selected = true;
    this._selectedId = l.id;
    this._phase = 'selected';
    this._reactT = 0;
    this._spawnEnzymes(l);
    this._announce(`${l.id + 1} selected. Click the worn-out mitochondrion to send it.`);
  }

  _selectedLysosome() {
    return this._lysosomes.find(l => l.id === this._selectedId);
  }

  _spawnEnzymes(lysosome) {
    this._enzymes = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random();
      const dist  = lysosome.r * (0.25 + Math.random() * 0.45);
      this._enzymes.push({
        x: lysosome.x + Math.cos(angle) * dist,
        y: lysosome.y + Math.sin(angle) * dist,
        angle,
        dist,
        speed: 0.5 + Math.random() * 0.8,
      });
    }
  }

  // ── State machine ───────────────────────────────────────────────────────────

  _update(dt) {
    this._time += dt;
    this._bubbleTimer += dt;

    // Gentle floating for idle lysosomes
    this._lysosomes.forEach((l, i) => {
      if (this._phase === 'idle' || (this._phase === 'selected' && !l.selected)) {
        const t = this._time + i * 2;
        l.x = l.baseX + Math.sin(t * 0.8) * 6;
        l.y = l.baseY + Math.cos(t * 0.6) * 5;
      }
    });

    if (this._phase === 'moving') {
      this._reactT += dt;
      const t = Math.min(1, this._reactT / MOVE_SECONDS);
      const l = this._selectedLysosome();
      const tx = this._target.cx;
      const ty = this._target.cy;
      // Ease-in-out
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      l.x = this._startPos.x + (tx - this._startPos.x) * e;
      l.y = this._startPos.y + (ty - this._startPos.y) * e;
      // Keep enzymes with the lysosome
      this._spawnEnzymes(l);

      if (t >= 1) {
        this._phase = 'engulfing';
        this._reactT = 0;
        this._announce('Lysosome reached the waste. Membrane fusion begins.');
      }
    }
    else if (this._phase === 'engulfing') {
      this._reactT += dt;
      const l = this._selectedLysosome();
      // Expand radius to form a digestive vacuole / autolysosome
      const p = Math.min(1, this._reactT / ENGULF_SECONDS);
      l.r = l.baseR * (1 + 0.75 * p);
      // Nudge position to target centre
      l.x = this._target.cx;
      l.y = this._target.cy;
      this._spawnEnzymes(l);
      if (p >= 1) {
        this._phase = 'digesting';
        this._reactT = 0;
        this._target.alive = false;
        this._announce('Autolysosome formed. Enzymes are breaking down the organelle.');
      }
    }
    else if (this._phase === 'digesting') {
      this._reactT += dt;
      const l = this._selectedLysosome();
      // Animate enzymes swirling inside the expanded lysosome
      this._enzymes.forEach((en, i) => {
        en.angle += en.speed * dt * 2;
        en.dist = Math.min(l.r * 0.65, en.dist + 8 * dt);
        en.x = l.x + Math.cos(en.angle) * en.dist;
        en.y = l.y + Math.sin(en.angle) * en.dist;
      });

      if (this._reactT >= DIGEST_SECONDS) {
        this._phase = 'recycling';
        this._reactT = 0;
        this._spawnNutrients(l);
        this._announce('Digestion complete. Nutrients are released into the cytoplasm.');
      }
    }
    else if (this._phase === 'recycling') {
      this._reactT += dt;
      const l = this._selectedLysosome();
      // Shrink lysosome back toward normal size
      const p = Math.min(1, this._reactT / RECYCLE_SECONDS);
      l.r = l.r + (l.baseR - l.r) * p;

      // Drift nutrients outward
      this._nutrients.forEach(n => {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.life -= dt;
      });
      this._nutrients = this._nutrients.filter(n => n.life > 0 && n.x > 40 && n.x < W - 40 && n.y > 40 && n.y < H - 40);

      if (p >= 1) {
        this._phase = 'done';
        this._reactT = 0;
      }
    }
  }

  _spawnNutrients(lysosome) {
    const labels = ['AA', 'sugar', 'lipid'];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 35;
      this._nutrients.push({
        x: lysosome.x,
        y: lysosome.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 3.5 + Math.random(),
        label: labels[i % labels.length],
      });
      this._recycledCount++;
    }
  }

  // ── Frame orchestration ─────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._update(dt);

    // Background
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }

    // Cell view
    this.drawCytoplasm(ctx);
    this.drawCellMembrane(ctx);

    // Draw waste target only before it is fully engulfed
    if (this._phase !== 'engulfing' && this._phase !== 'digesting' &&
        this._phase !== 'recycling' && this._phase !== 'done') {
      this._drawWasteGroup(ctx, this._target.cx, this._target.cy, 1, 1);
    }

    // Organelles: draw non-selected lysosomes first, selected last
    const ordered = [...this._lysosomes].sort((a, b) => (a.selected === b.selected ? 0 : a.selected ? 1 : -1));
    ordered.forEach((l, i) => this._drawLysosome(ctx, l, l.selected));

    // Nutrients float above everything
    this._drawNutrients(ctx);

    // Labels and teaching bubbles
    this._drawOverlay(ctx);
  }

  _drawInitialFrame(ctx) {
    this._tick(ctx, 0);
  }

  // ── Drawing: waste target ───────────────────────────────────────────────────

  _drawWasteGroup(ctx, cx, cy, scale, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Flicker effect for the worn-out mitochondrion
    const flicker = 0.65 + 0.15 * Math.sin(this._time * 5);

    // Capsule shape
    const w = this._target.w, h = this._target.h, r = h / 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.arc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.arc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();

    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, COLORS.mitoDim);
    grad.addColorStop(1, COLORS.mitoDark);
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha * flicker;
    ctx.fill();

    // Dashed inner cristae
    ctx.globalAlpha = alpha * flicker * 0.7;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 10, i * 10);
      ctx.quadraticCurveTo(0, i * 10 - 8, w / 2 - 10, i * 10);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Debris chunks around the mitochondrion
    ctx.save();
    ctx.globalAlpha = alpha;
    this._debris.forEach(d => {
      ctx.fillStyle = COLORS.waste;
      ctx.beginPath();
      for (let i = 0; i < d.pts; i++) {
        const a = d.angle + (i / d.pts) * Math.PI * 2;
        const rr = d.r * (0.7 + 0.3 * Math.sin(this._time * 3 + i));
        const px = cx + d.cx + Math.cos(a) * rr;
        const py = cy + d.cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  // ── Drawing: lysosome (3D model with optional cutaway) ──────────────────────

  _drawLysosome(ctx, l, isSelected) {
    const { x, y } = l;
    let r = l.r;

    // Digestive vacuole is larger; smooth expansion handled in _update
    ctx.save();

    if (isSelected) {
      SimDraw.drawPulse(ctx, x, y, r + 6, COLORS.lysosome, this._time * 1.2);
    }

    // Outer membrane rim
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.lysosomeLight;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Spherical body
    const bodyGrad = ctx.createRadialGradient(x - r / 3, y - r / 3, r / 6, x, y, r);
    bodyGrad.addColorStop(0, '#fca5a5');
    bodyGrad.addColorStop(0.35, COLORS.lysosome);
    bodyGrad.addColorStop(1, COLORS.lysosomeDark);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Inner membrane hint
    ctx.beginPath();
    ctx.arc(x, y, r - 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gloss highlight
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.35, r * 0.22, r * 0.14, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();

    // Cutaway window shows the acidic lumen and enzymes
    const showCutaway = isSelected || this._phase === 'engulfing' ||
                        this._phase === 'digesting' || this._phase === 'recycling' ||
                        this._phase === 'done';
    if (showCutaway) {
      const startA = Math.PI * 0.62;
      const endA   = Math.PI * 1.38;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, startA, endA);
      ctx.closePath();
      ctx.clip();

      // Lumen fill
      ctx.beginPath();
      ctx.arc(x, y, r - 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(127,29,29,0.92)';
      ctx.fill();

      // Proton pump hint (tiny blue V shapes on membrane)
      ctx.fillStyle = '#60a5fa';
      for (let i = 0; i < 4; i++) {
        const a = startA + (endA - startA) * (0.2 + i * 0.2);
        const px = x + Math.cos(a) * (r - 6);
        const py = y + Math.sin(a) * (r - 6);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // If waste has been engulfed, draw degraded target inside the cutaway
      if ((this._phase === 'engulfing' || this._phase === 'digesting' ||
           this._phase === 'recycling' || this._phase === 'done') && isSelected) {
        let wasteScale = 1;
        let wasteAlpha = 1;
        if (this._phase === 'digesting') {
          const p = Math.min(1, this._reactT / DIGEST_SECONDS);
          wasteScale = 1 - 0.55 * p;
          wasteAlpha = 1 - p;
        } else if (this._phase === 'recycling' || this._phase === 'done') {
          wasteScale = 0.45;
          wasteAlpha = 0.2;
        }
        this._drawWasteGroup(ctx, x, y, wasteScale, wasteAlpha);
      }

      // Enzymes inside the cutaway
      this._enzymes.forEach(en => {
        if (Math.hypot(en.x - x, en.y - y) > r - 6) return;
        SimDraw.drawMolecule(ctx, en.x, en.y, 3.5, '', COLORS.enzyme);
      });

      ctx.restore();

      // Cutaway edge highlight
      ctx.beginPath();
      ctx.arc(x, y, r, startA, endA);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawNutrients(ctx) {
    ctx.save();
    this._nutrients.forEach(n => {
      const alpha = Math.max(0, Math.min(1, n.life / 1.5));
      ctx.globalAlpha = alpha;
      SimDraw.drawMolecule(ctx, n.x, n.y, 5, n.label, COLORS.nutrient);
    });
    ctx.restore();
  }

  // ── Overlay: labels, callouts, glossary ─────────────────────────────────────

  _drawOverlay(ctx) {
    // Persistent structure labels
    this._drawLabelPill(ctx, 'Cell membrane', 90, 40);
    this._drawLabelPill(ctx, 'Cytoplasm', 520, 420);

    if (this._phase === 'idle' || this._phase === 'selected') {
      this._drawLabelPill(ctx, 'Worn-out mitochondrion', this._target.cx, this._target.cy - this._target.h / 2 - 14);
    }

    const selected = this._selectedLysosome();
    if (selected && (this._phase === 'engulfing' || this._phase === 'digesting' ||
                     this._phase === 'recycling' || this._phase === 'done')) {
      this._drawLabelPill(ctx, 'Autolysosome (digestive vacuole)', selected.x, selected.y - selected.r - 14, { bg: '#7f1d1ddd' });
    } else {
      this._drawLabelPill(ctx, 'Lysosomes', 500, 130, { bg: '#991b1bdd' });
    }

    if (selected && (this._phase === 'selected' || this._phase === 'moving' ||
                     this._phase === 'engulfing' || this._phase === 'digesting')) {
      this._drawLabelPill(ctx, 'Acidic interior (pH ~4.5)', selected.x + selected.r + 10, selected.y, { bg: '#451a03dd', color: '#fde047' });
    }

    // Teaching callouts
    const bob = Math.sin(this._bubbleTimer * 1.4) * 3;
    let callout = null;

    if (this._phase === 'idle') {
      callout = {
        x: CX, y: 110 + bob,
        text: 'Step 1: Meet the Lysosome\nA lysosome is a tiny, membrane-bound sphere packed\nwith digestive enzymes. Click a red lysosome to select it.',
        opts: { maxW: 460 },
      };
    } else if (this._phase === 'selected') {
      callout = {
        x: CX, y: 110 + bob,
        text: 'Step 2: Target the waste\nThe mitochondrion is worn out and flickering.\nClick it to send the lysosome for recycling.',
        opts: { maxW: 440, bg: '#451a03dd', color: '#fde047' },
      };
    } else if (this._phase === 'moving') {
      callout = {
        x: CX, y: 110,
        text: 'Travelling...\nThe lysosome moves through the cytoplasm\ntoward the damaged organelle.',
        opts: { maxW: 360, bg: '#1e293bdd' },
      };
    } else if (this._phase === 'engulfing') {
      callout = {
        x: CX, y: 110,
        text: 'Membrane fusion\nThe lysosome membrane wraps around the waste,\nforming an autolysosome.',
        opts: { maxW: 420, bg: '#7f1d1ddd', color: '#fecaca' },
      };
    } else if (this._phase === 'digesting') {
      callout = {
        x: CX, y: 110,
        text: 'Digestion in progress\nAcidic enzymes attack the organelle, breaking it\ninto amino acids, sugars, and lipids.',
        opts: { maxW: 460, bg: '#064e3bcc', color: '#6ee7b7' },
      };
    } else if (this._phase === 'recycling') {
      callout = {
        x: CX, y: 110,
        text: 'Recycling!\nUseful building blocks are released back into\nthe cytoplasm to be reused by the cell.',
        opts: { maxW: 440, bg: '#1a2e05dd', color: '#a3e635' },
      };
    } else if (this._phase === 'done') {
      callout = {
        x: CX, y: 110 + bob,
        text: `Clean-up complete!\n${this._recycledCount} nutrient packets were recycled.\nPress Reset to try again.`,
        opts: { maxW: 420, bg: '#1e293bdd', color: '#cbd5e1' },
      };
    }

    if (callout) this._drawCallout(ctx, callout.x, callout.y, callout.text, callout.opts);

    // Recycled counter
    if (this._recycledCount > 0) {
      this._drawProductCounter(ctx);
    }

    // Rotating glossary card
    let gIdx = Math.floor((this._time || 0) / 7) % GLOSSARY.length;
    if (isNaN(gIdx) || gIdx < 0) gIdx = 0;
    this._drawGlossaryCard(ctx, 15, H - 15, GLOSSARY[gIdx]);
  }

  _drawProductCounter(ctx) {
    const txt = `♻️ Recycled: ${this._recycledCount}`;
    ctx.font = "600 11px 'JetBrains Mono',monospace";
    const padX = 10, bw = ctx.measureText(txt).width + padX * 2, bh = 26;
    const x = W - bw - 8, y = 8;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 7);
    ctx.fillStyle = '#111827ee';
    ctx.fill();
    ctx.strokeStyle = COLORS.nutrient;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.nutrient;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + bw / 2, y + bh / 2);
    ctx.restore();
  }

  // ── Shared drawing helpers ──────────────────────────────────────────────────

  _drawLabelPill(ctx, text, x, y, { bg = '#1e293bcc', color = COLORS.label } = {}) {
    ctx.save();
    ctx.font = '600 11px Inter, system-ui';
    const paddingX = 8;
    const h = 22;
    const w = ctx.measureText(text).width + paddingX * 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2);
    ctx.restore();
  }

  _drawCallout(ctx, cx, cy, text, { bg = '#1e293bdd', color = COLORS.label, maxW = 300 } = {}) {
    const lines  = text.split('\n');
    const lineH  = 17;
    const padX   = 14, padY = 10;
    const tailH  = 10;

    ctx.save();
    ctx.font = '500 12px Inter,system-ui';

    let textW = 0;
    for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
    textW = Math.min(textW, maxW - padX * 2);

    const bw = textW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = Math.max(6, Math.min(W - bw - 6, cx - bw / 2));
    const by = cy - bh - tailH;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fillStyle = bg;
    ctx.fill();

    const tailX = Math.max(bx + 14, Math.min(bx + bw - 14, cx));
    ctx.beginPath();
    ctx.moveTo(tailX - 8, by + bh);
    ctx.lineTo(tailX + 8, by + bh);
    ctx.lineTo(tailX,     by + bh + tailH);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + padY + i * lineH, bw - padX * 2));
    ctx.restore();
  }

  _drawGlossaryCard(ctx, x, y, termItem) {
    ctx.save();
    ctx.font = 'bold 12px Inter,system-ui';
    const termW = ctx.measureText(`📖 ${termItem.term}`).width;

    ctx.font = '500 11px Inter,system-ui';
    const lines = termItem.desc.split('\n');
    let maxW = termW;
    lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l.trim()).width); });

    const padX = 14, padY = 12;
    const lineH = 16;
    const w = maxW + padX * 2;
    const h = 20 + lines.length * lineH + padY;

    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = '#0f172add';
    ctx.fill();
    ctx.strokeStyle = '#ef444455';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 12px Inter,system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);

    ctx.fillStyle = COLORS.labelMuted;
    ctx.font = '500 11px Inter,system-ui';
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), x + padX, y - h + padY + 22 + i * lineH);
    });

    const t = (this._time % 7) / 7;
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 4, (w - 4) * t, 2, 1);
    ctx.fillStyle = '#ef444488';
    ctx.fill();

    ctx.restore();
  }
}
