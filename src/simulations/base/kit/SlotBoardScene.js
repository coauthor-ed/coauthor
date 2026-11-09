import { DomSimulation } from 'simulations/base/DomSimulation.js';
import { characterSvg, CHARACTER_CSS } from './KeyCharacters.js';
import { KEY_CSS, fitFrame, settleScroll, solvedFind } from './KeyBuilderScene.js';

// "Fill the slots" - the shared engine behind every chain / repair challenge in
// this course (the sibling of KeyBuilderScene, which grows a key). The learner
// works on evidence CARDS. Each card has ROWS, each row has SLOTS. Tap a slot,
// pick a chunky chip; Check stamps every card and names the FIRST problem in
// plain words. A concrete scene is a thin subclass that only sets `static CONFIG`
// plus its measured design size.
//
// CONFIG:
//   ariaLabel, titles: [beat-0 title, beat-1 title, ...]
//   lockFirstBeat: true shows the board read-only on the first beat (evidence preview)
//   noPips: true hides the filled-in counter (for repair boards that start full)
//   checkFrom: first beat on which Check works (default 0)
//   text: { locked, ready, solved } - each a string, or an array with one entry per beat
//   sections: [{ id, title?, minBeat?, cards: [card] }]
// card: { id, name, sub?, hint?, art?, tone, arts?: [{art, tone}], facts?: [string],
//         claim?: string, minBeat?, preview?: (get) => html, rows: [row] }
// row:  { id, label?, inline?, depth?, showIf?: (get) => bool,
//         lead?: [{ text, kind }], join?: '->' (arrow between slots), slots: [slot] }
// slot: { id, fixed?: string }  (a static chip)  or
//       { id, ask?, prompt?, art?, tone?, bank?, options: [[id, label, sub?]],
//         initial?: id | [ids], cite?: [factIndex],
//         answer: id | [ids]                       (single choice)
//         multi: true, required?: [ids], anyOf?: [ids], forbidden?: [ids]   (set)
//         why?: { id: text } | (id, labelText) => text   (reason a wrong pick is wrong)
//         empty?, missing?: { id: text }, needAny?, wrong? }
// Slot keys are `${card.id}/${slot.id}` - unique per board; `get(key)` reads a value.
const BEAT_MAX = 8;

