import { html, css, nothing } from 'lit';
import { MwShapeBase } from '../lib/shapeBase.js';
import { mwBaseStyles, mwPadStyles } from '../lib/styles.js';
import { createField, mathSpan } from '../lib/field.js';
import { M } from '../lib/mathApi.js';
import { mathOpts } from '../lib/chain.js';
import { unwrapPlaceholders, fmtNum } from '../lib/latexUtil.js';
import { icPlus, icCross, icCheck } from '../lib/icons.js';

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** Split "a = b = c" at its top-level = signs (not inside brackets). */
function splitEquals(latex) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i];
    if (c === '\\') { i++; while (/[a-zA-Z]/.test(latex[i + 1] || '')) i++; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === '=' && depth === 0) { out.push(latex.slice(from, i).trim()); from = i + 1; }
  }
  out.push(latex.slice(from).trim());
  return out;
}

/**
 * <mw-shape-solution-set> - collect every root as a chip. A root may be
 * typed with its working, "x = (3+5)/4 = 2": every = in the chain is checked
 * and the last value is the root. The working stays on show under the roots.
 * Response: { set: [final latex], work: [chain latex | null], empty?, hintsUsed }.
 */
export class MwSolutionSet extends MwShapeBase {
  static properties = { ...MwShapeBase.properties, _tick: { state: true } };
  static styles = [mwBaseStyles, mwPadStyles, css`
    .roots { display: flex; flex-wrap: wrap; gap: 10px; min-height: 52px; align-items: center; }
    .root {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 6px 6px 14px; min-height: 46px;
      border-radius: var(--radius-pill);
      background: var(--bg-surface); border: 3px solid var(--border-hover);
      box-shadow: 0 4px 0 var(--border-hover);
      font-size: 1.2rem;
      animation: mw-pop 0.4s var(--ease-spring) both;
    }
    .root.ok { background: var(--mw-ok-fill); border-color: var(--mw-ok-lip); box-shadow: 0 4px 0 var(--mw-ok-lip); color: var(--mw-on-fill); }
    .root.bad { background: var(--mw-bad-fill); border-color: var(--mw-bad-lip); box-shadow: 0 4px 0 var(--mw-bad-lip); color: var(--mw-on-fill); animation: mw-shake 0.45s ease-out both; }
    .root .x { width: 28px; height: 28px; border-radius: 50%; border: none; background: color-mix(in srgb, var(--text-main) 12%, transparent); color: inherit; display: grid; place-items: center; cursor: pointer; padding: 0; }
    .root .x svg { width: 14px; height: 14px; }
    .root .tick { width: 18px; height: 18px; }
    .empty-slot { color: var(--text-muted); font-weight: var(--fw-strong); font-size: 0.92rem; padding: 0 4px; }
    .adder { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 12px; }
    .adder math-field { flex: 1 1 auto; min-width: 0; }
    .lead { font-family: var(--font-heading); font-weight: var(--fw-strong); color: var(--text-muted); white-space: nowrap; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .count { font-weight: var(--fw-strong); color: var(--text-muted); font-size: 0.88rem; }
    .legend { font-size: 0.82rem; color: var(--text-muted); }
    .workings { display: flex; flex-direction: column; gap: 8px; }
    .working { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 12px; font-size: 1.1rem; overflow-x: auto; }
    .working.ok { border-color: var(--mw-ok-fill); }
    .working.bad { border-color: var(--mw-bad-fill); }
    @media (prefers-reduced-motion: reduce) { .root, .root.bad { animation: none; } }
  `];

  constructor() {
    super();
    this._tick = 0;
    this._set = [];
    this._work = [];
    this._chips = [];
    this._empty = false;
    this._wrongs = 0;
    this._done = false;
    this._stars = 0;
    this._msg = '';
    this.mf = null;
  }

  willUpdate(ch) {
    if (ch.has('part') && this.part && !this.mf) {
      this.mf = createField({
        label: 'A root',
        placeholder: '\\text{type a value}',
        onCommit: (v, how) => { if (how === 'enter') this._add(v); },
        onFocus: (mf) => this.bridge?.focusField?.(mf),
      });
    }
  }

  get partDone() { return !!this._done; }

