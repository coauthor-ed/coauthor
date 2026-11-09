import { ParticleSimulation } from '../base/ParticleSimulation.js';

/**
 * DiffusionScene — Part 4.5 "Diffusion".
 *
 * The NCERT example, made visible: a bottle of perfume is opened in the corner
 * of a room and a few seconds later somebody across the room can smell it.
 *
 * Perfume molecules start as a dense cloud at the bottle — the region of high
 * concentration — and random-walk outward, colliding with the air molecules
 * drawn faintly behind them. A heat-map overlay shows the concentration field
 * flooding out from the corner, and a live graph tracks the concentration near
 * the bottle against the concentration on the far side of the room: two lines
 * that start far apart and meet. That meeting point is the lesson — at
 * equilibrium the molecules have *not* stopped moving, there are simply as many
 * arriving as leaving.
 *
 * A temperature slider makes the point that diffusion is faster when it is
 * warmer, because the molecules carry more kinetic energy. Nothing in the scene
 * requires energy input: diffusion is a passive process.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — hex values from
 * sim-theme.css are inlined in COLORS below.
 */

const W = 620;
const H = 470;

/** Walls of the room, in canvas coordinates. */
const ROOM = { x0: 22, y0: 56, x1: 598, y1: 368 };
const ROOM_W = ROOM.x1 - ROOM.x0;
const ROOM_H = ROOM.y1 - ROOM.y0;

/** Perfume bottle nozzle — the source of the dense cloud. */
const SRC = { x: 116, y: 292 };
/** Nose of the person across the room. */
const NOSE = { x: 516, y: 302 };

const N_PERFUME = 340;
const N_AIR     = 110;

/** Heat-map grid. Rendered tiny, then scaled up smoothly. */
const GX = 36;
const GY = 21;

const COLORS = {
  bgDeep:   '#070c1a',
  wall:     '#132741',
  wallLite: '#1c3a5e',
  floor:    '#0e1c30',
  perfume:  '#f472b6',
  air:      '#94a3b8',
  textMain: '#f1f5f9',
  textMuted:'#94a3b8',
  accent:   '#38bdf8',
  ok:       '#34d399',
  warn:     '#fbbf24',
};

