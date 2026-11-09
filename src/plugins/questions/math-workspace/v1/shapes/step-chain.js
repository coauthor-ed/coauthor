import { html, css, nothing } from 'lit';
import { MwShapeBase } from '../lib/shapeBase.js';
import { mwBaseStyles, mwTrailStyles } from '../lib/styles.js';
import { ChainCtl } from '../lib/chainCtl.js';
import { goalReached, milestoneHits } from '../lib/chain.js';
import { mathSpan } from '../lib/field.js';
import { templateToPrompts, splitAlternatives } from '../lib/latexUtil.js';
import { rich, loc } from '../lib/rich.js';
import { icFlag, icStar, icBulb, icFork, icBack, icCheck } from '../lib/icons.js';

/**
 * <mw-shape-step-chain> - a line-by-line working trail toward a goal flag.
 * Also the base for <mw-shape-two-sided> (shared fork/hint/goal plumbing).
 */
export class MwStepChain extends MwShapeBase {
  static properties = {
    ...MwShapeBase.properties,
    _tick: { state: true },
  };

  static styles = [mwBaseStyles, mwTrailStyles, css`
    .wrap { position: relative; }
    .fx-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 10; }
    .goal-math { font-size: 1.15rem; }
    .hint-tag { display: inline-flex; align-items: center; gap: 6px; }
    .hint-tag svg { width: 18px; height: 18px; color: var(--info-text); }
    .tools .count { font-size: 0.82rem; color: var(--text-muted); font-weight: var(--fw-strong); }
  `];

  constructor() {
    super();
    this._tick = 0;
    this.ctl = null;
    this._fork = { open: null, wrong: {}, ghost: null };
    this._hintLevels = {};
    this._hintNote = null;
    this._reached = false;
    this._stars = 0;
    this._msSeen = new Set();
  }

  willUpdate(changed) {
    if (changed.has('part') && this.part && !this.ctl) this._build();
    if (changed.has('mode')) this._fork.open = null;
  }

  _build() {
    this.ctl = new ChainCtl(this, {
      side: 'main',
      start: this.part.start,
      startLabel: 'START',
      maxSteps: this.part.maxSteps || 12,
    });
  }

  updated(ch) {
    super.updated?.(ch);
    if (this._revealFork) {
      this._revealFork = false;
      this.reveal(this.shadowRoot?.querySelector('.fork'));
    }
    if (this._fork.ghost && this._fork.ghost !== this._ghostShown) {
      this._ghostShown = this._fork.ghost;
      this.reveal(this.shadowRoot?.querySelector('.ghost-branch'));
    }
  }

  /* -------------------------------------------------------- contract */

  getPartResponse() {
    return { lines: this.ctl ? this.ctl.values() : [], hintsUsed: this._hintsUsed };
  }

  setPartResponse(r) {
    if (!this.part) return;
    if (!this.ctl) this._build();
    this._hintsUsed = r?.hintsUsed || 0;
    this.ctl.setValues(r?.lines || []);
    this._refreshGoal({ silent: true });
    this.requestUpdate();
  }

  resetPart() {
    this.ctl?.reset();
    this._hintsUsed = 0;
    this._hintLevels = {};
    this._hintNote = null;
    this._reached = false;
    this._stars = 0;
    this._fork = { open: null, wrong: {}, ghost: null };
    this._msSeen = new Set();
    this.locked = false;
    this.requestUpdate();
  }

  lock() {
    this.locked = true;
    for (const l of this.ctl?.lines || []) { try { l.mf.readOnly = true; } catch { /* ignore */ } }
    this._dropDraft(this.ctl);
    this.requestUpdate();
  }

  /** Assess reveal: sober marks only. */
  showGraded() {
    const ctl = this.ctl;
    if (!ctl) return;
    this.locked = true;
    ctl.lines.forEach((l, i) => { if (l.latex.trim()) { ctl._check(i, { silent: true }); l.editing = false; } });
    for (const l of ctl.lines) { try { l.mf.readOnly = true; } catch { /* ignore */ } }
    this._dropDraft(ctl);
    this._reached = this._isDone();
    this.requestUpdate();
  }

  _dropDraft(ctl) {
    if (!ctl) return;
    const last = ctl.lines[ctl.lines.length - 1];
    if (last && !last.latex.trim()) ctl.lines.pop();
  }

  /* ---------------------------------------------- chain notifications */

  onLineFocus(ctl) {
    this.armStuck(ctl.forkIndex(), () => this.shadowRoot?.querySelector('.node.active'));
  }

