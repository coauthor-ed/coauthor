import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * SlidePreparationScene — Part 3.2 "Slide Preparation: Onion Peel vs. Human
 * Cheek Cell".
 *
 * Two guided wet-mount procedures (bench work, then eyepiece observation)
 * that let a Class 9 student see, side by side, the two textbook examples of
 * a walled plant cell and an unwalled animal cell:
 *  - Onion (Allium cepa) epidermal peel: brick-like cells in neat rows, a
 *    visible cellulose wall, a large central vacuole, safranin-stained
 *    nucleus.
 *  - Human cheek (buccal) epithelium: irregular, unwalled cells scraped
 *    from the inside of the cheek, methylene-blue-stained nucleus.
 *
 * ── Deviations from the sprint spec (deliberate) ──────────────────────────
 * The spec's "DiagramAnnotator overlaid on microscope view" would pull in a
 * separate labelling-question plugin; instead — following the precedent set
 * by MicroscopeAssemblyScene's field-of-view — the three defining
 * structures (wall, nucleus, cytoplasm/membrane) are labelled directly on
 * the canvas with leader-line pills once the eyepiece view is reached. A
 * "Compare Both" split view is added once a student has prepared *both*
 * slides at least once — it is the entire pedagogical point of the spec's
 * title and is worth the extra screen, without adding new plugin coupling.
 * There is no `MicroscopeSimulation` base class in this codebase (only
 * planned, never built) — the circular eyepiece viewport is hand-drawn here
 * with CanvasSimulation directly, matching MicroscopeAssemblyScene.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — hex values
 * from sim-theme.css are inlined in COLORS below.
 */

const W = 640;
const H = 580;

const COLORS = {
  bgDeep:     '#070c1a',
  bench:      '#1e293b',
  benchEdge:  '#0f172a',
  glass:      'rgba(255,255,255,0.16)',
  glassGlow:  'rgba(255,255,255,0.42)',
  metal:      '#94a3b8',
  metalDark:  '#334155',
  onionSkin:  '#c9973f',
  onionFlesh: 'rgba(253, 246, 216, 0.85)',
  cheekTone:  '#e8ab84',
  safranin:   '#e0431f',
  methBlue:   '#2451c7',
  wallGreen:  '#a3e635',
  nucleusRed: '#b91c3d',
  nucleusBlue:'#1d3ea8',
  textMain:   '#f1f5f9',
  textMuted:  '#94a3b8',
  ok:         '#34d399',
  err:        '#f87171',
  accent:     '#818cf8',
  // Isometric lab pedestal — a dark slate/graphite platform (echoing the
  // brushed-metal instrument look elsewhere in this suite) rather than a
  // literal wood benchtop, so the diorama sits comfortably in the app's
  // "specimen glowing in the dark" visual language.
  platformTop:   '#2a3a52',
  platformSide:  '#111a2c',
  platformRim:   'rgba(129,140,248,0.55)',
  shadowInk:     'rgba(2,6,16,0.55)',
};

const GLOSSARY = {
  epidermis:  { term: 'Epidermis (Peel)',
    desc: 'A single, transparent layer of cells covering a plant\nsurface. Onion peel is the easiest epidermis to see.' },
  cellWall:   { term: 'Cell Wall',
    desc: 'A rigid outer layer of cellulose found only in plant cells.\nIt gives the onion cells their fixed, brick-like shape.' },
  vacuole:    { term: 'Vacuole',
    desc: 'A large, fluid-filled sac that fills most of a plant cell,\npushing the cytoplasm to the edges.' },
  safranin:   { term: 'Safranin',
    desc: 'A red-orange dye used to stain plant tissue. It colours\nthe nucleus so it stands out under the microscope.' },
  buccal:     { term: 'Buccal (Cheek) Cell',
    desc: 'A flat epithelial cell that lines the inside of the cheek.\nCells are constantly shed and easy to sample painlessly.' },
  methyleneBlue: { term: 'Methylene Blue',
    desc: 'A blue dye used to stain animal tissue. Like safranin for\nplants, it makes the nucleus easy to spot.' },
  noWall:     { term: 'No Cell Wall',
    desc: 'Animal cells have only a thin, flexible membrane, so\ncheek cells look irregular and change shape easily.' },
  coverslip:  { term: 'Coverslip',
    desc: 'A thin square of glass lowered at an angle over the\nspecimen. This traps a water film and keeps out air bubbles.' },
  nucleus:    { term: 'Nucleus',
    desc: 'The cell’s control centre, holding DNA. Stains darken\nit so it is the first thing you notice under the lens.' },
};

/** Bench-stage steps shared by both tracks; each has a canvas "stage" key. */
const ONION_STEPS = [
  { id: 'peel', stage: 'source', action: '🔪  Peel the Onion Layer',
    status: 'Step 1 — Use forceps to peel a thin, transparent layer from the inner (concave) surface of an onion scale.' },
  { id: 'place', stage: 'slide', action: '📌  Place Peel on Slide',
    status: 'Step 2 — Lay the peel flat in the centre of a clean glass slide, smoothing out any folds.' },
  { id: 'water', stage: 'water', action: '💧  Add a Drop of Water',
    status: 'Step 3 — A drop of water stops the delicate peel from drying out and helps it lie flat.' },
  { id: 'stain', stage: 'stain', action: '🎨  Apply Safranin Stain',
    status: 'Step 4 — Safranin colours the nucleus red-orange so it stands out against the pale cell wall.' },
  { id: 'coverslip', stage: 'coverslip', action: '🧊  Lower the Coverslip',
    status: 'Step 5 — Lower the coverslip at a 45° angle from one edge, so air is pushed out and no bubbles form.' },
  { id: 'view', stage: 'view', action: '🔬  View Under the Microscope',
    status: 'Step 6 — Look through the eyepiece to see the prepared slide.' },
];

const CHEEK_STEPS = [
  { id: 'peel', stage: 'source', action: '🥄  Scrape the Inner Cheek',
    status: 'Step 1 — Gently scrape the inside of the cheek with a clean flat spatula to collect loose surface cells.' },
  { id: 'place', stage: 'slide', action: '📌  Smear on Slide',
    status: 'Step 2 — Smear the scraping thinly across a clean glass slide.' },
  { id: 'stain', stage: 'stain', action: '🎨  Apply Methylene Blue',
    status: 'Step 3 — Methylene blue stains the nucleus deep blue so it is easy to see against the pale cytoplasm.' },
  { id: 'coverslip', stage: 'coverslip', action: '🧊  Lower the Coverslip',
    status: 'Step 4 — Lower the coverslip at a 45° angle from one edge, so air is pushed out and no bubbles form.' },
  { id: 'view', stage: 'view', action: '🔬  View Under the Microscope',
    status: 'Step 5 — Look through the eyepiece to see the prepared slide.' },
];

