/**
 * chainCtl.js - one trail of math lines (a step chain, or one side of a
 * two-sided proof). Not an element: the owning shape element renders the
 * rows this controller returns and asks it to requestUpdate through
 * shape.requestUpdate().
 *
 * Trail metaphor: every line is a node on a path. A valid step lights its
 * node and makes the link glow; an invalid one cracks the link; fixing the
 * line snaps it back.
 */
import { html, nothing } from 'lit';
import { createField, mathSpan } from './field.js';
import { checkStep } from './chain.js';
import { explainStep, evalLine, sayLine } from './explain.js';
import { M } from './mathApi.js';
import { highlightLatex, naiveChangedTerms, unwrapPlaceholders, hasEmptyPlaceholder, norm, friendlyVar, guessVars } from './latexUtil.js';
import { icCheck, icBang, icOneWay, icSearch, icTrash, icEye, icFork, icCard, icStar } from './icons.js';

let uid = 0;

const STATUS_OF = (res) => {
  if (!res || res.kind === 'empty') return 'draft';
  if (res.ok && res.kind === 'implies') return 'warn';
  if (res.ok) return 'ok';
  return 'bad';
};

export class ChainCtl {
  /**
   * @param {object} shape  owning MwShapeBase element
   * @param {object} o      { side, start, mirror, startLabel, maxSteps, placeholder }
   */
  constructor(shape, o) {
    this.shape = shape;
    this.side = o.side || 'main';
    this.start = o.start || '';
    this.mirror = !!o.mirror;
    this.startLabel = o.startLabel || 'START';
    this.maxSteps = o.maxSteps || 12;
    this.placeholder = o.placeholder || '\\text{type the next line}';
    this.lines = [];
    this.done = false;
    this.startEl = mathSpan(this.start);
    this.ensureDraft();
  }

  get item() { return this.shape.item; }
  get live() { return this.shape.live; }

  /* ------------------------------------------------------------ lines */

  _makeLine(latex = '', o = {}) {
    const line = {
      id: ++uid,
      latex,
      res: null,
      status: 'draft',
      editing: true,
      moved: [],
      previewEl: null,
      previewKey: '',
      anim: !!o.animate,
      lit: false,
      revealed: !!o.revealed,
      tag: o.tag || null,
      xp: false,
      explain: null,
      cy: { open: false, vals: {} },
      reason: null,
      reasonSent: false,
      milestone: null,
    };
    line.mf = this._fieldFor(line, latex, this.lines.length === 0);
    return line;
  }

  _fieldFor(line, latex, first) {
    return createField({
      value: latex,
      placeholder: first ? this.placeholder : '',
      label: `${this.side === 'main' ? 'Line' : this.side.toUpperCase() + ' line'} ${this.lines.length + 1}`,
      onInput: (v) => this._onInput(line, v),
      onCommit: (v, how) => this.commit(line, v, how),
      onFocus: (mf) => {
        this.shape.bridge?.focusField?.(mf);
        this.shape.onLineFocus?.(this, line);
      },
    });
  }

  draft() {
    const last = this.lines[this.lines.length - 1];
    return last && last.status === 'draft' && !last.latex.trim() ? last : null;
  }

  committed() {
    return this.lines.filter((l) => l.latex.trim() && l.status !== 'draft');
  }

  /** Index of the next fork (k = number of lines written so far). */
  forkIndex() {
    // Forks and hints key off the last VALID line: a broken line does not
    // move the student on to the next step.
    return this.validCount();
  }

  /** The line a move/hint should write into: the first unfinished line
   *  after the valid prefix (a broken or half-typed one), else the draft. */
  targetLine() {
    const j = this.lines.findIndex((l) => l.latex.trim() && l.status !== 'ok' && l.status !== 'warn' && l.status !== 'neutral');
    return j >= 0 ? this.lines[j] : this.ensureDraft();
  }

  intact() {
    return this.lines.every((l) => !l.latex.trim() || l.status === 'draft' || l.status === 'ok' || l.status === 'warn' || l.status === 'neutral');
  }

  validCount() {
    let n = 0;
    for (const l of this.lines) {
      if (!l.latex.trim()) continue;
      if (l.status === 'ok' || l.status === 'warn') n++; else break;
    }
    return n;
  }

