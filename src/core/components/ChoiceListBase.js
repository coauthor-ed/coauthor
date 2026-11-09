import { LitElement, html, css } from 'lit';
import '../../ui/components/MarkdownRenderer.js';
import { ProgressiveDisclosureMixin, progressiveDisclosureStyles } from '../mixins/ProgressiveDisclosureMixin.js';
import { btn3dStyles, feedbackAnimStyles, optionKeyStyles, optionKeyLetter, plainChoiceStyles } from '../../ui/sharedStyles.js';
import { LookMixin } from '../mixins/LookMixin.js';

/**
 * ChoiceListBase — Abstract Lit base class for radio-button choice plugins.
 *
 * Handles the shared option-list UI, selection state, and submission flow.
 * Used by both `mcq-single` (quiz evaluation) and `poe-predict` (EventBus broadcast).
 *
 * Subclasses MUST override:
 *   - _onSubmit()   — what to do when the student confirms their choice
 *
 * Subclasses may override:
 *   - renderPostSubmit()  → Lit TemplateResult  (content shown after submission)
 *   - renderHeader()      → Lit TemplateResult  (e.g. heading / prompt label)
 */
export class ChoiceListBase extends LookMixin(ProgressiveDisclosureMixin(LitElement)) {
  static LOOK_RENDERERS = true;
  static properties = {
    _data:        { type: Object,  state: true },
    _selectedId:  { type: String,  state: true },
    _submitted:   { type: Boolean, state: true },
  };

  static styles = [btn3dStyles, feedbackAnimStyles, progressiveDisclosureStyles, optionKeyStyles, css`
    :host {
      display: block;
      font-family: var(--font-family, system-ui, sans-serif);
      margin-bottom: 1.5rem;
    }
    .stem {
      font-size: 1.15rem;
      font-weight: var(--fw-medium);
      line-height: 1.35;
      margin-bottom: var(--space-4);
      color: var(--text-main);
    }
    .options-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    /* Matches mcq-single@2's card exactly. Before this, the same
       single-choice interaction rendered two visibly different ways depending
       on which plugin an author happened to pick: a flat 8px/2px box here
       (used by mcq-single@1 AND poe-predict@1) versus the chunky 16px/3px
       pressable card there. */
    .option {
      display: flex;
      align-items: center;
      padding: 13px 16px;
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: var(--fw-strong);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--press-1) var(--lip-color);
      transition: transform 80ms, background var(--motion-fast),
                  border-color var(--motion-fast), box-shadow 80ms;
    }
    .option:hover:not(.disabled) { border-color: var(--primary-color); }
    .option:active:not(.disabled) { transform: translateY(var(--option-press, 3px)); box-shadow: none; }
    .option.selected {
      border-color: var(--primary-color);
      background: var(--primary-light);
      box-shadow: var(--press-1) var(--primary-color);
    }
    .option.disabled { cursor: default; }
    .option.disabled:not(.selected) { opacity: 0.7; }
    @media (prefers-reduced-motion: reduce) { .option { transition: none; } }
    .option-text { flex: 1; }

    .submit-btn-margin {
      margin-top: 14px;
    }
  `, plainChoiceStyles];

  constructor() {
    super();
    this._data       = null;
    this._selectedId = null;
    this._submitted  = false;
  }

  /**
   * Required plugin lifecycle.
   * @param {object} data
   * @param {object} [ctx] Optional engine context (e.g. `{ poe, blockIndex }`
   *   from LessonEngine — see POEController.js). Subclasses that don't need
   *   it can ignore the second param entirely.
   */
  init(data, ctx) { 
    this._data = data; 
    this._ctx = ctx;
    this._initDisclosure(data.stem || data.prompt || '', data, ctx);
  }

  getState()  { return { selectedId: this._selectedId, submitted: this._submitted }; }
  setState(s) {
    if (!s) return;
    if (s.selectedId !== undefined) this._selectedId = s.selectedId;
    if (s.submitted  !== undefined) this._submitted  = s.submitted;
  }

  /** Optional plugin-contract method (feature-detected by LessonEngine's
   *  hasUnansweredQuestion()) — `_submitted` here is unrelated to (and more
   *  reliable than) `_isRevealed`: poe-predict@1 overrides `_isRevealed` to
   *  always report true, for the unrelated reason of hiding the shell's
   *  global "Check Answer" button in favor of its own inline Submit. */
  isAnswered() { return this._submitted; }

  _selectOption(id) {
    if (this._submitted) return;
    this._selectedId = id;
  }

  /** Subclass MUST override — called when the submit button is clicked */
  _onSubmit() {
    throw new Error('ChoiceListBase._onSubmit() must be overridden by the subclass.');
  }

  /** Subclass may override to show content after submission (e.g. feedback) */
  renderPostSubmit() { return html``; }

  /** Subclass may override to provide a custom header above the stem */
  renderHeader() { return html``; }

  /** The option rows (also used by poe-predict@1's plain answer panel). */
  _renderOptionsList() {
    const opts = this._data.options || [];
    return html`
        <ul class="options-list" role="radiogroup">
          ${opts.map((opt, i) => {
            const selected = this._selectedId === opt.id;
            const disabled = this._submitted;
            return html`
              <li
                class="option ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
                @click=${() => this._selectOption(opt.id)}
              >
                <input
                  type="radio"
                  class="opt-radio"
                  name=${'choice-' + (this._data.id || 'q')}
                  .checked=${selected}
                  ?disabled=${disabled}
                  @change=${() => this._selectOption(opt.id)}
                  aria-label=${opt.text}
                >
                <span class="opt-key" aria-hidden="true">${optionKeyLetter(i)}</span>
                <span class="option-text">${opt.text}</span>
              </li>
            `;
          })}
        </ul>
    `;
  }

  /** Submit, or what follows it once submitted. */
  _renderSubmitArea() {
    return !this._submitted ? html`
          <button
            class="btn-3d btn-primary submit-btn-margin"
            @click=${this._onSubmit}
            ?disabled=${!this._selectedId}
          >Submit</button>
        ` : this.renderPostSubmit();
  }

  render() {
    if (!this._data) return html``;
    const { done } = this.stepState();

    return html`
      ${this.renderHeader()}
      <div class="stem cb-reading">
        ${this._renderSteps()}
      </div>

      ${done ? html`
        ${this._renderOptionsList()}

        ${this._renderSubmitArea()}
      ` : ''}
    `;
  }
}
