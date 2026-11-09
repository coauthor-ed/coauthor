import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * BuildACellScene — Part 2.1 "Build-a-Cell (Prokaryotic vs. Eukaryotic)".
 *
 * The student picks a cell type — 🦠 Bacterial, 🌿 Plant or 🔬 Animal — and then
 * drags organelles out of the palette into an empty cell. Every organelle is
 * validated against the chosen cell type:
 *
 *   ✔ valid   → it flies to its correct anatomical position, pops in with a
 *               green halo and a one-line "what it does" fact.
 *   ✘ invalid → the cell flashes red, the palette chip shakes, and a short
 *               explanation says *why* it does not belong there
 *               ("Animal cells can't make their own food — no chloroplasts!").
 *
 * When every essential part is in place the cell "comes to life": cytoplasmic
 * streaming speeds up, the organelles breathe, and a banner celebrates.
 *
 * ── Deviations from the sprint spec (deliberate) ──────────────────────────
 * The spec sketches this as a pure-DOM `DragDropSimulation`. The cell body and
 * the organelles are instead drawn on a Canvas-2D layer, matching the rest of
 * the biology suite (RibosomeScene / BoundaryDesignScene / PlasmolysisScene):
 * only canvas gives us the layered gradients, cristae, thylakoid grana and
 * phospholipid bilayers that make the structures anatomically readable. The
 * *controls* still live in the DOM as the accessibility rule requires — the
 * palette is a list of real <button>s that are keyboard-operable (Enter/Space
 * places, Enter again removes) and HTML5-draggable onto the canvas. Each chip's
 * thumbnail is painted by the very same painter used on the stage, so the icon
 * a student drags is pixel-identical to the organelle they get.
 *
 * Structural detail follows Wikipedia's Bacterial cell structure / Plant cell /
 * Endomembrane system articles: peptidoglycan vs. cellulose walls, a naked
 * supercoiled nucleoid vs. a pore-studded nuclear envelope, 70S vs. 80S
 * ribosomes, cristae, grana + stroma lamellae, cis/trans Golgi faces and a
 * tonoplast-bounded central vacuole.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — the hex values
 * from sim-theme.css are inlined in COLORS below.
 */

const W = 600;
const H = 460;

const COLORS = {
  bgDeep:      '#070c1a',
  cytoplasm:   'rgba(30, 58, 95, 0.55)',

  membrane:    '#4f9cf7',
  lipidHead:   '#7dd3fc',
  lipidTail:   'rgba(79, 156, 247, 0.45)',

  wallPlant:   '#a3e635',
  wallBact:    '#c4b5fd',

  nucleus:     '#6366f1',
  nucleolus:   '#3730a3',
  nucleoid:    '#818cf8',

  mito:        '#f59e0b',
  mitoDark:    '#b45309',
  chloro:      '#22c55e',
  chloroDark:  '#15803d',
  thylakoid:   '#166534',
  er:          '#818cf8',
  golgi:       '#ec4899',
  lysosome:    '#ef4444',
  ribosome:    '#cbd5e1',
  vacuole:     '#06b6d4',
  flagellum:   '#f472b6',

  ok:          '#34d399',
  err:         '#f87171',
  textMain:    '#f1f5f9',
  textMuted:   '#94a3b8',
  ghost:       'rgba(148, 163, 184, 0.45)',
};

/* ── Glossary — cycles in the bottom-left card, and jumps to the organelle
      the student just placed or is hovering. ───────────────────────────── */
const GLOSSARY = {
  membrane: { term: 'Cell Membrane (Plasma Membrane)',
    desc: 'A double sheet of phospholipids — the "fluid mosaic".\nSelectively permeable: it chooses what enters and leaves.' },
  wall: { term: 'Cell Wall',
    desc: 'A rigid coat OUTSIDE the membrane. Cellulose in plants,\npeptidoglycan in bacteria. It gives shape and protection.' },
  nucleus: { term: 'Nucleus',
    desc: 'The control room. A double membrane pierced by nuclear pores\nholds the chromatin (DNA) and the dark, dense nucleolus.' },
  nucleoid: { term: 'Nucleoid',
    desc: 'In bacteria the DNA is one supercoiled circular loop lying\nnaked in the cytoplasm — there is no nuclear membrane at all.' },
  ribosome: { term: 'Ribosome',
    desc: 'The smallest organelle — two subunits, no membrane.\nProtein factories: 70S in bacteria, larger 80S in eukaryotes.' },
  mitochondrion: { term: 'Mitochondrion',
    desc: 'The powerhouse. Its inner membrane folds into cristae,\ngiving a huge surface area for releasing energy as ATP.' },
  chloroplast: { term: 'Chloroplast',
    desc: 'A green plastid. Stacks of thylakoid discs (grana) float in\nthe stroma and trap sunlight to make food.' },
  er: { term: 'Endoplasmic Reticulum',
    desc: 'A network of sacs joined to the nuclear envelope. Rough ER is\nstudded with ribosomes (proteins); smooth ER makes fats.' },
  golgi: { term: 'Golgi Apparatus',
    desc: 'A stack of flattened cisternae. Proteins enter the cis face,\nget packaged, and bud off the trans face inside vesicles.' },
  lysosome: { term: 'Lysosome',
    desc: 'The "suicide bag" — a sac of digestive enzymes that breaks\ndown worn-out organelles, food particles and germs.' },
  vacuole: { term: 'Central Vacuole',
    desc: 'A giant sap-filled bag bounded by the tonoplast. It can fill\n80–90% of a plant cell and keeps it firm (turgid).' },
  flagellum: { term: 'Flagellum',
    desc: 'A whip-like filament spun by a rotary motor (basal body)\nanchored in the membrane — it lets a bacterium swim.' },
  cytoplasm: { term: 'Cytoplasm',
    desc: 'The jelly-like fluid filling the cell. Organelles float and\nstream through it — this movement is cyclosis.' },
  prokaryote: { term: 'Prokaryote vs. Eukaryote',
    desc: 'Prokaryotes (bacteria) have no nucleus and no membrane-bound\norganelles. Eukaryotes — plants, animals, fungi — have both.' },
};

/** Order shown in the palette: boundary → genetic material → the rest. */
const PALETTE_ORDER = [
  'membrane', 'wall', 'nucleus', 'nucleoid', 'ribosome', 'mitochondrion',
  'chloroplast', 'er', 'golgi', 'lysosome', 'vacuole', 'flagellum',
];

const ORGANELLES = {
  membrane:      { name: 'Cell Membrane',        color: COLORS.membrane },
  wall:          { name: 'Cell Wall',            color: COLORS.wallPlant },
  nucleus:       { name: 'Nucleus',              color: COLORS.nucleus },
  nucleoid:      { name: 'Nucleoid Region',      color: COLORS.nucleoid },
  ribosome:      { name: 'Ribosomes',            color: COLORS.ribosome },
  mitochondrion: { name: 'Mitochondria',         color: COLORS.mito },
  chloroplast:   { name: 'Chloroplasts',         color: COLORS.chloro },
  er:            { name: 'Endoplasmic Reticulum', color: COLORS.er },
  golgi:         { name: 'Golgi Apparatus',      color: COLORS.golgi },
  lysosome:      { name: 'Lysosomes',            color: COLORS.lysosome },
  vacuole:       { name: 'Central Vacuole',      color: COLORS.vacuole },
  flagellum:     { name: 'Flagellum',            color: COLORS.flagellum },
};

/** One-line reward shown when a part lands correctly. */
const FACTS = {
  membrane:      'The membrane is selectively permeable — it decides what gets in and out.',
  wall:          'The wall sits outside the membrane and stops the cell from bursting.',
  nucleus:       'The nucleus keeps the DNA safe behind a double membrane full of pores.',
  nucleoid:      'No membrane! The bacterial chromosome is one naked circular loop of DNA.',
  ribosome:      'Ribosomes have no membrane — that is why even bacteria have them.',
  mitochondrion: 'Cristae fold the inner membrane to pack in more energy-releasing surface.',
  chloroplast:   'Grana are stacks of thylakoid discs — the solar panels of the cell.',
  er:            'Rough ER is dotted with ribosomes; smooth ER is a bare tubular network.',
  golgi:         'Vesicles bud off the trans face and ship the finished proteins away.',
  lysosome:      'Its enzymes work best in acid — burst one and the cell digests itself.',
  vacuole:       'A full vacuole presses the cytoplasm outwards and holds the plant upright.',
  flagellum:     'The basal body is a real rotary motor — it spins the filament like a propeller.',
};

const CELL_TYPES = {
  bacterial: {
    key: 'bacterial', emoji: '🦠', label: 'Bacterial Cell', title: 'BACTERIAL CELL',
    tag: 'Prokaryote', scale: 'about 2 µm long — roughly 25× smaller than the plant cell',
    accent: '#c4b5fd',
    required: ['wall', 'membrane', 'nucleoid', 'ribosome'],
    bonus:    ['flagellum'],
  },
  plant: {
    key: 'plant', emoji: '🌿', label: 'Plant Cell', title: 'PLANT CELL',
    tag: 'Eukaryote', scale: 'about 50 µm across — box-shaped, held rigid by its wall',
    accent: '#a3e635',
    required: ['wall', 'membrane', 'nucleus', 'ribosome', 'mitochondrion', 'chloroplast', 'er', 'golgi', 'vacuole'],
    bonus:    [],
  },
  animal: {
    key: 'animal', emoji: '🔬', label: 'Animal Cell', title: 'ANIMAL CELL',
    tag: 'Eukaryote', scale: 'about 20 µm across — no wall, so its shape is irregular',
    accent: '#f472b6',
    required: ['membrane', 'nucleus', 'ribosome', 'mitochondrion', 'er', 'golgi', 'lysosome'],
    bonus:    [],
  },
};

