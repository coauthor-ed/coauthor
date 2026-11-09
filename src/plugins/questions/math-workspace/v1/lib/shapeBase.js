import { LitElement, html, nothing } from 'lit';
import { icStar, icFlag, icBulb, icCheck } from './icons.js';
import { LookMixin } from '../../../../../core/mixins/LookMixin.js';
import { loc, rich } from './rich.js';
import { templateToPrompts } from './latexUtil.js';

/**
 * MwShapeBase - common plumbing for every shape element (mw-shape-*).
 *
 * The plugin (index.js) owns the response, the events and the rewards; a
 * shape only edits its own part and reports through `bridge`, an object the
 * plugin hands down (parent -> child call, invariant 4 respected):
 *
 *   bridge.change(partResponse, { status })     every edit/commit
 *   bridge.event(name, payload)                 math:* events (plugin adds ids, gates assess)
 *   bridge.validStep(anchorEl, { index })       XP + combo
 *   bridge.brokeStep()                          combo reset
 *   bridge.hint(level, text)                    hint ladder opened
 *   bridge.goal({ stars, hintsUsed, steps })    part completed
 *   bridge.cardUsed(cardId, fromEl)             formula card used
 *   bridge.focusField(mf)                       keypad target
 *   bridge.coach                                 true in coach mode (chips/hints open)
 *
 * Shapes implement: getPartResponse(), setPartResponse(r), resetPart(),
 * showGraded(partScore) (assess reveal), lock().
 *
 * Single-answer shapes (expression, slots, solution-set, interval) share the
 * hint ladder below: each part.hints entry gives a strategy level and, when it
 * has a template, a pattern level that writes the template into the answer
 * box. They implement partDone, hintField() and, if they key hints by slot,
 * hintFits(h) and hintKey(). With Quill in the lesson (coached), Quill says
 * the hint, so the inline hint bubble is left out.
 *
 * Look (LookMixin: this.look, host data-look): a look whose celebration is a tick
 * (plain) gets a tick for the flag, no stars and no spark burst (calm).
 */
export class MwShapeBase extends LookMixin(LitElement) {
  static properties = {
    part: { attribute: false },
    item: { attribute: false },
    mode: { type: String },
    bridge: { attribute: false },
    locked: { type: Boolean },
    graded: { attribute: false },
    coached: { type: Boolean },
  };

  constructor() {
    super();
    this.part = null;
    this.item = null;
    this.mode = 'practice';
    this.bridge = null;
    this.locked = false;
    this.graded = null;
    this.coached = false;
    this._hintsUsed = 0;
    this._singleUsed = {};
    this._singleNote = null;
  }

