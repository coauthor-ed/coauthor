import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { characterSvg, CHARACTER_CSS } from './KeyCharacters.js';
import { KEY_CSS, fitFrame } from './KeyBuilderScene.js';

// "Read the name" - two small practice loops for hard scientific names, both fed
// by the course glossary (glossary.json), never by data typed into a scene:
//
//   mode 'decode'  BEFORE a name is taught. The learner sees only the word
//                  pieces and what they mean ("platy = flat", "helminth = worm"),
//                  picks the body they would expect, and the name assembles from
//                  the pieces. Needs `roots` on every term.
//   mode 'recall'  AFTER names were taught, later in the course. Alternates
//                  "which name goes with this face" and "which face is this
//                  name", with the roots one tap away as a cue. A miss is asked
//                  once more at the end and named in a short review.
//
// Nothing is timed or penalised. A concrete scene is a thin subclass that only
// sets `static CONFIG` (see courses/*/simulations/*/*NameScene.js).
//
// CONFIG: { ariaLabel, mode: 'decode' | 'recall',
//           terms: [glossary ids, in the order they are met],
//           pool?: [ids] extra faces/names to draw wrong options from,
//           noun?: 'animal' (default) | 'plant' | 'group' ... used in the prompts,
//           plainCue?: false hides the everyday name under a face until hinted (recall),
//           title?, intro?, done? }
// The host supplies `config.glossaryTerm(id)`; without it the scene says so.
const TONES = 8;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const NAME_CSS = `
.nd-board { min-height:100%; display:flex; flex-direction:column; gap:var(--sim-space-3); }
.nd-prompt { margin:0; font-size:var(--sim-text-lg); font-weight:800; line-height:1.25; }
.nd-sub { margin:0; color:var(--sim-label-muted); font-size:var(--sim-text-sm); font-weight:700; }
.nd-stage { flex:1 1 auto; display:flex; flex-direction:column; gap:var(--sim-space-3); }
.nd-pieces { display:flex; flex-wrap:wrap; align-items:center; gap:var(--sim-space-2); }
.nd-piece { display:inline-flex; flex-direction:column; align-items:center; gap:2px; min-width:96px; padding:var(--sim-space-2) var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--c); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--c); }
.nd-piece b { font-size:var(--sim-text-xl); line-height:1.1; color:var(--c); }
.nd-piece span { font-size:var(--sim-text-md); font-weight:800; }
.nd-plus { font-size:var(--sim-text-xl); font-weight:800; color:var(--sim-label-muted); }
.nd-opts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--sim-space-2); }
.nd-opt { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--sim-space-1); min-height:96px; padding:var(--sim-space-2); text-align:center; line-height:1.2; }
.nd-opt .ek-av { width:52px; height:52px; }
.nd-opt.nd-text { min-height:64px; font-size:var(--sim-text-lg); overflow-wrap:anywhere; }
.nd-opt.nd-no { border-color:var(--sim-warning); animation:ek-shake .35s; }
.nd-opt.nd-yes { border-color:var(--sim-success); background:var(--sim-success); color:var(--sim-bg-deep); }
.nd-opt:disabled { cursor:default; }
.nd-msg { margin:0; padding:var(--sim-space-2) var(--sim-space-3); border-left:4px solid var(--sim-warning); border-radius:var(--sim-radius-sm); background:var(--sim-bg-surface); font-size:var(--sim-text-md); font-weight:700; }
.nd-msg.nd-good { border-left-color:var(--sim-success); }
.nd-name { display:flex; align-items:center; gap:var(--sim-space-3); padding:var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--c); border-radius:var(--sim-radius-lg); background:var(--sim-bg-surface); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--c); animation:nd-pop .35s ease-out; }
.nd-name .ek-av { width:64px; height:64px; }
.nd-word { font-size:var(--sim-text-xl); font-weight:800; line-height:1.15; overflow-wrap:anywhere; }
.nd-word i { font-style:normal; color:var(--c); }
.nd-plain { color:var(--sim-label-muted); font-size:var(--sim-text-md); font-weight:700; }
.nd-means { margin:0; font-size:var(--sim-text-md); line-height:1.35; }
.nd-hintbtn { align-self:flex-start; }
.nd-hint { display:flex; flex-wrap:wrap; gap:var(--sim-space-1); }
.nd-hint span { padding:2px var(--sim-space-2); border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); font-size:var(--sim-text-sm); font-weight:800; }
.nd-foot { display:flex; align-items:center; justify-content:flex-end; gap:var(--sim-space-2); min-height:40px; }
.nd-wrap { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--sim-space-2); }
.nd-row { display:flex; align-items:center; gap:var(--sim-space-2); padding:var(--sim-space-1) var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--c); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); }
.nd-row .ek-av { width:36px; height:36px; }
.nd-row b { display:block; font-size:var(--sim-text-md); line-height:1.15; overflow-wrap:anywhere; }
.nd-row span { font-size:var(--sim-text-sm); color:var(--sim-label-muted); font-weight:700; }
.nd-row.nd-miss { border-style:dashed; }
@keyframes nd-pop { from { transform:scale(.94); opacity:0; } to { transform:none; opacity:1; } }
@media (prefers-reduced-motion: reduce) { .nd-name, .nd-opt.nd-no { animation:none; } }
.sim-dom-root--portrait .nd-opts { grid-template-columns:repeat(2,minmax(0,1fr)); }
.sim-dom-root--portrait .nd-wrap { grid-template-columns:minmax(0,1fr); }
`;