/** Why an organelle does NOT belong in a given cell type. */
const REJECT = {
  bacterial: {
    nucleus:       'Bacteria are prokaryotes — no true nucleus! Their DNA lies free in the nucleoid.',
    mitochondrion: 'Prokaryotes have NO membrane-bound organelles. Bacteria respire using the plasma membrane itself.',
    chloroplast:   'No chloroplasts in bacteria. Photosynthetic bacteria use simple membrane folds instead.',
    er:            'The ER is a eukaryote invention — bacteria have no internal membrane system.',
    golgi:         'No Golgi in bacteria. With no ER there is nothing to package!',
    lysosome:      'No lysosomes in bacteria — again, no membrane-bound organelles.',
    vacuole:       'A large central vacuole belongs to plant cells, not to bacteria.',
  },
  plant: {
    nucleoid:      'Only prokaryotes have a nucleoid. A plant cell keeps its DNA inside a proper nucleus.',
    lysosome:      'Plant cells rarely have lysosomes — the big central vacuole does the digesting and recycling.',
    flagellum:     'A typical plant cell is anchored in place and has no flagellum.',
  },
  animal: {
    wall:          'Animal cells have NO cell wall — only a flexible membrane. That is why animals can move and change shape.',
    nucleoid:      'Only prokaryotes have a nucleoid. An animal cell keeps its DNA inside a proper nucleus.',
    chloroplast:   'Animal cells cannot make their own food — no chloroplasts! Photosynthesis is a plant job.',
    vacuole:       'Animal cells have only tiny vacuoles. The huge central vacuole is a plant speciality.',
    flagellum:     'A typical animal cell has no flagellum. (A sperm tail is a rare, specialised exception.)',
  },
};

/* ── Cell body geometry ──────────────────────────────────────────────────── */
/** `pad` = how far inside the membrane loose contents (ribosomes, streaming
    dots) are allowed to wander. */
const BODY = {
  bacterial: { shape: 'capsule', cx: 290, cy: 224, w: 372, h: 146, wall: 12, pad: 16 },
  plant:     { shape: 'rrect',   cx: 306, cy: 226, w: 380, h: 268, r: 26, wall: 13, pad: 16 },
  animal:    { shape: 'blob',    cx: 306, cy: 228, w: 320, h: 320, wall: 0,  pad: 26 },
};

/**
 * Anatomical parking slots. Every entry is {x, y, rot, s} in canvas units.
 * `ribosome` is generated procedurally (see _ribosomeSlots) because free
 * ribosomes really are scattered at random through the cytoplasm.
 */
const SLOTS = {
  bacterial: {
    nucleoid:  [{ x: 282, y: 224, rot: 0, s: 1 }],
    flagellum: [{ x: 476, y: 224, rot: 0, s: 1 }],
  },
  plant: {
    // The vacuole fills the middle; everything else is squeezed into the thin
    // peripheral band of cytoplasm — exactly what happens in a mature plant cell.
    vacuole: [{ x: 306, y: 226, rot: 0, s: 1 }],
    nucleus: [{ x: 166, y: 250, rot: 0, s: 0.62 }],
    er:      [{ x: 166, y: 181, rot: 0, s: 0.55 }],
    golgi:   [{ x: 252, y: 310, rot: 0, s: 0.68 }],
    mitochondrion: [
      { x: 446, y: 206, rot: 1.40, s: 0.72 },
      { x: 430, y: 308, rot: -0.45, s: 0.72 },
      { x: 168, y: 318, rot: 0.30, s: 0.72 },
    ],
    chloroplast: [
      { x: 190, y: 142, rot: 0.16, s: 0.86 },
      { x: 262, y: 136, rot: 0.10, s: 0.86 },
      { x: 336, y: 134, rot: -0.12, s: 0.86 },
      { x: 410, y: 140, rot: 0.18, s: 0.86 },
      { x: 446, y: 282, rot: 1.50, s: 0.86 },
      { x: 340, y: 314, rot: -0.16, s: 0.86 },
    ],
  },
  animal: {
    nucleus: [{ x: 274, y: 196, rot: 0, s: 1.05 }],
    // Rough ER deliberately touches the nucleus — the two are continuous.
    er:      [{ x: 366, y: 254, rot: 0.12, s: 0.92 }],
    golgi:   [{ x: 236, y: 288, rot: 0, s: 0.96 }],
    mitochondrion: [
      { x: 364, y: 158, rot: -0.50, s: 0.96 },
      { x: 225, y: 179, rot: 0.45, s: 0.96 },
      { x: 336, y: 314, rot: 0.25, s: 0.96 },
    ],
    lysosome: [
      { x: 406, y: 235, rot: 0, s: 1.05 },
      { x: 297, y: 344, rot: 0, s: 0.95 },
      { x: 195, y: 258, rot: 0, s: 1.1 },
    ],
  },
};

/** Scale (and re-centring offset) that fits each painter into a 48×48 chip icon. */
const THUMB_FIT = {
  membrane:      { s: 0.46 },
  wall:          { s: 0.48 },
  nucleus:       { s: 0.44 },
  nucleoid:      { s: 0.26 },
  ribosome:      { s: 2.6 },
  mitochondrion: { s: 0.52 },
  chloroplast:   { s: 0.62 },
  er:            { s: 0.40, tx: 3, ty: -2 },
  golgi:         { s: 0.50, ty: 4 },
  lysosome:      { s: 1.5 },
  vacuole:       { s: 0.17 },
  flagellum:     { s: 0.38, tx: 46 },
};

/** Approximate hover/hit radius per organelle at s = 1. */
const HIT_R = {
  nucleus: 50, nucleoid: 82, mitochondrion: 42, chloroplast: 34, er: 52,
  golgi: 36, lysosome: 16, ribosome: 9, vacuole: 96, flagellum: 40,
};

/* ── Small deterministic PRNG so scattered ribosomes never jitter ───────── */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Smooth "pop" easing: overshoots slightly then settles. */
function easeBack(t) {
  const c = 1.70158 + 1;
  const u = t - 1;
  return 1 + c * u * u * u + 1.70158 * u * u;
}

/* ── Outline sampling ────────────────────────────────────────────────────
   Every cell shape is reduced to a closed polyline with outward normals, so
   the membrane bilayer, the wall band and the "is this point inside?" test
   can all share one code path.                                            */

/** Blob radius for the irregular animal cell. */
function blobR(baseR, theta) {
  return baseR * (1 + 0.055 * Math.sin(3 * theta + 0.7) + 0.035 * Math.sin(5 * theta + 2.3));
}

function rawOutline(type, inset) {
  const b = BODY[type];
  const pts = [];
  if (b.shape === 'blob') {
    const R = b.w / 2 - inset;
    for (let i = 0; i < 360; i++) {
      const th = (i / 360) * Math.PI * 2;
      const r = blobR(R, th);
      pts.push({ x: b.cx + Math.cos(th) * r, y: b.cy + Math.sin(th) * r });
    }
    return pts;
  }

  const hw = b.w / 2 - inset;
  const hh = b.h / 2 - inset;
  const r = b.shape === 'capsule' ? hh : Math.max(4, (b.r ?? 20) - inset * 0.4);
  const segs = [];
  const line = (x1, y1, x2, y2) => segs.push({ t: 'l', x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1) });
  const arc  = (x, y, a0, a1) => segs.push({ t: 'a', x, y, r, a0, a1, len: Math.abs(a1 - a0) * r });

  // clockwise, starting at the right edge
  line(b.cx + hw, b.cy - hh + r, b.cx + hw, b.cy + hh - r);
  arc(b.cx + hw - r, b.cy + hh - r, 0, Math.PI / 2);
  line(b.cx + hw - r, b.cy + hh, b.cx - hw + r, b.cy + hh);
  arc(b.cx - hw + r, b.cy + hh - r, Math.PI / 2, Math.PI);
  line(b.cx - hw, b.cy + hh - r, b.cx - hw, b.cy - hh + r);
  arc(b.cx - hw + r, b.cy - hh + r, Math.PI, Math.PI * 1.5);
  line(b.cx - hw + r, b.cy - hh, b.cx + hw - r, b.cy - hh);
  arc(b.cx + hw - r, b.cy - hh + r, Math.PI * 1.5, Math.PI * 2);

  const total = segs.reduce((a, s) => a + s.len, 0);
  const n = Math.max(120, Math.round(total / 3));
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    for (const s of segs) {
      if (d > s.len) { d -= s.len; continue; }
      const u = s.len === 0 ? 0 : d / s.len;
      if (s.t === 'l') pts.push({ x: lerp(s.x1, s.x2, u), y: lerp(s.y1, s.y2, u) });
      else {
        const a = lerp(s.a0, s.a1, u);
        pts.push({ x: s.x + Math.cos(a) * s.r, y: s.y + Math.sin(a) * s.r });
      }
      break;
    }
  }
  return pts;
}

