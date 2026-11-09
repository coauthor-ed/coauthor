import { html, css } from 'lit';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { btn3dStyles, choiceSurfaceStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

/**
 * <numeric-value-v1> — Numeric answer question plugin.
 *
 * Extends QuestionBase for shared value/feedback lifecycle.
 * Provides a numeric `<input>` and tolerance-based scoring.
 */
export class NumericValue extends QuestionBase {
  // plain: prompt left, answer panel right (core/components/answerPanel.js).
  static PLAIN_PANEL = true;
  static schema = {
    $id: "numeric-value@1",
    type: "object",
    required: ["id", "type", "stem", "expectedValue"],
    properties: {
      id: { type: "string" },
      type: { const: "numeric-value@1" },
      stem: { type: "object" }, // { en: "..." }
      expectedValue: { type: "number" },
      tolerance: { type: "number" },
      unit: { type: "string" },
      simulation: { type: "object" }, // { src, position?, role? } — optional companion sim (rendered by QuestionBase); role: "setup" (default "explanation") shows it immediately alongside the stem instead of gated behind reveal
      graph: { type: "object" }, // { functions?: [{expression, label?, color?}], points?: [{x,y,label?}], xDomain, yDomain, xLabel?, yLabel?, position? } — optional companion graph (rendered by QuestionBase, mutually exclusive with simulation/image), always shown immediately, never reveal-gated
      diagram: { type: "object" } // { points, segments?, angles?, rightAngles?, parallelMarks?, circles?, viewBox?, a11yCaption?, position? } — optional companion geometry figure (see GeometryDiagram.js), mutually exclusive with simulation/image/graph, always shown immediately, never reveal-gated
    }
  };

  static styles = [btn3dStyles, feedbackAnimStyles, 
    QuestionBase.styles,
    css`
      input[type="number"] {
        padding: 12px 16px;
        font-size: 1.05rem;
        font-weight: var(--fw-strong);
        border: 3px solid var(--border-color);
        border-radius: var(--radius-md);
        width: 150px;
        outline: none;
        background: var(--bg-surface);
        color: var(--text-main);
        transition: border-color 0.15s, box-shadow 0.15s;
        font-family: inherit;
        box-shadow: var(--lip-fixed) var(--border-color);
      }
      input[type="number"]:focus {
        border-color: var(--primary-color);
        box-shadow: var(--lip-fixed) var(--primary-color);
      }
      input[type="number"]:disabled {
        background: var(--bg-base);
        color: var(--text-muted);
        box-shadow: none;
      }
    `,
  ];

  /** Renders the numeric input control */
  renderInput() {
    return html`
      <input
        type="number"
        step="any"
        .value=${this._value}
        @input=${this._onInput}
        ?disabled=${this._isRevealed}
        aria-label="Enter numeric answer"
      >
    `;
  }

  /** Static scoring — pure function, testable without DOM */
  static score(itemData, response) {
    if (!response || String(response).trim() === '') {
      return { isCorrect: false, score: 0, feedback: 'No answer provided.' };
    }
    const val = parseFloat(response);
    if (isNaN(val)) {
      return { isCorrect: false, score: 0, feedback: 'Invalid number.' };
    }
    const expected  = itemData.expectedValue;
    const tolerance = itemData.tolerance || 0;
    const isCorrect = Math.abs(val - expected) <= tolerance;
    // correctFeedback/incorrectFeedback are authored as { en: "..." } like
    // every other localized string field — passing the raw object straight
    // into `feedback` (as this used to) renders as the literal string
    // "[object Object]" once the feedback banner stringifies it. Same
    // unwrap mcq-single@2's own evaluate() already does for option feedback.
    const rawFeedback = isCorrect ? itemData.correctFeedback : itemData.incorrectFeedback;
    const feedback = typeof rawFeedback === 'object' && rawFeedback !== null
      ? (rawFeedback.en || '')
      : (rawFeedback || (isCorrect ? 'Correct!' : 'Incorrect.'));
    return {
      isCorrect,
      score: isCorrect ? 1 : 0,
      feedback,
    };
  }
}

customElements.define('numeric-value-v1', NumericValue);
