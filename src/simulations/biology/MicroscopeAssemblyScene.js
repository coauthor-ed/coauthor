import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * MicroscopeAssemblyScene — Part 2.3 "Assemble the Compound Light Microscope".
 *
 * A dashed silhouette of a compound light microscope waits on the stage. The
 * student drags ten parts out of the palette onto it; each part only locks in
 * where it belongs, and a wrong drop explains where it should have gone
 * ("The eyepiece goes right at the top — that is where you put your eye").
 *
 * With all ten parts fitted the instrument lights up and the optical pathway
 * animates: light off the mirror → diaphragm → the specimen on the slide →
 * objective → body tube → eyepiece. The circular field-of-view on the left
 * then shows the classic Class 9 result — a letter "e" that appears **upside
 * down and back to front**, because the objective forms an inverted image.
 *
 * ── Deviations from the sprint spec (deliberate) ──────────────────────────
 * The spec sketches a DOM/SVG silhouette. As with BuildACellScene the
 * instrument is drawn on Canvas-2D instead, to get the brushed-metal
 * gradients, glass lenses and DIN objective colour bands that make the parts
 * recognisable; the controls stay real DOM <button>s so the scene remains
 * keyboard-operable. Objective magnifications, the DIN colour code
 * (4× red, 10× yellow, 40× blue) and the light path follow Wikipedia's
 * "Optical microscope" article.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — hex values
 * from sim-theme.css are inlined in COLORS below.
 */

const W = 600;
const H = 470;

/** Optical axis — eyepiece, tube, nosepiece, objective, aperture and mirror all share it. */
const AX = 380;

const COLORS = {
  bgDeep:    '#070c1a',
  metalLite: '#e2e8f0',
  metalMid:  '#94a3b8',
  metalDark: '#334155',
  bodyLite:  '#64748b',
  bodyDark:  '#1e293b',
  brass:     '#fbbf24',
  brassDark: '#b45309',
  glass:     '#bae6fd',
  beam:      '#fde68a',
  beamGlow:  'rgba(253, 230, 138, 0.35)',
  ghost:     'rgba(148, 163, 184, 0.40)',
  ok:        '#34d399',
  err:       '#f87171',
  textMain:  '#f1f5f9',
  textMuted: '#94a3b8',
};

/** DIN colour code carried by real objective lenses. */
const OBJECTIVES = {
  '4':  { label: '4×',  band: '#ef4444', len: 26, name: 'Scanning' },
  '10': { label: '10×', band: '#fbbf24', len: 40, name: 'Low power' },
  '40': { label: '40×', band: '#3b82f6', len: 54, name: 'High power' },
};

const GLOSSARY = {
  eyepiece:   { term: 'Eyepiece (Ocular Lens)',
    desc: 'The lens you look through, usually 10×.\nIt magnifies the image the objective has already made.' },
  bodyTube:   { term: 'Body Tube',
    desc: 'The hollow tube joining eyepiece to nosepiece.\nIt keeps the two lenses exactly the right distance apart.' },
  nosepiece:  { term: 'Revolving Nosepiece',
    desc: 'A turret holding the objectives. Rotate it to\nswap magnification without moving the slide.' },
  objectives: { term: 'Objective Lenses',
    desc: 'The lenses nearest the specimen: 4×, 10×, 40×.\nColour-banded red, yellow and blue by convention.' },
  stage:      { term: 'Stage & Clips',
    desc: 'The platform the slide rests on. A hole in the middle\nlets light through; the clips stop the slide sliding.' },
  coarseKnob: { term: 'Coarse Adjustment Knob',
    desc: 'The big wheel. It moves the stage up and down quickly\nto get the specimen roughly into focus.' },
  fineKnob:   { term: 'Fine Adjustment Knob',
    desc: 'The small wheel. Tiny movements that sharpen the image —\nthe only knob you use on high power.' },
  arm:        { term: 'Arm',
    desc: 'The curved backbone joining base to body tube.\nAlways carry a microscope by the arm and base.' },
  mirror:     { term: 'Mirror / Light Source',
    desc: 'Sits under the stage and throws light upward\nthrough the specimen. Modern ones use a lamp instead.' },
  base:       { term: 'Base (Foot)',
    desc: 'The heavy foot that keeps the instrument steady.\nAll the weight rests here.' },
  diaphragm:  { term: 'Diaphragm',
    desc: 'A disc of different-sized holes under the stage.\nIt controls how much light reaches the specimen.' },
  magnification: { term: 'Total Magnification',
    desc: 'Eyepiece × objective. A 10× eyepiece with a 40×\nobjective magnifies 400 times.' },
  inversion:  { term: 'Inverted Image',
    desc: 'A compound microscope shows the specimen upside down\nAND back to front. Move the slide left, the image goes right.' },
};

/** Palette order = the order you would really build it, bottom upwards. */
const PART_ORDER = [
  'base', 'arm', 'stage', 'mirror', 'nosepiece',
  'objectives', 'bodyTube', 'eyepiece', 'coarseKnob', 'fineKnob',
];

const PARTS = {
  base:       { name: 'Base (Foot)',        zone: { x: 414, y: 421, r: 90 } },
  arm:        { name: 'Arm',                zone: { x: 460, y: 300, r: 70 } },
  stage:      { name: 'Stage & Clips',      zone: { x: 380, y: 300, r: 80 } },
  mirror:     { name: 'Mirror',             zone: { x: 380, y: 384, r: 52 } },
  nosepiece:  { name: 'Revolving Nosepiece', zone: { x: 380, y: 212, r: 50 } },
  objectives: { name: 'Objective Lenses',   zone: { x: 380, y: 248, r: 52 } },
  bodyTube:   { name: 'Body Tube',          zone: { x: 380, y: 164, r: 46 } },
  eyepiece:   { name: 'Eyepiece',           zone: { x: 380, y: 100, r: 44 } },
  coarseKnob: { name: 'Coarse Knob',        zone: { x: 478, y: 300, r: 34 } },
  fineKnob:   { name: 'Fine Knob',          zone: { x: 478, y: 250, r: 26 } },
};