  onChainInput(ctl) {
    this._emitChange(this._status());
    this.armStuck(ctl.forkIndex(), () => this.shadowRoot?.querySelector('.node.active'));
  }

  onChainChanged(ctl, line, how) {
    if (this.live) {
      this._checkMilestones(ctl);
      this._sendReasons(ctl);
      this._refreshGoal({ silent: false });
      // A new step closes the old fork and its hint text.
      this._fork.ghost = null;
      if (how !== 'undo' && line && line.status !== 'bad') this._hintNote = null;
    }
    this._emitChange(this._status());
    this.requestUpdate();
    this.armStuck(ctl.forkIndex(), () => this.shadowRoot?.querySelector('.node.active'));
  }

  _status() {
    if (this._reached) return 'correct';
    if (!this.ctl || !this.ctl.values().length) return 'idle';
    return this.ctl.intact() ? 'partial' : 'wrong';
  }

  _isDone() {
    const vals = this.ctl.values();
    if (!vals.length || !this.ctl.intact()) return false;
    return goalReached(this.part, vals[vals.length - 1], this.item);
  }

  _refreshGoal({ silent }) {
    const was = this._reached;
    this._reached = this._isDone();
    this.ctl.done = this._reached;
    if (this._reached) this._dropDraft(this.ctl);
    else this.ctl.ensureDraft();
    if (this._reached && !was && !silent) this._celebrate(this.ctl.values().length);
  }

  _celebrate(steps) {
    const modelLen = (this.part.modelSolution || []).length;
    this._stars = MwShapeBase.starsFor({ hintsUsed: this._hintsUsed, steps, modelLen });
    this.bridge?.goal?.({ stars: this._stars, hintsUsed: this._hintsUsed, steps });
    this.updateComplete.then(() => {
      const node = this.shadowRoot?.querySelector('#goal-node');
      this.sparkBurst(node, 22);
      this.reveal(this.shadowRoot?.querySelector('.goal-card, .meet-card'));
    });
  }

  _checkMilestones(ctl) {
    const ms = this.part.milestones || [];
    if (!ms.length) return;
    const valid = ctl.lines.slice(0, ctl.lines.length).filter((l) => l.latex.trim());
    const prefix = valid.slice(0, ctl.validCount());
    for (const l of ctl.lines) l.milestone = null;
    ms.forEach((m, mi) => {
      const lineIdx = prefix.findIndex((l) => milestoneHits({ milestones: [m] }, [l.latex], this.item)[0]);
      if (lineIdx < 0) return;
      const line = prefix[lineIdx];
      line.milestone = loc(m.label) || 'Milestone';
      if (this._msSeen.has(mi)) return;
      this._msSeen.add(mi);
      this.updateComplete.then(() => {
        const el = this.shadowRoot?.querySelector(`[data-line="${line.id}"] .line`);
        this.bridge?.event?.('math:milestone', { label: loc(m.label), rect: this.rectOf(el) });
        this.sparkBurst(this.shadowRoot?.querySelector(`#node-${line.id}`), 10);
      });
    });
  }

  /* ------------------------------------------------- formula cards */

  _partCards() {
    const ids = this.part?.cards || [];
    const all = this.item?.cards || [];
    return ids.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  }

  onReason(ctl, line, card, el) {
    line.reason = line.reason === card.id ? null : card.id;
    line.reasonSent = false;
    this._sendReasons(ctl, el);
    this.requestUpdate();
  }

  _sendReasons(ctl, el) {
    for (const l of ctl.lines) {
      if (l.reason && !l.reasonSent && (l.status === 'ok' || l.status === 'warn')) {
        l.reasonSent = true;
        const from = el || this.shadowRoot?.querySelector(`[data-line="${l.id}"] [data-card="${l.reason}"]`);
        this.bridge?.cardUsed?.(l.reason, from);
      }
    }
  }

  /* ------------------------------------------------ forks and hints */

  /** The chain that forks and hints act on (two-sided overrides). */
  activeChain() { return this.ctl; }

  _forkChoices(k) {
    const m = this.part?.moves;
    return Array.isArray(m) && Array.isArray(m[k]) ? m[k] : null;
  }

  _forkOpen(k) {
    if (this._fork.open === null) return this.coach;
    return this._fork.open;
  }

