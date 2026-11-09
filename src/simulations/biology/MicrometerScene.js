import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * MicrometerScene — Part 3.4 "Estimating Cell Size with a Virtual
 * Micrometer".
 *
 * A simplified stand-in for the classic "stage micrometer vs. eyepiece
 * graticule" method: since the field of view of a microscope has a known,
 * fixed diameter at a given magnification, counting how many cells fit
 * across that diameter lets a student back-calculate the size of a single
 * cell — no graticule calibration required, which keeps the underlying idea
 * (and the arithmetic) accessible at Class 9 level.
 *
 * Two draggable/clickable measurement steps, then a self-checked
 * calculation:
 *   1. Drag a millimetre ruler down over the eyepiece field until it lines
 *      up with the centre — the field's diameter reads a clean 5 mm.
 *   2. Switch to the cell slide and count how many uniform cells span that
 *      same diameter (toggle cells on the canvas, or step through them with
 *      the accessible +/- controls).
 *   3. Convert 5 mm to micrometres and divide by the count — the scene
 *      checks the answer against the student's own count and gives
 *      targeted partial credit for the two classic mistakes (forgetting the
 *      unit conversion, or forgetting to divide).
 *
 * ── Deviations from the sprint spec (deliberate) ──────────────────────────
 * There is no `MicroscopeSimulation` base class in this codebase (only
 * planned, never built), so — matching the precedent set by
 * MicroscopeAssemblyScene and SlidePreparationScene — the circular eyepiece
 * viewport is hand-drawn directly on `CanvasSimulation`. The spec's
 * `equation-input` component is a lesson-content question plugin; this
 * scene is mounted standalone (via SimulationLoader, outside any lesson JSON),
 * so a small self-contained numeric check is used instead, matching the
 * self-contained style already established by PotatoOsmosisScene.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — hex values
 * from sim-theme.css are inlined in COLORS below.
 */

const W = 520;
const H = 610;
const FOV = { x: W / 2, y: 272, r: 198 };
const MM_ACROSS_FOV = 5;                       // the field diameter, by design, is exactly 5 mm
const PX_PER_MM = (FOV.r * 2) / MM_ACROSS_FOV;
const CELL_COUNT = 25;                         // -> 5000 / 25 = 200 um, a clean textbook answer
const RULER_START_Y = 84;                      // on-canvas, resting near the top of the eyepiece

const COLORS = {
  bgDeep:    '#070c1a',
  fieldLite: '#fdfaf1',
  fieldMid:  '#f3ecd8',
  fieldDark: '#e7dcb8',
  ruler:     'rgba(255,255,255,0.62)',
  rulerEdge: 'rgba(15,23,42,0.55)',
  ink:       '#0f172a',
  wall:      '#65873a',
  nucleus:   '#b91c3d',
  counted:   '#34d399',
  uncounted: 'rgba(15,23,42,0.18)',
  accent:    '#818cf8',
  ok:        '#34d399',
  warn:      '#fbbf24',
  err:       '#f87171',
  textMain:  '#f1f5f9',
  textMuted: '#94a3b8',
};

