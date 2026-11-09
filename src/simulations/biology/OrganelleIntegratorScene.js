import { CanvasSimulation } from '../base/CanvasSimulation.js';

/**
 * OrganelleIntegratorScene — Part 2.4 "The Organelle Integrator" logic puzzle.
 *
 * Nine organelles sit in a fan across the cell. A task card sets a job the cell
 * has to do — clean up a worn-out part, export a protein, power the cell — and
 * the student wires the pathway by clicking one organelle then the next to draw
 * an arrow between them. "Check Pathway" grades the whole answer at once:
 * correct arrows turn green and cargo starts flowing along them, wrong ones
 * flash red and explain why that hand-off does not happen.
 *
 * The point of the puzzle is the big idea of the chapter — organelles are not
 * a list to memorise, they are a *team* that passes work between them.
 *
 * ── Deviations from the sprint spec (deliberate) ──────────────────────────
 * The spec sketches DOM nodes with SVG connectors; the fan and the arrows are
 * drawn on Canvas-2D instead so the connections can carry animated cargo and
 * the organelles can use the same iconography as the rest of the biology suite.
 * The canvas is focusable and fully keyboard-operable (arrows move between
 * organelles, Enter links them, Backspace undoes), and every state change is
 * announced through an aria-live status line.
 *
 * Challenge 1 is autophagy: a lysosome digests a worn-out mitochondrion and the
 * broken-down materials return to the cytoplasm to be re-used. Challenge 2 is
 * the secretory pathway. Challenge 3 is respiration feeding ATP to two jobs
 * that need it.
 *
 * NOTE: canvas fillStyle/strokeStyle cannot resolve CSS var() — hex values from
 * sim-theme.css are inlined in COLORS below.
 */

const W = 620;
const H = 470;

const COLORS = {
  bgDeep:    '#070c1a',
  cell:      'rgba(30, 58, 95, 0.30)',
  card:      '#131f38',
  cardEdge:  'rgba(148,163,184,0.34)',
  draft:     '#fbbf24',
  ok:        '#34d399',
  err:       '#f87171',
  textMain:  '#f1f5f9',
  textMuted: '#94a3b8',
  accent:    '#818cf8',
};

// Spread wide enough that even neighbouring cards leave room for a visible arrow.
const NODES = {
  cytoplasm:    { name: 'Cytoplasm',    x: 52,  y: 374, color: '#38bdf8' },
  nucleus:      { name: 'Nucleus',      x: 54,  y: 286, color: '#6366f1' },
  ribosome:     { name: 'Ribosome',     x: 114, y: 210, color: '#cbd5e1' },
  rer:          { name: 'Rough ER',     x: 214, y: 166, color: '#818cf8' },
  golgi:        { name: 'Golgi Body',   x: 322, y: 154, color: '#ec4899' },
  ser:          { name: 'Smooth ER',    x: 430, y: 166, color: '#a5b4fc' },
  lysosome:     { name: 'Lysosome',     x: 530, y: 210, color: '#ef4444' },
  mitochondria: { name: 'Mitochondria', x: 572, y: 286, color: '#f59e0b' },
  membrane:     { name: 'Membrane',     x: 572, y: 374, color: '#4f9cf7' },
};

const NODE_ORDER = Object.keys(NODES);
const CARD_W = 78;
const CARD_H = 42;

