/**
 * ProteinPathwayScene — "Organelle Factory: The Protein Pathway"
 *
 * A full eukaryotic cell cross-section (Canvas 2D, 800x550) in which a glowing
 * protein marker traces the secretory pathway:
 *   Nucleus -> Nuclear pore -> Ribosome on RER -> RER lumen -> Vesicle ->
 *   Golgi stack -> Vesicle -> Cell membrane -> Secreted.
 *
 * Organelles are drawn entirely with canvas primitives, styled after the
 * classic textbook cell illustration, and themed through the CSS custom
 * properties: --sim-nucleus, --sim-er, --sim-ribosome, --sim-golgi,
 * --sim-membrane, --sim-protein (with sensible fallbacks).
 *
 * Constraints honoured:
 *  - No build step; native ES module.
 *  - Communication via EventBus only (no cross-Shadow-DOM queries).
 *  - All errors are caught and reported via ErrorReporter; nothing crashes
 *    the host session.
 */

import { CellViewSimulation } from '../base/CellViewSimulation.js';
import * as EventBusModule from '../../core/EventBus.js';
import * as ErrorReporterModule from '../../core/ErrorReporter.js';
import { SimDraw } from '../base/SimDrawUtils.js';
import { readSimColors } from '../base/SimTheme.js';

// Defensive resolution — works whether the modules expose named or default
// exports, an instance, or a class with static methods.
const EventBus = EventBusModule.EventBus || EventBusModule.default || EventBusModule;
const ErrorReporter =
  ErrorReporterModule.ErrorReporter || ErrorReporterModule.default || ErrorReporterModule;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const TOTAL_STEPS = 5;
const STEP_LABELS = {
  1: 'Instructions copied',
  2: 'Protein synthesised',
  3: 'Transported to Golgi',
  4: 'Processed & packaged',
  5: 'Secreted',
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a, b, t) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

export class ProteinPathwayScene extends CellViewSimulation {
  static WIDTH = 800;
  static HEIGHT = 550;

  constructor(container, config) {
    super(container, config);
    this._state = 'idle'; // 'idle' | 'running' | 'done'
    this._ready = false;
    this._destroyed = false;
    this._paused = false;
    this._time = 0;
    this._runT = 0;
    this._step = 0;
    this._seg = null;
    this._segP = 0;
    this._activeOrganelle = null;
    this._hoverBtn = false;
    this._onClick = null;
    this._onMove = null;
    this._onKey = null;
  }

  // ---------------------------------------------------------------- lifecycle