const GLOSSARY = {
  fov:      { term: 'Field of View',
    desc: 'The circular area you see through the eyepiece. At a fixed\nmagnification, its diameter is always the same known size.' },
  micron:   { term: 'Micrometre (µm)',
    desc: 'A unit of length equal to one-thousandth of a millimetre.\nMost plant and animal cells are 10-100 µm across.' },
  estimate: { term: 'Estimating Cell Size',
    desc: 'Fit a row of cells across the known field diameter, then\ndivide: field size ÷ number of cells = size of one cell.' },
  conversion: { term: 'Unit Conversion',
    desc: '1 millimetre (mm) = 1000 micrometres (µm). Always convert\nto the same unit before dividing.' },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class MicrometerScene extends CanvasSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static ARIA_LABEL =
    'Virtual micrometer. Drag a ruler to measure the field of view diameter, switch to a cell ' +
    'slide, count the cells across the diameter, then calculate the size of one cell.';

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.phase = 'ruler';   // ruler -> confirmed -> cells -> calc -> done
    this.rulerY = RULER_START_Y;
    this.dragging = false;
    this.aligned = false;
    this.counted = new Array(CELL_COUNT).fill(false);
    this._time = 0;
    this._fx = [];
    this._lastAnnounce = '';

    this._onDown = this._handleDown.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onUp   = this._handleUp.bind(this);

    this._rootEl = null; this._stageEl = null; this._statusEl = null;
    this._controlsEl = null; this._calcEl = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    this._buildDom();
    await super.setup();
    this._stageEl.appendChild(this._canvas);
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', MicrometerScene.ARIA_LABEL);
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:10px;cursor:default;';
    this._canvas.addEventListener('pointerdown', this._onDown);
    this._canvas.addEventListener('pointermove', this._onMove);
    this._canvas.addEventListener('pointerup', this._onUp);
    this._canvas.addEventListener('pointerleave', this._onUp);

    this._syncUI();
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onDown);
      this._canvas.removeEventListener('pointermove', this._onMove);
      this._canvas.removeEventListener('pointerup', this._onUp);
      this._canvas.removeEventListener('pointerleave', this._onUp);
    }
    if (this._rootEl) { this._rootEl.remove(); this._rootEl = null; }
    super.destroy();
  }

  // ── DOM shell ─────────────────────────────────────────────────────────────

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .mm-root{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:9px;
        font-family:Inter,system-ui,sans-serif;color:var(--sim-label,#e2e8f0);}
      .mm-status{padding:10px 13px;border-radius:9px;background:var(--sim-bg-surface,#111827);
        border:1px solid rgba(148,163,184,0.2);font:500 12.5px Inter,system-ui,sans-serif;
        color:var(--sim-label,#cbd5e1);min-height:20px;line-height:1.4;}
      .mm-stage{position:relative;width:100%;max-width:400px;margin:0 auto;}
      .mm-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;}
      .mm-btn{padding:9px 16px;border-radius:8px;border:none;cursor:pointer;font:600 13px Inter,system-ui,sans-serif;
        background:var(--sim-accent,#818cf8);color:#0b1120;transition:filter .15s,opacity .15s;}
      .mm-btn:hover:not(:disabled){filter:brightness(1.1);}
      .mm-btn:disabled{opacity:0.4;cursor:not-allowed;}
      .mm-btn.secondary{background:var(--sim-bg-surface,#1e293b);color:var(--sim-label,#e2e8f0);
        border:1.5px solid rgba(148,163,184,0.3);}
      .mm-count{font:700 13px 'JetBrains Mono',monospace;color:var(--sim-accent,#a5f3fc);min-width:30px;text-align:center;}
      .mm-calc{padding:14px 16px;border-radius:10px;background:var(--sim-bg-surface,#111827);
        border:1px solid rgba(129,140,248,0.35);display:none;flex-direction:column;gap:10px;}
      .mm-calc .mm-row{display:flex;justify-content:space-between;font:500 12.5px Inter,system-ui,sans-serif;
        color:var(--sim-label,#cbd5e1);}
      .mm-calc .mm-row strong{color:var(--sim-accent,#a5f3fc);font-family:'JetBrains Mono',monospace;}
      .mm-calc label{font:600 12.5px Inter,system-ui,sans-serif;}
      .mm-calc-input{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .mm-calc-input input{width:100px;padding:7px 9px;border-radius:6px;border:1.5px solid rgba(148,163,184,0.35);
        background:var(--sim-bg-cell,#0d1f3c);color:var(--sim-label,#f1f5f9);font:600 13px 'JetBrains Mono',monospace;}
      .mm-feedback{font:600 12.5px Inter,system-ui,sans-serif;padding:8px 10px;border-radius:7px;display:none;}
      .mm-feedback.ok{background:linear-gradient(rgba(52,211,153,0.15),rgba(52,211,153,0.15)), var(--sim-bg-surface,#111827);color:var(--sim-success,#6ee7b7);display:block;}
      .mm-feedback.partial{background:linear-gradient(rgba(251,191,36,0.15),rgba(251,191,36,0.15)), var(--sim-bg-surface,#111827);color:var(--sim-warning,#fde68a);display:block;}
      .mm-feedback.err{background:linear-gradient(rgba(248,113,113,0.15),rgba(248,113,113,0.15)), var(--sim-bg-surface,#111827);color:var(--sim-error,#fecaca);display:block;}
    `;

    const root = document.createElement('div');
    root.className = 'mm-root';
    root.appendChild(style);

    const status = document.createElement('div');
    status.className = 'mm-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const stage = document.createElement('div');
    stage.className = 'mm-stage';

    const controls = document.createElement('div');
    controls.className = 'mm-controls';

    const calc = document.createElement('div');
    calc.className = 'mm-calc';
    calc.innerHTML = `
      <div class="mm-row"><span>Field of view diameter</span><strong>5 mm = 5000 µm</strong></div>
      <div class="mm-row"><span>Cells counted across the diameter</span><strong data-role="count">-</strong></div>
      <label for="mm-answer">Size of one cell, in micrometres (µm):</label>
      <div class="mm-calc-input">
        <input type="number" id="mm-answer" inputmode="decimal" placeholder="?" />
        <span>µm</span>
        <button type="button" class="mm-btn" data-action="check">Check Answer</button>
        <button type="button" class="mm-btn secondary" data-action="recount">↻ Recount Cells</button>
      </div>
      <div class="mm-feedback" data-role="feedback"></div>
    `;
    calc.querySelector('[data-action="check"]').addEventListener('click', () => this._checkAnswer());
    calc.querySelector('#mm-answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._checkAnswer(); });
    calc.querySelector('[data-action="recount"]').addEventListener('click', () => this._recount());

    root.appendChild(status);
    root.appendChild(stage);
    root.appendChild(controls);
    root.appendChild(calc);
    this.container.appendChild(root);

    this._rootEl = root; this._stageEl = stage; this._statusEl = status;
    this._controlsEl = controls; this._calcEl = calc;
  }

  // ── Pointer interaction ──────────────────────────────────────────────────

  _toCanvas(e) {
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width) return null;
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }

  _handleDown(e) {
    const pt = this._toCanvas(e);
    if (!pt) return;
    if (this.phase === 'ruler') {
      if (Math.abs(pt.y - this.rulerY) < 30 && pt.x > 20 && pt.x < W - 20) {
        this.dragging = true;
        this._canvas.style.cursor = 'grabbing';
      }
      return;
    }
    if (this.phase === 'cells') {
      const idx = this._cellIndexAt(pt);
      if (idx !== null) this._toggleCell(idx);
    }
  }

  _handleMove(e) {
    const pt = this._toCanvas(e);
    if (!pt) return;
    if (this.phase === 'ruler') {
      if (this.dragging) {
        this.rulerY = Math.max(FOV.y - FOV.r - 100, Math.min(FOV.y + FOV.r + 100, pt.y));
        const wasAligned = this.aligned;
        this.aligned = Math.abs(this.rulerY - FOV.y) < 10;
        if (this.aligned) this.rulerY = FOV.y;
        if (this.aligned && !wasAligned) {
          this._burst(FOV.x, FOV.y);
          this._announce('Ruler aligned — field of view diameter reads 5 mm.');
        }
        this._syncUI();
      } else {
        const hover = Math.abs(pt.y - this.rulerY) < 30 && pt.x > 20 && pt.x < W - 20;
        this._canvas.style.cursor = hover ? 'grab' : 'default';
      }
      return;
    }
    if (this.phase === 'cells') {
      const idx = this._cellIndexAt(pt);
      this._canvas.style.cursor = idx !== null ? 'pointer' : 'default';
    }
  }

  _handleUp() {
    this.dragging = false;
    if (this._canvas) this._canvas.style.cursor = 'default';
  }

  _cellIndexAt(pt) {
    if (Math.abs(pt.y - FOV.y) > 26) return null;
    const cellW = (FOV.r * 2) / CELL_COUNT;
    const localX = pt.x - (FOV.x - FOV.r);
    if (localX < 0 || localX >= FOV.r * 2) return null;
    return Math.floor(localX / cellW);
  }

  // ── State transitions ────────────────────────────────────────────────────

  _confirmReading() {
    if (!this.aligned || this.phase !== 'ruler') return;
    this.phase = 'confirmed';
    this._announce('Reading confirmed: the field of view is 5 mm across. Now switch to the cell slide.');
    this._syncUI();
  }

  _switchToCells() {
    if (this.phase !== 'confirmed') return;
    this.phase = 'cells';
    this._announce('Cell slide loaded. Click cells across the centre line to count them, or use the counter buttons.');
    this._syncUI();
  }

  _toggleCell(idx) {
    this.counted[idx] = !this.counted[idx];
    this._burst(FOV.x - FOV.r + (idx + 0.5) * (FOV.r * 2 / CELL_COUNT), FOV.y);
    this._syncUI();
  }

  _markNext() {
    const idx = this.counted.indexOf(false);
    if (idx === -1) return;
    this._toggleCell(idx);
  }

  _unmarkLast() {
    for (let i = this.counted.length - 1; i >= 0; i--) {
      if (this.counted[i]) { this._toggleCell(i); return; }
    }
  }

  _doneCounting() {
    const n = this.counted.filter(Boolean).length;
    if (n < 1) { this._announce('Count at least one cell before continuing.'); return; }
    this._countedN = n;
    this.phase = 'calc';
    this._announce(`${n} cell${n === 1 ? '' : 's'} counted. Now calculate the size of one cell.`);
    this._syncUI();
  }

  _recount() {
    this.phase = 'cells';
    const feedback = this._calcEl.querySelector('[data-role="feedback"]');
    feedback.className = 'mm-feedback';
    feedback.textContent = '';
    this._syncUI();
    this._announce('Adjust your count, then continue when ready.');
  }

  _checkAnswer() {
    const input = this._calcEl.querySelector('#mm-answer');
    const feedback = this._calcEl.querySelector('[data-role="feedback"]');
    const value = parseFloat(input.value);
    if (!Number.isFinite(value)) {
      feedback.className = 'mm-feedback err';
      feedback.textContent = 'Enter a number first.';
      return;
    }
    const n = this._countedN || 1;
    const correct = 5000 / n;
    const diffPct = Math.abs(value - correct) / correct;
    const mmOnly = 5 / n;

    if (diffPct < 0.03) {
      feedback.className = 'mm-feedback ok';
      feedback.textContent =
        `🎉 Correct! 5 mm = 5000 µm. 5000 µm ÷ ${n} cells = ${correct.toFixed(0)} µm per cell.`;
      this.phase = 'done';
      this._announce(`Correct — one cell is about ${correct.toFixed(0)} micrometres across.`);
      this._syncUI();
      return;
    }
    if (Math.abs(value - mmOnly) / Math.max(mmOnly, 0.001) < 0.05) {
      feedback.className = 'mm-feedback partial';
      feedback.textContent =
        `Close! Your division is right (5 mm ÷ ${n} = ${mmOnly.toFixed(2)} mm), but you forgot to ` +
        `convert millimetres to micrometres. Remember: 1 mm = 1000 µm, so the answer is ${correct.toFixed(0)} µm.`;
      return;
    }
    if (Math.abs(value - 5000) < 1) {
      feedback.className = 'mm-feedback partial';
      feedback.textContent =
        `You converted correctly (5 mm = 5000 µm), but forgot to divide by the number of cells ` +
        `(${n}). 5000 µm ÷ ${n} = ${correct.toFixed(0)} µm.`;
      return;
    }
    if (diffPct < 0.25) {
      feedback.className = 'mm-feedback partial';
      feedback.textContent = `Close, but check your arithmetic: 5000 µm ÷ ${n} cells = ${correct.toFixed(0)} µm.`;
      return;
    }
    feedback.className = 'mm-feedback err';
    feedback.textContent =
      `Not quite. Try: (field diameter in µm) ÷ (cells counted) = 5000 µm ÷ ${n} = ?`;
  }

  _reset() {
    this.phase = 'ruler';
    this.rulerY = RULER_START_Y;
    this.aligned = false;
    this.dragging = false;
    this.counted = new Array(CELL_COUNT).fill(false);
    this._countedN = 0;
    const feedback = this._calcEl.querySelector('[data-role="feedback"]');
    feedback.className = 'mm-feedback';
    feedback.textContent = '';
    this._calcEl.querySelector('#mm-answer').value = '';
    this._syncUI();
    this._announce('Drag the ruler down to align it across the centre of the field of view.');
  }

  _burst(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this._fx.push({
        x, y, vx: Math.cos(a) * (20 + Math.random() * 40), vy: Math.sin(a) * (20 + Math.random() * 40),
        life: 0.5, max: 0.5, r: 1.2 + Math.random() * 1.5, color: COLORS.accent,
      });
    }
  }

  _announce(msg) {
    if (!this._statusEl || msg === this._lastAnnounce) return;
    this._lastAnnounce = msg;
    this._statusEl.textContent = msg;
  }

  // ── UI sync ──────────────────────────────────────────────────────────────

  _syncUI() {
    const c = this._controlsEl;
    c.innerHTML = '';

    if (this.phase === 'ruler') {
      const btn = document.createElement('button');
      btn.className = 'mm-btn';
      btn.textContent = this.aligned ? '✅ Confirm Reading — 5 mm' : '↕ Drag the ruler to align it first';
      btn.disabled = !this.aligned;
      btn.addEventListener('click', () => this._confirmReading());
      c.appendChild(btn);
      if (!this._lastAnnounce) this._announce('Drag the ruler down to align it across the centre of the field of view.');
    } else if (this.phase === 'confirmed') {
      const btn = document.createElement('button');
      btn.className = 'mm-btn';
      btn.textContent = '🔬 Switch to Cell Slide';
      btn.addEventListener('click', () => this._switchToCells());
      c.appendChild(btn);
    } else if (this.phase === 'cells') {
      const minus = document.createElement('button');
      minus.className = 'mm-btn secondary';
      minus.textContent = '➖';
      minus.setAttribute('aria-label', 'Unmark last counted cell');
      minus.addEventListener('click', () => this._unmarkLast());

      const countEl = document.createElement('span');
      countEl.className = 'mm-count';
      countEl.textContent = String(this.counted.filter(Boolean).length);

      const plus = document.createElement('button');
      plus.className = 'mm-btn secondary';
      plus.textContent = '➕ Count a Cell';
      plus.addEventListener('click', () => this._markNext());

      const done = document.createElement('button');
      done.className = 'mm-btn';
      done.textContent = '✅ Done Counting';
      done.disabled = this.counted.filter(Boolean).length < 1;
      done.addEventListener('click', () => this._doneCounting());

      c.appendChild(minus); c.appendChild(countEl); c.appendChild(plus); c.appendChild(done);
    }

    if (this.phase !== 'ruler') {
      const reset = document.createElement('button');
      reset.className = 'mm-btn secondary';
      reset.textContent = '↻ Start Over';
      reset.addEventListener('click', () => this._reset());
      c.appendChild(reset);
    }

    this._calcEl.style.display = (this.phase === 'calc' || this.phase === 'done') ? 'flex' : 'none';
    if (this.phase === 'calc' || this.phase === 'done') {
      this._calcEl.querySelector('[data-role="count"]').textContent = String(this._countedN || 0);
    }
  }

  // ── Frame update ──────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;
    for (const p of this._fx) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    if (this._fx.length) this._fx = this._fx.filter((p) => p.life > 0);

    ctx.clearRect(0, 0, W, H);
    this._drawBackdrop(ctx);
    this._drawEyepiece(ctx);
    this._drawFx(ctx);
    this._drawGlossaryCard(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _drawBackdrop(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e1a33');
    g.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.font = '700 13px Inter, system-ui';
    ctx.fillStyle = '#7dd3fc';
    ctx.textAlign = 'left';
    ctx.fillText('🔬  VIRTUAL MICROMETER', 16, 26);
    ctx.restore();
  }

  _drawEyepiece(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(FOV.x, FOV.y, FOV.r + 8, 0, Math.PI * 2);
    ctx.fillStyle = '#04070f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(FOV.x, FOV.y, FOV.r, 0, Math.PI * 2);
    ctx.clip();
    const bright = ctx.createRadialGradient(FOV.x, FOV.y, 4, FOV.x, FOV.y, FOV.r);
    bright.addColorStop(0, COLORS.fieldLite);
    bright.addColorStop(0.72, COLORS.fieldMid);
    bright.addColorStop(1, COLORS.fieldDark);
    ctx.fillStyle = bright;
    ctx.fillRect(FOV.x - FOV.r, FOV.y - FOV.r, FOV.r * 2, FOV.r * 2);

    if (this.phase === 'ruler' || this.phase === 'confirmed') {
      this._drawRuler(ctx);
    } else {
      this._drawCellRow(ctx);
    }
    ctx.restore();
    ctx.restore();

    // Once past the ruler phase the 5 mm reading is locked in and always shown as confirmed.
    if (this.phase !== 'ruler' || this.aligned) this._drawDiameterBracket(ctx, true);
  }

  _drawRuler(ctx) {
    const bandHalf = 24;
    const y = this.rulerY;
    ctx.save();
    ctx.fillStyle = COLORS.ruler;
    ctx.fillRect(0, y - bandHalf, W, bandHalf * 2);
    ctx.strokeStyle = COLORS.rulerEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y - bandHalf); ctx.lineTo(W, y - bandHalf); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y + bandHalf); ctx.lineTo(W, y + bandHalf); ctx.stroke();

    const x0 = FOV.x - PX_PER_MM * 6;
    ctx.strokeStyle = COLORS.ink;
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 10px Inter, system-ui';
    ctx.textAlign = 'center';
    for (let mm = 0; mm <= 12; mm++) {
      const x = x0 + mm * PX_PER_MM;
      if (x < -5 || x > W + 5) continue;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y - bandHalf + 4); ctx.lineTo(x, y - bandHalf + 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + bandHalf - 4); ctx.lineTo(x, y + bandHalf - 14); ctx.stroke();
      ctx.fillText(String(mm), x, y - bandHalf - 4);
      for (let tenth = 1; tenth < 10; tenth++) {
        const tx = x + tenth * PX_PER_MM / 10;
        if (tx > W) break;
        const tall = tenth === 5 ? 8 : 5;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(tx, y - bandHalf + 4); ctx.lineTo(tx, y - bandHalf + 4 + tall); ctx.stroke();
      }
    }
    // Grip handles hint the ruler is draggable.
    ctx.fillStyle = 'rgba(15,23,42,0.5)';
    for (const gx of [26, W - 26]) {
      ctx.beginPath();
      ctx.roundRect(gx - 9, y - 8, 18, 16, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCellRow(ctx) {
    const cellW = (FOV.r * 2) / CELL_COUNT;
    const startX = FOV.x - FOV.r;
    ctx.save();
    ctx.strokeStyle = 'rgba(15,23,42,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(FOV.x - FOV.r, FOV.y); ctx.lineTo(FOV.x + FOV.r, FOV.y); ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < CELL_COUNT; i++) {
      const cx = startX + (i + 0.5) * cellW;
      const rowOffset = Math.sin(i * 1.7) * 14; // gentle organic row jitter
      const cy = FOV.y + rowOffset * 0.3;
      const on = this.counted[i];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.roundRect(-cellW / 2 + 1, -22, cellW - 2, 44, 3);
      ctx.fillStyle = on ? 'rgba(52,211,153,0.28)' : 'rgba(101,135,58,0.10)';
      ctx.fill();
      ctx.strokeStyle = COLORS.wall;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // nucleus
      ctx.beginPath();
      ctx.ellipse(0, -3 + (i % 3 - 1) * 5, cellW * 0.18, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.nucleus;
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (on) {
        ctx.fillStyle = COLORS.counted;
        ctx.font = '700 11px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('✓', 0, 32);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  _drawDiameterBracket(ctx, active) {
    const y = FOV.y + FOV.r + 26;
    const x1 = FOV.x - FOV.r, x2 = FOV.x + FOV.r;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.35;
    ctx.strokeStyle = active ? COLORS.ok : COLORS.textMuted;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y); ctx.lineTo(x2, y); ctx.lineTo(x2, y - 6);
    ctx.stroke();
    ctx.fillStyle = active ? COLORS.ok : COLORS.textMuted;
    ctx.font = '700 12px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(active ? 'field diameter ≈ 5 mm (5000 µm)' : 'field diameter', FOV.x, y + 18);
    ctx.restore();
  }

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
    const keys = Object.keys(GLOSSARY);
    let idx = Math.floor(this._time / 6.5) % keys.length;
    if (isNaN(idx) || idx < 0) idx = 0;
    const item = GLOSSARY[keys[idx]];
    const x = 14, y = H - 12;

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
    ctx.fillStyle = 'rgba(9,15,30,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59,130,246,0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11.5px Inter, system-ui';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`📖 ${item.term}`, x + padX, y - h + padY);
    ctx.font = '500 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    lines.forEach((l, i) => ctx.fillText(l.trim(), x + padX, y - h + padY + 21 + i * lineH));

    ctx.beginPath();
    ctx.roundRect(x + 2, y - 4, (w - 4) * ((this._time % 6.5) / 6.5), 2, 1);
    ctx.fillStyle = 'rgba(59,130,246,0.6)';
    ctx.fill();
    ctx.restore();
  }
}
