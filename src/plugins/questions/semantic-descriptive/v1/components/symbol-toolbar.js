import { LitElement, html, css } from 'lit';

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
// Plain Unicode characters, inserted as literal text — deliberately NOT
// routed through <sd-equation-composer>/MathLive/`$...$` the way a real
// equation is. Two reasons: (1) a student has no way to type these
// otherwise — confirmed empirically that neither a physical keyboard's
// default layout nor MathLive's own on-screen keyboard (four tabs: numeric,
// a set-theory symbols tab, alphabetic, Greek) exposes angle/triangle/
// congruence/parallel/perpendicular at all; (2) wrapping geometry notation
// in `$...$` would feed it to ComputeEngine if the question also happens to
// have `expectedMath` on some rubric point — and ComputeEngine has no
// concept of synthetic geometry (`\angle`/`\triangle` aren't even
// recognized commands, and `AB` parses as the product `A*B`, not "segment
// AB"), so that path risks exactly the false-caution/false-broken-step
// problem documented in content-authoring-guide.md's "Never author
// expectedMath for a geometry rubric point" section. Inserting the bare
// character sidesteps the whole algebra pipeline: it just becomes ordinary
// text in the answer, rendered as-is (not run through MathRenderer) by
// <safe-math-text>, and graded on the ordinary accepted[]/embedding tier
// like any other prose, exactly as geometry answers are meant to be.
const GEOMETRY_SYMBOLS = ['∠', '°', '△', '≅', '∼', '∥', '⊥', '⊙'];

/**
 * <sd-symbol-toolbar> — quick-insert row for subscript/superscript digits
 * (v₁, v₂, x², x³...) and common geometry symbols (∠, °, △, ≅, ∼, ∥, ⊥, ⊙),
 * so a student answering a physics/chemistry/geometry question doesn't have
 * to hunt down and copy-paste these characters from the prompt (or, for the
 * geometry set, doesn't have a way to type them at all otherwise — see
 * GEOMETRY_SYMBOLS' own comment). Knows nothing about the host's textarea —
 * it only fires `sd-symbol-insert` with the chosen character; the host
 * (which owns the textarea and cursor position) splices it in. Shared by
 * semantic-descriptive@1 and @2.
 */
export class SdSymbolToolbar extends LitElement {
  static properties = { disabled: { type: Boolean } };

  static styles = css`
    :host { display: block; margin-bottom: 10px; }
    /* nowrap + horizontal scroll, not flex-wrap — three rows of 8-10
       buttons each wrapping to two lines apiece cost ~214px of vertical
       space in a mobile-landscape viewport (confirmed: as little as 375px
       tall total), pushing the actual answer textarea below the fold. A
       single-line row only needs horizontal room, which a landscape phone
       has plenty of (8-10 buttons at ~27px each is under 300px, well
       inside even a 375px-wide portrait screen — see .sd-symbol-btn's own
       comment); overflow-x is the fallback for anything narrower than
       that rather than the default. */
    .sd-symbol-row {
      display: flex; align-items: center; gap: 3px; margin-bottom: 4px;
      flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch;
    }
    .sd-symbol-label {
      font-size: 11px; font-weight: var(--fw-heavy); color: var(--sd-ink-soft); margin-right: 2px;
      text-transform: uppercase; letter-spacing: 0.04em; min-width: 26px; flex-shrink: 0;
    }
    /* Sized to keep the widest row (10 digits) under ~300px total — fits a
       ~350px-wide answer column with room to spare, so the overflow-x
       above is a fallback for a genuinely narrow viewport, not something a
       typical mobile-landscape/portrait phone actually needs to hit. */
    .sd-symbol-btn {
      font-family: var(--sd-font); font-weight: var(--fw-heavy); font-size: 14px; min-width: 24px; height: 24px; padding: 0 2px;
      flex-shrink: 0;
      border: 2px solid var(--sd-border); border-radius: var(--radius-sm); background: var(--sd-card); color: var(--sd-ink);
      cursor: pointer; line-height: 1;
    }
    .sd-symbol-btn:hover:not(:disabled) { background: var(--sd-indigo-soft); border-color: var(--sd-indigo); }
    .sd-symbol-btn:active:not(:disabled) { transform: translateY(1px); }
    .sd-symbol-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .sd-symbol-hint { font-size: 12px; color: var(--sd-ink-soft); margin: 0; }
  `;

  _emit(char) {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent('sd-symbol-insert', { detail: { char }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="sd-symbol-row">
        <span class="sd-symbol-label">Sub</span>
        ${SUBSCRIPT_DIGITS.map((c) => html`
          <button type="button" class="sd-symbol-btn" ?disabled=${this.disabled} @click=${() => this._emit(c)} aria-label="Insert subscript ${c.codePointAt(0)}">${c}</button>
        `)}
      </div>
      <div class="sd-symbol-row">
        <span class="sd-symbol-label">Super</span>
        ${SUPERSCRIPT_DIGITS.map((c) => html`
          <button type="button" class="sd-symbol-btn" ?disabled=${this.disabled} @click=${() => this._emit(c)} aria-label="Insert superscript ${c.codePointAt(0)}">${c}</button>
        `)}
      </div>
      <div class="sd-symbol-row">
        <span class="sd-symbol-label">Geometry</span>
        ${GEOMETRY_SYMBOLS.map((c) => html`
          <button type="button" class="sd-symbol-btn" ?disabled=${this.disabled} @click=${() => this._emit(c)} aria-label="Insert ${c}">${c}</button>
        `)}
      </div>
      <p class="sd-symbol-hint">Tip: typing <code>v1</code>/<code>x^2</code> instead of <code>v₁</code>/<code>x²</code> is graded exactly the same — use whichever is faster.</p>
    `;
  }
}

customElements.define('sd-symbol-toolbar', SdSymbolToolbar);