/** Shown when a part is dropped somewhere it does not belong. */
const HINTS = {
  eyepiece:   'The eyepiece goes right at the very top — that is where you put your eye.',
  bodyTube:   'The body tube is the hollow column joining the eyepiece down to the nosepiece.',
  nosepiece:  'The revolving nosepiece bolts on under the body tube — it is the turret that spins.',
  objectives: 'The objective lenses screw into the nosepiece, pointing down at the stage.',
  stage:      'The stage is the flat platform in the middle, where the slide sits.',
  coarseKnob: 'The big coarse knob is mounted on the arm, level with the stage.',
  fineKnob:   'The small fine knob sits on the arm just above the coarse one.',
  arm:        'The arm is the curved backbone up the back, from the base to the body tube.',
  mirror:     'The mirror belongs at the very bottom, under the stage, to throw light upward.',
  base:       'The heavy base is the foot at the bottom that the whole microscope stands on.',
};

/** One-line reward when a part locks in. */
const FACTS = {
  base:       'Always carry a microscope with one hand under the base and one on the arm.',
  arm:        'The arm keeps eyepiece and objective in a perfectly straight line.',
  stage:      'The hole in the middle of the stage is what lets the light through.',
  mirror:     'A concave mirror gathers daylight and focuses it up through the specimen.',
  nosepiece:  'Click the turret round and the magnification changes instantly.',
  objectives: 'Red = 4×, yellow = 10×, blue = 40× — a code used on microscopes worldwide.',
  bodyTube:   'Inside the tube the objective makes a real, inverted image mid-air.',
  eyepiece:   'Most eyepieces are 10×, so total magnification = 10 × the objective.',
  coarseKnob: 'Never use the coarse knob on high power — the lens can crack the slide.',
  fineKnob:   'On 40× the fine knob is the only one you should touch.',
};

/** Optical pathway: bottom-up along the axis, with the mirror bend. */
const RAY = [
  { x: 322, y: 424, label: '' },
  { x: AX,  y: 384, label: 'The mirror throws light upward.' },
  { x: AX,  y: 330, label: 'The diaphragm sets how much light gets through.' },
  { x: AX,  y: 300, label: 'Light passes through the thin, see-through specimen.' },
  { x: AX,  y: 248, label: 'The objective makes the first magnified — and inverted — image.' },
  { x: AX,  y: 164, label: 'The body tube carries that image upward.' },
  { x: AX,  y: 100, label: 'The eyepiece magnifies it again for your eye.' },
  { x: AX,  y: 62,  label: '' },
];

