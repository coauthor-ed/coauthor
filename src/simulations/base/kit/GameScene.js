import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { characterSvg, CHARACTER_CSS } from './KeyCharacters.js';
import { KEY_CSS, fitFrame } from './KeyBuilderScene.js';

// Shared base of the kit's mini-games (MonsterScene lives here). A game is a
// thin subclass:
//
//   static CONFIG = { ... }            game content
//   init()                             once setup() has decided the game can run
//   view()  -> html string             the whole board for the current state
//   act(name, dataset, el)             a click on any [data-act] element
//
// paint() re-renders the board from view(), keeps the scroll place and focus.
// A game never fetches or stores anything itself; rewards go through
// `config.collection` (see Collection.js) via `award()`/`pack()` below.
//
// A course can hand a scene `config.fieldGuide()` (any per-course data file,
// commonly organisms/traits/groups - see a course's own field-guide.json) and
// this base will index it by `id` generically, so `this.fg?.org(id)` works for
// a simple optional lookup (MonsterScene's `who` face). A richer, classify-by-
// evidence model (groups, decisive traits, tabs...) is a bigger, single-purpose
// concept that belongs with the course that uses it, not in this shared kit -
// see a course's own simulations/kit/FieldGuideScene.js, which overrides
// `_loadFieldGuide()` to hand its game family that instead.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const GAME_CSS = `
.gm-board { min-height:100%; }
.gm-row { display:flex; align-items:center; gap:var(--sim-space-2); min-width:0; }
.gm-grow { flex:1 1 0; min-width:0; }
.ek-foot.gm-row { flex-direction:row; align-items:center; }
.gm-col { display:flex; flex-direction:column; gap:var(--sim-space-2); min-width:0; }
.gm-hearts { display:inline-flex; gap:3px; font-size:var(--sim-text-lg); line-height:1; color:var(--sim-error); }
.gm-hearts i { font-style:normal; transition:transform .2s, opacity .2s; }
.gm-hearts i.gm-off { opacity:.22; transform:scale(.8); }
.gm-bar { height:14px; border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); overflow:hidden; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); }
.gm-bar > i { display:block; height:100%; background:var(--c, var(--sim-accent)); transition:width .45s ease; }
.gm-msg { margin:0; padding:var(--sim-space-2) var(--sim-space-3); border-left:4px solid var(--sim-stroke); border-radius:var(--sim-radius-sm); background:var(--sim-bg-surface); font-size:var(--sim-text-md); font-weight:700; line-height:1.3; }
.gm-msg.gm-good { border-left-color:var(--sim-success); }
.gm-msg.gm-bad { border-left-color:var(--sim-warning); }
.gm-msg b { color:var(--sim-accent); }
.gm-bubble { position:relative; padding:var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:var(--sim-radius-lg); background:var(--sim-bg-surface); font-size:var(--sim-text-lg); font-weight:800; line-height:1.25; }
.gm-tile { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:0; padding:var(--sim-space-1); border: calc(2px * var(--look-rim)) solid var(--t, var(--sim-stroke)); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--t, var(--sim-stroke)); font-weight:800; font-size:var(--sim-text-sm); line-height:1.15; text-align:center; overflow-wrap:anywhere; transition:opacity .25s, transform .25s, filter .25s; }
.gm-tile .ek-av { width:40px; height:40px; }
.gm-tile.gm-out { opacity:.18; filter:grayscale(1); transform:scale(.92); }
.gm-tile.gm-fits { outline:2px dashed var(--sim-warning); outline-offset:1px; }
.gm-tile.gm-mine { outline:3px solid var(--sim-accent); outline-offset:1px; }
.gm-tile.gm-lock .ek-av { filter:brightness(0); opacity:.35; }
.gm-tile.gm-lock { border-style:dashed; box-shadow:none; color:var(--sim-label-muted); }
.gm-tile.gm-medal-bronze { border-color:var(--sim-series-8); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-series-8); }
.gm-tile.gm-medal-silver { border-color:var(--sim-label-muted); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-label-muted); }
.gm-tile.gm-medal-gold { border-color:var(--sim-series-2); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-series-2); }
button.gm-tile { cursor:pointer; color:inherit; font:inherit; font-weight:800; font-size:var(--sim-text-sm); }
button.gm-tile:hover:not(:disabled) { border-color:var(--sim-accent); }
button.gm-tile:disabled { cursor:default; }
.gm-grid { display:grid; grid-template-columns:repeat(var(--cols,4),minmax(0,1fr)); gap:var(--sim-space-2); }
.gm-tag { display:inline-flex; align-items:center; padding:1px var(--sim-space-2); border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); font-size:var(--sim-text-sm); font-weight:800; }
.gm-tag.gm-yes { border: calc(2px * var(--look-rim)) solid var(--sim-success); }
.gm-tag.gm-no { border: calc(2px * var(--look-rim)) dashed var(--sim-stroke); color:var(--sim-label-muted); }
.gm-h2 { margin:0; font-size:var(--sim-text-md); font-weight:800; color:var(--sim-label-muted); }
.gm-big { font-size:var(--sim-text-xl); font-weight:800; line-height:1.15; }
.gm-pop { animation:gm-pop .4s ease-out; }
.gm-shake { animation:ek-shake .35s; }
.gm-hit { animation:gm-hit .5s ease-out; }
@keyframes gm-pop { from { transform:scale(.85); opacity:0; } to { transform:none; opacity:1; } }
@keyframes gm-hit { 0% { transform:translateX(0) rotate(0); } 20% { transform:translateX(-8px) rotate(-4deg); } 40% { transform:translateX(8px) rotate(4deg); } 60% { transform:translateX(-5px); } 100% { transform:none; } }
@keyframes gm-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { .gm-pop, .gm-shake, .gm-hit { animation:none; } .gm-tile, .gm-bar > i { transition:none; } }
.sim-dom-root--portrait .gm-grid { --cols:3 !important; }
`;

export class GameScene extends DomSimulation {
  static WIDTH = 620;
  static HEIGHT = 520;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 900;
  static CONTROLS = [];
  static MIN_SCALE = 1.05;
  static FILL_HEIGHT = true;
  static CONFIG = null;
  /** Extra CSS a subclass wants beside GAME_CSS. */
  static CSS = '';
  /** A game whose own content doesn't touch `this.fg` at all (e.g. a pure
   * claim/counter misconception game) leaves this false (the default) and
   * runs standalone, with no course data file required. A game built on one
   * sets this true, so it waits for `_loadFieldGuide()` to return something
   * before `init()` runs, instead of racing an empty board. */
  static NEEDS_FIELD_GUIDE = false;

  constructor(container, config) {
    super(container, config);
    this.cfg = this.constructor.CONFIG || {};
    this.fg = null;
    this.coll = config?.collection || null;
  }

  async setup() {
    await super.setup();
    this.root.classList.add('ek-root', 'gm-root');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', this.cfg.ariaLabel || this.constructor.ARIA_LABEL || 'Game');
    this.injectStyle(CHARACTER_CSS + KEY_CSS + GAME_CSS + (this.constructor.CSS || ''));
    this.board = document.createElement('div');
    this.board.className = 'ek-board gm-board';
    this.root.appendChild(this.board);
    this.board.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled && this.board.contains(b)) this.act(b.dataset.act, b.dataset, b);
    });
    this.fg = this._loadFieldGuide(this.config?.fieldGuide?.());
    if (this.fg || !this.constructor.NEEDS_FIELD_GUIDE) this.init();
    this.paint();
  }

  // ---- for subclasses --------------------------------------------------------
  init() {}
  view() { return ''; }
  act() {}
  /** A minimal, generic index of an optional data file's `organisms`-shaped
   * list, by id - enough for `this.fg?.org(id)` (MonsterScene's `who` face).
   * A richer model overrides this; see the file header. */
  _loadFieldGuide(raw) {
    if (!raw || !Array.isArray(raw.organisms) || !raw.organisms.length) return null;
    const byId = new Map(raw.organisms.map((o) => [o.id, o]));
    return { org: (id) => byId.get(id) || null };
  }

  paint() {
    if (!this.board) return;
    const scroller = this.board.querySelector('.ek-scroll');
    const kept = scroller?.scrollTop ?? 0;
    this.board.innerHTML = (this.fg || !this.constructor.NEEDS_FIELD_GUIDE) ? this.view() : '<p class="gm-msg gm-bad">This game needs the course field guide.</p>';
    fitFrame(this);
    const s2 = this.board.querySelector('.ek-scroll');
    if (s2) s2.scrollTop = kept;
    this.board.querySelector('[data-focus]')?.focus({ preventScroll: true });
    this.requestUiUpdate?.();
  }

  // ---- view helpers ----------------------------------------------------------
  head(title, right = '') {
    return `<div class="ek-head"><div class="ek-title">${esc(title)}</div><div class="ek-headr">${right}</div></div>`;
  }
  av(o, size) { return o ? characterSvg(o.art, o.tone, size) : ''; }
  btn(label, act, data = {}, cls = 'ek-btn', extra = '') {
    const d = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    return `<button type="button" class="${cls}" data-act="${esc(act)}"${d}${extra}>${label}</button>`;
  }
  hearts(n, max) {
    return `<span class="gm-hearts" aria-label="${n} of ${max} hearts">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? '' : 'gm-off'}">♥</i>`).join('')}</span>`;
  }
  bar(v, max, tone) {
    const pct = max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
    return `<div class="gm-bar" role="progressbar" aria-valuenow="${v}" aria-valuemax="${max}"${tone ? ` style="--c:var(--sim-series-${tone})"` : ''}><i style="width:${pct}%"></i></div>`;
  }
  /** A yes/no trait as a small chip. */
  tag(text, yes) { return `<span class="gm-tag ${yes ? 'gm-yes' : 'gm-no'}">${yes ? '✓ ' : ''}${esc(text)}</span>`; }

  // ---- rewards (no-ops when the host gives no collection) -------------------
  award(id, medal) { return this.coll ? this.coll.award(id, medal) : null; }
  pack(n = 1) { if (this.coll) this.coll.addPack(n); }

  destroy() {
    this.board = null;
    super.destroy();
  }

  _reconcileOrientation(hostWidth) {
    super._reconcileOrientation(hostWidth);
    if (this.board) fitFrame(this);
  }
}