  getPartResponse() {
    const work = this._work.some(Boolean) ? this._work.slice() : undefined;
    return { set: this._set.slice(), work, empty: this._empty || undefined, hintsUsed: this._hintsUsed };
  }
  setPartResponse(r) {
    this._set = (r?.set || []).slice();
    this._work = this._set.map((_v, i) => r?.work?.[i] || null);
    this._empty = !!r?.empty;
    this._hintsUsed = r?.hintsUsed || 0;
    this._chips = this._set.map((v, i) => this._chip(v, true, this._work[i]));
    this._evaluateDone(true);
    this.requestUpdate();
  }
  resetPart() {
    this._set = []; this._work = []; this._chips = []; this._empty = false; this._done = false; this._wrongs = 0; this._msg = '';
    this._singleUsed = {}; this._singleNote = null;
    this.locked = false; if (this.mf) { this.mf.readOnly = false; this.mf.setValueQuiet(''); }
    this.requestUpdate();
  }
  lock() { this.locked = true; if (this.mf) this.mf.readOnly = true; this.requestUpdate(); }
  showGraded() {
    this.lock();
    this._chips = this._set.map((v, i) => ({ ...this._chip(v, true, this._work[i]), status: this._isRoot(v) ? 'ok' : 'bad' }));
    this.requestUpdate();
  }

  _answerVals() { return (this.part.answer || []).map((a) => M.evalAt(a, {})); }
  _isRoot(v) {
    const x = M.evalAt(unwrapPlaceholders(v), {});
    return Number.isFinite(x) && this._answerVals().some((w) => Math.abs(w - x) <= 1e-9 * Math.max(1, Math.abs(w)));
  }

  _chip(v, quiet, work = null) {
    const status = this.live ? (this._isRoot(v) ? 'ok' : 'bad') : '';
    return { latex: v, el: mathSpan(unwrapPlaceholders(v)), status, work, workEl: work ? mathSpan(unwrapPlaceholders(work)) : null };
  }

