import { html, css, nothing, svg } from 'lit';
import { MwStepChain } from './step-chain.js';
import { ChainCtl } from '../lib/chainCtl.js';
import { sidesMeet } from '../lib/chain.js';
import { icBulb } from '../lib/icons.js';

/**
 * <mw-shape-two-sided> - prove an identity by working on both sides: two
 * trails that converge on a meeting node in the middle. Fork chips and the
 * hint ladder act on the side the student last worked on (LHS by default).
 * Hints carry "side": "rhs" for the right side (no side means the left), and
 * modelSolutionRhs holds the right side's model lines. A side with no clue
 * for its next step points the student to the other side instead.
 *
 * Response: { lhs: [latex], rhs: [latex], hintsUsed } (two chains, so two
 * line lists; see the plugin report for this contract note).
 */
export class MwTwoSided extends MwStepChain {
  static styles = [...MwStepChain.styles, css`
    .sides { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
    .side-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; }
    .side-title.mirror { justify-content: flex-end; }
    .side-tag {
      font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 0.78rem; letter-spacing: 0.06em;
      padding: 3px 10px; border-radius: var(--radius-pill);
      background: var(--primary-color); color: var(--on-primary);
      box-shadow: 0 2px 0 var(--primary-hover);
    }
    .side-title .muted { font-size: 0.82rem; }
    .meet { position: relative; margin-top: 4px; }
    .meet svg.joins { display: block; width: 100%; height: 56px; overflow: visible; }
    .joins path { fill: none; stroke: var(--border-hover); stroke-width: 10; stroke-linecap: round; stroke-dasharray: 8 7; }
    .joins path.ok { stroke: var(--mw-ok-fill); stroke-dasharray: none; }
    .joins path.bad { stroke: var(--mw-bad-fill); stroke-dasharray: 3 9; }
    .meet-row { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .meet-node {
      width: 58px; height: 58px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--bg-panel-2); border: 4px solid var(--border-hover); box-shadow: 0 5px 0 var(--border-hover);
      font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 1.9rem; color: var(--text-muted);
      margin-top: -8px; z-index: 2;
    }
    .meet.reached .meet-node {
      background: var(--mw-gold-fill); border-color: var(--mw-gold-lip); box-shadow: 0 5px 0 var(--mw-gold-lip);
      color: var(--mw-on-fill); animation: mw-pop 0.6s var(--ease-spring) both;
    }
    .meet-card { padding: 10px 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 14px; border-style: dashed; background: transparent; box-shadow: none; text-align: center; }
    .meet.reached .meet-card { border-style: solid; background: color-mix(in srgb, var(--mw-gold-fill) 18%, var(--bg-surface)); border-color: var(--mw-gold-fill); box-shadow: var(--press-1) var(--mw-gold-lip); }
    .side.focus .side-tag { background: var(--mw-topic, var(--primary-color)); }
    @media (max-width: 640px) {
      .sides { grid-template-columns: minmax(0, 1fr); }
      .row.mirror { grid-template-columns: var(--mw-rail) minmax(0, 1fr); }
      .row.mirror .rail { order: 0; }
      .side-title.mirror { justify-content: flex-start; }
      .meet svg.joins { display: none; }
      .meet-row::before { content: ''; width: 10px; height: 22px; border-radius: 6px; background: var(--border-hover); margin-bottom: 0; }
      .meet.reached .meet-row::before { background: var(--mw-ok-fill); }
    }
    /* Plain look: the meeting is a quiet success, no pop, no stars. */
    :host([data-look="plain"]) .meet.reached .meet-node { background: var(--mw-ok-fill); border-color: var(--mw-ok-lip); box-shadow: none; animation: none; }
    :host([data-look="plain"]) .meet.reached .meet-card { background: color-mix(in srgb, var(--mw-ok-fill) 10%, var(--bg-surface)); border-color: var(--mw-ok-fill); box-shadow: none; }
    @media (prefers-reduced-motion: reduce) { .meet.reached .meet-node { animation: none; } }
  `];

  constructor() {
    super();
    this._active = 'lhs';
  }

  _build() {
    const max = this.part.maxSteps || 8;
    this.lhs = new ChainCtl(this, { side: 'lhs', start: this.part.lhs, startLabel: 'LHS', maxSteps: max, placeholder: '\\text{next step}' });
    this.rhs = new ChainCtl(this, { side: 'rhs', start: this.part.rhs, startLabel: 'RHS', mirror: true, maxSteps: max, placeholder: '\\text{next step}' });
    this.ctl = this.lhs;
  }

  activeChain() { return this._active === 'rhs' ? this.rhs : this.lhs; }

  _other(ctl) { return ctl?.side === 'rhs' ? this.lhs : this.rhs; }
  _sideName(ctl) { return ctl?.side === 'rhs' ? 'right' : 'left'; }
  _hasClue(ctl) { return this._hintSteps(ctl.forkIndex(), ctl.side).length > 0; }

  /** Move the student to a side: focus its next line. */
  _switchTo(ctl) {
    this._active = ctl.side;
    const d = ctl.targetLine();
    this.requestUpdate();
    if (d) this.updateComplete.then(() => requestAnimationFrame(() => { try { d.mf.focus(); } catch { /* ignore */ } }));
  }

