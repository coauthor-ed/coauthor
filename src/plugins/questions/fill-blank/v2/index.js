import { html, css } from 'lit';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { EventBus } from '../../../../core/EventBus.js';
import { resolveTagName } from '../../../../core/resolveTagName.js';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

/**
 * fill-blank@2 — strict superset of @1 (which stays untouched for existing
 * free-text-blank content). Adds an optional `options[]` per blank: when
 * present, that blank renders as an inline multiple-choice `<select>`
 * instead of a free-text `<input>` — CBSE cloze passages ("choose the most
 * appropriate option") give the student a fixed 3-4-way choice per blank,
 * not a value to type. Matching/scoring logic (`expected[]`, `ignoreCase`)
 * is unchanged either way — an option's `value` is matched exactly like a
 * typed answer would be, so static score() needs no branching at all.
 */
export class FillBlankQuestionV2 extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles,
    QuestionBase.styles,
    css`
      .fb-template {
        font-size: 1.1rem;
        line-height: 1.9;
        margin: 8px 0;
        color: var(--text-main);
        font-weight: var(--fw-strong);
      }
      .fb-blank-wrap {
        position: relative;
        display: inline-block;
      }
      input.fb-blank, select.fb-blank {
        appearance: none;
        -webkit-appearance: none;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-sm);
        box-shadow: var(--lip-fixed) var(--border-color);
        background: var(--bg-panel);
        padding: 6px 14px;
        font-size: 1rem;
        font-weight: var(--fw-heavy);
        font-family: inherit;
        color: var(--text-main);
        margin: 0 4px 6px 4px;
        min-width: 120px;
        text-align: center;
        outline: none;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 0.08s;
      }
      input.fb-blank { cursor: text; }
      /* Chrome renders a select's dropdown POPUP as a native OS widget
         that doesn't reliably pick up the 'background' shorthand on
         option the way the closed select box does - it falls back to
         its own pale default background while still inheriting the
         (dark-theme, light) 'color' from the select, so every option
         reads as near-white text on a near-white popup. Firefox/Safari
         theme the popup correctly off the shorthand alone, which is why
         this only ever showed up in Chrome. Explicit 'background-color'
         on the options themselves is what Chrome actually honors. */
      select.fb-blank option {
        background-color: var(--bg-panel);
        color: var(--text-main);
      }
      input.fb-blank:focus, select.fb-blank:focus {
        border-color: var(--primary-color);
        box-shadow: var(--lip-fixed) var(--primary-color);
        background: var(--primary-light);
      }
      input.fb-blank:disabled, select.fb-blank:disabled {
        opacity: 0.85;
        cursor: not-allowed;
      }
      input.fb-blank.correct, select.fb-blank.correct {
        border-color: var(--success-text);
        box-shadow: var(--lip-fixed) var(--success-text);
        background: var(--success-bg);
        color: var(--success-text);
      }
      input.fb-blank.incorrect, select.fb-blank.incorrect {
        border-color: var(--error-text);
        box-shadow: var(--lip-fixed) var(--error-text);
        background: var(--error-bg);
        color: var(--error-text);
      }
      @keyframes fb-tooltip-pop {
        0% { transform: translate(-50%, 10px) scale(0.8); opacity: 0; }
        100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
      }
      .fb-blank-answer {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.85rem;
        font-weight: var(--fw-heavy);
        color: var(--success-text);
        background: var(--bg-surface);
        padding: 6px 12px;
        border: 2px solid var(--success-text);
        border-radius: var(--radius-sm);
        box-shadow: var(--lip-fixed) var(--success-text);
        white-space: nowrap;
        z-index: 10;
        margin-bottom: 12px;
        animation: fb-tooltip-pop 0.3s var(--ease-pop) forwards;
      }
      .fb-blank-answer::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -6px;
        border-width: 6px;
        border-style: solid;
        border-color: var(--success-text) transparent transparent transparent;
      }
    `,
  ];

  static schema = {
    $id: "fill-blank@2",
    type: "object",
    required: ["id", "type", "template", "blanks"],
    properties: {
      id: { type: "string" },
      type: { const: "fill-blank@2" },
      template: { type: "object" }, // { en: "The capital of France is {b1}." }
      blanks: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "expected"],
          properties: {
            id: { type: "string" },
            expected: { type: "array", items: { type: "string" } }, // accepted answers
            ignoreCase: { type: "boolean", default: true },
            // When present, this blank renders as a fixed multiple-choice
            // select instead of a free-text input. `value` is matched
            // against `expected[]` exactly like typed text would be.
            options: {
              type: "array",
              items: {
                type: "object",
                required: ["value", "label"],
                properties: {
                  value: { type: "string" },
                  label: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  };

  constructor() {
    super();
    this._value = {};
  }

  _onInput(e, blankId) {
    if (this._isRevealed) return;
    this._value = { ...this._value, [blankId]: e.target.value };
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('change'));
    EventBus.emit('question:interaction', { id: this._data?.id });
  }

  _isBlankMatch(blankConfig, blankId) {
    if (!blankConfig) return false;
    const resp = (this._value[blankId] || '').trim();
    const ignoreCase = blankConfig.ignoreCase !== false;
    return blankConfig.expected.some(expectedVal =>
      ignoreCase ? resp.toLowerCase() === expectedVal.toLowerCase() : resp === expectedVal
    );
  }

  /** Bank-preview: same template text, but each blank renders as an inert
   *  placeholder instead of a real input/select — there's nothing to type
   *  or pick in a preview. */
  _renderPreviewOnly() {
    const templateStr = this._data?.template?.en || '';
    const parts = templateStr.split(/(\{[a-zA-Z0-9_-]+\})/);
    return html`
      <div class="fb-template">
        ${parts.map(part => {
          const match = part.match(/^\{([a-zA-Z0-9_-]+)\}$/);
          if (match) return html`<span class="fb-blank-wrap">______</span>`;
          if (part) return html`<markdown-renderer .content=${part} inline></markdown-renderer>`;
          return null;
        })}
      </div>
    `;
  }

  _renderBlankControl(blankId, blankConfig) {
    const isMatch = this._isRevealed && this._isBlankMatch(blankConfig, blankId);
    const stateClass = this._isRevealed ? (isMatch ? 'correct' : 'incorrect') : '';
    if (blankConfig?.options?.length) {
      return html`
        <select
          class="fb-blank ${stateClass}"
          id="blank-${blankId}"
          aria-label="Blank ${blankId}"
          .value=${this._value[blankId] || ''}
          @change=${(e) => this._onInput(e, blankId)}
          ?disabled=${this._isRevealed}
        >
          <option value="" disabled ?selected=${!this._value[blankId]}>Choose…</option>
          ${blankConfig.options.map(opt => html`
            <option value=${opt.value} ?selected=${this._value[blankId] === opt.value}>${opt.label?.en || opt.label || opt.value}</option>
          `)}
        </select>
      `;
    }
    return html`
      <input
        type="text"
        class="fb-blank ${stateClass}"
        id="blank-${blankId}"
        aria-label="Blank ${blankId}"
        .value=${this._value[blankId] || ''}
        @input=${(e) => this._onInput(e, blankId)}
        ?disabled=${this._isRevealed}
      >
    `;
  }

  renderInput() {
    const templateStr = this._data?.template?.en || '';
    const parts = templateStr.split(/(\{[a-zA-Z0-9_-]+\})/);

    return html`
      <div class="fb-template">
        ${parts.map(part => {
          const match = part.match(/^\{([a-zA-Z0-9_-]+)\}$/);
          if (match) {
            const blankId = match[1];
            const blankConfig = this._data.blanks?.find(b => b.id === blankId);
            const expectedStr = blankConfig ? blankConfig.expected.join(' OR ') : '';
            return html`
              <span class="fb-blank-wrap">
                ${this._renderBlankControl(blankId, blankConfig)}
                ${this._isRevealed ? html`
                  <span class="fb-blank-answer">Correct: <markdown-renderer inline .content=${expectedStr}></markdown-renderer></span>
                ` : ''}
              </span>
            `;
          } else if (part) {
            return html`<markdown-renderer .content=${part} inline></markdown-renderer>`;
          }
          return null;
        })}
      </div>
    `;
  }

  static score(itemData, response) {
    let correctCount = 0;
    const blanks = itemData.blanks || [];

    for (const blank of blanks) {
      const resp = (response[blank.id] || '').trim();
      const ignoreCase = blank.ignoreCase !== false;

      const isMatch = blank.expected.some(expectedVal => {
        if (ignoreCase) return resp.toLowerCase() === expectedVal.toLowerCase();
        return resp === expectedVal;
      });

      if (isMatch) correctCount++;
    }

    const isCorrect = correctCount === blanks.length && blanks.length > 0;
    const score = blanks.length > 0 ? (correctCount / blanks.length) : 0;

    return {
      isCorrect: isCorrect,
      score: score,
      feedback: isCorrect ? 'correct' : 'incorrect'
    };
  }

}

customElements.define(resolveTagName('fill-blank@2'), FillBlankQuestionV2);
