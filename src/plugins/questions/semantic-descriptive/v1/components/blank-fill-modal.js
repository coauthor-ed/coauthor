import { LitElement, html, css } from 'lit';
import { sdTokens, sdButtons, sdKeyframes } from '../styles.js';
import { scoreBlank } from 'core/evaluators/semanticSimilarityEvaluator.js';
import { blankInsideMath } from 'core/markdown/mathMask.js';
import { A11yAnnouncer } from 'core/A11yAnnouncer.js';
import { ErrorReporter } from 'core/ErrorReporter.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../../ui/sharedStyles.js';
import { brandIcon } from '../../../../../ui/components/LookSlots.js';
import '../../../../../ui/components/MarkdownRenderer.js';

/**
 * <sd-blank-fill-modal> — Tier 3's fill-in-the-blank dialog (ported from
 * coaching-poc-v5.html's #modal-backdrop). Fully self-contained: focus trap,
 * Enter-to-check, and its own keydown handling live inside this shadow root
 * instead of the POC's single `document`-level listener + getElementById
 * reach-across.
 *
 * The sentence is built from `before`/`after` template halves rather than a
 * `___`-replace-into-innerHTML string, so the (eventual) student answer never
 * needs to pass through raw HTML — Lit's `html` tag escapes all interpolated
 * text automatically.
 */