  /** Tools-row chip when this side has no clue but the other side has one. */
  _otherSideNote(ctl) {
    const other = this._other(ctl);
    if (!other || this._hasClue(ctl) || !this._hasClue(other)) return null;
    return html`<button class="chip" @click=${() => { this._switchTo(other); this._openHint(other, other.forkIndex()); }}>${icBulb}<span>Clue: work on the ${this._sideName(other)} side</span></button>`;
  }

  requestHint() {
    if (!this.live || this._reached) return false;
    const ctl = this.activeChain();
    if (this._openHint(ctl, ctl.forkIndex())) return true;
    const other = this._other(ctl);
    if (!this._hasClue(other)) return false;
    this._switchTo(other);
    return this._openHint(other, other.forkIndex());
  }

  onLineFocus(ctl, line) {
    if (this._active !== ctl.side) { this._active = ctl.side; this.requestUpdate(); }
    super.onLineFocus(ctl, line);
  }

  getPartResponse() {
    return { lhs: this.lhs ? this.lhs.values() : [], rhs: this.rhs ? this.rhs.values() : [], hintsUsed: this._hintsUsed };
  }

  setPartResponse(r) {
    if (!this.part) return;
    if (!this.lhs) this._build();
    this._hintsUsed = r?.hintsUsed || 0;
    this.lhs.setValues(r?.lhs || []);
    this.rhs.setValues(r?.rhs || []);
    this._refreshGoal({ silent: true });
    this.requestUpdate();
  }

  resetPart() {
    this.rhs?.reset();
    super.resetPart();
  }

  lock() {
    this.locked = true;
    for (const c of [this.lhs, this.rhs]) {
      for (const l of c?.lines || []) { try { l.mf.readOnly = true; } catch { /* ignore */ } }
      this._dropDraft(c);
    }
    this.requestUpdate();
  }

  showGraded() {
    this.locked = true;
    for (const c of [this.lhs, this.rhs]) {
      c.lines.forEach((l, i) => { if (l.latex.trim()) { c._check(i, { silent: true }); l.editing = false; } });
      for (const l of c.lines) { try { l.mf.readOnly = true; } catch { /* ignore */ } }
      this._dropDraft(c);
    }
    this._reached = this._isDone();
    this.requestUpdate();
  }

  _status() {
    if (this._reached) return 'correct';
    if (!this.lhs.values().length && !this.rhs.values().length) return 'idle';
    return this.lhs.intact() && this.rhs.intact() ? 'partial' : 'wrong';
  }

  _isDone() {
    if (!this.lhs.intact() || !this.rhs.intact()) return false;
    return sidesMeet(this.part, this.lhs.values(), this.rhs.values(), this.item);
  }

  _refreshGoal({ silent }) {
    const was = this._reached;
    this._reached = this._isDone();
    for (const c of [this.lhs, this.rhs]) {
      c.done = this._reached;
      if (this._reached) this._dropDraft(c); else c.ensureDraft();
    }
    if (this._reached && !was && !silent) {
      this._celebrate(this.lhs.values().length + this.rhs.values().length);
    }
  }

  _celebrate(steps) {
    super._celebrate(steps);
    this.updateComplete.then(() => this.sparkBurst(this.shadowRoot?.querySelector('.meet-node'), 24));
  }

  _checkMilestones() { /* identities have no milestones in this prototype */ }

  _joinCls(c) {
    if (this._reached) return 'ok';
    if (!c.intact()) return 'bad';
    return '';
  }

  render() {
    if (!this.part || !this.lhs) return html``;
    const cards = this._partCards();
    const out = this._reached ? 'ok' : 'pending';
    return html`
      <div class="wrap">
        <div class="fx-layer"></div>
        <div class="board ${this._reached && !this.assess ? 'won' : ''}">
          <div class="sides">
            <div class="side ${this._active === 'lhs' && this.live ? 'focus' : ''}">
              <div class="side-title"><span class="side-tag">LEFT SIDE</span></div>
              <div class="trail">${this.lhs.renderStart()}${this.lhs.renderRows({ outLast: out, cards })}</div>
            </div>
            <div class="side ${this._active === 'rhs' && this.live ? 'focus' : ''}">
              <div class="side-title mirror"><span class="side-tag">RIGHT SIDE</span></div>
              <div class="trail">${this.rhs.renderStart()}${this.rhs.renderRows({ outLast: out, cards })}</div>
            </div>
          </div>
          <div class="meet ${this._reached ? 'reached' : ''}">
            <svg class="joins" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true">
              ${svg`<path class="${this._joinCls(this.lhs)}" vector-effect="non-scaling-stroke" d="M 4 0 C 4 34, 50 18, 50 56"></path>`}
              ${svg`<path class="${this._joinCls(this.rhs)}" vector-effect="non-scaling-stroke" d="M 96 0 C 96 34, 50 18, 50 56"></path>`}
            </svg>
            <div class="meet-row">
              <span class="meet-node" aria-hidden="true">=</span>
              <div class="mw-card meet-card">
                <span class="goal-title">${this._reached ? (this.assess ? 'The two sides meet' : 'The two sides meet!') : 'Goal: make both sides the same'}</span>
                ${this._reached && !this.assess && !this.calm ? this._starsTpl(this._stars) : nothing}
              </div>
            </div>
          </div>
        </div>
        ${this.live ? this._tools(this.activeChain()) : nothing}
      </div>`;
  }
}

customElements.define('mw-shape-two-sided', MwTwoSided);
