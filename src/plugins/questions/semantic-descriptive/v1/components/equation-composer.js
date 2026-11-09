import '../../../../../ui/components/LookSlots.js';
import { LitElement, html, css } from 'lit';

/**
 * <sd-equation-composer> — optional MathLive-powered popover for composing
 * one hard-to-type expression (a fraction, nested exponent, root) as a
 * single unit, instead of making the whole free-text answer box a math
 * field. `equation-input@1` already does the latter (the entire answer IS
 * one equation) — this is for the different, more common shape here: a
 * mostly-prose proof/derivation where only a few spans are symbolic.
 *
 * Lazily loads mathlive.js only on first open, never eagerly (same pattern
 * as equation-input@1) — the platform's no-eager-vendor-load invariant.
 * Emits `sd-equation-insert` with the composed LaTeX; the host splices
 * `$<latex>$` into its own textarea at the cursor. That `$...$` convention
 * is also what the backend scorer (semanticSimilarityEvaluator.js's
 * extractMathSpans/scoreFullAnswer) looks for when a rubric point authors
 * `expectedMath`. Shared by semantic-descriptive@1 and @2.
 */
export class SdEquationComposer extends LitElement {
  static properties = {
    disabled: { type: Boolean },
    _open: { state: true },
    _loading: { state: true },
  };

  static styles = css`
    :host { display: inline-block; margin-bottom: 10px; }
    .sd-eq-open-btn {
      font-family: var(--sd-font); font-weight: var(--fw-heavy); font-size: 12.5px; padding: 5px 12px;
      border: 2px solid var(--sd-border); border-radius: var(--radius-sm); background: var(--sd-card); color: var(--sd-ink);
      cursor: pointer;
    }
    .sd-eq-open-btn:hover:not(:disabled) { background: var(--sd-indigo-soft); border-color: var(--sd-indigo); }
    .sd-eq-open-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .sd-eq-popover {
      margin-top: 8px; padding: 12px; border: 2px solid var(--sd-border); border-radius: var(--radius-md);
      background: var(--sd-card); display: flex; flex-direction: column; gap: 10px; max-width: 420px;
    }
    /* See equation-input@1's identical comment: math-field ships its own UA
       stylesheet tied to OS color-scheme keywords, not this app's theme
       toggle — these overrides are load-bearing, not decorative. */
    math-field {
      width: 100%; box-sizing: border-box; font-size: 1.2rem; padding: 8px;
      border: 2px solid var(--border-hover); border-radius: var(--radius-xs);
      background: var(--bg-surface); color: var(--text-main);
      --contains-highlight-background-color: var(--primary-light);
      --selection-background-color: var(--primary-light);
      --selection-color: var(--text-main);
    }
    math-field:focus-within { border-color: var(--primary-color); outline: none; }
    .sd-eq-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .sd-eq-btn {
      font-weight: var(--fw-strong); font-size: 12.5px; padding: 5px 14px; border-radius: var(--radius-sm); cursor: pointer;
      border: 2px solid var(--sd-border);
    }
    .sd-eq-btn-insert { background: var(--sd-indigo); border-color: var(--sd-indigo); color: #fff; }
    .sd-eq-btn-cancel { background: var(--sd-card); color: var(--sd-ink); }
    .sd-eq-hint { font-size: 11.5px; color: var(--sd-ink-soft); margin: 0; }
  `;

  constructor() {
    super();
    this.disabled = false;
    this._open = false;
    this._loading = false;
  }

  /** See equation-input@1's identical disconnectedCallback doc comment —
   *  the on-screen math keyboard is a page-level singleton MathLive attaches
   *  to `window`, not torn down automatically when this element is removed
   *  (e.g. TestEngine replacing the container wholesale on Next/Previous). */
  disconnectedCallback() {
    super.disconnectedCallback();
    window.mathVirtualKeyboard?.hide();
  }

  async _openComposer() {
    if (this.disabled) return;
    this._open = true;
    if (!customElements.get('math-field')) {
      this._loading = true;
      try {
        await import('vendor/mathlive.js');
      } finally {
        this._loading = false;
      }
    }
  }

  _cancel() {
    window.mathVirtualKeyboard?.hide();
    this._open = false;
  }

  _insert() {
    const mf = this.shadowRoot.querySelector('math-field');
    const latex = mf?.value?.trim();
    window.mathVirtualKeyboard?.hide();
    this._open = false;
    if (!latex) return;
    this.dispatchEvent(new CustomEvent('sd-equation-insert', { detail: { latex }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <button type="button" class="sd-eq-open-btn" ?disabled=${this.disabled} @click=${this._openComposer}>∑ Insert equation</button>
      ${this._open ? html`
        <div class="sd-eq-popover">
          ${this._loading ? html`<app-loader inline label="Loading equation editor…"></app-loader>` : html`
            <math-field math-virtual-keyboard-policy="onfocus"></math-field>
            <p class="sd-eq-hint">Compose the expression, then Insert — it's added to your answer as one unit.</p>
            <div class="sd-eq-actions">
              <button type="button" class="sd-eq-btn sd-eq-btn-cancel" @click=${this._cancel}>Cancel</button>
              <button type="button" class="sd-eq-btn sd-eq-btn-insert" @click=${this._insert}>Insert</button>
            </div>
          `}
        </div>
      ` : ''}
    `;
  }
}

customElements.define('sd-equation-composer', SdEquationComposer);
