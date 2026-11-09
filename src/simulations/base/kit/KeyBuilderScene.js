import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { characterSvg, CHARACTER_CSS } from './KeyCharacters.js';
import { SIM_FIND_CSS, burst } from './SimFind.js';

// "Sort the crowd" - the shared engine behind every branching-key challenge in
// this course. The learner grows a key by asking questions of a group of
// creatures; the scene splits the group by each creature's REAL evidence (never
// by the learner's say-so), then the learner names the group at the end of each
// branch. A concrete scene is a thin subclass that only sets `static CONFIG`
// (items, tests, groups, wording) plus its measured design size.
//
// CONFIG:
//   ariaLabel, noun ('kingdom' | 'class' | ...), groups: [names in chip order]
//   items: [{ name, group, tone (1-8), art (KeyCharacters key), facts, card: [lines] }]
//     facts[testId] is one of the test's answer keys, UNKNOWN (the card does not
//     say) or NOT_APPLICABLE (the question makes no sense for this item).
//   tests: { id: { ask, answers: [[key, branchLabel], ...], na } }
//   nameMixed: true lets a group that still holds several items be named as one
//     (needed when two items legitimately share a group, e.g. sparrow + ostrich).
//   requires: { group: [ alternatives... ] }, an alternative = [[testId, answerKey], ...].
//     A route only counts if it asked all of one alternative's questions with those
//     answers - "it was the only card left" is not a reason.
//   draft: () => spec  a flawed starting key to REPAIR (see _norm for the shape)
//   lockFirstBeat: true shows the draft read-only on the first beat.
//   cardStyle: 'column' | 'wide', cols, portraitCols
//   bonus: { depth, textOn, textOff } optional star for a shallow key
//   titles: [beat-0 title, beat-1 title], text: { ready, solved, solvedNote, draftLead }
//
// Layout: in landscape the scene is a FIXED frame (static WIDTH x HEIGHT). The
// header, the evidence bar and the footer stay put and only the key scrolls, so
// a deep key never makes the scene taller and it can sit beside the beat text.
// The evidence cards start open (at the top of the scrolling key) and fold to a
// strip of name chips in the bar on the learner's first action; the toggle, or
// a chip (for one card), brings them back. Portrait keeps the old auto-height
// (the page scrolls there).
export const UNKNOWN = 'unknown';
export const NOT_APPLICABLE = 'na';
export const yesNo = (ask, na) => ({ ask, answers: [['yes', 'Yes'], ['no', 'No']], na });

const BEAT_STEP_MAP = [
  [{ idx: 0, dwellMs: null }],
  [{ idx: 1, dwellMs: null }],
];

