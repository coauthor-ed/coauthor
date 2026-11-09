import { html, css, nothing } from 'lit';
import { MwShapeBase } from '../lib/shapeBase.js';
import { mwBaseStyles, mwPadStyles } from '../lib/styles.js';
import { createField, mathSpan } from '../lib/field.js';
import { M } from '../lib/mathApi.js';
import { checkSlot } from '../lib/scoring.js';
import { unwrapPlaceholders, fmtNum, friendlyVar } from '../lib/latexUtil.js';
import { icCheck, icCross } from '../lib/icons.js';

/** <mw-shape-slots> - a grid of named answer slots (a, d, T_n, S_n ...). */
export class MwSlots extends MwShapeBase {
  static properties = { ...MwShapeBase.properties, _tick: { state: true } };
  static styles = [mwBaseStyles, mwPadStyles, css`
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .slot { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 6px; }
    .slot-label {
      flex: none; min-width: 52px; height: 40px; padding: 0 10px;
      display: grid; place-items: center;
      border-radius: 12px;
      background: color-mix(in srgb, var(--mw-topic, var(--primary-color)) 16%, var(--bg-surface));
      border: 2px solid color-mix(in srgb, var(--mw-topic, var(--primary-color)) 45%, var(--bg-surface));
      font-size: 1.1rem;
    }
    .slot math-field { flex: 1 1 auto; min-width: 0; }
    .slot .status-dot { width: 28px; height: 28px; }
    .slot .status-dot svg { width: 16px; height: 16px; }
    .slot-msg { grid-column: 1 / -1; }
    .progress { display: flex; gap: 6px; align-items: center; }
    .pip { width: 26px; height: 10px; border-radius: 6px; background: var(--bg-panel-2); }
    .pip.on { background: var(--mw-ok-fill); box-shadow: 0 2px 0 var(--mw-ok-lip); animation: mw-pop 0.4s var(--ease-spring) both; }
    @media (prefers-reduced-motion: reduce) { .pip.on { animation: none; } }
  `];

  constructor() {
    super();
    this._tick = 0;
    this._vals = {};
    this._st = {};
    this._fields = {};
    this._labels = {};
    this._wrongs = 0;
    this._done = false;
    this._stars = 0;
  }

  willUpdate(ch) {
    if (ch.has('part') && this.part) {
      for (const s of this.part.slots || []) {
        if (this._fields[s.id]) continue;
        this._fields[s.id] = createField({
          label: `${s.label || s.id}`,
          onInput: (v) => { this._vals[s.id] = v; this._emitChange(this._status()); },
          onCommit: (v, how) => { this._vals[s.id] = v; this._check(s, false, how); },
          onFocus: (mf) => { this.bridge?.focusField?.(mf); if (this._curSlot !== s.id) { this._curSlot = s.id; this.requestUpdate(); } },
        });
        this._labels[s.id] = mathSpan(`${s.label || s.id}=`);
      }
    }
  }

  get partDone() { return !!this._done; }

  /** Hints follow the slot being worked on: the focused one while it is not
   *  right yet, else the first slot that is not right. A hint with no slot
   *  field fits every slot. */
  hintKey() {
    const slots = this.part?.slots || [];
    const open = (s) => this._st[s.id]?.status !== 'ok';
    const cur = slots.find((s) => s.id === this._curSlot && open(s));
    return (cur || slots.find(open) || slots[0] || {}).id || '';
  }
  hintFits(h) { return !h.slot || h.slot === this.hintKey(); }
  hintField() { return this._fields[this.hintKey()] || null; }

  getPartResponse() { return { values: { ...this._vals }, hintsUsed: this._hintsUsed }; }
  setPartResponse(r) {
    this._vals = { ...(r?.values || {}) };
    this._hintsUsed = r?.hintsUsed || 0;
    for (const [id, v] of Object.entries(this._vals)) this._fields[id]?.setValueQuiet(v);
    if (this.live) for (const s of this.part?.slots || []) if (this._vals[s.id]) this._check(s, true);
    this.requestUpdate();
  }
  resetPart() {
    this._vals = {};
    this._st = {};
    this._done = false;
    this._wrongs = 0;
    this._singleUsed = {};
    this._singleNote = null;
    this.locked = false;
    for (const f of Object.values(this._fields)) { f.setValueQuiet(''); f.readOnly = false; }
    this.requestUpdate();
  }
  lock() { this.locked = true; for (const f of Object.values(this._fields)) f.readOnly = true; this.requestUpdate(); }
  showGraded() {
    this.lock();
    for (const s of this.part.slots || []) {
      const r = checkSlot(this.item, s, this._vals[s.id]);
      this._st[s.id] = { status: r.ok ? 'ok' : 'bad' };
    }
    this.requestUpdate();
  }