export class NameDecoderScene extends DomSimulation {
  static WIDTH = 560;
  static HEIGHT = 470;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 760;
  static CONTROLS = [];
  static MIN_SCALE = 1.05;
  static CONFIG = null;

  constructor(container, config) {
    super(container, config);
    this.cfg = this.constructor.CONFIG;
    this.mode = this.cfg.mode === 'recall' ? 'recall' : 'decode';
    this.queue = [];
    this.pos = 0;
    this.solved = false;
    this.wrong = new Set();
    this.hint = false;
    this.missed = [];
    this.firstTry = 0;
    this.total = 0;
    this.requeued = new Set();
  }

  async setup() {
    await super.setup();
    this.root.classList.add('ek-root');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', this.cfg.ariaLabel);
    this.injectStyle(CHARACTER_CSS + KEY_CSS + NAME_CSS);
    this.board = document.createElement('div');
    this.board.className = 'ek-board nd-board';
    this.root.appendChild(this.board);
    this.board.addEventListener('click', (e) => this._click(e));
    this._start();
  }

  // ---- model ---------------------------------------------------------------
  _term(id) { return this.config?.glossaryTerm?.(id) || null; }

  _start() {
    const get = (id) => this._term(id);
    this.items = this.cfg.terms.map(get).filter((t) => t && (this.mode === 'recall' || t.roots.length));
    this.pool = [...new Set([...this.cfg.terms, ...(this.cfg.pool || [])])].map(get).filter((t) => t && t.face);
    this.queue = this.items.map((t, i) => ({ term: t, kind: this.mode === 'recall' ? (i % 2 ? 'face' : 'name') : 'face' }));
    this.total = this.queue.length;
    this.pos = 0;
    this.missed = [];
    this.firstTry = 0;
    this.requeued = new Set();
    this._reset();
    this._render();
  }

  _reset() { this.solved = false; this.wrong = new Set(); this.hint = false; }

  /** The right option plus two wrong ones, rotated so the right one moves about. */
  _options(term) {
    const others = this.pool.filter((t) => t.id !== term.id);
    const at = this.pos + this.items.findIndex((t) => t.id === term.id);
    const wrongs = [others[at % others.length], others[(at + 1) % others.length]].filter((t, i, a) => t && a.indexOf(t) === i);
    const opts = [term, ...wrongs];
    const shift = (at + 1) % opts.length; // the right answer is not always first
    return opts.map((_, i) => opts[(i + shift) % opts.length]);
  }

  _pick(id) {
    const cur = this.queue[this.pos];
    if (!cur || this.solved || this.wrong.has(id)) return;
    if (id === cur.term.id) {
      this.solved = true;
      if (!this.wrong.size && !this.requeued.has(cur.term.id)) this.firstTry++;
    } else {
      this.wrong.add(id);
      this.hint = true;
      if (this.mode === 'recall' && !this.requeued.has(cur.term.id)) {
        this.requeued.add(cur.term.id);
        this.queue.push({ term: cur.term, kind: cur.kind === 'face' ? 'name' : 'face' });
        if (!this.missed.includes(cur.term)) this.missed.push(cur.term);
      }
    }
    this._render();
  }