  _pickMove(ctl, k, c, ev) {
    if (c.correct) {
      this._fork.ghost = null;
      ctl.fillDraft(c.result, { commit: true, tag: loc(c.label) });
      return;
    }
    this._fork.wrong = { ...this._fork.wrong, [`${k}|${loc(c.label)}`]: true };
    this._fork.ghost = { k, c };
    ev?.currentTarget?.classList.add('shake');
    this.bridge?.brokeStep?.();
    this.requestUpdate();
  }

  /** Model lines for a side: modelSolution (main or LHS), modelSolutionRhs. */
  _model(side) { return side === 'rhs' ? this.part?.modelSolutionRhs : this.part?.modelSolution; }

  _hintSteps(k, side = this.activeChain()?.side || 'main') {
    const hints = Array.isArray(this.part?.hints) ? this.part.hints : [];
    const fits = (x) => (x.step ?? 0) === k && (x.side ? x.side === side : side !== 'rhs');
    const h = hints.find(fits);
    const model = this._model(side)?.[k];
    const levels = [];
    if (h?.strategy) levels.push({ level: 1, text: loc(h.strategy) });
    if (h?.template) levels.push({ level: 2, template: h.template });
    if (model) levels.push({ level: 3, model });
    return levels;
  }

  /** Hint levels used, per side and step. */
  _hintKey(ctl, k) { return `${ctl?.side || 'main'}:${k}`; }

  _openHint(ctl, k) {
    const levels = this._hintSteps(k, ctl.side);
    const key = this._hintKey(ctl, k);
    const used = this._hintLevels[key] || 0;
    const next = levels.find((l) => l.level > used);
    if (!next) return false;
    this._hintLevels = { ...this._hintLevels, [key]: next.level };
    this._hintsUsed++;
    const last = !levels.some((l) => l.level > next.level);
    if (next.level === 1) {
      this._hintNote = { k: key, text: next.text };
      this.bridge?.hint?.(1, next.text, { last });
    } else if (next.level === 2) {
      const before = this._hintNote && this._hintNote.k === key ? `${this._hintNote.text} ` : '';
      this._hintNote = { k: key, text: `${before}Fill in the empty boxes in your new line, then press Enter.` };
      this.bridge?.hint?.(2, 'I have started your next line for you. Fill in the empty boxes, then press Enter.', { last });
      ctl.fillDraft(templateToPrompts(next.template), { commit: false });
    } else {
      this._hintNote = null;
      this.bridge?.hint?.(3, 'Here is that step, written out. See how it follows from the line above, then try the next line yourself.', { last: true });
      ctl.fillDraft(next.model, { commit: true, revealed: true });
    }
    this._emitChange(this._status());
    this.requestUpdate();
    return true;
  }

  /** Quill's clue chip (math:hint-request) opens the next level. In a
   *  two-sided proof, a side with no clues left hands over to the other. */
  requestHint() {
    if (!this.live || this._reached) return false;
    const ctl = this.activeChain();
    if (!ctl) return false;
    return this._openHint(ctl, ctl.forkIndex());
  }

  /* ---------------------------------------------------------- render */

  render() {
    if (!this.part || !this.ctl) return html``;
    const cards = this._partCards();
    return html`
      <div class="wrap">
        <div class="fx-layer"></div>
        <div class="board ${this._reached && !this.assess ? 'won' : ''}">
          <div class="trail">
            ${this.ctl.renderStart()}
            ${this.ctl.renderRows({ outLast: this._reached ? 'ok' : 'pending', cards })}
            ${this._goalRow()}
          </div>
        </div>
        ${this.live ? this._tools(this.ctl) : nothing}
      </div>`;
  }

  _goalLabel() {
    const g = this.part.goal || {};
    if (g.label) return html`${rich(g.label, 'goal')}`;
    if (g.form === 'solved-for') return html`Goal: get <b>${g.var || 'x'}</b> on its own`;
    if (g.latex) {
      const alts = splitAlternatives(g.latex);
      if (alts.length > 1 || /^\s*[a-zA-Z]\s*=/.test(g.latex)) {
        const v = (g.latex.match(/^\s*([a-zA-Z])\s*=/) || [])[1] || 'x';
        return html`Goal: find every value of <b>${v}</b>`;
      }
      if (!this._goalEl) this._goalEl = mathSpan(g.latex, 'goal-math');
      return html`Goal: ${this._goalEl}`;
    }
    if (g.form) return html`Goal: write it in ${String(g.form).replace(/([A-Z])/g, ' $1').toLowerCase()} form`;
    return html`Goal`;
  }

