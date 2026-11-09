import { html, css, nothing } from 'lit';
import { MwShapeBase } from '../lib/shapeBase.js';
import { mwBaseStyles, mwPadStyles } from '../lib/styles.js';
import { createField, mathSpan } from '../lib/field.js';
import { M } from '../lib/mathApi.js';
import { mathOpts, intervalSegments } from '../lib/chain.js';
import { segmentsToLatex, canonical } from '../lib/intervals.js';
import { unwrapPlaceholders } from '../lib/latexUtil.js';
import { icCheck, icCross, icPlus } from '../lib/icons.js';

/**
 * <mw-shape-interval> - interval notation, typed or built piece by piece.
 * The builder edits a list of pieces (bracket, from, to, bracket); every edit
 * rewrites the typed field and every typed commit re-reads the pieces.
 */
export class MwInterval extends MwShapeBase {
  static properties = { ...MwShapeBase.properties, _tick: { state: true } };
  static styles = [mwBaseStyles, mwPadStyles, css`
    .typed { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 12px; }
    .typed math-field { flex: 1 1 auto; min-width: 0; }
    .lead { font-family: var(--font-heading); font-weight: var(--fw-strong); color: var(--text-muted); white-space: nowrap; }
    .pieces { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .piece {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px; border-radius: var(--radius-md);
      background: var(--bg-surface); border: 3px solid var(--border-hover);
      box-shadow: 0 4px 0 var(--border-hover);
      animation: mw-slide-in 0.3s var(--ease-settle) both;
    }
    .br {
      width: 38px; height: 42px; border-radius: 10px;
      border: 2px solid var(--border-hover); background: var(--bg-panel);
      font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 1.35rem;
      color: var(--text-main); cursor: pointer; box-shadow: 0 3px 0 var(--border-hover);
      padding: 0;
    }
    .br.closed { background: var(--mw-topic, var(--primary-color)); color: var(--on-accent); border-color: transparent; box-shadow: 0 3px 0 color-mix(in srgb, var(--mw-topic, var(--primary-color)) 60%, var(--text-main)); }
    .br:active { transform: translateY(3px); box-shadow: none; }
    .end {
      width: 64px; min-height: 42px; padding: 4px 6px; text-align: center;
      font: inherit; font-weight: var(--fw-heavy); font-size: 1.05rem;
      border-radius: 10px; border: 2px solid var(--border-color);
      background: var(--bg-base); color: var(--text-main);
    }
    .end:focus { outline: none; border-color: var(--primary-color); }
    .comma { font-weight: var(--fw-heavy); color: var(--text-muted); }
    .cup { font-family: var(--font-heading); font-weight: var(--fw-heavy); font-size: 1.3rem; color: var(--text-muted); }
    .piece .x { width: 26px; height: 26px; border-radius: 50%; border: none; background: var(--bg-panel-2); color: var(--text-muted); cursor: pointer; display: grid; place-items: center; padding: 0; }
    .piece .x svg { width: 12px; height: 12px; }
    .legend { font-size: 0.82rem; color: var(--text-muted); }
    @media (prefers-reduced-motion: reduce) { .piece { animation: none; } }
  `];

  constructor() {
    super();
    this._tick = 0;
    this._value = '';
    this._pieces = [];
    this._st = { status: '', msg: '', tries: 0, done: false, stars: 0 };
    this.mf = null;
  }

  willUpdate(ch) {
    if (ch.has('part') && this.part && !this.mf) {
      this.mf = createField({
        label: 'Answer in interval notation',
        placeholder: '\\text{e.g. }(-\\infty,2]\\cup(5,\\infty)',
        onInput: (v) => { this._value = v; this._emitChange(this._status()); },
        onCommit: (v, how) => { this._value = v; this._readPieces(); this._check(how); },
        onFocus: (mf) => this.bridge?.focusField?.(mf),
      });
    }
  }

  get partDone() { return !!this._st.done; }

  getPartResponse() { return { value: this._value, hintsUsed: this._hintsUsed }; }
  setPartResponse(r) {
    this._value = r?.value || '';
    this._hintsUsed = r?.hintsUsed || 0;
    this.mf?.setValueQuiet(this._value);
    this._readPieces();
    this.requestUpdate();
  }
  resetPart() {
    this._value = ''; this._pieces = []; this._st = { status: '', msg: '', tries: 0, done: false, stars: 0 };
    this._singleUsed = {}; this._singleNote = null;
    this.locked = false; if (this.mf) { this.mf.readOnly = false; this.mf.setValueQuiet(''); }
    this.requestUpdate();
  }
  lock() { this.locked = true; if (this.mf) this.mf.readOnly = true; this.requestUpdate(); }
  showGraded(r) { this.lock(); this._st = { ...this._st, status: r?.score >= 0.999 ? 'ok' : 'bad', msg: '' }; }