const CHALLENGES = [
  {
    title: 'Clean up a worn-out part',
    brief: 'A mitochondrion has stopped working. Wire the route that digests it and returns the pieces for re-use.',
    cargo: '#a3e635',   // recycled building blocks
    links: [['mitochondria', 'lysosome'], ['lysosome', 'cytoplasm']],
    solved: 'Autophagy! The lysosome engulfs the worn-out mitochondrion, its enzymes break it down, and the useful ' +
            'building blocks go back into the cytoplasm to be used again.',
  },
  {
    title: 'Make and export a protein',
    brief: 'The cell needs to build a protein and push it out through the cell surface. Wire the whole production line.',
    cargo: '#f472b6',   // the protein being built and shipped
    links: [['nucleus', 'ribosome'], ['ribosome', 'rer'], ['rer', 'golgi'], ['golgi', 'membrane']],
    solved: 'The secretory pathway! The nucleus sends the instructions, the ribosome builds the protein into the ' +
            'rough ER, the Golgi packages it into a vesicle, and the vesicle fuses with the membrane to release it.',
  },
  {
    title: 'Power the cell',
    brief: 'Glucose is waiting in the cytoplasm. Wire it to the powerhouse, then send the energy to two jobs that ' +
           'need it: building proteins, and pumping things across the cell surface.',
    cargo: '#fbbf24',   // ATP
    links: [['cytoplasm', 'mitochondria'], ['mitochondria', 'ribosome'], ['mitochondria', 'membrane']],
    solved: 'Respiration! Glucose from the cytoplasm is broken down inside the mitochondria, and the ATP made there ' +
            'powers work all over the cell — including protein synthesis and active transport.',
  },
];

/** Targeted corrections for the mistakes students actually make. */
const WRONG = {
  'nucleus->golgi':       'The instructions cannot jump straight to the Golgi — a ribosome has to build the protein first.',
  'nucleus->membrane':    'The nucleus never sends anything straight out of the cell. Its message goes to a ribosome.',
  'nucleus->rer':         'Close! The message from the nucleus is read by a *ribosome*; the rough ER is where those ribosomes sit.',
  'ribosome->golgi':      'Not quite — a protein made on the rough ER travels through the ER first, then to the Golgi.',
  'ribosome->membrane':   'A ribosome cannot post a protein out of the cell by itself. It needs the ER and Golgi.',
  'golgi->lysosome':      'True in general — the Golgi does make lysosomes — but that is not the job asked for here.',
  'golgi->cytoplasm':     'For export, the Golgi sends its vesicle to the cell membrane, not into the cytoplasm.',
  'lysosome->membrane':   'The digested material is recycled inside the cell, into the cytoplasm — not thrown out.',
  'mitochondria->cytoplasm': 'For this job the worn-out mitochondrion must be digested by a lysosome first.',
  'membrane->mitochondria':  'Glucose is already inside, waiting in the cytoplasm. Start from there.',
  'ser->golgi':           'The smooth ER handles fats, not this job.',
  'cytoplasm->lysosome':  'The lysosome receives the worn-out organelle, not raw cytoplasm.',
  'cytoplasm->ribosome':  'Glucose has to be broken down in the mitochondria before it can power the ribosome.',
};

/** Point where an arrow should leave/enter a node card (edge of its box). */
function edgePoint(node, towards) {
  const dx = towards.x - node.x, dy = towards.y - node.y;
  const hw = CARD_W / 2 + 2, hh = CARD_H / 2 + 2;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: node.x + dx * s, y: node.y + dy * s };
}

/** Centre of the fan — arrows bow away from it so none get lost behind a card. */
const FAN = { x: 312, y: 292 };

/**
 * Quadratic control point. The bow always points outward, away from the middle
 * of the fan, which keeps short hops between neighbouring cards visible as
 * proper arcs instead of a two-pixel stub.
 */
function ctrlPoint(a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.max(28, Math.min(len * 0.18, 48));
  let nx = -dy / len, ny = dx / len;
  if ((mx - FAN.x) * nx + (my - FAN.y) * ny < 0) { nx = -nx; ny = -ny; }
  return { x: mx + nx * bow, y: my + ny * bow };
}

