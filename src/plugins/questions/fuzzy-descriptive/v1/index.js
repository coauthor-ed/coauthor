import { html, css } from 'lit';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { scoreFuzzyDescriptive } from './scoring.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

/**
 * <fuzzy-descriptive-v1> — Free-text descriptive answer question plugin.
 *
 * Extends QuestionBase for shared value/feedback lifecycle.
 * Provides a resizable `<textarea>` and keyword-matching scoring.
 */
export class FuzzyDescriptive extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      textarea {
        width: 100%;
        min-height: 120px;
        padding: 12px;
        font-size: 1rem;
        font-family: inherit;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-xs);
        outline: none;
        resize: vertical;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      textarea:focus   { border-color: var(--primary-color); }
      textarea:disabled {
        background: var(--bg-base);
        color: var(--text-muted);
      }
    `,
  ];

  /** Renders the textarea input control */
  renderInput() {
    return html`
      <textarea
        .value=${this._value}
        @input=${this._onInput}
        ?disabled=${this._isRevealed}
        aria-label="Enter your descriptive answer"
        placeholder=${this._data?.placeholder || 'Type your answer here...'}
      ></textarea>
    `;
  }

  /** Static scoring — keyword matching, pure function, testable without DOM */
  static score(itemData, response) {
    const { isCorrect, score, feedback } = scoreFuzzyDescriptive(itemData, response);
    return { isCorrect, score, feedback };
  }
}

customElements.define('fuzzy-descriptive-v1', FuzzyDescriptive);
