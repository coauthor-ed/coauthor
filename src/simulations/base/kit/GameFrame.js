/**
 * GameFrame - the phone-ready frame for a mini-game@1 board in plain DOM.
 *
 * Why these sizes. On a 390 px phone mini-game@1 gives a scene 320 px, so the
 * phone design is 320 wide and renders at scale 1: a 48 px button is 48 CSS px
 * and 15 px text is 15 CSS px. It still holds up on a 360 px phone (scale 0.9).
 * The landscape design is wide and short because the host caps a scene by
 * height: at 1280x720 a 1100 x 405 frame comes out about 1165 x 430, and the
 * whole board plus the verdict then fits between the app bar and the action bar.
 *
 * LAYOUT 'frame' keeps landscape fixed and measures the content in portrait, so
 * a board that grows under the learner's hands (chips in a bin, a why line) just
 * makes the page longer. mountGame watches the content and refits the frame.
 *
 *   class MyGame extends GameBoard {
 *     static OBJECTIVE = { prompt: { en: '...' } };
 *     async setup() {
 *       await super.setup();
 *       mountGame(this, { css, html: '<div class="gm my"><div class="gm-head">...</div>...</div>' });
 *     }
 *     checkObjective() { return null until the board is complete, then { ok } or { ok, hint }; }
 *   }
 *
 * Check. The host's button is 37 px tall and sits below the footer's Quill row, so
 * SELF_CHECKING hides it and the frame adds its own, directly under the last thing
 * the learner touched. The verdict still appears in the host's footer. mountGame's
 * check option:
 *   'label'                   the frame's button with this label (default 'Check my answer')
 *   { label, in: '.sel' }     the same button, placed in your own element in the flow
 *   false                     no button: a game that wins by rounds calls finishGame(scene)
 *                             after the last one, so it never hides the button with CSS
 *
 * Quill sits in the top right corner in both layouts, reacting beside the title
 * rather than on top of the cards. His bubble shows in landscape only: on a phone
 * the objective above and the sub line already say what to do. A look with no
 * mascot draws none, and the title takes the corner back.
 *
 * Radius, rim, lip and press come from the look (--look-*, --sim-radius-*), colours
 * from tokens, so the frame draws under every look.
 */
import { DomSimulation } from '../DomSimulation.js';
import { withChallenge } from '../ChallengeMode.js';
import { SimMascotDom } from '../SimMascotDom.js';
import { useLook, lookOf } from './lookProfile.js';
import { applyToneInks } from './SimLookDom.js';

export const GAME_W = 1100;
export const GAME_H = 405;
export const PHONE_W = 320;
export const PHONE_H = 640;

/** H2O -> H<sub>2</sub>O, for HTML. */
export const formula = (f) => f.replace(/(\d+)/g, '<sub>$1</sub>');

/** Enter and Space act like a tap on an element that is not a real button. */
export function onTap(el, fn) {
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
}