const TRACKS = {
  onion: {
    label: 'Onion Peel', icon: '🧅', steps: ONION_STEPS,
    stainColor: COLORS.safranin, stainName: 'Safranin', nucleusColor: COLORS.nucleusRed,
  },
  cheek: {
    label: 'Cheek Cell', icon: '😮', steps: CHEEK_STEPS,
    stainColor: COLORS.methBlue, stainName: 'Methylene Blue', nucleusColor: COLORS.nucleusBlue,
  },
};

const FOV = { x: W / 2, y: 258, r: 176 };
const STEP_DUR = 1.1;

// ── Bench diorama layout (iso-space units; verified analytically to fit the
// canvas and not collide — see the design notes for this file) ────────────
const PLATFORM = { x0: -3.3, y0: -2.1, z0: -0.4, wx: 6.6, wy: 4.2, h: 0.4 };
const ONION_POS = { x: -2.35, y: -1.35, r: 0.75, h: 1.0 };
const BOTTLE_POS = { x: 1.85, y: -1.55, r: 0.35, h: 0.85 };
const SLIDE_POS = { x0: -1.4, y0: -0.2, wx: 2.8, wy: 1.05, h: 0.1 };
const SLIDE_CENTER = { x: SLIDE_POS.x0 + SLIDE_POS.wx / 2, y: SLIDE_POS.y0 + SLIDE_POS.wy / 2 };
const DROPPER_POS = { x: 1.35, y: 0.65 };
const COVER_W = 0.85;
const COVER_HINGE = { x: SLIDE_CENTER.x, y: SLIDE_CENTER.y - COVER_W / 2 };
/** Where a freshly lifted peel/scrape sample hovers, just off the source — the shared handoff point between the "source" and "place" steps. */
const SOURCE_LIFT = { x: ONION_POS.x + 0.35, y: ONION_POS.y - 0.55, z: 0.85 };
const FOCUS_FLASH_DUR = 0.6;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t) {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
/** Deterministic pseudo-random stream so cell geometry is stable across frames. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── Isometric projection ────────────────────────────────────────────────────
// The lab bench is a true 30° isometric diorama: a fixed camera looking down
// at the pedestal from above. World coordinates are (x, y, z) in "iso-units";
// x and y are the two ground-plane axes, z is height. Because this
// projection is a linear (affine) map, a circle drawn in any constant-z
// plane always projects to the SAME fixed-ratio ellipse — that fact is what
// makes the cylinder/decal helpers below cheap to compute exactly, without
// point-sampling a curve.
const ORIGIN = { x: 320, y: 296 };
const ISO_U = 34;                                  // pixels per iso-unit
const ISO_ELLIPSE_RX = 1.224745 * ISO_U;            // horiz. screen radius per unit of ground-plane radius
const ISO_ELLIPSE_RY = 0.707107 * ISO_U;            // vert.  screen radius per unit of ground-plane radius

function iso(x, y, z = 0) {
  return {
    x: ORIGIN.x + (x - y) * 0.866025 * ISO_U,
    y: ORIGIN.y + (x + y) * 0.5 * ISO_U - z * ISO_U,
  };
}

/** Lighten (amt > 0) or darken (amt < 0) a '#rrggbb' colour by a fraction. */
function shade(hex, amt) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = amt < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amt));
  r = Math.round(r + (target - r) * p);
  g = Math.round(g + (target - g) * p);
  b = Math.round(b + (target - b) * p);
  return `rgb(${r},${g},${b})`;
}

/** Soft blurred ground shadow beneath any object, grounding it on the pedestal. */
function drawIsoShadow(ctx, x, y, r, alpha = 0.4) {
  const p = iso(x, y, 0.002);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = 'blur(3px)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * ISO_ELLIPSE_RX, r * ISO_ELLIPSE_RY, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.shadowInk;
  ctx.fill();
  ctx.restore();
}

/**
 * A rectangular prism (box) with its footprint corner at (x0,y0), extending
 * +wx/+wy along the ground axes and +h in height from base z0. Draws the
 * top face plus the two visible side faces, shaded as if lit from upper-left.
 */
function drawIsoBox(ctx, x0, y0, z0, wx, wy, h, color, opts = {}) {
  const { alpha = 1, topAmt = 0.3, rightAmt = -0.1, leftAmt = -0.34, stroke = null } = opts;
  const top = {
    a: iso(x0, y0, z0 + h), b: iso(x0 + wx, y0, z0 + h),
    c: iso(x0 + wx, y0 + wy, z0 + h), d: iso(x0, y0 + wy, z0 + h),
  };
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.moveTo(top.a.x, top.a.y); ctx.lineTo(top.b.x, top.b.y);
  ctx.lineTo(top.c.x, top.c.y); ctx.lineTo(top.d.x, top.d.y);
  ctx.closePath();
  ctx.fillStyle = shade(color, topAmt);
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }

  if (h > 0) {
    const a0 = iso(x0, y0, z0), b0 = iso(x0 + wx, y0, z0), d0 = iso(x0, y0 + wy, z0);
    ctx.beginPath();
    ctx.moveTo(top.a.x, top.a.y); ctx.lineTo(top.b.x, top.b.y);
    ctx.lineTo(b0.x, b0.y); ctx.lineTo(a0.x, a0.y);
    ctx.closePath();
    ctx.fillStyle = shade(color, rightAmt);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(top.a.x, top.a.y); ctx.lineTo(top.d.x, top.d.y);
    ctx.lineTo(d0.x, d0.y); ctx.lineTo(a0.x, a0.y);
    ctx.closePath();
    ctx.fillStyle = shade(color, leftAmt);
    ctx.fill();
  }
  ctx.restore();
  return top; // handy for callers that place a decal on the top face
}

/**
 * A vertical (possibly tapered) cylinder from z0..z1 with base radius r0 and
 * top radius r1, centred at ground-plane (cx,cy). Used for bottles, the
 * dropper, and — stacked — the onion bulb.
 */
function drawIsoCylinder(ctx, cx, cy, z0, z1, r0, r1, color, opts = {}) {
  const { alpha = 1, topColor = null, stroke = null } = opts;
  const bottom = iso(cx, cy, z0);
  const top = iso(cx, cy, z1);
  const rxB = r0 * ISO_ELLIPSE_RX, ryB = r0 * ISO_ELLIPSE_RY;
  const rxT = r1 * ISO_ELLIPSE_RX, ryT = r1 * ISO_ELLIPSE_RY;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.ellipse(bottom.x, bottom.y, rxB, ryB, 0, 0, Math.PI);
  ctx.lineTo(top.x - rxT, top.y);
  ctx.ellipse(top.x, top.y, rxT, ryT, 0, Math.PI, 0, true);
  ctx.lineTo(bottom.x + rxB, bottom.y);
  ctx.closePath();
  const wallGrad = ctx.createLinearGradient(bottom.x, top.y, bottom.x, bottom.y);
  wallGrad.addColorStop(0, shade(color, 0.18));
  wallGrad.addColorStop(1, shade(color, -0.38));
  ctx.fillStyle = wallGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(top.x, top.y, rxT, ryT, 0, 0, Math.PI * 2);
  ctx.fillStyle = topColor || shade(color, 0.4);
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }

  ctx.restore();
  return { bottom, top, rxT, ryT, rxB, ryB };
}