  ensureDraft() {
    if (this.done) return null;
    const last = this.lines[this.lines.length - 1];
    if (last && (!last.latex.trim() || last.status === 'draft')) return last;
    // A broken (or unreadable) last line must be fixed before the path goes on.
    if (last && (last.status === 'bad' || last.status === 'unread')) return null;
    if (this.lines.length >= this.maxSteps) return null;
    const line = this._makeLine('');
    this.lines.push(line);
    return line;
  }

  values() {
    return this.lines.map((l) => l.latex).filter((v) => v && v.trim() && !hasEmptyPlaceholder(v));
  }

  setValues(list) {
    this.lines = [];
    for (const v of list || []) {
      const line = this._makeLine(v);
      line.latex = v;
      this.lines.push(line);
    }
    this.lines.forEach((_l, i) => this._check(i, { silent: true }));
    this.lines.forEach((l) => { l.xp = l.status === 'ok' || l.status === 'warn'; });
    this.ensureDraft();
  }

  reset() {
    this.lines = [];
    this.done = false;
    this.ensureDraft();
  }

  prevLatex(i) {
    for (let k = i - 1; k >= 0; k--) if (this.lines[k].latex.trim()) return this.lines[k].latex;
    return this.start;
  }

  /* ----------------------------------------------------------- events */

  _onInput(line, v) {
    line.latex = v;
    if (line.status === 'bad' || line.status === 'ok' || line.status === 'warn') {
      // Editing a checked line: keep its verdict until the next commit, but
      // the moved highlight would be stale.
      line.moved = [];
    }
    this.shape.onChainInput?.(this, line);
  }

  commit(line, v, how) {
    const i = this.lines.indexOf(line);
    if (i < 0) return;
    line.latex = v || '';
    if (!line.latex.trim()) {
      line.status = 'draft';
      line.res = null;
      line.explain = null;
      if (i < this.lines.length - 1) {
        // An emptied middle line is removed; the path closes up.
        this.lines.splice(i, 1);
        if (this.lines[i]) this._check(i, {});
      }
      this.shape.onChainChanged?.(this, line, how);
      return;
    }
    if (!this.live) {
      line.status = this.shape.assess ? 'neutral' : line.status;
      if (how === 'enter' && i === this.lines.length - 1) this._advance();
      this.shape.onChainChanged?.(this, line, how);
      return;
    }
    // One check per line content: a repeated commit of the same text (Enter
    // then blur) neither re-checks nor re-emits.
    const wasLast = i === this.lines.length - 1 || this.lines.slice(i + 1).every((l) => !l.latex.trim());
    const key = `${this.prevLatex(i)}|${line.latex}`;
    if (line.checkedKey !== key || !line.res) {
      this._check(i, { how });
      if (this.lines[i + 1] && this.lines[i + 1].latex.trim()) this._check(i + 1, { quiet: true });
    }
    if (line.status !== 'bad' && line.status !== 'unread') line.editing = false;
    this.shape.onChainChanged?.(this, line, how);
    if ((how === 'enter' || how === 'auto') && wasLast && line.status !== 'bad' && line.status !== 'unread' && !this.done) {
      // The old field is about to hide: let go of it so no key lands there.
      if (how === 'enter') { try { line.mf.blur(); } catch { /* ignore */ } }
      this._advance(how === 'enter');
    }
  }

  _advance(focus = true) {
    const d = this.ensureDraft();
    this.shape.requestUpdate();
    if (d && focus) {
      // Focus as soon as the row exists (no extra frame), so a fast typist's
      // next keys land in the new line, not the old one.
      // MathLive mounts a new field asynchronously, so focus is retried for a
      // few frames until it takes.
      this.shape.updateComplete.then(() => {
        let tries = 0;
        const go = () => {
          try { d.mf.focus({ preventScroll: true }); } catch { /* not mounted yet */ }
          const has = typeof d.mf.hasFocus === 'function' ? d.mf.hasFocus() : this.shape.shadowRoot?.activeElement === d.mf;
          if (!has && tries++ < 60) requestAnimationFrame(go);
        };
        go();
        this.shape.reveal(this.shape.shadowRoot?.querySelector(`[data-line="${d.id}"] .line`));
      });
    }
  }