export class BlankFillModal extends LitElement {
  static properties = {
    open: { type: Boolean },
    eyebrow: { type: String },
    segText: { type: String },
    rubricLabel: { type: String },
    level1: { type: String },
    clue: { type: String },
    accepted: { type: Array },
    embed: { attribute: false },
    thresholds: { attribute: false },
    _value: { state: true },
    _hintStage: { state: true },
    _hintText: { state: true },
    _checking: { state: true },
    _feedback: { state: true },
    _shake: { state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, 
    sdTokens,
    sdButtons,
    sdKeyframes,
    css`
      .sd-modal-backdrop {
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center; z-index: 500;
        opacity: 0; pointer-events: none; transition: opacity 0.3s; padding: 16px;
      }
      .sd-modal-backdrop.visible { opacity: 1; pointer-events: auto; }
      .sd-modal-card {
        background: var(--sd-card); border-radius: var(--radius-xl); padding: 30px; width: 100%; max-width: 460px;
        border: 4px solid var(--sd-border); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
        transform: scale(0.85) translateY(24px); opacity: 0; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        display: flex; flex-direction: column; align-items: center; text-align: center;
      }
      .sd-modal-backdrop.visible .sd-modal-card { transform: scale(1) translateY(0); opacity: 1; }
      .sd-modal-avatar {
        width: 56px; height: 56px; background: var(--sd-indigo-soft); border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 26px; margin-bottom: 12px;
      }
      .sd-modal-title { font-size: 19px; font-weight: var(--fw-black); margin-bottom: 16px; }
      .sd-modal-eyebrow { font-family: monospace; font-size: 10px; color: var(--sd-indigo); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
      .sd-modal-sentence { font-size: 16.5px; font-weight: var(--fw-heavy); line-height: 1.6; margin-bottom: 16px; }
      .sd-modal-inline-input {
        font-family: var(--sd-font); font-weight: var(--fw-black); font-size: 1em; color: var(--sd-indigo-dark);
        background: var(--sd-indigo-soft); border: 3px dashed var(--sd-indigo-soft); border-radius: var(--radius-sm); padding: 5px 12px;
        outline: none; text-align: center; min-width: 130px; margin: 0 4px; transition: all 0.2s;
      }
      .sd-modal-inline-input:focus { background: var(--sd-indigo-soft); border-color: var(--sd-indigo); border-style: solid; }
      .sd-modal-hint-box {
        background: var(--sd-red-soft); border: 2px solid var(--sd-red); border-radius: var(--radius-md); padding: 12px 16px;
        margin-bottom: 14px; font-size: 13px; font-weight: var(--fw-strong); color: var(--sd-red-dark); width: 100%;
      }
      .sd-modal-btns { display: flex; gap: 10px; flex-wrap: wrap; width: 100%; margin-top: 4px; }
      .sd-modal-btns button { flex: 1; }
      .sd-modal-giveup-link {
        margin-top: 16px; background: none; border: none; color: var(--sd-ink-faint); font-weight: var(--fw-heavy);
        font-size: 13px; text-decoration: underline; cursor: pointer;
      }
      .sd-modal-feedback { font-weight: var(--fw-heavy); font-size: 12.5px; margin-top: 10px; min-height: 16px; }
      .sd-modal-feedback.pass { color: var(--sd-emerald); }
      .sd-modal-feedback.retry { color: var(--sd-red-dark); }
      .sd-shake { animation: sd-shake 0.2s ease; }
    `,
  ];

  constructor() {
    super();
    this.open = false;
    this.eyebrow = '';
    this.segText = '';
    this.rubricLabel = '';
    this.level1 = '';
    this.clue = '';
    this.accepted = [];
    this._value = '';
    this._hintStage = 0;
    this._hintText = '';
    this._checking = false;
    this._feedback = null;
    this._shake = false;
    this._onGlobalKeydown = this._onGlobalKeydown.bind(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onGlobalKeydown);
  }

  updated(changed) {
    if (changed.has('open')) {
      if (this.open) {
        this._value = '';
        this._hintStage = 0;
        this._hintText = '';
        this._checking = false;
        this._feedback = null;
        this._shake = false;
        setTimeout(() => this.shadowRoot.getElementById('sd-modal-input')?.focus(), 150);
        // Escape must close the dialog even if focus hasn't landed inside it
        // yet (e.g. right after opening) — a document-level listener, added
        // only while this instance is open and removed the moment it closes
        // or unmounts, is the standard robust pattern for modal dismissal.
        document.addEventListener('keydown', this._onGlobalKeydown);
      } else {
        document.removeEventListener('keydown', this._onGlobalKeydown);
      }
    }
  }

  _onGlobalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._dismiss();
    }
  }

  _onInput(e) { this._value = e.target.value; }

  _onKeydown(e) {
    if (e.key === 'Enter' && !this._checking) {
      e.preventDefault();
      this._check();
      return;
    }
    if (e.key === 'Tab') this._trapFocus(e);
  }

  _trapFocus(e) {
    const focusables = Array.from(this.shadowRoot.querySelectorAll('button, input')).filter((el) => !el.disabled);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && this.shadowRoot.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && this.shadowRoot.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  _showHint() {
    this._hintStage = Math.min(this._hintStage + 1, 2);
    this._hintText = this._hintStage === 1 ? this.level1 : this.clue;
    A11yAnnouncer.announce(this._hintText);
    // No separate analytics event here — the final hintStage rides along in
    // sd-modal-resolved's `hintLevelsUsed` field once the blank is resolved.
  }

  async _check() {
    const val = this._value.trim();
    if (!val || this._checking) return;
    this._checking = true;
    let sim = 0;
    let exact = false;
    try {
      ({ sim, exact } = await scoreBlank(this.embed, val, this.accepted));
    } catch (err) {
      this._checking = false;
      this._feedback = { state: 'retry', message: 'Something went wrong checking that — please try again.' };
      ErrorReporter.reportError(err, { source: 'semantic-descriptive@1', phase: 'tier3-modal-check' });
      return;
    }
    this._checking = false;
    if (sim >= this.thresholds.blank) {
      this._feedback = { state: 'pass', message: exact ? '✓ Correct!' : `✓ Correct (similarity ${sim.toFixed(2)})` };
      A11yAnnouncer.announce(`Correct. ${this.rubricLabel} resolved.`);
      setTimeout(() => {
        this.dispatchEvent(new CustomEvent('sd-modal-resolved', {
          detail: { value: val, sim, exact, gaveUp: false, hintLevelsUsed: this._hintStage },
          bubbles: true, composed: true,
        }));
      }, 500);
    } else {
      this._feedback = { state: 'retry', message: `Not quite (${sim.toFixed(2)}) — try a hint` };
      this._shake = true;
      setTimeout(() => { this._shake = false; }, 350);
    }
  }

  _giveUp() {
    this.dispatchEvent(new CustomEvent('sd-modal-resolved', {
      detail: { value: '', sim: 0, exact: false, gaveUp: true, hintLevelsUsed: this._hintStage },
      bubbles: true, composed: true,
    }));
  }

  _dismiss() {
    this.dispatchEvent(new CustomEvent('sd-modal-dismissed', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.open) return html``;
    // The blank sometimes sits inside a $...$ span (e.g. "$x + ___ = 5$") —
    // splitting on '___' would hand each half an unbalanced delimiter and
    // neither renders as math (see blankInsideMath()'s doc comment). The
    // real <input> below can't be spliced into rendered KaTeX output either
    // way, so in that case show a read-only preview line with \square (a
    // fixed, author-authored placeholder — never the student's own typed
    // text) standing in for the blank, typeset properly, and keep the
    // actual input on its own line underneath rather than embedded in text.
    const insideMath = blankInsideMath(this.segText);
    const [before, after] = insideMath ? ['', ''] : this.segText.split('___');
    const input = html`<input
      id="sd-modal-input"
      type="text"
      class="sd-modal-inline-input ${this._shake ? 'sd-shake' : ''}"
      placeholder="…"
      autocomplete="off"
      aria-label="Fill in the blank for ${this.rubricLabel}"
      .value=${this._value}
      @input=${this._onInput}
      ?disabled=${this._checking}
    >`;
    return html`
      <div class="sd-modal-backdrop visible" @click=${(e) => { if (e.target === e.currentTarget) this._dismiss(); }}>
        <div class="sd-modal-card" role="dialog" aria-modal="true" aria-labelledby="sd-modal-title" @keydown=${this._onKeydown}>
          <div class="sd-modal-avatar" aria-hidden="true">🤔</div>
          <div class="sd-modal-title" id="sd-modal-title">Fill in the blank!</div>
          <div class="sd-modal-eyebrow"><markdown-renderer inline .content=${this.eyebrow}></markdown-renderer> · <markdown-renderer inline .content=${this.rubricLabel}></markdown-renderer></div>
          ${insideMath ? html`
            <div class="sd-modal-sentence"><markdown-renderer inline .content=${this.segText.replace('___', '\\square')}></markdown-renderer></div>
            <div class="sd-modal-sentence">${input}</div>
          ` : html`
            <div class="sd-modal-sentence">
              <markdown-renderer inline .content=${before}></markdown-renderer>${input}<markdown-renderer inline .content=${after}></markdown-renderer>
            </div>
          `}
          ${this._hintText ? html`<div class="sd-modal-hint-box" role="status"><markdown-renderer inline .content=${this._hintText}></markdown-renderer></div>` : ''}
          <div class="sd-modal-btns">
            <button
              class="sd-btn3d sd-btn-amber"
              @click=${this._showHint}
              ?disabled=${this._hintStage >= 2}
            >${this._hintStage === 0 ? html`Hint ${brandIcon('hint')}` : this._hintStage === 1 ? html`Bigger hint ${brandIcon('hint')}` : 'No more hints!'}</button>
            <button
              class="sd-btn3d sd-btn-indigo"
              style="flex:2;"
              @click=${this._check}
              ?disabled=${this._checking}
            >${this._checking ? 'Checking…' : 'Check ✅'}</button>
          </div>
          <button class="sd-modal-giveup-link" @click=${this._giveUp}>I give up 😅</button>
          <div class="sd-modal-feedback ${this._feedback?.state || ''}" role="status">${this._feedback?.message || ''}</div>
        </div>
      </div>
    `;
  }
}

customElements.define('sd-blank-fill-modal', BlankFillModal);
