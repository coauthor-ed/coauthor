import { CanvasSimulation } from './CanvasSimulation.js';
import { SimDraw } from './SimDrawUtils.js';
import { readSimColors } from './SimTheme.js';

const TOKEN_MAP = {
  bgCell:  ['--sim-bg-cell', '#0d1f3c'],
  labelBg: ['--sim-label-bg', '#1e293bcc'],
  label:   ['--sim-label', '#e2e8f0'],
};

/**
 * OrganelleZoomSimulation — base class for zoomed-in, single-organelle scenes
 * (Mitochondria Part 5.2, Chloroplast Part 5.3).
 *
 * Provides shared machinery on top of CanvasSimulation:
 *  - `peelProgress` (0..1): peel-back-the-outer-membrane reveal, driven by a
 *    slider in the plugin shell / showcase.
 *  - `inputSlots`: droppable zones on the canvas that accept palette molecules.
 *  - A DOM molecule palette (draggable chips; click/Enter = keyboard place,
 *    per the "controls live in DOM, not canvas" accessibility rule).
 *  - `outputParticles`: short-lived ejected products (ATP packets, O₂ bubbles…).
 *  - An aria-live status region for screen-reader announcements.
 *
 * Subclasses implement:
 *  - drawOuterMembrane(ctx, peelProgress)
 *  - drawInnerMembrane(ctx, peelProgress)
 *  - _drawInterior(ctx, dt)      — cristae, thylakoids, stroma contents…
 *  - _onInputDrop(molecule, slot) — reaction logic after a molecule lands
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — colors are
 * resolved once via readSimColors() (see SimTheme.js) and cached on
 * `this.colors`, re-resolved on every theme change via `_reloadColors()`.
 * Subclasses that add their own organelle-specific colors should follow the
 * same pattern rather than hardcoding hex (see sim-theme.css's migration
 * checklist comment).
 */
export class OrganelleZoomSimulation extends CanvasSimulation {
  static WIDTH = 600;
  static HEIGHT = 450;
  /** Screen-reader description of the canvas. Override in subclass. */
  static ARIA_LABEL = 'Interactive organelle simulation';

  /**
   * Chapter/story director data (see "── Chapter/story director ──" below).
   * Chapter-based subclasses (Mitochondria, Chloroplast, Ribosome — Golgi is
   * NOT chapter-based and leaves these at their defaults) override these:
   *   CHAPTERS  — [{ id, title }, ...] in the same order as the subclass's
   *               own local S_* numeric enum (index into this array).
   *   GLOSSARY  — [{ t, d }, ...] terms shown in the auto-rotating panel.
   *   GLOSS     — seconds each glossary term is shown before rotating.
   */
  static CHAPTERS = [];
  static GLOSSARY = [];
  static GLOSS = 4;

  constructor(container, config) {
    super(container, config);
    this.layers = [];            // membrane layers, innermost last (subclass-defined)
    this.peelProgress = 0;       // 0..1 controlled by slider
    this.inputSlots = [];        // droppable zones for molecules
    this.outputParticles = [];   // ejected product particles
    this.palette = [];           // draggable molecule descriptors
    this._time = 0;
    this._paletteEl = null;
    this._liveRegion = null;
    this._lastAnnouncement = '';
    this._onDragOver = this._handleDragOver.bind(this);
    this._onDrop = this._handleDrop.bind(this);
    this.colors = null;

    // Chapter/story director state (see below). Harmless no-ops for
    // non-chapter-based subclasses (e.g. Golgi) that never call _goChapter().
    this._chapter = 0;           // index into static CHAPTERS
    this._t = 0;                 // chapter-local elapsed seconds (resets each chapter)
    this._card = 0;              // chapter title-card reveal timer, counts down from 0.7
    this._fade = 0;              // black cross-fade overlay alpha 0..1
    this._fadeDir = 0;           // 0 none, -1 fading out, 1 fading in
    this._pendingChapter = null; // chapter index to switch to once fade-out completes
  }

  async setup() {
    await super.setup();   // creates + appends the canvas
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._canvas.addEventListener('dragover', this._onDragOver);
    this._canvas.addEventListener('drop', this._onDrop);
    this._buildLiveRegion();
    this._reloadColors();
  }