  /** Check line i against its predecessor. */
  _check(i, { silent = false, quiet = false, how = 'enter' } = {}) {
    const line = this.lines[i];
    if (!line || !line.latex.trim()) return;
    const prev = this.prevLatex(i);
    const res = checkStep(prev, line.latex, this.item);
    const was = line.status;
    if (res.kind === 'unparsable' && how === 'blur' && !silent) {
      // Half-typed line left on blur: a quiet note, no verdict, no event.
      line.res = res;
      line.status = 'unread';
      line.checkedKey = null;
      line.explain = { text: 'I cannot read this line yet. Finish it, then press Enter.', point: null, quiet: true };
      line.moved = [];
      return;
    }
    line.checkedKey = `${prev}|${line.latex}`;
    line.res = res;
    line.status = STATUS_OF(res);
    line.explain = explainStep(prev, line.latex, res);
    line.moved = (line.status === 'ok' || line.status === 'warn') ? this._moved(prev, line.latex) : [];
    const key = highlightLatex(unwrapPlaceholders(line.latex), line.moved);
    if (key !== line.previewKey || !line.previewEl) {
      line.previewKey = key;
      line.previewEl = mathSpan(key);
    }
    if (silent) return;
    if (was !== line.status) {
      line.lit = true;
      setTimeout(() => { line.lit = false; }, 700);
    }
    const ok = line.status === 'ok' || line.status === 'warn';
    if (!quiet || was !== line.status) {
      this.shape.bridge?.event?.('math:step-checked', {
        index: i,
        side: this.side === 'main' ? undefined : this.side,
        valid: ok,
        kind: res.kind,
        reversible: !!res.reversible,
        counterexample: res.counterexample || null,
        rect: this.shape.rectOf(this.shape.shadowRoot?.querySelector(`[data-line="${line.id}"] .line`)),
      });
    }
    if (ok && !line.xp) {
      line.xp = true;
      const node = () => this.shape.shadowRoot?.querySelector(`#node-${line.id}`);
      this.shape.updateComplete.then(() => this.shape.bridge?.validStep?.(node(), { index: i, side: this.side }, this.shape));
    } else if (!ok && was !== 'bad') {
      this.shape.bridge?.brokeStep?.();
    }
  }

  _moved(prev, next) {
    const p = unwrapPlaceholders(prev);
    const n = unwrapPlaceholders(next);
    let changed = [];
    try { changed = M.diffTerms(p, n)?.changed || []; } catch { changed = []; }
    // Only keep terms that literally appear in the student's own spelling.
    const nn = norm(n);
    changed = changed.filter((t) => t && norm(t) && nn.includes(norm(t)) && norm(t) !== nn);
    if (!changed.length) changed = naiveChangedTerms(p, n).filter((t) => norm(t) !== nn);
    // When nearly all of the line is new, or it changed in many places,
    // a highlight is only noise.
    const covered = changed.reduce((acc, t) => acc + norm(t).length, 0);
    if (changed.length > 3 || covered > nn.length * 0.9) return [];
    return changed;
  }

  edit(line) {
    if (!this.live && !this.shape.assess) return;
    line.editing = true;
    this.shape.requestUpdate();
    this.shape.updateComplete.then(() => requestAnimationFrame(() => line.mf.focus()));
  }

  /** Put a line into the draft (move chip, template, reveal). */
  fillDraft(latex, o = {}) {
    const d = this.targetLine();
    if (!d) return null;
    d.status = 'draft';
    d.res = null;
    d.explain = null;
    d.checkedKey = null;
    d.editing = true;
    // A field in fill-in-the-blank mode keeps its prompts through
    // setValue(), so a template draft gets a fresh field instead.
    if (/\\placeholder/.test(d.mf.value || '')) d.mf = this._fieldFor(d, latex, false);
    else d.mf.setValueQuiet(latex);
    d.latex = latex;
    d.tag = o.tag || null;
    d.revealed = !!o.revealed;
    d.anim = true;
    setTimeout(() => { d.anim = false; }, 600);
    if (o.commit) this.commit(d, latex, 'auto');
    else {
      this.shape.requestUpdate();
      this.shape.updateComplete.then(() => requestAnimationFrame(() => d.mf.focus()));
    }
    return d;
  }