  _status() {
    if (this._st.done) return 'correct';
    if (!this._value.trim()) return 'idle';
    return this._st.status === 'bad' ? 'wrong' : 'partial';
  }

  _readPieces() {
    const segs = intervalSegments(unwrapPlaceholders(this._value));
    if (!segs) return;
    this._pieces = segs.map((g) => ({
      aClosed: g.aClosed, bClosed: g.bClosed,
      a: g.a === -Infinity ? '-\u221e' : (g.aLatex || String(g.a)),
      b: g.b === Infinity ? '\u221e' : (g.bLatex || String(g.b)),
    }));
  }

  _endLatex(txt, sign) {
    const t = String(txt || '').trim().toLowerCase().replace(/\u2212/g, '-').replace(/\s+/g, '').replace(/^\+/, '');
    if (/^-?(inf|infinity|\u221e)$/.test(t)) return t.startsWith('-') ? '-\\infty' : (sign < 0 ? '-\\infty' : '\\infty');
    const frac = /^(-?\d+)\/(\d+)$/.exec(t);
    if (frac) return `${frac[1].startsWith('-') ? '-' : ''}\\frac{${frac[1].replace('-', '')}}{${frac[2]}}`;
    return t;
  }

  _writePieces() {
    const parts = this._pieces.map((p) => {
      const a = this._endLatex(p.a, -1);
      const b = this._endLatex(p.b, 1);
      if (!a || !b) return null;
      const ac = p.aClosed && a !== '-\\infty';
      const bc = p.bClosed && b !== '\\infty';
      return `${ac ? '[' : '('}${a},${b}${bc ? ']' : ')'}`;
    }).filter(Boolean);
    this._value = parts.join('\\cup');
    this.mf?.setValueQuiet(this._value);
    this._emitChange(this._status());
  }

  /** Check the built pieces only once every end box is filled; a piece still
   *  being built is not a wrong answer. Enter on an unfinished piece says so. */
  _checkPieces(enter = false) {
    const done = this._pieces.length && this._pieces.every((p) => String(p.a).trim() && String(p.b).trim());
    if (done) { this._check(); return; }
    if (enter) { this._st = { ...this._st, status: '', msg: 'Fill both end boxes of every piece, then press Enter.', quiet: true }; this.requestUpdate(); }
  }

  _check(how = 'enter') {
    if (!this.live) { this._emitChange(this._status()); return; }
    const v = unwrapPlaceholders(this._value);
    if (!v.trim()) return;
    if (this._checkedVal === v && this._st.status) return;
    const mine = intervalSegments(v);
    if (!mine && how === 'blur') {
      this._st = { ...this._st, status: '', msg: 'I cannot read this yet. Finish it, then press Enter.', quiet: true };
      this._checkedVal = null;
      this.requestUpdate();
      return;
    }
    this._checkedVal = v;
    const tries = this._st.tries + 1;
    if (!mine) {
      this._st = { ...this._st, status: 'bad', msg: 'Write it like (-\u221e, 2] \u222a (5, \u221e): a bracket, two ends with a comma, and a bracket.', tries };
      this.requestUpdate();
      return;
    }
    const r = M.interval(v, this.part.answer, mathOpts(this.item, []));
    if (r.ok) {
      const wasDone = this._st.done;
      this._st = { status: 'ok', msg: '', tries, done: true, stars: Math.max(1, (tries === 1 ? 3 : tries === 2 ? 2 : 1) - (this._hintsUsed ? 1 : 0)) };
      if (!wasDone) {
        this.updateComplete.then(() => this.bridge?.validStep?.(this.shadowRoot?.querySelector('.status-dot'), { index: 0 }, this));
        this.finish(this._st.stars, 1);
      }
    } else {
      this._st = { ...this._st, status: 'bad', msg: this._why(mine), tries, done: false };
      this.bridge?.brokeStep?.();
    }
    this.bridge?.event?.('math:step-checked', { index: 0, valid: !!r.ok, kind: r.ok ? 'equivalent' : 'invalid', reversible: true, counterexample: r.counterexample || null, rect: this.rectOf(this.shadowRoot?.querySelector('.typed')) });
    this._emitChange(this._status());
    this.requestUpdate();
  }