// Exported so the static worked snapshots (e.g. YeastExceptionScene) can draw the
// very same pods, cards and badges without duplicating the styles.
export const KEY_CSS = `
.ek-root { box-sizing:border-box; padding:var(--sim-space-3); background:var(--sim-bg-deep); color:var(--sim-label); font:var(--sim-text-sm)/1.3 var(--sim-font); }
.ek-root * { box-sizing:border-box; }
.ek-root [hidden] { display:none !important; }
.ek-root button { font:inherit; color:inherit; cursor:pointer; }
.ek-root :focus-visible { outline:3px solid var(--sim-accent); outline-offset:2px; }
.ek-board { display:flex; flex-direction:column; gap:var(--sim-space-2); }

.ek-head { display:flex; align-items:center; justify-content:space-between; gap:var(--sim-space-2) var(--sim-space-3); flex-wrap:wrap; }
.ek-headr { display:flex; align-items:center; gap:var(--sim-space-3); }
.ek-tools { display:flex; gap:var(--sim-space-2); }
.ek-title { font-size:var(--sim-text-xl); font-weight:800; }
.ek-pips { display:flex; align-items:center; gap:var(--sim-space-1); font-size:var(--sim-text-sm); font-weight:800; color:var(--sim-label-muted); }
.ek-pip { width:14px; height:14px; border-radius:50%; border: calc(2px * var(--look-rim)) solid var(--t); transition:background .2s, transform .2s; }
.ek-pip.ek-on { background:var(--t); transform:scale(1.15); }
.ek-pips b { margin-left:3px; color:var(--sim-label); }

.ek-cards { display:grid; grid-template-columns:repeat(var(--cols,5),minmax(0,1fr)); gap:var(--sim-space-2); }
.ek-pcard { position:relative; display:flex; flex-direction:column; align-items:center; gap:var(--sim-space-1); padding:var(--sim-space-2) var(--sim-space-1); border: calc(2px * var(--look-rim)) solid var(--t); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--t); text-align:center; }
.ek-pcard > .ek-av { width:36px; height:36px; }
.ek-pname { display:flex; align-items:center; justify-content:center; min-height:28px; font-size:var(--sim-text-sm); font-weight:800; line-height:1.15; }
.ek-facts { display:flex; flex-direction:column; gap:2px; width:100%; margin:0; padding:0; list-style:none; }
.ek-facts li { display:flex; align-items:center; justify-content:center; min-height:19px; padding:1px var(--sim-space-1); border-radius:var(--sim-radius-sm); background:var(--sim-bg-cell); font-size:var(--sim-text-sm); line-height:1.2; overflow-wrap:anywhere; }
.ek-facts li.ek-tall { min-height:30px; }
.ek-wide .ek-pcard { align-items:stretch; text-align:left; padding:var(--sim-space-2); }
.ek-whead { display:flex; align-items:center; gap:var(--sim-space-2); }
.ek-whead .ek-av { width:34px; height:34px; }
.ek-whead .ek-pname { min-height:0; justify-content:flex-start; font-size:var(--sim-text-sm); }
.ek-wide .ek-facts { display:block; padding:var(--sim-space-1) var(--sim-space-2); border-radius:var(--sim-radius-sm); background:var(--sim-bg-cell); font-size:var(--sim-text-sm); line-height:1.4; }
.ek-wide .ek-facts li { display:inline; min-height:0; padding:0; background:none; font-size:inherit; line-height:inherit; }
.ek-wide .ek-facts li:not(:last-child)::after { content:' · '; color:var(--sim-label-muted); font-weight:800; }
.ek-evid { position:relative; }
.ek-evbar { display:flex; flex-wrap:wrap; align-items:center; gap:var(--sim-space-1) var(--sim-space-2); }
.ek-evtoggle { display:inline-flex; align-items:center; gap:var(--sim-space-1); min-height:32px; padding:2px var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); font-weight:800; }
.ek-evtoggle:hover { border-color:var(--sim-accent); }
.ek-echip { position:relative; display:inline-flex; align-items:center; gap:4px; min-height:32px; padding:2px var(--sim-space-2) 2px 4px; border: calc(2px * var(--look-rim)) solid var(--t); border-radius:var(--sim-radius-pill); background:var(--sim-bg-surface); font-size:var(--sim-text-sm); font-weight:700; line-height:1.1; }
.ek-echip .ek-av { width:22px; height:22px; }
.ek-echip:hover { background:var(--sim-bg-cell); }
.ek-echip[aria-expanded="true"] { background:var(--sim-bg-cell); box-shadow:0 0 0 2px var(--t); }
.ek-echip.ek-ok { border-color:var(--sim-success); }
.ek-echip.ek-bad { border-color:var(--sim-error); }
.ek-echip .ek-tick { font-weight:800; color:var(--sim-success); }
.ek-echip.ek-bad .ek-tick { color:var(--sim-error); }
.ek-peek { position:absolute; z-index:5; top:100%; left:0; margin-top:6px; width:min(100%, 300px); }
.ek-peek .ek-pcard { background:var(--sim-bg-surface); }
.ek-peekx { position:absolute; top:-10px; left:-8px; z-index:6; display:flex; align-items:center; justify-content:center; width:26px; height:26px; padding:0; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:50%; background:var(--sim-bg-cell); font-weight:800; }
.ek-pcard.ek-cite, .ek-echip.ek-cite { outline:3px solid var(--sim-warning); outline-offset:2px; }
.ek-pcard.ek-ok { border-color:var(--sim-success); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-success); }
.ek-pcard.ek-bad { border-color:var(--sim-error); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-error); }
.ek-mark { position:absolute; top:-8px; right:-6px; display:flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; font-size:var(--sim-text-sm); font-weight:800; color:var(--sim-bg-deep); background:var(--sim-success); }
.ek-bad .ek-mark { background:var(--sim-error); }

.ek-tree { display:flex; flex-direction:column; gap:var(--sim-space-2); }
/* Landscape is a fixed frame: header, evidence bar and footer stay put and only
   the key scrolls, so a deep key never makes the whole scene taller. */
.ek-fixed .ek-board { height:100%; }
.ek-fixed .ek-head, .ek-fixed .ek-evid, .ek-fixed .ek-foot { flex:none; }
.ek-fixed .ek-scroll { flex:1 1 0; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:10px var(--sim-space-2) 6px 4px; scrollbar-width:thin; scrollbar-color:var(--sim-stroke) transparent; }
.ek-fixed .ek-scroll.ek-more { -webkit-mask-image:linear-gradient(to bottom, var(--sim-bg-deep) calc(100% - 28px), transparent); mask-image:linear-gradient(to bottom, var(--sim-bg-deep) calc(100% - 28px), transparent); }
.ek-fixed .ek-scroll.ek-less { -webkit-mask-image:linear-gradient(to bottom, transparent, var(--sim-bg-deep) 20px); mask-image:linear-gradient(to bottom, transparent, var(--sim-bg-deep) 20px); }
.ek-fixed .ek-scroll.ek-more.ek-less { -webkit-mask-image:linear-gradient(to bottom, transparent, var(--sim-bg-deep) 20px, var(--sim-bg-deep) calc(100% - 28px), transparent); mask-image:linear-gradient(to bottom, transparent, var(--sim-bg-deep) 20px, var(--sim-bg-deep) calc(100% - 28px), transparent); }
.ek-pod { display:flex; flex-direction:column; gap:var(--sim-space-2); }
.ek-card { padding:var(--sim-space-1) var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-stroke); }
.ek-pod.ek-open > .ek-card { border-style:dashed; }
.ek-pod.ek-active > .ek-card { border: calc(2px * var(--look-rim)) solid var(--sim-accent); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-accent); background:var(--sim-bg-cell); }
.ek-card.ek-bad { border-color:var(--sim-error); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-error); }
.ek-row { display:flex; flex-wrap:wrap; align-items:center; gap:var(--sim-space-2) var(--sim-space-2); min-height:32px; }
.ek-avs { display:inline-flex; flex-wrap:wrap; gap:2px; }
.ek-avs .ek-av { width:30px; height:30px; }
.ek-nm { font-weight:800; }
.ek-ans { padding:var(--sim-space-1) var(--sim-space-2); border-radius:var(--sim-radius-pill); background:var(--sim-accent); color:var(--sim-bg-deep); font-size:var(--sim-text-sm); font-weight:800; }
.ek-chk { padding:2px var(--sim-space-2); border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); font-size:var(--sim-text-sm); font-weight:700; }
.ek-qg { display:inline-flex; align-items:center; gap:var(--sim-space-2); }
.ek-q { padding:2px var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); font-weight:800; }
.ek-mini { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; padding:0; border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:50%; background:var(--sim-bg-cell); font-size:var(--sim-text-md); font-weight:800; }
.ek-mini:hover:not(:disabled) { border-color:var(--sim-accent); }
.ek-mini:disabled { opacity:.4; cursor:default; }
.ek-ask { padding:var(--sim-space-1) var(--sim-space-3); border: calc(2px * var(--look-rim)) dashed var(--sim-accent); border-radius:var(--sim-radius-pill); background:transparent; font-weight:800; }
.ek-badge { padding:var(--sim-space-1) var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--t); border-radius:var(--sim-radius-pill); background:var(--t); color:var(--sim-bg-deep); font-weight:800; }
.ek-badge.ek-ok { border-color:var(--sim-success); box-shadow:0 0 0 3px var(--sim-success); }
.ek-badge.ek-bad { border-color:var(--sim-error); box-shadow:0 0 0 3px var(--sim-error); }
.ek-badge:disabled { cursor:default; }
.ek-hint { color:var(--sim-label-muted); font-size:var(--sim-text-sm); font-weight:700; }
.ek-kids { display:flex; flex-direction:column; gap:var(--sim-space-2); margin-left:12px; padding-left:14px; border-left:3px solid var(--sim-stroke); }
.ek-kid { position:relative; }
.ek-kid::before { content:''; position:absolute; left:-14px; top:19px; width:12px; border-top:3px solid var(--sim-stroke); }
.ek-new { animation:ek-pop .28s ease-out; }

.ek-picker { display:flex; flex-direction:column; gap:var(--sim-space-2); margin-top:8px; padding-top:8px; border-top:2px dashed var(--sim-stroke); }
.ek-prompt { font-weight:700; }
.ek-prompt.ek-warn { padding:var(--sim-space-2) var(--sim-space-2); border-left:4px solid var(--sim-warning); border-radius:var(--sim-radius-sm); background:var(--sim-bg-surface); animation:ek-shake .35s; }
.ek-or { color:var(--sim-label-muted); font-size:var(--sim-text-sm); font-weight:800; }
.ek-chips { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--sim-space-2); }
.ek-chipbtn, .ek-btn { min-height:36px; padding:var(--sim-space-2) var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:var(--sim-radius-md); background:var(--sim-bg-cell); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-stroke); font-weight:800; transition:transform .08s, box-shadow .08s, border-color .15s; }
.ek-chips.ek-g { display:flex; flex-wrap:wrap; gap:var(--sim-space-2); }
.ek-chips.ek-g .ek-chipbtn { min-height:34px; padding:var(--sim-space-1) var(--sim-space-3); border-radius:var(--sim-radius-pill); }
.ek-chipbtn:hover, .ek-btn:hover:not(:disabled) { border-color:var(--sim-accent); }
.ek-chipbtn:active, .ek-btn:active:not(:disabled) { transform:translateY(3px); box-shadow:0 0 0 var(--sim-stroke); }
.ek-chipbtn.ek-used { opacity:.55; }
.ek-chipbtn.ek-wobble { border-color:var(--sim-warning); animation:ek-shake .35s; }
.ek-btn:disabled { opacity:.45; cursor:default; }

.ek-foot { display:flex; flex-direction:column; gap:var(--sim-space-2); }
.ek-btn { padding:var(--sim-space-2) var(--sim-space-3); }
.ek-root .ek-run { flex:none; border-color:var(--sim-success); background:var(--sim-success); color:var(--sim-bg-deep); font-size:var(--sim-text-md); }
.ek-verdict { position:relative; display:flex; align-items:center; flex-wrap:wrap; gap:var(--sim-space-2) var(--sim-space-3); padding:var(--sim-space-2) var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); }
.ek-verdict.ek-win { border-color:var(--sim-success); }
.ek-verdict.ek-lose { border-color:var(--sim-warning); }
.ek-vmsg { flex:1 1 220px; min-width:0; }
.ek-vhead { width:fit-content; font-size:var(--sim-text-lg); font-weight:800; }
.ek-vtext { margin-top:2px; }
.ek-stars { display:flex; align-items:center; gap:var(--sim-space-2); margin-top:4px; font-weight:700; }
.ek-star { font-size:var(--sim-text-xl); line-height:1; color:var(--sim-warning); }
.ek-star.ek-off { color:var(--sim-stroke); }

.ek-anim .ek-badge.ek-ok, .ek-anim .ek-badge.ek-bad { animation:ek-stamp .45s both; animation-delay:calc(var(--ek-i) * 220ms); }
.ek-anim .ek-pcard .ek-mark { animation:ek-stamp .45s both; animation-delay:calc(var(--ek-i) * 220ms); }
.ek-anim .ek-pcard.ek-ok { animation:ek-hop .5s ease-out; animation-delay:calc(var(--ek-i) * 220ms); }
.ek-anim .ek-verdict { animation:ek-rise .4s ease-out both; animation-delay:1.25s; }

@keyframes ek-pop { from { transform:scale(.9); opacity:0; } to { transform:scale(1); opacity:1; } }
@keyframes ek-shake { 0%, 100% { transform:translateX(0); } 25% { transform:translateX(-5px); } 75% { transform:translateX(5px); } }
@keyframes ek-stamp { 0% { transform:scale(.4); opacity:0; } 60% { transform:scale(1.18); opacity:1; } 100% { transform:scale(1); opacity:1; } }
@keyframes ek-hop { 0%, 100% { transform:translateY(0); } 40% { transform:translateY(-8px); } }
@keyframes ek-rise { from { transform:translateY(8px); opacity:0; } to { transform:translateY(0); opacity:1; } }

.sim-dom-root--portrait.ek-root { font-size:var(--sim-text-md); }
.sim-dom-root--portrait .ek-cards { grid-template-columns:repeat(var(--pcols,3),minmax(0,1fr)); }
.sim-dom-root--portrait .ek-chips:not(.ek-g) { grid-template-columns:repeat(2,minmax(0,1fr)); }
.sim-dom-root--portrait .ek-facts li { font-size:var(--sim-text-sm); }
.sim-dom-root--portrait .ek-kids { margin-left:6px; padding-left:10px; }
.sim-dom-root--portrait .ek-kid::before { left:-10px; width:8px; }

@media (prefers-reduced-motion:reduce) {
  .ek-root *, .ek-root *::before { animation:none !important; transition:none !important; }
}
` + SIM_FIND_CSS;