  undoLast() {
    // Drop the trailing draft and the last written line.
    while (this.lines.length && !this.lines[this.lines.length - 1].latex.trim()) this.lines.pop();
    this.lines.pop();
    this.done = false;
    this.ensureDraft();
    this.shape.onChainChanged?.(this, null, 'undo');
  }

  markGraded(byIndexOk) {
    this.lines.forEach((l, i) => {
      if (!l.latex.trim()) return;
      l.status = byIndexOk(i) ? 'ok' : 'bad';
      l.editing = false;
      if (!l.previewEl) { l.previewKey = l.latex; l.previewEl = mathSpan(unwrapPlaceholders(l.latex)); }
    });
  }

  /* ----------------------------------------------------------- render */

  renderStart() {
    const first = this.lines.find((l) => l.latex.trim());
    const out = first ? segCls(first.status, false) : '';
    return html`
      <div class="row start-row ${this.mirror ? 'mirror' : ''}">
        <div class="rail">
          <span class="seg out ${out}"></span>
          <span class="node start">${this.startLabel}</span>
        </div>
        <div class="mw-card start-card">${this.startEl}</div>
      </div>`;
  }

  renderRows({ outLast = '', cards = [] } = {}) {
    const rows = this.lines.map((line, i) => this._row(line, i, outLast, cards));
    return rows;
  }