  _why(mine) {
    const want = intervalSegments(this.part.answer) || [];
    const a = canonical(mine);
    const b = canonical(want);
    const near = (x, y) => x === y || Math.abs(x - y) < 1e-9;
    if (a.length === b.length && a.every((g, i) => near(g.a, b[i].a) && near(g.b, b[i].b))) {
      return 'The end numbers are right. Now check each bracket: [ or ] means the end is included, ( or ) means it is left out.';
    }
    if (a.length !== b.length) return `Your answer has ${a.length} piece${a.length === 1 ? '' : 's'}. Look at the number line again: how many separate pieces should there be?`;
    return 'Check the end numbers of each piece. Try a number from your interval in the inequality.';
  }

  _cupEl(i) {
    this._cups = this._cups || [];
    if (!this._cups[i]) this._cups[i] = mathSpan('\\cup');
    return this._cups[i];
  }

  render() {
    if (!this.part) return html``;
    const st = this.assess && !this.locked ? '' : this._st.status;
    return html`
      <div class="wrap">
        <div class="fx-layer"></div>
        <div class="pad">
          <div class="mw-card typed ${st}">
            <span class="lead">Answer</span>
            ${this.mf}
            ${this.live && !this._st.done ? html`<button class="icon-btn go" title="Check" aria-label="Check my answer"
              @pointerdown=${(e) => e.preventDefault()} @click=${() => { this._value = this.mf.value; this._readPieces(); this._check(); }}>${icCheck}</button>` : nothing}
            ${st ? html`<span class="status-dot ${st}">${st === 'ok' ? icCheck : icCross}</span>` : nothing}
          </div>
          ${this.locked ? nothing : html`
            <div class="kicker">Or build it piece by piece</div>
            <div class="pieces">
              ${this._pieces.map((p, i) => html`
                ${i ? html`<span class="cup" aria-hidden="true">${this._cupEl(i)}</span>` : nothing}
                <span class="piece">
                  <button class="br ${p.aClosed ? 'closed' : ''}" aria-label="${p.aClosed ? 'Left end included' : 'Left end left out'}"
                    @click=${() => { p.aClosed = !p.aClosed; this._writePieces(); this.requestUpdate(); }}>${p.aClosed ? '[' : '('}</button>
                  <input class="end" aria-label="Left end" .value=${p.a} @focus=${(e) => this.bridge?.focusField?.(e.target)}
                    @input=${(e) => { p.a = e.target.value; this._writePieces(); }} @change=${() => this._checkPieces()}
                    @keydown=${(e) => { if (e.key === 'Enter') this._checkPieces(true); }}>
                  <span class="comma">,</span>
                  <input class="end" aria-label="Right end" .value=${p.b} @focus=${(e) => this.bridge?.focusField?.(e.target)}
                    @input=${(e) => { p.b = e.target.value; this._writePieces(); }} @change=${() => this._checkPieces()}
                    @keydown=${(e) => { if (e.key === 'Enter') this._checkPieces(true); }}>
                  <button class="br ${p.bClosed ? 'closed' : ''}" aria-label="${p.bClosed ? 'Right end included' : 'Right end left out'}"
                    @click=${() => { p.bClosed = !p.bClosed; this._writePieces(); this.requestUpdate(); }}>${p.bClosed ? ']' : ')'}</button>
                  <button class="x" aria-label="Remove this piece" @click=${() => { this._pieces.splice(i, 1); this._writePieces(); this.requestUpdate(); }}>${icCross}</button>
                </span>`)}
              <button class="chip sm" @click=${() => { this._pieces.push({ a: this._pieces.length ? '' : '-\u221e', b: '', aClosed: false, bClosed: false }); this.requestUpdate(); }}>${icPlus}<span>Add a piece</span></button>
            </div>
            <div class="legend">Tap a bracket to switch between [ (end included) and ( (end left out). For infinity, use the \u221e key or type inf.</div>`}
          ${this._st.msg && this.live ? html`<div class="bubble ${this._st.quiet ? 'quiet' : 'bad'}" role="status">${this._st.msg}</div>` : nothing}
          ${this.hintTpl()}
          ${this._st.done && !this.assess ? this.doneTpl(this._st.stars) : nothing}
        </div>
      </div>`;
  }
}

customElements.define('mw-shape-interval', MwInterval);
