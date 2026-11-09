import { html, css, nothing } from 'lit';
import { MwShapeBase } from '../lib/shapeBase.js';
import { mwBaseStyles, mwPadStyles } from '../lib/styles.js';
import { createField } from '../lib/field.js';
import { M, checkBy } from '../lib/mathApi.js';
import { mathOpts } from '../lib/chain.js';
import { unwrapPlaceholders, hasEmptyPlaceholder, fmtNum, fmtPoint } from '../lib/latexUtil.js';
import { icCheck, icCross, icBang } from '../lib/icons.js';

const FORM_WORDS = {
  factored: 'factorised form', expanded: 'expanded form', lowestTerms: 'lowest terms',
  rationalisedDenominator: 'a form with a rational denominator', simplestSurd: 'simplest surd form',
  'a+bi': 'the form a + bi', polar: 'polar form',
};

/** <mw-shape-expression> - one answer pad, checked by equivalence (+ form). */
export class MwExpression extends MwShapeBase {
  static properties = { ...MwShapeBase.properties, _st: { state: true } };
  static styles = [mwBaseStyles, mwPadStyles, css``];

  constructor() {
    super();
    this._st = { status: '', msg: '', tries: 0, done: false, stars: 0 };
    this._value = '';
    this.mf = null;
  }

  willUpdate(ch) {
    if (ch.has('part') && this.part && !this.mf) {
      this.mf = createField({
        placeholder: this.part.placeholder || '',
        label: 'Your answer',
        onInput: (v) => { this._value = v; if (this._st.status) this._st = { ...this._st, status: '', msg: '' }; this._emitChange(this._status()); },
        onCommit: (v, how) => { this._value = v; this._check(how); },
        onFocus: (mf) => this.bridge?.focusField?.(mf),
      });
    }
  }

  get partDone() { return !!this._st.done; }

  getPartResponse() { return { value: this._value, hintsUsed: this._hintsUsed }; }
  setPartResponse(r) {
    this._value = r?.value || '';
    this._hintsUsed = r?.hintsUsed || 0;
    if (this.mf) this.mf.setValueQuiet(this._value);
  }
  resetPart() {
    this._value = '';
    this.mf?.setValueQuiet('');
    this._st = { status: '', msg: '', tries: 0, done: false, stars: 0 };
    this._singleUsed = {};
    this._singleNote = null;
    this.locked = false;
    if (this.mf) this.mf.readOnly = false;
  }
  lock() { this.locked = true; if (this.mf) this.mf.readOnly = true; }
  showGraded(r) {
    this.lock();
    this._st = { ...this._st, status: r?.score >= 0.999 ? 'ok' : r?.score > 0 ? 'warn' : 'bad', msg: '' };
  }

  _status() {
    if (this._st.done) return 'correct';
    if (!this._value.trim()) return 'idle';
    return this._st.status === 'bad' ? 'wrong' : 'partial';
  }

  _check(how = 'enter') {
    if (!this.live) { this._emitChange(this._status()); return; }
    const v = unwrapPlaceholders(this._value);
    if (!v.trim()) return;
    if (this._checkedVal === this._value && this._st.status) return;
    if (hasEmptyPlaceholder(this._value)) { this._st = { ...this._st, status: 'bad', msg: 'Fill in every box first.' }; return; }
    const p = this.part;
    const opts = mathOpts(this.item, [v, p.answer]);
    const r = checkBy(p.check, v, p.answer, opts);
    if (how === 'blur' && !r.ok && r.error && !r.counterexample) {
      this._st = { ...this._st, status: '', msg: 'I cannot read this yet. Finish it, then press Enter.', quiet: true };
      this._checkedVal = null;
      return;
    }
    this._checkedVal = this._value;
    const tries = this._st.tries + 1;
    let st;
    if (r.ok) {
      const forms = Array.isArray(p.form) ? p.form : (p.form ? [p.form] : []);
      const bad = forms.find((f) => M.form(v, f, opts)?.ok === false);
      if (bad) {
        st = { status: 'warn', msg: `This is equal to the answer, but it is not in ${FORM_WORDS[bad] || bad} yet. One more step.` };
      } else {
        const stars = Math.max(1, (tries === 1 ? 3 : tries === 2 ? 2 : 1) - (this._hintsUsed ? 1 : 0));
        st = { status: 'ok', msg: '', done: true, stars };
      }
    } else if (r.error && !r.counterexample) {
      st = { status: 'bad', msg: 'I cannot read this answer yet. Check the brackets and the signs.' };
    } else {
      st = { status: 'bad', msg: this._why(v, r) };
      this.bridge?.brokeStep?.();
    }
    const wasDone = this._st.done;
    this._st = { ...this._st, ...st, tries };
    this.bridge?.event?.('math:step-checked', {
      index: 0, valid: !!r.ok, kind: r.ok ? 'equivalent' : 'invalid', reversible: true,
      counterexample: r.counterexample || null, rect: this.rectOf(this.shadowRoot?.querySelector('.answer')),
    });
    this._emitChange(this._status());
    if (st.done && !wasDone) {
      this.updateComplete.then(() => this.bridge?.validStep?.(this.shadowRoot?.querySelector('.status-dot'), { index: 0 }, this));
      this.finish(st.stars, 1);
    }
  }

  _why(v, r) {
    const pt = r.counterexample?.point;
    if (pt && Object.keys(pt).length && (!this.part.check || this.part.check === 'equivalent' || this.part.check === 'onIntegers')) {
      const a = M.evalAt(v, pt);
      const b = M.evalAt(this.part.answer, pt);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return `Not yet. At ${fmtPoint(pt)} your answer gives ${fmtNum(a)}, but it should give ${fmtNum(b)}.`;
      }
    }
    if (this.part.check === 'upToConstant') return 'Not yet. Differentiate your answer: you should get back the expression inside the integral.';
    return 'Not yet. Look at your working again.';
  }

  render() {
    if (!this.part) return html``;
    const st = this._st;
    const dotIcon = st.status === 'ok' ? icCheck : st.status === 'bad' ? icCross : st.status === 'warn' ? icBang : nothing;
    const cls = this.assess && !this.locked ? '' : st.status;
    return html`
      <div class="wrap">
        <div class="fx-layer"></div>
        <div class="pad">
          <div class="mw-card answer ${cls}">
            <span class="lead">Answer</span>
            ${this.mf}
            ${this.live && !st.done ? html`<button class="icon-btn go" title="Check" aria-label="Check my answer"
              @pointerdown=${(e) => e.preventDefault()} @click=${() => { this._value = this.mf.value; this._check(); }}>${icCheck}</button>` : nothing}
            ${cls ? html`<span class="status-dot ${cls}">${dotIcon}</span>` : nothing}
          </div>
          ${st.msg && this.live ? html`<div class="bubble ${st.quiet ? 'quiet' : st.status === 'warn' ? 'warn' : 'bad'}" role="status">${st.msg}</div>` : nothing}
          ${this.hintTpl()}
          ${st.done && !this.assess ? this.doneTpl(st.stars) : nothing}
        </div>
      </div>`;
  }
}

customElements.define('mw-shape-expression', MwExpression);