function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function add(parent, ...children) { children.forEach(child => parent.appendChild(child)); return parent; }

// ---- fixed frame + scrolling region: shared with SlotBoardScene ----------------
// Landscape is a fixed frame (WIDTH x HEIGHT, or taller when the scene sets
// FILL_HEIGHT and the host has room): header and footer stay put and the region
// marked `ek-scroll` scrolls. Portrait keeps the measured auto height (the page
// scrolls there), so the design rectangle follows the real content.
/** A solved board's find, on the verdict's headline once the verdict has landed. Only a fresh run: a repaint stays quiet. */
export function solvedFind(scene, verdict) {
  if (!scene.root.classList.contains('ek-anim')) return;
  const find = () => burst(scene.root, 0, { el: verdict.querySelector('.ek-vhead'), key: 'solved' });
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { queueMicrotask(find); return; }
  verdict.addEventListener('animationend', (e) => { if (e.target === verdict) find(); });
}

export function fitFrame(scene) {
  if (!scene.root || !scene._scaleWrap) return;
  const fixed = !scene._isPortrait;
  scene.root.classList.toggle('ek-fixed', fixed);
  if (fixed) {
    const height = scene.constructor.HEIGHT;
    scene._designH = height;
    scene.root.style.height = `${height}px`;
    scene._scaleWrap.style.height = '';
    scene._scaleWrap.style.aspectRatio = `${scene._designW} / ${height}`;
    scene.fillFrame();
    return;
  }
  scene._scaleWrap.style.height = '';
  scene.root.style.height = 'auto';
  const height = Math.ceil(scene.root.offsetHeight);
  if (!height) return;
  scene._designH = height;
  scene._scaleWrap.style.aspectRatio = `${scene._designW} / ${height}`;
}