function quadAt(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
           y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

export class OrganelleIntegratorScene extends CanvasSimulation {
  static WIDTH  = W;
  static HEIGHT = H;

  static ARIA_LABEL =
    'The Organelle Integrator. Nine organelles are arranged in a fan. Pick a challenge, then link ' +
    'one organelle to the next to build the pathway that gets the job done, and check your answer.';

  // Controls live in the scene itself (challenge tabs sit next to the puzzle),
  // so no host control bar is declared.

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;

    this.challenge = 0;
    this.links     = [];    // { from, to, state: 'draft'|'ok'|'bad', t }
    this.solvedSet = new Set();
    this._source   = null;  // node id waiting for a target
    this._hover    = null;
    this._kbIndex  = 0;
    this._time     = 0;
    this._settle   = false;
    this._verdict  = null;  // { kind: 'ok'|'err', text, life }
    this._flowT    = 0;
    this._shakeT   = 0;

    this._rootEl = null; this._stageEl = null; this._statusEl = null;
    this._tabs = new Map(); this._ro = null;

    this._onClick = this._handleClick.bind(this);
    this._onMove  = this._handlePointerMove.bind(this);
    this._onLeave = () => { this._hover = null; this._paintOnce(); };
    this._onKey   = this._handleKey.bind(this);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async setup() {
    this._buildDom();
    await super.setup();
    this._stageEl.appendChild(this._canvas);

    this._canvas.setAttribute('role', 'application');
    this._canvas.setAttribute('aria-label', OrganelleIntegratorScene.ARIA_LABEL);
    this._canvas.tabIndex = 0;
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:10px;outline-offset:3px;';
    this._canvas.addEventListener('click', this._onClick);
    this._canvas.addEventListener('pointermove', this._onMove);
    this._canvas.addEventListener('pointerleave', this._onLeave);
    this._canvas.addEventListener('keydown', this._onKey);

    this._buildBgCache();
    this._setChallenge(0, true);
    this._drawInitialFrame(this._ctx);
  }

  destroy() {
    this._running = false;
    this.pause();
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
      this._canvas.removeEventListener('pointermove', this._onMove);
      this._canvas.removeEventListener('pointerleave', this._onLeave);
      this._canvas.removeEventListener('keydown', this._onKey);
    }
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._rootEl) { this._rootEl.remove(); this._rootEl = null; }
    this._bgCache = null;
    super.destroy();
    this._ctx = null;
  }

  // ── DOM shell ─────────────────────────────────────────────────────────────

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .oin-root{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:9px;
        font-family:Inter,system-ui,sans-serif;line-height:1.3;color:var(--sim-label,#e2e8f0);}
      .oin-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;}
      .oin-tab{flex:1 1 0;min-width:132px;display:flex;align-items:center;justify-content:center;gap:6px;
        padding:8px 10px;border-radius:10px;cursor:pointer;font:600 12px Inter,system-ui,sans-serif;
        color:var(--sim-label,#e2e8f0);background:var(--sim-bg-surface,#111827);
        border:1.5px solid rgba(148,163,184,0.28);transition:transform .12s,border-color .15s,box-shadow .15s;}
      .oin-tab:hover{transform:translateY(-1px);border-color:rgba(148,163,184,0.6);}
      .oin-tab[aria-pressed="true"]{border-color:var(--sim-accent,#818cf8);
        color:var(--sim-label,#e2e8f0);
        box-shadow:0 0 0 1px var(--sim-accent,#818cf8), 0 6px 18px -8px var(--sim-accent,#818cf8);
        background:linear-gradient(180deg,rgba(129,140,248,0.16),rgba(129,140,248,0.04)), var(--sim-bg-surface,#111827);}
      .oin-tab[data-solved="1"]::before{content:'✓';color:var(--sim-success,#34d399);font-weight:800;}

      .oin-acts{display:flex;gap:8px;}
      .oin-btn{padding:8px 16px;border-radius:10px;cursor:pointer;border:1.5px solid transparent;
        font:700 12px Inter,system-ui,sans-serif;transition:transform .12s,filter .15s;}
      .oin-btn:hover{transform:translateY(-1px);filter:brightness(1.12);}
      .oin-btn:focus-visible{outline:2px solid var(--sim-accent,#818cf8);outline-offset:2px;}
      .oin-check{background:linear-gradient(180deg,#34d399,#059669);color:#04241a;}
      .oin-clear{background:var(--sim-bg-surface,#111827);color:var(--sim-label,#cbd5e1);
        border-color:rgba(148,163,184,0.34);}

      .oin-stage{position:relative;width:100%;}
      .oin-root .oin-stage canvas{width:100% !important;height:auto !important;display:block;}

      .oin-status{display:flex;align-items:center;gap:10px;padding:7px 11px;border-radius:9px;min-height:34px;
        box-sizing:border-box;background:var(--sim-bg-surface,#111827);border:1px solid rgba(148,163,184,0.2);}
      .oin-msg{flex:1 1 auto;min-width:0;font:500 11.5px Inter,system-ui,sans-serif;color:var(--sim-label,#cbd5e1);}
      .oin-score{flex:0 0 auto;font:700 11px Inter,system-ui,sans-serif;color:var(--sim-label,#94a3b8);white-space:nowrap;}

      .oin-root.oin-narrow .oin-tab{min-width:104px;font-size:11px;}
      @media (prefers-reduced-motion: reduce){ .oin-tab,.oin-btn{transition:none;} }
    `;

    const root = document.createElement('div');
    root.className = 'oin-root';
    root.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'oin-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Choose a challenge');
    CHALLENGES.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'oin-tab';
      b.dataset.solved = '0';
      b.setAttribute('aria-pressed', 'false');
      b.textContent = `${i + 1}. ${c.title}`;
      b.addEventListener('click', () => this._setChallenge(i));
      bar.appendChild(b);
      this._tabs.set(i, b);
    });

    const acts = document.createElement('div');
    acts.className = 'oin-acts';
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'oin-btn oin-check';
    check.textContent = '✓ Check Pathway';
    check.addEventListener('click', () => this._check());
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'oin-btn oin-clear';
    clear.textContent = '↺ Clear';
    clear.addEventListener('click', () => this._clear());
    acts.appendChild(check);
    acts.appendChild(clear);
    bar.appendChild(acts);

    const stage = document.createElement('div');
    stage.className = 'oin-stage';

    const status = document.createElement('div');
    status.className = 'oin-status';
    status.innerHTML =
      '<div class="oin-msg" role="status" aria-live="polite"></div><div class="oin-score"></div>';

    root.appendChild(bar);
    root.appendChild(stage);
    root.appendChild(status);
    this.container.appendChild(root);

    this._rootEl = root; this._stageEl = stage; this._statusEl = status;

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect?.width || 0;
        root.classList.toggle('oin-narrow', w > 0 && w < 560);
      });
      this._ro.observe(root);
    }
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  _toCanvas(e) {
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width) return null;
    return { x: (e.clientX - rect.left) * (W / rect.width),
             y: (e.clientY - rect.top) * (H / rect.height) };
  }

  _nodeAt(p) {
    for (const id of NODE_ORDER) {
      const n = NODES[id];
      if (Math.abs(p.x - n.x) <= CARD_W / 2 && Math.abs(p.y - n.y) <= CARD_H / 2) return id;
    }
    return null;
  }

  _handlePointerMove(e) {
    const p = this._toCanvas(e);
    if (!p) return;
    const hit = this._nodeAt(p);
    const changed = hit !== this._hover;
    this._hover = hit;
    this._canvas.style.cursor = hit ? 'pointer' : 'default';
    if (changed) this._paintOnce();
  }

  _handleClick(e) {
    const p = this._toCanvas(e);
    if (!p) return;
    const hit = this._nodeAt(p);
    if (!hit) { this._source = null; this._say('Selection cleared.'); return; }
    this._pick(hit);
  }

  _handleKey(e) {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') {
      this._kbIndex = (this._kbIndex + 1) % NODE_ORDER.length;
    } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
      this._kbIndex = (this._kbIndex - 1 + NODE_ORDER.length) % NODE_ORDER.length;
    } else if (k === 'Enter' || k === ' ') {
      this._pick(NODE_ORDER[this._kbIndex]);
    } else if (k === 'Escape') {
      this._source = null;
      this._say('Selection cleared.');
    } else if (k === 'Backspace' || k === 'Delete') {
      const gone = this.links.pop();
      this._say(gone ? `Removed the arrow ${NODES[gone.from].name} → ${NODES[gone.to].name}.` : 'No arrows to remove.');
    } else {
      return;
    }
    e.preventDefault();
    this._hover = NODE_ORDER[this._kbIndex];
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
      this._say(`${NODES[this._hover].name}. Press Enter to ${this._source ? 'draw an arrow here' : 'start an arrow here'}.`);
    }
    this._paintOnce();
  }

  /** First pick sets the source, second pick draws the arrow. */
  _pick(id) {
    if (!this._source) {
      this._source = id;
      this._say(`Started at ${NODES[id].name}. Now choose where its cargo goes next.`);
      this._paintOnce();
      return;
    }
    if (this._source === id) {
      this._source = null;
      this._say('Cancelled.');
      this._paintOnce();
      return;
    }
    const from = this._source, to = id;
    this._source = null;
    if (this.links.some(l => l.from === from && l.to === to)) {
      this._say('That arrow is already drawn.');
      this._paintOnce();
      return;
    }
    this.links.push({ from, to, state: 'draft', t: this._time });
    this._say(`Arrow drawn: ${NODES[from].name} → ${NODES[to].name}. Add more, then press Check Pathway.`);
    this._paintOnce();
  }

  _setChallenge(i, silent = false) {
    this.challenge = i;
    this.links = [];
    this._source = null;
    this._verdict = null;
    this._flowT = 0;
    for (const [k, b] of this._tabs) b.setAttribute('aria-pressed', String(k === i));
    if (!silent) this._say(`Challenge ${i + 1}: ${CHALLENGES[i].title}. ${CHALLENGES[i].brief}`);
    else this._say('Click one organelle, then the next, to draw an arrow between them.');
    this._syncScore();
    this._paintOnce();
  }

  _clear() {
    this.links = [];
    this._source = null;
    this._verdict = null;
    this._flowT = 0;
    this._say('Pathway cleared. Start again.');
    this._paintOnce();
  }

  _check() {
    const req = CHALLENGES[this.challenge].links;
    const key = (a, b) => `${a}->${b}`;
    const need = new Set(req.map(([a, b]) => key(a, b)));

    if (!this.links.length) {
      this._verdict = { kind: 'err', text: 'Draw at least one arrow first — click one organelle, then the next.', life: 5 };
      this._say(this._verdict.text, 'err');
      this._shakeT = 0.5;
      this._paintOnce();
      return;
    }

    let firstWrong = null;
    for (const l of this.links) {
      const k = key(l.from, l.to);
      if (need.has(k)) { l.state = 'ok'; need.delete(k); }
      else { l.state = 'bad'; l.t = this._time; if (!firstWrong) firstWrong = l; }
    }

    if (firstWrong) {
      const k = key(firstWrong.from, firstWrong.to);
      const why = WRONG[k]
        || `${NODES[firstWrong.from].name} does not hand anything to ${NODES[firstWrong.to].name} in this job.`;
      this._verdict = { kind: 'err', text: why, life: 6.5 };
      this._say(`✘ ${why}`, 'err');
      this._shakeT = 0.5;
    } else if (need.size) {
      const missing = need.size;
      this._verdict = { kind: 'err', life: 5,
        text: `Good so far — every arrow is right, but the pathway is not finished. ${missing} more ${missing === 1 ? 'step is' : 'steps are'} needed.` };
      this._say(this._verdict.text, 'err');
    } else {
      this.solvedSet.add(this.challenge);
      this._flowT = 0;
      this._verdict = { kind: 'ok', text: CHALLENGES[this.challenge].solved, life: 12 };
      this._say(`✔ Solved! ${CHALLENGES[this.challenge].solved}`, 'ok');
      const tab = this._tabs.get(this.challenge);
      if (tab) tab.dataset.solved = '1';
    }
    this._syncScore();
    this._paintOnce();
  }

  _say(text, kind = 'info') {
    const msg = this._statusEl?.querySelector('.oin-msg');
    if (msg) {
      msg.textContent = text;
      msg.style.color = kind === 'err' ? COLORS.err : kind === 'ok' ? COLORS.ok : 'var(--sim-label,#cbd5e1)';
    }
    this._syncScore();
  }

  _syncScore() {
    const el = this._statusEl?.querySelector('.oin-score');
    if (el) el.textContent = `${this.solvedSet.size} / ${CHALLENGES.length} solved`;
  }

  _paintOnce() {
    if (!this._ctx || this._rafId) return;
    this._settle = true;
    this._tick(this._ctx, 0);
    this._settle = false;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  _update(dt) {
    this._time += dt;
    this._flowT += dt;
    if (this._shakeT > 0) this._shakeT = Math.max(0, this._shakeT - dt);
    if (this._verdict) {
      this._verdict.life -= dt;
      if (this._verdict.life <= 0) this._verdict = null;
    }
    // wrong arrows flash red, then rub themselves out
    const before = this.links.length;
    this.links = this.links.filter(l => !(l.state === 'bad' && this._time - l.t > 1.6));
    if (this.links.length !== before) this._source = null;
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._update(dt);
    ctx.clearRect(0, 0, W, H);
    this._drawBackground(ctx);
    this._drawTaskCard(ctx);
    this._drawLinks(ctx);
    this._drawPending(ctx);
    for (const id of NODE_ORDER) this._drawNode(ctx, id);
    this._drawFooter(ctx);
  }

  _drawInitialFrame(ctx) { this._tick(ctx, 0); }

  _buildBgCache() {
    const oc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ctx = oc.getContext('2d');
    const g = ctx.createRadialGradient(312, 265, 40, 312, 265, 420);
    g.addColorStop(0, '#122246');
    g.addColorStop(0.6, '#0a1224');
    g.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // the cell the organelles all live in
    ctx.beginPath();
    ctx.ellipse(312, 285, 320, 178, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.cell;
    ctx.fill();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = 'rgba(79,156,247,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, W, H); }
  }

  // ── Task card ─────────────────────────────────────────────────────────────

  _drawTaskCard(ctx) {
    const c = CHALLENGES[this.challenge];
    const solved = this.solvedSet.has(this.challenge);
    const shake = this._shakeT > 0 ? Math.sin(this._shakeT * 60) * this._shakeT * 10 : 0;

    ctx.save();
    ctx.translate(shake, 0);
    ctx.font = '800 16px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = this._wrap(ctx, c.brief, 500, '600 11.5px Inter, system-ui');
    const bw = 528, bh = 34 + lines.length * 15 + 12;
    const bx = (W - bw) / 2, by = 12;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 12);
    ctx.fillStyle = solved ? 'rgba(6,60,46,0.92)' : 'rgba(13,25,48,0.92)';
    ctx.fill();
    ctx.strokeStyle = solved ? 'rgba(52,211,153,0.7)' : 'rgba(129,140,248,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.font = '700 10px Inter, system-ui';
    ctx.fillStyle = solved ? '#6ee7b7' : COLORS.accent;
    ctx.fillText(`CHALLENGE ${this.challenge + 1} OF ${CHALLENGES.length}${solved ? '  ·  SOLVED' : ''}`, bx + 16, by + 10);
    ctx.font = '800 15px Inter, system-ui';
    ctx.fillStyle = COLORS.textMain;
    ctx.fillText(c.title, bx + 16, by + 24);
    ctx.font = '600 11.5px Inter, system-ui';
    ctx.fillStyle = solved ? '#a7f3d0' : COLORS.textMuted;
    lines.forEach((l, i) => ctx.fillText(l, bx + 16, by + 44 + i * 15));
    ctx.restore();
  }

  // ── Connections ───────────────────────────────────────────────────────────

  _drawLinks(ctx) {
    for (const l of this.links) {
      const a = edgePoint(NODES[l.from], NODES[l.to]);
      const b = edgePoint(NODES[l.to], NODES[l.from]);
      const c = ctrlPoint(a, b);

      let color = COLORS.draft, width = 3, alpha = 1;
      if (l.state === 'ok')  { color = COLORS.ok;  width = 3.6; }
      if (l.state === 'bad') {
        color = COLORS.err;
        const age = this._time - l.t;
        alpha = 0.35 + 0.65 * Math.abs(Math.sin(age * 9));
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';

      // soft halo so arrows stay readable over the cell fill
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.22;
      ctx.lineWidth = width + 8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();

      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();

      // arrowhead, aimed along the curve's final tangent
      const near = quadAt(a, c, b, 0.94);
      const ang = Math.atan2(b.y - near.y, b.x - near.x);
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-11, -6);
      ctx.lineTo(-11, 6);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // cargo flowing along a verified link
      if (l.state === 'ok') {
        const cargo = CHALLENGES[this.challenge].cargo;
        for (let i = 0; i < 2; i++) {
          const t = ((this._flowT * 0.42 + i * 0.5) % 1);
          const p = quadAt(a, c, b, t);
          const fade = Math.sin(t * Math.PI) * 0.95 + 0.05;
          ctx.save();
          ctx.globalAlpha = fade * 0.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
          ctx.fillStyle = cargo;
          ctx.fill();
          ctx.globalAlpha = fade;
          const cg = ctx.createRadialGradient(p.x - 1.6, p.y - 1.6, 0.5, p.x, p.y, 5.5);
          cg.addColorStop(0, '#ffffff');
          cg.addColorStop(1, cargo);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = cg;
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  /** Rubber-band from the chosen source to the pointer / focused node. */
  _drawPending(ctx) {
    if (!this._source) return;
    const from = NODES[this._source];
    const target = this._hover && this._hover !== this._source ? NODES[this._hover] : null;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -this._time * 20;
    ctx.strokeStyle = COLORS.draft;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    if (target) {
      const a = edgePoint(from, target), b = edgePoint(target, from), c = ctrlPoint(a, b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(from.x, from.y, CARD_W / 2 + 10 + Math.sin(this._time * 5) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  _drawNode(ctx, id) {
    const n = NODES[id];
    const isSource = this._source === id;
    const isHover  = this._hover === id;
    const inSolved = this.solvedSet.has(this.challenge)
      && CHALLENGES[this.challenge].links.some(([a, b]) => a === id || b === id);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.roundRect(n.x - CARD_W / 2, n.y - CARD_H / 2, CARD_W, CARD_H, 10);
    const g = ctx.createLinearGradient(0, n.y - CARD_H / 2, 0, n.y + CARD_H / 2);
    g.addColorStop(0, '#1c2c4d');
    g.addColorStop(1, COLORS.card);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(n.x - CARD_W / 2, n.y - CARD_H / 2, CARD_W, CARD_H, 10);
    ctx.strokeStyle = isSource ? COLORS.draft : inSolved ? COLORS.ok : isHover ? n.color : COLORS.cardEdge;
    ctx.lineWidth = isSource || isHover || inSolved ? 2.2 : 1.2;
    ctx.stroke();

    // colour tag down the left edge, so each organelle is identifiable by more than its icon
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(n.x - CARD_W / 2, n.y - CARD_H / 2, CARD_W, CARD_H, 10);
    ctx.clip();
    ctx.fillStyle = n.color;
    ctx.fillRect(n.x - CARD_W / 2, n.y - CARD_H / 2, 4, CARD_H);
    ctx.restore();

    ctx.save();
    ctx.translate(n.x, n.y - 7);
    this._icon(ctx, id);
    ctx.restore();

    ctx.font = '700 9.5px Inter, system-ui';
    ctx.fillStyle = COLORS.textMain;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.name, n.x + 2, n.y + 13);
  }

  /** Compact organelle glyphs, ~20px wide, drawn at the origin. */
  _icon(ctx, id) {
    const c = NODES[id].color;
    ctx.lineCap = 'round';
    switch (id) {
      case 'nucleus': {
        const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 10);
        g.addColorStop(0, '#a5b4fc'); g.addColorStop(1, c);
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(2.5, -1.5, 3.4, 0, Math.PI * 2); ctx.fillStyle = '#312e81'; ctx.fill();
        break;
      }
      case 'ribosome':
        ctx.beginPath(); ctx.ellipse(0, -2.4, 7, 4.6, 0, 0, Math.PI * 2); ctx.fillStyle = '#e2e8f0'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 3, 5.4, 3.2, 0, 0, Math.PI * 2); ctx.fillStyle = '#94a3b8'; ctx.fill();
        break;
      case 'rer':
      case 'ser': {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.4;
        for (let r = -1; r <= 1; r++) {
          ctx.beginPath();
          for (let x = -11; x <= 11; x += 2) ctx[x === -11 ? 'moveTo' : 'lineTo'](x, r * 5.5 + Math.sin(x * 0.5) * 1.5);
          ctx.stroke();
        }
        if (id === 'rer') {
          ctx.fillStyle = '#e2e8f0';
          for (let r = -1; r <= 1; r++) for (let x = -8; x <= 8; x += 5.5) {
            ctx.beginPath(); ctx.arc(x, r * 5.5 - 2.6 + Math.sin(x * 0.5) * 1.5, 1.3, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      }
      case 'golgi':
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.6;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(-10 + Math.abs(i) * 2, i * 5 - 2.4);
          ctx.quadraticCurveTo(0, i * 5 + 3.4, 10 - Math.abs(i) * 2, i * 5 - 2.4);
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(11, 7, 2.4, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
        break;
      case 'lysosome': {
        const g = ctx.createRadialGradient(-2.5, -3, 1, 0, 0, 9);
        g.addColorStop(0, '#fca5a5'); g.addColorStop(1, c);
        ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = '#fee2e2';
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3;
          ctx.beginPath(); ctx.arc(Math.cos(a) * 4, Math.sin(a * 1.4) * 4, 1.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'mitochondria': {
        const g = ctx.createLinearGradient(0, -6, 0, 6);
        g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#b45309');
        ctx.beginPath(); ctx.roundRect(-12, -6, 24, 12, 6); ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.6;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 4.2, i % 2 ? -5 : 5);
          ctx.quadraticCurveTo(i * 4.2 + 3, 0, i * 4.2, i % 2 ? 4 : -4);
          ctx.stroke();
        }
        break;
      }
      case 'membrane':
        ctx.strokeStyle = 'rgba(79,156,247,0.5)';
        ctx.lineWidth = 1.6;
        for (let x = -11; x <= 11; x += 4) { ctx.beginPath(); ctx.moveTo(x, -3.5); ctx.lineTo(x, 3.5); ctx.stroke(); }
        ctx.fillStyle = '#7dd3fc';
        for (let x = -11; x <= 11; x += 4) {
          ctx.beginPath(); ctx.arc(x, -4.5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x, 4.5, 2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'cytoplasm':
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 7.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56,189,248,0.28)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125,211,252,0.7)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = '#bae6fd';
        for (let i = 0; i < 5; i++) {
          const a = i * 1.25 + this._time * 0.5;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 6, Math.sin(a * 1.7) * 3.5, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      default: break;
    }
  }

  // ── Footer: verdict / how-to ──────────────────────────────────────────────

  _drawFooter(ctx) {
    const y = H - 34;
    if (this._verdict) {
      const ok = this._verdict.kind === 'ok';
      const lines = this._wrap(ctx, this._verdict.text, 552, '600 11.5px Inter, system-ui');
      const bh = lines.length * 15 + 18;
      const bw = 580, bx = (W - bw) / 2, by = H - bh - 8;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 10);
      ctx.fillStyle = ok ? 'rgba(6,78,59,0.95)' : 'rgba(76,14,20,0.95)';
      ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = '600 11.5px Inter, system-ui';
      ctx.fillStyle = ok ? '#d1fae5' : '#fecaca';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(ok ? '✔' : '✘', bx + 12, by + 9);
      lines.forEach((l, i) => ctx.fillText(l, bx + 30, by + 9 + i * 15));
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.font = '600 11px Inter, system-ui';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._source
      ? `From ${NODES[this._source].name} → now click the organelle that receives it (Esc to cancel)`
      : 'Click an organelle, then click the next one, to draw an arrow between them',
      W / 2, y + 12);
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
}