export const GAME_FRAME_CSS = `
.gm { position: relative; box-sizing: border-box; height: 100%; display: flex; flex-direction: column; gap: 10px;
      padding: 14px 18px; font-family: var(--sim-font); color: var(--sim-label); }
.gm * { box-sizing: border-box; }
.gm-head { max-width: 700px; }
.gm .kicker { font-size: 15px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
              color: var(--sim-label-muted); margin: 0 0 2px; }
.gm h2 { font-family: var(--sim-font-display); font-size: 24px; font-weight: 700; line-height: 1.2; margin: 0 0 2px; }
.gm h2 b { color: var(--sim-accent); }
.gm .sub { font-size: 15px; line-height: 1.35; color: var(--sim-label-muted); margin: 0; }
.gm sub, .gm sup { font-size: 0.72em; line-height: 0; }
.gm .tap { min-height: 48px; cursor: pointer; user-select: none; touch-action: manipulation;
           -webkit-tap-highlight-color: transparent; font-family: inherit; color: var(--sim-label);
           box-shadow: 0 var(--sim-lift) 0 var(--sim-stroke);
           transition: border-color 140ms, background 140ms, transform 80ms; }
.gm .tap:active { transform: translateY(calc(2px * var(--look-lip))); box-shadow: 0 calc(1px * var(--look-lip)) 0 var(--sim-stroke); }
.gm .tap:focus-visible { outline: 3px solid var(--sim-accent); outline-offset: 2px; }
@media (hover: hover) { .gm .tap:hover { border-color: var(--sim-accent); } }
.gm .btn { background: var(--sim-bg-surface); border: var(--sim-border); border-radius: var(--sim-radius-md);
           font-size: 15px; font-weight: 700; padding: 6px 12px; }
.gm .num { width: 60px; height: 48px; border-radius: var(--sim-radius-md); background: var(--sim-bg-deep); color: var(--sim-label);
           border: var(--sim-border); font: 700 18px/1 var(--sim-font); text-align: center; padding: 0 4px;
           font-variant-numeric: tabular-nums; -moz-appearance: textfield; appearance: textfield; box-shadow: none; }
.gm .num:active { transform: none; box-shadow: none; }
.gm .num::-webkit-outer-spin-button, .gm .num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.gm .num:focus { outline: 3px solid var(--sim-accent); outline-offset: 1px; }
.gm svg text { font-family: var(--sim-font); }

/* Check lives in the scene, right under the board. Landscape: the bottom right corner, which no board uses.
   In a slot of the game's own (check: { in }) it stays in the flow. */
.gm .gm-check { width: 190px; min-height: 48px; border: 0; border-radius: var(--sim-radius-md);
                background: var(--sim-accent); color: var(--sim-bg-deep); font-size: 16px; font-weight: 800;
                box-shadow: 0 var(--sim-lift) 0 color-mix(in oklab, var(--sim-accent) 65%, var(--sim-label)); }
.gm .gm-check--corner { position: absolute; right: 18px; bottom: 12px; }
.gm .gm-check:active { box-shadow: none; }
.sim-dom-root--portrait .gm .gm-check { position: static; width: 100%; min-height: 50px; }

/* Quill: top right, never over the board. The bubble opens to his left, level with the title. */
.q-mascot .q-bubble { top: 4px; bottom: auto; right: 100%; left: auto; margin-right: 6px;
                      width: max-content; max-width: 300px; font-size: 15px; }

.sim-dom-root--portrait .gm { height: auto; padding: 4px 4px 8px; gap: 10px; }
.sim-dom-root--portrait .gm .kicker { display: none; }
.sim-dom-root--portrait .gm-head { max-width: none; }
.sim-dom-root--portrait .gm h2 { font-size: 21px; }
.gm-quill .sim-dom-root--portrait .gm h2 { padding-right: 62px; }
/* In from the corner: his sparks and puffs reach past his box, and the frame clips at its edge. */
.sim-dom-root--portrait .q-mascot { left: auto !important; right: 14px; top: 14px !important;
                                    width: 40px !important; height: 50px !important; }
.sim-dom-root--portrait .q-bubble { display: none; }
`;

/** Runs the host's check (the same pipeline as its button) and brings the verdict out from behind the action bar. */
function runCheck(scene, anchor) {
  scene.requestCheck?.();
  const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  anchor?.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
}

/**
 * For a game that wins by rounds and has no Check button (check: false): call it after the last
 * round, and calling it again changes nothing once the game is solved.
 */
export function finishGame(scene) {
  if (scene.solved) return;
  runCheck(scene, scene.root?.firstElementChild?.lastElementChild);
}

/**
 * Writes the board, adds Quill and Check, and refits the frame whenever the content's height changes.
 * @param {DomSimulation} scene a GameBoard
 * @param {{html: string, css?: string, onResize?: Function, check?: string|false|{label?: string, in?: string}}} o
 * @returns {HTMLButtonElement|null} the Check button
 */