// After a rebuild: keep the learner's scroll place, then (mode 'reveal', i.e.
// after their own action) bring what they are working on into view - the union
// of the `targets` selectors, aligned to its top if it is taller than the region.
// mode 'top' scrolls to the top (cards just reopened).
export function settleScroll(scene, region, keptScroll, mode, targets) {
  if (!region) return;
  region.scrollTop = mode === 'top' ? 0 : keptScroll;
  if (mode === 'reveal' && !scene._isPortrait && region.scrollHeight > region.clientHeight) {
    const rects = targets.map(sel => scene.board.querySelector(sel)).filter(Boolean).map(n => n.getBoundingClientRect());
    if (rects.length) {
      const box = region.getBoundingClientRect();
      const scale = box.height / region.clientHeight || 1;
      const top = Math.min(...rects.map(r => r.top));
      const bottom = Math.max(...rects.map(r => r.bottom));
      const pad = 6 * scale;
      if (bottom - top > box.height - 2 * pad || top < box.top + pad) region.scrollTop += (top - box.top - pad) / scale;
      else if (bottom > box.bottom - pad) region.scrollTop += (bottom - box.bottom + pad) / scale;
    }
  }
  const sync = () => {
    region.classList.toggle('ek-more', region.scrollHeight - region.clientHeight - region.scrollTop > 4);
    region.classList.toggle('ek-less', region.scrollTop > 4);
  };
  region.addEventListener('scroll', sync, { passive: true });
  sync();
}

export class KeyBuilderScene extends DomSimulation {
  // A concrete scene overrides these with its browser-measured WORST case: the
  // host sizes the side panel from them before the board can measure itself.
  static WIDTH = 620;
  static HEIGHT = 520;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 1340;
  static CONTROLS = [];
  // Board text sits at the 14px floor at 1x, so any shrink is unreadable: a
  // side panel needs >= 1.05x, otherwise the board goes below the text at
  // full width rather than the host shrinking the side panel.
  static MIN_SCALE = 1.05;
  // Uses spare viewport height in a side panel (the frame grows past HEIGHT).
  static FILL_HEIGHT = true;
  static CONFIG = null;

  constructor(container, config) {
    super(container, config);
    this.cfg = this.constructor.CONFIG;
    this.stepIndex = 0;
    this.nextId = 1;
    this.tree = this._newTree();
    this.activeId = this._firstOpen(this.tree)?.id ?? null;
    this.history = [];
    this.result = null;
    this.note = null;
    this.noteKey = null;
    this.fresh = new Set();
    this.animate = false;
    this.focusKey = null;
    this.allowResume = true;
    this.cardsOpen = true;
    // The read-only draft beat (lockFirstBeat) is about the key, so its cards start folded.
    this.lockedOpen = false;
    this.peek = null;
    this.cite = null;
    this.scrollMode = null;
  }