  _row(line, i, outLast, cards) {
    const isLast = i === this.lines.length - 1;
    const isDraft = line.status === 'draft';
    const next = this.lines[i + 1];
    const inCls = segCls(line.status, true);
    const outCls = next ? segCls(next.status, false) : outLast;
    const showPreview = !line.editing && line.previewEl && line.latex.trim() && (!this.shape.assess || this.shape.locked);
    const nodeCls = line.status === 'neutral' ? '' : (isDraft ? (this.live || this.shape.assess ? 'active' : '') : line.status);
    const icon = line.status === 'ok' ? icCheck : line.status === 'bad' ? icBang : line.status === 'warn' ? icOneWay : html`${i + 1}`;
    const latestValid = !isDraft && (line.status === 'ok' || line.status === 'warn') && this.lines.slice(i + 1).every((l) => !l.latex.trim());
    const canUndo = this.live && !isDraft && this.lines.slice(i + 1).every((l) => !l.latex.trim());
    const canCheck = this.live && line.latex.trim() && (isDraft || line.editing);
    return html`
      <div class="row ${this.mirror ? 'mirror' : ''}" data-line="${line.id}" style="--i:${i}">
        <div class="rail">
          <span class="seg in ${inCls}"></span>
          ${isLast && !outLast ? nothing : html`<span class="seg out ${outCls}"></span>`}
          <span class="node ${nodeCls} ${line.lit ? 'lit' : ''}" id="node-${line.id}">
            ${icon}
            ${line.revealed ? html`<span class="badge" title="Shown by a hint">${icEye}</span>` : nothing}
          </span>
        </div>
        <div class="cell">
          <div class="mw-card line ${cardCls(line.status)} ${line.anim ? 'slide-in' : ''}">
            ${line.tag ? html`<div class="tag">${icFork}<span>${line.tag}</span></div>` : nothing}
            ${line.milestone ? html`<div class="tag ms">${this.shape.calm ? icCheck : icStar}<span>${line.milestone}</span></div>` : nothing}
            <div class="line-top">
              ${showPreview ? html`
                <div class="preview" tabindex="0" role="button" aria-label="Edit line ${i + 1}"
                  @click=${() => this.edit(line)}
                  @keydown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.edit(line); } }}>${line.previewEl}</div>` : nothing}
              <div class="mf-wrap" ?hidden=${showPreview}>${line.mf}</div>
              ${canCheck ? html`<button class="icon-btn go" title="Check this line" aria-label="Check this line"
                  @pointerdown=${(e) => e.preventDefault()}
                  @click=${() => this.commit(line, line.mf.value, 'enter')}>${icCheck}</button>` : nothing}
              ${canUndo ? html`<button class="icon-btn del" title="Remove this line" aria-label="Remove this line" @click=${() => this.undoLast()}>${icTrash}</button>` : nothing}
            </div>
            ${latestValid && showPreview && line.moved.length ? html`<div class="moved-note"><span class="moved-swatch"></span>What changed in this step</div>` : nothing}
          </div>
          ${line.explain && this.live && line.latex.trim() ? this._explain(line, i) : nothing}
          ${cards.length && this.live && !isDraft && line.latex.trim() ? this._reasons(line, cards) : nothing}
        </div>
      </div>`;
  }

  _reasons(line, cards) {
    return html`
      <div class="reasons">
        <span class="kicker">Reason</span>
        ${cards.map((c) => html`
          <button class="chip sm ${line.reason === c.id ? 'gold' : 'ghost'}" data-card="${c.id}"
            @click=${(e) => this.shape.onReason?.(this, line, c, e.currentTarget)}>${icCard}<span>${c.label?.en || c.label || c.id}</span></button>`)}
      </div>`;
  }

  _explain(line, i) {
    const ex = line.explain;
    if (ex.quiet) return html`<div class="bubble quiet" role="status">${ex.text}</div>`;
    const cls = ex.oneWay ? 'warn' : 'bad';
    const prev = this.prevLatex(i);
    return html`
      <div class="bubble ${cls}" role="status">
        ${ex.text}
        ${ex.point || line.res?.kind === 'invalid' ? html`
          <div class="row-actions">
            <button class="chip sm" aria-expanded="${line.cy.open ? 'true' : 'false'}"
              @click=${() => { line.cy.open = !line.cy.open; if (ex.point && !Object.keys(line.cy.vals).length) line.cy.vals = { ...ex.point }; this.shape.requestUpdate(); }}>
              ${icSearch}<span>Check it yourself</span></button>
          </div>
          ${line.cy.open ? this._checkYourself(line, prev) : nothing}` : nothing}
      </div>`;
  }

  _checkYourself(line, prev) {
    const vars = this.item?.vars?.length ? this.item.vars : guessVars([prev, line.latex]);
    const pt = {};
    let ready = vars.length > 0;
    for (const v of vars) {
      const raw = line.cy.vals[v];
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/\u2212/g, '-'));
      if (Number.isFinite(num)) pt[v] = num; else ready = false;
    }
    const a = ready ? evalLine(prev, pt) : null;
    const b = ready ? evalLine(line.latex, pt) : null;
    const truth = (ev) => ev && ev.kind !== 'expr' && ev.truth !== null ? html` <span class="cy-val ${ev.truth ? 't' : 'f'}">${ev.truth ? 'true' : 'false'}</span>` : nothing;
    return html`
      <div class="cy">
        <div class="cy-row">
          ${vars.map((v) => html`
            <label class="cy-row"><span class="cy-val">${friendlyVar(v)} =</span>
              <input type="text" inputmode="decimal" .value=${String(line.cy.vals[v] ?? '')}
                aria-label="Value of ${friendlyVar(v)}"
                @input=${(e) => { line.cy.vals = { ...line.cy.vals, [v]: e.target.value }; this.shape.requestUpdate(); }}></label>`)}
        </div>
        ${ready ? html`
          <div class="cy-grid">
            <span class="lbl">Line before</span><span><span class="cy-val">${sayLine(a)}</span>${truth(a)}</span>
            <span class="lbl">This line</span><span><span class="cy-val">${sayLine(b)}</span>${truth(b)}</span>
          </div>` : html`<div class="muted" style="margin-top:6px;font-size:0.85rem">Type a number to see both lines worked out.</div>`}
      </div>`;
  }
}

function segCls(status, isIn) {
  if (status === 'ok') return 'ok';
  if (status === 'warn') return 'warn';
  if (status === 'bad') return isIn ? 'bad' : 'badsolid';
  return '';
}

function cardCls(status) {
  if (status === 'ok') return 'ok';
  if (status === 'bad') return 'bad';
  if (status === 'warn') return 'warn';
  return '';
}