  /** Read one typed entry: a value, or a worked chain ending in a value.
   *  Returns { value, work } or { error }. */
  _read(raw) {
    let segs = splitEquals(unwrapPlaceholders(raw));
    // "x = 2" or "x = (3+5)/4 = 2": the leading unknown is not a value.
    if (segs.length > 1 && /^[a-zA-Z](_\{?\w+\}?)?$/.test(segs[0])) segs = segs.slice(1);
    if (segs.some((s) => !s)) return { error: 'Something is missing next to an = sign.' };
    const vals = segs.map((s) => M.evalAt(s, {}));
    const bad = vals.findIndex((x) => !Number.isFinite(x));
    if (bad >= 0) {
      const opens = (raw.match(/\(|\[/g) || []).length;
      const closes = (raw.match(/\)|\]/g) || []).length;
      if (opens !== closes) return { error: `I cannot read this: it has ${opens} opening bracket${opens === 1 ? '' : 's'} but ${closes} closing one${closes === 1 ? '' : 's'}. One bracket is extra or missing.` };
      if (segs.length === 1) return { error: 'Type a number here, like 3, -2 or a fraction. You can also show your working, like (3 + 5) / 4 = 2.' };
      return { error: bad === 0 ? 'I cannot read the first part of your working. Check the brackets.' : `I cannot read the part after the ${ORD[bad - 1] || 'next'} = sign. Check the brackets.` };
    }
    for (let i = 1; i < vals.length; i++) {
      const a = vals[i - 1];
      const b = vals[i];
      if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) {
        return { error: `Your working breaks at the ${ORD[i - 1] || 'next'} = sign: the part before it is ${fmtNum(a)}, but the part after it is ${fmtNum(b)}.`, chainBreak: true };
      }
    }
    return { value: segs[segs.length - 1], work: segs.length > 1 ? segs.join('=') : null };
  }

  _add(raw) {
    const typed = (raw ?? this.mf?.value ?? '').trim();
    if (!typed || this.locked) return;
    const got = this._read(typed);
    if (got.error) {
      this._msg = got.error;
      if (got.chainBreak && this.live) {
        this._wrongs++;
        this.bridge?.event?.('math:step-checked', { index: this._set.length, valid: false, kind: 'invalid', reversible: true, counterexample: null, rect: this.rectOf(this.shadowRoot?.querySelector('.adder')) });
        this.bridge?.brokeStep?.();
      }
      this.requestUpdate();
      return;
    }
    const v = got.value;
    const x = M.evalAt(v, {});
    if (this._set.some((s) => Math.abs(M.evalAt(unwrapPlaceholders(s), {}) - x) < 1e-9)) { this._msg = 'You already have that one.'; this.mf.setValueQuiet(''); this.requestUpdate(); return; }
    this._msg = '';
    this._empty = false;
    this._set.push(v);
    this._work.push(got.work);
    const chip = this._chip(v, false, got.work);
    this._chips.push(chip);
    this.mf.setValueQuiet('');
    if (this.live) {
      const ok = chip.status === 'ok';
      this.bridge?.event?.('math:step-checked', { index: this._set.length - 1, valid: ok, kind: ok ? 'equivalent' : 'invalid', reversible: true, counterexample: null, rect: this.rectOf(this.shadowRoot?.querySelector('.roots')) });
      if (ok) this.updateComplete.then(() => this.bridge?.validStep?.(this.shadowRoot?.querySelectorAll('.root')[this._chips.indexOf(chip)], { index: 0 }, this));
      else {
        this._wrongs++;
        this.bridge?.brokeStep?.();
        const f = M.evalAt(unwrapPlaceholders(v), {});
        this._msg = `${fmtNum(f)} is not a root: put it into the equation and the two sides do not match.`;
      }
      this._evaluateDone(false);
    }
    this._emitChange(this._status());
    this.requestUpdate();
    this.updateComplete.then(() => this.mf?.focus());
  }

  _remove(i) {
    if (this.locked) return;
    this._set.splice(i, 1);
    this._work.splice(i, 1);
    this._chips.splice(i, 1);
    this._msg = '';
    this._evaluateDone(true);
    this._emitChange(this._status());
    this.requestUpdate();
  }

  _evaluateDone(silent) {
    if (!this.live) return;
    const ans = this.part.answer || [];
    let ok;
    if (this._empty) ok = !!this.part.allowEmpty && !ans.length;
    else ok = this._set.length > 0 && M.solutionSet(this._set.map(unwrapPlaceholders), ans, mathOpts(this.item, [])).ok;
    if (ok && !this._done) {
      this._done = true;
      this._stars = Math.max(1, 3 - Math.min(2, this._wrongs));
      if (!silent) this.finish(this._stars, this._set.length);
    } else if (!ok) this._done = false;
  }

  _status() {
    if (this._done) return 'correct';
    if (!this._set.length) return 'idle';
    return this._chips.some((c) => c.status === 'bad') ? 'wrong' : 'partial';
  }

  render() {
    if (!this.part) return html``;
    const total = (this.part.answer || []).length;
    const right = this._chips.filter((c) => c.status === 'ok').length;
    return html`
      <div class="wrap">
        <div class="fx-layer"></div>
        <div class="pad">
          <div class="row">
            <span class="kicker">Roots</span>
            ${this.live && total ? html`<span class="count">${right} of ${total} found</span>` : nothing}
          </div>
          <div class="roots" aria-live="polite">
            ${this._chips.length ? this._chips.map((c, i) => html`
              <span class="root ${this.assess && !this.locked ? '' : c.status}">
                ${c.status === 'ok' ? html`<span class="tick">${icCheck}</span>` : nothing}
                ${c.el}
                ${this.locked ? nothing : html`<button class="x" aria-label="Remove this root" @click=${() => this._remove(i)}>${icCross}</button>`}
              </span>`) : html`<span class="empty-slot">${this._empty ? 'No real roots' : 'No roots yet. Add them below.'}</span>`}
          </div>
          ${this.locked ? nothing : html`
            <div class="mw-card adder">
              <span class="lead">x =</span>
              ${this.mf}
              <button class="chip primary sm" @pointerdown=${(e) => e.preventDefault()} @click=${() => this._add()}>${icPlus}<span>Add</span></button>
            </div>
            <div class="legend">Type each root on its own and press Enter. You can show your working too, like <b>(3 + 5) / 4 = 2</b>.</div>
            ${this.part.allowEmpty ? html`<div class="row"><button class="chip sm ${this._empty ? 'gold' : 'ghost'}"
              @click=${() => { this._empty = !this._empty; if (this._empty) { this._set = []; this._chips = []; } this._evaluateDone(false); this._emitChange(this._status()); this.requestUpdate(); }}>No real roots</button></div>` : nothing}`}
          ${this._chips.some((c) => c.workEl) ? html`
            <div class="workings">
              ${this._chips.filter((c) => c.workEl).map((c) => html`<div class="mw-card working ${this.assess && !this.locked ? '' : c.status}"><span class="kicker">Working</span>${c.workEl}</div>`)}
            </div>` : nothing}
          ${this._msg && !this.assess ? html`<div class="bubble bad" role="status">${this._msg}</div>` : nothing}
          ${this.hintTpl()}
          ${this._done && !this.assess ? this.doneTpl(this._stars, 'All roots found!') : nothing}
        </div>
      </div>`;
  }
}

customElements.define('mw-shape-solution-set', MwSolutionSet);