  async setup() {
    await super.setup();
    this.root.classList.add('ek-root');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', this.cfg.ariaLabel);
    this.injectStyle(CHARACTER_CSS + KEY_CSS);
    this.board = el('div', 'ek-board');
    this.root.appendChild(this.board);
    // A peeked card closes on Escape or on any click that is not on it.
    this.root.addEventListener('click', (e) => {
      if (this.peek !== null && !e.target.closest?.('.ek-peek, .ek-echip')) { this.peek = null; this._render(); }
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.peek !== null) { const i = this.peek; this.peek = null; this.focusKey = `e-${i}`; this._render(); }
    });
    this._render();
  }

  onBeatChange(beatIndex) {
    const index = Number.isFinite(beatIndex) ? Math.trunc(beatIndex) : 0;
    this.stepIndex = BEAT_STEP_MAP[Math.max(0, Math.min(index, BEAT_STEP_MAP.length - 1))][0].idx;
    // Coming back to the first beat keeps the learner's key, not the old verdict.
    if (this.stepIndex === 0) this.result = null;
    this.peek = null;
    this._render();
    this.requestUiUpdate?.();
  }

  // ---- key model ---------------------------------------------------------
  // spec: { members, test?, stamp?, kids?: [{ ans, ...spec }] } -> pods with ids.
  _norm(spec, counter) {
    const pod = { id: `p${counter.n++}`, members: spec.members, test: spec.test || null, kids: null, stamp: spec.stamp || null, checks: spec.checks || [] };
    if (spec.kids) pod.kids = spec.kids.map(k => ({ ans: k.ans, pod: this._norm(k, counter) }));
    return pod;
  }
  _newTree() {
    const all = this.cfg.items.map((_, i) => i);
    const counter = { n: 1 };
    const tree = this._norm(this.cfg.draft ? this.cfg.draft() : { members: all }, counter);
    this.nextId = counter.n;
    return tree;
  }
  // Read-only copy of the flawed starting key, shown on a locked first beat.
  _draftTree() { return this._norm(this.cfg.draft(), { n: 1000 }); }
  _locked() { return Boolean(this.cfg.lockFirstBeat && this.stepIndex === 0); }
  _viewTree() { return this._locked() ? (this._draftView ||= this._draftTree()) : this.tree; }

  _walk(fn, pod = this.tree, path = []) {
    fn(pod, path);
    pod.kids?.forEach(k => this._walk(fn, k.pod, [...path, pod]));
  }
  _find(id) { let found = null; this._walk(p => { if (p.id === id) found = p; }); return found; }
  // A pod still needs the learner: nothing decided yet (no question, no name).
  _isOpen(pod) { return !pod.test && !pod.stamp; }
  _firstOpen(tree) {
    let found = null;
    const visit = (p) => { if (!found && this._isOpen(p)) found = p; p.kids?.forEach(k => visit(k.pod)); };
    visit(tree);
    return found;
  }
  // Questions already asked on the way to this pod (splits and confirming checks).
  _askedAbove(id) {
    const asked = new Set();
    this._walk((p, path) => {
      if (p.id !== id) return;
      path.forEach(a => { asked.add(a.test); a.checks.forEach(([t]) => asked.add(t)); });
      p.checks.forEach(([t]) => asked.add(t));
    });
    return asked;
  }
  // The route an item takes: follows the pod that HOLDS it, so a seeded draft
  // (which may not match the evidence) is walked exactly as drawn.
  _leafOf(index, tree = this.tree) {
    let pod = tree;
    const path = [];
    while (pod.test) {
      const kid = pod.kids.find(k => k.pod.members.includes(index));
      if (!kid) break;
      path.push(...pod.checks, [pod.test, kid.ans]);
      pod = kid.pod;
    }
    path.push(...pod.checks);
    return { pod, depth: path.length, path };
  }

  // Can this question be asked of this group? Returns { problem } when it cannot,
  // { confirm: answerKey } when everyone answers alike but the route still needs the
  // evidence on record (only in scenes with cfg.requires), or {} for a real split.
  _splitCheck(pod, testKey) {
    const test = this.cfg.tests[testKey];
    for (const i of pod.members) {
      const item = this.cfg.items[i];
      const v = item.facts[testKey];
      if (v === undefined || v === UNKNOWN) return { problem: `The ${item.name} card does not say - so "${test.ask}" cannot sort it.`, item: i };
      if (v === NOT_APPLICABLE) return { problem: `The ${item.name} ${test.na || 'does not fit this question'} - so "${test.ask}" cannot sort it.`, item: i };
    }
    const buckets = test.answers.filter(([key]) => pod.members.some(i => this.cfg.items[i].facts[testKey] === key));
    if (buckets.length >= 2) return {};
    if (!this.cfg.requires) return { problem: `They all answer "${buckets[0][1]}" - this question cannot tell them apart. Try another.` };
    if (this._askedAbove(pod.id).has(testKey)) return { problem: `You already asked "${test.ask}" on this branch.` };
    return { confirm: buckets[0][0] };
  }

  _snapshot() { return JSON.parse(JSON.stringify({ tree: this.tree, nextId: this.nextId, activeId: this.activeId })); }
  _change(fn) {
    this.history.push(this._snapshot());
    this.note = null;
    this.noteKey = null;
    this.result = null;
    this.peek = null;
    // The learner's first real action folds the evidence cards away.
    this.cardsOpen = false;
    this.scrollMode = 'reveal';
    fn();
    this.activeId = this._firstOpen(this.tree)?.id ?? null;
    this.focusKey = 'picker';
    this._render();
  }

  _split(podId, testKey) {
    const pod = this._find(podId);
    if (!pod) return;
    const { problem, confirm, item } = this._splitCheck(pod, testKey);
    if (problem) {
      this.note = problem;
      this.noteKey = testKey;
      // The warning names a card: mark it (chip and card) without moving anything.
      if (item !== undefined) this.cite = item;
      this.peek = null;
      this.scrollMode = 'reveal';
      this.focusKey = `t-${testKey}`;
      this._render();
      return;
    }
    if (confirm) {
      // Everyone answers alike: keep the pod whole and put the evidence on record.
      this._change(() => { pod.checks.push([testKey, confirm]); });
      return;
    }
    this._change(() => {
      pod.test = testKey;
      pod.kids = this.cfg.tests[testKey].answers
        .map(([key]) => ({ ans: key, members: pod.members.filter(i => this.cfg.items[i].facts[testKey] === key) }))
        .filter(k => k.members.length)
        .map(k => ({ ans: k.ans, pod: { id: `p${this.nextId++}`, members: k.members, test: null, kids: null, stamp: null, checks: [] } }));
      this.fresh = new Set(pod.kids.map(k => k.pod.id));
    });
  }
  _stamp(podId, group) { const pod = this._find(podId); if (pod) this._change(() => { pod.stamp = group; }); }
  _reopen(podId) {
    const pod = this._find(podId);
    if (!pod) return;
    this._change(() => { pod.test = null; pod.kids = null; pod.stamp = null; pod.checks = []; });
    this.activeId = podId;
    this._render();
  }
  _activate(podId) { this.activeId = podId; this.scrollMode = 'reveal'; this.peek = null; this.note = null; this.noteKey = null; this.focusKey = 'picker'; this._render(); }
  _undo() {
    const snap = this.history.pop();
    if (!snap) return;
    Object.assign(this, snap);
    this.scrollMode = 'reveal';
    this.peek = null;
    this.note = null;
    this.result = null;
    this.focusKey = 'undo';
    this._render();
  }
  _startOver() {
    this._change(() => { this.tree = this._newTree(); });
    this.activeId = this._firstOpen(this.tree)?.id ?? null;
    this.cardsOpen = true;
    this._render();
  }

  /** Pure check. The evidence picks the branch at every step, so a route can
   * only fail at its END: a wrong or missing group, a group never split, or a
   * name the route never earned (cfg.requires). Any structurally different key
   * that gets every item right is accepted. */
  evaluate(tree = this.tree) {
    const routes = this.cfg.items.map((item, i) => {
      const { pod, depth, path } = this._leafOf(i, tree);
      const base = { depth, stamp: pod.stamp, podId: pod.id, missing: [] };
      if (!pod.stamp) return { ...base, status: pod.members.length > 1 ? 'mixed' : 'unnamed' };
      if (pod.stamp !== item.group) return { ...base, status: 'wrong' };
      const alts = this.cfg.requires?.[item.group];
      if (alts) {
        const have = new Set(path.map(([t, a]) => `${t}=${a}`));
        const gaps = alts.map(alt => alt.filter(([t, a]) => !have.has(`${t}=${a}`)));
        if (!gaps.some(g => g.length === 0)) {
          const best = gaps.reduce((a, b) => (b.length < a.length ? b : a));
          return { ...base, status: 'unjustified', missing: best.map(([t]) => t) };
        }
      }
      return { ...base, status: 'ok' };
    });
    const passed = routes.filter(r => r.status === 'ok').length;
    return { routes, passed, solved: passed === routes.length, deepest: Math.max(...routes.map(r => r.depth)) };
  }

  _run() {
    this.result = this.evaluate();
    this.peek = null;
    this.animate = true;
    this.focusKey = 'run';
    this._render();
  }

  _verdictText(res) {
    const items = this.cfg.items;
    const first = (status) => res.routes.findIndex(r => r.status === status);
    const wrong = first('wrong');
    if (wrong >= 0) return `The ${items[wrong].name} landed on ${res.routes[wrong].stamp}. Re-read its evidence card and rename it.`;
    const un = first('unjustified');
    if (un >= 0) {
      const asks = [...new Set(res.routes[un].missing)].map(t => `"${this.cfg.tests[t].ask}"`).join(' and ');
      return `The ${items[un].name} reached ${res.routes[un].stamp} without ever being asked ${asks}. Add the question that actually shows it.`;
    }
    const mixed = res.routes.map((r, i) => (r.status === 'mixed' ? items[i].name : null)).filter(Boolean);
    if (mixed.length) return `${mixed.join(' and ')} still ${mixed.length > 1 ? 'share' : 'sits in'} an unfinished group. Ask another question to split ${mixed.length > 1 ? 'them' : 'it'}${this.cfg.nameMixed ? ', or name the group if they belong together' : ''}.`;
    const open = first('unnamed');
    return `The ${items[open].name} has no ${this.cfg.noun} yet. Name it, then run again.`;
  }

  // ---- rendering -----------------------------------------------------------
  _btn(text, className, onClick, focusKey, label) {
    const b = el('button', className, text);
    b.type = 'button';
    if (focusKey) b.dataset.focus = focusKey;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  _render() {
    if (!this.board || !this.root) return;
    const animate = this.animate;
    this.animate = false;
    this.root.dataset.step = String(this.stepIndex);
    this.root.classList.toggle('ek-anim', animate);
    const tree = this._viewTree();
    // A locked first beat shows the draft's verdict straight away, unanimated.
    const res = this._locked() ? this.evaluate(tree) : this.result;
    const keptScroll = this.board.querySelector('.ek-scroll')?.scrollTop ?? 0;
    this.board.textContent = '';
    add(this.board, this._head(tree), this._evidence(res), this._treeEl(tree, res), this._foot(res));
    this.fresh = new Set();
    this._fit();
    const key = this.focusKey;
    this.focusKey = null;
    if (key) this.board.querySelector(`[data-focus="${key}"]`)?.focus({ preventScroll: true });
    this._settleScroll(keptScroll);
    this._placePeek();
  }

  // Sit the peeked card under its own chip, kept inside the frame.
  _placePeek() {
    const peek = this.board.querySelector('.ek-peek');
    const chip = this.peek !== null ? this.board.querySelector(`[data-focus="e-${this.peek}"]`) : null;
    if (!peek || !chip) return;
    const room = peek.parentElement.clientWidth - peek.offsetWidth;
    peek.style.left = `${Math.max(0, Math.min(chip.offsetLeft, room))}px`;
  }

  // The key scrolls inside the fixed frame. Keep the learner's place across the
  // rebuild, then make sure the pod they are working on is in view.
  _settleScroll(keptScroll) {
    const mode = this.scrollMode;
    this.scrollMode = null;
    settleScroll(this, this.board.querySelector('.ek-scroll'), keptScroll, mode, ['.ek-pod.ek-active > .ek-card']);
  }

  _showCards() { return this._locked() ? this.lockedOpen : this.cardsOpen; }

  _named(tree) {
    return this.cfg.items.filter((_, i) => this._leafOf(i, tree).pod.stamp).length;
  }

  _title() {
    const t = this.cfg.titles || ['Build your key', 'Test your key'];
    return t[Math.min(this.stepIndex, t.length - 1)];
  }

  _head(tree) {
    const head = el('div', 'ek-head');
    head.appendChild(el('div', 'ek-title', this._title()));
    const n = this.cfg.items.length;
    const named = this._named(tree);
    const pips = el('div', 'ek-pips');
    pips.setAttribute('aria-label', `${named} of ${n} named`);
    this.cfg.items.forEach((item, i) => {
      const pip = el('span', 'ek-pip');
      pip.style.cssText = `--t:var(--sim-series-${item.tone})`;
      if (this._leafOf(i, tree).pod.stamp) pip.classList.add('ek-on');
      pips.appendChild(pip);
    });
    pips.appendChild(el('b', '', `${named}/${n}`));
    const right = add(el('div', 'ek-headr'), pips);
    if (!this._locked()) {
      const tools = el('div', 'ek-tools');
      const undo = this._btn('↶', 'ek-mini', () => this._undo(), 'undo', 'Undo the last step');
      undo.title = 'Undo';
      undo.disabled = this.history.length === 0;
      const reset = this._btn('⟲', 'ek-mini', () => this._startOver(), 'reset', this.cfg.draft ? 'Back to the starting key' : 'Start over');
      reset.title = this.cfg.draft ? 'Back to the starting key' : 'Start over';
      right.appendChild(add(tools, undo, reset));
    }
    head.appendChild(right);
    return head;
  }

  _card(i, res, wide) {
    const item = this.cfg.items[i];
    const card = el('div', 'ek-pcard');
    card.style.cssText = `--t:var(--sim-series-${item.tone});--ek-i:${i}`;
    const name = el('div', 'ek-pname', item.name);
    const list = el('ul', 'ek-facts');
    item.card.forEach((line, n) => list.appendChild(el('li', !wide && n >= 2 ? 'ek-tall' : '', line)));
    if (wide) {
      const headRow = el('div', 'ek-whead');
      headRow.innerHTML = characterSvg(item.art, item.tone);
      add(headRow, name);
      add(card, headRow, list);
    } else {
      card.innerHTML = characterSvg(item.art, item.tone);
      add(card, name, list);
    }
    const route = res?.routes[i];
    if (route) {
      const ok = route.status === 'ok';
      card.classList.add(ok ? 'ek-ok' : 'ek-bad');
      const mark = el('span', 'ek-mark', ok ? '✓' : '✗');
      mark.setAttribute('aria-label', ok ? 'route works' : 'route broken');
      card.appendChild(mark);
    }
    if (this.note && this.cite === i) card.classList.add('ek-cite');
    return card;
  }

  _cards(res) {
    const wide = this.cfg.cardStyle === 'wide';
    const cards = el('div', `ek-cards${wide ? ' ek-wide' : ''}`);
    cards.style.cssText = `--cols:${this.cfg.cols || this.cfg.items.length};--pcols:${this.cfg.portraitCols || 3}`;
    cards.setAttribute('aria-label', 'Evidence cards');
    this.cfg.items.forEach((_, i) => cards.appendChild(this._card(i, res, wide)));
    return cards;
  }

  // The pinned bar for the evidence the key is built from. Open: just the toggle
  // (the full cards sit at the top of the scrolling key, see _treeEl). Folded:
  // one chip per creature (name, and the route mark after a run); a chip peeks
  // at its card over the key without moving anything.
  _evidence(res) {
    const open = this._showCards();
    const box = el('div', 'ek-evid');
    const bar = el('div', 'ek-evbar');
    const toggle = this._btn(open ? '▾ Evidence cards' : '▸ Evidence cards', 'ek-evtoggle', () => {
      const next = !this._showCards();
      if (this._locked()) this.lockedOpen = next; else this.cardsOpen = next;
      this.scrollMode = next ? 'top' : null;
      this.peek = null;
      this.focusKey = 'evid';
      this._render();
    }, 'evid', open ? 'Hide the evidence cards' : 'Show the evidence cards');
    toggle.setAttribute('aria-expanded', String(open));
    bar.appendChild(toggle);
    if (!open) {
      this.cfg.items.forEach((item, i) => {
        const chip = this._btn('', 'ek-echip', () => {
          this.peek = this.peek === i ? null : i;
          this.focusKey = `e-${i}`;
          this._render();
        }, `e-${i}`, `${item.name}: show its evidence card`);
        chip.style.cssText = `--t:var(--sim-series-${item.tone})`;
        chip.setAttribute('aria-expanded', String(this.peek === i));
        if (this.note && this.cite === i) chip.classList.add('ek-cite');
        chip.innerHTML = characterSvg(item.art, item.tone);
        chip.appendChild(el('span', '', item.name));
        const route = res?.routes[i];
        if (route) {
          const ok = route.status === 'ok';
          chip.classList.add(ok ? 'ek-ok' : 'ek-bad');
          const tick = el('span', 'ek-tick', ok ? '✓' : '✗');
          tick.setAttribute('aria-label', ok ? 'route works' : 'route broken');
          chip.appendChild(tick);
        }
        bar.appendChild(chip);
      });
    }
    box.appendChild(bar);
    if (!open && this.peek !== null) {
      const wide = this.cfg.cardStyle === 'wide';
      const peek = el('div', `ek-peek${wide ? ' ek-wide' : ''}`);
      peek.setAttribute('role', 'group');
      peek.setAttribute('aria-label', `${this.cfg.items[this.peek].name} evidence card`);
      const close = this._btn('×', 'ek-peekx', () => { const i = this.peek; this.peek = null; this.focusKey = `e-${i}`; this._render(); }, null, 'Close the evidence card');
      add(peek, this._card(this.peek, res, wide), close);
      box.appendChild(peek);
    }
    return box;
  }

  _treeEl(tree, res) {
    const box = el('div', 'ek-tree ek-scroll');
    if (this._showCards()) box.appendChild(this._cards(res));
    const key = el('div', 'ek-key');
    key.setAttribute('aria-label', 'Your key');
    key.appendChild(this._podEl(tree, null, { n: 0 }, res));
    box.appendChild(key);
    return box;
  }

  _podEl(pod, ansLabel, order, res) {
    const locked = this._locked();
    const open = !locked && this._isOpen(pod);
    const active = !locked && pod.id === this.activeId;
    const wrap = el('div', `ek-pod${open ? ' ek-open' : ''}${active ? ' ek-active' : ''}${this.fresh.has(pod.id) ? ' ek-new' : ''}`);
    const card = el('div', 'ek-card');
    const row = el('div', 'ek-row');
    if (ansLabel) row.appendChild(el('span', 'ek-ans', ansLabel));
    const avs = el('span', 'ek-avs');
    avs.setAttribute('role', 'group');
    avs.setAttribute('aria-label', pod.members.map(i => this.cfg.items[i].name).join(', '));
    avs.innerHTML = pod.members.map(i => characterSvg(this.cfg.items[i].art, this.cfg.items[i].tone)).join('');
    row.appendChild(avs);
    const single = pod.members.length === 1 ? this.cfg.items[pod.members[0]] : null;
    if (single) row.appendChild(el('span', 'ek-nm', single.name));
    else if (!ansLabel) row.appendChild(el('span', 'ek-nm', 'Everyone'));
    pod.checks.forEach(([t, a]) => {
      const test = this.cfg.tests[t];
      row.appendChild(el('span', 'ek-chk', `${test.ask} ${test.answers.find(([k]) => k === a)?.[1] || a}`));
    });

    if (pod.test) {
      const ask = this.cfg.tests[pod.test].ask;
      // The question tag and its undo button wrap together, never apart.
      const group = add(el('span', 'ek-qg'), el('span', 'ek-q', ask));
      if (!locked) group.appendChild(this._btn('↺', 'ek-mini', () => this._reopen(pod.id), `re-${pod.id}`, `Undo the question "${ask}" and everything below it`));
      row.appendChild(group);
    } else if (pod.stamp) {
      const badge = this._btn(pod.stamp, 'ek-badge', () => this._reopen(pod.id), `re-${pod.id}`,
        `${pod.members.map(i => this.cfg.items[i].name).join(' and ')} named ${pod.stamp}.${locked ? '' : ' Tap to rename.'}`);
      badge.disabled = locked;
      const tone = single ? single.tone : null;
      badge.style.cssText = `--t:${tone ? `var(--sim-series-${tone})` : 'var(--sim-accent)'};--ek-i:${order.n++}`;
      if (res) {
        const ok = pod.members.every(i => res.routes[i].status === 'ok');
        badge.classList.add(ok ? 'ek-ok' : 'ek-bad');
        badge.textContent = `${ok ? '✓' : '✗'} ${pod.stamp}`;
      }
      row.appendChild(badge);
    } else if (!locked && !active) {
      row.appendChild(this._btn(single ? `Name its ${this.cfg.noun}` : 'Sort this group', 'ek-ask', () => this._activate(pod.id), `go-${pod.id}`));
    } else if (!locked) {
      row.appendChild(el('span', 'ek-hint', 'Your turn'));
    } else {
      row.appendChild(el('span', 'ek-hint', 'Not sorted yet'));
    }
    if (res && !pod.test && !pod.stamp) card.classList.add('ek-bad');
    card.appendChild(row);
    if (active && open) card.appendChild(this._picker(pod));
    wrap.appendChild(card);

    if (pod.kids) {
      const kids = el('div', 'ek-kids');
      pod.kids.forEach(k => {
        const label = this.cfg.tests[pod.test].answers.find(([key]) => key === k.ans)?.[1] || k.ans;
        const kid = el('div', 'ek-kid');
        kid.appendChild(this._podEl(k.pod, label, order, res));
        kids.appendChild(kid);
      });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  _picker(pod) {
    const box = el('div', 'ek-picker');
    const single = pod.members.length === 1 ? this.cfg.items[pod.members[0]] : null;
    const canSplit = !single || Boolean(this.cfg.requires);
    const canName = single || this.cfg.nameMixed;
    const prompt = el('div', `ek-prompt${this.note ? ' ek-warn' : ''}`);
    prompt.setAttribute('role', 'status');
    prompt.setAttribute('aria-live', 'polite');
    prompt.textContent = this.note || (single
      ? (canSplit ? `Which ${this.cfg.noun} does the ${single.name} belong to? Back it up with a question first if you like.` : `Which ${this.cfg.noun} does the ${single.name} belong to?`)
      : this.cfg.nameMixed ? 'Ask a question that splits this group - or name it if they all belong together.' : 'Pick a question that splits this group apart.');
    box.appendChild(prompt);
    if (canSplit) {
      const chips = el('div', 'ek-chips');
      const asked = this._askedAbove(pod.id);
      Object.keys(this.cfg.tests).forEach((key, n) => {
        const test = this.cfg.tests[key];
        const b = this._btn(test.ask, 'ek-chipbtn', () => this._split(pod.id, key), n === 0 ? 'picker' : `t-${key}`,
          asked.has(key) ? `${test.ask} (already asked above)` : test.ask);
        if (asked.has(key)) b.classList.add('ek-used');
        if (this.note && this.noteKey === key) { b.classList.add('ek-wobble'); b.dataset.focus = `t-${key}`; }
        chips.appendChild(b);
      });
      box.appendChild(chips);
    }
    if (canName) {
      if (canSplit) box.appendChild(el('div', 'ek-or', `Or name the whole group as a ${this.cfg.noun}:`));
      const chips = el('div', 'ek-chips ek-g');
      this.cfg.groups.forEach((g, n) => chips.appendChild(this._btn(g, 'ek-chipbtn', () => this._stamp(pod.id, g), canSplit ? `k-${g}` : (n === 0 ? 'picker' : `k-${g}`))));
      box.appendChild(chips);
    }
    return box;
  }

  _foot(res) {
    const foot = el('div', 'ek-foot');
    const text = this.cfg.text || {};
    const total = this.cfg.items.length;
    if (this._locked()) {
      const verdict = el('div', 'ek-verdict ek-lose');
      const msg = el('div', 'ek-vmsg');
      msg.appendChild(el('div', 'ek-vhead', `${res.passed} of ${total} routes work in this draft`));
      msg.appendChild(el('div', 'ek-vtext', this._verdictText(res)));
      if (text.draftLead) msg.appendChild(el('div', 'ek-hint', text.draftLead));
      verdict.appendChild(msg);
      foot.appendChild(verdict);
      return foot;
    }
    if (this.stepIndex === 0) {
      if (!this._firstOpen(this.tree)) foot.appendChild(el('div', 'ek-hint', text.built || 'Every branch is named. Move on to test your key.'));
      return foot;
    }
    const verdict = el('div', `ek-verdict${res ? (res.solved ? ' ek-win' : ' ek-lose') : ''}`);
    verdict.setAttribute('role', 'status');
    verdict.setAttribute('aria-live', 'polite');
    const msg = el('div', 'ek-vmsg');
    if (!res) {
      msg.appendChild(el('div', 'ek-vtext', text.ready || `Ready? Send all ${total} down your key and see where each one lands.`));
    } else if (res.solved) {
      msg.appendChild(el('div', 'ek-vhead', `Your key works! ${total} of ${total}`));
      msg.appendChild(el('div', 'ek-vtext', text.solved || 'Every one followed its own evidence to the right group.'));
      const bonus = this.cfg.bonus;
      if (bonus) {
        const fast = res.deepest <= bonus.depth;
        const stars = el('div', 'ek-stars');
        add(stars, el('span', 'ek-star', '★'), el('span', `ek-star${fast ? '' : ' ek-off'}`, fast ? '★' : '☆'));
        stars.appendChild(el('span', '', fast ? bonus.textOn : bonus.textOff));
        msg.appendChild(stars);
      }
      solvedFind(this, verdict);
    } else {
      msg.appendChild(el('div', 'ek-vhead', `${res.passed} of ${total} routes work`));
      msg.appendChild(el('div', 'ek-vtext', this._verdictText(res)));
    }
    verdict.appendChild(msg);
    verdict.appendChild(this._btn(!res ? 'Run all ▶' : res.solved ? 'Replay ▶' : 'Run again ▶', 'ek-btn ek-run', () => this._run(), 'run'));
    foot.appendChild(verdict);
    return foot;
  }

  _fit() { fitFrame(this); }

  // The base swaps in the static portrait/landscape height on an orientation
  // flip; re-measure right after so content is never clipped or padded.
  _reconcileOrientation(hostWidth) {
    super._reconcileOrientation(hostWidth);
    this._fit();
  }

  destroy() {
    this.board = null;
    super.destroy();
  }
}