export function mountGame(scene, { html, css = '', onResize = null, check = 'Check my answer' }) {
  // mini-game@1 binds the host's whole style attribute to --mg-sim-aspect. A scene whose
  // aspect is not 1.5 changes that value, Lit rewrites the attribute, and the look's
  // --look-* properties (set on the host by DomSimulation.setup) are lost, which empties
  // --sim-border and --sim-lift. The scale wrap is ours, so the look goes there as well.
  useLook(scene._scaleWrap);
  scene.render({ html, css: SimMascotDom.styles() + GAME_FRAME_CSS + css, ui: false });
  if (lookOf().mascot) scene._scaleWrap?.classList.add('gm-quill');
  // Chips on a series/accent fill read --sim-ink-on-N; without this they fall back to bg-deep
  // (light text on a light tile). GameBoard.refreshTheme re-runs it on a theme change.
  applyToneInks(scene.root);
  scene.quill = SimMascotDom.mount(scene.root, { x: (scene.constructor.WIDTH ?? GAME_W) - 46, y: 88, height: 60, flip: true, bubbleSide: 'left' });
  const content = scene.root.firstElementChild;
  const opt = typeof check === 'string' ? { label: check } : check;
  let btn = null;
  if (opt) {
    const label = opt.label || 'Check my answer';
    const slot = opt.in ? scene.root.querySelector(opt.in) : null;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tap gm-check${slot ? '' : ' gm-check--corner'}`;
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();     // a click on the board is a move to mini-game@1, which clears the verdict: Check is not one
      runCheck(scene, btn);
      btn.textContent = scene.solved ? 'Check again' : label;
    });
    (slot ?? content)?.appendChild(btn);
  }
  if (typeof ResizeObserver === 'function' && content) {
    scene._contentWatch = new ResizeObserver(() => { scene.relayout(); onResize?.(); });
    scene._contentWatch.observe(content);
  }
  return btn;
}

export function unmountGame(scene) {
  scene._contentWatch?.disconnect();
  scene._contentWatch = null;
  scene.quill?.destroy();
  scene.quill = null;
}

/** Base for a game that is plain DOM: sets the sizes, the layout and the host's static fields once. */
export class GameBoard extends withChallenge(DomSimulation) {
  static WIDTH = GAME_W;
  static HEIGHT = GAME_H;
  static PORTRAIT_WIDTH = PHONE_W;
  static PORTRAIT_HEIGHT = PHONE_H;
  static LAYOUT = 'frame';
  static SELF_CHECKING = true;
  static SCORING = { mode: 'accuracy' };
  static CONTROLS = [];

  refreshTheme() {
    super.refreshTheme?.();
    if (this.root) applyToneInks(this.root);
  }

  destroy() {
    unmountGame(this);
    super.destroy();
  }
}

const SORT_CSS = `
.sb .board { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 410px;
             gap: 14px; align-items: start; }
.sb .tray { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 10px; }
.sb .card { background: var(--sim-bg-surface); border: var(--sim-border); border-radius: var(--sim-radius-lg); padding: 6px;
            text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.sb .card[aria-pressed="true"] { outline: 3px solid var(--sim-accent); outline-offset: 1px;
                                 background: color-mix(in oklab, var(--sim-accent) 14%, var(--sim-bg-surface)); }
.sb .card[data-placed="1"] { opacity: 0.55; border-style: dashed; }
.sb .big { font-family: var(--sim-font-display); font-size: 22px; font-weight: 700; color: var(--sim-accent); line-height: 1.15; }
.sb .small { font-size: 14px; color: var(--sim-label-muted); line-height: 1.2; }
.sb .bins { display: flex; flex-direction: column; gap: 8px; max-height: calc(100% - 58px); overflow-y: auto; }
.sb .bin { background: var(--sim-bg-surface); border: var(--sim-border-width) dashed var(--sim-stroke); border-radius: var(--sim-radius-lg);
           padding: 8px 12px; min-height: 62px; box-shadow: none; }
.sb .bin:active { transform: none; box-shadow: none; }
.sb .bin[data-armed="1"] { border-color: var(--sim-accent); }
.sb .bin[data-good="1"] { border-color: var(--sim-good); border-style: solid; }
.sb .bin[data-bad="1"] { border-color: var(--sim-bad); border-style: solid; }
.sb .bin-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sb .lbl { font-weight: 800; font-size: 15px; line-height: 1.25; }
.sb .count { color: var(--sim-label-muted); font-size: 14px; white-space: nowrap; }
.sb .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.sb .chips:empty { display: none; }
.sb .chip { pointer-events: none; background: var(--sim-bg-deep); border: calc(1.5px * var(--look-rim)) solid var(--sim-stroke);
            border-radius: var(--sim-radius-sm); padding: 0 7px; font-size: 14px; font-weight: 700; }

.sim-dom-root--portrait .sb .board { display: flex; flex-direction: column; gap: 10px; }
.sim-dom-root--portrait .sb .tray { width: 100%; grid-template-columns: repeat(var(--cols-p, 3), minmax(0, 1fr)); gap: 6px; }
.sim-dom-root--portrait .sb .bins { width: 100%; max-height: none; overflow: visible; }
`;

/**
 * SortBoard - tap a card, tap a bin: one board, many games, only the data differs.
 *
 *   static KEY    the class for the game's own CSS
 *   static HEAD   { kicker, title, sub } (title is HTML)
 *   static CARDS  [{ id, html, chip, aria, answer }] (answer = a bin id)
 *   static BINS   [{ id, label }]
 *   static LINE   Quill's first line
 *   static CSS    the game's own CSS
 *   wrongHint(card) -> the hint for the first misplaced card
 *
 * Chips in a bin are labels, not controls: a card stays in the tray and tapping
 * it there takes it back, so nothing in a bin has to be a tap target.
 */
export class SortBoard extends GameBoard {
  static KEY = '';
  static HEAD = { kicker: '', title: '', sub: '' };
  static CARDS = [];
  static BINS = [];
  static LINE = '';
  static CSS = '';

  constructor(container, config) {
    super(container, config);
    this.placements = {};
    this._active = null;
    this._moved = false;
  }

  async setup() {
    await super.setup();
    const C = this.constructor;
    mountGame(this, {
      css: SORT_CSS + C.CSS,
      html: `
        <div class="gm sb ${C.KEY}">
          <div class="gm-head">
            <p class="kicker">${C.HEAD.kicker}</p>
            <h2>${C.HEAD.title}</h2>
            <p class="sub">${C.HEAD.sub}</p>
          </div>
          <div class="board">
            <div class="tray">
              ${C.CARDS.map((c) => `<div class="card tap" data-id="${c.id}" role="button" tabindex="0" aria-pressed="false" aria-label="${c.aria}">${c.html}</div>`).join('')}
            </div>
            <div class="bins">
              ${C.BINS.map((b) => `
                <div class="bin tap" data-bin="${b.id}" role="button" tabindex="0">
                  <div class="bin-top"><span class="lbl">${b.label}</span><span class="count">0</span></div>
                  <div class="chips"></div>
                </div>`).join('')}
            </div>
          </div>
        </div>`,
    });
    this.root.querySelectorAll('.card').forEach((el) => onTap(el, () => this._tapCard(el.dataset.id)));
    this.root.querySelectorAll('.bin').forEach((el) => onTap(el, () => this._tapBin(el.dataset.bin)));
    this._render();
    this.quill.speak(C.LINE, 5200);
  }

  _tapCard(id) {
    delete this.placements[id];     // a placed card comes back and is picked up again
    this._active = id;
    this._moved = true;
    this._render();
  }

  _tapBin(bin) {
    if (this._active === null) return;
    this.placements[this._active] = bin;
    this._active = null;
    this._render();
  }

  _render() {
    const C = this.constructor;
    this.root.querySelectorAll('.card').forEach((el) => {
      const id = el.dataset.id;
      el.dataset.placed = this.placements[id] ? '1' : '0';
      el.setAttribute('aria-pressed', id === this._active ? 'true' : 'false');
    });
    const allPlaced = Object.keys(this.placements).length === C.CARDS.length;
    for (const b of C.BINS) {
      const el = this.root.querySelector(`.bin[data-bin="${b.id}"]`);
      const held = C.CARDS.filter((c) => this.placements[c.id] === b.id);
      el.querySelector('.count').textContent = String(held.length);
      el.querySelector('.chips').innerHTML = held.map((c) => `<span class="chip">${c.chip}</span>`).join('');
      el.setAttribute('aria-label', `${b.label}: ${held.length} placed`);
      el.dataset.armed = this._active !== null ? '1' : '0';
      const wrong = held.some((c) => c.answer !== b.id);
      el.dataset.good = allPlaced && !wrong ? '1' : '0';
      el.dataset.bad = allPlaced && wrong ? '1' : '0';
    }
  }

  wrongHint(card) { return `Check ${card.chip} again.`; }

  checkObjective() {
    const C = this.constructor;
    if (!this._moved) return null;
    if (Object.keys(this.placements).length < C.CARDS.length) return null;
    const wrong = C.CARDS.filter((c) => this.placements[c.id] !== c.answer);
    if (wrong.length === 0) {
      this.quill?.perform('hop');
      return { ok: true };
    }
    this.quill?.setExpression('surprised');
    return { ok: false, hint: this.wrongHint(wrong[0], wrong) };
  }
}