export const SLOT_CSS = `
.sb-cards { display:flex; flex-direction:column; gap:var(--sim-space-3); }
.sb-sect { display:flex; flex-direction:column; gap:var(--sim-space-2); }
.sb-sect-title { font-size:var(--sim-text-md); font-weight:800; color:var(--sim-label-muted); }
.sb-card { position:relative; display:flex; flex-direction:column; gap:var(--sim-space-2); padding:var(--sim-space-2) var(--sim-space-3) var(--sim-space-3); border: calc(2px * var(--look-rim)) solid var(--t, var(--sim-stroke)); border-radius:var(--sim-radius-lg); background:var(--sim-bg-surface); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--t, var(--sim-stroke)); }
.sb-card.sb-ok { border-color:var(--sim-success); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-success); }
.sb-card.sb-bad { border-color:var(--sim-error); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-error); }
.sb-chead { display:flex; align-items:center; gap:var(--sim-space-2); }
.sb-chead .ek-av { width:44px; height:44px; }
.sb-avs { display:flex; gap:2px; }
.sb-name { font-size:var(--sim-text-lg); font-weight:800; line-height:1.15; }
.sb-sub { font-size:var(--sim-text-sm); font-weight:700; color:var(--sim-label-muted); }
.sb-facts { display:flex; flex-wrap:wrap; gap:var(--sim-space-1); margin:0; padding:0; list-style:none; }
.sb-facts li { padding:2px var(--sim-space-2); border-radius:var(--sim-radius-pill); background:var(--sim-bg-cell); font-size:var(--sim-text-sm); line-height:1.3; }
.sb-facts li.sb-cited { outline:2px solid var(--sim-error); outline-offset:1px; }
.sb-claim { padding:var(--sim-space-2) var(--sim-space-2); border: calc(2px * var(--look-rim)) dashed var(--sim-warning); border-radius:var(--sim-radius-md); font-weight:700; }
.sb-claim b { color:var(--sim-warning); }
.sb-row { display:flex; flex-direction:column; gap:var(--sim-space-1); padding-top:8px; border-top:2px dashed var(--sim-stroke); }
.sb-row.sb-inline { flex-direction:row; align-items:flex-start; gap:var(--sim-space-2); padding-top:6px; border-top:none; margin-left:calc(var(--d, 0) * 10px); }
.sb-row.sb-inline .sb-rlabel { flex:none; width:44px; padding-top:9px; font-size:var(--sim-text-sm); }
.sb-row.sb-inline .sb-rbody { flex:1 1 0; min-width:0; }
.sb-rbody { display:flex; flex-direction:column; gap:var(--sim-space-1); }
.sb-rlabel { font-size:var(--sim-text-sm); font-weight:800; color:var(--sim-label-muted); }
.sb-chain { display:flex; flex-wrap:wrap; align-items:center; gap:var(--sim-space-2) var(--sim-space-2); }
.sb-step { display:inline-flex; align-items:center; gap:var(--sim-space-1); max-width:100%; }
.sb-arrow { flex:none; font-size:var(--sim-text-md); margin:0 -1px; font-weight:800; color:var(--sim-accent); }
.sb-slot, .sb-fixed, .sb-lead { display:inline-flex; align-items:center; gap:var(--sim-space-2); min-height:38px; max-width:100%; padding:var(--sim-space-1) var(--sim-space-3); border-radius:var(--sim-radius-md); font-weight:800; text-align:left; line-height:1.2; overflow-wrap:anywhere; }
.sb-fixed, .sb-lead { min-height:34px; padding:var(--sim-space-1) var(--sim-space-2); font-size:var(--sim-text-sm); border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background:var(--sim-bg-deep); color:var(--sim-label-muted); }
.sb-lead.sb-threat { border-color:var(--sim-warning); color:var(--sim-warning); }
.sb-slot { border: calc(2px * var(--look-rim)) dashed var(--sim-accent); background:transparent; }
.sb-slot.sb-filled { border: calc(2px * var(--look-rim)) solid var(--sim-stroke); background:var(--sim-bg-cell); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-stroke); }
.sb-slot.sb-on { border-style:solid; border-color:var(--sim-accent); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-accent); }
.sb-slot.sb-ok { border-style:solid; border-color:var(--sim-success); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-success); }
.sb-slot.sb-empty { border-style:dashed; border-color:var(--sim-warning); }
.sb-slot.sb-bad { border-style:solid; border-color:var(--sim-error); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-error); }
.sb-slot:disabled { cursor:default; opacity:.7; }
.sb-slot .ek-av { width:24px; height:24px; }
.sb-ph { color:var(--sim-label-muted); font-weight:700; }
.sb-sub2 { display:block; font-size:var(--sim-text-sm); font-weight:700; color:var(--sim-label-muted); }
.sb-msg { padding:var(--sim-space-1) var(--sim-space-2); border-left:4px solid var(--sim-error); border-radius:var(--sim-radius-sm); background:var(--sim-bg-deep); font-size:var(--sim-text-sm); font-weight:700; }
.sb-preview { padding:var(--sim-space-2) var(--sim-space-2); border-radius:var(--sim-radius-md); background:var(--sim-bg-deep); font-size:var(--sim-text-lg); text-align:center; }
.sb-it { font-style:italic; }
.sb-ul { text-decoration:underline; text-underline-offset:3px; }
.sb-ul-join { text-decoration:underline; text-underline-offset:3px; }
.sb-chips { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--sim-space-2); }
.sb-chips .ek-chipbtn { text-align:center; }
.sb-chips.sb-two { grid-template-columns:repeat(2,minmax(0,1fr)); }
.sb-chips .ek-chipbtn[aria-pressed="true"] { border-color:var(--sim-accent); background:var(--sim-accent); color:var(--sim-bg-deep); box-shadow:0 calc(3px * var(--look-lip)) 0 var(--sim-accent); }
.sb-chips .ek-chipbtn[aria-pressed="true"]::before { content:'\\2713 '; }
.sb-picker { margin-top:2px; }
.sb-locknote { color:var(--sim-label-muted); font-size:var(--sim-text-sm); font-weight:700; }
.sb-sect[hidden] { display:none !important; }
.sim-dom-root--portrait .sb-chips { grid-template-columns:repeat(2,minmax(0,1fr)); }
.sim-dom-root--portrait .sb-row.sb-inline .sb-rlabel { width:54px; }
`;