  async setup() {
    try {
      if (super.setup) await super.setup();
    } catch (err) {
      this._report(err);
    }
    try {
      this._reloadColors();
      this._buildGeometry();
      this._buildTimeline();
      // Keep base-class organelle registry in sync (harmless if unused).
      this.organelles = [
        { id: 'nucleus', label: 'Nucleus', x: this._nucleus.x, y: this._nucleus.y, r: this._nucleus.r },
        { id: 'er', label: 'Rough ER', x: this._er.cx + 130, y: this._er.cy + 60, r: 60 },
        { id: 'golgi', label: 'Golgi apparatus', x: this._golgi.x, y: this._golgi.y, r: 70 },
        { id: 'membrane', label: 'Cell membrane', x: this._cell.cx, y: this._cell.cy, r: this._cell.rx },
      ];
      this._bindInput();
      this._ready = true;
    } catch (err) {
      this._report(err);
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    try {
      const canvas = this._canvasEl();
      if (canvas) {
        if (this._onClick) canvas.removeEventListener('click', this._onClick);
        if (this._onMove) canvas.removeEventListener('mousemove', this._onMove);
        if (this._onKey) canvas.removeEventListener('keydown', this._onKey);
      }
    } catch (err) {
      this._report(err);
    }
    this._onClick = this._onMove = this._onKey = null;
    try {
      if (super.destroy) super.destroy();
    } catch (err) {
      this._report(err);
    }
  }

  pause() {
    this._paused = true;
    try {
      if (super.pause) super.pause();
    } catch (err) {
      this._report(err);
    }
  }

  resume() {
    this._paused = false;
    try {
      if (super.resume) super.resume();
    } catch (err) {
      this._report(err);
    }
  }

  // ------------------------------------------------------------ configuration

  /** Overrides CellViewSimulation._reloadColors() with this scene's own token set. */
  _reloadColors() {
    try {
      this.colors = readSimColors(this.container, {
        nucleus:  ['--sim-nucleus', '#8f6fc9'],
        er:       ['--sim-er', '#cfc2ee'],
        ribosome: ['--sim-ribosome', '#2f3d75'],
        golgi:    ['--sim-golgi', '#f28ba2'],
        membrane: ['--sim-membrane', '#35b3a7'],
        protein:  ['--sim-protein', '#ff5fa8'],
      });
    } catch (err) {
      this._report(err);
    }
  }

  /** All coordinates for the 800x550 stage, laid out anatomically. */
  _buildGeometry() {
    // Cell body — big rounded cytoplasm filling the stage.
    this._cell = { cx: 390, cy: 292, rx: 348, ry: 200 };

    // Nucleus (center-left) with the exit pore aimed at the RER (-30 deg).
    this._nucleus = { x: 292, y: 245, r: 78, poreAngle: -30 * DEG };

    // Rough ER — concentric wavy bands hugging the nucleus' right/bottom side.
    const bands = [];
    for (let i = 0; i < 6; i++) bands.push({ r: 100 + i * 14, wobble: i * 1.3 });
    this._er = { cx: 292, cy: 245, a0: -52 * DEG, a1: 104 * DEG, bands };

    // Golgi (center-right) — stack of curved cisternae, concave side down.
    const stack = [];
    for (let i = 0; i < 5; i++) {
      stack.push({ x: 560, y: 322 + i * 14, r: 74 - i * 3.5 });
    }
    this._golgi = {
      x: 560,
      y: 350,
      stack,
      a0: 10 * DEG,
      a1: 170 * DEG,
      buds: [
        { x: 472, y: 353, r: 7 },
        { x: 641, y: 359, r: 8 },
        { x: 487, y: 395, r: 6 },
      ],
    };

    // Key waypoints.
    const n = this._nucleus;
    this._pore = {
      x: n.x + n.r * Math.cos(n.poreAngle),
      y: n.y + n.r * Math.sin(n.poreAngle),
    };

    // Travel path through the RER lumen (along the innermost band).
    this._erPath = [];
    for (let a = -30; a <= 100; a += 8) {
      this._erPath.push(this._erPoint(bands[0], a * DEG));
    }
    const erTip = this._erPath[this._erPath.length - 1];
    this._erBud = { x: erTip.x - 13, y: erTip.y + 15 }; // pinch-off point

    // Golgi zig-zag through the stack (cis face -> trans face).
    const end = (s, ang) => ({ x: s.x + s.r * Math.cos(ang), y: s.y + s.r * Math.sin(ang) });
    this._golgiIn = end(stack[0], this._golgi.a1);
    this._golgiPath = [];
    for (const s of stack) {
      this._golgiPath.push(end(s, this._golgi.a1)); // left end
      this._golgiPath.push(end(s, this._golgi.a0)); // right end
    }
    this._golgiOut = end(stack[stack.length - 1], this._golgi.a0);
    this._golgiBud = { x: this._golgiOut.x + 14, y: this._golgiOut.y + 12 };

    // Membrane fusion point and the spot outside the cell.
    this._fusion = { x: 685, y: 186 };
    this._outside = { x: 740, y: 158 };

    // UI geometry.
    this._btn = { x: 22, y: 18, w: 176, h: 42, r: 12 };
    this._panel = { x: 70, y: 502, w: 660, h: 44 };
  }

  _buildTimeline() {
    const erTip = this._erPath[this._erPath.length - 1];
    const erOutline = this._shade(this.colors.er, -25);
    const golgiOutline = this._shade(this.colors.golgi, -25);
    const N = { x: this._nucleus.x, y: this._nucleus.y };

    const segs = [
      // Step 1 — transcription inside the nucleus.
      { step: 1, active: 'nucleus', dur: 1.5, path: [N], mode: 'appear' },
      // Step 2 — exit through the nuclear pore to a ribosome on the RER.
      { step: 2, active: 'nucleus', dur: 1.6, path: [N, this._pore] },
      { step: 2, active: 'er', dur: 1.2, path: [this._pore, this._erPath[0]] },
      { step: 2, active: 'er', dur: 1.5, path: [this._erPath[0]] }, // Pause for synthesis
      // Step 3 — through the RER lumen, vesicle pinch-off, ride to the Golgi.
      { step: 3, active: 'er', dur: 2.2, path: this._erPath },
      {
        step: 3, active: 'er', dur: 0.9, path: [erTip],
        vesicle: 'form', budTo: this._erBud, vesicleColor: erOutline,
      },
      {
        step: 3, active: 'golgi', dur: 1.5,
        path: [this._erBud, { x: 368, y: 372 }, this._golgiIn],
        vesicle: 'carry', vesicleColor: erOutline,
      },
      // Step 4 — through the Golgi stack (modification & packaging).
      {
        step: 4, active: 'golgi', dur: 2.6, path: this._golgiPath,
        vesicle: 'dissolve', vesicleColor: erOutline,
      },
      // Step 5 — vesicle buds off, fuses with the membrane, protein exits.
      {
        step: 5, active: 'golgi', dur: 0.9, path: [this._golgiOut],
        vesicle: 'form', budTo: this._golgiBud, vesicleColor: golgiOutline,
      },
      {
        step: 5, active: 'membrane', dur: 1.7,
        path: [this._golgiBud, { x: 682, y: 292 }, this._fusion],
        vesicle: 'carry', vesicleColor: golgiOutline,
      },
      {
        step: 5, active: 'membrane', dur: 1.4, path: [this._fusion, this._outside],
        vesicle: 'fuse', vesicleColor: golgiOutline, fade: true,
      },
    ];

    // Precompute cumulative timing, path lengths and per-step ranges.
    let t = 0;
    for (const seg of segs) {
      seg.start = t;
      seg.end = t + seg.dur;
      t = seg.end;
      const lens = [0];
      for (let i = 1; i < seg.path.length; i++) {
        const a = seg.path[i - 1];
        const b = seg.path[i];
        lens.push(lens[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
      }
      seg.cumLen = lens;
      seg.totalLen = lens[lens.length - 1] || 0;
    }
    this._segments = segs;
    this._totalDur = t;

    this._steps = [];
    for (let n = 1; n <= TOTAL_STEPS; n++) {
      const inStep = segs.filter((s) => s.step === n);
      this._steps.push({
        n,
        label: STEP_LABELS[n],
        start: inStep[0].start,
        end: inStep[inStep.length - 1].end,
      });
    }
  }

  // ------------------------------------------------------------- run control

  _startRun() {
    if (this._state === 'running' || !this._ready) return;
    this._state = 'running';
    this._runT = 0;
    this._step = 0;
    this._seg = null;
    this._segP = 0;
    this._activeOrganelle = null;
    this._emit('protein-pathway:start', {});
  }

  _finishRun() {
    this._state = 'done';
    this._seg = null;
    this._activeOrganelle = null;
    this._step = TOTAL_STEPS;
    this._emit('protein-pathway:complete', { steps: TOTAL_STEPS });
  }

  _advance(dt) {
    this._time += dt;
    if (this._state !== 'running') return;
    this._runT += dt;
    const seg = this._segments.find((s) => this._runT < s.end) || null;
    if (!seg) {
      this._finishRun();
      return;
    }
    this._seg = seg;
    this._segP = clamp01((this._runT - seg.start) / seg.dur);
    this._activeOrganelle = seg.active;
    if (seg.step !== this._step) {
      this._step = seg.step;
      this._emit('protein-pathway:step', {
        step: seg.step,
        total: TOTAL_STEPS,
        label: STEP_LABELS[seg.step],
      });
    }
  }

  // ---------------------------------------------------------------- rendering

  /**
   * Override of CellViewSimulation#_tick — the scene is fully custom-drawn so
   * the base implementation is intentionally not invoked.
   */
  _tick(ctx, dt) {
    if (this._destroyed || !this._ready || !ctx) return;
    try {
      let s = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;
      if (s > 1.5) s /= 1000; // tolerate millisecond deltas
      s = Math.min(s, 0.05);
      if (!this._paused) this._advance(s);
      this._render(ctx);
    } catch (err) {
      this._report(err);
    }
  }

  _render(ctx) {
    this._clear(ctx);

    // 1. Cytoplasm fill (never dimmed — it is the cell body, not an organelle).
    this.drawCytoplasm(ctx);

    // 2-5. Organelles; active one glows, the rest dim to 40% during a run.
    this._withGroup(ctx, 'membrane', () => this.drawCellMembrane(ctx));
    this._withGroup(ctx, 'er', () => this._drawER(ctx));
    this._withGroup(ctx, 'nucleus', () =>
      this.drawNucleus(ctx, this._nucleus.x, this._nucleus.y, this._nucleus.r));
    this._withGroup(ctx, 'golgi', () => this._drawGolgi(ctx));

    // 6. Travelling marker / transport vesicle / secreted protein.
    this._drawMarkerLayer(ctx);

    // 7. Organelle Labels
    this._drawOrganelleLabels(ctx);

    // 8. UI chrome.
    this._drawButton(ctx);
    this._drawProgress(ctx);
  }

  _drawOrganelleLabels(ctx) {
    if (!SimDraw || typeof SimDraw.drawLabel !== 'function') return;
    
    // Dim the labels slightly while the simulation is actively running
    const alpha = (this._state === 'running') ? 0.5 : 1.0;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Nucleus Label
    SimDraw.drawLabel(ctx, 'Nucleus', this._nucleus.x, this._nucleus.y - this._nucleus.r - 5, {
      bg: 'rgba(15, 23, 42, 0.15)', color: this.colors.nucleus
    });
    
    // Rough ER Label
    SimDraw.drawLabel(ctx, 'Rough ER', this._er.cx + 160, this._er.cy - 110, {
      bg: 'rgba(15, 23, 42, 0.15)', color: this.colors.er
    });
    
    // Golgi Apparatus Label
    SimDraw.drawLabel(ctx, 'Golgi Apparatus', this._golgi.x, this._golgi.y , {
      bg: 'rgba(15, 23, 42, 0.15)', color: this.colors.golgi
    });
    
    // Cell Membrane Label
    SimDraw.drawLabel(ctx, 'Cell Membrane', this._cell.cx, this._cell.cy + this._cell.ry - 55, {
      bg: 'rgba(15, 23, 42, 0.15)', color: this.colors.membrane
    });
    
    ctx.restore();
  }

  _clear(ctx) {
    const canvas = this._canvasEl();
    if (!canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /** Applies the dim/glow treatment for one organelle group. */
  _withGroup(ctx, id, draw) {
    const running = this._state === 'running';
    const active = this._activeOrganelle;
    ctx.save();
    try {
      if (running && active) {
        if (active === id) {
          const pulse = 0.5 + 0.5 * Math.sin(this._time * 4);
          ctx.shadowColor = this._alpha(this._glowFor(id), 0.9);
          ctx.shadowBlur = 16 + 14 * pulse;
        } else {
          ctx.globalAlpha = 0.4;
        }
      }
      draw();
    } catch (err) {
      this._report(err);
    } finally {
      ctx.restore();
    }
  }

  _glowFor(id) {
    switch (id) {
      case 'nucleus': return this.colors.nucleus;
      case 'er': return this.colors.er;
      case 'golgi': return this.colors.golgi;
      case 'membrane': return this.colors.membrane;
      default: return this.colors.protein;
    }
  }

  // ------------------------------------------------------- organelle drawing

  /** Light cyan cytoplasm with the deeper shading near the bottom. */
  drawCytoplasm(ctx) {
    const { cx, cy, rx, ry } = this._cell;
    ctx.save();
    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, '#f2fcfa');
    g.addColorStop(0.65, '#d3f0eb');
    g.addColorStop(1, '#aedfd8');
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();

    const shade = ctx.createRadialGradient(cx, cy + ry * 0.95, 10, cx, cy + ry * 0.95, rx);
    shade.addColorStop(0, 'rgba(46, 125, 117, 0.18)');
    shade.addColorStop(1, 'rgba(46, 125, 117, 0)');
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, 0, TAU);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
  }

  /** Outer boundary: dark rim, main teal band, inner highlight. */
  drawCellMembrane(ctx) {
    const { cx, cy, rx, ry } = this._cell;
    const m = this.colors.membrane;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, TAU);
    ctx.strokeStyle = this._shade(m, -28);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, TAU);
    ctx.strokeStyle = m;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 6, ry - 6, 0, 0, TAU);
    ctx.strokeStyle = this._alpha(this._shade(m, 40), 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** Nucleus: double membrane, pores, nucleolus and a DNA double helix. */
  drawNucleus(ctx, x, y, r) {
    const c = this.colors;
    ctx.save();

    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
    g.addColorStop(0, this._shade(c.nucleus, 42));
    g.addColorStop(0.7, this._shade(c.nucleus, 10));
    g.addColorStop(1, this._shade(c.nucleus, -10));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();

    // Double membrane rings.
    ctx.strokeStyle = this._shade(c.nucleus, -32);
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r - 7, 0, TAU);
    ctx.stroke();

    // Nuclear pores (leaving a gap at the exit pore).
    ctx.fillStyle = this._shade(c.nucleus, -45);
    const poreA = this._nucleus.poreAngle;
    for (let k = 0; k < 14; k++) {
      const a = k * (TAU / 14) + 0.22;
      let d = Math.abs(((a - poreA) % TAU + TAU) % TAU);
      if (d > Math.PI) d = TAU - d;
      if (d < 0.42) continue;
      ctx.beginPath();
      ctx.arc(x + (r - 4.5) * Math.cos(a), y + (r - 4.5) * Math.sin(a), 2.1, 0, TAU);
      ctx.fill();
    }
    // Exit-pore markers.
    ctx.strokeStyle = this._shade(c.nucleus, -45);
    ctx.lineWidth = 2;
    for (const off of [-0.16, 0.16]) {
      const a = poreA + off;
      ctx.beginPath();
      ctx.arc(x + (r - 4.5) * Math.cos(a), y + (r - 4.5) * Math.sin(a), 3.2, 0, TAU);
      ctx.stroke();
    }

    // Nucleolus.
    const ng = ctx.createRadialGradient(x - 8, y - 8, 4, x, y + 4, r * 0.56);
    ng.addColorStop(0, this._shade(c.nucleus, -18));
    ng.addColorStop(1, this._shade(c.nucleus, -38));
    ctx.beginPath();
    ctx.arc(x, y + 4, r * 0.56, 0, TAU);
    ctx.fillStyle = ng;
    ctx.fill();

    // DNA double helix across the nucleolus.
    this._drawDNA(ctx, x, y + 2, r);
    ctx.restore();
  }

  _drawDNA(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5);
    const span = r * 0.6;
    const amp = r * 0.13;
    const dark = this._shade(this.colors.nucleus, -52);
    const light = this._shade(this.colors.nucleus, 34);

    ctx.strokeStyle = this._alpha(light, 0.9);
    ctx.lineWidth = 1.6;
    for (let px = -span; px <= span; px += 9) {
      const y1 = amp * Math.sin(px * 0.16);
      ctx.beginPath();
      ctx.moveTo(px, -y1);
      ctx.lineTo(px, y1);
      ctx.stroke();
    }

    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (const s of [1, -1]) {
      ctx.beginPath();
      for (let px = -span; px <= span; px += 3) {
        const yy = s * amp * Math.sin(px * 0.16);
        if (px === -span) ctx.moveTo(px, yy);
        else ctx.lineTo(px, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _erPoint(band, angle, offset = 0) {
    const r = band.r + 4 * Math.sin(angle * 3 + band.wobble) + offset;
    return {
      x: this._er.cx + r * Math.cos(angle),
      y: this._er.cy + r * Math.sin(angle),
    };
  }

  /** Rough ER: folded wavy bands studded with ribosome dots. */
  _drawER(ctx) {
    const c = this.colors;
    const { a0, a1, bands } = this._er;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const band of bands) {
      const pts = [];
      for (let a = a0; a <= a1 + 1e-4; a += 0.08) pts.push(this._erPoint(band, a));

      const trace = () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      };
      trace();
      ctx.strokeStyle = this._shade(c.er, -25);
      ctx.lineWidth = 13.5;
      ctx.stroke();
      trace();
      ctx.strokeStyle = c.er;
      ctx.lineWidth = 11;
      ctx.stroke();
      trace();
      ctx.strokeStyle = this._alpha(this._shade(c.er, 35), 0.7);
      ctx.lineWidth = 4;
      ctx.stroke();

      // Ribosomes on the cytosolic surface.
      ctx.fillStyle = c.ribosome;
      for (let a = a0 + 0.1; a < a1; a += 0.23) {
        const p = this._erPoint(band, a, 9.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Golgi apparatus: stack of curved cisternae plus budding vesicles. */
  _drawGolgi(ctx) {
    const c = this.colors;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = this._golgi.stack.length - 1; i >= 0; i--) {
      const s = this._golgi.stack[i];
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, this._golgi.a0, this._golgi.a1);
      ctx.strokeStyle = this._shade(c.golgi, -25);
      ctx.lineWidth = 14.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, this._golgi.a0, this._golgi.a1);
      ctx.strokeStyle = c.golgi;
      ctx.lineWidth = 12;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x, s.y - 1.5, s.r, this._golgi.a0 + 0.15, this._golgi.a1 - 0.15);
      ctx.strokeStyle = this._alpha(this._shade(c.golgi, 38), 0.8);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    // Static budding vesicles around the stack edges.
    for (const v of this._golgi.buds) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.r, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this._shade(c.golgi, -15);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Base-class hook: draw an organelle descriptor by id. */
  drawOrganelle(ctx, organelle) {
    if (!organelle) return;
    try {
      switch (organelle.id) {
        case 'nucleus':
          this.drawNucleus(ctx, this._nucleus.x, this._nucleus.y, this._nucleus.r);
          break;
        case 'er':
          this._drawER(ctx);
          break;
        case 'golgi':
          this._drawGolgi(ctx);
          break;
        case 'membrane':
          this.drawCellMembrane(ctx);
          break;
        default:
          if (super.drawOrganelle) super.drawOrganelle(ctx, organelle);
      }
    } catch (err) {
      this._report(err);
    }
  }

  // -------------------------------------------------------- marker & vesicle

  _drawMarkerLayer(ctx) {
    try {
      if (this._state === 'done') {
        this._drawSecreted(ctx);
        return;
      }
      if (this._state !== 'running' || !this._seg) return;
      const seg = this._seg;
      const p = this._segP;

      // Position along the segment path (eased for multi-point travel).
      const t = seg.path.length > 1 ? easeInOutQuad(p) : 0;
      let pos = this._pointAlongPath(seg, t);

      // Budding drift while a vesicle is pinching off.
      if (seg.vesicle === 'form' && seg.budTo) {
        const e = easeOutCubic(p);
        const base = seg.path[0];
        pos = { x: lerp(base.x, seg.budTo.x, e), y: lerp(base.y, seg.budTo.y, e) };
        // Thinning tether neck for the pinch-off look.
        ctx.save();
        ctx.strokeStyle = this._alpha(seg.vesicleColor || this.colors.protein, 0.8);
        ctx.lineWidth = (1 - p) * 4 + 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      }

      // Membrane fusion glow + transient channel.
      if (seg.vesicle === 'fuse') {
        const f = this._fusion;
        const glowR = 26 * Math.sin(Math.PI * Math.min(1, p * 1.2));
        if (glowR > 0.5) {
          const fg = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, glowR);
          fg.addColorStop(0, this._alpha(this.colors.protein, 0.55));
          fg.addColorStop(1, this._alpha(this.colors.protein, 0));
          ctx.save();
          ctx.beginPath();
          ctx.arc(f.x, f.y, glowR, 0, TAU);
          ctx.fillStyle = fg;
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.strokeStyle = this._alpha(this.colors.membrane, 0.7 * p);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(this._outside.x, this._outside.y);
        ctx.stroke();
        ctx.restore();
      }

      // Transport vesicle around the marker.
      const vr = this._vesicleRadius(seg, p);
      if (vr > 0.4) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, vr, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = seg.vesicleColor || this.colors.membrane;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x - vr * 0.3, pos.y - vr * 0.35, vr * 0.28, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
        ctx.restore();
      }

      // The glowing protein marker itself.
      let alpha = 1;
      let scale = 1;
      if (seg.mode === 'appear') {
        alpha = Math.min(1, p * 1.8);
        scale = 0.5 + 0.5 * easeOutCubic(Math.min(1, p * 1.6));
      }
      if (seg.fade) alpha = 1 - smoothstep(0.5, 1, p);
      const pulse = 1 + 0.15 * Math.sin(this._time * 6);
      const r = 7 * scale * pulse;

      let markerColor = this.colors.protein;
      if (seg.step === 1) markerColor = '#bae6fd';      // mRNA (light blue)
      else if (seg.step === 2) markerColor = '#fbbf24'; // Unfolded Polypeptide (yellow/orange)
      else if (seg.step === 3) markerColor = '#34d399'; // Folded in ER (green)
      else if (seg.step === 4) markerColor = '#a78bfa'; // Modified in Golgi (purple)

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = markerColor;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, TAU);
      ctx.fillStyle = markerColor;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(pos.x - r * 0.25, pos.y - r * 0.25, r * 0.38, 0, TAU);
      ctx.fillStyle = this._alpha(this._shade(markerColor, 45), 0.95);
      ctx.fill();
      ctx.restore();
    } catch (err) {
      this._report(err);
    }
  }

  _vesicleRadius(seg, p) {
    const R = 12;
    switch (seg.vesicle) {
      case 'form': return R * easeOutCubic(p);
      case 'carry': return R;
      case 'dissolve': return R * (1 - clamp01(p / 0.25));
      case 'fuse': return R * (1 - clamp01(p / 0.45));
      default: return 0;
    }
  }

  /** Small secreted-protein knot bobbing outside the cell. */
  _drawSecreted(ctx) {
    const o = this._outside;
    const bob = Math.sin(this._time * 2) * 3;
    const p = this.colors.protein;
    ctx.save();
    ctx.translate(o.x, o.y + bob);
    ctx.shadowColor = p;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p;
    for (const b of [
      { x: 0, y: 0, r: 6 },
      { x: 11, y: -6, r: 4.5 },
      { x: -9, y: -6, r: 4 },
    ]) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this._shade(p, -25);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, 2);
    ctx.quadraticCurveTo(0, 10, 14, 3);
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------------------- UI

  _drawButton(ctx) {
    const b = this._btn;
    const enabled = this._state !== 'running';
    const label =
      this._state === 'running'
        ? 'Producing…'
        : this._state === 'done'
          ? 'Produce Again'
          : 'Produce Protein';
    ctx.save();
    this._roundRect(ctx, b.x, b.y, b.w, b.h, b.r);
    if (enabled) {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      const base = this.colors.membrane;
      g.addColorStop(0, this._shade(base, this._hoverBtn ? 28 : 14));
      g.addColorStop(1, this._shade(base, this._hoverBtn ? -2 : -16));
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(20, 80, 75, 0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.fillStyle = '#9fb3b8';
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = this._alpha(this._shade(this.colors.membrane, -35), 0.9);
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, b.x, b.y, b.w, b.h, b.r);
    ctx.stroke();

    // Marker dot icon.
    ctx.beginPath();
    ctx.arc(b.x + 22, b.y + b.h / 2, 6, 0, TAU);
    ctx.fillStyle = enabled ? this.colors.protein : '#e6ecef';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2 + 8, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  _drawProgress(ctx) {
    const { x, y, w, h } = this._panel;
    const prog = this._stepProgress();
    const label =
      this._state === 'idle'
        ? 'Press "Produce Protein" to start the pathway'
        : `Step ${prog.step} of ${TOTAL_STEPS} · ${prog.label}`;

    ctx.save();
    this._roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fill();
    ctx.strokeStyle = this._alpha(this._shade(this.colors.membrane, -20), 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#1d4a45';
    ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x + w / 2, y + 17);

    // Five segment bars.
    const pad = 20;
    const gap = 8;
    const segW = (w - pad * 2 - gap * (TOTAL_STEPS - 1)) / TOTAL_STEPS;
    const barY = y + 24;
    const barH = 12;
    for (let k = 0; k < TOTAL_STEPS; k++) {
      const sx = x + pad + k * (segW + gap);
      this._roundRect(ctx, sx, barY, segW, barH, 6);
      ctx.fillStyle = '#dcebe9';
      ctx.fill();

      let frac = 0;
      let fill = this.colors.membrane;
      if (prog) {
        if (k + 1 < prog.step) frac = 1;
        else if (k + 1 === prog.step) {
          frac = prog.frac;
          fill = this._state === 'done' ? this.colors.membrane : this.colors.protein;
        }
      }
      if (frac > 0) {
        ctx.save();
        this._roundRect(ctx, sx, barY, segW, barH, 6);
        ctx.clip();
        ctx.fillStyle = fill;
        ctx.fillRect(sx, barY, segW * clamp01(frac), barH);
        ctx.restore();
      }
      this._roundRect(ctx, sx, barY, segW, barH, 6);
      ctx.strokeStyle = this._alpha(this._shade(this.colors.membrane, -10), 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  _stepProgress() {
    if (this._state === 'done') {
      return { step: TOTAL_STEPS, frac: 1, label: STEP_LABELS[TOTAL_STEPS] };
    }
    if (this._state !== 'running' || !this._seg) return null;
    const s = this._steps[this._seg.step - 1];
    return {
      step: s.n,
      frac: clamp01((this._runT - s.start) / (s.end - s.start)),
      label: s.label,
    };
  }

  // ------------------------------------------------------------------- input

  _bindInput() {
    const canvas = this._canvasEl();
    if (!canvas || !canvas.addEventListener) return;

    this._onClick = (e) => {
      try {
        const pt = this._toCanvas(e, canvas);
        if (pt && this._hitButton(pt)) this._startRun();
      } catch (err) {
        this._report(err);
      }
    };
    this._onMove = (e) => {
      try {
        const pt = this._toCanvas(e, canvas);
        this._hoverBtn = !!(pt && this._hitButton(pt));
        if (canvas.style) {
          canvas.style.cursor =
            this._hoverBtn && this._state !== 'running' ? 'pointer' : 'default';
        }
      } catch (err) {
        this._report(err);
      }
    };
    this._onKey = (e) => {
      try {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._startRun();
        }
      } catch (err) {
        this._report(err);
      }
    };
    canvas.addEventListener('click', this._onClick);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('keydown', this._onKey);
    try {
      if (canvas.tabIndex == null || canvas.tabIndex < 0) canvas.tabIndex = 0;
    } catch (err) {
      this._report(err);
    }
  }

  _toCanvas(e, canvas) {
    if (!canvas.getBoundingClientRect) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * ProteinPathwayScene.WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * ProteinPathwayScene.HEIGHT,
    };
  }

  _hitButton(pt) {
    const b = this._btn;
    return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
  }

  /** Base-class hook when an organelle region is clicked. */
  _onOrganelleClick(id) {
    try {
      if (super._onOrganelleClick) super._onOrganelleClick(id);
    } catch (err) {
      this._report(err);
    }
    this._emit('protein-pathway:organelle', { id });
  }

  // ------------------------------------------------------------------ helpers

  _canvasEl() {
    if (this.canvas) return this.canvas;
    if (this._canvas) return this._canvas;
    try {
      return this.container ? this.container.querySelector('canvas') : null;
    } catch (err) {
      this._report(err);
      return null;
    }
  }

  _pointAlongPath(seg, t) {
    const pts = seg.path;
    if (pts.length === 1) return pts[0];
    const target = clamp01(t) * seg.totalLen;
    const lens = seg.cumLen;
    for (let i = 1; i < lens.length; i++) {
      if (target <= lens[i]) {
        const f = (target - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
        return {
          x: lerp(pts[i - 1].x, pts[i].x, f),
          y: lerp(pts[i - 1].y, pts[i].y, f),
        };
      }
    }
    return pts[pts.length - 1];
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, rr);
      return;
    }
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  _parseColor(col) {
    if (!col || typeof col !== 'string') return null;
    const s = col.trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      return m[1].split('').map((ch) => parseInt(ch + ch, 16));
    }
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
      return [
        parseInt(m[1].slice(0, 2), 16),
        parseInt(m[1].slice(2, 4), 16),
        parseInt(m[1].slice(4, 6), 16),
      ];
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
    if (m) {
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    return null;
  }

  /** Lighten (positive amt) or darken (negative amt) a color by a percent. */
  _shade(col, amt) {
    const rgb = this._parseColor(col);
    if (!rgb) return col;
    const p = Math.min(100, Math.max(-100, amt)) / 100;
    const target = p < 0 ? 0 : 255;
    const mix = Math.abs(p);
    const [r, g, b] = rgb.map((v) => Math.round(v + (target - v) * mix));
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** Same color with an alpha channel. */
  _alpha(col, a) {
    const rgb = this._parseColor(col);
    if (!rgb) return col;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(a)})`;
  }

  // ------------------------------------------------------- event / error bus

  _emit(event, payload) {
    try {
      const bus =
        typeof EventBus.getInstance === 'function' ? EventBus.getInstance() : EventBus;
      const fn = bus && (bus.emit || bus.publish || bus.dispatch || bus.fire);
      if (typeof fn === 'function') fn.call(bus, event, payload);
    } catch (err) {
      this._report(err);
    }
  }

  _report(err) {
    try {
      const rep =
        typeof ErrorReporter.getInstance === 'function'
          ? ErrorReporter.getInstance()
          : ErrorReporter;
      const fn =
        rep && (rep.report || rep.log || rep.handle || rep.error || rep.captureException);
      if (typeof fn === 'function') fn.call(rep, err, { scene: 'ProteinPathwayScene' });
    } catch (_) {
      // Error reporting must never throw.
    }
  }
}