/** Field-of-view porthole on the left of the stage. */
const FOV = { x: 138, y: 202, r: 78 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function easeBack(t) {
  const c = 2.70158;
  const u = t - 1;
  return 1 + c * u * u * u + 1.70158 * u * u;
}

export class MicroscopeAssemblyScene extends CanvasSimulation {
  static WIDTH  = W;
  static HEIGHT = H;

  static ARIA_LABEL =
    'Assemble the compound light microscope. Ten parts wait in the palette; place each one ' +
    'on the dashed silhouette. When the instrument is complete the optical pathway lights up ' +
    'from the mirror through the specimen to the eyepiece.';

  static CONTROLS = [
    { type: 'select', id: 'objective', label: 'Objective in use:',
      options: [
        { value: '10', label: '10× (low power, yellow band)' },
        { value: '4',  label: '4× (scanning, red band)' },
        { value: '40', label: '40× (high power, blue band)' },
      ] },
    { type: 'button', id: 'trace', label: '🔦 Trace the Light Path' },
    { type: 'button', id: 'reset', label: '↻ Take It Apart' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.placed    = new Map();   // id -> { born }
    this.objective = '10';
    this._time     = 0;
    this._complete = false;
    this._rayT     = -1;          // < 0 = not tracing
    this._reject   = 0;
    this._toast    = null;
    this._focus    = null;
    this._hover    = null;
    this._fx       = [];
    this._glossKeys = Object.keys(GLOSSARY);
    this._glossIdx  = 0;
    this._glossT    = 0;
    this._settle    = false;

    this._rootEl = null; this._stageEl = null; this._statusEl = null;
    this._chips = new Map(); this._ro = null;

    this._onDragOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    this._onDrop  = this._handleDrop.bind(this);
    this._onMove  = this._handlePointerMove.bind(this);
    this._onLeave = () => { this._hover = null; this._paintOnce(); };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    this._buildDom();
    await super.setup();
    this._stageEl.appendChild(this._canvas);

    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', MicroscopeAssemblyScene.ARIA_LABEL);
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:10px;';
    this._canvas.addEventListener('dragover', this._onDragOver);
    this._canvas.addEventListener('drop', this._onDrop);
    this._canvas.addEventListener('pointermove', this._onMove);
    this._canvas.addEventListener('pointerleave', this._onLeave);

    this._buildBgCache();
    this._setMessage('Drag the parts onto the dashed outline — start from the base and build upwards.', 'info');
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
    super.destroy();
    this._ctx = null;
  }

  onControlChange(id, value) {
    if (id === 'objective') {
      this.objective = String(value);
      const o = OBJECTIVES[this.objective];
      this._focus = { id: 'magnification', until: this._time + 7, labelUntil: 0 };
      this._setMessage(`Turret rotated to the ${o.label} ${o.name.toLowerCase()} objective — total magnification 10 × ${o.label.replace('×', '')} = ${10 * Number(this.objective)}×.`, 'info');
    } else if (id === 'trace') {
      if (!this._complete) {
        this._setMessage('Finish assembling the microscope first — light cannot travel through missing parts.', 'err');
        return;
      }
      this._rayT = 0;
      this._setMessage('Following the light: mirror → diaphragm → specimen → objective → body tube → eyepiece.', 'ok');
    } else if (id === 'reset') {
      this._reset();
    }
  }

  // ── DOM shell ─────────────────────────────────────────────────────────────

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .mas-root{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:9px;
        font-family:Inter,system-ui,sans-serif;line-height:1.3;color:var(--sim-label,#e2e8f0);}
      .mas-main{display:flex;gap:10px;align-items:flex-start;}
      .mas-palette{flex:0 0 152px;display:flex;flex-direction:column;gap:4px;min-width:0;}
      .mas-stage{flex:1 1 auto;min-width:0;position:relative;}

      .mas-chip{position:relative;display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;
        padding:4px 6px;border-radius:8px;cursor:grab;text-align:left;
        background:var(--sim-bg-surface,#111827);border:1.5px solid rgba(148,163,184,0.22);
        color:var(--sim-label,#e2e8f0);font:600 10px Inter,system-ui,sans-serif;
        transition:transform .12s,border-color .15s,background .15s;}
      .mas-chip:hover{transform:translateX(2px);border-color:rgba(148,163,184,0.55);}
      .mas-chip:focus-visible{outline:2px solid var(--sim-accent,#818cf8);outline-offset:2px;}
      /* Host shells force "canvas{width:100% !important}" for the stage canvas —
         out-specify it so palette icons keep their size, then restate the stage rule. */
      .mas-root .mas-chip canvas{width:26px !important;height:26px !important;flex:0 0 26px;display:block;}
      .mas-root .mas-stage canvas{width:100% !important;height:auto !important;display:block;}
      .mas-chip .mas-chip-name{flex:1 1 auto;min-width:0;}
      .mas-chip[data-placed="1"]{background:linear-gradient(90deg,rgba(52,211,153,0.20),rgba(52,211,153,0.05)), var(--sim-bg-surface,#111827);
        border-color:rgba(52,211,153,0.65); color:var(--sim-label,#e2e8f0);}
      .mas-chip[data-placed="1"]::after{content:'✓';position:absolute;top:2px;right:5px;
        font-size:10px;font-weight:800;color:var(--sim-success,#34d399);}
      .mas-chip.mas-shake{animation:masShake .42s cubic-bezier(.36,.07,.19,.97);
        border-color:#f87171 !important;
        background:linear-gradient(rgba(248,113,113,0.16),rgba(248,113,113,0.16)), var(--sim-bg-surface,#111827) !important;}
      @keyframes masShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}
        30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}

      .mas-status{display:flex;align-items:center;gap:10px;padding:7px 11px;border-radius:9px;min-height:34px;
        box-sizing:border-box;background:var(--sim-bg-surface,#111827);border:1px solid rgba(148,163,184,0.2);}
      .mas-track{flex:0 0 108px;height:7px;border-radius:4px;background:rgba(148,163,184,0.22);overflow:hidden;}
      .mas-fill{height:100%;width:0;border-radius:4px;transition:width .35s ease;
        background:linear-gradient(90deg,#38bdf8,#34d399);}
      .mas-msg{flex:1 1 auto;min-width:0;font:500 11.5px Inter,system-ui,sans-serif;color:var(--sim-label,#cbd5e1);}
      .mas-count{flex:0 0 auto;font:700 11px Inter,system-ui,sans-serif;color:var(--sim-label,#94a3b8);white-space:nowrap;}

      .mas-root.mas-narrow .mas-main{flex-direction:column;}
      .mas-root.mas-narrow .mas-palette{flex:0 0 auto;flex-direction:row;flex-wrap:wrap;}
      .mas-root.mas-narrow .mas-chip{width:auto;flex:1 1 112px;}
      @media (prefers-reduced-motion: reduce){
        .mas-chip{transition:none;} .mas-chip.mas-shake{animation:none;}
      }
    `;

    const root = document.createElement('div');
    root.className = 'mas-root';
    root.appendChild(style);

    const main = document.createElement('div');
    main.className = 'mas-main';

    const palette = document.createElement('div');
    palette.className = 'mas-palette';
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', 'Microscope parts — press Enter on a part to fit it');
    for (const id of PART_ORDER) palette.appendChild(this._buildChip(id));

    const stage = document.createElement('div');
    stage.className = 'mas-stage';

    main.appendChild(palette);
    main.appendChild(stage);

    const status = document.createElement('div');
    status.className = 'mas-status';
    status.innerHTML =
      '<div class="mas-track"><div class="mas-fill"></div></div>' +
      '<div class="mas-msg" role="status" aria-live="polite"></div>' +
      '<div class="mas-count"></div>';

    root.appendChild(main);
    root.appendChild(status);
    this.container.appendChild(root);

    this._rootEl = root; this._stageEl = stage; this._statusEl = status;

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect?.width || 0;
        root.classList.toggle('mas-narrow', w > 0 && w < 520);
      });
      this._ro.observe(root);
    }
    this._syncChips();
  }

  _buildChip(id) {
    const p = PARTS[id];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mas-chip';
    chip.draggable = true;
    chip.dataset.part = id;
    chip.dataset.placed = '0';

    const thumb = document.createElement('canvas');
    thumb.width = 52; thumb.height = 52;
    thumb.setAttribute('aria-hidden', 'true');
    this._renderThumb(thumb, id);

    const name = document.createElement('span');
    name.className = 'mas-chip-name';
    name.textContent = p.name;

    chip.appendChild(thumb);
    chip.appendChild(name);
    chip.setAttribute('aria-label', `${p.name}. Press Enter to fit it, or drag it onto the microscope.`);

    chip.addEventListener('click', () => this._place(id, null));
    chip.addEventListener('dragstart', (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'copy';
      }
    });
    this._chips.set(id, chip);
    return chip;
  }

  /** Palette icon, painted by the same routine that draws the part on the stage. */
  _renderThumb(canvasEl, id) {
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, 52, 52);
    const z = PARTS[id].zone;
    const fit = { base: 0.24, arm: 0.28, stage: 0.28, mirror: 0.60, nosepiece: 0.48,
      objectives: 0.52, bodyTube: 0.52, eyepiece: 0.60, coarseKnob: 0.80, fineKnob: 1.30 }[id];
    // a few parts are not centred on their zone; nudge them into the icon
    const off = { objectives: { x: 0, y: 14 }, eyepiece: { x: 0, y: 2 }, stage: { x: -4, y: -4 } }[id];
    ctx.save();
    ctx.translate(26, 26);
    ctx.scale(fit, fit);
    ctx.translate(-z.x - (off?.x || 0), -z.y - (off?.y || 0));
    this._paintPart(ctx, id, 1, true);
    ctx.restore();
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  _handleDrop(e) {
    e.preventDefault();
    const id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    if (!id || !PARTS[id]) return;
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width) return;
    this._place(id, {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    });
  }

  _handlePointerMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    let best = null, bestD = Infinity;
    for (const id of this.placed.keys()) {
      const z = PARTS[id].zone;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < z.r && d < bestD) { bestD = d; best = id; }
    }
    const changed = best !== this._hover;
    this._hover = best;
    this._canvas.style.cursor = best ? 'help' : 'default';
    if (changed) this._paintOnce();
  }

  /**
   * @param {string} id
   * @param {{x:number,y:number}|null} point  drop coords, or null for keyboard/click
   */
  _place(id, point) {
    if (this.placed.has(id)) {
      this._setMessage(`${PARTS[id].name} is already fitted.`, 'info');
      return;
    }
    // The objectives screw into the turret — the one real ordering rule.
    if (id === 'objectives' && !this.placed.has('nosepiece')) {
      this._fail(id, 'The objective lenses screw into the revolving nosepiece — fit the nosepiece first.');
      return;
    }
    if (point) {
      const z = PARTS[id].zone;
      if (Math.hypot(z.x - point.x, z.y - point.y) > z.r) {
        this._fail(id, HINTS[id]);
        return;
      }
    }

    this.placed.set(id, { born: this._time });
    this._burst(PARTS[id].zone.x, PARTS[id].zone.y, COLORS.brass, 12);
    this._toast = { text: FACTS[id], kind: 'ok', life: 4.4, max: 4.4, title: PARTS[id].name };
    this._focus = { id, until: this._time + 8, labelUntil: this._time + 4 };
    this._syncChips();
    this._setMessage(`✔ ${PARTS[id].name} locked in. ${FACTS[id]}`, 'ok');

    if (this.placed.size === PART_ORDER.length && !this._complete) {
      this._complete = true;
      this._rayT = 0;
      this._focus = { id: 'inversion', until: this._time + 14, labelUntil: 0 };
      this._setMessage('🎉 The microscope is assembled — watch the light travel up to your eye.', 'ok');
      for (let i = 0; i < 50; i++) {
        const a = Math.random() * Math.PI * 2;
        this._fx.push({ x: AX, y: 250, vx: Math.cos(a) * (50 + Math.random() * 150),
          vy: Math.sin(a) * (50 + Math.random() * 150), r: 1.4 + Math.random() * 2.4,
          life: 1.5, max: 1.5, color: [COLORS.ok, COLORS.brass, '#38bdf8'][i % 3] });
      }
    }
  }

  _fail(id, why) {
    this._reject = 1;
    this._toast = { text: why, kind: 'err', life: 5, max: 5 };
    this._focus = { id, until: this._time + 8, labelUntil: 0 };
    this._shake(id);
    this._setMessage(`✘ ${why}`, 'err');
  }

  _reset() {
    this.placed.clear();
    this._complete = false;
    this._rayT = -1;
    this._toast = null;
    this._focus = null;
    this._fx = [];
    this._syncChips();
    this._setMessage('Microscope dismantled. Build it again from the base upwards.', 'info');
  }

  _shake(id) {
    const chip = this._chips.get(id);
    if (!chip) return;
    chip.classList.remove('mas-shake');
    void chip.offsetWidth;
    chip.classList.add('mas-shake');
    setTimeout(() => chip.classList.remove('mas-shake'), 480);
  }

  _syncChips() {
    for (const [id, chip] of this._chips) {
      const on = this.placed.has(id);
      chip.dataset.placed = on ? '1' : '0';
      chip.setAttribute('aria-label', on
        ? `${PARTS[id].name}, fitted.`
        : `${PARTS[id].name}. Press Enter to fit it, or drag it onto the microscope.`);
    }
    this._syncProgress();
  }

  _syncProgress() {
    if (!this._statusEl) return;
    const done = this.placed.size;
    const fill = this._statusEl.querySelector('.mas-fill');
    const count = this._statusEl.querySelector('.mas-count');
    if (fill)  fill.style.width = `${(done / PART_ORDER.length) * 100}%`;
    if (count) count.textContent = `${done} / ${PART_ORDER.length} parts`;
  }

  _setMessage(text, kind) {
    this._syncProgress();
    const msg = this._statusEl?.querySelector('.mas-msg');
    if (msg) {
      msg.textContent = text;
      msg.style.color = kind === 'err' ? COLORS.err : kind === 'ok' ? COLORS.ok : 'var(--sim-label,#cbd5e1)';
    }
    this._paintOnce();
  }

  /** Draw one frame when the rAF loop is not running (paused hosts). */
  _paintOnce() {
    if (!this._ctx || this._rafId) return;
    this._settle = true;
    this._tick(this._ctx, 0);
    this._settle = false;
  }

  _ageOf(born) { return this._settle ? 99 : this._time - (born ?? 0); }

  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 70;
      this._fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.2 + Math.random() * 2, life: 0.8, max: 0.8, color });
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────

  _update(dt) {
    this._time += dt;
    this._glossT += dt;
    if (this._reject > 0) this._reject = Math.max(0, this._reject - dt * 1.6);
    if (this._toast) { this._toast.life -= dt; if (this._toast.life <= 0) this._toast = null; }
    if (this._focus && this._time > this._focus.until) this._focus = null;
    if (this._glossT > 7) { this._glossT = 0; this._glossIdx = (this._glossIdx + 1) % this._glossKeys.length; }
    if (this._rayT >= 0) {
      this._rayT += dt;
      if (this._rayT > RAY.length * 1.15 + 2.4) this._rayT = -1;
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
    this._drawGhosts(ctx);
    this._drawLightBeam(ctx);
    for (const id of PART_ORDER) {
      if (!this.placed.has(id)) continue;
      const age = this._ageOf(this.placed.get(id).born);
      const grow = age < 0.45 ? easeBack(clamp(age / 0.45, 0, 1)) : 1;
      this._paintPart(ctx, id, grow, false);
      if (age < 0.8 && !this._settle) {
        const z = PARTS[id].zone;
        ctx.save();
        ctx.globalAlpha = (1 - age / 0.8) * 0.7;
        ctx.strokeStyle = COLORS.ok;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * (0.55 + age * 0.9), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    this._drawFx(ctx);
    this._drawFieldOfView(ctx);
    this._drawOverlay(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _buildBgCache() {
    const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ctx = oc.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e1a33');
    g.addColorStop(0.62, '#0a1224');
    g.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // lab bench the instrument stands on
    const bg = ctx.createLinearGradient(0, 430, 0, H);
    bg.addColorStop(0, 'rgba(56, 87, 130, 0.28)');
    bg.addColorStop(1, 'rgba(10, 18, 36, 0.9)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 434, W, H - 434);
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 434.5); ctx.lineTo(W, 434.5); ctx.stroke();

    // faint graph-paper grid
    ctx.strokeStyle = 'rgba(148,163,184,0.05)';
    for (let x = 0; x <= W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 434); ctx.stroke(); }
    for (let y = 0; y <= 434; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }
    if (this._reject > 0) {
      ctx.save();
      ctx.globalAlpha = this._reject * 0.3;
      const g = ctx.createRadialGradient(AX, 250, 90, AX, 250, 380);
      g.addColorStop(0, 'rgba(248,113,113,0)');
      g.addColorStop(1, COLORS.err);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  /** Dashed silhouette of everything still missing. */
  _drawGhosts(ctx) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -this._time * 12;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.62)';
    ctx.lineWidth = 1.8;
    ctx.fillStyle = 'rgba(148,163,184,0.10)';
    for (const id of PART_ORDER) {
      if (this.placed.has(id)) continue;
      this._partPath(ctx, id);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Part geometry ─────────────────────────────────────────────────────────
  // _partPath builds the silhouette used for the ghost outline; _paintPart
  // renders the finished, shaded version at the same coordinates.

  _partPath(ctx, id) {
    ctx.beginPath();
    switch (id) {
      case 'base':
        ctx.moveTo(316, 434); ctx.lineTo(512, 434);
        ctx.lineTo(500, 406); ctx.lineTo(352, 406);
        ctx.quadraticCurveTo(320, 408, 316, 434);
        ctx.closePath();
        break;
      case 'arm':
        ctx.moveTo(432, 410);
        ctx.bezierCurveTo(486, 400, 496, 330, 490, 258);
        ctx.bezierCurveTo(486, 214, 448, 190, 404, 190);
        ctx.lineTo(404, 214);
        ctx.bezierCurveTo(444, 214, 462, 232, 466, 262);
        ctx.bezierCurveTo(472, 328, 462, 384, 428, 388);
        ctx.closePath();
        break;
      case 'stage':
        ctx.roundRect(300, 292, 156, 17, 3);
        break;
      case 'mirror':
        ctx.ellipse(AX, 384, 30, 13, -0.42, 0, Math.PI * 2);
        break;
      case 'nosepiece':
        ctx.ellipse(AX, 210, 45, 16, 0, 0, Math.PI * 2);
        break;
      case 'objectives': {
        for (const s of this._objectiveSlots()) {
          ctx.moveTo(s.x - s.w / 2, s.y);
          ctx.lineTo(s.x + s.w / 2, s.y);
          ctx.lineTo(s.x + s.w / 2 - 2, s.y + s.len);
          ctx.lineTo(s.x - s.w / 2 + 2, s.y + s.len);
          ctx.closePath();
        }
        break;
      }
      case 'bodyTube':
        ctx.roundRect(AX - 15, 126, 30, 76, 3);
        break;
      case 'eyepiece':
        ctx.roundRect(AX - 20, 74, 40, 14, 3);
        ctx.roundRect(AX - 14, 88, 28, 40, 2);
        break;
      case 'coarseKnob':
        ctx.arc(478, 300, 26, 0, Math.PI * 2);
        break;
      case 'fineKnob':
        ctx.arc(478, 250, 15, 0, Math.PI * 2);
        break;
      default: break;
    }
  }

  /** Where the three objectives hang off the turret; the in-use one is on the axis. */
  _objectiveSlots() {
    const keys = ['4', '10', '40'];
    const active = keys.indexOf(this.objective);
    return keys.map((k, i) => {
      const rel = (i - active + 3) % 3;             // 0 = in use, 1/2 = parked
      const o = OBJECTIVES[k];
      if (rel === 0) return { x: AX, y: 220, w: 17, len: o.len, band: o.band, label: o.label, active: true };
      const side = rel === 1 ? 1 : -1;
      return { x: AX + side * 34, y: 214, w: 13, len: o.len * 0.66, band: o.band, label: o.label, active: false };
    });
  }

  // ── Part rendering ────────────────────────────────────────────────────────

  _paintPart(ctx, id, grow, thumb) {
    const z = PARTS[id].zone;
    ctx.save();
    if (grow < 1) {
      ctx.translate(z.x, z.y);
      ctx.scale(grow, grow);
      ctx.translate(-z.x, -z.y);
    }
    switch (id) {
      case 'base':       this._pBase(ctx); break;
      case 'arm':        this._pArm(ctx); break;
      case 'stage':      this._pStage(ctx, thumb); break;
      case 'mirror':     this._pMirror(ctx); break;
      case 'nosepiece':  this._pNosepiece(ctx); break;
      case 'objectives': this._pObjectives(ctx); break;
      case 'bodyTube':   this._pBodyTube(ctx); break;
      case 'eyepiece':   this._pEyepiece(ctx); break;
      case 'coarseKnob': this._pKnob(ctx, 478, 300, 26, 'C'); break;
      case 'fineKnob':   this._pKnob(ctx, 478, 250, 15, 'F'); break;
      default: break;
    }
    ctx.restore();
  }

  /** Brushed-metal fill used by every structural part. */
  _metal(ctx, x0, y0, x1, y1, tint) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, tint === 'dark' ? '#475569' : COLORS.metalLite);
    g.addColorStop(0.35, tint === 'dark' ? '#334155' : COLORS.metalMid);
    g.addColorStop(0.62, tint === 'dark' ? '#1e293b' : '#64748b');
    g.addColorStop(1, tint === 'dark' ? '#0f172a' : COLORS.metalDark);
    return g;
  }

  _pBase(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    this._partPath(ctx, 'base');
    ctx.fillStyle = this._metal(ctx, 316, 402, 512, 436, 'dark');
    ctx.fill();
    ctx.restore();
    // top highlight lip
    ctx.beginPath();
    ctx.moveTo(352, 407); ctx.lineTo(500, 407);
    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _pArm(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    this._partPath(ctx, 'arm');
    ctx.fillStyle = this._metal(ctx, 404, 190, 496, 410, 'dark');
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(226,232,240,0.35)';
    ctx.lineWidth = 1.4;
    this._partPath(ctx, 'arm');
    ctx.stroke();
  }

  _pStage(ctx, thumb) {
    // platform
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(300, 292, 156, 17, 3);
    ctx.fillStyle = this._metal(ctx, 300, 292, 300, 309, 'dark');
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(226,232,240,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(300, 293); ctx.lineTo(456, 293); ctx.stroke();

    // aperture the light comes through
    ctx.beginPath();
    ctx.ellipse(AX, 300, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#020617';
    ctx.fill();

    // glass slide with the specimen letter "e"
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.roundRect(336, 286, 92, 7, 1.5);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 9px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('e', AX, 289.5);

    // spring clips holding the slide down
    ctx.strokeStyle = COLORS.metalLite;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (const cx of [332, 430]) {
      ctx.beginPath();
      ctx.moveTo(cx, 292);
      ctx.quadraticCurveTo(cx + (cx < AX ? 10 : -10), 283, cx + (cx < AX ? 20 : -20), 289);
      ctx.stroke();
    }

    if (thumb) return;
    // condenser + diaphragm disc slung under the aperture
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(AX, 330, 22, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = this._metal(ctx, AX - 22, 322, AX + 22, 338, 'dark');
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,232,240,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + this._time * 0.25;
      ctx.beginPath();
      ctx.ellipse(AX + Math.cos(a) * 14, 330 + Math.sin(a) * 4.6, 2.6, 1.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#020617';
      ctx.fill();
    }
    ctx.restore();
    // strut down to the base
    ctx.strokeStyle = 'rgba(100,116,139,0.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(AX, 336); ctx.lineTo(AX, 366);
    ctx.stroke();
  }

  _pMirror(ctx) {
    // fork mount
    ctx.strokeStyle = COLORS.metalDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(AX, 404); ctx.lineTo(AX, 392);
    ctx.stroke();

    ctx.save();
    ctx.translate(AX, 384);
    ctx.rotate(-0.42);
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 13, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(-30, -13, 30, 13);
    g.addColorStop(0, '#f8fafc');
    g.addColorStop(0.45, '#7dd3fc');
    g.addColorStop(1, '#475569');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = COLORS.metalDark;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // concave sheen
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(-8, -3, 12, 4, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  _pNosepiece(ctx) {
    // turret body (a disc seen at a shallow angle)
    ctx.beginPath();
    ctx.moveTo(AX - 45, 202);
    ctx.lineTo(AX + 45, 202);
    ctx.lineTo(AX + 45, 212);
    ctx.ellipse(AX, 212, 45, 16, 0, 0, Math.PI);
    ctx.lineTo(AX - 45, 202);
    ctx.closePath();
    ctx.fillStyle = this._metal(ctx, AX - 45, 196, AX + 45, 228, 'dark');
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(AX, 202, 45, 16, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(AX - 45, 186, AX + 45, 218);
    g.addColorStop(0, COLORS.metalLite);
    g.addColorStop(0.5, COLORS.metalMid);
    g.addColorStop(1, '#475569');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // knurled grip ring
    ctx.save();
    ctx.strokeStyle = 'rgba(15,23,42,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const x = AX + Math.cos(a) * 41, y = 202 + Math.sin(a) * 14.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(AX + Math.cos(a) * 45, 202 + Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  _pObjectives(ctx) {
    for (const s of this._objectiveSlots()) {
      ctx.save();
      if (s.active) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8; }
      // barrel, tapering slightly toward the lens
      ctx.beginPath();
      ctx.moveTo(s.x - s.w / 2, s.y);
      ctx.lineTo(s.x + s.w / 2, s.y);
      ctx.lineTo(s.x + s.w / 2 - 2, s.y + s.len);
      ctx.lineTo(s.x - s.w / 2 + 2, s.y + s.len);
      ctx.closePath();
      ctx.fillStyle = this._metal(ctx, s.x - s.w / 2, s.y, s.x + s.w / 2, s.y, s.active ? undefined : 'dark');
      ctx.fill();
      ctx.restore();

      // DIN colour band
      ctx.beginPath();
      ctx.rect(s.x - s.w / 2 + 1, s.y + s.len * 0.62, s.w - 2, 5);
      ctx.fillStyle = s.band;
      ctx.fill();

      // front lens element
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + s.len, s.w / 2 - 2.5, 2.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = s.active ? COLORS.glass : '#475569';
      ctx.fill();

      if (s.active) {
        ctx.fillStyle = COLORS.textMain;
        ctx.font = '700 8px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, s.x, s.y + s.len * 0.35);
      }
    }
  }

  _pBodyTube(ctx) {
    ctx.beginPath();
    ctx.roundRect(AX - 15, 126, 30, 76, 3);
    ctx.fillStyle = this._metal(ctx, AX - 15, 126, AX + 15, 126);
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,232,240,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // rack teeth on the back, where the focus knobs bite
    ctx.strokeStyle = 'rgba(15,23,42,0.45)';
    ctx.lineWidth = 1;
    for (let y = 134; y < 198; y += 6) {
      ctx.beginPath();
      ctx.moveTo(AX + 8, y); ctx.lineTo(AX + 14, y);
      ctx.stroke();
    }
  }

  _pEyepiece(ctx) {
    // eyecup flange
    ctx.beginPath();
    ctx.roundRect(AX - 20, 74, 40, 14, 3);
    ctx.fillStyle = this._metal(ctx, AX - 20, 74, AX + 20, 74, 'dark');
    ctx.fill();
    // barrel
    ctx.beginPath();
    ctx.roundRect(AX - 14, 88, 28, 40, 2);
    ctx.fillStyle = this._metal(ctx, AX - 14, 88, AX + 14, 88);
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,232,240,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // ocular glass
    ctx.beginPath();
    ctx.ellipse(AX, 79, 16, 5, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(AX - 4, 77, 1, AX, 79, 16);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, COLORS.glass);
    g.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = g;
    ctx.fill();
    // engraved 10x
    ctx.fillStyle = COLORS.brass;
    ctx.font = '700 8px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('10×', AX, 106);
  }

  _pKnob(ctx, x, y, r, letter) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#64748b');
    g.addColorStop(0.55, COLORS.bodyDark);
    g.addColorStop(1, '#020617');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    // ribbed grip
    ctx.strokeStyle = 'rgba(226,232,240,0.30)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (letter === 'C' ? this._time * 0.35 : -this._time * 0.9);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
      ctx.lineTo(x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.metalMid;
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 ${Math.round(r * 0.5)}px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y + 0.5);
  }

  // ── Optical pathway ───────────────────────────────────────────────────────

  _drawLightBeam(ctx) {
    if (!this._complete) return;
    const seg = this._rayT >= 0 ? this._rayT / 1.15 : RAY.length;   // finished → full beam
    const steady = this._rayT < 0;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < RAY.length; i++) {
      const a = RAY[i - 1], b = RAY[i];
      const local = clamp(seg - (i - 1), 0, 1);
      if (local <= 0) break;
      const ex = lerp(a.x, b.x, local), ey = lerp(a.y, b.y, local);

      // Once the trace has run the beam settles to a faint standing glow, so it
      // reads as "light is flowing" without painting a gold rod over the optics.
      ctx.globalAlpha = steady ? 0.22 + Math.sin(this._time * 2.2) * 0.05 : 0.9;
      ctx.strokeStyle = COLORS.beamGlow;
      ctx.lineWidth = steady ? 9 : 13;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();

      if (!steady) {
        ctx.strokeStyle = COLORS.beam;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
      }

      if (local < 1) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#fffbeb';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Caption naming the leg of the pathway currently being traced. */
  _rayCaption() {
    if (this._rayT < 0) return '';
    const idx = clamp(Math.floor(this._rayT / 1.15) + 1, 1, RAY.length - 1);
    return RAY[idx]?.label || '';
  }

  // ── Field of view ─────────────────────────────────────────────────────────

  _drawFieldOfView(ctx) {
    const on = this._complete;
    const lit = on && (this._rayT < 0 || this._rayT > RAY.length * 1.15 - 1.6);
    ctx.save();

    // porthole rim
    ctx.beginPath();
    ctx.arc(FOV.x, FOV.y, FOV.r + 7, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1120';
    ctx.fill();
    ctx.strokeStyle = lit ? 'rgba(253,230,138,0.65)' : 'rgba(148,163,184,0.28)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(FOV.x, FOV.y, FOV.r, 0, Math.PI * 2);
    ctx.clip();

    if (lit) {
      // Real brightfield illumination is near-white with a faint warm cast.
      const g = ctx.createRadialGradient(FOV.x, FOV.y, 4, FOV.x, FOV.y, FOV.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.72, '#fdf8ec');
      g.addColorStop(1, '#f0e2c0');
      ctx.fillStyle = g;
      ctx.fillRect(FOV.x - FOV.r, FOV.y - FOV.r, FOV.r * 2, FOV.r * 2);

      // the specimen, magnified — and rotated 180° by the objective
      const total = 10 * Number(this.objective);
      ctx.save();
      ctx.translate(FOV.x, FOV.y);
      ctx.rotate(Math.PI);
      ctx.fillStyle = '#1e1b4b';
      ctx.font = `800 ${Math.round(46 + total * 0.19)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('e', 0, 0);
      ctx.restore();

      // paper fibres, for texture
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const a = i * 1.7, rr = 18 + (i * 9) % 58;
        ctx.beginPath();
        ctx.moveTo(FOV.x + Math.cos(a) * rr, FOV.y + Math.sin(a) * rr);
        ctx.lineTo(FOV.x + Math.cos(a + 0.8) * (rr + 12), FOV.y + Math.sin(a + 0.8) * (rr + 12));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#070c18';
      ctx.fillRect(FOV.x - FOV.r, FOV.y - FOV.r, FOV.r * 2, FOV.r * 2);
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.font = '600 11px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(on ? 'light on its way…' : 'dark — no light yet', FOV.x, FOV.y);
    }
    ctx.restore();

    // caption
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 10.5px Inter, system-ui';
    ctx.fillStyle = lit ? COLORS.brass : COLORS.textMuted;
    ctx.fillText('WHAT YOU SEE', FOV.x, FOV.y - FOV.r - 20);
    ctx.restore();

    if (lit) {
      const total = 10 * Number(this.objective);
      this._pill(ctx, `10× eyepiece × ${OBJECTIVES[this.objective].label} objective = ${total}×`,
        FOV.x, FOV.y + FOV.r + 22, { bg: 'rgba(15,23,42,0.92)', color: COLORS.brass });
      this._pill(ctx, 'the "e" is upside down & back to front',
        FOV.x, FOV.y + FOV.r + 46, { bg: 'rgba(15,23,42,0.92)', color: '#93c5fd' });
    }
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  _drawOverlay(ctx) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 17px Inter, system-ui';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('🔬  COMPOUND LIGHT MICROSCOPE', 16, 27);
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Two lenses in line — the objective magnifies, then the eyepiece magnifies again', 17, 43);
    ctx.restore();

    const done = this.placed.size;
    this._pill(ctx, `${done}/${PART_ORDER.length} parts fitted`, W - 16, 26,
      { align: 'right', color: done === PART_ORDER.length ? COLORS.ok : COLORS.textMain });

    // name the part just fitted, then whatever is hovered
    const justId = this._focus && this._time < this._focus.labelUntil && PARTS[this._focus.id]
      ? this._focus.id : null;
    if (justId && justId !== this._hover) {
      const z = PARTS[justId].zone;
      this._pill(ctx, PARTS[justId].name, z.x, z.y - z.r - 6, { color: COLORS.brass });
    }
    if (this._hover) {
      const z = PARTS[this._hover].zone;
      ctx.save();
      ctx.strokeStyle = COLORS.brass;
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * 0.8 + Math.sin(this._time * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this._pill(ctx, PARTS[this._hover].name, z.x, z.y - z.r - 6, { color: COLORS.brass });
    }

    // The light-path narration takes over the toast slot while it runs.
    const caption = this._rayCaption();
    if (caption) this._drawToast(ctx, { text: caption, kind: 'ray', life: 9, max: 9 });
    else if (this._toast) this._drawToast(ctx, this._toast);
    this._drawGlossaryCard(ctx);
  }

  _pill(ctx, text, x, y, { align = 'center', bg = 'rgba(15,23,42,0.88)', color = COLORS.textMain } = {}) {
    ctx.save();
    ctx.font = '700 11px Inter, system-ui';
    const w = ctx.measureText(text).width + 20;
    const h = 22;
    const bx = clamp(align === 'right' ? x - w : align === 'left' ? x : x - w / 2, 4, W - w - 4);
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

  _drawToast(ctx, toast) {
    const ray = toast.kind === 'ray';
    const fade = ray ? 1 : clamp(toast.life / 0.6, 0, 1) * clamp((toast.max - toast.life) / 0.25, 0, 1);
    const ok = toast.kind === 'ok';
    const lines = this._wrap(ctx, toast.text, 400, '600 12px Inter, system-ui');
    const padX = 14, padY = 11, lineH = 16;
    const titleH = toast.title ? 17 : 0;
    ctx.save();
    ctx.font = '600 12px Inter, system-ui';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    if (toast.title) {
      ctx.font = '800 12.5px Inter, system-ui';
      maxW = Math.max(maxW, ctx.measureText(`✔  ${toast.title}`).width);
    }
    const bw = maxW + padX * 2 + 6;
    const bh = lines.length * lineH + padY * 2 + titleH;
    const bx = (W - bw) / 2, by = 54;

    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 11);
    ctx.fillStyle = ray ? 'rgba(69,26,3,0.95)' : ok ? 'rgba(6,78,59,0.94)' : 'rgba(76,14,20,0.94)';
    ctx.fill();
    ctx.strokeStyle = ray ? 'rgba(251,191,36,0.8)' : ok ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let ty = by + padY;
    if (toast.title) {
      ctx.font = '800 12.5px Inter, system-ui';
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText(`✔  ${toast.title}`, bx + padX, ty);
      ty += titleH;
    }
    ctx.font = '600 12px Inter, system-ui';
    ctx.fillStyle = ray ? '#fde68a' : ok ? '#d1fae5' : '#fecaca';
    if (ray) {
      ctx.fillText('🔦', bx + padX, ty);
      lines.forEach((l, i) => ctx.fillText(l, bx + padX + 20, ty + i * lineH));
    } else if (!toast.title) {
      ctx.fillText('✘', bx + padX, ty);
      lines.forEach((l, i) => ctx.fillText(l, bx + padX + 16, ty + i * lineH));
    } else {
      lines.forEach((l, i) => ctx.fillText(l, bx + padX, ty + i * lineH));
    }
    ctx.restore();
  }

  _drawGlossaryCard(ctx) {
    const key = (this._focus && GLOSSARY[this._focus.id] ? this._focus.id : null)
      || (this._hover && GLOSSARY[this._hover] ? this._hover : null)
      || this._glossKeys[this._glossIdx];
    const item = GLOSSARY[key] || GLOSSARY.eyepiece;
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

    if (!this._focus && !this._hover) {
      ctx.beginPath();
      ctx.roundRect(x + 2, y - 4, (w - 4) * (this._glossT / 7), 2, 1);
      ctx.fillStyle = 'rgba(59,130,246,0.6)';
      ctx.fill();
    }
    ctx.restore();
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
}