function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function add(parent, ...children) { children.forEach(child => parent.appendChild(child)); return parent; }
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc as escapeHtml };

export class SlotBoardScene extends DomSimulation {
  // Landscape is a fixed frame (see fitFrame in KeyBuilderScene): header and
  // footer pinned, the cards scroll. PORTRAIT_HEIGHT is only the first-paint hint.
  static WIDTH = 620;
  static HEIGHT = 520;
  static PORTRAIT_WIDTH = 380;
  static PORTRAIT_HEIGHT = 1340;
  static CONTROLS = [];
  // Board text sits at the 14px floor at 1x, so a side panel needs >= 1.05x,
  // otherwise the board goes below the text at full width.
  static MIN_SCALE = 1.05;
  // Uses spare viewport height in a side panel (the frame grows past HEIGHT).
  static FILL_HEIGHT = true;
  static CONFIG = null;

  constructor(container, config) {
    super(container, config);
    this.cfg = this.constructor.CONFIG;
    this.stepIndex = 0;
    this.cardList = this.cfg.sections.flatMap(s => s.cards.map(c => ({ card: c, section: s, minBeat: c.minBeat ?? s.minBeat ?? 0 })));
    this.get = (key) => this.vals[key];
    this.vals = this._initial();
    this.active = null;
    this.history = [];
    this.result = null;
    this.animate = false;
    this.focusKey = null;
    this.scrollMode = null;
  }

  async setup() {
    await super.setup();
    this.root.classList.add('ek-root');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', this.cfg.ariaLabel);
    this.injectStyle(CHARACTER_CSS + KEY_CSS + SLOT_CSS);
    this.board = el('div', 'ek-board');
    this.root.appendChild(this.board);
    this._render();
  }

  onBeatChange(beatIndex) {
    const index = Number.isFinite(beatIndex) ? Math.trunc(beatIndex) : 0;
    this.stepIndex = Math.max(0, Math.min(index, BEAT_MAX));
    this.active = null;
    // Coming back to an earlier beat keeps the learner's work, not the old verdict.
    this.result = null;
    this._render();
    this.requestUiUpdate?.();
  }

  // ---- model ---------------------------------------------------------------
  _key(card, slot) { return `${card.id}/${slot.id}`; }
  _slots(card) {
    return card.rows.flatMap(row => row.slots.filter(s => !s.fixed).map(slot => ({ row, slot, key: this._key(card, slot) })));
  }
  _initial() {
    const vals = {};
    for (const { card } of this.cardList) {
      for (const { slot, key } of this._slots(card)) vals[key] = slot.initial ?? (slot.multi ? [] : null);
    }
    return vals;
  }
  _locked() { return Boolean(this.cfg.lockFirstBeat && this.stepIndex === 0); }
  _visibleCards() { return this.cardList.filter(c => this.stepIndex >= c.minBeat); }
  _rowShown(row) { return !row.showIf || row.showIf(this.get); }
  _live(card) { return this._slots(card).filter(({ row }) => this._rowShown(row)); }
  _filled(card) {
    return this._live(card).every(({ slot, key }) => (slot.multi ? this.vals[key].length > 0 : this.vals[key] != null));
  }
  _label(slot, id) { return slot.options.find(o => o[0] === id)?.[1] ?? id; }
  _pick(value) { return Array.isArray(value) ? value : (value == null ? [] : [value]); }