  get live() { return this.mode !== 'assess' && !this.locked; }
  get coach() { return this.mode === 'coach'; }
  get assess() { return this.mode === 'assess'; }
  /** The look celebrates with a tick only: no stars, no sparks, no waving flag. */
  get calm() { return this.look === 'plain'; }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._stuckTimer);
  }

  _emitChange(status) {
    this.bridge?.change?.(this.getPartResponse(), { status });
  }

  /** Bring an element fully into view above the sticky lesson footer. */
  reveal(el) {
    if (!el?.scrollIntoView) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { el.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' }); } catch { /* ignore */ }
  }

  /** Scroll the newest wrong/warn note into view (above the docked keypad). */
  revealFeedback() {
    const bs = this.shadowRoot?.querySelectorAll('.bubble.bad, .bubble.warn');
    if (bs?.length) this.reveal(bs[bs.length - 1]);
  }

  rectOf(el) {
    if (!el?.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  /** Floating "+2 XP" pill rising from an anchor inside this shape. */
  spawnXp(anchor, text = '+2 XP') {
    if (!this.live || !anchor) return;
    const layer = this.shadowRoot?.querySelector('.fx-layer');
    if (!layer) return;
    const lr = layer.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = text;
    el.style.left = `${ar.left - lr.left + ar.width / 2}px`;
    el.style.top = `${ar.top - lr.top - 6}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** Small confetti-ish burst of token-coloured squares at an anchor. */
  sparkBurst(anchor, n = 14) {
    if (!anchor || this.calm || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = this.shadowRoot?.querySelector('.fx-layer');
    if (!layer) return;
    const lr = layer.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const cx = ar.left - lr.left + ar.width / 2;
    const cy = ar.top - lr.top + ar.height / 2;
    const colors = ['var(--mw-gold-fill)', 'var(--mw-ok-fill)', 'var(--content-series-1)', 'var(--content-series-4)', 'var(--content-series-5)', 'var(--accent-coral)'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const dist = 40 + Math.random() * 46;
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.background = colors[i % colors.length];
      s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      if (i % 3 === 0) s.style.borderRadius = '50%';
      layer.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  }

  /** Restart the 40 s idle timer for math:stuck (once per step index). */
  armStuck(index, anchorFn) {
    clearTimeout(this._stuckTimer);
    if (!this.live) return;
    this._stuckSent = this._stuckSent || new Set();
    if (this._stuckSent.has(index)) return;
    const started = Date.now();
    this._stuckTimer = setTimeout(() => {
      if (!this.isConnected || !this.live) return;
      this._stuckSent.add(index);
      this.bridge?.event?.('math:stuck', { index, idleMs: Date.now() - started, rect: this.rectOf(anchorFn?.()) });
    }, MwShapeBase.stuckMs());
  }

  /** Gold "done" banner with stars, for the single-answer shapes. */
  doneTpl(stars, title = 'Solved!') {
    return html`
      <div class="done" role="status">
        <span class="flag" id="done-flag">${this.calm ? icCheck : icFlag}</span>
        <span class="done-title">${this.assess ? 'Answered' : title}</span>
        ${this.assess || this.calm ? '' : html`<span class="stars" role="img" aria-label="${stars} of 3 stars">
          ${[1, 2, 3].map((i) => html`<span class="star ${i <= stars ? 'on' : ''}">${icStar}</span>`)}
        </span>`}
      </div>`;
  }

  /** Report a finished single-answer part and burst at the flag. */
  finish(stars, steps = 1) {
    this.bridge?.goal?.({ stars, hintsUsed: this._hintsUsed, steps });
    this.updateComplete.then(() => {
      this.sparkBurst(this.shadowRoot?.querySelector('#done-flag'), 18);
      this.reveal(this.shadowRoot?.querySelector('.done'));
    });
  }

  /* ------------------------------------- single-answer hint ladder */

  get partDone() { return false; }
  hintKey() { return ''; }
  hintFits(h) { return h.step === undefined || h.step === 0; }
  /** The field a template hint writes into. */
  hintField() { return this.mf || null; }

  hintLevels() {
    const levels = [];
    const own = (Array.isArray(this.part?.hints) ? this.part.hints : []).filter((h) => h && this.hintFits(h));
    for (const h of own) {
      if (h.strategy) levels.push({ text: loc(h.strategy) });
      if (h.template) levels.push({ template: h.template, text: 'I have put a pattern in the answer box. Fill in the empty spaces, then press Enter.' });
    }
    // Older items keep a flat item-level hints list; it fits a one-part item.
    if (!levels.length && (this.item?.parts || []).length === 1) {
      for (const h of this.item?.hints || []) { const t = loc(h); if (t) levels.push({ text: t }); }
    }
    return levels;
  }

  /** Open the next level. False when there is none left. */
  openSingleHint() {
    if (!this.live || this.partDone) return false;
    const key = this.hintKey();
    const levels = this.hintLevels();
    const used = this._singleUsed[key] || 0;
    const next = levels[used];
    if (!next) return false;
    this._singleUsed = { ...this._singleUsed, [key]: used + 1 };
    this._hintsUsed++;
    this._singleNote = { key, text: next.text };
    if (next.template) {
      const mf = this.hintField();
      if (mf) {
        mf.setValueQuiet?.(templateToPrompts(next.template));
        this.updateComplete.then(() => requestAnimationFrame(() => { try { mf.focus(); } catch { /* ignore */ } }));
      }
    }
    this.bridge?.hint?.(used + 1, next.text, { last: used + 1 >= levels.length });
    this._emitChange?.(this._status?.());
    this.requestUpdate();
    return true;
  }

  /** Quill's clue chip (math:hint-request). */
  requestHint() { return this.openSingleHint(); }

  hintTpl() {
    if (!this.live || this.partDone) return nothing;
    const levels = this.hintLevels();
    if (!levels.length) return nothing;
    const key = this.hintKey();
    const used = this._singleUsed[key] || 0;
    const note = this._singleNote && this._singleNote.key === key ? this._singleNote : null;
    // With Quill in the lesson he is the one clue button (tap him or his chip).
    if (this.coached && !this._hintsUsed) return nothing;
    return html`
      <div class="tools">
        ${this.coached ? nothing : html`<button class="chip" ?disabled=${used >= levels.length} @click=${() => this.openSingleHint()}>${icBulb}<span>${used ? 'More help' : 'Hint'}</span>
          <span class="dots" aria-hidden="true">${levels.map((_l, i) => html`<span class="dot ${i < used ? 'on' : ''}"></span>`)}</span>
        </button>`}
        <span class="spacer"></span>
        ${this._hintsUsed ? html`<span class="count">Hints used: ${this._hintsUsed}</span>` : nothing}
      </div>
      ${note && !this.coached ? html`<div class="bubble hint" role="status"><span class="hint-tag">${icBulb}<strong>Hint</strong></span> ${rich(note.text, `sh-${key}-${used}`)}</div>` : nothing}`;
  }

  /** 40 s by contract; a debug override (window.__mwStuckMs) lets a test
   *  harness exercise math:stuck without waiting. */
  static stuckMs() {
    const o = Number(globalThis.__mwStuckMs);
    return Number.isFinite(o) && o > 0 ? o : 40000;
  }

  static starsFor({ hintsUsed, steps, modelLen }) {
    let s = 1;
    if (!hintsUsed) s++;
    if (!modelLen || steps <= modelLen) s++;
    return s;
  }
}