/** Resample an outline at `spacing` px and attach outward unit normals. */
function outlinePoints(type, inset, spacing) {
  const raw = rawOutline(type, inset);
  const b = BODY[type];
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) {
    const p = raw[i - 1], q = raw[i % raw.length];
    cum.push(cum[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
  }
  const perim = cum[raw.length];
  const n = Math.max(48, Math.round(perim / spacing));
  const out = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * perim;
    while (seg < raw.length - 1 && cum[seg + 1] < d) seg++;
    const p = raw[seg], q = raw[(seg + 1) % raw.length];
    const segLen = cum[seg + 1] - cum[seg] || 1;
    const u = (d - cum[seg]) / segLen;
    out.push({ x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u) });
  }
  for (let i = 0; i < n; i++) {
    const p = out[(i - 1 + n) % n], q = out[(i + 1) % n], c = out[i];
    let tx = q.x - p.x, ty = q.y - p.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let nx = ty, ny = -tx;
    if ((c.x - b.cx) * nx + (c.y - b.cy) * ny < 0) { nx = -nx; ny = -ny; }
    c.nx = nx; c.ny = ny;
  }
  return out;
}

function isInside(type, x, y, inset) {
  const b = BODY[type];
  if (b.shape === 'blob') {
    const dx = x - b.cx, dy = y - b.cy;
    const th = Math.atan2(dy, dx);
    return Math.hypot(dx, dy) < blobR(b.w / 2 - inset, th);
  }
  const hw = b.w / 2 - inset, hh = b.h / 2 - inset;
  const r = b.shape === 'capsule' ? hh : Math.max(2, (b.r ?? 20) - inset * 0.4);
  const dx = Math.abs(x - b.cx), dy = Math.abs(y - b.cy);
  if (dx > hw || dy > hh) return false;
  if (dx <= hw - r || dy <= hh - r) return true;
  return Math.hypot(dx - (hw - r), dy - (hh - r)) <= r;
}

export class BuildACellScene extends CanvasSimulation {
  static WIDTH  = W;
  static HEIGHT = H;

  static ARIA_LABEL =
    'Build-a-Cell workbench. Choose a bacterial, plant or animal cell, then place ' +
    'organelles from the palette into the empty cell. Parts that do not belong in ' +
    'that cell type are rejected with an explanation.';

  static CONTROLS = [
    { type: 'button', id: 'showme', label: '🪄 Build It For Me' },
    { type: 'button', id: 'reset',  label: '↻ Empty the Cell' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.cellType   = 'animal';
    /** Map<organelleId, Array<{x,y,rot,s,born}>> for the current cell. */
    this.placed     = new Map();
    this._time      = 0;
    this._settle    = false;  // true while painting a one-off static frame
    this._complete  = false;
    this._completeT = 0;

    this._toast     = null;   // { text, kind, life, max }
    this._reject    = 0;      // red-flash timer
    this._focus     = null;   // { id, until } — organelle whose glossary card is pinned
    this._hover     = null;   // { id, x, y, r }
    this._glossKeys = ['cytoplasm'];   // rebuilt per cell type in _setCellType
    this._glossIdx  = 0;
    this._glossT    = 0;

    this._dots      = [];     // cytoplasmic streaming
    this._fx        = [];     // sparkles / bursts
    this._outlineCache = new Map();

    this._rootEl = null;
    this._stageEl = null;
    this._paletteEl = null;
    this._statusEl = null;
    this._chips = new Map();
    this._modeBtns = new Map();
    this._ro = null;

    this._onDragOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    this._onDrop     = this._handleDrop.bind(this);
    this._onMove     = this._handlePointerMove.bind(this);
    this._onLeave    = () => { this._hover = null; };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    this._buildDom();
    await super.setup();                 // creates the canvas inside this.container
    this._stageEl.appendChild(this._canvas);   // …then move it into the stage

    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', BuildACellScene.ARIA_LABEL);
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:10px;';
    this._canvas.addEventListener('dragover', this._onDragOver);
    this._canvas.addEventListener('drop', this._onDrop);
    this._canvas.addEventListener('pointermove', this._onMove);
    this._canvas.addEventListener('pointerleave', this._onLeave);

    this._buildBgCache();
    this._setCellType('animal', true);
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    this._running = false;
    this.pause();
    if (this._canvas) {
      this._canvas.removeEventListener('dragover', this._onDragOver);
      this._canvas.removeEventListener('drop', this._onDrop);
      this._canvas.removeEventListener('pointermove', this._onMove);
      this._canvas.removeEventListener('pointerleave', this._onLeave);
    }
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._rootEl) { this._rootEl.remove(); this._rootEl = null; }
    this._bgCache = null;
    this._outlineCache.clear();
    super.destroy();
    this._ctx = null;
  }

  onControlChange(id) {
    if (id === 'reset')  this._reset();
    if (id === 'showme') this._autoBuild();
  }