  _snapshot() { return JSON.parse(JSON.stringify({ vals: this.vals, active: this.active })); }
  _change(fn) {
    this.history.push(this._snapshot());
    this.result = null;
    this.scrollMode = 'reveal';
    fn();
    this._render();
  }
  _undo() {
    const snap = this.history.pop();
    if (!snap) return;
    Object.assign(this, snap);
    this.result = null;
    this.scrollMode = 'reveal';
    this.focusKey = 'undo';
    this._render();
  }
  _startOver() {
    this._change(() => { this.vals = this._initial(); this.active = null; });
    this.focusKey = 'reset';
    this._render();
  }
  _open(key) {
    this.active = this.active === key ? null : key;
    this.scrollMode = 'reveal';
    this.focusKey = this.active ? 'picker' : `s-${key}`;
    this._render();
  }
  _next(card, fromKey) {
    const live = this._live(card);
    const at = live.findIndex(s => s.key === fromKey);
    const after = [...live.slice(at + 1), ...live.slice(0, at)];
    return after.find(({ slot, key }) => !slot.multi && this.vals[key] == null)?.key ?? null;
  }
  _choose(card, slot, key, id) {
    this._change(() => {
      if (slot.multi) {
        const set = new Set(this.vals[key]);
        if (set.has(id)) set.delete(id); else set.add(id);
        this.vals[key] = slot.options.map(o => o[0]).filter(k => set.has(k));
        this.focusKey = 'picker';
        return;
      }
      this.vals[key] = id;
      this.active = this._next(card, key);
      this.focusKey = this.active ? 'picker' : `s-${key}`;
    });
  }

  /** Pure check of one slot: { ok, msg?, cite? }. */
  _evalSlot(card, slot, key) {
    const value = this.vals[key];
    const label = (id) => this._label(slot, id);
    const why = (id) => (typeof slot.why === 'function' ? slot.why(id, label(id)) : slot.why?.[id]);
    const bad = (msg) => ({ ok: false, msg, cite: slot.cite });
    if (slot.multi) {
      for (const id of value) if (slot.forbidden?.includes(id)) return bad(why(id) || `"${label(id)}" does not fit this evidence.`);
      if (!value.length) return { ...bad(slot.empty || 'Pick at least one.'), empty: true };
      for (const id of slot.required || []) if (!value.includes(id)) return bad(slot.missing?.[id] || `Still missing: ${label(id)}.`);
      if (slot.anyOf && !slot.anyOf.some(id => value.includes(id))) return bad(slot.needAny || 'Pick at least one that answers the threat.');
      return { ok: true };
    }
    if (value == null) return { ...bad(slot.empty || 'One slot is still empty - tap it and pick.'), empty: true };
    if ([].concat(slot.answer).includes(value)) return { ok: true };
    return bad(why(value) || slot.wrong || `"${label(value)}" does not match the evidence.`);
  }

  evaluate() {
    const cards = this._visibleCards().map(({ card }) => {
      const slots = {};
      let first = null;
      for (const { slot, key } of this._live(card)) {
        const r = this._evalSlot(card, slot, key);
        slots[key] = r;
        if (!r.ok && (!first || (first.empty && !r.empty))) first = { ...r, key };
      }
      return { id: card.id, ok: !first, slots, first };
    });
    const passed = cards.filter(c => c.ok).length;
    return { cards, passed, solved: passed === cards.length };
  }