/** Project a point on a flat top face at height z, for drawing "decals" (labels, icons, liquid pools) that sit flush on an iso surface. */
function isoDecal(cx, cy, z, dx, dy) {
  return iso(cx + dx, cy + dy, z);
}

export class SlidePreparationScene extends CanvasSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static ARIA_LABEL =
    'Slide preparation lab. Choose Onion Peel or Cheek Cell, follow the numbered steps to ' +
    'prepare a microscope slide, then view the result through the eyepiece.';

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.track = null;             // 'onion' | 'cheek' | null
    this.phase = 'select';         // 'select' | 'prep' | 'scope' | 'compare'
    this.stepIndex = 0;
    this.stepAnim = null;          // { t, dur }
    this.viewedTracks = new Set();
    this.scopeReveal = 0;          // 0..1 circular reveal into the eyepiece
    this._focusFlashT = -1;        // -1 = inactive; counts up once the eyepiece view is fully focused
    this._time = 0;
    this._fx = [];

    this._cellGeo = {
      onion: this._buildOnionGeometry(),
      cheek: this._buildCheekGeometry(),
    };

    this._rootEl = null; this._stageEl = null; this._statusEl = null;
    this._actionBtn = null; this._tabOnion = null; this._tabCheek = null;
    this._resetBtn = null; this._compareBtn = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    this._buildDom();
    await super.setup();
    this._stageEl.appendChild(this._canvas);
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', SlidePreparationScene.ARIA_LABEL);
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:10px;';

    this._buildBgCache();
    this._syncUI();
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    if (this._rootEl) { this._rootEl.remove(); this._rootEl = null; }
    this._bgCache = null;
    super.destroy();
  }

  // ── Geometry (precomputed once so rendering is stable frame to frame) ─────

  _buildOnionGeometry() {
    const rng = makeRng(7712);
    const cells = [];
    const rows = 6, cols = 5;
    const cellW = 58, cellH = 52;
    const originX = -((cols - 1) * cellW) / 2;
    const originY = -((rows - 1) * cellH) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jitterX = (rng() - 0.5) * 8;
        const jitterY = (rng() - 0.5) * 6;
        const w = cellW - 6 + rng() * 8;
        const h = cellH - 6 + rng() * 6;
        cells.push({
          x: originX + c * cellW + jitterX + (r % 2 === 0 ? 6 : -6),
          y: originY + r * cellH + jitterY,
          w, h,
          nx: (rng() - 0.5) * 0.5,   // nucleus offset within cell, fraction of w/h
          ny: (rng() - 0.5) * 0.5,
          nr: 6 + rng() * 3,
          bob: rng() * Math.PI * 2,
        });
      }
    }
    return cells;
  }

  _buildCheekGeometry() {
    const rng = makeRng(4231);
    const cells = [];
    const positions = [
      [-150, -70], [-90, -100], [-20, -85], [50, -105], [120, -75], [160, -20],
      [-160, 10], [-80, -15], [10, -20], [90, -5], [150, 40], [-120, 70],
      [-40, 60], [40, 65], [110, 95], [-10, 110],
    ];
    for (const [px, py] of positions) {
      const rBase = 34 + rng() * 16;
      const points = 10;
      const radii = [];
      for (let i = 0; i < points; i++) radii.push(rBase * (0.78 + rng() * 0.4));
      cells.push({
        x: px + (rng() - 0.5) * 14,
        y: py + (rng() - 0.5) * 14,
        rot: rng() * Math.PI * 2,
        radii,
        nx: (rng() - 0.5) * 0.3,
        ny: (rng() - 0.5) * 0.3,
        nr: 8 + rng() * 4,
        bob: rng() * Math.PI * 2,
        speck: Array.from({ length: 5 }, () => ({
          a: rng() * Math.PI * 2, d: rng() * rBase * 0.55, r: 0.8 + rng() * 1,
        })),
      });
    }
    return cells;
  }

  // ── DOM shell ─────────────────────────────────────────────────────────────

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .sp-root{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:9px;
        font-family:Inter,system-ui,sans-serif;color:var(--sim-label,#e2e8f0);}
      .sp-tabs{display:flex;gap:8px;}
      .sp-tab{flex:1 1 0;padding:9px 10px;border-radius:9px;cursor:pointer;text-align:center;
        background:var(--sim-bg-surface,#111827);border:1.5px solid rgba(148,163,184,0.25);
        color:var(--sim-label,#e2e8f0);font:600 12.5px Inter,system-ui,sans-serif;transition:all .15s;}
      .sp-tab:hover:not(:disabled){border-color:rgba(129,140,248,0.7);}
      .sp-tab[data-active="1"]{background:linear-gradient(90deg,rgba(129,140,248,.28),rgba(129,140,248,.08)), var(--sim-bg-surface,#111827);
        border-color:var(--sim-accent,#818cf8); color:var(--sim-label,#e2e8f0);}
      .sp-tab:disabled{opacity:0.45;cursor:not-allowed;}
      .sp-stage{position:relative;width:100%;}
      .sp-status{padding:10px 13px;border-radius:9px;background:var(--sim-bg-surface,#111827);
        border:1px solid rgba(148,163,184,0.2);font:500 12.5px Inter,system-ui,sans-serif;
        color:var(--sim-label,#cbd5e1);min-height:20px;line-height:1.4;}
      .sp-controls{display:flex;gap:8px;flex-wrap:wrap;}
      .sp-btn{padding:9px 16px;border-radius:8px;border:none;cursor:pointer;font:600 13px Inter,system-ui,sans-serif;
        background:var(--sim-accent,#818cf8);color:#0b1120;transition:filter .15s;}
      .sp-btn:hover:not(:disabled){filter:brightness(1.1);}
      .sp-btn:disabled{opacity:0.45;cursor:not-allowed;}
      .sp-btn.secondary{background:var(--sim-bg-surface,#1e293b);color:var(--sim-label,#e2e8f0);
        border:1.5px solid rgba(148,163,184,0.3);}
      .sp-btn.ghost{background:transparent;color:var(--sim-accent,#818cf8);border:1.5px solid rgba(129,140,248,0.5);}
    `;

    const root = document.createElement('div');
    root.className = 'sp-root';
    root.appendChild(style);

    const tabs = document.createElement('div');
    tabs.className = 'sp-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Choose which specimen to prepare');
    this._tabOnion = this._buildTab('onion');
    this._tabCheek = this._buildTab('cheek');
    tabs.appendChild(this._tabOnion);
    tabs.appendChild(this._tabCheek);

    const status = document.createElement('div');
    status.className = 'sp-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const stage = document.createElement('div');
    stage.className = 'sp-stage';

    const controls = document.createElement('div');
    controls.className = 'sp-controls';

    this._actionBtn = document.createElement('button');
    this._actionBtn.className = 'sp-btn';
    this._actionBtn.addEventListener('click', () => this._doStep());

    this._resetBtn = document.createElement('button');
    this._resetBtn.className = 'sp-btn secondary';
    this._resetBtn.textContent = '↻ Prepare Another Slide';
    this._resetBtn.addEventListener('click', () => this._reset());

    this._compareBtn = document.createElement('button');
    this._compareBtn.className = 'sp-btn ghost';
    this._compareBtn.textContent = '🔍 Compare Both';
    this._compareBtn.style.display = 'none';
    this._compareBtn.addEventListener('click', () => this._toggleCompare());

    controls.appendChild(this._actionBtn);
    controls.appendChild(this._resetBtn);
    controls.appendChild(this._compareBtn);

    root.appendChild(tabs);
    root.appendChild(status);
    root.appendChild(stage);
    root.appendChild(controls);
    this.container.appendChild(root);

    this._rootEl = root; this._stageEl = stage; this._statusEl = status;
  }

  _buildTab(track) {
    const t = TRACKS[track];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-tab';
    btn.dataset.track = track;
    btn.textContent = `${t.icon}  ${t.label}`;
    btn.addEventListener('click', () => this._selectTrack(track));
    return btn;
  }

  // ── State transitions ────────────────────────────────────────────────────

  _selectTrack(track) {
    if (this.phase === 'prep' && this.track === track) return;
    this.track = track;
    this.phase = 'prep';
    this.stepIndex = 0;
    this.stepAnim = null;
    this.scopeReveal = 0;
    this._focusFlashT = -1;
    this._syncUI();
    this._announce(`${TRACKS[track].label} selected. ${TRACKS[track].steps[0].status}`);
  }

  _doStep() {
    if (this.phase !== 'prep' || this.stepAnim) return;
    const steps = TRACKS[this.track].steps;
    const step = steps[this.stepIndex];
    if (!step) return;
    this.stepAnim = { t: 0, dur: STEP_DUR, step };
    this._burst();
    this._syncUI();
  }

  _completeCurrentStep() {
    const steps = TRACKS[this.track].steps;
    const step = steps[this.stepIndex];
    this.stepAnim = null;
    if (step.stage === 'view') {
      this.phase = 'scope';
      this.scopeReveal = 0;
      this._focusFlashT = -1;
      this.viewedTracks.add(this.track);
      this._announce(`Viewing the ${TRACKS[this.track].label.toLowerCase()} slide under the microscope.`);
    } else {
      this.stepIndex++;
      const next = steps[this.stepIndex];
      if (next) this._announce(next.status);
    }
    this._syncUI();
  }

  _reset() {
    this.track = null;
    this.phase = 'select';
    this.stepIndex = 0;
    this.stepAnim = null;
    this.scopeReveal = 0;
    this._focusFlashT = -1;
    this._syncUI();
    this._announce('Choose a specimen to prepare a fresh slide.');
  }

  _toggleCompare() {
    this.phase = this.phase === 'compare' ? 'scope' : 'compare';
    if (this.phase === 'compare') this._announce('Comparing the onion peel and cheek cell slides side by side.');
    this._syncUI();
  }

  _burst() {
    const p = iso(SLIDE_CENTER.x, SLIDE_CENTER.y, 0.5);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this._fx.push({
        x: p.x, y: p.y, vx: Math.cos(a) * (30 + Math.random() * 60),
        vy: Math.sin(a) * (30 + Math.random() * 60) - 20,
        life: 0.6, max: 0.6, r: 1.5 + Math.random() * 1.8, color: COLORS.accent,
      });
    }
  }

  _announce(msg) {
    if (this._statusEl) this._statusEl.textContent = msg;
  }

  _syncUI() {
    const inPrep = this.phase === 'prep';
    this._tabOnion.disabled = inPrep && this.track === 'cheek';
    this._tabCheek.disabled = inPrep && this.track === 'onion';
    this._tabOnion.dataset.active = this.track === 'onion' ? '1' : '0';
    this._tabCheek.dataset.active = this.track === 'cheek' ? '1' : '0';

    if (this.phase === 'select') {
      this._actionBtn.style.display = 'none';
      this._resetBtn.style.display = 'none';
      this._compareBtn.style.display = 'none';
      this._announce('Choose Onion Peel or Cheek Cell to begin preparing a slide.');
    } else if (this.phase === 'prep') {
      const step = TRACKS[this.track].steps[this.stepIndex];
      this._actionBtn.style.display = 'inline-flex';
      this._actionBtn.disabled = !!this.stepAnim;
      this._actionBtn.textContent = step ? step.action : '';
      this._resetBtn.style.display = 'inline-flex';
      this._compareBtn.style.display = 'none';
      if (!this.stepAnim) this._announce(step.status);
    } else {
      this._actionBtn.style.display = 'none';
      this._resetBtn.style.display = 'inline-flex';
      this._compareBtn.style.display = this.viewedTracks.size >= 2 ? 'inline-flex' : 'none';
      this._compareBtn.textContent = this.phase === 'compare' ? '🔬 Back to Single View' : '🔍 Compare Both';
    }
  }

  // ── Frame update ──────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;
    this._update(dt);
    ctx.clearRect(0, 0, W, H);
    this._drawBackground(ctx);

    if (this.phase === 'compare') {
      this._drawCompare(ctx);
    } else if (this.phase === 'scope') {
      this._drawBenchLayer(ctx, 1 - this.scopeReveal);
      this._drawEyepieceLayer(ctx, this.scopeReveal);
    } else {
      this._drawBenchLayer(ctx, 1);
    }
    this._drawFx(ctx);
    this._drawGlossaryCard(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _update(dt) {
    if (this.stepAnim) {
      this.stepAnim.t += dt;
      if (this.stepAnim.t >= this.stepAnim.dur) {
        this._completeCurrentStep();
      }
    }
    if (this.phase === 'scope' && this.scopeReveal < 1) {
      this.scopeReveal = Math.min(1, this.scopeReveal + dt / 0.9);
    }
    if (this.phase === 'scope' && this.scopeReveal >= 1) {
      this._focusFlashT = this._focusFlashT < 0 ? 0 : this._focusFlashT + dt;
    }
    for (const p of this._fx) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt;
      p.life -= dt;
    }
    if (this._fx.length) this._fx = this._fx.filter((p) => p.life > 0);
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBgCache() {
    const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ctx = oc.getContext('2d');
    const g = ctx.createRadialGradient(ORIGIN.x, ORIGIN.y - 30, 40, ORIGIN.x, ORIGIN.y, W * 0.8);
    g.addColorStop(0, '#101c34');
    g.addColorStop(0.55, '#0a1224');
    g.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }
  }

  // ── Bench layer — an isometric lab pedestal (source, slide, water, stain,
  // coverslip), lit and shadowed like the rest of this suite's "specimen
  // glowing in the dark" instruments. ────────────────────────────────────────

  _drawBenchLayer(ctx, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    this._drawPlatform(ctx);

    if (this.phase === 'select' || !this.track) {
      this._drawIdleBench(ctx);
      ctx.restore();
      return;
    }

    const track = this.track;
    const t = TRACKS[track];
    const step = t.steps[this.stepIndex] || t.steps[t.steps.length - 1];
    const anim = this.stepAnim;
    const p = anim ? clamp01(anim.t / anim.dur) : (step.stage === 'view' ? 1 : 0);
    const stageDone = (stageId) => t.steps.findIndex((s) => s.stage === stageId) < this.stepIndex
      || (t.steps.findIndex((s) => s.stage === stageId) === this.stepIndex && step.stage !== stageId);
    const isStage = (stageId) => step.stage === stageId;

    // Back-to-front iso paint order: source material, stain bottle, slide
    // (plus whatever sits on it), then the coverslip on top of everything.
    // The sample only lifts off the source during "source"; it travels from
    // there to the slide during "place"/"smear" — that hand-off is the
    // visible action for that step, instead of duplicating the source step's
    // motion.
    this._drawSource(ctx, track, isStage('source') ? p : (stageDone('source') || this.stepIndex > 0 ? 1 : 0));
    this._drawStainBottle(ctx, t.stainColor);
    this._drawGlassSlide(ctx);

    if (isStage('place')) {
      this._drawTravelingSpecimen(ctx, track, p);
    }
    if (stageDone('place')) {
      this._drawSpecimenDecal(ctx, track, 1);
    }

    const hasWater = track === 'onion' && (this.stepIndex > t.steps.findIndex((s) => s.stage === 'water')
      || isStage('stain') || isStage('coverslip') || isStage('view'));
    if (track === 'onion' && (isStage('water') || hasWater)) {
      this._drawWaterStep(ctx, isStage('water') ? p : 1);
    }

    const stainIdx = t.steps.findIndex((s) => s.stage === 'stain');
    const stainDone = this.stepIndex > stainIdx || isStage('coverslip') || isStage('view');
    if (isStage('stain') || stainDone) {
      this._drawStainStep(ctx, track, isStage('stain') ? p : 1);
    }

    const coverIdx = t.steps.findIndex((s) => s.stage === 'coverslip');
    const coverDone = this.stepIndex > coverIdx || isStage('view');
    if (isStage('coverslip') || coverDone) {
      this._drawCoverslipIso(ctx, isStage('coverslip') ? p : 1);
    }

    if (isStage('view')) {
      // Softly draw a magnifier glint above the slide as we head into the eyepiece.
      const sc = iso(SLIDE_CENTER.x, SLIDE_CENTER.y, 0.4);
      ctx.save();
      ctx.globalAlpha *= p * 0.5;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, 60 * (1 + p), 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    this._drawStepCaption(ctx, step, alpha);
    ctx.restore();
  }

  /** Ambient light pool + faint etched grid on the pedestal's top face. */
  _drawPlatform(ctx) {
    const glowAt = iso(0, 0.5, PLATFORM.z0);
    ctx.save();
    const glow = ctx.createRadialGradient(glowAt.x, glowAt.y, 10, glowAt.x, glowAt.y, 230);
    glow.addColorStop(0, 'rgba(129,140,248,0.16)');
    glow.addColorStop(1, 'rgba(129,140,248,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    drawIsoBox(ctx, PLATFORM.x0, PLATFORM.y0, PLATFORM.z0, PLATFORM.wx, PLATFORM.wy, PLATFORM.h,
      COLORS.platformTop, { topAmt: 0.22, rightAmt: -0.15, leftAmt: -0.4, stroke: COLORS.platformRim });

    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.10)';
    ctx.lineWidth = 1;
    const topZ = PLATFORM.z0 + PLATFORM.h + 0.002;
    for (let gx = Math.ceil(PLATFORM.x0); gx <= PLATFORM.x0 + PLATFORM.wx; gx++) {
      const a = iso(gx, PLATFORM.y0, topZ), b = iso(gx, PLATFORM.y0 + PLATFORM.wy, topZ);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let gy = Math.ceil(PLATFORM.y0); gy <= PLATFORM.y0 + PLATFORM.wy; gy++) {
      const a = iso(PLATFORM.x0, gy, topZ), b = iso(PLATFORM.x0 + PLATFORM.wx, gy, topZ);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawIdleBench(ctx) {
    // A calm, ready bench — slide and stain bottle waiting, no source
    // material yet. The DOM status line already states the instruction, so
    // the canvas stays quiet: platform, a light icon hint, nothing more.
    this._drawStainBottle(ctx, COLORS.safranin);
    drawIsoShadow(ctx, SLIDE_CENTER.x, SLIDE_CENTER.y, 1.7, 0.32);
    this._drawGlassSlide(ctx);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '600 15px Inter, system-ui';
    ctx.fillText('🧅   🔬   😮', W / 2, 56);
    ctx.restore();
  }

  /** Onion bulb: four stacked, gently tapered iso "layers" forming a dome. */
  _drawOnionSource(ctx, settle) {
    const { x, y, r, h } = ONION_POS;
    drawIsoShadow(ctx, x, y, r * 1.15, 0.42);
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands, t1 = (i + 1) / bands;
      const r0 = r * Math.cos(t0 * Math.PI * 0.42);
      const r1 = r * Math.cos(t1 * Math.PI * 0.42);
      const tint = i % 2 === 0 ? COLORS.onionSkin : shade(COLORS.onionSkin, 0.1);
      drawIsoCylinder(ctx, x, y, t0 * h, t1 * h, r0, r1, tint, {
        topColor: i === bands - 1 ? shade(COLORS.onionSkin, 0.42) : null,
      });
    }
    ctx.save();
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    const label = iso(x, y + r + 0.4, 0);
    ctx.fillText('onion bulb', label.x, label.y);
    ctx.restore();

    // The peeled layer lifts off the bulb and hovers beside it while this
    // step is in progress — the "Place Peel on Slide" step then carries it
    // the rest of the way (see _drawTravelingSpecimen).
    if (this.stepIndex === 0) {
      const start = { x: x - r * 0.25, y: y - r * 0.55, z: h * 0.74 };
      const px = lerp(start.x, SOURCE_LIFT.x, settle), py = lerp(start.y, SOURCE_LIFT.y, settle),
        pz = lerp(start.z, SOURCE_LIFT.z, settle);
      drawIsoBox(ctx, px - 0.35, py - 0.22, pz, 0.7, 0.44, 0.015, '#fdf6dc', {
        alpha: 0.6, topAmt: 0.1, stroke: 'rgba(255,255,255,0.55)',
      });
    }
  }

  /** Cheek reference: a flat illustrated card standing in for the source (a human cheek doesn't read as an iso solid). */
  _drawCheekSource(ctx, settle) {
    const { x, y } = ONION_POS; // shares the source "slot" on the pedestal
    const cardW = 1.3, cardD = 1.0, cardH = 0.06;
    drawIsoShadow(ctx, x, y, 0.9, 0.35);
    drawIsoBox(ctx, x - cardW / 2, y - cardD / 2, 0, cardW, cardD, cardH, '#f3ead9', {
      topAmt: 0.06, rightAmt: -0.2, leftAmt: -0.34, stroke: 'rgba(255,255,255,0.4)',
    });

    const face = iso(x, y, cardH);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(face.x, face.y - 4, 0.32 * ISO_ELLIPSE_RX, 0.32 * ISO_ELLIPSE_RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.cheekTone;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Glowing scrape-zone indicator, pulsing to invite the click.
    const zone = isoDecal(x, y, cardH, 0.05, 0.05);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this._time * 6);
    ctx.beginPath();
    ctx.ellipse(zone.x, zone.y, 0.11 * ISO_ELLIPSE_RX, 0.11 * ISO_ELLIPSE_RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f472b6';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    const label = iso(x, y + cardD / 2 + 0.35, 0);
    ctx.fillText('inner cheek', label.x, label.y);
    ctx.restore();

    // The scraping lifts off the card and hovers beside it — "Smear on
    // Slide" then carries it the rest of the way (see _drawTravelingSpecimen).
    if (this.stepIndex === 0 && settle > 0) {
      const sx = lerp(x, SOURCE_LIFT.x, settle), sy = lerp(y, SOURCE_LIFT.y, settle);
      const sz = lerp(cardH + 0.03, SOURCE_LIFT.z, settle);
      const sp = iso(sx, sy, sz);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, 0.32 * ISO_ELLIPSE_RX, 0.13 * ISO_ELLIPSE_RY, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f9c9a8';
      ctx.fill();
      ctx.restore();
    }
  }

  _drawSource(ctx, track, settle) {
    if (track === 'onion') this._drawOnionSource(ctx, settle);
    else this._drawCheekSource(ctx, settle);
  }

  /**
   * The lifted sample's journey from the source to the slide — the visible
   * action for "Place Peel on Slide" / "Smear on Slide". It settles with a
   * little squash-landing bounce right as it arrives.
   */
  _drawTravelingSpecimen(ctx, track, p) {
    const travelP = easeInOut(clamp01(p));
    const tx = lerp(SOURCE_LIFT.x, SLIDE_CENTER.x, travelP);
    const ty = lerp(SOURCE_LIFT.y, SLIDE_CENTER.y, travelP);
    const tz = lerp(SOURCE_LIFT.z, SLIDE_POS.h + 0.01, travelP);
    const landP = clamp01((p - 0.6) / 0.4);
    const scale = 0.6 + 0.4 * easeOutBack(landP);
    const pt = iso(tx, ty, tz);

    // Final size/colour at p=1 intentionally match _drawSpecimenDecal exactly
    // (that method takes over once this step completes) so the hand-off is seamless.
    ctx.save();
    ctx.globalAlpha = clamp01(p * 3);
    if (track === 'onion') {
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, ISO_ELLIPSE_RX * 0.82 * scale, ISO_ELLIPSE_RY * 0.34 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,250,230,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, ISO_ELLIPSE_RX * 0.78 * scale, ISO_ELLIPSE_RY * 0.3 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,114,182,0.3)';
      ctx.fill();
    }
    ctx.restore();
  }

  /** A small reagent bottle: translucent glass over a gently glowing liquid. */
  _drawStainBottle(ctx, liquidColor) {
    const { x, y, r, h } = BOTTLE_POS;
    drawIsoShadow(ctx, x, y, r * 1.3, 0.4);

    const fillH = h * 0.6;
    drawIsoCylinder(ctx, x, y, 0.03, fillH, r * 0.84, r * 0.84, liquidColor, { topColor: shade(liquidColor, 0.3) });
    drawIsoCylinder(ctx, x, y, 0, h, r, r, '#c7d2e0', { alpha: 0.32, topColor: 'rgba(255,255,255,0.18)', stroke: COLORS.glassGlow });
    drawIsoCylinder(ctx, x, y, h, h + 0.16, r * 0.4, r * 0.4, '#94a3b8', { alpha: 0.9 });
    drawIsoCylinder(ctx, x, y, h + 0.16, h + 0.3, r * 0.46, r * 0.42, COLORS.metalDark, { topColor: '#475569' });

    // Signature touch: the reagent glows, like every molecule elsewhere in this suite.
    const lp = iso(x, y, fillH * 0.5);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.12 * Math.sin(this._time * 2);
    const glowR = r * ISO_ELLIPSE_RX * 1.7;
    const glow = ctx.createRadialGradient(lp.x, lp.y, 2, lp.x, lp.y, glowR);
    glow.addColorStop(0, shade(liquidColor, 0.3));
    glow.addColorStop(1, `${liquidColor}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(lp.x, lp.y, glowR, glowR * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawGlassSlide(ctx) {
    drawIsoShadow(ctx, SLIDE_CENTER.x, SLIDE_CENTER.y, 1.7, 0.35);
    drawIsoBox(ctx, SLIDE_POS.x0, SLIDE_POS.y0, 0, SLIDE_POS.wx, SLIDE_POS.wy, SLIDE_POS.h, '#c3d6e8', {
      alpha: 0.5, topAmt: 0.35, rightAmt: -0.06, leftAmt: -0.26, stroke: COLORS.glassGlow,
    });
    ctx.save();
    ctx.font = '500 9.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    const label = iso(SLIDE_CENTER.x, SLIDE_CENTER.y + SLIDE_POS.wy / 2 + 0.34, 0);
    ctx.fillText('glass slide', label.x, label.y);
    ctx.restore();
  }

  _drawSpecimenDecal(ctx, track, p) {
    const c = isoDecal(SLIDE_CENTER.x, SLIDE_CENTER.y, SLIDE_POS.h + 0.01, 0, 0);
    const scale = 0.5 + 0.5 * p;
    ctx.save();
    ctx.globalAlpha = clamp01(p * 1.5);
    if (track === 'onion') {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, ISO_ELLIPSE_RX * 0.82 * scale, ISO_ELLIPSE_RY * 0.34 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,250,230,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, ISO_ELLIPSE_RX * 0.78 * scale, ISO_ELLIPSE_RY * 0.3 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,114,182,0.3)';
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWaterStep(ctx, p) {
    const { x: dx, y: dy } = DROPPER_POS;
    const descendP = clamp01(p / 0.5);
    const hoverZ = lerp(1.7, 0.95, easeInOut(descendP));

    drawIsoCylinder(ctx, dx, dy, hoverZ, hoverZ + 0.55, 0.15, 0.15, '#94a3b8', { alpha: 0.85, stroke: 'rgba(255,255,255,0.3)' });
    drawIsoCylinder(ctx, dx, dy, hoverZ - 0.14, hoverZ, 0.05, 0.15, '#38bdf8', { alpha: 0.7 });

    if (p > 0.5 && p < 0.85) {
      const fallP = clamp01((p - 0.5) / 0.35);
      const dp = iso(dx, dy, lerp(hoverZ - 0.16, 0.16, fallP));
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#7dd3fc';
      ctx.fill();
      ctx.restore();
    } else if (p >= 0.85) {
      const spread = clamp01((p - 0.85) / 0.15);
      const pool = iso(SLIDE_CENTER.x, SLIDE_CENTER.y, SLIDE_POS.h + 0.005);
      ctx.save();
      ctx.globalAlpha = 0.55 * spread;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14 * spread;
      ctx.beginPath();
      ctx.ellipse(pool.x, pool.y, ISO_ELLIPSE_RX * 0.95 * spread, ISO_ELLIPSE_RY * 0.4 * spread, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.restore();
    }
  }

  _drawStainStep(ctx, track, p) {
    // A bead of dye falls from the bottle and spreads into a gently glowing
    // tinted pool — the same "science glows" motif used for the water drop.
    const stainColor = TRACKS[track].stainColor;
    if (p < 0.4) {
      const fallP = clamp01(p / 0.4);
      const dz = lerp(BOTTLE_POS.h + 0.1, SLIDE_POS.h + 0.1, easeInOut(fallP));
      const dx = lerp(BOTTLE_POS.x, SLIDE_CENTER.x - 0.3, fallP);
      const dy = lerp(BOTTLE_POS.y, SLIDE_CENTER.y, fallP);
      const dp = iso(dx, dy, dz);
      ctx.save();
      ctx.shadowColor = stainColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = stainColor;
      ctx.fill();
      ctx.restore();
    } else {
      const spread = clamp01((p - 0.4) / 0.6);
      const pool = iso(SLIDE_CENTER.x, SLIDE_CENTER.y, SLIDE_POS.h + 0.008);
      ctx.save();
      ctx.globalAlpha = 0.55 * spread;
      ctx.shadowColor = stainColor;
      ctx.shadowBlur = 12 * spread * (0.65 + 0.35 * Math.sin(this._time * 2));
      ctx.beginPath();
      ctx.ellipse(pool.x, pool.y, ISO_ELLIPSE_RX * 1.05 * spread, ISO_ELLIPSE_RY * 0.42 * spread, 0, 0, Math.PI * 2);
      ctx.fillStyle = stainColor;
      ctx.fill();
      ctx.restore();
    }
  }

  /** Coverslip hinged at its back edge, sweeping from a 58° tilt down to flat. */
  _drawCoverslipIso(ctx, p) {
    const angle = lerp(58 * Math.PI / 180, 0, p);
    const reach = COVER_W * Math.cos(angle);
    const riseZ = COVER_W * Math.sin(angle);
    const x0 = COVER_HINGE.x - COVER_W / 2, x1 = COVER_HINGE.x + COVER_W / 2;
    const baseZ = SLIDE_POS.h + 0.02;
    const y1 = COVER_HINGE.y + reach;

    const a = iso(x0, COVER_HINGE.y, baseZ), b = iso(x1, COVER_HINGE.y, baseZ);
    const c = iso(x1, y1, baseZ + riseZ), d = iso(x0, y1, baseZ + riseZ);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(224,242,254,0.32)';
    ctx.fill();
    ctx.strokeStyle = COLORS.glassGlow;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    if (p >= 1) {
      const label = iso(COVER_HINGE.x, COVER_HINGE.y + COVER_W * 0.55, baseZ + 0.4);
      ctx.save();
      ctx.fillStyle = COLORS.ok;
      ctx.font = '700 10px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('no air bubbles ✓', label.x, label.y);
      ctx.restore();
    }
  }

  _drawStepCaption(ctx, step, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 12px Inter, system-ui';
    ctx.fillStyle = '#7dd3fc';
    ctx.textAlign = 'left';
    ctx.fillText(`🔬  ${TRACKS[this.track].label.toUpperCase()} — SLIDE PREPARATION`, 16, 24);
    ctx.restore();
  }

  // ── Eyepiece layer ───────────────────────────────────────────────────────

  _drawEyepieceLayer(ctx, alpha) {
    if (alpha <= 0.01) return;
    const revealT = clamp01(alpha);
    const r = FOV.r * easeInOut(revealT);
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(FOV.x, FOV.y, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = '#04070f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(FOV.x, FOV.y, r, 0, Math.PI * 2);
    ctx.clip();

    const track = this.track;
    const bright = ctx.createRadialGradient(FOV.x, FOV.y, 4, FOV.x, FOV.y, r);
    bright.addColorStop(0, '#fdfaf1');
    bright.addColorStop(0.75, '#f3ecd8');
    bright.addColorStop(1, '#e7dcb8');
    ctx.fillStyle = bright;
    ctx.fillRect(FOV.x - r, FOV.y - r, r * 2, r * 2);

    // Racking into focus: the field starts zoomed in and slightly soft, then
    // eases out to true magnification and snaps sharp — like turning the
    // focus knob rather than a plain fade/reveal.
    const zoomScale = lerp(2.3, 1, easeInOut(revealT));
    const blurPx = lerp(8, 0, clamp01(revealT * 1.25));
    ctx.save();
    ctx.translate(FOV.x, FOV.y);
    if (blurPx > 0.05) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    ctx.scale(zoomScale, zoomScale);
    if (track === 'onion') this._drawOnionCells(ctx, this._cellGeo.onion, TRACKS.onion);
    else if (track === 'cheek') this._drawCheekCells(ctx, this._cellGeo.cheek, TRACKS.cheek);
    ctx.restore();
    ctx.restore();

    // A brief bloom + expanding ring pulse the instant the view locks into focus.
    if (this._focusFlashT >= 0 && this._focusFlashT < FOCUS_FLASH_DUR) {
      const ft = this._focusFlashT / FOCUS_FLASH_DUR;
      ctx.save();
      ctx.globalAlpha = (1 - ft) * 0.4;
      const bloomR = r * 0.5;
      const bloom = ctx.createRadialGradient(FOV.x, FOV.y, 0, FOV.x, FOV.y, bloomR);
      bloom.addColorStop(0, 'rgba(255,255,255,0.9)');
      bloom.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(FOV.x, FOV.y, bloomR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = (1 - ft) * 0.6;
      ctx.beginPath();
      ctx.arc(FOV.x, FOV.y, Math.min(r, r * (0.3 + ft * 0.85)), 0, Math.PI * 2);
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 2.5 * (1 - ft) + 1;
      ctx.stroke();
      ctx.restore();
    }

    if (alpha > 0.85) {
      ctx.save();
      ctx.globalAlpha = clamp01((alpha - 0.85) / 0.15);
      this._drawEyepieceLabels(ctx, track);
      ctx.restore();
      this._drawScopeCaption(ctx, track);
    }
  }

  _drawOnionCells(ctx, cells, t) {
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = COLORS.wallGreen;
    for (const c of cells) {
      const bob = Math.sin(this._time * 0.5 + c.bob) * 0.6;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.beginPath();
      ctx.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 5);
      ctx.fillStyle = COLORS.onionFlesh;
      ctx.fill();
      ctx.strokeStyle = COLORS.wallGreen;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // nucleus
      const nx = c.nx * c.w, ny = c.ny * c.h;
      const ng = ctx.createRadialGradient(nx - 2, ny - 2, 1, nx, ny, c.nr);
      ng.addColorStop(0, '#f87171');
      ng.addColorStop(1, t.nucleusColor);
      ctx.beginPath();
      ctx.ellipse(nx, ny, c.nr, c.nr * 0.8, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = ng;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawCheekCells(ctx, cells, t) {
    ctx.save();
    for (const c of cells) {
      const bob = Math.sin(this._time * 0.4 + c.bob) * 0.8;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.rotate(c.rot);
      ctx.beginPath();
      c.radii.forEach((rr, i) => {
        const a = (i / c.radii.length) * Math.PI * 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.85;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(96, 165, 250, 0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // granular cytoplasm specks
      ctx.fillStyle = 'rgba(37, 99, 235, 0.35)';
      for (const s of c.speck) {
        ctx.beginPath();
        ctx.arc(Math.cos(s.a) * s.d, Math.sin(s.a) * s.d, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // nucleus — larger, rounder, deep blue (no wall means cell drifts loosely around it)
      const nx = c.nx * 30, ny = c.ny * 30;
      const ng = ctx.createRadialGradient(nx - 2, ny - 2, 1, nx, ny, c.nr);
      ng.addColorStop(0, '#60a5fa');
      ng.addColorStop(1, t.nucleusColor);
      ctx.beginPath();
      ctx.ellipse(nx, ny, c.nr, c.nr * 0.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = ng;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawEyepieceLabels(ctx, track) {
    const items = track === 'onion'
      ? [
        { text: 'Cell Wall', x: FOV.x - 108, y: FOV.y - 96, tx: FOV.x - 132, ty: FOV.y - 128, color: COLORS.wallGreen },
        { text: 'Nucleus (safranin-stained)', x: FOV.x - 4, y: FOV.y - 30, tx: FOV.x + 96, ty: FOV.y - 96, color: COLORS.nucleusRed },
        { text: 'Vacuole (cytoplasm)', x: FOV.x + 60, y: FOV.y + 40, tx: FOV.x + 118, ty: FOV.y + 90, color: '#fde68a' },
      ]
      : [
        { text: 'No Cell Wall (irregular edge)', x: FOV.x - 120, y: FOV.y - 70, tx: FOV.x - 150, ty: FOV.y - 118, color: '#93c5fd' },
        { text: 'Nucleus (methylene-blue-stained)', x: FOV.x + 4, y: FOV.y - 15, tx: FOV.x + 108, ty: FOV.y - 90, color: COLORS.nucleusBlue },
        { text: 'Cytoplasm', x: FOV.x + 90, y: FOV.y + 50, tx: FOV.x + 140, ty: FOV.y + 96, color: '#a5f3fc' },
      ];
    for (const it of items) this._drawLeaderLabel(ctx, it);
  }

  _drawLeaderLabel(ctx, { text, x, y, tx, ty, color }) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '700 10.5px Inter, system-ui';
    const w = ctx.measureText(text).width + 16;
    const bx = Math.max(6, Math.min(W - w - 6, tx - w / 2));
    const by = ty - 10;
    ctx.beginPath();
    ctx.roundRect(bx, by - 14, w, 20, 10);
    ctx.fillStyle = 'rgba(9,15,30,0.9)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + w / 2, by - 3.5);
    ctx.restore();
  }

  _drawScopeCaption(ctx, track) {
    const t = TRACKS[track];
    const text = track === 'onion'
      ? 'Regular brick-shaped cells with a visible cell wall — typical of plant tissue.'
      : 'Irregular, unwalled cells that change shape easily — typical of animal tissue.';
    ctx.save();
    ctx.font = '700 12px Inter, system-ui';
    ctx.fillStyle = '#7dd3fc';
    ctx.textAlign = 'left';
    ctx.fillText(`👁️  ${t.label.toUpperCase()} — 100× FIELD OF VIEW`, 16, 24);
    ctx.font = '500 11.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(text, 16, 462);
    ctx.restore();
  }

  // ── Compare view ─────────────────────────────────────────────────────────

  _drawCompare(ctx) {
    const half = W / 2;
    const r = 150;
    const cy = 250;
    const centers = [{ cx: half / 2 + 12, track: 'onion' }, { cx: half + half / 2 - 12, track: 'cheek' }];
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.beginPath(); ctx.moveTo(half, 60); ctx.lineTo(half, 420); ctx.stroke();

    for (const { cx, track } of centers) {
      const t = TRACKS[track];
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = '#04070f';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const bright = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      bright.addColorStop(0, '#fdfaf1');
      bright.addColorStop(1, '#e7dcb8');
      ctx.fillStyle = bright;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.translate(cx, cy);
      ctx.scale(0.82, 0.82);
      if (track === 'onion') this._drawOnionCells(ctx, this._cellGeo.onion, TRACKS.onion);
      else this._drawCheekCells(ctx, this._cellGeo.cheek, TRACKS.cheek);
      ctx.restore();

      ctx.font = '700 12.5px Inter, system-ui';
      ctx.fillStyle = t.stainColor;
      ctx.textAlign = 'center';
      ctx.fillText(`${t.icon} ${t.label}`, cx, cy - r - 16);
      ctx.restore();
    }

    ctx.font = '600 11px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText('Wall + regular rows (plant)', half / 2 + 12, cy + r + 30);
    ctx.fillText('No wall + irregular shapes (animal)', half + half / 2 - 12, cy + r + 30);

    ctx.font = '700 13px Inter, system-ui';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('The cell wall is the key difference between plant and animal cells', half, 448);
    ctx.restore();
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