  _status() {
    if (this._done) return 'correct';
    const vals = Object.values(this._vals).filter((v) => v && v.trim());
    if (!vals.length) return 'idle';
    return Object.values(this._st).some((s) => s.status === 'bad') ? 'wrong' : 'partial';
  }

  _check(slot, silent = false, how = 'enter') {
    if (!this.live) { this._emitChange(this._status()); return; }
    const v = this._vals[slot.id] || '';
    if (!v.trim()) { delete this._st[slot.id]; this.requestUpdate(); return; }
    this._checked = this._checked || {};
    // One check per slot content (Enter and the blur after it are one commit).
    if (!silent && this._checked[slot.id] === v && this._st[slot.id]?.status) return;
    const r = checkSlot(this.item, slot, v);
    if (!silent && how === 'blur' && !r.ok && r.error && !r.counterexample) {
      // Half-typed and left: a quiet note, no verdict, no event.
      this._st[slot.id] = { status: '', msg: 'I cannot read this yet. Finish it, then press Enter.', quiet: true };
      this._checked[slot.id] = null;
      this.requestUpdate();
      return;
    }
    this._checked[slot.id] = v;
    const was = this._st[slot.id]?.status;
    this._st[slot.id] = { status: r.ok ? 'ok' : 'bad', msg: r.ok ? '' : this._why(slot, v, r) };
    if (!silent) {
      this.bridge?.event?.('math:step-checked', {
        index: (this.part.slots || []).indexOf(slot), slot: slot.id, valid: !!r.ok, kind: r.ok ? 'equivalent' : 'invalid',
        reversible: true, counterexample: r.counterexample || null,
        rect: this.rectOf(this.shadowRoot?.querySelector(`[data-slot="${slot.id}"]`)),
      });
      if (r.ok && was !== 'ok') {
        this.updateComplete.then(() => this.bridge?.validStep?.(this.shadowRoot?.querySelector(`[data-slot="${slot.id}"] .status-dot`), { index: 0 }, this));
      } else if (!r.ok && was !== 'bad') { this._wrongs++; this.bridge?.brokeStep?.(); }
    }
    const all = (this.part.slots || []).every((s) => this._st[s.id]?.status === 'ok');
    if (all && !this._done) {
      this._done = true;
      this._stars = Math.max(1, MwShapeBase.starsFor({ hintsUsed: this._hintsUsed + this._wrongs, steps: 1, modelLen: 1 }) - (this._wrongs > 2 ? 1 : 0));
      if (!silent) this.finish(this._stars, (this.part.slots || []).length);
    }
    this._emitChange(this._status());
    this.requestUpdate();
  }

  _why(slot, v, r) {
    const pt = r.counterexample?.point;
    if (slot.var && pt && pt[slot.var] !== undefined) {
      const a = M.evalAt(unwrapPlaceholders(v), pt);
      const b = M.evalAt(slot.answer, pt);
      if (Number.isFinite(a) && Number.isFinite(b)) return `For ${friendlyVar(slot.var)} = ${fmtNum(pt[slot.var])} your formula gives ${fmtNum(a)}, but it should give ${fmtNum(b)}.`;
    }
    return 'Not this one yet. Try again.';
  }

  render() {
    if (!this.part) return html``;
    const slots = this.part.slots || [];
    const okCount = slots.filter((s) => this._st[s.id]?.status === 'ok').length;
    const msgs = slots.filter((s) => this._st[s.id]?.msg && this.live);
    return html`
      <div class="wrap">
        <div class="fx-layer"></div>
        <div class="pad">
          ${this.assess ? nothing : html`<div class="progress" aria-label="${okCount} of ${slots.length} right">
            ${slots.map((s) => html`<span class="pip ${this._st[s.id]?.status === 'ok' ? 'on' : ''}"></span>`)}
          </div>`}
          <div class="grid">
            ${slots.map((s) => {
              const st = this.assess && !this.locked ? '' : (this._st[s.id]?.status || '');
              return html`
                <div class="mw-card slot ${st}" data-slot="${s.id}">
                  <span class="slot-label">${this._labels[s.id]}</span>
                  ${this._fields[s.id]}
                  ${st ? html`<span class="status-dot ${st}">${st === 'ok' ? icCheck : icCross}</span>` : nothing}
                </div>`;
            })}
          </div>
          ${msgs.map((s) => html`<div class="bubble ${this._st[s.id].quiet ? 'quiet' : 'bad'}" role="status"><strong>${String(s.label || s.id).replace(/\\text\{([^}]*)\}/g, '$1').replace(/[_{}\\]/g, '')}:</strong> ${this._st[s.id].msg}</div>`)}
          ${this.hintTpl()}
          ${this._done && !this.assess ? this.doneTpl(this._stars, 'All slots filled!') : nothing}
        </div>
      </div>`;
  }
}

customElements.define('mw-shape-slots', MwSlots);