  _goalRow() {
    const reached = this._reached;
    const showStars = reached && this.live !== false && !this.assess && !this.calm;
    return html`
      <div class="row goal ${reached ? 'reached' : ''}">
        <div class="rail">
          <span class="seg in ${reached ? 'ok' : ''}"></span>
          <span class="node" id="goal-node">${this.calm && reached ? icCheck : icFlag}</span>
        </div>
        <div class="mw-card goal-card">
          <span class="goal-title">${reached ? (this.assess ? 'Goal reached' : 'Goal reached!') : this._goalLabel()}</span>
          ${showStars ? this._starsTpl(this._stars) : nothing}
        </div>
      </div>`;
  }

  _starsTpl(n) {
    return html`<span class="stars" role="img" aria-label="${n} of 3 stars">
      ${[1, 2, 3].map((i) => html`<span class="star ${i <= n ? 'on' : ''}">${icStar}</span>`)}
    </span>`;
  }

  _tools(ctl) {
    if (this._reached || !ctl || ctl.done) return nothing;
    const k = ctl.forkIndex();
    const choices = this._forkChoices(k);
    const intact = ctl.intact();
    const levels = this._hintSteps(k, ctl.side);
    const key = this._hintKey(ctl, k);
    const used = this._hintLevels[key] || 0;
    const moreHints = levels.some((l) => l.level > used);
    const forkOpen = choices && this._forkOpen(k);
    const other = this._otherSideNote?.(ctl);
    if (!choices && !levels.length && !other) return nothing;
    return html`
      <div class="tools">
        ${choices ? html`
          <button class="chip ${forkOpen ? 'primary' : ''}" aria-expanded="${forkOpen ? 'true' : 'false'}"
            @click=${() => { this._fork.open = !forkOpen; this._revealFork = !forkOpen; this.requestUpdate(); }}>${icFork}<span>Moves</span></button>` : nothing}
        ${levels.length && !this.coached ? html`
          <button class="chip" ?disabled=${!moreHints}
            @click=${() => this._openHint(ctl, k)}>${icBulb}<span>${used ? 'More help' : 'Hint'}</span>
            <span class="dots" aria-hidden="true">${levels.map((l) => html`<span class="dot ${l.level <= used ? 'on' : ''}"></span>`)}</span>
          </button>` : nothing}
        ${!levels.length && other && !this.coached ? other : nothing}
        <span class="spacer"></span>
        ${this._hintsUsed ? html`<span class="count">Hints used: ${this._hintsUsed}</span>` : nothing}
      </div>
      ${this._hintNote && this._hintNote.k === key && !this.coached ? html`
        <div class="bubble hint" role="status"><span class="hint-tag">${icBulb}<strong>Hint</strong></span> ${rich(this._hintNote.text, `hint${key}`)}</div>` : nothing}
      ${forkOpen ? this._forkPanel(ctl, k, choices) : nothing}`;
  }

  _forkPanel(ctl, k, choices) {
    const ghost = this._fork.ghost && this._fork.ghost.k === k ? this._fork.ghost : null;
    return html`
      <div class="mw-card fork slide-in">
        <div class="fork-title"><span class="kicker">Fork in the path</span><span class="muted">Which move comes next?</span></div>
        <div class="fork-chips">
          ${choices.map((c, ci) => {
            const wrong = this._fork.wrong[`${k}|${loc(c.label)}`];
            return html`<button class="chip ${wrong ? 'bad' : ''}" ?disabled=${wrong || !!ghost}
              @click=${(e) => this._pickMove(ctl, k, c, e)}>${rich(c.label, `mv${k}-${ci}`)}</button>`;
          })}
        </div>
        ${ghost ? html`
          <div class="ghost-branch" role="status">
            <div><strong>Not this way.</strong> ${rich(ghost.c.why, `why${k}`)}</div>
            ${ghost.c.result ? html`<div class="leads"><span class="muted">It leads to</span> ${this._ghostEl(ghost.c.result)}</div>` : nothing}
            <div class="row-actions" style="margin-top:10px">
              <button class="chip sm" @click=${() => { this._fork.ghost = null; this.requestUpdate(); }}>${icBack}<span>Back to the fork</span></button>
            </div>
          </div>` : nothing}
      </div>`;
  }

  _ghostEl(latex) {
    if (this._ghostKey !== latex) { this._ghostKey = latex; this._ghostCache = mathSpan(latex); }
    return this._ghostCache;
  }
}

customElements.define('mw-shape-step-chain', MwStepChain);