  _reloadColors() {
    this.colors = readSimColors(this.container, TOKEN_MAP);
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('dragover', this._onDragOver);
      this._canvas.removeEventListener('drop', this._onDrop);
    }
    if (this._paletteEl) { this._paletteEl.remove(); this._paletteEl = null; }
    if (this._liveRegion) { this._liveRegion.remove(); this._liveRegion = null; }
    this.outputParticles = [];
    super.destroy();   // removes canvas
  }

  // ── Peel ──────────────────────────────────────────────────────────────────

  setPeelProgress(value) {
    const v = Number(value);
    this.peelProgress = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  // ── Input slots ───────────────────────────────────────────────────────────

  addInputSlot(slot) {
    this.inputSlots.push({
      x: 0, y: 0, r: 26, accepts: [], label: '', filled: null,
      ...slot,
    });
  }

  clearSlots() {
    for (const s of this.inputSlots) s.filled = null;
    this._refreshPaletteChips();
  }

  drawInputSlots(ctx) {
    for (const s of this.inputSlots) {
      const molecule = this.palette.find(m => m.id === (s.filled || s.accepts[0]));
      const color = molecule ? molecule.color : '#94a3b8';

      if (s.filled) {
        SimDraw.drawMolecule(ctx, s.x, s.y, s.r * 0.62, molecule.shortLabel || molecule.label, color);
      } else {
        SimDraw.drawPulse(ctx, s.x, s.y, s.r, color, this._time * 0.7);
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      if (s.label) this._drawLabelPill(ctx, s.label, s.x, s.y - s.r - 8);
    }
  }

  // ── Molecule palette (DOM, accessible) ────────────────────────────────────

  setPalette(molecules) {
    this.palette = molecules.map(m => ({ ...m }));
    this._rebuildPalette();
  }

  _rebuildPalette() {
    if (this._paletteEl) this._paletteEl.remove();
    this._paletteEl = document.createElement('div');
    this._paletteEl.className = 'sim-molecule-palette';
    this._paletteEl.style.cssText =
      'display:flex;gap:10px;justify-content:center;padding:10px 4px 2px;flex-wrap:wrap;';

    for (const m of this.palette) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sim-molecule-chip';
      chip.draggable = true;
      chip.dataset.molecule = m.id;
      chip.style.cssText =
        `display:inline-flex;align-items:center;gap:7px;padding:7px 14px;` +
        `border-radius:20px;border:1.5px dashed ${m.color};` +
        `background:var(--sim-bg-surface,#111827);color:var(--sim-label,#e2e8f0);` +
        `font:600 12px Inter,system-ui,sans-serif;cursor:grab;`;
      chip.setAttribute('aria-label',
        `${m.label}. Drag onto the highlighted slot on the organelle, or press Enter to place it.`);

      const dot = document.createElement('span');
      dot.style.cssText =
        `width:12px;height:12px;border-radius:50%;background:${m.color};display:inline-block;`;
      chip.appendChild(dot);

      const text = document.createElement('span');
      text.textContent = m.label;
      chip.appendChild(text);

      chip.addEventListener('click', () => this._placeMolecule(m.id));
      chip.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', m.id);
          e.dataTransfer.effectAllowed = 'move';
        }
      });
      this._paletteEl.appendChild(chip);
    }
    this.container.appendChild(this._paletteEl);
    this._refreshPaletteChips();
  }

  _refreshPaletteChips() {
    if (!this._paletteEl) return;
    for (const chip of this._paletteEl.querySelectorAll('button')) {
      const id = chip.dataset.molecule;
      const hasFreeSlot = this.inputSlots.some(s => !s.filled && s.accepts.includes(id));
      const enabled = hasFreeSlot && this._canPlaceMolecule(id);
      chip.disabled = !enabled;
      chip.style.opacity = enabled ? '1' : '0.4';
    }
  }

  _handleDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  _handleDrop(e) {
    e.preventDefault();
    const id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    if (!id) return;
    this._placeMolecule(id, this._toCanvasCoords(e));
  }

  _toCanvasCoords(e) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width / (rect.width || this._canvas.width);
    const scaleY = this._canvas.height / (rect.height || this._canvas.height);
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  /**
   * Place a palette molecule into a matching free slot.
   * @param {string} moleculeId
   * @param {{x:number,y:number}|null} point  canvas coords when dropped via mouse;
   *                                          null for click/keyboard auto-place.
   * @returns {boolean} whether the placement succeeded
   */
  _placeMolecule(moleculeId, point = null) {
    if (!this._canPlaceMolecule(moleculeId)) {
      this._announce('Wait for the current reaction to finish.');
      return false;
    }
    const free = this.inputSlots.filter(s => !s.filled && s.accepts.includes(moleculeId));
    if (!free.length) {
      this._announce(`No free slot for ${moleculeId}.`);
      return false;
    }
    let slot = free[0];
    if (point) {
      let bestDist = Infinity;
      for (const s of free) {
        const d = Math.hypot(s.x - point.x, s.y - point.y);
        if (d < bestDist) { bestDist = d; slot = s; }
      }
      if (bestDist > slot.r + 24) {
        this._announce('Drop it onto the highlighted slot.');
        return false;
      }
    }
    slot.filled = moleculeId;
    const molecule = this.palette.find(m => m.id === moleculeId)
      || { id: moleculeId, label: moleculeId, color: '#ffffff' };
    this._refreshPaletteChips();
    this._onInputDrop(molecule, slot);
    return true;
  }

  // ── Output particles ──────────────────────────────────────────────────────

  spawnOutputParticle(props) {
    const p = {
      x: 0, y: 0, vx: 0, vy: -40, r: 8,
      color: '#34d399', label: '', life: 2.5,
      ...props,
    };
    p.maxLife = p.life;
    this.outputParticles.push(p);
  }

  _updateOutputParticles(dt) {
    for (const p of this.outputParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.outputParticles = this.outputParticles.filter(p => p.life > 0 && p.y > -40);
  }

  drawOutputParticles(ctx) {
    for (const p of this.outputParticles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      SimDraw.drawGlow(ctx, p.x, p.y, p.r, p.color, 0.35 * alpha);
      SimDraw.drawMolecule(ctx, p.x, p.y, p.r, p.label, p.color);
      ctx.restore();
    }
  }

  // ── Accessibility ─────────────────────────────────────────────────────────

  _buildLiveRegion() {
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('role', 'status');
    this._liveRegion.setAttribute('aria-live', 'polite');
    // Visually hidden but available to screen readers
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

  // ── Shared drawing helpers ────────────────────────────────────────────────

  /** Capsule (rod) outline path centred at cx,cy. */
  _capsulePath(ctx, cx, cy, w, h) {
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + r, cy - h / 2);
    ctx.lineTo(cx + w / 2 - r, cy - h / 2);
    ctx.arc(cx + w / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx - w / 2 + r, cy + h / 2);
    ctx.arc(cx - w / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  }

  /**
   * Label pill with explicit hex colours (canvas can't resolve CSS var()).
   * Mirrors SimDraw.drawLabel's typography from the design doc.
   */
  _drawLabelPill(ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.font = '600 11px Inter, system-ui';
    const paddingX = 8;
    const h = 22;
    const w = ctx.measureText(text).width + paddingX * 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, h / 2);
    ctx.fillStyle = opts.bg || this.colors?.labelBg || '#1e293bcc';
    ctx.fill();
    ctx.fillStyle = opts.color || this.colors?.label || '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2);
    ctx.restore();
  }

  // ── Chapter/story director ────────────────────────────────────────────────
  // Shared machinery for the story-style "chapter" scenes (Mitochondria,
  // Chloroplast, Ribosome). Each subclass keeps its OWN `_advance()` (the
  // scene-specific "what happens when the student presses Next" business
  // logic, gated on the subclass's local S_* state) and calls the generic
  // `_goChapter()`/`_fadeToChapter()` below to actually move between
  // chapters. The subclass must call `_advanceChapter(dt)` once per frame,
  // early in its own `_update(dt)`, to drive the card/cross-fade timers.

  /** Jump straight to a chapter (no cross-fade) — resets the chapter-local clock. */
  _goChapter(index) {
    this._chapter = index;
    this._t = 0;
    this._card = 0.7;
    this._onEnterChapter(index);
    if (this.requestUiUpdate) this.requestUiUpdate();
  }

  /** Begin a black cross-fade transition into `index` (see _advanceChapter). */
  _fadeToChapter(index) {
    if (this._fadeDir !== 0) return;   // already transitioning
    this._pendingChapter = index;
    this._fadeDir = -1;                // fade current chapter out
  }

  /**
   * Advances the chapter-local clock, the title-card reveal timer, and the
   * cross-fade overlay. Call once per frame from the subclass's `_update(dt)`.
   */
  _advanceChapter(dt) {
    this._t += dt;
    if (this._card > 0) this._card = Math.max(0, this._card - dt / 0.5);
    if (this._fadeDir === -1) {
      this._fade = Math.min(1, this._fade + dt / 0.45);
      if (this._fade >= 1 && this._pendingChapter != null) {
        const next = this._pendingChapter;
        this._pendingChapter = null;
        this._goChapter(next);
        this._card = 0;               // use the cross-fade instead of the chapter card
        this._fadeDir = 1;
      }
    } else if (this._fadeDir === 1) {
      this._fade = Math.max(0, this._fade - dt / 0.45);
      if (this._fade <= 0) this._fadeDir = 0;
    }
  }

  /**
   * One-time per-chapter setup hook, called after `_chapter` switches (both
   * via `_goChapter()` directly and via a completed `_fadeToChapter()`).
   * Default: refresh the molecule-palette chip visibility, matching the
   * common case (most story scenes only show the palette during one
   * chapter). Override for scene-specific per-chapter setup — e.g. Ribosome
   * only wants this on entering its POSTLUDE chapter, not every chapter.
   */
  _onEnterChapter(index) { // eslint-disable-line no-unused-vars
    this._refreshPaletteChips();
  }

  /** Full-screen chapter title/number card, shown briefly after `_goChapter()`. */
  _cardArt(ctx) {
    const W = this.constructor.WIDTH, H = this.constructor.HEIGHT;
    const CH = this.constructor.CHAPTERS;
    const entry = CH[this._chapter] || {};
    const accent = this.colors?.accent || '#818cf8';
    const n = this._chapter + 1;
    ctx.fillStyle = this.colors?.card || '#0e1430';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent;
    ctx.font = '700 64px Inter,system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), W / 2, 180);
    ctx.fillStyle = this.colors?.label || '#eef2f7';
    ctx.font = '600 22px Inter,system-ui';
    ctx.fillText(entry.title || '', W / 2, 250);
    ctx.fillStyle = this.colors?.muted || '#9aa7b8';
    ctx.font = '500 12px Inter,system-ui';
    ctx.fillText('Chapter ' + n + ' of ' + CH.length, W / 2, 290);
    ctx.fillStyle = accent;
    ctx.fillRect(W / 2 - 60, 320, 120, 3);
  }

  /** Auto-rotating glossary term panel (bottom-left), cycling every `static GLOSS` seconds. */
  _glossary(ctx) {
    const GL = this.constructor.GLOSSARY;
    if (!GL || !GL.length) return;
    const secs = this.constructor.GLOSS || 4;
    const n = GL.length;
    const idx = ((Math.floor(this._time / secs) % n) + n) % n;
    const e = GL[idx];
    const prog = (this._time % secs) / secs;
    const x = 10, y = 355, w = 250, h = 64, r = 10;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = 'rgba(16,24,42,0.6)';
    ctx.fill();
    ctx.strokeStyle = this.colors?.line || '#182026';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = this.colors?.label || '#eef2f7';
    ctx.font = '700 11px Inter,system-ui';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(e.t, x + 12, y + 12);
    ctx.fillStyle = this.colors?.muted || '#9aa7b8';
    ctx.font = '500 11px Inter,system-ui';
    ctx.fillText(e.d, x + 12, y + 30, w - 24);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = this.colors?.accent || '#818cf8';
    ctx.fillRect(x + 12, y + h - 5, (w - 24) * prog, 2);
    ctx.restore();
  }

  // ── Frame orchestration ───────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;
    ctx.clearRect(0, 0, W, H);
    this._update(dt);
    this._drawBackground(ctx);
    this.drawInnerMembrane(ctx, this.peelProgress);
    this._drawInterior(ctx, dt);
    this.drawOuterMembrane(ctx, this.peelProgress);
    this.drawInputSlots(ctx);
    this._updateOutputParticles(dt);
    this.drawOutputParticles(ctx);
    this._drawOverlay(ctx, dt);
  }

  _drawInitialFrame(ctx) {
    this._tick(ctx, 0);
  }

  // ── Subclass hooks ────────────────────────────────────────────────────────

  /** State advance (timers, spawning, motion). dt in seconds. */
  _update(dt) {} // eslint-disable-line no-unused-vars

  _drawBackground(ctx) {
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;
    ctx.fillStyle = this.colors?.bgCell || '#0d1f3c';
    ctx.fillRect(0, 0, W, H);
  }

  drawOuterMembrane(ctx, progress) {} // eslint-disable-line no-unused-vars
  drawInnerMembrane(ctx, progress) {} // eslint-disable-line no-unused-vars
  _drawInterior(ctx, dt) {}           // eslint-disable-line no-unused-vars
  _drawOverlay(ctx, dt) {}            // eslint-disable-line no-unused-vars

  /** Gate placement (e.g. while a reaction is running). */
  _canPlaceMolecule(moleculeId) { return true; } // eslint-disable-line no-unused-vars

  /** Reaction logic after a molecule lands in a slot. */
  _onInputDrop(molecule, slot) {}     // eslint-disable-line no-unused-vars
}