  // ── DOM shell ─────────────────────────────────────────────────────────────

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .bac-root{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:9px;
        font-family:Inter,system-ui,sans-serif;line-height:1.3;color:var(--sim-label,#e2e8f0);}
      .bac-modebar{display:flex;gap:8px;flex-wrap:wrap;}
      .bac-mode{flex:1 1 0;min-width:112px;display:flex;align-items:center;justify-content:center;gap:6px;
        padding:8px 10px;border-radius:10px;cursor:pointer;font:600 12.5px Inter,system-ui,sans-serif;
        color:var(--sim-label,#e2e8f0);background:var(--sim-bg-surface,#111827);
        border:1.5px solid rgba(148,163,184,0.28);transition:transform .12s,border-color .15s,box-shadow .15s;}
      .bac-mode:hover{transform:translateY(-1px);border-color:rgba(148,163,184,0.6);}
      .bac-mode[aria-pressed="true"]{border-color:var(--bac-accent,#818cf8);
        color:var(--sim-label,#e2e8f0);
        box-shadow:0 0 0 1px var(--bac-accent,#818cf8), 0 6px 18px -8px var(--bac-accent,#818cf8);
        background:linear-gradient(180deg,rgba(129,140,248,0.16),rgba(129,140,248,0.04)), var(--sim-bg-surface,#111827);}
      .bac-mode .bac-mode-em{font-size:15px;line-height:1;}

      .bac-main{display:flex;gap:10px;align-items:flex-start;}
      .bac-palette{flex:0 0 152px;display:flex;flex-direction:column;gap:4px;min-width:0;}
      .bac-stage{flex:1 1 auto;min-width:0;position:relative;}

      .bac-chip{position:relative;display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;
        padding:4px 6px;border-radius:8px;cursor:grab;text-align:left;
        background:var(--sim-bg-surface,#111827);border:1.5px solid rgba(148,163,184,0.22);
        color:var(--sim-label,#e2e8f0);font:600 10px Inter,system-ui,sans-serif;
        transition:transform .12s,border-color .15s,background .15s;}
      .bac-chip:hover{transform:translateX(2px);border-color:rgba(148,163,184,0.55);}
      .bac-chip:focus-visible{outline:2px solid var(--sim-accent,#818cf8);outline-offset:2px;}
      /* Host shells (content-block, poe-observe-sim) declare
         "canvas{width:100% !important}" for the stage canvas. Out-specify it so
         the palette icons keep their fixed size, and restate it for the stage. */
      .bac-root .bac-chip canvas{width:24px !important;height:24px !important;flex:0 0 24px;display:block;}
      .bac-root .bac-stage canvas{width:100% !important;height:auto !important;display:block;}
      .bac-chip .bac-chip-name{flex:1 1 auto;min-width:0;}
      .bac-chip[data-placed="1"]{background:linear-gradient(90deg,rgba(52,211,153,0.20),rgba(52,211,153,0.05)), var(--sim-bg-surface,#111827);
        border-color:rgba(52,211,153,0.65); color:var(--sim-label,#e2e8f0);}
      .bac-chip[data-placed="1"]::after{content:'✓';position:absolute;top:2px;right:5px;
        font-size:10px;font-weight:800;color:var(--sim-success,#34d399);}
      .bac-chip.bac-shake{animation:bacShake .42s cubic-bezier(.36,.07,.19,.97);
        border-color:#f87171 !important;
        background:linear-gradient(rgba(248,113,113,0.16),rgba(248,113,113,0.16)), var(--sim-bg-surface,#111827) !important;}
      @keyframes bacShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}
        30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}

      .bac-status{display:flex;align-items:center;gap:10px;padding:7px 11px;border-radius:9px;min-height:34px;
        box-sizing:border-box;background:var(--sim-bg-surface,#111827);border:1px solid rgba(148,163,184,0.2);}
      .bac-track{flex:0 0 108px;height:7px;border-radius:4px;background:rgba(148,163,184,0.22);overflow:hidden;}
      .bac-fill{height:100%;width:0;border-radius:4px;transition:width .35s ease;
        background:linear-gradient(90deg,#38bdf8,#34d399);}
      .bac-msg{flex:1 1 auto;min-width:0;font:500 11.5px Inter,system-ui,sans-serif;color:var(--sim-label,#cbd5e1);}
      .bac-count{flex:0 0 auto;font:700 11px Inter,system-ui,sans-serif;color:var(--sim-label,#94a3b8);
        white-space:nowrap;}

      .bac-root.bac-narrow .bac-main{flex-direction:column;}
      .bac-root.bac-narrow .bac-palette{flex:0 0 auto;flex-direction:row;flex-wrap:wrap;}
      .bac-root.bac-narrow .bac-chip{width:auto;flex:1 1 108px;}
      @media (prefers-reduced-motion: reduce){
        .bac-chip,.bac-mode{transition:none;}
        .bac-chip.bac-shake{animation:none;}
      }
    `;

    const root = document.createElement('div');
    root.className = 'bac-root';
    root.appendChild(style);

    // ── mode bar ──
    const modebar = document.createElement('div');
    modebar.className = 'bac-modebar';
    modebar.setAttribute('role', 'group');
    modebar.setAttribute('aria-label', 'Choose a cell type to build');
    for (const t of Object.values(CELL_TYPES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bac-mode';
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="bac-mode-em" aria-hidden="true">${t.emoji}</span><span>${t.label}</span>`;
      b.addEventListener('click', () => this._setCellType(t.key));
      modebar.appendChild(b);
      this._modeBtns.set(t.key, b);
    }

    // ── palette + stage ──
    const main = document.createElement('div');
    main.className = 'bac-main';

    const palette = document.createElement('div');
    palette.className = 'bac-palette';
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', 'Organelle palette — press Enter on a part to place it in the cell');
    for (const id of PALETTE_ORDER) palette.appendChild(this._buildChip(id));

    const stage = document.createElement('div');
    stage.className = 'bac-stage';

    main.appendChild(palette);
    main.appendChild(stage);

    // ── status bar (doubles as the aria-live region) ──
    const status = document.createElement('div');
    status.className = 'bac-status';
    status.innerHTML =
      '<div class="bac-track"><div class="bac-fill"></div></div>' +
      '<div class="bac-msg" role="status" aria-live="polite"></div>' +
      '<div class="bac-count"></div>';

    root.appendChild(modebar);
    root.appendChild(main);
    root.appendChild(status);
    this.container.appendChild(root);

    this._rootEl    = root;
    this._paletteEl = palette;
    this._stageEl   = stage;
    this._statusEl  = status;

    // Palette drops below the stage on narrow hosts (lesson side-by-side layout).
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect?.width || 0;
        root.classList.toggle('bac-narrow', w > 0 && w < 520);
      });
      this._ro.observe(root);
    }
  }

  _buildChip(id) {
    const o = ORGANELLES[id];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bac-chip';
    chip.draggable = true;
    chip.dataset.organelle = id;
    chip.dataset.placed = '0';
    chip.style.setProperty('--bac-col', o.color);

    const thumb = document.createElement('canvas');
    thumb.width = 48; thumb.height = 48;
    thumb.setAttribute('aria-hidden', 'true');
    this._renderThumb(thumb, id);

    const name = document.createElement('span');
    name.className = 'bac-chip-name';
    name.textContent = o.name;

    chip.appendChild(thumb);
    chip.appendChild(name);
    chip._thumb = thumb;
    chip.setAttribute('aria-label', `${o.name}. Press Enter to add it to the cell, or drag it onto the cell.`);

    chip.addEventListener('click', () => this._toggle(id));
    chip.addEventListener('dragstart', (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'copy';
      }
    });
    this._chips.set(id, chip);
    return chip;
  }

  /** Paint a palette icon with the exact painter used on the stage. */
  _renderThumb(canvasEl, id) {
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, 48, 48);
    // {s: scale, tx/ty: recentre painters whose artwork is not origin-centred}
    const fit = THUMB_FIT[id] || { s: 0.5 };
    ctx.save();
    ctx.translate(24, 24);
    ctx.scale(fit.s, fit.s);
    ctx.translate(-(fit.tx || 0), -(fit.ty || 0));
    this._painters(ctx, id, 0, /* thumb */ true);
    ctx.restore();
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  _handleDrop(e) {
    e.preventDefault();
    const id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    if (id && ORGANELLES[id]) this._place(id);
  }

  _handlePointerMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top)  * (H / rect.height);
    let best = null, bestD = Infinity;
    for (const [id, list] of this.placed) {
      const hr = HIT_R[id];
      if (!hr) continue;
      for (const inst of list) {
        const d = Math.hypot(inst.x - x, inst.y - y);
        const r = hr * (inst.s ?? 1);
        if (d < r && d < bestD) { bestD = d; best = { id, x: inst.x, y: inst.y, r }; }
      }
    }
    const changed = (best?.id || null) !== (this._hover?.id || null);
    this._hover = best;
    this._canvas.style.cursor = best ? 'help' : 'default';
    if (changed) this._paintOnce();
  }

  _setCellType(key, silent = false) {
    this.cellType = key;
    this.placed.clear();
    this._complete = false;
    this._completeT = 0;
    this._fx = [];
    this._focus = null;
    this._hover = null;
    this._toast = null;
    this._seedDots();
    // Only cycle glossary terms that actually apply to the cell on screen.
    this._glossKeys = [...CELL_TYPES[key].required, ...CELL_TYPES[key].bonus, 'cytoplasm', 'prokaryote']
      .filter(k => GLOSSARY[k]);
    this._glossIdx = 0;
    this._glossT = 0;
    for (const [k, b] of this._modeBtns) b.setAttribute('aria-pressed', String(k === key));
    if (this._rootEl) this._rootEl.style.setProperty('--bac-accent', CELL_TYPES[key].accent);
    // Peptidoglycan (bacteria) and cellulose (plants) are drawn in different
    // colours, so the wall icon has to follow the selected cell type.
    const wallChip = this._chips.get('wall');
    if (wallChip?._thumb) this._renderThumb(wallChip._thumb, 'wall');
    this._syncChips();
    const t = CELL_TYPES[key];
    this._setMessage(
      silent
        ? `Pick a part from the palette and drop it into the ${t.label.toLowerCase()}.`
        : `Switched to ${t.label} — the cell is empty again. Place ${t.required.length} essential parts.`,
      'info',
    );
  }

  _toggle(id) {
    if (this.placed.has(id)) this._remove(id);
    else this._place(id);
  }

  _place(id) {
    const type = CELL_TYPES[this.cellType];
    const allowed = type.required.includes(id) || type.bonus.includes(id);

    if (!allowed) {
      const why = REJECT[this.cellType]?.[id] || `${ORGANELLES[id].name} is not found in a ${type.label.toLowerCase()}.`;
      this._reject = 1;
      this._toast = { text: why, kind: 'err', life: 5.2, max: 5.2 };
      this._focus = { id, until: this._time + 8, labelUntil: 0 };
      this._shake(id);
      this._setMessage(`✘ ${why}`, 'err');
      this._burst(BODY[this.cellType].cx, BODY[this.cellType].cy, COLORS.err, 22);
      return;
    }
    if (this.placed.has(id)) {
      this._setMessage(`${ORGANELLES[id].name} is already in the cell — press Enter again to take it out.`, 'info');
      return;
    }

    const slots = this._slotsFor(id);
    this.placed.set(id, slots.map((sl, i) => ({ ...sl, born: this._time + i * 0.09 })));
    for (const sl of slots) this._burst(sl.x, sl.y, ORGANELLES[id].color, id === 'ribosome' ? 2 : 8);

    this._toast = { text: FACTS[id], kind: 'ok', life: 4.6, max: 4.6, title: ORGANELLES[id].name };
    this._focus = { id, until: this._time + 9, labelUntil: this._time + 4.5 };
    this._syncChips();
    this._setMessage(`✔ ${ORGANELLES[id].name} placed. ${FACTS[id]}`, 'ok');
    this._checkComplete();
  }

  _remove(id) {
    if (!this.placed.has(id)) return;
    this.placed.delete(id);
    this._complete = false;
    this._completeT = 0;
    this._syncChips();
    this._setMessage(`${ORGANELLES[id].name} removed from the cell.`, 'info');
  }

  _reset() {
    this.placed.clear();
    this._complete = false;
    this._completeT = 0;
    this._fx = [];
    this._toast = null;
    this._focus = null;
    this._syncChips();
    this._setMessage('Cell emptied. Start building again!', 'info');
  }

  _autoBuild() {
    const t = CELL_TYPES[this.cellType];
    let i = 0;
    for (const id of [...t.required, ...t.bonus]) {
      if (this.placed.has(id)) continue;
      this.placed.set(id, this._slotsFor(id).map((sl, k) => ({ ...sl, born: this._time + i * 0.22 + k * 0.05 })));
      i++;
    }
    this._toast = null;
    this._syncChips();
    this._setMessage(`Here is the complete ${t.label.toLowerCase()} — hover any part to read what it does.`, 'ok');
    this._checkComplete();
  }

  _slotsFor(id) {
    if (id === 'ribosome') return this._ribosomeSlots(this.cellType);
    if (id === 'membrane' || id === 'wall') return [{ x: BODY[this.cellType].cx, y: BODY[this.cellType].cy, rot: 0, s: 1 }];
    return (SLOTS[this.cellType]?.[id] || []).map(s => ({ ...s }));
  }

  /** Free ribosomes really are scattered — generate them, but deterministically. */
  _ribosomeSlots(type) {
    const rng = makeRng(type === 'bacterial' ? 9001 : type === 'plant' ? 4242 : 7331);
    const b = BODY[type];
    const wanted = type === 'bacterial' ? 20 : 15;
    const s = type === 'bacterial' ? 0.8 : 1;   // 70S ribosomes are smaller than 80S
    const out = [];
    let guard = 0;
    while (out.length < wanted && guard++ < 3000) {
      const x = b.cx + (rng() - 1 / 2) * b.w;
      const y = b.cy + (rng() - 1 / 2) * b.h;
      if (!isInside(type, x, y, (b.wall || 0) + b.pad)) continue;
      if (this._occupied(type, x, y)) continue;
      let tooClose = false;
      for (const p of out) if (Math.hypot(p.x - x, p.y - y) < 24) { tooClose = true; break; }
      if (tooClose) continue;
      out.push({ x, y, rot: rng() * Math.PI, s });
    }
    return out;
  }

  /** Keep scattered ribosomes out of the vacuole / nucleus / nucleoid footprint. */
  _occupied(type, x, y) {
    if (type === 'plant') {
      const v = SLOTS.plant.vacuole[0];
      if (Math.abs(x - v.x) < 126 && Math.abs(y - v.y) < 66) return true;
      const n = SLOTS.plant.nucleus[0];
      if (Math.hypot(x - n.x, y - n.y) < 42) return true;
    }
    if (type === 'animal') {
      const n = SLOTS.animal.nucleus[0];
      if (Math.hypot(x - n.x, y - n.y) < 58) return true;
    }
    if (type === 'bacterial') {
      const n = SLOTS.bacterial.nucleoid[0];
      if (Math.abs(x - n.x) < 74 && Math.abs(y - n.y) < 34) return true;
    }
    return false;
  }

  _checkComplete() {
    const t = CELL_TYPES[this.cellType];
    const done = t.required.every(id => this.placed.has(id));
    if (done && !this._complete) {
      this._complete = true;
      this._completeT = 0;
      this._toast = null;              // the banner takes over the top strip
      const b = BODY[this.cellType];
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        this._fx.push({
          x: b.cx, y: b.cy,
          vx: Math.cos(a) * (60 + Math.random() * 150),
          vy: Math.sin(a) * (60 + Math.random() * 150),
          r: 1.5 + Math.random() * 2.5, life: 1.6, max: 1.6,
          color: [COLORS.ok, '#fbbf24', '#38bdf8', t.accent][i % 4],
        });
      }
      this._setMessage(`🎉 Your ${t.label.toLowerCase()} is complete — watch it come to life!`, 'ok');
    }
  }

  _shake(id) {
    const chip = this._chips.get(id);
    if (!chip) return;
    chip.classList.remove('bac-shake');
    void chip.offsetWidth;              // restart the animation
    chip.classList.add('bac-shake');
    setTimeout(() => chip.classList.remove('bac-shake'), 480);
  }

  _syncChips() {
    for (const [id, chip] of this._chips) {
      const on = this.placed.has(id);
      chip.dataset.placed = on ? '1' : '0';
      chip.setAttribute('aria-label', on
        ? `${ORGANELLES[id].name}, placed in the cell. Press Enter to take it out.`
        : `${ORGANELLES[id].name}. Press Enter to add it to the cell, or drag it onto the cell.`);
    }
    this._syncProgress();
  }

  _syncProgress() {
    if (!this._statusEl) return;
    const t = CELL_TYPES[this.cellType];
    const done = t.required.filter(id => this.placed.has(id)).length;
    const fill = this._statusEl.querySelector('.bac-fill');
    const count = this._statusEl.querySelector('.bac-count');
    if (fill)  fill.style.width = `${(done / t.required.length) * 100}%`;
    if (count) count.textContent = `${done} / ${t.required.length} essentials`;
  }

  _setMessage(text, kind) {
    this._syncProgress();
    const msg = this._statusEl?.querySelector('.bac-msg');
    if (msg) {
      msg.textContent = text;
      msg.style.color = kind === 'err' ? COLORS.err : kind === 'ok' ? COLORS.ok : 'var(--sim-label,#cbd5e1)';
    }
    this._paintOnce();
  }

  /**
   * Redraw a single frame when the rAF loop is not running — a host may mount
   * the scene paused (POE shells do), and the workbench must still respond.
   * `_settle` renders arrival animations as already finished, otherwise a
   * static frame would show every organelle at scale 0.
   */
  _paintOnce() {
    if (!this._ctx || this._rafId) return;
    this._settle = true;
    this._tick(this._ctx, 0);
    this._settle = false;
  }

  /** Seconds since an instance was placed (or "long ago" in a static frame). */
  _ageOf(born) {
    return this._settle ? 99 : this._time - (born ?? 0);
  }

  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 70;
      this._fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.2 + Math.random() * 2, life: 0.75, max: 0.75, color });
    }
  }

  _seedDots() {
    const b = BODY[this.cellType];
    const rng = makeRng(1234);
    this._dots = [];
    let guard = 0;
    while (this._dots.length < 46 && guard++ < 4000) {
      const x = b.cx + (rng() - 1 / 2) * b.w;
      const y = b.cy + (rng() - 1 / 2) * b.h;
      if (!isInside(this.cellType, x, y, (b.wall || 0) + b.pad)) continue;
      this._dots.push({ x, y, a: rng() * Math.PI * 2, sp: 4 + rng() * 10, r: 0.7 + rng() * 1.6, al: 0.10 + rng() * 0.22 });
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────

  _update(dt) {
    this._time += dt;
    this._glossT += dt;
    if (this._reject > 0) this._reject = Math.max(0, this._reject - dt * 1.6);
    if (this._complete) this._completeT += dt;

    if (this._toast) {
      this._toast.life -= dt;
      if (this._toast.life <= 0) this._toast = null;
    }
    if (this._focus && this._time > this._focus.until) this._focus = null;
    if (this._glossT > 7) {
      this._glossT = 0;
      this._glossIdx = (this._glossIdx + 1) % this._glossKeys.length;
    }

    const speed = this._complete ? 2.4 : 1;
    const b = BODY[this.cellType];
    for (const d of this._dots) {
      d.a += (Math.sin(this._time * 0.6 + d.x * 0.01) * 0.9) * dt;
      d.x += Math.cos(d.a) * d.sp * speed * dt;
      d.y += Math.sin(d.a) * d.sp * speed * dt;
      if (!isInside(this.cellType, d.x, d.y, (b.wall || 0) + b.pad - 6)) {
        d.a += Math.PI;
        d.x += Math.cos(d.a) * 4;
        d.y += Math.sin(d.a) * 4;
      }
    }

    for (const p of this._fx) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= dt;
    }
    if (this._fx.length) this._fx = this._fx.filter(p => p.life > 0);
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._update(dt);
    ctx.clearRect(0, 0, W, H);
    this._drawBackground(ctx);
    this._drawCellBody(ctx);
    this._drawPlaced(ctx);
    this._drawBoundary(ctx);
    this._drawFx(ctx);
    this._drawOverlay(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _buildBgCache() {
    const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ctx = oc.getContext('2d');
    const g = ctx.createRadialGradient(300, 226, 30, 300, 226, 400);
    g.addColorStop(0, '#0f2244');
    g.addColorStop(0.55, '#0a1428');
    g.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint hex-grid "lab paper" texture
    ctx.strokeStyle = 'rgba(148,163,184,0.045)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H + 30; y += 26) {
      for (let x = 0; x < W + 30; x += 30) {
        const ox = (Math.round(y / 26) % 2) * 15;
        ctx.beginPath();
        ctx.arc(x + ox, y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }
    if (this._reject > 0) {
      ctx.save();
      ctx.globalAlpha = this._reject * 0.32;
      const g = ctx.createRadialGradient(300, 230, 90, 300, 230, 380);
      g.addColorStop(0, 'rgba(248,113,113,0)');
      g.addColorStop(1, COLORS.err);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  _outline(inset, spacing) {
    const key = `${this.cellType}|${inset}|${spacing}`;
    let v = this._outlineCache.get(key);
    if (!v) { v = outlinePoints(this.cellType, inset, spacing); this._outlineCache.set(key, v); }
    return v;
  }

  _cellPath(inset) {
    const pts = this._outline(inset, 6);
    const p = new Path2D();
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    p.closePath();
    return p;
  }

  /** Cytoplasm fill, streaming dots and the dashed "empty cell" ghost. */
  _drawCellBody(ctx) {
    const b = BODY[this.cellType];
    const inset = b.wall ? b.wall : 0;
    const path = this._cellPath(inset);
    const pulse = this._complete ? 1 + Math.sin(this._time * 1.6) * 0.006 : 1;

    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.scale(pulse, pulse);
    ctx.translate(-b.cx, -b.cy);

    // soft outer halo
    ctx.save();
    ctx.shadowColor = this._complete ? 'rgba(52,211,153,0.55)' : 'rgba(79,156,247,0.35)';
    ctx.shadowBlur = this._complete ? 40 : 26;
    ctx.fillStyle = 'rgba(13,31,60,0.9)';
    ctx.fill(path);
    ctx.restore();

    // cytoplasm gradient
    const g = ctx.createRadialGradient(b.cx - b.w * 0.18, b.cy - b.h * 0.22, 8, b.cx, b.cy, b.w * 0.72);
    g.addColorStop(0, 'rgba(45, 96, 158, 0.62)');
    g.addColorStop(0.6, COLORS.cytoplasm);
    g.addColorStop(1, 'rgba(12, 28, 54, 0.85)');
    ctx.fillStyle = g;
    ctx.fill(path);

    // streaming dots, clipped to the cell
    ctx.save();
    ctx.clip(path);
    for (const d of this._dots) {
      ctx.globalAlpha = d.al * (this._complete ? 1.7 : 1);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = '#bae6fd';
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    // dashed ghost outline while the boundary is still missing
    if (!this.placed.has('membrane')) {
      ctx.save();
      ctx.setLineDash([9, 8]);
      ctx.lineDashOffset = -this._time * 14;
      ctx.strokeStyle = COLORS.ghost;
      ctx.lineWidth = 2;
      ctx.stroke(path);
      ctx.restore();
    }
  }

  /** The phospholipid bilayer and (when present) the cell wall. */
  _drawBoundary(ctx) {
    const b = BODY[this.cellType];
    const hasMem = this.placed.has('membrane');
    const hasWall = this.placed.has('wall');
    const t = this._time;

    if (hasWall) {
      const age = clamp(this._ageOf(this.placed.get('wall')[0].born) / 0.45, 0, 1);
      const grow = easeBack(age);
      const wallW = (b.wall || 12) * grow;
      const outer = this._outline(0, 5);
      const inner = this._outline(b.wall || 12, 5);
      const isPlant = this.cellType === 'plant';
      const col = isPlant ? COLORS.wallPlant : COLORS.wallBact;

      ctx.save();
      ctx.globalAlpha = age;
      // band
      const band = new Path2D();
      band.moveTo(outer[0].x, outer[0].y);
      for (let i = 1; i < outer.length; i++) band.lineTo(outer[i].x, outer[i].y);
      band.closePath();
      const ip = [];
      for (const p of inner) ip.push(p);
      band.moveTo(ip[0].x, ip[0].y);
      for (let i = ip.length - 1; i >= 0; i--) band.lineTo(ip[i].x, ip[i].y);
      band.closePath();

      const wg = ctx.createLinearGradient(b.cx - b.w / 2, b.cy - b.h / 2, b.cx + b.w / 2, b.cy + b.h / 2);
      wg.addColorStop(0, isPlant ? '#65a30d' : '#8b5cf6');
      wg.addColorStop(0.5, col);
      wg.addColorStop(1, isPlant ? '#4d7c0f' : '#7c3aed');
      ctx.fillStyle = wg;
      ctx.fill(band, 'evenodd');

      // fibril texture: cellulose microfibrils / peptidoglycan mesh
      ctx.save();
      ctx.clip(band, 'evenodd');
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i < outer.length; i += 3) {
        const p = outer[i];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.nx * wallW, p.y - p.ny * wallW);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      for (let k = 1; k <= 2; k++) {
        const mid = this._outline((b.wall || 12) * (k / 3), 5);
        ctx.beginPath();
        ctx.moveTo(mid[0].x, mid[0].y);
        for (let i = 1; i < mid.length; i++) ctx.lineTo(mid[i].x, mid[i].y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke(this._cellPath(0));
      ctx.restore();
    }

    // Dashed hint showing where the missing wall would sit — outside the membrane.
    if (!hasWall && b.wall) {
      ctx.save();
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = this._time * 10;
      ctx.strokeStyle = this.cellType === 'plant' ? 'rgba(163,230,53,0.34)' : 'rgba(196,181,253,0.34)';
      ctx.lineWidth = 1.5;
      ctx.stroke(this._cellPath(1));
      ctx.restore();
    }

    if (!hasMem) return;

    const memInset = b.wall || 0;
    const age = clamp(this._ageOf(this.placed.get('membrane')[0].born) / 0.6, 0, 1);
    const pts = this._outline(memInset + 5, 7.4);
    const breathe = this._complete ? Math.sin(t * 1.8) * 0.6 : 0;

    ctx.save();
    ctx.globalAlpha = age;

    // glow
    ctx.save();
    ctx.strokeStyle = 'rgba(79,156,247,0.28)';
    ctx.lineWidth = 13;
    ctx.stroke(this._cellPath(memInset + 5));
    ctx.restore();

    // tails between the two head rows
    ctx.strokeStyle = COLORS.lipidTail;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const o = 4.4 + breathe;
      ctx.moveTo(p.x + p.nx * o, p.y + p.ny * o);
      ctx.lineTo(p.x - p.nx * o, p.y - p.ny * o);
    }
    ctx.stroke();

    // hydrophilic heads, outer + inner leaflet
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const o = 4.9 + breathe;
      for (const sgn of [1, -1]) {
        const hx = p.x + p.nx * o * sgn;
        const hy = p.y + p.ny * o * sgn;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = sgn > 0 ? COLORS.lipidHead : '#60a5fa';
        ctx.fill();
      }
    }

    // integral channel proteins studded through the bilayer (fluid mosaic)
    const every = Math.max(6, Math.round(pts.length / 12));
    for (let i = 2; i < pts.length; i += every) {
      const p = pts[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.ny, p.nx) + Math.PI / 2);
      const gg = ctx.createLinearGradient(0, -8, 0, 8);
      gg.addColorStop(0, '#6ee7b7');
      gg.addColorStop(1, '#059669');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.roundRect(-4.6, -8.5, 9.2, 17, 3.4);
      ctx.fill();
      ctx.fillStyle = 'rgba(6,20,32,0.85)';
      ctx.beginPath();
      ctx.roundRect(-1.4, -7, 2.8, 14, 1.4);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Every placed organelle, in a sensible depth order. */
  _drawPlaced(ctx) {
    const order = ['vacuole', 'nucleoid', 'flagellum', 'er', 'nucleus', 'golgi',
      'mitochondrion', 'chloroplast', 'lysosome', 'ribosome'];
    for (const id of order) {
      const list = this.placed.get(id);
      if (!list) continue;
      for (const inst of list) {
        const age = this._ageOf(inst.born);
        if (age < 0) continue;
        const grow = age < 0.5 ? easeBack(clamp(age / 0.5, 0, 1)) : 1;
        const breathe = this._complete ? 1 + Math.sin(this._time * 2.1 + inst.x * 0.03) * 0.035 : 1;
        const s = (inst.s ?? 1) * grow * breathe;
        if (s <= 0.01) continue;

        // arrival halo
        if (age < 0.8) {
          ctx.save();
          ctx.globalAlpha = (1 - age / 0.8) * 0.65;
          ctx.strokeStyle = COLORS.ok;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(inst.x, inst.y, (HIT_R[id] || 20) * (inst.s ?? 1) * (0.6 + age * 1.1), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(inst.x, inst.y);
        ctx.rotate(inst.rot || 0);
        ctx.scale(s, s);
        this._painters(ctx, id, this._time, false);
        ctx.restore();
      }
    }
  }

  _drawFx(ctx) {
    for (const p of this._fx) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + a), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Overlay: header, hover label, toast, glossary, banner ────────────────

  _drawOverlay(ctx) {
    const t = CELL_TYPES[this.cellType];

    // header
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 17px Inter, system-ui';
    ctx.fillStyle = t.accent;
    ctx.fillText(`${t.emoji}  ${t.title}`, 16, 27);
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`${t.tag} · ${t.scale}`, 17, 43);
    ctx.restore();

    // progress pill, top-right
    const done = t.required.filter(id => this.placed.has(id)).length;
    this._pill(ctx, `${done}/${t.required.length} essential parts`,
      W - 16, 26, { align: 'right', bg: 'rgba(15,23,42,0.85)', color: done === t.required.length ? COLORS.ok : COLORS.textMain });

    if (!this.placed.size) this._drawEmptyPrompt(ctx);

    // Name the part that was just placed, so the shape and the word connect.
    const justId = this._focus && this._time < this._focus.labelUntil ? this._focus.id : null;
    const justList = justId && justId !== this._hover?.id ? this.placed.get(justId) : null;
    if (justList?.length) {
      const inst = justList[0];
      const r = (HIT_R[justId] || 20) * (inst.s ?? 1);
      this._pill(ctx, ORGANELLES[justId].name, inst.x, inst.y - r - 11,
        { align: 'center', bg: 'rgba(15,23,42,0.92)', color: ORGANELLES[justId].color });
    }

    // hover highlight
    if (this._hover) {
      const o = ORGANELLES[this._hover.id];
      ctx.save();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(this._hover.x, this._hover.y, this._hover.r + 4 + Math.sin(this._time * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this._pill(ctx, o.name, this._hover.x, this._hover.y - this._hover.r - 10,
        { align: 'center', bg: 'rgba(15,23,42,0.92)', color: o.color });
    }

    if (this._toast) this._drawToast(ctx, this._toast);
    this._drawGlossaryCard(ctx);
    if (this._complete) this._drawBanner(ctx);
  }

  _pill(ctx, text, x, y, { align = 'center', bg = 'rgba(15,23,42,0.85)', color = COLORS.textMain } = {}) {
    ctx.save();
    ctx.font = '700 11px Inter, system-ui';
    const w = ctx.measureText(text).width + 20;
    const h = 22;
    const bx = align === 'right' ? x - w : align === 'left' ? x : x - w / 2;
    ctx.beginPath();
    ctx.roundRect(clamp(bx, 4, W - w - 4), y - h / 2, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, clamp(bx, 4, W - w - 4) + w / 2, y + 0.5);
    ctx.restore();
  }

  _drawToast(ctx, toast) {
    const fade = clamp(toast.life / 0.6, 0, 1) * clamp((toast.max - toast.life) / 0.25, 0, 1);
    const ok = toast.kind === 'ok';
    const lines = this._wrap(ctx, toast.text, 430, '600 12px Inter, system-ui');
    const padX = 14, padY = 11, lineH = 16;
    const titleH = toast.title ? 17 : 0;
    let maxW = 0;
    ctx.save();
    ctx.font = '600 12px Inter, system-ui';
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    if (toast.title) {
      ctx.font = '800 12.5px Inter, system-ui';
      maxW = Math.max(maxW, ctx.measureText(`✔  ${toast.title}`).width);
    }
    const bw = maxW + padX * 2 + 6;
    const bh = lines.length * lineH + padY * 2 + titleH;
    const bx = (W - bw) / 2;
    const by = 54;

    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 11);
    ctx.fillStyle = ok ? 'rgba(6,78,59,0.94)' : 'rgba(76,14,20,0.94)';
    ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let ty = by + padY;
    if (toast.title) {
      ctx.font = '800 12.5px Inter, system-ui';
      ctx.fillStyle = ok ? '#6ee7b7' : '#fca5a5';
      ctx.fillText(`✔  ${toast.title}`, bx + padX, ty);
      ty += titleH;
    }
    ctx.font = '600 12px Inter, system-ui';
    ctx.fillStyle = ok ? '#d1fae5' : '#fecaca';
    if (!toast.title) {
      ctx.fillText('✘', bx + padX, ty);
      lines.forEach((l, i) => ctx.fillText(l, bx + padX + 16, ty + i * lineH));
    } else {
      lines.forEach((l, i) => ctx.fillText(l, bx + padX, ty + i * lineH));
    }
    ctx.restore();
  }

  _drawGlossaryCard(ctx) {
    const key = this._focus?.id || this._hover?.id || this._glossKeys[this._glossIdx];
    const item = GLOSSARY[key] || GLOSSARY.cytoplasm;
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
    ctx.fillStyle = 'rgba(9,15,30,0.90)';
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

    if (!this._focus && !this._hover) {
      ctx.beginPath();
      ctx.roundRect(x + 2, y - 4, (w - 4) * (this._glossT / 7), 2, 1);
      ctx.fillStyle = 'rgba(59,130,246,0.6)';
      ctx.fill();
    }
    ctx.restore();
  }

  _drawBanner(ctx) {
    const t = CELL_TYPES[this.cellType];
    const p = clamp(this._completeT / 0.5, 0, 1);
    // Retract after a few seconds so the finished cell — the actual reward —
    // ends up fully visible.
    const out = clamp((this._completeT - 4) / 1.1, 0, 1);
    if (out >= 1) return;
    const scale = easeBack(p);
    ctx.save();
    ctx.globalAlpha = p * (1 - out);
    ctx.translate(W / 2, 72 - 30 * out);
    ctx.scale(scale, scale);

    const title = `🎉 Your ${t.label} is alive!`;
    const sub = t.key === 'bacterial'
      ? 'A complete prokaryote — no nucleus, no membrane-bound organelles.'
      : t.key === 'plant'
        ? 'Wall + chloroplasts + a giant vacuole = a working plant cell.'
        : 'No wall and no chloroplasts — but lysosomes to keep it clean.';

    ctx.font = '800 15.5px Inter, system-ui';
    const w = ctx.measureText(title).width + 40;
    ctx.font = '600 10.5px Inter, system-ui';
    const w2 = ctx.measureText(sub).width + 40;
    const bw = Math.max(w, w2), bh = 46;

    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 12);
    ctx.fillStyle = 'rgba(6,60,46,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,211,153,0.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15.5px Inter, system-ui';
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(title, 0, -9);
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText(sub, 0, 11);
    ctx.restore();
  }

  /** Ghost call-to-action shown while the cell is still completely empty. */
  _drawEmptyPrompt(ctx) {
    const b = BODY[this.cellType];
    const pulse = 0.62 + 0.24 * Math.sin(this._time * 2);
    const first = this.cellType === 'bacterial' ? 'Cell Wall' : 'Cell Membrane';
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px Inter, system-ui';
    ctx.fillStyle = 'rgba(226,232,240,0.9)';
    ctx.fillText('Drop the parts in here', b.cx, b.cy - 10);
    ctx.font = '600 11.5px Inter, system-ui';
    ctx.fillStyle = 'rgba(148,163,184,0.95)';
    ctx.fillText(`Tip: start with the ${first}, then work inwards.`, b.cx, b.cy + 12);
    ctx.restore();
  }

  _wrap(ctx, text, maxW, font) {
    ctx.save();
    ctx.font = font;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    ctx.restore();
    return lines;
  }

  // ── Organelle painters ────────────────────────────────────────────────────
  // Each painter draws at the origin in canonical units; callers translate,
  // rotate and scale. `thumb` skips animation so palette icons stay still.

  _painters(ctx, id, t, thumb) {
    const time = thumb ? 0 : t;
    switch (id) {
      case 'membrane':      return this._pMembrane(ctx, thumb);
      case 'wall':          return this._pWall(ctx, thumb);
      case 'nucleus':       return this._pNucleus(ctx, time);
      case 'nucleoid':      return this._pNucleoid(ctx, time);
      case 'ribosome':      return this._pRibosome(ctx);
      case 'mitochondrion': return this._pMitochondrion(ctx, time);
      case 'chloroplast':   return this._pChloroplast(ctx, time);
      case 'er':            return this._pER(ctx, time);
      case 'golgi':         return this._pGolgi(ctx, time);
      case 'lysosome':      return this._pLysosome(ctx, time);
      case 'vacuole':       return this._pVacuole(ctx, time);
      case 'flagellum':     return this._pFlagellum(ctx, time);
      default: return undefined;
    }
  }

  /** Palette-only swatch: a straight slice of phospholipid bilayer. */
  _pMembrane(ctx) {
    const halfW = 46;
    ctx.strokeStyle = COLORS.lipidTail;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -halfW; x <= halfW; x += 9) { ctx.moveTo(x, -11); ctx.lineTo(x, 11); }
    ctx.stroke();
    for (let x = -halfW; x <= halfW; x += 9) {
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x, sgn * 12, 5, 0, Math.PI * 2);
        ctx.fillStyle = sgn < 0 ? COLORS.lipidHead : '#60a5fa';
        ctx.fill();
      }
    }
    const g = ctx.createLinearGradient(0, -16, 0, 16);
    g.addColorStop(0, '#6ee7b7'); g.addColorStop(1, '#059669');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-8, -17, 16, 34, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(6,20,32,0.85)';
    ctx.beginPath();
    ctx.roundRect(-2.6, -14, 5.2, 28, 2.6);
    ctx.fill();
  }

  /** Palette-only swatch: layered wall fibrils. */
  _pWall(ctx) {
    const plant = this.cellType !== 'bacterial';
    const g = ctx.createLinearGradient(-40, -20, 40, 20);
    g.addColorStop(0, plant ? '#65a30d' : '#8b5cf6');
    g.addColorStop(0.5, plant ? COLORS.wallPlant : COLORS.wallBact);
    g.addColorStop(1, plant ? '#4d7c0f' : '#7c3aed');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-46, -22, 92, 44, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2;
    for (let y = -14; y <= 14; y += 14) {
      ctx.beginPath(); ctx.moveTo(-44, y); ctx.lineTo(44, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1.5;
    for (let x = -38; x <= 38; x += 11) {
      ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x, 20); ctx.stroke();
    }
  }

  /** Sphere, double envelope with pores, chromatin threads, nucleolus. */
  _pNucleus(ctx, t) {
    const R = 46;
    ctx.save();
    ctx.shadowColor = 'rgba(99,102,241,0.55)';
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#a5b4fc');
    g.addColorStop(0.45, COLORS.nucleus);
    g.addColorStop(1, '#312e81');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // chromatin threads
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R - 5, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(199,210,254,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      const ph = i * 1.5 + t * 0.25;
      for (let a = 0; a <= Math.PI * 2; a += 0.25) {
        const rr = (R - 10) * (0.35 + 0.4 * Math.sin(a * 2 + ph)) + 6;
        const px = Math.cos(a + ph) * rr;
        const py = Math.sin(a + ph) * rr * 0.8;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    // nucleolus
    const ng = ctx.createRadialGradient(9, -9, 2, 12, -6, 17);
    ng.addColorStop(0, '#6366f1');
    ng.addColorStop(1, COLORS.nucleolus);
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(12, -6, 16, 0, Math.PI * 2);
    ctx.fill();

    // nuclear envelope: two membranes + pores
    ctx.strokeStyle = '#c7d2fe';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(199,210,254,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, R - 4.5, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      ctx.save();
      ctx.translate(Math.cos(a) * (R - 2.2), Math.sin(a) * (R - 2.2));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#e0e7ff';
      ctx.beginPath();
      ctx.roundRect(-4, -2.4, 8, 4.8, 2.2);
      ctx.fill();
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // specular highlight
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-15, -19, 13, 8, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Naked supercoiled circular chromosome — no membrane at all. */
  _pNucleoid(ctx, t) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g = ctx.createRadialGradient(0, 0, 5, 0, 0, 82);
    g.addColorStop(0, 'rgba(129,140,248,0.55)');
    g.addColorStop(1, 'rgba(129,140,248,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 82, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // one long circular DNA loop, supercoiled into a tangle
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [{ w: 6.5, c: 'rgba(49,46,129,0.9)' }, { w: 3.4, c: '#a5b4fc' }]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.05) {
        const wob = Math.sin(a * 4 + t * 0.8) * 11 + Math.sin(a * 6 - t * 0.5) * 5;
        const rx = 60 + wob;
        const ry = 25 + Math.cos(a * 3 + t * 0.6) * 8;
        const px = Math.cos(a) * rx;
        const py = Math.sin(a) * ry;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // inner loop of the same molecule, crossing over itself
    ctx.strokeStyle = 'rgba(165,180,252,0.75)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.05) {
      const rx = 33 + Math.sin(a * 5 - t * 0.7) * 8;
      const ry = 13 + Math.cos(a * 4 + t) * 5;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  /** Two subunits, no membrane. */
  _pRibosome(ctx) {
    const lg = ctx.createRadialGradient(-1.5, -2.5, 0.5, 0, -1.5, 6);
    lg.addColorStop(0, '#f8fafc');
    lg.addColorStop(1, '#94a3b8');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(0, -1.6, 5.6, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    const sg = ctx.createRadialGradient(-1, 2, 0.4, 0, 3, 4.5);
    sg.addColorStop(0, '#e2e8f0');
    sg.addColorStop(1, '#64748b');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, 3, 4.4, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-4.6, 0.9); ctx.lineTo(4.6, 0.9);
    ctx.stroke();
  }

  /** Rod with a double membrane; the inner one folded into cristae. */
  _pMitochondrion(ctx, t) {
    const w = 78, h = 40, r = h / 2;
    const capsule = (inset) => {
      const ww = w - inset * 2, hh = h - inset * 2, rr = hh / 2;
      ctx.beginPath();
      ctx.moveTo(-ww / 2 + rr, -hh / 2);
      ctx.lineTo(ww / 2 - rr, -hh / 2);
      ctx.arc(ww / 2 - rr, 0, rr, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-ww / 2 + rr, hh / 2);
      ctx.arc(-ww / 2 + rr, 0, rr, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    };

    ctx.save();
    ctx.shadowColor = 'rgba(245,158,11,0.5)';
    ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fcd34d');
    g.addColorStop(0.45, COLORS.mito);
    g.addColorStop(1, COLORS.mitoDark);
    ctx.fillStyle = g;
    capsule(0);
    ctx.fill();
    ctx.restore();

    // matrix
    ctx.fillStyle = '#fde68a';
    capsule(4.5);
    ctx.fill();

    // cristae — folds of the inner membrane
    ctx.save();
    capsule(4.5);
    ctx.clip();
    ctx.strokeStyle = COLORS.mitoDark;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 9 + (i + 0.5) * ((w - 18) / n);
      const up = i % 2 === 0;
      const wob = Math.sin(t * 1.4 + i) * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, up ? -h / 2 : h / 2);
      ctx.bezierCurveTo(x + 7 + wob, up ? -6 : 6, x - 7 - wob, up ? 5 : -5, x + 2, up ? h / 2 - 8 : -h / 2 + 8);
      ctx.stroke();
    }
    ctx.restore();

    // outer membrane + gloss
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 2;
    capsule(0);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-16, -12, 14, 4, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Lens-shaped plastid: double membrane, stroma, grana + stroma lamellae. */
  _pChloroplast(ctx, t) {
    const rx = 34, ry = 20;
    ctx.save();
    ctx.shadowColor = 'rgba(34,197,94,0.55)';
    ctx.shadowBlur = 15;
    const g = ctx.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, '#86efac');
    g.addColorStop(0.5, COLORS.chloro);
    g.addColorStop(1, COLORS.chloroDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // stroma
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 3.2, ry - 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 3.2, ry - 3.2, 0, 0, Math.PI * 2);
    ctx.clip();

    // stroma lamellae connecting the grana
    ctx.strokeStyle = 'rgba(20,83,45,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-rx, -4); ctx.lineTo(rx, 2);
    ctx.moveTo(-rx, 7); ctx.lineTo(rx, -6);
    ctx.stroke();

    // grana: stacks of thylakoid discs
    const stacks = [{ x: -19, y: -5, n: 4 }, { x: -2, y: 5, n: 5 }, { x: 15, y: -6, n: 4 }, { x: 24, y: 7, n: 3 }];
    for (const st of stacks) {
      const glow = 0.5 + 0.5 * Math.sin(t * 2 + st.x * 0.2);
      for (let i = 0; i < st.n; i++) {
        const y = st.y - (st.n - 1) * 1.9 + i * 3.8;
        ctx.beginPath();
        ctx.ellipse(st.x, y, 7.6, 1.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.thylakoid;
        ctx.fill();
        ctx.strokeStyle = `rgba(190,242,100,${0.25 + glow * 0.35})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
    ctx.restore();

    // outer + inner membrane
    ctx.strokeStyle = '#bbf7d0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(187,247,208,0.5)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 3.2, ry - 3.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Rough ER cisternae (ribosome-studded) flowing into a smooth ER tubule net. */
  _pER(ctx, t) {
    ctx.save();
    ctx.lineCap = 'round';
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const y = -24 + i * 15;
      ctx.beginPath();
      for (let x = -50; x <= 26; x += 4) {
        const yy = y + Math.sin(x * 0.09 + i * 0.9 + t * 0.9) * 5;
        x === -50 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = 'rgba(67,56,202,0.85)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = COLORS.er;
      ctx.lineWidth = 5;
      ctx.stroke();

      // ribosomes studding the cytoplasmic face
      for (let x = -46; x <= 22; x += 9) {
        const yy = y + Math.sin(x * 0.09 + i * 0.9 + t * 0.9) * 5;
        ctx.beginPath();
        ctx.arc(x, yy - 4.4, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ribosome;
        ctx.fill();
      }
    }

    // smooth ER: bare tubules, no ribosomes
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y0 = -18 + i * 16;
      ctx.moveTo(26, y0);
      ctx.bezierCurveTo(40, y0 - 9, 44, y0 + 12, 56, y0 + 3 + Math.sin(t + i) * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(44, -16); ctx.lineTo(46, 2);
    ctx.moveTo(46, 2); ctx.lineTo(43, 17);
    ctx.stroke();
    ctx.restore();
  }

  /** Stacked cisternae with a cis face, a trans face and budding vesicles. */
  _pGolgi(ctx, t) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = -22 + i * 11;
      const hw = 32 - Math.abs(i - 2) * 3.5;
      ctx.beginPath();
      ctx.moveTo(-hw, y - 7);
      ctx.quadraticCurveTo(0, y + 9, hw, y - 7);
      ctx.strokeStyle = 'rgba(157,23,77,0.9)';
      ctx.lineWidth = 8.5;
      ctx.stroke();
      ctx.strokeStyle = COLORS.golgi;
      ctx.lineWidth = 5.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(253,242,248,0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    // vesicles budding off the trans face
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.55 + i / 3) % 1;
      const vx = 26 + ph * 22;
      const vy = 26 - ph * 14 + Math.sin(ph * 6) * 2;
      ctx.globalAlpha = 1 - ph * 0.75;
      const g = ctx.createRadialGradient(vx - 1.5, vy - 1.5, 0.5, vx, vy, 6);
      g.addColorStop(0, '#fbcfe8');
      g.addColorStop(1, COLORS.golgi);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vx, vy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 8px Inter, system-ui';
    ctx.fillStyle = 'rgba(253,242,248,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('cis', 0, -32);
    ctx.fillText('trans', 0, 41);
    ctx.restore();
  }

  /** Membrane sac packed with hydrolytic enzyme granules. */
  _pLysosome(ctx, t) {
    const R = 13;
    ctx.save();
    ctx.shadowColor = 'rgba(239,68,68,0.55)';
    ctx.shadowBlur = 10;
    const g = ctx.createRadialGradient(-4, -5, 1, 0, 0, R);
    g.addColorStop(0, '#fca5a5');
    g.addColorStop(0.55, COLORS.lysosome);
    g.addColorStop(1, '#991b1b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R - 2, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + t * 0.6;
      const rr = 3 + (i % 3) * 3.1;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a * 1.3) * rr, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = '#fee2e2';
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = '#fecaca';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Tonoplast-bounded sap bag that fills most of a mature plant cell. */
  _pVacuole(ctx, t) {
    const w = 240, h = 120, r = 44;
    ctx.save();
    ctx.shadowColor = 'rgba(6,182,212,0.35)';
    ctx.shadowBlur = 24;
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, 'rgba(34,211,238,0.42)');
    g.addColorStop(0.5, 'rgba(6,182,212,0.30)');
    g.addColorStop(1, 'rgba(14,116,144,0.42)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.restore();

    // tonoplast
    ctx.strokeStyle = 'rgba(103,232,249,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(103,232,249,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, r - 5);
    ctx.stroke();

    // cell sap shimmer
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.clip();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      for (let x = -w / 2; x <= w / 2; x += 6) {
        const y = -34 + i * 30 + Math.sin(x * 0.03 + t * 0.8 + i) * 6;
        x === -w / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ecfeff';
    ctx.beginPath();
    ctx.ellipse(-60, -34, 46, 15, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.font = '700 11px Inter, system-ui';
    ctx.fillStyle = 'rgba(207,250,254,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('cell sap', 0, 0);
    ctx.font = '600 8.5px Inter, system-ui';
    ctx.fillStyle = 'rgba(165,243,252,0.6)';
    ctx.fillText('tonoplast', 0, h / 2 - 15);
  }

  /** Basal-body motor + hook + long helical filament. */
  _pFlagellum(ctx, t) {
    ctx.save();
    // filament
    ctx.strokeStyle = 'rgba(244,114,182,0.35)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (const pass of [{ w: 7, c: 'rgba(244,114,182,0.28)' }, { w: 3, c: COLORS.flagellum }]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      for (let x = 10; x <= 104; x += 3) {
        const amp = 3 + (x - 10) * 0.13;
        const y = Math.sin(x * 0.16 - t * 6) * amp;
        x === 10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // hook
    ctx.strokeStyle = '#fbcfe8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(8, -2, 12, Math.sin(-t * 6) * 3);
    ctx.stroke();
    // basal body rings (the rotary motor)
    ctx.fillStyle = '#f9a8d4';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.roundRect(-12 + i * 5, -7 + Math.abs(i - 1) * 1.5, 3.4, 14 - Math.abs(i - 1) * 3, 1.6);
      ctx.fill();
    }
    ctx.restore();
  }
}