  _run() {
    this.result = this.evaluate();
    this.animate = true;
    this.active = null;
    this.focusKey = 'run';
    this._render();
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
  _text(name) {
    const t = (this.cfg.text || {})[name];
    return Array.isArray(t) ? t[Math.min(this.stepIndex, t.length - 1)] : t;
  }

  _render() {
    if (!this.board || !this.root) return;
    const animate = this.animate;
    this.animate = false;
    this.root.dataset.step = String(this.stepIndex);
    this.root.classList.toggle('ek-anim', animate);
    const keptScroll = this.board.querySelector('.ek-scroll')?.scrollTop ?? 0;
    this.board.textContent = '';
    add(this.board, this._head(), this._sections(), this._foot());
    this._fit();
    const key = this.focusKey;
    this.focusKey = null;
    if (key) this.board.querySelector(`[data-focus="${key}"]`)?.focus({ preventScroll: true });
    const mode = this.scrollMode;
    this.scrollMode = null;
    settleScroll(this, this.board.querySelector('.ek-scroll'), keptScroll, mode, ['.sb-slot.sb-on', '.sb-picker']);
  }

  _head() {
    const head = el('div', 'ek-head');
    const titles = this.cfg.titles || ['Fill the slots'];
    head.appendChild(el('div', 'ek-title', titles[Math.min(this.stepIndex, titles.length - 1)]));
    const right = el('div', 'ek-headr');
    const cards = this._visibleCards();
    if (cards.length > 1 && !this.cfg.noPips) {
      const pips = el('div', 'ek-pips');
      const done = cards.filter(({ card }) => this._filled(card)).length;
      pips.setAttribute('aria-label', `${done} of ${cards.length} filled in`);
      cards.forEach(({ card }) => {
        const pip = el('span', 'ek-pip');
        pip.style.cssText = `--t:var(--sim-series-${card.tone})`;
        if (this._filled(card)) pip.classList.add('ek-on');
        pips.appendChild(pip);
      });
      pips.appendChild(el('b', '', `${done}/${cards.length}`));
      right.appendChild(pips);
    }
    if (!this._locked()) {
      const tools = el('div', 'ek-tools');
      const undo = this._btn('↶', 'ek-mini', () => this._undo(), 'undo', 'Undo the last pick');
      undo.title = 'Undo';
      undo.disabled = this.history.length === 0;
      const reset = this._btn('⟲', 'ek-mini', () => this._startOver(), 'reset', 'Back to the start');
      reset.title = 'Back to the start';
      right.appendChild(add(tools, undo, reset));
    }
    head.appendChild(right);
    return head;
  }

  _sections() {
    const wrap = el('div', 'sb-cards ek-scroll');
    const res = this.result;
    let order = 0;
    for (const section of this.cfg.sections) {
      const cards = this._visibleCards().filter(c => c.section === section);
      if (!cards.length) continue;
      const box = el('div', 'sb-sect');
      if (section.title) box.appendChild(el('div', 'sb-sect-title', section.title));
      for (const { card } of cards) box.appendChild(this._card(card, res?.cards.find(c => c.id === card.id), order++));
      wrap.appendChild(box);
    }
    return wrap;
  }

  _card(card, res, index) {
    const locked = this._locked();
    const box = el('div', `sb-card${res ? (res.ok ? ' sb-ok' : ' sb-bad') : ''}`);
    box.style.cssText = `--t:var(--sim-series-${card.tone});--ek-i:${index}`;
    const head = el('div', 'sb-chead');
    if (card.art || card.arts) {
      const avs = el('span', 'sb-avs');
      avs.innerHTML = (card.arts || [{ art: card.art, tone: card.tone }]).map(a => characterSvg(a.art, a.tone)).join('');
      head.appendChild(avs);
    }
    const who = el('div', '');
    who.appendChild(el('div', 'sb-name', card.name));
    if (card.sub) who.appendChild(el('div', 'sb-sub', card.sub));
    head.appendChild(who);
    box.appendChild(head);
    if (res) {
      const mark = el('span', 'ek-mark', res.ok ? '✓' : '✗');
      mark.setAttribute('aria-label', res.ok ? 'card works' : 'card needs a fix');
      box.appendChild(mark);
    }
    if (card.hint) box.appendChild(el('div', 'ek-hint', card.hint));
    if (card.claim) {
      const claim = el('div', 'sb-claim');
      claim.innerHTML = `<b>The claim:</b> ${esc(card.claim)}`;
      box.appendChild(claim);
    }
    if (card.facts?.length) {
      const cited = new Set();
      if (res) Object.values(res.slots).forEach(r => { if (!r.ok && !r.empty) (r.cite || []).forEach(i => cited.add(i)); });
      const facts = el('ul', 'sb-facts');
      facts.setAttribute('aria-label', `${card.name}: evidence`);
      card.facts.forEach((f, i) => facts.appendChild(el('li', cited.has(i) ? 'sb-cited' : '', f)));
      box.appendChild(facts);
    }
    for (const row of card.rows) if (this._rowShown(row)) box.appendChild(this._row(card, row, res, locked));
    if (card.preview) {
      const pv = el('div', 'sb-preview');
      pv.setAttribute('aria-label', 'How the name will look');
      pv.innerHTML = card.preview(this.get);
      box.appendChild(pv);
    }
    return box;
  }

  _row(card, row, res, locked) {
    const wrap = el('div', `sb-row${row.inline ? ' sb-inline' : ''}`);
    if (row.depth != null) wrap.style.cssText = `--d:${row.depth}`;
    if (row.label) wrap.appendChild(el('div', 'sb-rlabel', row.label));
    const body = el('div', 'sb-rbody');
    const chain = el('div', 'sb-chain');
    const problems = [];
    // An arrow travels with the item after it, so a wrapped line never ends on one.
    const step = (node, arrow) => {
      const wrapStep = el('span', 'sb-step');
      if (arrow) wrapStep.appendChild(el('span', 'sb-arrow', arrow));
      wrapStep.appendChild(node);
      chain.appendChild(wrapStep);
    };
    (row.lead || []).forEach((l, n) => step(el('span', `sb-lead${l.kind === 'threat' ? ' sb-threat' : ''}`, l.text), n ? '→' : ''));
    row.slots.forEach((slot, n) => {
      const arrow = row.join && (n > 0 || row.lead?.length) ? row.join : (n === 0 && row.lead?.length ? '→' : '');
      if (slot.fixed) { step(el('span', 'sb-fixed', slot.fixed), arrow); return; }
      const key = this._key(card, slot);
      const r = res?.slots[key];
      if (r && !r.ok && !r.empty) problems.push(r.msg);
      step(this._slotBtn(card, slot, key, r, locked), arrow);
    });
    body.appendChild(chain);
    const openSlot = row.slots.find(s => !s.fixed && this.active === this._key(card, s));
    if (openSlot && !locked) body.appendChild(this._picker(card, openSlot, this._key(card, openSlot)));
    if (problems.length) {
      const msg = el('div', 'sb-msg', problems[0]);
      msg.setAttribute('role', 'status');
      body.appendChild(msg);
    }
    wrap.appendChild(body);
    return wrap;
  }

  _slotBtn(card, slot, key, r, locked) {
    const value = this.vals[key];
    const has = slot.multi ? value.length > 0 : value != null;
    const cls = `sb-slot${has ? ' sb-filled' : ''}${this.active === key ? ' sb-on' : ''}${r ? (r.ok ? ' sb-ok' : r.empty ? ' sb-empty' : ' sb-bad') : ''}`;
    const text = has ? this._pick(value).map(id => this._label(slot, id)).join(' + ') : null;
    const b = this._btn('', cls, () => this._open(key), `s-${key}`,
      `${slot.aria || slot.ask || 'Slot'}: ${text || 'empty'}${locked ? '' : '. Tap to change.'}`);
    if (slot.art) b.innerHTML = characterSvg(slot.art, slot.tone || 1);
    const label = el('span', has ? '' : 'sb-ph', text || slot.ask || (slot.multi ? 'Choose all that fit' : 'Pick one'));
    b.appendChild(label);
    if (r && !r.empty) label.textContent = `${r.ok ? '✓' : '✗'} ${label.textContent}`;
    if (has && slot.ask && slot.ask.length > 1 && !slot.art) {
      const ask = el('span', 'sb-sub2', slot.ask);
      label.appendChild(ask);
    }
    b.disabled = locked;
    return b;
  }

  _picker(card, slot, key) {
    const box = el('div', 'ek-picker sb-picker');
    const prompt = el('div', 'ek-prompt', slot.prompt || (slot.multi ? 'Tap every one that fits.' : 'Pick one.'));
    prompt.setAttribute('role', 'status');
    box.appendChild(prompt);
    const chips = el('div', `sb-chips${slot.options.length % 2 === 0 && slot.options.length <= 4 ? ' sb-two' : ''}`);
    slot.options.forEach(([id, label, sub], n) => {
      const chosen = slot.multi ? this.vals[key].includes(id) : this.vals[key] === id;
      const b = this._btn(label, 'ek-chipbtn', () => this._choose(card, slot, key, id), n === 0 ? 'picker' : null);
      if (slot.multi) b.setAttribute('aria-pressed', String(chosen));
      else if (chosen) b.classList.add('ek-used');
      if (slot.bank && !chosen) {
        const taken = this._slots(card).some(s => s.key !== key && s.slot.bank === slot.bank && this.vals[s.key] === id);
        if (taken) b.classList.add('ek-used');
      }
      if (sub) b.appendChild(el('span', 'sb-sub2', sub));
      chips.appendChild(b);
    });
    box.appendChild(chips);
    return box;
  }

  _firstProblem(res, withName = true) {
    for (const c of res.cards) {
      if (c.first) {
        const card = this.cardList.find(x => x.card.id === c.id).card;
        return withName ? `${card.name}: ${c.first.msg}` : c.first.msg;
      }
    }
    return '';
  }

  _foot() {
    const foot = el('div', 'ek-foot');
    if (this._locked()) {
      const hint = this._text('locked');
      if (hint) foot.appendChild(el('div', 'ek-hint', hint));
      return foot;
    }
    if (this.stepIndex < (this.cfg.checkFrom ?? 0)) return foot;
    const res = this.result;
    const total = res ? res.cards.length : this._visibleCards().length;
    const verdict = el('div', `ek-verdict${res ? (res.solved ? ' ek-win' : ' ek-lose') : ''}`);
    verdict.setAttribute('role', 'status');
    verdict.setAttribute('aria-live', 'polite');
    const msg = el('div', 'ek-vmsg');
    if (!res) {
      msg.appendChild(el('div', 'ek-vtext', this._text('ready') || 'Filled everything in? Check it against the evidence.'));
    } else if (res.solved) {
      msg.appendChild(el('div', 'ek-vhead', this._text('solvedHead') || 'Every one holds up!'));
      msg.appendChild(el('div', 'ek-vtext', this._text('solved') || 'Each link matches the evidence.'));
      solvedFind(this, verdict);
    } else {
      msg.appendChild(el('div', 'ek-vhead', total > 1 ? `${res.passed} of ${total} work` : 'Not quite yet'));
      msg.appendChild(el('div', 'ek-vtext', this._firstProblem(res, total > 1)));
    }
    verdict.appendChild(msg);
    verdict.appendChild(this._btn(res ? 'Check again' : 'Check', 'ek-btn ek-run', () => this._run(), 'run'));
    foot.appendChild(verdict);
    return foot;
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
