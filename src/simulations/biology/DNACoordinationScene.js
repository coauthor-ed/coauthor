import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * DNACoordinationScene — Part 4.6 "DNA Coordination".
 *
 * A short, mostly auto-playing narrative (matching the Part 4 "content
 * animation" pattern set by LegoAnimationScene) built around one idea: DNA
 * never leaves the nucleus, yet it directs the whole cell. A double helix
 * sits inside the nucleus; in turn, three of its genes "switch on" — a
 * scanning highlight sweeps the gene, and a glowing instruction arrow
 * carries its message out to the organelle that acts on it:
 *   gene 1 -> Ribosome      -> "Build this protein"
 *   gene 2 -> Mitochondria  -> "Activate mitochondria"
 *   gene 3 -> Golgi apparatus -> "Produce enzymes"
 * A closing beat shows all three instructions at once, naming DNA as the
 * cell's coordination centre.
 *
 * ── Deviations from the sprint spec (deliberate) ──────────────────────────
 * The spec leaves the exact set of "output" organelles open; Ribosome,
 * Mitochondria and Golgi apparatus were chosen because each already has its
 * own dedicated organelle scene elsewhere in this suite (Part 5), so the
 * icons and colours used here are consistent with what a student will
 * recognise from RibosomeScene / MitochondriaScene / GolgiApparatusScene.
 * Controls are a self-built overlay (play/pause, skip, replay) rather than
 * a `static CONTROLS` descriptor, so the scene is fully interactive when
 * mounted through any host, not only the showcase page — matching the
 * portability precedent set by LegoAnimationScene and the lab scenes.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — hex values
 * from sim-theme.css are inlined in COLORS below.
 */

const W = 700;
const H = 500;

const COLORS = {
  bgDeep:     '#050811',
  bgCell:     '#0d1f3c',
  nucleus:    '#6366f1',
  nucleusDeep:'#312e81',
  dnaStrand:  '#a5b4fc',
  geneRibo:   '#93c5fd',
  geneMito:   '#fcd34d',
  geneGolgi:  '#f9a8d4',
  ribosome:   '#94a3b8',
  ribosomeD:  '#475569',
  mito:       '#f59e0b',
  mitoD:      '#92400e',
  golgi:      '#ec4899',
  golgiD:     '#9d174d',
  protein:    '#f472b6',
  atp:        '#34d399',
  enzyme:     '#a3e635',
  textMain:   '#f8fafc',
  textMuted:  '#94a3b8',
};

const GLOSSARY = [
  { term: 'Gene', desc: 'A short section of DNA that carries the instructions\nfor one particular job in the cell.' },
  { term: 'Chromosome', desc: 'A long, coiled thread of DNA. A human cell nucleus\nholds 46 chromosomes, packed with thousands of genes.' },
  { term: 'Nucleus', desc: 'The membrane-bound "control room" of the cell.\nDNA stays inside it — instructions travel out, not DNA itself.' },
  { term: 'mRNA', desc: 'A working copy of a gene\'s instructions, made in the\nnucleus and sent out to the rest of the cell.' },
  { term: 'Coordination Centre', desc: 'DNA does not do the cell\'s work itself — it directs\nwhich organelles switch on, and when.' },
];

const NUCLEUS = { x: 300, y: 216, r: 104 };

const TARGETS = {
  ribosome: {
    x: 574, y: 96, r: 32, color: COLORS.ribosome, dark: COLORS.ribosomeD,
    name: 'Ribosome', label: 'Build this protein', geneColor: COLORS.geneRibo,
    geneRange: [-92, -30],
  },
  mito: {
    x: 596, y: 316, r: 32, color: COLORS.mito, dark: COLORS.mitoD,
    name: 'Mitochondria', label: 'Activate mitochondria', geneColor: COLORS.geneMito,
    geneRange: [-28, 30],
  },
  golgi: {
    x: 132, y: 352, r: 32, color: COLORS.golgi, dark: COLORS.golgiD,
    name: 'Golgi Apparatus', label: 'Produce enzymes', geneColor: COLORS.geneGolgi,
    geneRange: [32, 92],
  },
};
const TARGET_ORDER = ['ribosome', 'mito', 'golgi'];

const PHASES = [
  { dur: 4.0, title: "THE CELL'S CONTROL CENTRE", target: null,
    text: "Every cell's nucleus holds a DNA library — a complete set of instructions for everything the cell can do." },
  { dur: 5.5, title: 'INSTRUCTION 1 OF 3', target: 'ribosome',
    text: 'One gene switches on. Its instructions travel out to a ribosome: build this protein!' },
  { dur: 5.5, title: 'INSTRUCTION 2 OF 3', target: 'mito',
    text: 'Another gene switches on. Its instructions activate the mitochondria to release more energy.' },
  { dur: 5.5, title: 'INSTRUCTION 3 OF 3', target: 'golgi',
    text: 'A third gene switches on. Its instructions tell the Golgi apparatus to produce and release enzymes.' },
  { dur: 999, title: 'DNA: THE COORDINATION CENTRE', target: null,
    text: 'DNA never leaves the nucleus — it is the coordination centre, sending instructions out to every part of the cell.' },
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t) {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export class DNACoordinationScene extends CanvasSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static ARIA_LABEL =
    'DNA coordination animation. A double helix inside the nucleus switches on three genes in turn, ' +
    'each sending an instruction out to a different organelle: build a protein, activate the ' +
    'mitochondria, and produce enzymes.';

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.phase = 0;
    this.phaseT = 0;
    this.paused = false;
    this.completedTargets = new Set();
    this._time = 0;
    this._fx = [];

    this._overlay = null; this._captionEl = null;
    this._playBtn = null; this._nextBtn = null; this._replayBtn = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', DNACoordinationScene.ARIA_LABEL);
    this._buildOverlay();
    this._buildBgCache();
    this._syncOverlay();
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    this._bgCache = null;
    super.destroy();
  }

  // ── DOM overlay (cinematic caption + transport controls) ───────────────────

  _buildOverlay() {
    this.container.style.position = 'relative';

    const style = document.createElement('style');
    style.textContent = `
      .dna-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
        gap:10px;pointer-events:none;padding:14px;box-sizing:border-box;
        font-family:Inter,system-ui,sans-serif;}
      .dna-caption{pointer-events:auto;max-width:520px;text-align:center;
        background:rgba(9,15,30,0.88);border:1px solid rgba(129,140,248,0.4);border-radius:12px;
        padding:10px 18px;box-shadow:0 6px 20px rgba(0,0,0,0.35);}
      .dna-caption .dna-title{font:800 11px Inter,system-ui;letter-spacing:0.6px;color:#7dd3fc;margin-bottom:4px;}
      .dna-caption .dna-text{font:500 13px Inter,system-ui;color:#e2e8f0;line-height:1.4;}
      .dna-controls{pointer-events:auto;display:flex;gap:8px;}
      .dna-btn{padding:8px 15px;border-radius:8px;border:none;cursor:pointer;font:600 12.5px Inter,system-ui;
        background:#818cf8;color:#0b1120;transition:filter .15s,opacity .15s;}
      .dna-btn:hover{filter:brightness(1.1);}
      .dna-btn.secondary{background:rgba(17,24,39,0.85);color:#e2e8f0;border:1.5px solid rgba(148,163,184,0.35);}
      .dna-btn:disabled{opacity:0.4;cursor:not-allowed;}
    `;
    this._overlay = document.createElement('div');
    this._overlay.className = 'dna-overlay';
    this._overlay.appendChild(style);

    this._captionEl = document.createElement('div');
    this._captionEl.className = 'dna-caption';
    this._captionEl.setAttribute('role', 'status');
    this._captionEl.setAttribute('aria-live', 'polite');
    this._captionEl.innerHTML = '<div class="dna-title"></div><div class="dna-text"></div>';

    const controls = document.createElement('div');
    controls.className = 'dna-controls';

    this._playBtn = document.createElement('button');
    this._playBtn.className = 'dna-btn secondary';
    this._playBtn.addEventListener('click', () => this._togglePause());

    this._nextBtn = document.createElement('button');
    this._nextBtn.className = 'dna-btn secondary';
    this._nextBtn.textContent = 'Skip ⏭';
    this._nextBtn.addEventListener('click', () => this._advancePhase());

    this._replayBtn = document.createElement('button');
    this._replayBtn.className = 'dna-btn';
    this._replayBtn.textContent = '↻ Replay';
    this._replayBtn.addEventListener('click', () => this._replay());

    controls.appendChild(this._playBtn);
    controls.appendChild(this._nextBtn);
    controls.appendChild(this._replayBtn);

    this._overlay.appendChild(this._captionEl);
    this._overlay.appendChild(controls);
    this.container.appendChild(this._overlay);
  }

  _syncOverlay() {
    const p = PHASES[this.phase];
    this._captionEl.querySelector('.dna-title').textContent = p.title;
    this._captionEl.querySelector('.dna-text').textContent = p.text;
    this._playBtn.textContent = this.paused ? '▶ Resume' : '⏸ Pause';
    const atEnd = this.phase === PHASES.length - 1;
    this._nextBtn.style.display = atEnd ? 'none' : 'inline-flex';
    this._playBtn.style.display = atEnd ? 'none' : 'inline-flex';
    this._replayBtn.style.display = atEnd ? 'inline-flex' : 'none';
  }

  // ── Playback control ─────────────────────────────────────────────────────

  _togglePause() {
    this.paused = !this.paused;
    this._syncOverlay();
  }

  _advancePhase() {
    if (this.phase >= PHASES.length - 1) return;
    if (PHASES[this.phase].target) this.completedTargets.add(PHASES[this.phase].target);
    this.phase++;
    this.phaseT = 0;
    this._burstAt(NUCLEUS.x, NUCLEUS.y);
    this._syncOverlay();
  }

  _replay() {
    this.phase = 0;
    this.phaseT = 0;
    this.paused = false;
    this.completedTargets.clear();
    this._syncOverlay();
  }

  // ── Frame loop ────────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;
    this._update(dt);
    ctx.clearRect(0, 0, W, H);
    this._drawBackground(ctx);
    this._drawArrowsAndTargets(ctx);
    this._drawNucleus(ctx);
    this._drawFx(ctx);
    this._drawGlossaryCard(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _update(dt) {
    if (this.paused) return;
    this.phaseT += dt;
    const dur = PHASES[this.phase].dur;
    if (this.phaseT >= dur && this.phase < PHASES.length - 1) {
      this._advancePhase();
    }
    for (const p of this._fx) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
    }
    if (this._fx.length) this._fx = this._fx.filter((f) => f.life > 0);
  }

  _burstAt(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this._fx.push({
        x, y, vx: Math.cos(a) * (40 + Math.random() * 90), vy: Math.sin(a) * (40 + Math.random() * 90),
        life: 0.7, max: 0.7, r: 1.4 + Math.random() * 2, color: COLORS.dnaStrand,
      });
    }
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBgCache() {
    const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ctx = oc.getContext('2d');
    const g = ctx.createRadialGradient(NUCLEUS.x, NUCLEUS.y, 40, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, COLORS.bgCell);
    g.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }
  }

  // ── Nucleus + DNA helix ──────────────────────────────────────────────────

  _drawNucleus(ctx) {
    const { x, y, r } = NUCLEUS;
    ctx.save();

    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
    g.addColorStop(0, '#818cf8');
    g.addColorStop(0.7, COLORS.nucleus);
    g.addColorStop(1, COLORS.nucleusDeep);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = 'rgba(49,46,129,0.9)';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r - 8, 0, Math.PI * 2); ctx.stroke();

    // Nuclear pores.
    ctx.fillStyle = 'rgba(49,46,129,0.75)';
    for (let k = 0; k < 18; k++) {
      const a = k * (Math.PI * 2 / 18);
      ctx.beginPath();
      ctx.arc(x + (r - 5) * Math.cos(a), y + (r - 5) * Math.sin(a), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 10, 0, Math.PI * 2);
    ctx.clip();
    this._drawHelix(ctx, x, y);
    ctx.restore();

    ctx.restore();

    ctx.save();
    ctx.font = '700 11px Inter, system-ui';
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('NUCLEUS', x, y + r + 20);
    ctx.restore();
  }

  _drawHelix(ctx, cx, cy) {
    const amplitude = 22;
    const frequency = 0.045;
    const phaseOffset = this._time * 1.4;
    const activeTarget = PHASES[this.phase].target;
    const scanP = activeTarget ? clamp01(this.phaseT / (PHASES[this.phase].dur * 0.4)) : 0;

    for (let x = -96; x <= 96; x += 4) {
      const y1 = cy + Math.sin((x + phaseOffset * 12) * frequency) * amplitude;
      const y2 = cy + Math.sin((x + phaseOffset * 12) * frequency + Math.PI) * amplitude;
      const px = cx + x;

      let highlight = null;
      for (const key of TARGET_ORDER) {
        const [gx0, gx1] = TARGETS[key].geneRange;
        if (x >= gx0 && x <= gx1) { highlight = TARGETS[key]; break; }
      }
      const isActiveGene = activeTarget && highlight === TARGETS[activeTarget];
      const dim = activeTarget && !isActiveGene;

      ctx.globalAlpha = dim ? 0.32 : 1;
      ctx.strokeStyle = highlight ? highlight.geneColor : COLORS.dnaStrand;
      ctx.lineWidth = isActiveGene ? 3.4 : 2.2;
      ctx.beginPath();
      ctx.moveTo(px, y1); ctx.lineTo(px, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Backbone strands.
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.dnaStrand;
    ctx.shadowColor = COLORS.dnaStrand;
    ctx.shadowBlur = 6;
    for (const sign of [1, -1]) {
      ctx.beginPath();
      for (let x = -100; x <= 100; x += 3) {
        const yy = cy + Math.sin((x + phaseOffset * 12) * frequency + (sign > 0 ? 0 : Math.PI)) * amplitude;
        if (x === -100) ctx.moveTo(cx + x, yy); else ctx.lineTo(cx + x, yy);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Scanning reader sweeping across the active gene while it "reads".
    if (activeTarget && scanP < 1) {
      const [gx0, gx1] = TARGETS[activeTarget].geneRange;
      const sx = cx + lerp(gx0, gx1, scanP);
      const sy = cy + Math.sin((sx - cx + phaseOffset * 12) * frequency) * amplitude;
      ctx.save();
      ctx.shadowColor = TARGETS[activeTarget].geneColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Instruction arrows + organelle targets ──────────────────────────────

  _drawArrowsAndTargets(ctx) {
    const activeTarget = PHASES[this.phase].target;
    const showAllSteady = this.phase === PHASES.length - 1;

    for (const key of TARGET_ORDER) {
      const t = TARGETS[key];
      const done = this.completedTargets.has(key) || showAllSteady;
      const isActive = key === activeTarget;
      let arrowP = 0, labelP = 0, workP = 0;

      if (isActive) {
        const p = clamp01(this.phaseT / PHASES[this.phase].dur);
        arrowP = clamp01((p - 0.32) / 0.4);
        labelP = clamp01((p - 0.55) / 0.3);
        workP = clamp01((p - 0.6) / 0.4);
      } else if (done) {
        arrowP = 1; labelP = 1; workP = 1;
      }

      if (arrowP > 0) this._drawInstructionArrow(ctx, t, arrowP, isActive);
      this._drawOrganelleIcon(ctx, key, t, workP, done, isActive);
      if (labelP > 0) this._drawInstructionLabel(ctx, t, labelP);
    }
  }

  _drawInstructionArrow(ctx, target, p, active) {
    const dx = target.x - NUCLEUS.x, dy = target.y - NUCLEUS.y;
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist, uy = dy / dist;
    const startR = NUCLEUS.r + 6;
    const endR = target.r + 10;
    const x1 = NUCLEUS.x + ux * startR, y1 = NUCLEUS.y + uy * startR;
    const fullX2 = target.x - ux * endR, fullY2 = target.y - uy * endR;
    const eased = easeInOut(clamp01(p));
    const x2 = lerp(x1, fullX2, eased), y2 = lerp(y1, fullY2, eased);

    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.55;
    ctx.strokeStyle = target.geneColor;
    ctx.shadowColor = target.geneColor;
    ctx.shadowBlur = active ? 10 : 0;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -this._time * (active ? 30 : 6);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (p >= 0.98 || !active) {
      const angle = Math.atan2(uy, ux);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 9 * Math.cos(angle - 0.4), y2 - 9 * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - 9 * Math.cos(angle + 0.4), y2 - 9 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = target.geneColor;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawInstructionLabel(ctx, target, p) {
    const alpha = clamp01(p * 1.6);
    const rise = (1 - easeOutBack(clamp01(p))) * 8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 11px Inter, system-ui';
    const text = target.label;
    const w = ctx.measureText(text).width + 18;
    const bx = Math.max(6, Math.min(W - w - 6, target.x - w / 2));
    const by = target.y - target.r - 30 - rise;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, 22, 11);
    ctx.fillStyle = 'rgba(9,15,30,0.92)';
    ctx.fill();
    ctx.strokeStyle = target.geneColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = target.geneColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + w / 2, by + 11.5);
    ctx.restore();
  }

  _drawOrganelleIcon(ctx, key, target, workP, done, active) {
    ctx.save();
    ctx.translate(target.x, target.y);
    const pulse = active ? 1 + 0.12 * Math.sin(this._time * 6) : 1;
    ctx.scale(pulse, pulse);

    if (active || done) {
      ctx.shadowColor = target.geneColor;
      ctx.shadowBlur = active ? 18 : 6;
    }

    if (key === 'ribosome') this._drawRibosomeIcon(ctx, target, workP);
    else if (key === 'mito') this._drawMitoIcon(ctx, target, workP);
    else this._drawGolgiIcon(ctx, target, workP);

    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.save();
    ctx.font = '700 10px Inter, system-ui';
    ctx.fillStyle = done || active ? '#e2e8f0' : 'rgba(148,163,184,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(target.name, target.x, target.y + target.r + 16);
    ctx.restore();
  }

  _drawRibosomeIcon(ctx, target, workP) {
    const r = target.r;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.28, r * 0.85, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ribosomeD;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.2, r * 0.72, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ribosome;
    ctx.fill();
    if (workP > 0) {
      // A small protein chain assembling beside the ribosome.
      ctx.save();
      ctx.globalAlpha = clamp01(workP * 1.4);
      for (let i = 0; i < 3; i++) {
        if (workP < (i + 1) / 4) break;
        ctx.beginPath();
        ctx.arc(r * 1.05, -r * 0.5 + i * 9, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.protein;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawMitoIcon(ctx, target, workP) {
    const r = target.r;
    ctx.beginPath();
    ctx.roundRect(-r * 0.9, -r * 0.55, r * 1.8, r * 1.1, r * 0.5);
    const g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, '#fbbf24');
    g.addColorStop(1, COLORS.mitoD);
    ctx.fillStyle = workP > 0 ? g : COLORS.mitoD;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.28, -r * 0.4);
      ctx.quadraticCurveTo(i * r * 0.28 + r * 0.18, 0, i * r * 0.28, r * 0.4);
      ctx.stroke();
    }
    if (workP > 0.15) {
      // ATP sparks.
      const n = Math.floor(workP * 4);
      for (let i = 0; i < n; i++) {
        const a = (this._time * 2 + i * 2.1) % (Math.PI * 2);
        const rr = r * 1.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.6, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.atp;
        ctx.fill();
      }
    }
  }

  _drawGolgiIcon(ctx, target, workP) {
    const r = target.r;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, -r * 0.5 + i * (r * 0.32), r * 0.7, 0.3, Math.PI - 0.3);
      ctx.strokeStyle = i % 2 === 0 ? COLORS.golgi : COLORS.golgiD;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (workP > 0.2) {
      const bud = clamp01((workP - 0.2) / 0.8);
      ctx.save();
      ctx.globalAlpha = clamp01(bud * 1.3);
      ctx.beginPath();
      ctx.arc(r * 0.9 * bud + r * 0.3, r * 0.7, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.enzyme;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── FX + glossary ────────────────────────────────────────────────────────

  _drawFx(ctx) {
    for (const p of this._fx) {
      const a = clamp01(p.life / p.max);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawGlossaryCard(ctx) {
    let idx = Math.floor(this._time / 6.5) % GLOSSARY.length;
    if (isNaN(idx) || idx < 0) idx = 0;
    const item = GLOSSARY[idx];
    const x = 14, y = H - 14;

    ctx.save();
    const lines = item.desc.split('\n');
    ctx.font = 'bold 11.5px Inter, system-ui';
    let maxW = ctx.measureText(`📖 ${item.term}`).width;
    ctx.font = '500 10.5px Inter, system-ui';
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l.trim()).width);

    const padX = 13, padY = 11, lineH = 15;
    const w = maxW + padX * 2;
    const h = 20 + lines.length * lineH + padY;

    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 9);
    ctx.fillStyle = 'rgba(9,15,30,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(129,140,248,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11.5px Inter, system-ui';
    ctx.fillStyle = '#a5b4fc';
    ctx.fillText(`📖 ${item.term}`, x + padX, y - h + padY);
    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    lines.forEach((l, i) => ctx.fillText(l.trim(), x + padX, y - h + padY + 21 + i * lineH));

    ctx.beginPath();
    ctx.roundRect(x + 2, y - 4, (w - 4) * ((this._time % 6.5) / 6.5), 2, 1);
    ctx.fillStyle = 'rgba(129,140,248,0.6)';
    ctx.fill();
    ctx.restore();
  }
}