  _next() {
    this.pos++;
    this._reset();
    this._render();
  }

  _click(e) {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'pick') this._pick(b.dataset.id);
    else if (act === 'next') this._next();
    else if (act === 'hint') { this.hint = true; this._render(); }
    else if (act === 'again') this._start();
  }

  // ---- rendering -----------------------------------------------------------
  _tone(t) { return ((t.face?.tone ?? 1) - 1) % TONES + 1; }
  _color(n) { return `var(--sim-series-${((n - 1) % TONES) + 1})`; }
  _av(t, size) { return t.face ? characterSvg(t.face.art, t.face.tone, size) : ''; }

  /** The term cut at its root pieces: [{ text, root: index|null }]. */
  _segments(t) {
    const low = t.term.toLowerCase();
    const segs = [];
    let cur = 0;
    t.roots.forEach((r, i) => {
      const at = low.indexOf(r.part.toLowerCase(), cur);
      if (at < 0) return;
      if (at > cur) segs.push({ text: t.term.slice(cur, at), root: null });
      segs.push({ text: t.term.slice(at, at + r.part.length), root: i });
      cur = at + r.part.length;
    });
    if (cur < t.term.length) segs.push({ text: t.term.slice(cur), root: null });
    return segs.length ? segs : [{ text: t.term, root: null }];
  }

  _pieces(t) {
    return t.roots.map((r, i) => `<span class="nd-piece" style="--c:${this._color(this._tone(t) + i)}"><b>${esc(r.part)}</b><span>${esc(r.means)}</span></span>`).join('<span class="nd-plus" aria-hidden="true">+</span>');
  }

  _hintChips(t) {
    return `<div class="nd-hint">${t.roots.map((r) => `<span>${esc(r.part)} = ${esc(r.means)}</span>`).join('')}</div>`;
  }

  _render() {
    if (!this.board) return;
    let body;
    if (!this.items?.length) {
      body = `<p class="nd-msg">This practice needs the course glossary.</p>`;
    } else if (this.pos >= this.queue.length) {
      body = this._end();
    } else {
      body = this.mode === 'decode' ? this._decode() : this._recall();
    }
    this.board.innerHTML = this._head() + `<div class="nd-stage">${body.stage ?? body}</div>` + (body.foot ? `<div class="nd-foot">${body.foot}</div>` : '');
    this._fit();
    this.board.querySelector('[data-focus]')?.focus({ preventScroll: true });
    this.requestUiUpdate?.();
  }

  _head() {
    const done = this.pos >= this.queue.length;
    const title = this.cfg.title || (this.mode === 'decode' ? 'Read the name' : 'Name check');
    const n = Math.min(this.pos + (this.solved ? 1 : 0), this.total);
    const dots = Array.from({ length: this.total }, (_, i) => `<span class="ek-pip${i < n ? ' ek-on' : ''}" style="--t:var(--sim-accent)"></span>`).join('');
    return `<div class="ek-head"><div class="ek-title">${esc(title)}</div><div class="ek-pips" aria-label="${done ? this.total : Math.min(this.pos + 1, this.total)} of ${this.total}">${dots}</div></div>`;
  }

  _optButtons(term, kind) {
    const opts = this._options(term);
    return `<div class="nd-opts">${opts.map((o) => {
      const state = this.wrong.has(o.id) ? ' nd-no' : (this.solved && o.id === term.id ? ' nd-yes' : '');
      const dis = this.solved || this.wrong.has(o.id) ? ' disabled' : '';
      const first = !this.solved && !this.wrong.size && o === opts[0] ? ' data-focus="1"' : '';
      if (kind === 'name') return `<button type="button" class="ek-chipbtn nd-opt nd-text${state}" data-act="pick" data-id="${esc(o.id)}"${dis}${first}>${esc(o.term)}</button>`;
      return `<button type="button" class="ek-chipbtn nd-opt${state}" data-act="pick" data-id="${esc(o.id)}" aria-label="${esc(o.plain || o.term)}"${dis}${first}>${this._av(o)}${this.mode === 'decode' || this.solved ? `<span>${esc(o.plain || o.term)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }

  _revealCard(t) {
    const segs = this._segments(t).map((s) => (s.root === null ? esc(s.text) : `<i style="--c:${this._color(this._tone(t) + s.root)}">${esc(s.text)}</i>`)).join('');
    return `<div class="nd-name" style="--c:${this._color(this._tone(t))}">${this._av(t)}<div><div class="nd-word">${segs}</div>${t.plain ? `<div class="nd-plain">${esc(t.plain)}</div>` : ''}</div></div>${t.means ? `<p class="nd-means">${esc(t.means)}</p>` : ''}`;
  }

  _nextBtn() {
    const last = this.pos + 1 >= this.queue.length;
    return `<button type="button" class="ek-btn ek-run" data-act="next" data-focus="1">${last ? 'Finish' : 'Next name'} ▶</button>`;
  }

  _decode() {
    const { term } = this.queue[this.pos];
    const noun = this.cfg.noun || 'animal';
    const first = term.roots[0];
    let msg = '';
    if (this.wrong.size && !this.solved) msg = `<p class="nd-msg">Not quite. Look at the pieces again: <b>${esc(first.part)}</b> means ${esc(first.means)}. Which one fits?</p>`;
    const pieces = this.solved ? '' : `<div class="nd-pieces">${this._pieces(term)}</div>`;
    const prompt = this.solved ? `<p class="nd-prompt">The pieces join up:</p>` : `<p class="nd-prompt">Read the pieces. What kind of ${esc(noun)} do you expect?</p>`;
    const opts = this._optButtons(term, 'face');
    return { stage: this.solved ? `${prompt}${this._revealCard(term)}${msg}` : `${prompt}${pieces}${opts}${msg}`, foot: this.solved ? this._nextBtn() : '' };
  }

  _recall() {
    const { term, kind } = this.queue[this.pos];
    const noun = this.cfg.noun || 'animal';
    // The everyday name under a face is a strong cue. Late in the course a scene
    // sets `plainCue: false` so it only appears once the pieces are asked for.
    const showPlain = this.cfg.plainCue !== false || this.hint || this.solved;
    const prompt = kind === 'name'
      ? `<p class="nd-prompt">Which name goes with this ${esc(noun)}?</p><div class="nd-name" style="--c:${this._color(this._tone(term))}">${this._av(term)}${showPlain ? `<div class="nd-plain">${esc(term.plain || '')}</div>` : ''}</div>`
      : `<p class="nd-prompt">Which one is <b>${esc(term.term)}</b>?</p>`;
    const cue = term.roots.length && !this.solved
      ? (this.hint ? this._hintChips(term) : `<button type="button" class="ek-btn nd-hintbtn" data-act="hint">Show the pieces</button>`)
      : '';
    const miss = this.wrong.size && !this.solved ? `<p class="nd-msg">Not quite - try another.</p>` : '';
    const opts = this._optButtons(term, kind === 'name' ? 'name' : 'face');
    const win = this.solved ? `<p class="nd-msg nd-good"><b>${esc(term.term)}</b>${term.plain ? ` - ${esc(term.plain)}` : ''}. ${esc(term.means || '')}</p>` : '';
    return { stage: `${prompt}${opts}${cue}${miss}${win}`, foot: this.solved ? this._nextBtn() : '' };
  }

  _end() {
    const rows = this.items.map((t) => `<div class="nd-row${this.missed.includes(t) ? ' nd-miss' : ''}" style="--c:${this._color(this._tone(t))}">${this._av(t)}<div><b>${esc(t.term)}</b><span>${esc(t.plain || '')}</span></div></div>`).join('');
    let line;
    if (this.mode === 'decode') line = this.cfg.done || 'You worked these names out from their pieces. Tap any dotted word in the lessons to see its card again.';
    else if (this.missed.length) line = `Worth another look: ${this.missed.map((t) => esc(t.term)).join(', ')}. Dashed cards are the ones to revisit.`;
    else line = 'All of them, first go. The pieces are doing the remembering for you.';
    return { stage: `<p class="nd-prompt">${this.mode === 'decode' ? `${this.total} names decoded` : `${this.firstTry} of ${this.total} first time`}</p><p class="nd-sub">${line}</p><div class="nd-wrap">${rows}</div>`, foot: `<button type="button" class="ek-btn" data-act="again">Go again</button>` };
  }

  _fit() { fitFrame(this); }

  _reconcileOrientation(hostWidth) {
    super._reconcileOrientation(hostWidth);
    this._fit();
  }

  destroy() {
    this.board = null;
    super.destroy();
  }
}
