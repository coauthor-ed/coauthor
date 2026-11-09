import { html, css } from 'lit';
import { QuestionBase } from '../../../../core/components/QuestionBase.js';
import { EventBus } from '../../../../core/EventBus.js';
import { resolveTagName } from '../../../../core/resolveTagName.js';
import '../../../../ui/components/MarkdownRenderer.js';
import { btn3dStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';

function norm(s) {
  return (s || '').trim().toLowerCase();
}

/**
 * error-correction@1 — "spot the error, give the fix" grammar editing task
 * (CBSE's "the passage has not been edited, one error per line" format).
 * Each line carries exactly one error; the student both identifies the
 * wrong word and supplies its correction. Doesn't fit fill-blank (there's
 * no placeholder position — the whole line is shown as-is) or
 * sequence-order/match-categorize, so this is its own type.
 *
 * Reuses QuestionBase's stem/hints/explanation/feedback-banner machinery —
 * `renderInput()` just renders more than one control (one per line, each
 * with its own two small inputs), the same way structured-descriptive@1
 * renders several textareas from a single renderInput() call.
 */
export class ErrorCorrection extends QuestionBase {
  static styles = [btn3dStyles, feedbackAnimStyles,
    QuestionBase.styles,
    css`
      .ec-lines { display: flex; flex-direction: column; gap: 14px; width: 100%; }
      .ec-line {
        border: 2px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: 12px 14px;
        background: var(--bg-panel);
      }
      .ec-line.correct { border-color: var(--success-text); background: var(--success-bg); }
      .ec-line.incorrect { border-color: var(--error-text); background: var(--error-bg); }
      .ec-line-text {
        font-size: 1rem;
        font-weight: var(--fw-strong);
        color: var(--text-main);
        margin-bottom: 10px;
      }
      .ec-line-inputs { display: flex; gap: 10px; flex-wrap: wrap; }
      .ec-field { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
      .ec-field label { font-size: 0.75rem; font-weight: var(--fw-strong); color: var(--text-muted); }
      .ec-field input {
        border: 2px solid var(--border-color);
        border-radius: var(--radius-xs);
        padding: 6px 10px;
        font-size: 0.95rem;
        font-family: inherit;
        color: var(--text-main);
        background: var(--bg-surface);
        outline: none;
      }
      .ec-field input:focus { border-color: var(--primary-color); }
      .ec-field input:disabled { opacity: 0.85; }
      .ec-line-answer {
        margin-top: 8px;
        font-size: 0.85rem;
        font-weight: var(--fw-strong);
        color: var(--success-text);
      }
    `,
  ];

  static schema = {
    $id: 'error-correction@1',
    type: 'object',
    required: ['id', 'type', 'stem', 'lines'],
    properties: {
      stem: { type: 'object', minProperties: 1 },
      lines: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'text', 'incorrectWord', 'correction'],
          properties: {
            id: { type: 'string' },
            text: { type: 'object' },
            incorrectWord: { type: 'string' },
            correction: { type: 'string' },
            acceptedCorrections: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };

  constructor() {
    super();
    this._value = {}; // lineId -> { word, correction }
  }

  _fieldValue(lineId, field) {
    return this._value[lineId]?.[field] || '';
  }

  _onFieldInput(e, lineId, field) {
    if (this._isRevealed) return;
    this._value = {
      ...this._value,
      [lineId]: { ...this._value[lineId], [field]: e.target.value },
    };
    EventBus.emit('question:interaction', { id: this._data?.id });
  }

  _lineVerdict(line) {
    const wordMatch = norm(this._fieldValue(line.id, 'word')) === norm(line.incorrectWord);
    const accepted = [line.correction, ...(line.acceptedCorrections || [])].map(norm);
    const correctionMatch = accepted.includes(norm(this._fieldValue(line.id, 'correction')));
    return { wordMatch, correctionMatch, full: wordMatch && correctionMatch };
  }

  _renderPreviewOnly() {
    const lines = this._data?.lines || [];
    return html`
      <div class="ec-lines">
        ${lines.map((line) => html`
          <div class="ec-line">
            <div class="ec-line-text"><markdown-renderer inline .content=${line.text?.en || line.text || ''}></markdown-renderer></div>
          </div>
        `)}
      </div>
    `;
  }

  renderInput() {
    const lines = this._data?.lines || [];
    return html`
      <div class="ec-lines">
        ${lines.map((line, idx) => {
          const verdict = this._isRevealed ? this._lineVerdict(line) : null;
          const cls = verdict ? (verdict.full ? 'correct' : 'incorrect') : '';
          return html`
            <div class="ec-line ${cls}">
              <div class="ec-line-text">${idx + 1}. <markdown-renderer inline .content=${line.text?.en || line.text || ''}></markdown-renderer></div>
              <div class="ec-line-inputs">
                <div class="ec-field">
                  <label for="ec-word-${line.id}">Incorrect word</label>
                  <input
                    id="ec-word-${line.id}"
                    type="text"
                    .value=${this._fieldValue(line.id, 'word')}
                    @input=${(e) => this._onFieldInput(e, line.id, 'word')}
                    ?disabled=${this._isRevealed}
                  >
                </div>
                <div class="ec-field">
                  <label for="ec-fix-${line.id}">Correction</label>
                  <input
                    id="ec-fix-${line.id}"
                    type="text"
                    .value=${this._fieldValue(line.id, 'correction')}
                    @input=${(e) => this._onFieldInput(e, line.id, 'correction')}
                    ?disabled=${this._isRevealed}
                  >
                </div>
              </div>
              ${verdict && !verdict.full ? html`
                <div class="ec-line-answer">Correct: "${line.incorrectWord}" → "${line.correction}"</div>
              ` : ''}
            </div>
          `;
        })}
      </div>
    `;
  }

  static score(itemData, response) {
    const lines = itemData.lines || [];
    if (!lines.length) return { isCorrect: false, score: 0, feedback: 'incorrect' };

    let earned = 0;
    let fullyCorrectCount = 0;
    for (const line of lines) {
      const resp = response?.[line.id] || {};
      const wordMatch = norm(resp.word) === norm(line.incorrectWord);
      const accepted = [line.correction, ...(line.acceptedCorrections || [])].map(norm);
      const correctionMatch = accepted.includes(norm(resp.correction));
      earned += (wordMatch ? 0.5 : 0) + (correctionMatch ? 0.5 : 0);
      if (wordMatch && correctionMatch) fullyCorrectCount++;
    }

    const score = earned / lines.length;
    const isCorrect = fullyCorrectCount === lines.length;
    return {
      isCorrect,
      score,
      feedback: `${fullyCorrectCount} / ${lines.length} lines fully corrected.`,
    };
  }
}

customElements.define(resolveTagName('error-correction@1'), ErrorCorrection);