const GLOSSARY = [
  { term: 'Diffusion',
    desc: 'The net movement of particles from where they are crowded\n(high concentration) to where they are sparse (low concentration).' },
  { term: 'Concentration Gradient',
    desc: 'The difference in concentration between two places.\nThe steeper it is, the faster the net movement.' },
  { term: 'Brownian Motion',
    desc: 'Perfume molecules zig-zag because air molecules keep\nknocking into them. They never travel in a straight line.' },
  { term: 'Passive Process',
    desc: 'Diffusion needs no energy from the cell or the room.\nIt happens by itself, driven only by random motion.' },
  { term: 'Dynamic Equilibrium',
    desc: 'When the concentration is even everywhere, molecules keep\nmoving — but as many arrive as leave, so nothing changes.' },
  { term: 'Temperature & Diffusion',
    desc: 'Warmer molecules move faster, so they spread faster.\nPerfume fills a warm room quicker than a cold one.' },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

export class DiffusionScene extends ParticleSimulation {
  static WIDTH  = W;
  static HEIGHT = H;
  static BOUNDARY = 'bounce';   // unused — enforceBoundary is overridden

  static ARIA_LABEL =
    'Diffusion in a room. A bottle of perfume is opened in the left corner. Its molecules ' +
    'random-walk outward from the crowded corner until they are spread evenly through the room, ' +
    'and somebody on the far side can smell them.';

  static CONTROLS = [
    { type: 'button', id: 'release', label: '💨 Open the Bottle' },
    { type: 'slider', id: 'temperature', label: 'Temperature:', min: 0, max: 100, step: 1, value: 50 },
    { type: 'select', id: 'view', label: 'Show:', options: [
      { value: 'both',  label: 'Molecules + heat map' },
      { value: 'mol',   label: 'Molecules only' },
      { value: 'heat',  label: 'Heat map only' },
    ] },
    { type: 'button', id: 'reset', label: '↻ Reset' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.temperature = 0.5;      // 0..1, drives molecular speed
    this.view        = 'both';
    this._released   = false;
    this._time       = 0;
    this._clock      = 0;        // seconds since the bottle was opened
    this._smeltAt    = null;     // seconds at which the nose first detected it
    this._equalAt    = null;
    this._evenFor    = 0;

    this._grid    = new Float32Array(GX * GY);
    this._heatCv  = null;
    this._heatCtx = null;

    this._samples = [];          // { near, far } history for the graph
    this._sampleT = 0;

    this._glossIdx = 0;
    this._glossT   = 0;

    this._liveRegion = null;
    this._lastAnnouncement = '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', DiffusionScene.ARIA_LABEL);
    this._buildLiveRegion();

    this._heatCv = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(GX, GY) : document.createElement('canvas');
    this._heatCv.width = GX; this._heatCv.height = GY;
    this._heatCtx = this._heatCv.getContext('2d');

    this._buildBgCache();
    this._seedAir();
    this._drawInitialFrame(this._ctx);
    this._announce('A closed bottle of perfume sits on the table. Open it to watch the molecules spread.');
  }

  destroy() {
    if (this._liveRegion) { this._liveRegion.remove(); this._liveRegion = null; }
    this._bgCache = null;
    this._heatCv = null;
    this._heatCtx = null;
    super.destroy();
  }

  onControlChange(id, value) {
    if (id === 'release') {
      this._release();
    } else if (id === 'temperature') {
      this.temperature = clamp(Number(value) / 100, 0, 1);
      this._announce(`Temperature set to ${Math.round(this.temperature * 100)} percent. ` +
        (this.temperature > 0.66 ? 'Warm air — the molecules spread faster.'
          : this.temperature < 0.33 ? 'Cold air — the molecules spread slowly.' : ''));
    } else if (id === 'view') {
      this.view = String(value);
    } else if (id === 'reset') {
      this._reset();
    }
  }

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

  // ── Population ────────────────────────────────────────────────────────────

  _seedAir() {
    for (let i = 0; i < N_AIR; i++) {
      this.addParticle({
        x: ROOM.x0 + Math.random() * ROOM_W,
        y: ROOM.y0 + Math.random() * ROOM_H,
        a: Math.random() * TAU,
        r: 1.3 + Math.random() * 1.1,
        type: 'air',
        base: 40 + Math.random() * 30,
      });
    }
  }

  /** Open the bottle: a tight, dense cloud of molecules at the nozzle. */
  _release() {
    if (this._released) { this._reset(); }
    this._released = true;
    this._clock = 0;
    this._smeltAt = null;
    this._equalAt = null;
    this._evenFor = 0;
    this._samples = [];
    for (let i = 0; i < N_PERFUME; i++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * 16;
      this.addParticle({
        x: SRC.x + Math.cos(a) * rr,
        y: SRC.y + Math.sin(a) * rr * 0.8,
        a: Math.random() * TAU,
        r: 2.1 + Math.random() * 1.2,
        type: 'perfume',
        base: 68 + Math.random() * 30,
      });
    }
    this._announce('Bottle opened. The perfume molecules are packed tightly at the corner — watch them spread.');
  }

  _reset() {
    this.particles = this.particles.filter(p => p.type === 'air');
    this._released = false;
    this._clock = 0;
    this._smeltAt = null;
    this._equalAt = null;
    this._evenFor = 0;
    this._samples = [];
    this._grid.fill(0);
    this._announce('Room aired out. Open the bottle again to repeat the experiment.');
  }

  // ── Physics: a persistent random walk ─────────────────────────────────────
  // Each molecule keeps a heading that is nudged every frame and occasionally
  // reset outright — the visual signature of colliding with air molecules.
  // There is no bias toward the far wall: the spread out of the corner is
  // purely statistical, which is exactly the point about diffusion.

  _walk(dt) {
    const tempF = 0.35 + this.temperature * 1.55;
    for (const p of this.particles) {
      p.a += (Math.random() - 0.5) * 16 * dt * tempF;
      if (Math.random() < 3.2 * dt * tempF) p.a = Math.random() * TAU;
      const sp = p.base * tempF;
      p.x += Math.cos(p.a) * sp * dt;
      p.y += Math.sin(p.a) * sp * dt;
    }
  }

  enforceBoundary() {
    for (const p of this.particles) {
      if (p.x < ROOM.x0 + p.r) { p.x = ROOM.x0 + p.r; p.a = Math.PI - p.a; }
      if (p.x > ROOM.x1 - p.r) { p.x = ROOM.x1 - p.r; p.a = Math.PI - p.a; }
      if (p.y < ROOM.y0 + p.r) { p.y = ROOM.y0 + p.r; p.a = -p.a; }
      if (p.y > ROOM.y1 - p.r) { p.y = ROOM.y1 - p.r; p.a = -p.a; }
    }
  }

  // ── Measurement ───────────────────────────────────────────────────────────

  /** Concentration in the quarter of the room nearest the bottle vs. farthest. */
  _measure() {
    const nearX = ROOM.x0 + ROOM_W * 0.25;
    const farX  = ROOM.x1 - ROOM_W * 0.25;
    let near = 0, far = 0, total = 0;
    for (const p of this.particles) {
      if (p.type !== 'perfume') continue;
      total++;
      if (p.x < nearX) near++;
      else if (p.x > farX) far++;
    }
    if (!total) return { near: 0, far: 0 };
    // ×4 so an even spread reads as 1.0 in each quarter
    return { near: (near / total) * 4, far: (far / total) * 4 };
  }

  _buildGrid() {
    this._grid.fill(0);
    for (const p of this.particles) {
      if (p.type !== 'perfume') continue;
      const gx = clamp(Math.floor(((p.x - ROOM.x0) / ROOM_W) * GX), 0, GX - 1);
      const gy = clamp(Math.floor(((p.y - ROOM.y0) / ROOM_H) * GY), 0, GY - 1);
      this._grid[gy * GX + gx] += 1;
    }
    // one box-blur pass, so the field reads as a smooth gradient
    const out = new Float32Array(GX * GY);
    for (let y = 0; y < GY; y++) {
      for (let x = 0; x < GX; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= GX || ny >= GY) continue;
            sum += this._grid[ny * GX + nx]; n++;
          }
        }
        out[y * GX + x] = sum / n;
      }
    }
    this._grid = out;
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;
    this._glossT += dt;
    if (this._glossT > 8) { this._glossT = 0; this._glossIdx = (this._glossIdx + 1) % GLOSSARY.length; }

    this._walk(dt);
    this.enforceBoundary();

    if (this._released) {
      this._clock += dt;

      // the person notices the smell once enough molecules reach the nose
      if (this._smeltAt === null) {
        let n = 0;
        for (const p of this.particles) {
          if (p.type !== 'perfume') continue;
          if (Math.hypot(p.x - NOSE.x, p.y - NOSE.y) < 34) n++;
          if (n >= 3) break;
        }
        if (n >= 3) {
          this._smeltAt = this._clock;
          this._announce(`Smell detected across the room after ${this._smeltAt.toFixed(1)} seconds.`);
        }
      }

      this._sampleT += dt;
      if (this._sampleT >= 0.2) {
        this._sampleT = 0;
        const m = this._measure();
        this._samples.push(m);
        if (this._samples.length > 140) this._samples.shift();

        if (Math.abs(m.near - m.far) < 0.50) {
          this._evenFor += 0.2;
          if (this._evenFor > 2.0 && this._equalAt === null) {
            this._equalAt = this._clock;
            this._announce('Equilibrium reached. The molecules are spread evenly and keep moving, ' +
              'but as many arrive as leave.');
          }
        } else {
          this._evenFor = 0;
        }
      }
      this._buildGrid();
    }

    ctx.clearRect(0, 0, W, H);
    this._drawBackground(ctx);
    if (this.view !== 'mol' && this._released) this._drawHeatMap(ctx);
    this._drawFurniture(ctx);
    this._drawParticles(ctx);
    this._drawOverlay(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _buildBgCache() {
    const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ctx = oc.getContext('2d');
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, W, H);

    // back wall
    const wg = ctx.createLinearGradient(0, ROOM.y0, 0, ROOM.y1);
    wg.addColorStop(0, COLORS.wallLite);
    wg.addColorStop(1, COLORS.wall);
    ctx.fillStyle = wg;
    ctx.fillRect(ROOM.x0, ROOM.y0, ROOM_W, ROOM_H);

    // a window, so the room reads as a room
    ctx.fillStyle = 'rgba(125,211,252,0.14)';
    ctx.fillRect(300, 92, 132, 92);
    ctx.strokeStyle = 'rgba(148,163,184,0.42)';
    ctx.lineWidth = 3;
    ctx.strokeRect(300, 92, 132, 92);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(366, 92); ctx.lineTo(366, 184);
    ctx.moveTo(300, 138); ctx.lineTo(432, 138);
    ctx.stroke();

    // skirting + floor
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(ROOM.x0, ROOM.y1 - 26, ROOM_W, 26);
    ctx.strokeStyle = 'rgba(148,163,184,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ROOM.x0, ROOM.y1 - 26); ctx.lineTo(ROOM.x1, ROOM.y1 - 26);
    ctx.stroke();

    // room outline
    ctx.strokeStyle = 'rgba(148,163,184,0.55)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ROOM.x0, ROOM.y0, ROOM_W, ROOM_H);

    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }
  }

  // ── Heat map ──────────────────────────────────────────────────────────────

  /** Blue → cyan → yellow → magenta as concentration rises. */
  _heatColor(v) {
    const t = clamp(v, 0, 1);
    let r, g, b;
    if (t < 0.34)      { const u = t / 0.34;          r = 8;   g = 40 + u * 150; b = 120 + u * 100; }
    else if (t < 0.67) { const u = (t - 0.34) / 0.33; r = 8 + u * 240; g = 190 + u * 40; b = 220 - u * 190; }
    else               { const u = (t - 0.67) / 0.33; r = 248; g = 230 - u * 130; b = 30 + u * 150; }
    return [r | 0, g | 0, b | 0];
  }

  _drawHeatMap(ctx) {
    let peak = 0;
    for (let i = 0; i < this._grid.length; i++) peak = Math.max(peak, this._grid[i]);
    if (peak <= 0) return;
    // Cap the reference so an evenly-spread room does not fade to nothing.
    const ref = Math.max(peak, (N_PERFUME / (GX * GY)) * 3.2);

    const img = this._heatCtx.createImageData(GX, GY);
    for (let i = 0; i < GX * GY; i++) {
      const v = this._grid[i] / ref;
      const [r, g, b] = this._heatColor(v);
      img.data[i * 4]     = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(clamp((Math.sqrt(v) - 0.13) * 1.6, 0, 1) * 215);
    }
    this._heatCtx.putImageData(img, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ROOM.x0, ROOM.y0, ROOM_W, ROOM_H);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = this.view === 'heat' ? 0.98 : 0.72;
    ctx.drawImage(this._heatCv, ROOM.x0, ROOM.y0, ROOM_W, ROOM_H);
    ctx.restore();
  }

  // ── Room contents ─────────────────────────────────────────────────────────

  _drawFurniture(ctx) {
    // table
    ctx.fillStyle = '#3f2d1e';
    ctx.fillRect(58, 318, 122, 9);
    ctx.fillStyle = '#2a1e14';
    ctx.fillRect(68, 327, 9, 41);
    ctx.fillRect(161, 327, 9, 41);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(58, 318, 122, 3);

    // perfume bottle
    const open = this._released;
    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.55)';
    ctx.shadowBlur = open ? 16 : 6;
    const bg = ctx.createLinearGradient(102, 292, 132, 318);
    bg.addColorStop(0, '#fbcfe8');
    bg.addColorStop(0.5, '#f472b6');
    bg.addColorStop(1, '#9d174d');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(102, 296, 30, 22, 5);
    ctx.fill();
    ctx.restore();
    // neck + cap
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(112, 288, 10, 8);
    ctx.fillStyle = open ? '#64748b' : '#cbd5e1';
    ctx.beginPath();
    ctx.roundRect(open ? 138 : 108, open ? 310 : 280, 18, 9, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(105, 299, 4, 16);

    // person on the far side, in profile, facing the bottle
    ctx.save();
    ctx.fillStyle = '#2c3f5c';
    ctx.strokeStyle = 'rgba(186,203,224,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();                       // shoulders
    ctx.moveTo(500, 368);
    ctx.quadraticCurveTo(506, 336, 548, 332);
    ctx.quadraticCurveTo(590, 336, 596, 368);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                       // head
    ctx.arc(546, 300, 27, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                       // nose
    ctx.moveTo(524, 294);
    ctx.lineTo(514, 303);
    ctx.lineTo(524, 309);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // sniff cue once the molecules arrive
    if (this._smeltAt !== null) {
      const pulse = 0.5 + 0.5 * Math.sin(this._time * 4);
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.45;
      ctx.strokeStyle = COLORS.perfume;
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(NOSE.x, NOSE.y, 12 + i * 9 + pulse * 3, Math.PI * 0.72, Math.PI * 1.28);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    if (this.view === 'heat') return;
    for (const p of this.particles) {
      if (p.type === 'air') {
        ctx.globalAlpha = 0.30;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = COLORS.air;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      if (p.type !== 'perfume') continue;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.6, 0, TAU);
      ctx.fillStyle = COLORS.perfume;
      ctx.fill();
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(p.x - p.r * 0.4, p.y - p.r * 0.4, 0.4, p.x, p.y, p.r);
      g.addColorStop(0, '#fce7f3');
      g.addColorStop(1, COLORS.perfume);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Overlay: header, graph, readouts, glossary ────────────────────────────

  _drawOverlay(ctx) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 17px Inter, system-ui';
    ctx.fillStyle = COLORS.perfume;
    ctx.fillText('💨  DIFFUSION', 16, 27);
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Molecules move at random — but the net flow always runs from crowded to sparse', 17, 43);
    ctx.restore();

    if (this._released) this._drawGraph(ctx);
    this._drawReadouts(ctx);
    this._drawLegend(ctx);
    this._drawGlossaryCard(ctx);

    if (!this._released) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.62 + 0.24 * Math.sin(this._time * 2);
      ctx.font = '700 15px Inter, system-ui';
      ctx.fillStyle = COLORS.textMain;
      ctx.fillText('Press "Open the Bottle" to release the perfume', 310, 212);
      ctx.restore();
    }
  }

  /** Concentration near the bottle vs. across the room, converging over time. */
  _drawGraph(ctx) {
    const gx = 22, gy = 376, gw = 244, gh = 86;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 9);
    ctx.fillStyle = 'rgba(7,14,28,0.90)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '700 9px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('CONCENTRATION', gx + 9, gy + 7);
    ctx.fillStyle = COLORS.perfume;
    ctx.fillText('■ near the bottle', gx + 9, gy + 20);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText('■ far side', gx + 132, gy + 20);

    const px = gx + 9, py = gy + 34, pw = gw - 18, ph = gh - 44;
    // "evenly spread" reference line
    const evenY = py + ph - (1 / 3) * ph;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(148,163,184,0.45)';
    ctx.beginPath(); ctx.moveTo(px, evenY); ctx.lineTo(px + pw, evenY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 8px Inter, system-ui';
    ctx.fillStyle = 'rgba(7,14,28,0.92)';
    ctx.fillRect(px + pw - 26, evenY - 11, 26, 10);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('even', px + pw - 23, evenY - 10);

    const n = this._samples.length;
    if (n > 1) {
      for (const key of ['near', 'far']) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = px + (i / (n - 1)) * pw;
          const y = py + ph - clamp(this._samples[i][key] / 3, 0, 1) * ph;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = key === 'near' ? COLORS.perfume : COLORS.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawReadouts(ctx) {
    const m = this._measure();
    const parts = [];
    if (this._released) parts.push(`⏱ ${this._clock.toFixed(1)} s`);
    parts.push(`🌡 ${Math.round(this.temperature * 100)}%`);
    if (this._smeltAt !== null) parts.push(`👃 smelt at ${this._smeltAt.toFixed(1)} s`);
    if (this._equalAt !== null) parts.push('⚖ equilibrium');
    else if (this._released) parts.push(`gap ${Math.abs(m.near - m.far).toFixed(2)}`);

    this._pill(ctx, parts.join('   ·   '), W - 16, 26,
      { align: 'right', color: this._equalAt !== null ? COLORS.ok : COLORS.textMain });

    if (this._equalAt !== null) {
      this._banner(ctx, 'Spread out evenly — but the molecules have not stopped!',
        'At equilibrium just as many molecules arrive as leave, so the concentration stays even.');
    } else if (this._smeltAt !== null && this._clock - this._smeltAt < 6) {
      this._banner(ctx, `Smelt across the room after ${this._smeltAt.toFixed(1)} s`,
        'A few molecules got there first — the rest are still on their way.');
    }
  }

  _banner(ctx, title, sub) {
    ctx.save();
    ctx.font = '800 13px Inter, system-ui';
    const w1 = ctx.measureText(title).width;
    ctx.font = '600 10.5px Inter, system-ui';
    const w2 = ctx.measureText(sub).width;
    const bw = Math.max(w1, w2) + 34, bh = 46;
    const bx = (W - bw) / 2, by = ROOM.y0 + 6;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 11);
    ctx.fillStyle = 'rgba(6,60,46,0.93)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,211,153,0.8)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 13px Inter, system-ui';
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(title, W / 2, by + 16);
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText(sub, W / 2, by + 33);
    ctx.restore();
  }

  /** Colour key for the heat map, along the bottom strip. */
  _drawLegend(ctx) {
    if (this.view === 'mol') return;
    const x = 402, y = 378, w = 138, h = 10;
    ctx.save();
    for (let i = 0; i < w; i++) {
      const [r, g, b] = this._heatColor(i / w);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + i, y, 1, h);
    }
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.font = '600 9px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText('concentration   low', x - 6, y + h / 2);
    ctx.textAlign = 'left';
    ctx.fillText('high', x + w + 6, y + h / 2);
    ctx.restore();
  }

  _drawGlossaryCard(ctx) {
    const item = GLOSSARY[this._glossIdx];
    const x = 280, y = H - 8;
    ctx.save();
    const lines = item.desc.split('\n');
    ctx.font = 'bold 11px Inter, system-ui';
    let maxW = ctx.measureText(`📖 ${item.term}`).width;
    ctx.font = '500 10px Inter, system-ui';
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l.trim()).width);

    const padX = 12, padY = 9, lineH = 14;
    const w = maxW + padX * 2;
    const h = 18 + lines.length * lineH + padY;

    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = 'rgba(9,15,30,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59,130,246,0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`📖 ${item.term}`, x + padX, y - h + padY);
    ctx.font = '500 10px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    lines.forEach((l, i) => ctx.fillText(l.trim(), x + padX, y - h + padY + 19 + i * lineH));

    ctx.beginPath();
    ctx.roundRect(x + 2, y - 3, (w - 4) * (this._glossT / 8), 2, 1);
    ctx.fillStyle = 'rgba(59,130,246,0.6)';
    ctx.fill();
    ctx.restore();
  }

  _pill(ctx, text, x, y, { align = 'center', bg = 'rgba(15,23,42,0.88)', color = COLORS.textMain } = {}) {
    ctx.save();
    ctx.font = '700 11px Inter, system-ui';
    const w = ctx.measureText(text).width + 20;
    const h = 22;
    const bx = clamp(align === 'right' ? x - w : x - w / 2, 4, W - w - 4);
    ctx.beginPath();
    ctx.roundRect(bx, y - h / 2, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + w / 2, y + 0.5);
    ctx.restore();
  }
}
